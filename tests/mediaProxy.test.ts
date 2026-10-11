import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import zlib from 'node:zlib';
import { proxyMedia, upstreamUrl, type ProxyMediaOptions } from '../src/utils/mediaProxy.ts';

const BASE = 'https://media.test';
const PATH = 'wp-content/uploads/2026/01/thetriangle.png';

interface Call {
  url: string;
  headers: Headers;
  signal: AbortSignal | undefined;
}

// A fetch stand-in that answers from a queue and records what it was asked.
const mockFetch = (...responses: Array<Response | (() => Response) | Error>) => {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: new Headers(init?.headers),
      signal: init?.signal ?? undefined,
    });
    const next = responses.shift();
    if (!next) throw new Error('unexpected upstream fetch');
    if (next instanceof Error) throw next;
    return typeof next === 'function' ? next() : next;
  }) as typeof fetch;
  return { fetchImpl, calls };
};

const run = (fetchImpl: typeof fetch, overrides: Partial<ProxyMediaOptions> = {}) =>
  proxyMedia({
    baseUrl: BASE,
    path: PATH,
    search: '',
    requestHeaders: new Headers(),
    fetchImpl,
    ...overrides,
  });

test('streams the upstream body before it has finished arriving', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start: (c) => { controller = c; } });
  controller.enqueue(new Uint8Array([1, 2, 3]));
  const { fetchImpl } = mockFetch(new Response(body, { headers: { 'content-type': 'image/png' } }));

  // The upstream stream is still open; a buffering proxy would never resolve.
  const res = await run(fetchImpl);
  assert.equal(res.status, 200);
  const reader = res.body!.getReader();
  assert.deepEqual((await reader.read()).value, new Uint8Array([1, 2, 3]));

  controller.enqueue(new Uint8Array([4]));
  controller.close();
  assert.deepEqual((await reader.read()).value, new Uint8Array([4]));
  assert.equal((await reader.read()).done, true);
});

test('forwards representation and cache headers but not the rest', async () => {
  const { fetchImpl } = mockFetch(new Response('png', {
    headers: {
      'content-type': 'image/png',
      'content-length': '3',
      'cache-control': 'public, max-age=2592000',
      expires: 'Thu, 01 Jan 2099 00:00:00 GMT',
      etag: '"abc"',
      'last-modified': 'Wed, 01 Jan 2025 00:00:00 GMT',
      'accept-ranges': 'bytes',
      'set-cookie': 'session=origin',
      server: 'nginx',
      'strict-transport-security': 'max-age=63072000',
      'x-powered-by': 'PHP',
    },
  }));

  const res = await run(fetchImpl);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.equal(res.headers.get('content-length'), '3');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=2592000');
  assert.equal(res.headers.get('expires'), 'Thu, 01 Jan 2099 00:00:00 GMT');
  assert.equal(res.headers.get('etag'), '"abc"');
  assert.equal(res.headers.get('last-modified'), 'Wed, 01 Jan 2025 00:00:00 GMT');
  assert.equal(res.headers.get('accept-ranges'), 'bytes');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('server'), null);
  assert.equal(res.headers.get('strict-transport-security'), null);
  assert.equal(res.headers.get('x-powered-by'), null);
  assert.equal(await res.text(), 'png');
});

test('defaults a missing content type to octet-stream', async () => {
  const { fetchImpl } = mockFetch(new Response(new Uint8Array([0])));
  const res = await run(fetchImpl);
  // new Response() infers no type for a byte body, so this is the proxy's default.
  assert.equal(res.headers.get('content-type'), 'application/octet-stream');
});

test('drops content-length when the origin compressed anyway', async () => {
  const { fetchImpl } = mockFetch(new Response('decoded', {
    headers: { 'content-type': 'application/pdf', 'content-length': '4', 'content-encoding': 'gzip' },
  }));
  const res = await run(fetchImpl);
  assert.equal(res.headers.get('content-length'), null);
  assert.equal(res.headers.get('content-encoding'), null);
  assert.equal(await res.text(), 'decoded');
});

