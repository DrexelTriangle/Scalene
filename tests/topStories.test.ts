import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTopStoriesStore,
  fetchTopArticleSlugs,
  slugsFromPaths,
  TOP_STORIES_TTL_MS,
  TOP_STORIES_WINDOW_MS,
} from '../src/utils/topStories.ts';
import type { Article } from '../src/utils/types.ts';

const article = (slug: string) =>
  ({ slug, title: slug, date: '2026-10-20', authors: [], featured_image: '', content: '<p>long</p>', categories_list: [] }) as unknown as Article;

const graphql = (paths: string[]) => ({
  data: { viewer: { zones: [{ httpRequestsAdaptiveGroups: paths.map((p, i) => ({ count: 100 - i, dimensions: { clientRequestPath: p } })) }] } },
  errors: null,
});

test('slugsFromPaths keeps article slugs in rank order, once each', () => {
  assert.deepEqual(
    slugsFromPaths(['/article/a', '/article/b/', '/article/A', '/news/x', '/article/c/extra', '/article/', '/article/d']),
    ['a', 'b', 'd'],
  );
});

test('fetchTopArticleSlugs sends the window and token and reads the ranking', async () => {
  let sent: { url: string; init: RequestInit } | undefined;
  const now = Date.parse('2026-10-25T12:00:00Z');
  const slugs = await fetchTopArticleSlugs({
    token: 'tok',
    zoneId: 'zone',
    now: () => now,
    fetch: (async (url: string, init: RequestInit) => {
      sent = { url, init };
      return new Response(JSON.stringify(graphql(['/article/one', '/article/two'])));
    }) as typeof fetch,
  });
  assert.deepEqual(slugs, ['one', 'two']);
  assert.equal((sent!.init.headers as Record<string, string>).Authorization, 'Bearer tok');
  const { variables } = JSON.parse(String(sent!.init.body));
  assert.equal(variables.zone, 'zone');
  assert.equal(variables.until, '2026-10-25T12:00:00.000Z');
  assert.equal(Date.parse(variables.until) - Date.parse(variables.since), TOP_STORIES_WINDOW_MS);
});

test('fetchTopArticleSlugs throws on an HTTP error or a GraphQL error', async () => {
  const respond = (body: unknown, status = 200) =>
    (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  await assert.rejects(fetchTopArticleSlugs({ token: 't', zoneId: 'z', fetch: respond({}, 403) }), /403/);
  await assert.rejects(
    fetchTopArticleSlugs({ token: 't', zoneId: 'z', fetch: respond({ data: null, errors: [{ message: 'not authorized' }] }) }),
    /not authorized/,
  );
  await assert.rejects(fetchTopArticleSlugs({ token: 't', zoneId: 'z', fetch: respond({ data: { viewer: { zones: [] } } }) }), /no zone data/);
});

test('the store resolves slugs through the CMS, drops misses, trims to count and strips bodies', async () => {
  const store = createTopStoriesStore({
    count: 2,
    loadSlugs: async () => ['gone', 'a', 'b', 'c'],
    getArticle: async (slug) => (slug === 'gone' ? undefined : article(slug)),
  });
  const cards = await store.get();
  assert.deepEqual(cards.map((c) => c.slug), ['a', 'b']);
  assert.equal('content' in cards[0], false);
});

test('the store caches for the TTL and never caches an empty list', async () => {
  let clock = 1_000_000;
  let loads = 0;
  let cmsUp = false;
  const errors: unknown[] = [];
  const store = createTopStoriesStore({
    count: 4,
    now: () => clock,
    onError: (err) => errors.push(err),
    loadSlugs: async () => {
      loads++;
      return ['a'];
    },
    getArticle: async (slug) => (cmsUp ? article(slug) : undefined),
  });

  assert.deepEqual(await store.get(), []);
  assert.equal(errors.length, 1);

  cmsUp = true;
  clock += 10 * 60 * 1000; // past the error backoff
  assert.deepEqual((await store.get()).map((c) => c.slug), ['a']);
  assert.equal(loads, 2);

  clock += TOP_STORIES_TTL_MS - 1;
  await store.get();
  assert.equal(loads, 2);
});

test('the store serves [] when Cloudflare fails and nothing good is cached', async () => {
  const store = createTopStoriesStore({
    count: 4,
    onError: () => {},
    loadSlugs: async () => {
      throw new Error('Cloudflare analytics 500');
    },
    getArticle: async (slug) => article(slug),
  });
  assert.deepEqual(await store.get(), []);
});
