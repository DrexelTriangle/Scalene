import { test, expect, type Page } from '@playwright/test';
import { activeAds } from '../src/utils/ads.ts';

// Smoke tests: the pages that matter render from CMS data, the direct-sold ads
// that should be running are on the page, client-side navigation works, and
// nothing throws. They run against e2e/stub-cms.mjs fixtures, so they are
// deterministic and never touch production.

const SECTIONS = ['news', 'opinion', 'sports', 'entertainment'];

/** Block everything that isn't the local site/stub (ads, analytics, fonts, CDNs). */
async function isolate(page: Page) {
  await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
}

/** Collect real page errors; ignore failures of the external requests we aborted. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (/ERR_FAILED|ERR_BLOCKED|net::|Failed to load resource|adsbygoogle|flytedesk|matomo/i.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

async function articleLinks(page: Page) {
  const hrefs = await page.locator('main a[href^="/"]').evaluateAll((as) =>
    as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
  );
  return [...new Set(hrefs)].filter((h) =>
    /^\/[a-z0-9-]+\/[a-z0-9-]+\/?$/.test(h) && !/^\/(proxy|author|api|wp-content)\//.test(h),
  );
}

test.beforeEach(async ({ page }) => {
  await isolate(page);
});

test('homepage renders sections, articles and the running ads', async ({ page }) => {
  const errors = watchErrors(page);
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);

  for (const label of ['News', 'Opinion', 'Sports', 'Entertainment']) {
    await expect(page.getByRole('link', { name: label, exact: true }).first()).toBeAttached();
  }
  expect((await articleLinks(page)).length).toBeGreaterThanOrEqual(10);

  // Direct-sold ads are date-driven; whatever src/utils/ads.ts says is running
  // today must actually be on the page (this is how the 9/22 ad break shipped).
  const banner = activeAds('homepage-banner');
  await expect(page.locator('.ad-slot-homepage-banner img.ad')).toHaveCount(banner.length);
  const sidebar = activeAds('sidebar');
  if (sidebar.length) await expect(page.locator('.ad-slot-sidebar img.ad').first()).toBeAttached();

  expect(errors).toEqual([]);
});

for (const section of SECTIONS) {
  test(`section page /${section} lists articles`, async ({ page }) => {
    const errors = watchErrors(page);
    const res = await page.goto(`/${section}`);
    expect(res?.status()).toBe(200);
    expect((await articleLinks(page)).length).toBeGreaterThanOrEqual(5);
    expect(errors).toEqual([]);
  });
}

test('article page renders title, byline and body', async ({ page }) => {
  await page.goto('/news');
  const [first] = await articleLinks(page);
  expect(first, 'no article link on /news').toBeTruthy();

  const errors = watchErrors(page);
  const res = await page.goto(first);
  expect(res?.status()).toBe(200);
  await expect(page.locator('h1').first()).not.toBeEmpty();
  const bodyText = await page.locator('main').innerText();
  expect(bodyText.length).toBeGreaterThan(300);
  expect(errors).toEqual([]);
});

// Cloudflare holds an article page for 30 days, so the parts of it that change
// on their own load as server islands after the page. This checks the long
// header on the page, a short one on each island, that the islands' content
// arrives, and that their scripts bind to content inserted after load.
test('article page loads its changing parts as short-cached islands', async ({ page }) => {
  const slug = 'netanyahu-s-un-visit-sparks-nyc-protests'; // has a comments fixture
  const islands: { url: string; status: number; cacheControl: string }[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/_server-islands/')) {
      islands.push({ url: r.url(), status: r.status(), cacheControl: r.headers()['cache-control'] ?? '' });
    }
  });
  const errors = watchErrors(page);

  const res = await page.goto(`/article/${slug}`);
  expect(res?.status()).toBe(200);
  expect(res?.headers()['cache-control']).toBe('public, max-age=60, s-maxage=2592000');

  // Inserted by the islands, not present in the page HTML itself.
  await expect(page.locator('[data-comment-form]')).toHaveCount(1);
  await expect(page.locator('[data-poll-root]')).toHaveCount(1);
  // Polls.astro marks its root once its submit handler is bound: proof the
  // island's script ran against content that arrived after load.
  await expect(page.locator('[data-poll-root]')).toHaveAttribute('data-bound', '1');

  const names = islands.map((i) => new URL(i.url).pathname.split('/').pop()).sort();
  expect(names).toEqual(
    expect.arrayContaining(['ArticleCommentsIsland', 'PollIsland', 'RelatedArticlesIsland', 'SidebarAdIsland', 'Weather']),
  );
  for (const island of islands) {
    expect(island.status, island.url).toBe(200);
    expect(island.cacheControl, island.url).toMatch(/^public, max-age=0, s-maxage=\d{2,4}$/);
  }
  expect(errors).toEqual([]);
});

// The homepage is cached at the edge for a day and purged by its Cache-Tag on
// every CMS write; what changes without a write loads as islands after it.
test('homepage is long-cached and tagged, and loads its changing parts as islands', async ({ page }) => {
  const islands: { name: string; status: number; cacheControl: string }[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/_server-islands/')) {
      islands.push({
        name: new URL(r.url()).pathname.split('/').pop() ?? '',
        status: r.status(),
        cacheControl: r.headers()['cache-control'] ?? '',
      });
    }
  });
  const errors = watchErrors(page);

  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  expect(res?.headers()['cache-control']).toBe('public, max-age=60, s-maxage=86400, stale-while-revalidate=300');
  expect(res?.headers()['cache-tag']).toBe('homepage');

  await expect(page.locator('[data-poll-root]')).toHaveAttribute('data-bound', '1');
  const names = () => [...new Set(islands.map((i) => i.name))];
  await expect.poll(names).toEqual(
    expect.arrayContaining(['HomeBannerAdIsland', 'SidebarAdIsland', 'PollIsland', 'ExhibitSpotlightIsland', 'Weather']),
  );
  for (const island of islands) {
    expect(island.status, island.name).toBe(200);
    expect(island.cacheControl, island.name).toMatch(/^public, max-age=0, s-maxage=\d{2,4}$/);
  }
  expect(errors).toEqual([]);
});

// The date is written by the browser (a server-rendered one would be up to a
// day old from the cache), and only the desktop layout shows it.
test('homepage header shows today\'s date', async ({ page, isMobile }) => {
  test.skip(isMobile, 'the date column is hidden below lg');
  await page.goto('/');
  const today = await page.evaluate(() =>
    new Date().toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
  );
  await expect(page.locator('[data-today]')).toHaveText(today);
});

// The poll is a server island, so after a ClientRouter navigation its markup
// arrives after astro:page-load. It binds because Astro inlines the island's
// script into the island response, which runs on every insertion; this pins
// that, so a change that moves the script out of the island shows up here.
test('the poll binds after a client-side navigation back to the homepage', async ({ page, isMobile }) => {
  test.skip(isMobile, 'section nav is hidden below the sm breakpoint');
  await page.goto('/');
  await expect(page.locator('[data-poll-root]')).toHaveAttribute('data-bound', '1');
  await page.getByRole('link', { name: 'Sports', exact: true }).first().click();
  await expect(page).toHaveURL(/\/sports\/?$/);
  // Back is a ClientRouter navigation too: no full page load.
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-poll-root]')).toHaveAttribute('data-bound', '1');
});

test('client-side navigation from the homepage reaches a section and back', async ({ page, isMobile }) => {
  test.skip(isMobile, 'section nav is hidden below the sm breakpoint');
  const errors = watchErrors(page);
  await page.goto('/');
  await page.getByRole('link', { name: 'Sports', exact: true }).first().click();
  await expect(page).toHaveURL(/\/sports\/?$/);
  expect((await articleLinks(page)).length).toBeGreaterThanOrEqual(5);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test('unknown article slug returns 404', async ({ page }) => {
  const res = await page.goto('/news/this-article-does-not-exist-e2e');
  expect(res?.status()).toBe(404);
});

test('static pages render', async ({ page }) => {
  for (const path of ['/about', '/contact', '/classifieds']) {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator('footer').first(), path).toBeAttached();
  }
});

test('wordangle shows top stories under the game', async ({ page }) => {
  const res = await page.goto('/wordangle');
  expect(res?.status()).toBe(200);
  await expect(page.locator('[data-wordangle="board"]')).toBeAttached();
  await expect(page.getByText('Top Stories')).toBeVisible();
  expect(await page.locator('a[href^="/article/"]').count()).toBeGreaterThan(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('no horizontal overflow on the homepage', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