// The mock above takes "fetch decodes it" on faith; this checks it against the
// runtime's real fetch over loopback. Node's fetch (undici) decodes by the
// response's Content-Encoding even though we asked for identity, so the client
// must get plain bytes with neither the origin's encoding nor its (compressed)
// length. If a runtime ever stops decoding, this fails instead of shipping
// gzip labelled image/png.
test('real fetch: an origin that compresses despite identity still yields plain bytes', async (t) => {
  const plain = Buffer.from('%PDF-1.7 media bytes '.repeat(50));
  const encoders: Record<string, (b: Buffer) => Buffer> = {
    gzip: zlib.gzipSync,
    deflate: zlib.deflateSync,
    br: zlib.brotliCompressSync,
  };
  const seen: (string | undefined)[] = [];
  const server = http.createServer((req, res) => {
    seen.push(req.headers['accept-encoding']);
    const encoding = req.url!.split('/').pop()!;
    const body = encoders[encoding](plain);
    res.writeHead(200, {
      'content-type': 'application/pdf',
      'content-encoding': encoding,
      'content-length': body.length,
    });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));
  const { port } = server.address() as AddressInfo;

  for (const encoding of Object.keys(encoders)) {
    const res = await proxyMedia({
      baseUrl: `http://127.0.0.1:${port}`,
      path: `wp-content/uploads/${encoding}`,
      search: '',
      requestHeaders: new Headers(),
    });
    assert.equal(res.status, 200, encoding);
    assert.equal(res.headers.get('content-encoding'), null, encoding);
    assert.equal(res.headers.get('content-length'), null, encoding);
    assert.equal(res.headers.get('content-type'), 'application/pdf', encoding);
    assert.deepEqual(Buffer.from(await res.arrayBuffer()), plain, encoding);
  }
  assert.deepEqual(seen, ['identity', 'identity', 'identity']);
});

test('forwards conditional and range request headers only', async () => {
  const { fetchImpl, calls } = mockFetch(new Response('x'));
  await run(fetchImpl, {
    requestHeaders: new Headers({
      'if-none-match': '"abc"',
      'if-modified-since': 'Wed, 01 Jan 2025 00:00:00 GMT',
      range: 'bytes=0-99',
      'if-range': '"abc"',
      cookie: 'session=reader',
      authorization: 'Bearer secret',
      'x-forwarded-for': '203.0.113.9',
      host: 'thetriangle.org',
    }),
  });

  const sent = calls[0].headers;
  assert.equal(sent.get('if-none-match'), '"abc"');
  assert.equal(sent.get('if-modified-since'), 'Wed, 01 Jan 2025 00:00:00 GMT');
  assert.equal(sent.get('range'), 'bytes=0-99');
  assert.equal(sent.get('if-range'), '"abc"');
  assert.equal(sent.get('accept-encoding'), 'identity');
  assert.equal(sent.get('user-agent'), 'Mozilla/5.0');
  assert.equal(sent.get('cookie'), null);
  assert.equal(sent.get('authorization'), null);
  assert.equal(sent.get('x-forwarded-for'), null);
  assert.equal(sent.get('host'), null);
});

test('passes a 304 through with validators and no body', async () => {
  const { fetchImpl } = mockFetch(new Response(null, {
    status: 304,
    headers: { etag: '"abc"', 'cache-control': 'public, max-age=60', 'set-cookie': 'a=b' },
  }));
  const res = await run(fetchImpl, { requestHeaders: new Headers({ 'if-none-match': '"abc"' }) });
  assert.equal(res.status, 304);
  assert.equal(res.body, null);
  assert.equal(res.headers.get('etag'), '"abc"');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('content-type'), null);
});

test('passes a 206 through with its content range', async () => {
  const { fetchImpl } = mockFetch(new Response('0123', {
    status: 206,
    headers: {
      'content-type': 'application/pdf',
      'content-range': 'bytes 0-3/1000',
      'content-length': '4',
      'accept-ranges': 'bytes',
    },
  }));
  const res = await run(fetchImpl, { requestHeaders: new Headers({ range: 'bytes=0-3' }) });
  assert.equal(res.status, 206);
  assert.equal(res.headers.get('content-range'), 'bytes 0-3/1000');
  assert.equal(res.headers.get('content-length'), '4');
  assert.equal(await res.text(), '0123');
});

test('keeps the content range on a 416', async () => {
  const { fetchImpl } = mockFetch(new Response('nope', {
    status: 416,
    headers: { 'content-range': 'bytes */1000' },
  }));
  const res = await run(fetchImpl, { requestHeaders: new Headers({ range: 'bytes=5000-' }) });
  assert.equal(res.status, 416);
  assert.equal(res.headers.get('content-range'), 'bytes */1000');
});

