import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteTitleStore, SITE_TITLE_TTL_MS } from '../src/utils/siteTitleStore.ts';
import {
  createPollWidgetStore,
  POLL_COUNTS_TTL_MS,
  POLL_OPTIONS_TTL_MS,
  POLL_TITLE_TTL_MS,
} from '../src/utils/pollWidgetStore.ts';

const BASE = 'https://cms.test/v1';
const SECOND = 1000;

type Route = () => Response | Promise<Response>;

/**
 * A fake CMS: per-URL queues of responses (the last one repeats), a request
 * counter per URL, and a fake clock shared with the store under test.
 */
function fakeCms() {
  let clock = 5_000_000;
  const routes = new Map<string, Route[]>();
  const hits = new Map<string, number>();
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    hits.set(url, (hits.get(url) ?? 0) + 1);
    const queue = routes.get(url);
    if (!queue || queue.length === 0) throw new Error(`no route for ${url}`);
    const route = queue.length > 1 ? queue.shift()! : queue[0];
    return route();
  }) as typeof fetch;
  return {
    fetchImpl,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
    on(path: string, ...responses: Route[]) {
      routes.set(`${BASE}${path}`, responses);
    },
    hits(path: string) {
      return hits.get(`${BASE}${path}`) ?? 0;
    },
  };
}

const json = (body: unknown, status = 200): Route => () =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const status = (code: number): Route => () => new Response('nope', { status: code });
const broken: Route = () => new Response('{not json', { status: 200 });
const networkError: Route = () => {
  throw new TypeError('fetch failed');
};

function deferredRoute() {
  let resolve!: (r: Response) => void;
  const promise = new Promise<Response>((res) => {
    resolve = res;
  });
  return { route: (() => promise) as Route, resolve };
}

// ---- site title -----------------------------------------------------------

function titleStore(cms: ReturnType<typeof fakeCms>) {
  return createSiteTitleStore({ url: `${BASE}/settings/site`, fetch: cms.fetchImpl, now: cms.now, onError: () => {} });
}

test('site title: one CMS call per five minutes, however many renders', async () => {
  const cms = fakeCms();
  cms.on('/settings/site', json({ site_title: '  The Triangle Daily ' }));
  const store = titleStore(cms);

  for (let i = 0; i < 50; i++) assert.equal(await store.get(), 'The Triangle Daily');
  assert.equal(cms.hits('/settings/site'), 1);

  cms.advance(SITE_TITLE_TTL_MS - 1);
  await store.get();
  assert.equal(cms.hits('/settings/site'), 1);

  cms.advance(1);
  await store.get();
  assert.equal(cms.hits('/settings/site'), 2);
  assert.equal(SITE_TITLE_TTL_MS, 5 * 60 * SECOND);
});

test('site title: concurrent first renders share one CMS call', async () => {
  const cms = fakeCms();
  const pending = deferredRoute();
  cms.on('/settings/site', pending.route);
  const store = titleStore(cms);

  const titles = Promise.all(Array.from({ length: 20 }, () => store.get()));
  pending.resolve(new Response(JSON.stringify({ site_title: 'T' }), { status: 200 }));
  assert.deepEqual(await titles, Array(20).fill('T'));
  assert.equal(cms.hits('/settings/site'), 1);
});

test('site title: an outage keeps the last good title, and a cold outage falls back to the default', async () => {
  const cms = fakeCms();
  cms.on('/settings/site', json({ site_title: 'Custom' }), status(503), networkError, broken);
  const store = titleStore(cms);
  assert.equal(await store.get(), 'Custom');

  for (const _ of [503, 'network', 'bad json']) {
    cms.advance(SITE_TITLE_TTL_MS);
    assert.equal(await store.get(), 'Custom');
  }
  assert.equal(cms.hits('/settings/site'), 4);

  const cold = fakeCms();
  cold.on('/settings/site', status(500));
  assert.equal(await titleStore(cold).get(), 'The Triangle');
});

test('site title: a blank title is a real answer and means the default', async () => {
  const cms = fakeCms();
  cms.on('/settings/site', json({ site_title: '   ' }));
  const store = titleStore(cms);
  assert.equal(await store.get(), 'The Triangle');
  await store.get();
  assert.equal(cms.hits('/settings/site'), 1);
});

// ---- poll widget ----------------------------------------------------------

function pollStore(cms: ReturnType<typeof fakeCms>) {
  return createPollWidgetStore({ baseUrl: BASE, fetch: cms.fetchImpl, now: cms.now, onError: () => {} });
}

