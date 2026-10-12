import test from 'node:test';
import assert from 'node:assert/strict';
import { recordCmsTiming, withCmsServerTiming } from '../src/utils/cmsTiming.ts';
import { createCmsClient } from '../src/utils/cmsFetch.ts';

const tick = (ms = 0) => new Promise((resolve) => setTimeout(resolve, ms));

test('CMS calls made while handling a request come back as Server-Timing', async () => {
  const response = await withCmsServerTiming(async () => {
    recordCmsTiming('article', 41.24);
    recordCmsTiming('article_comments', 12);
    recordCmsTiming('article_comments', 3);
    return new Response('ok');
  });
  assert.equal(
    response.headers.get('server-timing'),
    'cms_article;dur=41.2, cms_article_comments;dur=15.0;desc="2 calls"',
  );
});

test('a request that made no CMS calls gets no header', async () => {
  const response = await withCmsServerTiming(async () => new Response('ok'));
  assert.equal(response.headers.get('server-timing'), null);
});

test('recording outside any request is a no-op', () => {
  assert.doesNotThrow(() => recordCmsTiming('article', 5));
});

test('concurrent requests never see each other\'s timings', async () => {
  const handle = (endpoint: string, wait: number) =>
    withCmsServerTiming(async () => {
      await tick(wait);
      recordCmsTiming(endpoint, wait);
      await tick(wait);
      return new Response(endpoint);
    });

  const [a, b, c] = await Promise.all([handle('homepage', 15), handle('article', 5), handle('search', 10)]);
  assert.equal(a.headers.get('server-timing'), 'cms_homepage;dur=15.0');
  assert.equal(b.headers.get('server-timing'), 'cms_article;dur=5.0');
  assert.equal(c.headers.get('server-timing'), 'cms_search;dur=10.0');
});

test('a deduplicated CMS call is reported to each request that waited on it', async () => {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  let fetches = 0;
  const cms = createCmsClient({
    baseUrl: 'https://cms.test/v1',
    log: () => {},
    onTiming: recordCmsTiming,
    fetch: (async () => {
      fetches++;
      await gate;
      return new Response('{}');
    }) as typeof fetch,
  });
  const handle = () =>
    withCmsServerTiming(async () => {
      await cms.getJson({ endpoint: 'taxonomy', path: ['taxonomy'] });
      return new Response('ok');
    });

  const pending = [handle(), handle()];
  await tick();
  release();
  const responses = await Promise.all(pending);
  assert.equal(fetches, 1);
  for (const response of responses) {
    assert.match(response.headers.get('server-timing') ?? '', /^cms_taxonomy;dur=\d+\.\d$/);
  }
});

test('a nested pass (a rewrite re-running middleware) joins the outer scope; one header', async () => {
  const response = await withCmsServerTiming(async () => {
    recordCmsTiming('article', 4);
    const inner = await withCmsServerTiming(async () => {
      recordCmsTiming('search', 6);
      return new Response('404 page');
    });
    assert.equal(inner.headers.get('server-timing'), null);
    return inner;
  });
  assert.equal(response.headers.get('server-timing'), 'cms_article;dur=4.0, cms_search;dur=6.0');
});

test('a response with immutable headers is passed through untouched', async () => {
  const redirect = Response.redirect('https://www.thetriangle.org/', 301);
  const response = await withCmsServerTiming(async () => {
    recordCmsTiming('article', 1);
    return redirect;
  });
  assert.equal(response, redirect);
  assert.equal(response.status, 301);
});

test('labels are bounded: a hostile one cannot inject into the header, and endpoints are capped', async () => {
  const response = await withCmsServerTiming(async () => {
    recordCmsTiming('x;dur=0, evil="1"', 2);
    for (let i = 0; i < 50; i++) recordCmsTiming(`e${i}`, 1);
    return new Response('ok');
  });
  const header = response.headers.get('server-timing') ?? '';
  assert.match(header, /^cms_other;dur=2\.0, /);
  assert.doesNotMatch(header, /evil/);
  assert.equal(header.split(', ').length, 12);
});