test('retries a 404 exactly once with a cache-buster', async () => {
  let firstCancelled = false;
  const firstBody = new ReadableStream({ cancel: () => { firstCancelled = true; } });
  const { fetchImpl, calls } = mockFetch(
    new Response(firstBody, { status: 404 }),
    new Response('found', { headers: { 'content-type': 'image/png' } }),
  );

  const res = await run(fetchImpl, {
    search: '?ver=2',
    requestHeaders: new Headers({ 'if-none-match': '"abc"' }),
  });
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'found');
  assert.equal(firstCancelled, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${BASE}/${PATH}?ver=2`);
  assert.match(calls[1].url, new RegExp(`^${BASE}/${PATH}\\?ver=2&cb=\\d+$`));
  assert.equal(calls[1].headers.get('if-none-match'), '"abc"');
});

test('a 404 without a query string gets ?cb= and a real miss stays 404', async () => {
  const { fetchImpl, calls } = mockFetch(
    new Response('missing', { status: 404 }),
    new Response('missing', { status: 404, headers: { 'cache-control': 'immutable' } }),
  );
  const res = await run(fetchImpl);
  assert.equal(res.status, 404);
  assert.equal(res.headers.get('cache-control'), null);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, new RegExp(`^${BASE}/${PATH}\\?cb=\\d+$`));
});

test('other upstream errors keep their status without a retry', async () => {
  const { fetchImpl, calls } = mockFetch(new Response('down', { status: 503 }));
  const res = await run(fetchImpl);
  assert.equal(res.status, 503);
  assert.equal(calls.length, 1);
});

test('a slow upstream becomes a 504', async () => {
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) =>
    new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason));
    })) as typeof fetch;
  const res = await run(fetchImpl, { timeoutMs: 5 });
  assert.equal(res.status, 504);
});

test('a fetch failure becomes a 502', async (t) => {
  t.mock.method(console, 'error', () => {});
  const { fetchImpl } = mockFetch(new TypeError('fetch failed'));
  const res = await run(fetchImpl);
  assert.equal(res.status, 502);
});

test('one timeout budget covers the 404 retry', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const signals: AbortSignal[] = [];
  let resolveFirst!: (res: Response) => void;
  let retryStarted!: () => void;
  const retrying = new Promise<void>((resolve) => { retryStarted = resolve; });
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) => {
    const signal = init!.signal!;
    signals.push(signal);
    if (signals.length === 1) return new Promise<Response>((resolve) => { resolveFirst = resolve; });
    retryStarted();
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason));
    });
  }) as typeof fetch;

  const pending = run(fetchImpl, { timeoutMs: 100 });
  t.mock.timers.tick(60);
  resolveFirst(new Response('stale', { status: 404 }));
  await retrying;

  // 60ms are already spent, so the hanging retry gets the remaining 40ms rather
  // than a fresh 100ms.
  t.mock.timers.tick(39);
  assert.equal(signals[1].aborted, false);
  t.mock.timers.tick(1);
  assert.equal(signals[1].aborted, true);

  const res = await pending;
  assert.equal(res.status, 504);
  assert.equal(signals.length, 2);
});

test('the client hanging up mid-request aborts the upstream fetch', async (t) => {
  const logged = t.mock.method(console, 'error', () => {});
  const client = new AbortController();
  let fetches = 0;
  let upstreamAborted = false;
  const fetchImpl = ((_input: string | URL | Request, init?: RequestInit) => {
    fetches++;
    const signal = init!.signal!;
    return new Promise<Response>((_resolve, reject) => {
      signal.addEventListener('abort', () => {
        upstreamAborted = true;
        reject(signal.reason);
      });
    });
  }) as typeof fetch;

  const pending = run(fetchImpl, { signal: client.signal });
  assert.equal(fetches, 1);
  assert.equal(upstreamAborted, false);
  client.abort();
  assert.equal(upstreamAborted, true);

  // proxyMedia answers rather than rejecting: not a timeout, so not a 504, and
  // not logged as a proxy fault.
  const res = await pending;
  assert.equal(res.status, 502);
  assert.equal(logged.mock.callCount(), 0);
  assert.equal(fetches, 1);
});

test('a missing path is a 404 without touching the origin', async () => {
  const { fetchImpl, calls } = mockFetch();
  const res = await run(fetchImpl, { path: undefined });
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test('paths cannot leave the media origin or its base path', async () => {
  const { fetchImpl, calls } = mockFetch();
  const res = await run(fetchImpl, { baseUrl: 'https://media.test/uploads', path: '../admin' });
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);

  assert.equal(upstreamUrl('https://media.test/uploads', '%2e%2e/admin', ''), null);
  assert.equal(upstreamUrl('https://media.test/uploads', '..\\admin', ''), null);
  // The host never changes, whatever the path starts with.
  assert.equal(upstreamUrl(BASE, 'wp-content//evil.test/x.png', ''), `${BASE}/wp-content//evil.test/x.png`);
  assert.equal(upstreamUrl(BASE, 'wp-content\\evil.test/x.png', ''), `${BASE}/wp-content/evil.test/x.png`);
  assert.equal(upstreamUrl(BASE, 'wp-content/@evil.test/x.png', ''), `${BASE}/wp-content/@evil.test/x.png`);
  assert.equal(upstreamUrl('https://MEDIA.test:443', PATH, '?ver=1'), `${BASE}/${PATH}?ver=1`);
});

