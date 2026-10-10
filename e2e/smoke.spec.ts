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

test('no horizontal overflow on the homepage', async ({ page }) => {
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
