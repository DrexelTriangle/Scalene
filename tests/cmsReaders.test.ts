import test from 'node:test';
import assert from 'node:assert/strict';
import { createCmsClient, CmsFetchError } from '../src/utils/cmsFetch.ts';
import { createCmsReaders, SEARCH_TIMEOUT_MS, SITEMAP_TIMEOUT_MS } from '../src/utils/cmsReaders.ts';

// What each db.js reader does with each kind of answer is the contract the
// pages were written against. These pin it, so moving the readers onto
// cmsFetch changed the transport and nothing a caller can see -- apart from
// the improvements called out by name below.

const BASE = 'https://cms.test/v1';

type Reply = () => Response | Promise<Response>;

function fakeCms(routes: Record<string, Reply | Reply[]>) {
  const requests: { url: string }[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    requests.push({ url });
    const path = url.slice(BASE.length);
    const route = routes[path];
    if (!route) return new Response('not found', { status: 404 });
    const reply = Array.isArray(route) ? (route.length > 1 ? route.shift()! : route[0]) : route;
    return reply();
  }) as typeof fetch;
  const readers = createCmsReaders(createCmsClient({ baseUrl: BASE, fetch: fetchImpl, log: () => {} }));
  return { readers, requests, paths: () => requests.map((r) => r.url.slice(BASE.length)) };
}

const json = (body: unknown, status = 200): Reply => () => new Response(JSON.stringify(body), { status });
const status = (code: number): Reply => () => new Response('<h1>error</h1>', { status: code });
const malformed: Reply = () => new Response('{not json', { status: 200 });
const networkDown: Reply = () => {
  throw new TypeError('fetch failed');
};

async function rejectsWith(promise: Promise<unknown>, kind: string) {
  await assert.rejects(promise, (err: unknown) => err instanceof CmsFetchError && err.kind === kind);
}

test('getHomepageArticles: sanitized body; an error status still throws its bare status', async () => {
  const ok = fakeCms({ '/homepage': json({ featured: [{ excerpt: ' [caption id="1"]Hello[/caption]   world ' }] }) });
  assert.deepEqual(await ok.readers.getHomepageArticles(), { featured: [{ excerpt: 'Hello world' }] });

  const down = fakeCms({ '/homepage': status(502) });
  await assert.rejects(down.readers.getHomepageArticles(), (err: unknown) => err instanceof Error && err.message === '502');

  await rejectsWith(fakeCms({ '/homepage': malformed }).readers.getHomepageArticles(), 'invalid_json');
  await rejectsWith(fakeCms({ '/homepage': networkDown }).readers.getHomepageArticles(), 'network');
});

test('getArticle: undefined on an error status, normalized and sanitized on success, throws on transport failure', async () => {
  const cms = fakeCms({
    '/articles/real': json({ slug: 'real', categories: [{ name: 'News' }], related: [{ excerpt: '[gallery ids="1"] a  c' }] }),
  });
  assert.deepEqual(await cms.readers.getArticle('real'), {
    slug: 'real',
    categories: [{ name: 'News' }],
    categories_list: [{ name: 'News' }],
    related: [{ excerpt: 'a c' }],
  });
  assert.equal(await cms.readers.getArticle('missing'), undefined);
  await rejectsWith(fakeCms({ '/articles/x': networkDown }).readers.getArticle('x'), 'network');
  await rejectsWith(fakeCms({ '/articles/x': malformed }).readers.getArticle('x'), 'invalid_json');
});

test('getArticle: a slug that cannot name an article is a miss and never reaches the CMS', async () => {
  const cms = fakeCms({});
  for (const slug of ['..', '.', '']) assert.equal(await cms.readers.getArticle(slug), undefined, slug);
  assert.deepEqual(cms.paths(), []);

  // Previously "a/comments" would have asked the comments endpoint.
  await cms.readers.getArticle('a/comments');
  assert.deepEqual(cms.paths(), ['/articles/a%2Fcomments']);
});

test('getArticleComments never throws -- including on a malformed body, which it used to', async () => {
  const body = { article_slug: 'x', comments: [{ id: 1 }], total_count: 1 };
  assert.deepEqual(await fakeCms({ '/articles/x/comments': json(body) }).readers.getArticleComments('x'), body);

  const empty = { comments: [], total_count: 0 };
  for (const reply of [status(500), status(404), networkDown, malformed]) {
    assert.deepEqual(await fakeCms({ '/articles/x/comments': reply }).readers.getArticleComments('x'), empty);
  }
  assert.deepEqual(
    await fakeCms({ '/articles/x/comments': json(body) }).readers.getArticleComments('x', { signal: AbortSignal.abort() }),
    empty,
  );
});

test('listings: page -> offset, undefined on an error status, sanitized excerpts', async () => {
  const listing = { articles: [{ excerpt: '[gallery] x' }] };
  const cms = fakeCms({
    '/sections/news/articles?limit=20&offset=40': json(listing),
    '/subsections/politics/articles?limit=20&offset=0': json(listing),
    '/authors/jane/articles?limit=20&offset=0': json(listing),
  });

  assert.deepEqual(await cms.readers.getSectionArticles('news', 3), { articles: [{ excerpt: 'x' }] });
  assert.deepEqual(await cms.readers.getSubsectionArticles('politics', 'garbage'), { articles: [{ excerpt: 'x' }] });
  assert.deepEqual(await cms.readers.getAuthorArticles('jane', 0), { articles: [{ excerpt: 'x' }] });
  assert.equal(await cms.readers.getSectionArticles('politics', 1), undefined);
  assert.equal(await cms.readers.getSubsectionArticles('news', 1), undefined);
  assert.equal(await cms.readers.getAuthorArticles('nobody', 1), undefined);
  await rejectsWith(fakeCms({ '/sections/news/articles?limit=20&offset=0': networkDown }).readers.getSectionArticles('news', 1), 'network');
});

