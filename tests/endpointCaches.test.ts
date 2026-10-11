import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStatsHandler, createStatsStore, STATS_CACHE_CONTROL, STATS_TTL_MS } from '../src/utils/statsStore.ts';
import {
  createSitemapIndexHandler,
  createSitemapSlugStore,
  createYearSitemapHandler,
  SITEMAP_CACHE_CONTROL,
  SITEMAP_TTL_MS,
} from '../src/utils/sitemap.ts';
import { createFeedHandler, FEED_CACHE_CONTROL } from '../src/utils/feed.ts';
import type { Article, ArticleSummary, SitemapSlug } from '../src/utils/types.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A scripted loader (the last step repeats) with a call counter and clock. */
function scripted<T>(...steps: (() => Promise<T>)[]) {
  let clock = 10_000_000;
  let calls = 0;
  const errors: unknown[] = [];
  return {
    load: () => {
      calls++;
      const step = steps.length > 1 ? steps.shift()! : steps[0];
      return step();
    },
    now: () => clock,
    onError: (err: unknown) => errors.push(err),
    advance(ms: number) {
      clock += ms;
    },
    get calls() {
      return calls;
    },
    errors,
  };
}

const ok = <T>(value: T) => () => Promise.resolve(value);
const fail = (message = 'Matomo error 502 token_auth=SECRET') => () => Promise.reject(new Error(message));

// --- /api/stats ------------------------------------------------------------

const posts = [{ slug: 'one', title: 'One' }, { slug: 'two', title: 'Two' }] as Article[];
const newer = [{ slug: 'three', title: 'Three' }] as Article[];

test('stats: served from memory for an hour, then reloaded', async () => {
  const s = scripted(ok(posts), ok(newer));
  const store = createStatsStore(s);
  assert.deepEqual(await store.get(), posts);
  s.advance(STATS_TTL_MS - 1);
  assert.deepEqual(await store.get(), posts);
  assert.equal(s.calls, 1);
  s.advance(1);
  assert.deepEqual(await store.get(), newer);
  assert.equal(s.calls, 2);
});

test('stats: concurrent misses share one Matomo+CMS load', async () => {
  const gate = deferred<Article[]>();
  const s = scripted(() => gate.promise);
  const store = createStatsStore(s);
  const pending = Array.from({ length: 25 }, () => store.get());
  assert.equal(s.calls, 1);
  gate.resolve(posts);
  for (const result of await Promise.all(pending)) assert.deepEqual(result, posts);
  assert.equal(s.calls, 1);
});

test('stats: a failed reload serves the stale list, within the stale bound only', async () => {
  const s = scripted(ok(posts), fail());
  const store = createStatsStore(s);
  await store.get();
  s.advance(STATS_TTL_MS);
  assert.deepEqual(await store.get(), posts);
  assert.equal(s.errors.length, 1);
  // Backoff: an outage costs one attempt a minute, not one per request.
  assert.deepEqual(await store.get(), posts);
  assert.equal(s.calls, 2);
  s.advance(6 * HOUR);
  assert.equal(await store.get(), null);
});

test('stats: an empty list (CMS reads all failed) is not cached as success', async () => {
  const s = scripted(ok([] as Article[]), ok(posts));
  const store = createStatsStore(s);
  assert.equal(await store.get(), null);
  s.advance(MINUTE);
  assert.deepEqual(await store.get(), posts);
});

test('stats route: public cache header on success; generic, uncached 500 on failure', async () => {
  const good = createStatsHandler(createStatsStore(scripted(ok(posts))));
  const res = await good();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), STATS_CACHE_CONTROL);
  assert.equal(res.headers.get('Content-Type'), 'application/json');
  assert.deepEqual(await res.json(), posts);

  const bad = createStatsHandler(createStatsStore(scripted<Article[]>(fail())));
  const err = await bad();
  assert.equal(err.status, 500);
  assert.equal(err.headers.get('Cache-Control'), 'no-store');
  const body = await err.text();
  assert.deepEqual(JSON.parse(body), { error: 'Failed to load stats' });
  assert.doesNotMatch(body, /SECRET|token/);
});

// --- sitemaps --------------------------------------------------------------

const slugs: SitemapSlug[] = [
  { slug: 'a', lastmod: '2024-03-01T10:00:00Z' },
  { slug: 'b', lastmod: '2024-07-01T10:00:00Z' },
  { slug: 'c', lastmod: '2025-01-05T10:00:00Z' },
];