function livePoll(cms: ReturnType<typeof fakeCms>) {
  cms.on('/poll/options', json({ options: [' Yes ', 'No', '', 3] }));
  cms.on('/poll/title', json({ title: ' Coffee? ' }));
  cms.on('/poll', json({ counts: { Yes: 3, No: 1.9, ' ': 4, Bad: -1 } }));
}

test('poll widget: the three resources are requested in parallel', async () => {
  const cms = fakeCms();
  const options = deferredRoute();
  const title = deferredRoute();
  const counts = deferredRoute();
  cms.on('/poll/options', options.route);
  cms.on('/poll/title', title.route);
  cms.on('/poll', counts.route);

  const widget = pollStore(cms).load();
  await new Promise((resolve) => setImmediate(resolve));
  // All three are on the wire before any has answered.
  assert.deepEqual([cms.hits('/poll/options'), cms.hits('/poll/title'), cms.hits('/poll')], [1, 1, 1]);

  counts.resolve(new Response(JSON.stringify({ Yes: 2 }), { status: 200 }));
  title.resolve(new Response(JSON.stringify({ title: 'Q' }), { status: 200 }));
  options.resolve(new Response(JSON.stringify({ options: ['Yes'] }), { status: 200 }));
  assert.deepEqual(await widget, { options: ['Yes'], title: 'Q', counts: { Yes: 2 } });
});

test('poll widget: parses and normalizes like the old fetchers', async () => {
  const cms = fakeCms();
  livePoll(cms);
  assert.deepEqual(await pollStore(cms).load(), {
    options: ['Yes', 'No'],
    title: 'Coffee?',
    counts: { Yes: 3, No: 1 },
  });
});

test('poll widget: TTLs are 60s for options and title, 15s for counts', async () => {
  const cms = fakeCms();
  livePoll(cms);
  const store = pollStore(cms);
  const hits = () => [cms.hits('/poll/options'), cms.hits('/poll/title'), cms.hits('/poll')];

  for (let i = 0; i < 25; i++) await store.load();
  assert.deepEqual(hits(), [1, 1, 1]);

  cms.advance(POLL_COUNTS_TTL_MS);
  await store.load();
  assert.deepEqual(hits(), [1, 1, 2]);

  cms.advance(POLL_OPTIONS_TTL_MS - POLL_COUNTS_TTL_MS);
  await store.load();
  assert.deepEqual(hits(), [2, 2, 3]);

  assert.equal(POLL_OPTIONS_TTL_MS, 60 * SECOND);
  assert.equal(POLL_TITLE_TTL_MS, 60 * SECOND);
  assert.equal(POLL_COUNTS_TTL_MS, 15 * SECOND);
});

test('poll widget: concurrent renders share one call per resource', async () => {
  const cms = fakeCms();
  livePoll(cms);
  const store = pollStore(cms);
  await Promise.all(Array.from({ length: 30 }, () => store.load()));
  assert.deepEqual([cms.hits('/poll/options'), cms.hits('/poll/title'), cms.hits('/poll')], [1, 1, 1]);
});

test('poll widget: a CMS outage keeps showing the last good poll', async () => {
  const cms = fakeCms();
  livePoll(cms);
  const store = pollStore(cms);
  const good = await store.load();

  cms.on('/poll/options', status(502));
  cms.on('/poll/title', networkError);
  cms.on('/poll', broken);
  cms.advance(POLL_OPTIONS_TTL_MS);
  assert.deepEqual(await store.load(), good);
});

test('poll widget: a cold outage renders no poll rather than throwing', async () => {
  const cms = fakeCms();
  cms.on('/poll/options', broken);
  cms.on('/poll/title', status(500));
  cms.on('/poll', networkError);
  assert.deepEqual(await pollStore(cms).load(), { options: [], title: '', counts: {} });
});

test('poll widget: "no live poll" is a real answer and is cached like one', async () => {
  const cms = fakeCms();
  cms.on('/poll/options', json({ options: [] }));
  cms.on('/poll/title', json({}));
  cms.on('/poll', json({}));
  const store = pollStore(cms);
  await store.load();
  await store.load();
  assert.equal(cms.hits('/poll/options'), 1);
});

test('poll widget: counts from a vote replace the cached counts without a CMS call', async () => {
  const cms = fakeCms();
  livePoll(cms);
  const store = pollStore(cms);
  await store.load();

  store.primeCounts({ Yes: 4, No: 1 });
  assert.deepEqual(await store.getCounts(), { Yes: 4, No: 1 });
  assert.equal(cms.hits('/poll'), 1);
});
