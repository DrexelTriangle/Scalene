// The RSS feed. Built from the CMS listing rather than proxied from WordPress's
// /feed, so there is no foreign markup to rewrite: links are constructed at
// this site's own /article/<slug> to begin with.
// No import.meta.env in here -- pages/feed.ts passes the data sources -- so
// tests can drive it with fakes.

import type { ArticleSummary } from "./types.ts";

const SITE_URL = "https://www.thetriangle.org";
/** Aggregators poll; five minutes in a browser, ten at the CDN. */
export const FEED_CACHE_CONTROL = "public, max-age=300, s-maxage=600";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export function renderFeed(siteTitle: string, articles: ArticleSummary[]): string {
  const items = articles
    .map((article) => {
      const url = `${SITE_URL}/article/${article.slug}`;
      const rawDate = article.published_date ?? article.date;
      const published = rawDate ? new Date(rawDate) : null;
      const pubDate = published && !Number.isNaN(published.valueOf())
        ? `<pubDate>${published.toUTCString()}</pubDate>`
        : "";
      const categories = (article.categories ?? article.categories_list ?? [])
        .map((category) => `<category>${escapeXml(category.name)}</category>`)
        .join("");

      return `
    <item>
      <title>${escapeXml(article.title ?? "")}</title>
      <link>${escapeXml(url)}</link>
      <guid isPermaLink="true">${escapeXml(url)}</guid>
      ${pubDate}
      <description>${escapeXml(article.excerpt ?? "")}</description>
      ${categories}
    </item>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${SITE_URL}</link>
    <description>Drexel University's independent student newspaper.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/feed" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;
}

export type FeedSources = {
  getSiteTitle: () => Promise<string>;
  getRecentArticles: (limit: number) => Promise<ArticleSummary[]>;
};

export function createFeedHandler(sources: FeedSources) {
  return async () => {
    // Independent reads: neither waits on the other.
    const [siteTitle, articles] = await Promise.all([sources.getSiteTitle(), sources.getRecentArticles(20)]);
    return new Response(renderFeed(siteTitle, articles), {
      headers: {
        "Content-Type": "application/xml",
        // getRecentArticles answers a CMS error with [], so an empty feed is a
        // failed read; serve it but don't let a CDN hold it.
        "Cache-Control": articles.length > 0 ? FEED_CACHE_CONTROL : "no-store",
      },
    });
  };
}
