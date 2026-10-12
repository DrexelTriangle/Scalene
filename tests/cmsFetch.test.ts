import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  awaitShared,
  createCmsClient,
  createWaiterGroup,
  CmsFetchError,
  type CmsClientOptions,
  type CmsFetchLogRecord,
} from '../src/utils/cmsFetch.ts';

type Hit = { method: string; url: string; accept: string | undefined; closed: Promise<void> };
type Handler = (req: http.IncomingMessage, res: http.ServerResponse) => void;

/**
 * A real CMS on loopback, so timeouts and aborts are exercised against actual
 * sockets: `closed` resolves when the client hangs up on a request.
 */
async function loopbackCms(handler: Handler) {
  const hits: Hit[] = [];
  const server = http.createServer((req, res) => {
    const closed = new Promise<void>((resolve) => res.on('close', () => resolve()));
    hits.push({ method: req.method ?? '', url: req.url ?? '', accept: req.headers.accept, closed });
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${port}/v1`,
    hits,
    async close() {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

const sendJson = (body: unknown, status = 200): Handler => (_req, res) => {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
};
const hang: Handler = () => {};

function client(base: string, overrides: Partial<CmsClientOptions> = {}) {
  const logs: CmsFetchLogRecord[] = [];
  const cms = createCmsClient({ baseUrl: base, log: (r) => logs.push(r), ...overrides });
  return { cms, logs };
}

async function rejection(promise: Promise<unknown>): Promise<CmsFetchError> {
  try {
    await promise;
  } catch (err) {
    assert.ok(err instanceof CmsFetchError, `expected CmsFetchError, got ${String(err)}`);
    return err;
  }
  assert.fail('expected a rejection');
}

// ---- success and URL construction ------------------------------------------

test('a GET returns the parsed body, sent with Accept: application/json under the base path', async (t) => {
  const server = await loopbackCms(sendJson({ title: 'Hello' }));
  t.after(() => server.close());
  const timings: string[] = [];
  const { cms, logs } = client(server.base, { onTiming: (endpoint) => timings.push(endpoint) });

  const body = await cms.getJson({ endpoint: 'article', path: ['articles', 'hello-world'], query: { limit: 20, offset: 0 } });

  assert.deepEqual(body, { title: 'Hello' });
  assert.equal(server.hits.length, 1);
  assert.equal(server.hits[0].method, 'GET');
  assert.equal(server.hits[0].url, '/v1/articles/hello-world?limit=20&offset=0');
  assert.equal(server.hits[0].accept, 'application/json');
  assert.deepEqual(timings, ['article']);
  assert.deepEqual(logs, [], 'a fast success is not logged');
});

test('a segment cannot add a path level, a query or a fragment', () => {
  const { cms } = client('https://cms.test/v1/');
  const url = (path: string[], query?: Record<string, string>) => cms.buildUrl('x', path, query).href;

  assert.equal(url(['articles', 'a/b']), 'https://cms.test/v1/articles/a%2Fb');
  assert.equal(url(['articles', 'a?admin=1']), 'https://cms.test/v1/articles/a%3Fadmin=1');
  assert.equal(url(['articles', 'a#frag']), 'https://cms.test/v1/articles/a%23frag');
  assert.equal(url(['articles', 'a\\..\\b']), 'https://cms.test/v1/articles/a%5C..%5Cb');
  for (const segment of ['..', '.', '%2e%2E', '.%2e', '']) {
    assert.throws(() => url(['articles', segment]), (err: unknown) => err instanceof CmsFetchError && err.kind === 'invalid_path', segment);
  }
});

test('a request for an impossible path fails without fetching and is not logged', async () => {
  let fetched = false;
  const { cms, logs } = client('https://cms.test/v1', { fetch: (async () => { fetched = true; return new Response('{}'); }) as typeof fetch });
  const err = await rejection(cms.getJson({ endpoint: 'article', path: ['articles', '..'] }));
  assert.equal(err.kind, 'invalid_path');
  assert.equal(fetched, false);
  assert.deepEqual(logs, []);
});

test('slugs that worked before reach the CMS byte-for-byte as they did', () => {
  const base = 'https://cms.test/v1';
  const { cms } = client(base);
  for (const slug of ['plain-slug', 'café-reopens', 'it%e2%80%99s-back', 'with space', 'UPPER_case.123']) {
    const before = new URL(`${base}/articles/${slug}`).href;
    assert.equal(cms.buildUrl('article', ['articles', slug]).href, before, slug);
  }
});

test('query values are encoded as values, so a search term cannot add parameters', () => {
  const { cms } = client('https://cms.test/v1');
  assert.equal(
    cms.buildUrl('search', ['search'], { q: 'a&limit=1000#x c++ 100%' }).href,
    'https://cms.test/v1/search?q=a%26limit%3D1000%23x%20c%2B%2B%20100%25',
  );
});

test('an unusable base URL fails every request as config, without fetching', async () => {
  let fetched = false;
  const { cms } = client('not a url', { fetch: (async () => { fetched = true; return new Response('{}'); }) as typeof fetch });
  const err = await rejection(cms.getJson({ endpoint: 'homepage', path: ['homepage'] }));
  assert.equal(err.kind, 'config');
  assert.equal(fetched, false);
});

// ---- timeouts and cancellation ---------------------------------------------

test('a CMS that never answers fails as a timeout within the budget, and the socket is closed', async (t) => {
  const server = await loopbackCms(hang);
  t.after(() => server.close());
  const { cms, logs } = client(server.base, { timeoutMs: 80 });

  const started = performance.now();
  const err = await rejection(cms.getJson({ endpoint: 'article', path: ['articles', 'stalled'] }));
  const elapsed = performance.now() - started;

  assert.equal(err.kind, 'timeout');
  assert.ok(elapsed >= 70 && elapsed < 1000, `took ${elapsed}ms`);
  await server.hits[0].closed;
  assert.equal(logs.length, 1);
  assert.equal(logs[0].outcome, 'timeout');
  assert.equal(logs[0].endpoint, 'article');
});

test('the budget covers the body too: headers then a stall is a timeout', async (t) => {
  const server = await loopbackCms((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.write('{"partial":');
  });
  t.after(() => server.close());
  const { cms } = client(server.base, { timeoutMs: 80 });

  const err = await rejection(cms.getJson({ endpoint: 'homepage', path: ['homepage'] }));
  assert.equal(err.kind, 'timeout');
});

test('the default budget is three seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | undefined;
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      signal = init?.signal ?? undefined;
      signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as typeof fetch;
  const { cms } = client('https://cms.test/v1', { fetch: fetchImpl });

  const pending = cms.getJson({ endpoint: 'homepage', path: ['homepage'] });
  t.mock.timers.tick(2999);
  assert.equal(signal?.aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signal?.aborted, true);
  assert.equal((await rejection(pending)).kind, 'timeout');
});

test("a caller's abort cancels the request upstream and is not logged as a CMS failure", async (t) => {
  const server = await loopbackCms(hang);
  t.after(() => server.close());
  const { cms, logs } = client(server.base, { timeoutMs: 5000 });
  const controller = new AbortController();

  const pending = cms.getJson({ endpoint: 'article_comments', path: ['articles', 'x', 'comments'], signal: controller.signal });
  while (server.hits.length === 0) await new Promise((r) => setTimeout(r, 5));
  controller.abort();

  const err = await rejection(pending);
  assert.equal(err.kind, 'aborted');
  await server.hits[0].closed;
  assert.deepEqual(logs, []);
});

test('an already-aborted signal makes no request', async () => {
  let fetched = false;
  const fetchImpl = (async () => {
    fetched = true;
    return new Response('{}');
  }) as typeof fetch;
  const { cms } = client('https://cms.test/v1', { fetch: fetchImpl });
  const err = await rejection(cms.getJson({ endpoint: 'article', path: ['articles', 'x'], signal: AbortSignal.abort() }));
  assert.equal(err.kind, 'aborted');
  assert.equal(fetched, false);
});

// ---- failure classification ------------------------------------------------

test('malformed JSON is invalid_json, and the body appears nowhere', async (t) => {
  const server = await loopbackCms((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('{"oops": secret-body-text');
  });
  t.after(() => server.close());
  const { cms, logs } = client(server.base);

  const err = await rejection(cms.getJson({ endpoint: 'homepage', path: ['homepage'] }));
  assert.equal(err.kind, 'invalid_json');
  assert.equal(err.cause, undefined);
  assert.doesNotMatch(`${err.message} ${err.stack} ${JSON.stringify(logs)}`, /secret-body-text/);
  assert.equal(logs[0].outcome, 'invalid_json');
});

test('HTTP errors are classified with their status, fetched once, never retried', async (t) => {
  for (const status of [400, 403, 404, 429, 500, 503]) {
    await t.test(String(status), async (st) => {
      const server = await loopbackCms((_req, res) => {
        res.writeHead(status, { 'content-type': 'text/html' });
        res.end('<h1>secret error page</h1>');
      });
      st.after(() => server.close());
      const { cms, logs } = client(server.base);

      const err = await rejection(cms.getJson({ endpoint: 'article', path: ['articles', 'x'] }));
      assert.equal(err.kind, 'http');
      assert.equal(err.status, status);
      assert.equal(err.message, `CMS article request failed: http (HTTP ${status})`);
      assert.equal(server.hits.length, 1, 'no retry');

      if (status === 404) {
        assert.deepEqual(logs, [], "a 404 is the CMS's normal answer for a dead slug");
      } else {
        assert.equal(logs.length, 1);
        assert.equal(logs[0].status, status);
        assert.doesNotMatch(JSON.stringify(logs), /secret error page/);
      }
    });
  }
});

test('a refused connection is a network failure with its code, and no address in the message', async () => {
  const server = await loopbackCms(hang);
  const base = server.base;
  await server.close();
  const { cms, logs } = client(base);

  const err = await rejection(cms.getJson({ endpoint: 'taxonomy', path: ['taxonomy'] }));
  assert.equal(err.kind, 'network');
  assert.equal(err.code, 'ECONNREFUSED');
  assert.equal(err.cause, undefined);
  assert.doesNotMatch(`${err.message} ${JSON.stringify(logs)}`, /127\.0\.0\.1|\/v1/);
  assert.equal(logs[0].code, 'ECONNREFUSED');
});

// ---- deduplication ---------------------------------------------------------

test('concurrent identical GETs share one request, and each caller gets its own copy', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const server = await loopbackCms((req, res) => {
    void gate.then(() => sendJson({ excerpt: 'shared', items: [1] })(req, res));
  });
  t.after(() => server.close());
  const reported: boolean[] = [];
  const { cms } = client(server.base, { slowMs: 0, log: (r) => reported.push(r.deduplicated) });
  const get = () => cms.getJson<{ excerpt: string; items: number[] }>({ endpoint: 'article', path: ['articles', 'same'] });

  const pending = [get(), get(), get()];
  while (server.hits.length === 0) await new Promise((r) => setTimeout(r, 5));
  release();
  const [a, b, c] = await Promise.all(pending);

  assert.equal(server.hits.length, 1);
  assert.deepEqual(a, b);
  a.items.push(2);
  a.excerpt = 'mutated';
  assert.deepEqual(b, { excerpt: 'shared', items: [1] }, 'one caller mutating its copy cannot reach another');
  assert.deepEqual(c, { excerpt: 'shared', items: [1] });
  assert.deepEqual(reported.sort(), [false, true, true]);

  // Settled entries are gone: the next read goes to the CMS again.
  await get();
  assert.equal(server.hits.length, 2);
});

test('a failure is shared by the callers waiting on it, then forgotten', async (t) => {
  let fail = true;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const server = await loopbackCms((req, res) => {
    void gate.then(() => (fail ? sendJson({ error: 'x' }, 502) : sendJson({ ok: true }))(req, res));
  });
  t.after(() => server.close());
  const { cms } = client(server.base);
  const get = () => cms.getJson({ endpoint: 'homepage', path: ['homepage'] });

  const pending = [get(), get()];
  while (server.hits.length === 0) await new Promise((r) => setTimeout(r, 5));
  release();
  const results = await Promise.allSettled(pending);
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  assert.equal(server.hits.length, 1);

  fail = false;
  assert.deepEqual(await get(), { ok: true });
  assert.equal(server.hits.length, 2, 'the failure was not cached');
});

test('different URLs and different budgets are not deduplicated', async (t) => {
  const server = await loopbackCms(sendJson({}));
  t.after(() => server.close());
  const { cms } = client(server.base);

  await Promise.all([
    cms.getJson({ endpoint: 'article', path: ['articles', 'a'] }),
    cms.getJson({ endpoint: 'article', path: ['articles', 'b'] }),
    cms.getJson({ endpoint: 'article', path: ['articles', 'a'], timeoutMs: 10_000 }),
  ]);
  assert.equal(server.hits.length, 3);
});

test('one caller aborting leaves the shared request running for the others', async (t) => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const server = await loopbackCms((req, res) => {
    void gate.then(() => sendJson({ ok: 1 })(req, res));
  });
  t.after(() => server.close());
  const { cms } = client(server.base);
  const controller = new AbortController();

  const leaving = cms.getJson({ endpoint: 'article', path: ['articles', 's'], signal: controller.signal });
  const staying = cms.getJson({ endpoint: 'article', path: ['articles', 's'] });
  while (server.hits.length === 0) await new Promise((r) => setTimeout(r, 5));
  controller.abort();
  assert.equal((await rejection(leaving)).kind, 'aborted');

  release();
  assert.deepEqual(await staying, { ok: 1 });
  assert.equal(server.hits.length, 1);
});

test('when every caller aborts, the shared request is cancelled and the entry dropped', async (t) => {
  const server = await loopbackCms((req, res) => {
    if (server.hits.length === 1) return; // the first request hangs
    sendJson({ fresh: true })(req, res);
  });
  t.after(() => server.close());
  const { cms } = client(server.base, { timeoutMs: 5000 });
  const a = new AbortController();
  const b = new AbortController();

  const first = cms.getJson({ endpoint: 'article', path: ['articles', 's'], signal: a.signal });
  const second = cms.getJson({ endpoint: 'article', path: ['articles', 's'], signal: b.signal });
  while (server.hits.length === 0) await new Promise((r) => setTimeout(r, 5));
  a.abort();
  b.abort();
  await Promise.allSettled([first, second]);
  await server.hits[0].closed;

  assert.deepEqual(await cms.getJson({ endpoint: 'article', path: ['articles', 's'] }), { fresh: true });
  assert.equal(server.hits.length, 2);
});

// ---- waiter accounting -----------------------------------------------------
//
// The waiter count decides whether one caller cancelling cancels the upstream
// request for everyone, so each caller must leave exactly once. These drive
// the same awaitShared the client uses, with a hand-held shared promise.

function sharedRequest() {
  let resolve!: (value: string) => void;
  const promise = new Promise<string>((r) => (resolve = r));
  let abandoned = 0;
  const waiters = createWaiterGroup(() => abandoned++);
  const join = (signal?: AbortSignal) => awaitShared(promise, waiters, signal, () => new Error('aborted'));
  return { resolve, waiters, join, abandoned: () => abandoned };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

test('a caller that aborts and then sees the request settle leaves once, not twice', async () => {
  const shared = sharedRequest();
  const leaving = new AbortController();
  const a = shared.join(leaving.signal);
  const b = shared.join(new AbortController().signal);
  assert.equal(shared.waiters.count, 2);

  leaving.abort();
  await assert.rejects(a, /aborted/);
  assert.equal(shared.waiters.count, 1);
  assert.equal(shared.abandoned(), 0, 'one caller leaving must not cancel for the other');

  shared.resolve('body');
  assert.equal(await b, 'body');
  await flush();
  assert.equal(shared.waiters.count, 0);
});

test('an abort landing between settle and delivery still leaves once', async () => {
  const shared = sharedRequest();
  const controller = new AbortController();
  const pending = shared.join(controller.signal);

  // Settled, but the result has not been delivered yet: the abort wins the race.
  shared.resolve('body');
  controller.abort();
  await assert.rejects(pending, /aborted/);
  await flush();

  assert.equal(shared.waiters.count, 0);
  assert.equal(shared.abandoned(), 1);
});

test('only the last caller to abort abandons the request, and only once', async () => {
  const shared = sharedRequest();
  const a = new AbortController();
  const b = new AbortController();
  const plain = shared.join();
  const first = shared.join(a.signal);
  const second = shared.join(b.signal);

  a.abort();
  b.abort();
  await Promise.allSettled([first, second]);
  assert.equal(shared.abandoned(), 0, 'a caller without a signal is still waiting');

  shared.resolve('body');
  assert.equal(await plain, 'body');
  await flush();
  assert.equal(shared.waiters.count, 0);

  const solo = sharedRequest();
  const c = new AbortController();
  const only = solo.join(c.signal);
  c.abort();
  c.abort();
  await assert.rejects(only, /aborted/);
  solo.resolve('late');
  await flush();
  assert.equal(solo.abandoned(), 1);
  assert.equal(solo.waiters.count, 0);
});

test('a fetch that throws synchronously still clears its entry', async () => {
  let calls = 0;
  const fetchImpl = ((() => {
    calls++;
    if (calls === 1) throw new TypeError('boom');
    return Promise.resolve(new Response('{"ok":true}'));
  }) as unknown) as typeof fetch;
  const { cms } = client('https://cms.test/v1', { fetch: fetchImpl });

  assert.equal((await rejection(cms.getJson({ endpoint: 'homepage', path: ['homepage'] }))).kind, 'network');
  assert.deepEqual(await cms.getJson({ endpoint: 'homepage', path: ['homepage'] }), { ok: true });
});

// ---- logging ---------------------------------------------------------------

/** A fetch that answers every request with `status` and a fake clock. */
function fakeCms(status: number, stepMs = 0) {
  let clock = 1_000;
  const fetchImpl = (async () => {
    clock += stepMs;
    return new Response(status === 200 ? '{}' : 'err', { status });
  }) as typeof fetch;
  return {
    fetchImpl,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
  };
}

test('log lines carry only bounded fields: no URL, slug, search term or token', async () => {
  const fake = fakeCms(500, 7);
  const { cms, logs } = client('https://user:hunter2@cms.test/v1?token=sekrit', { fetch: fake.fetchImpl, now: fake.now });

  await rejection(cms.getJson({ endpoint: 'search', path: ['search'], query: { q: 'private search words', token: 'sekrit' } }));
  await rejection(cms.getJson({ endpoint: 'article', path: ['articles', 'secret-slug'] }));

  assert.deepEqual(logs, [
    { msg: 'cms_fetch', endpoint: 'search', outcome: 'http', duration_ms: 7, deduplicated: false, status: 500 },
    { msg: 'cms_fetch', endpoint: 'article', outcome: 'http', duration_ms: 7, deduplicated: false, status: 500 },
  ]);
  assert.doesNotMatch(JSON.stringify(logs), /private|search words|secret-slug|sekrit|hunter2|cms\.test/);
});

test('an endpoint label that is not a plain identifier is logged as "other"', async () => {
  const fake = fakeCms(500);
  const { cms, logs } = client('https://cms.test/v1', { fetch: fake.fetchImpl, now: fake.now });
  const err = await rejection(cms.getJson({ endpoint: '/articles/some-slug?x=1', path: ['articles', 'x'] }));
  assert.equal(logs[0].endpoint, 'other');
  assert.equal(err.endpoint, 'other');
  assert.doesNotMatch(err.message, /some-slug/);
});

test('slow successes are logged; fast ones are not', async () => {
  const fake = fakeCms(200, 1500);
  const { cms, logs } = client('https://cms.test/v1', { fetch: fake.fetchImpl, now: fake.now, slowMs: 1000 });
  await cms.getJson({ endpoint: 'homepage', path: ['homepage'] });
  assert.deepEqual(logs, [{ msg: 'cms_fetch', endpoint: 'homepage', outcome: 'ok', duration_ms: 1500, deduplicated: false }]);

  const quick = fakeCms(200, 10);
  const second = client('https://cms.test/v1', { fetch: quick.fetchImpl, now: quick.now, slowMs: 1000 });
  await second.cms.getJson({ endpoint: 'homepage', path: ['homepage'] });
  assert.deepEqual(second.logs, []);
});

test('an outage is rate-limited to a few lines a minute, with the dropped count reported', async () => {
  const fake = fakeCms(503);
  const { cms, logs } = client('https://cms.test/v1', { fetch: fake.fetchImpl, now: fake.now, logLinesPerMinute: 2 });
  const fail = () => rejection(cms.getJson({ endpoint: 'homepage', path: ['homepage'] }));

  for (let i = 0; i < 5; i++) await fail();
  assert.equal(logs.length, 2);

  fake.advance(60_000);
  await fail();
  assert.equal(logs.length, 3);
  assert.equal(logs[2].suppressed, 3);
});

test('a throwing logger or timing sink does not fail the request', async () => {
  const fake = fakeCms(200, 5000);
  const { cms } = client('https://cms.test/v1', {
    fetch: fake.fetchImpl,
    now: fake.now,
    log: () => {
      throw new Error('logger down');
    },
    onTiming: () => {
      throw new Error('sink down');
    },
  });
  assert.deepEqual(await cms.getJson({ endpoint: 'homepage', path: ['homepage'] }), {});
});