test('sitemaps: the index and every year sitemap share one slug-list load', async () => {
  const s = scripted(ok(slugs));
  const store = createSitemapSlugStore(s);
  const index = createSitemapIndexHandler(store);
  const year = createYearSitemapHandler(store);

  const indexXml = await (await index()).text();
  assert.match(indexXml, /sitemap-2024\.xml/);
  assert.match(indexXml, /sitemap-2025\.xml/);
  const y2024 = await (await year({ params: { year: '2024' } })).text();
  assert.match(y2024, /article\/a</);
  assert.match(y2024, /article\/b</);
  assert.doesNotMatch(y2024, /article\/c</);
  await year({ params: { year: '2025' } });
  await year({ params: { year: '1999' } });
  assert.equal(s.calls, 1, 'a crawl of the index and all years should cost one CMS read');

  s.advance(SITEMAP_TTL_MS);
  await index();
  assert.equal(s.calls, 2);
});

test('sitemaps: concurrent index/year requests share one in-flight load', async () => {
  const gate = deferred<SitemapSlug[]>();
  const s = scripted(() => gate.promise);
  const store = createSitemapSlugStore(s);
  const pending = [
    createSitemapIndexHandler(store)(),
    createYearSitemapHandler(store)({ params: { year: '2024' } }),
    createYearSitemapHandler(store)({ params: { year: '2025' } }),
  ];
  gate.resolve(slugs);
  await Promise.all(pending);
  assert.equal(s.calls, 1);
});

test('sitemaps: stale list served on error up to a day; an empty read is not cached', async () => {
  const s = scripted(ok(slugs), fail(), ok([]));
  const store = createSitemapSlugStore(s);
  await store.get();
  s.advance(SITEMAP_TTL_MS);
  assert.deepEqual(await store.get(), slugs); // thrown error -> stale
  s.advance(MINUTE);
  assert.deepEqual(await store.get(), slugs); // empty list -> stale, not cached
  assert.equal(s.errors.length, 2);
  s.advance(24 * HOUR);
  assert.deepEqual(await store.get(), []);
});

test('sitemap routes: XML content type, public cache when populated, no-store for the empty fallback', async () => {
  const store = createSitemapSlugStore(scripted(ok(slugs)));
  for (const res of [await createSitemapIndexHandler(store)(), await createYearSitemapHandler(store)({ params: { year: '2024' } })]) {
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('Content-Type'), 'application/xml');
    assert.equal(res.headers.get('Cache-Control'), SITEMAP_CACHE_CONTROL);
  }

  const down = createSitemapSlugStore(scripted<SitemapSlug[]>(fail()));
  const res = await createSitemapIndexHandler(down)();
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Cache-Control'), 'no-store');
  assert.match(await res.text(), /<sitemapindex[^>]*>\s*<\/sitemapindex>$/);
});

// --- /feed -----------------------------------------------------------------

const recent = [{ slug: 'x', title: 'X', excerpt: 'x', published_date: '2025-02-03T04:05:06Z', categories: [] }] as unknown as ArticleSummary[];

test('feed: site title and recent articles are requested in parallel', async () => {
  const title = deferred<string>();
  const articles = deferred<ArticleSummary[]>();
  const started: string[] = [];
  const handler = createFeedHandler({
    getSiteTitle: () => (started.push('title'), title.promise),
    getRecentArticles: (limit) => (started.push(`articles:${limit}`), articles.promise),
  });
  const pending = handler();
  // Both reads are in flight before either has answered.
  assert.deepEqual(started, ['title', 'articles:20']);
  articles.resolve(recent);
  title.resolve('The Triangle');
  const res = await pending;
  assert.equal(res.headers.get('Content-Type'), 'application/xml');
  assert.equal(res.headers.get('Cache-Control'), FEED_CACHE_CONTROL);
  const xml = await res.text();
  assert.match(xml, /<title>The Triangle<\/title>/);
  assert.match(xml, /<link>https:\/\/www\.thetriangle\.org\/article\/x<\/link>/);
});

test('feed: an empty article list (failed CMS read) is served but not cached', async () => {
  const handler = createFeedHandler({ getSiteTitle: ok('The Triangle'), getRecentArticles: () => Promise.resolve([]) });
  assert.equal((await handler()).headers.get('Cache-Control'), 'no-store');
});

// --- /random ---------------------------------------------------------------

test('random route does not log the full article', () => {
  const source = readFileSync(new URL('../src/pages/random.astro', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /console\.(log|info|debug)\s*\(/);
});