test('list readers fall back to [] on an error status or an unexpected shape', async () => {
  const cms = fakeCms({
    '/classifieds': [json({ classifieds: [{ id: 1 }] }), json({ classifieds: 'nope' }), status(500)],
    '/gallery': [json({ media: [{ id: 2 }] }), json(null), status(500)],
    '/articles?limit=5&sort_by=published_date&sort_direction=desc': [
      json({ articles: [{ excerpt: ' a ' }] }),
      json({}),
      status(500),
    ],
    '/sitemap/slugs': [json([{ slug: 's' }]), json({ slugs: [] }), status(500)],
  });

  assert.deepEqual(await cms.readers.getClassifieds(), [{ id: 1 }]);
  assert.deepEqual(await cms.readers.getClassifieds(), []);
  assert.deepEqual(await cms.readers.getClassifieds(), []);
  assert.deepEqual(await cms.readers.gallery(), [{ id: 2 }]);
  assert.deepEqual(await cms.readers.gallery(), []);
  assert.deepEqual(await cms.readers.gallery(), []);
  assert.deepEqual(await cms.readers.getRecentArticles(5), [{ excerpt: 'a' }]);
  assert.deepEqual(await cms.readers.getRecentArticles(5), []);
  assert.deepEqual(await cms.readers.getRecentArticles(5), []);
  assert.deepEqual(await cms.readers.getSitemapSlugs(), [{ slug: 's' }]);
  assert.deepEqual(await cms.readers.getSitemapSlugs(), []);
  assert.deepEqual(await cms.readers.getSitemapSlugs(), []);

  await rejectsWith(fakeCms({ '/gallery': networkDown }).readers.gallery(), 'network');
});

test('getRecentArticles defaults to 20', async () => {
  const cms = fakeCms({ '/articles?limit=20&sort_by=published_date&sort_direction=desc': json({ articles: [] }) });
  assert.deepEqual(await cms.readers.getRecentArticles(), []);
  assert.equal(cms.requests.length, 1);
});

test('getTaxonomy and getRandomArticle: undefined on an error status or wrong shape', async () => {
  const cms = fakeCms({
    '/taxonomy': [json([{ slug: 'news', type: 'section' }]), json({ items: [] }), status(503)],
    '/articles/random': [json({ slug: 'r', excerpt: 'r ' }), status(404)],
  });
  assert.deepEqual(await cms.readers.getTaxonomy(), [{ slug: 'news', type: 'section' }]);
  assert.equal(await cms.readers.getTaxonomy(), undefined);
  assert.equal(await cms.readers.getTaxonomy(), undefined);
  assert.deepEqual(await cms.readers.getRandomArticle(), { slug: 'r', excerpt: 'r' });
  assert.equal(await cms.readers.getRandomArticle(), undefined);
});

test('getAllAuthors pages until has_more is false, and any failed page means undefined', async () => {
  const page = (n: number, more: boolean) =>
    json({ authors: Array.from({ length: n }, (_, i) => ({ slug: `a${i}`, display_name: `A ${i}` })), pagination: { has_more: more } });
  const cms = fakeCms({
    '/authors?limit=200&offset=0': page(200, true),
    '/authors?limit=200&offset=200': page(3, false),
  });
  assert.equal((await cms.readers.getAllAuthors())?.length, 203);

  const broken = fakeCms({ '/authors?limit=200&offset=0': page(200, true), '/authors?limit=200&offset=200': status(500) });
  assert.equal(await broken.readers.getAllAuthors(), undefined);
  assert.equal(await fakeCms({ '/authors?limit=200&offset=0': json({ nope: 1 }) }).readers.getAllAuthors(), undefined);
});

test('search: the term is one query value -- "&" and "#" no longer cut it short', async () => {
  const cms = fakeCms({ '/search?q=fish%20%26%20chips%20%23philly': json([{ excerpt: 'x ' }]) });
  assert.deepEqual(await cms.readers.search('fish & chips #philly'), [{ excerpt: 'x' }]);
  assert.equal(await cms.readers.search('nothing'), undefined);
});

test('search and the sitemap get longer budgets than the 3s default', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const seen: AbortSignal[] = [];
  const readers = createCmsReaders(
    createCmsClient({
      baseUrl: BASE,
      log: () => {},
      fetch: ((_input: string | URL | Request, init?: RequestInit) => {
        seen.push(init!.signal!);
        return new Promise<Response>(() => {});
      }) as typeof fetch,
    }),
  );
  void readers.search('q').catch(() => {});
  void readers.getSitemapSlugs().catch(() => {});
  void readers.getTaxonomy().catch(() => {});

  t.mock.timers.tick(3000);
  assert.deepEqual(seen.map((s) => s.aborted), [false, false, true]);
  t.mock.timers.tick(SEARCH_TIMEOUT_MS - 3000);
  assert.deepEqual(seen.map((s) => s.aborted), [true, false, true]);
  t.mock.timers.tick(SITEMAP_TIMEOUT_MS - SEARCH_TIMEOUT_MS);
  assert.deepEqual(seen.map((s) => s.aborted), [true, true, true]);
});

test('concurrent readers of one article share a request, and sanitizing one copy cannot touch the other', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const cms = fakeCms({
    '/articles/a': async () => {
      await gate;
      return new Response(JSON.stringify({ slug: 'a', related: [{ excerpt: '[b]x[/b]' }] }));
    },
  });

  const both = Promise.all([cms.readers.getArticle('a'), cms.readers.getArticle('a')]);
  release();
  const [first, second] = await both;
  assert.equal(cms.requests.length, 1);
  assert.notEqual(first, second);
  assert.deepEqual(first, second);
});