// MEDIA_BASE_URL is an origin with no path (https://cms.thetriangle.org), so
// "stays under the base" alone would let the route relay any page the CMS host
// serves. The site only ever proxies /wp-content/ (uploads, plus a couple of
// plugin assets), so that is all the route will fetch.
test('only /wp-content/ under the base is proxied', async () => {
  const { fetchImpl, calls } = mockFetch();
  const refused = [
    'wp-login.php',
    'wp-json/wp/v2/users',
    'wp-admin/admin-ajax.php',
    'xmlrpc.php',
    'wp-content',
    'wp-contentx/uploads/a.png',
    'WP-CONTENT/uploads/a.png',
    '//evil.test/wp-content/x.png',
    '\\evil.test/wp-content/x.png',
    '@evil.test/wp-content/x.png',
    // Dot segments, literal or encoded, are resolved before the scope check:
    // WHATWG URL parsing treats %2e%2e exactly like "..".
    'wp-content/../wp-login.php',
    'wp-content/uploads/%2e%2e/%2E%2e/wp-config.php',
    'wp-content/.%2e/wp-json/wp/v2/users',
    'wp-content/..\\wp-login.php',
  ];
  for (const path of refused) {
    assert.equal(upstreamUrl(BASE, path, ''), null, path);
    const res = await run(fetchImpl, { path });
    assert.equal(res.status, 400, path);
  }
  assert.equal(calls.length, 0);

  // A base with a path prefix scopes to <prefix>/wp-content/.
  assert.equal(upstreamUrl('https://media.test/site', 'wp-content/a.png', ''), 'https://media.test/site/wp-content/a.png');
  assert.equal(upstreamUrl('https://media.test/site', '../wp-content/a.png', ''), null);

  // Every media shape the site actually links still passes, normalized.
  for (const [path, expected] of [
    [PATH, `${BASE}/${PATH}`],
    ['wp-content/plugins/some-plugin/icon.svg', `${BASE}/wp-content/plugins/some-plugin/icon.svg`],
    ['wp-content/uploads/2026/./01/a.png', `${BASE}/wp-content/uploads/2026/01/a.png`],
    ['wp-content/uploads/x/../a.png', `${BASE}/wp-content/uploads/a.png`],
  ]) {
    assert.equal(upstreamUrl(BASE, path, ''), expected, path);
  }
});

test('encoded slashes and backslashes are refused before reaching the origin', async () => {
  const { fetchImpl, calls } = mockFetch();
  const refused: string[] = [];
  // %2f, %252f, %25252f, %2525252f and the %5c equivalents, in either case.
  for (let depth = 0; depth < 4; depth++) {
    for (const separator of ['2f', '2F', '5c', '5C']) {
      refused.push(`wp-content/..%${'25'.repeat(depth)}${separator}admin`);
    }
  }
  refused.push(
    // Extra layers that encode the hex digits as well as the percent sign.
    '..%25%32%66admin',
    '..%25%35%43admin',
    // A stray "%" that a lenient decoder keeps, letting the next layer form %2f.
    '..%%32%66admin',
    'wp-content/100%',
  );
  for (const path of refused) {
    assert.equal(upstreamUrl('https://media.test/uploads', path, ''), null, path);
    const res = await run(fetchImpl, { path });
    assert.equal(res.status, 400, path);
  }
  assert.equal(calls.length, 0);
});

test('ordinary escapes in the path and anything in the query string still pass', async () => {
  assert.equal(upstreamUrl(BASE, 'wp-content/a%20b.jpg', ''), `${BASE}/wp-content/a%20b.jpg`);
  assert.equal(
    upstreamUrl(BASE, 'wp-content/caf%C3%A9%E2%80%99s.jpg', ''),
    `${BASE}/wp-content/caf%C3%A9%E2%80%99s.jpg`,
  );

  // Only the path is checked; encoded separators in the query string are data.
  for (const search of ['?ver=a%2Fb', '?ver=a%252F%255Cb', '?ver=100%25', '?ver=100%']) {
    assert.equal(upstreamUrl(BASE, PATH, search), `${BASE}/${PATH}${search}`, search);
  }
  const { fetchImpl, calls } = mockFetch(new Response('ok'));
  const res = await run(fetchImpl, { search: '?ver=a%252Fb' });
  assert.equal(res.status, 200);
  assert.equal(calls[0].url, `${BASE}/${PATH}?ver=a%252Fb`);
});
