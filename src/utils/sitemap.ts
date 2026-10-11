// Year-partitioned sitemaps. Both routes bucket the CMS's full, unpaginated
// slug list -- the index by year, each year sitemap by filtering it -- so a
// crawler walking the index used to pull the whole list once per year. One
// cached list now serves every sitemap route for an hour.
// No import.meta.env in here -- utils/sitemapSlugs passes getSitemapSlugs -- so
// tests can drive it with a fake loader and clock.

import { createCachedResource } from './cachedResource.ts';
import type { SitemapSlug } from './types.ts';

export const SITEMAP_TTL_MS = 60 * 60 * 1000;
const ERROR_BACKOFF_MS = 60 * 1000;
const STALE_MAX_MS = 24 * 60 * 60 * 1000;
export const SITEMAP_CACHE_CONTROL = 'public, max-age=3600';

export type SitemapSlugStoreOptions = {
  load: () => Promise<SitemapSlug[]>;
  now?: () => number;
  onError?: (err: unknown) => void;
};

export function createSitemapSlugStore(options: SitemapSlugStoreOptions) {
  return createCachedResource<SitemapSlug[]>({
    ttlMs: SITEMAP_TTL_MS,
    errorBackoffMs: ERROR_BACKOFF_MS,
    staleMaxMs: STALE_MAX_MS,
    // Same empty sitemap a CMS error rendered before there was a cache.
    fallback: [],
    now: options.now,
    onError: options.onError,
    load: async () => {
      const slugs = await options.load();
      // getSitemapSlugs answers a CMS error status with [], and the live site
      // always has articles, so empty means a failed read -- not worth an hour.
      if (!Array.isArray(slugs) || slugs.length === 0) throw new Error('sitemap slug list is empty');
      return slugs;
    },
  });
}

export function renderSitemapIndex(articles: SitemapSlug[]): string {
  const groups: Record<string, { lastmod: string }> = {};

  for (const a of articles) {
    if (!a.lastmod) continue;
    const year = new Date(a.lastmod).getFullYear().toString();

    if (!groups[year]) {
      groups[year] = { lastmod: a.lastmod };
    } else if (new Date(a.lastmod) > new Date(groups[year].lastmod)) {
      groups[year].lastmod = a.lastmod;
    }
  }

  const links = Object.entries(groups).map(([year, data]) => `
    <sitemap>
      <loc>https://www.thetriangle.org/sitemap-${year}.xml</loc>
      <lastmod>${data.lastmod}</lastmod>
    </sitemap>
  `).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
     <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       ${links}
     </sitemapindex>`;
}

export function renderYearSitemap(articles: SitemapSlug[], year: string | undefined): string {
  const filtered = articles.filter(a =>
    a.lastmod && new Date(a.lastmod).getFullYear().toString() === year
  );

  const urls = filtered.map(a => `
    <url>
      <loc>https://www.thetriangle.org/article/${a.slug}</loc>
      <lastmod>${a.lastmod}</lastmod>
    </url>
  `).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
     <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       ${urls}
     </urlset>`;
}

type SlugSource = { get(): Promise<SitemapSlug[]> };

function xmlResponse(xml: string, articles: SitemapSlug[]): Response {
  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml",
      // An empty list is the fallback for a failed read; don't let a CDN pin it.
      "Cache-Control": articles.length > 0 ? SITEMAP_CACHE_CONTROL : "no-store",
    },
  });
}

export function createSitemapIndexHandler(store: SlugSource) {
  return async () => {
    const articles = await store.get();
    return xmlResponse(renderSitemapIndex(articles), articles);
  };
}

export function createYearSitemapHandler(store: SlugSource) {
  return async ({ params }: { params: { year?: string } }) => {
    const articles = await store.get();
    return xmlResponse(renderYearSitemap(articles, params.year), articles);
  };
}
