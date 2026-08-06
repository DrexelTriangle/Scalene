import type { APIRoute } from "astro";
import { getRecentArticles } from "../utils/db";
import { getSiteTitle } from "../utils/siteConfig";

// The feed is built from the CMS listing rather than proxied from WordPress's
// /feed, so there is no foreign markup to rewrite: links are constructed at
// this site's own /article/<slug> to begin with.

const SITE_URL = "https://www.thetriangle.org";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export const GET: APIRoute = async () => {
  const [siteTitle, articles] = await Promise.all([getSiteTitle(), getRecentArticles(20)]);

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

  const feed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteTitle)}</title>
    <link>${SITE_URL}</link>
    <description>Drexel University's independent student newspaper.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/feed" rel="self" type="application/rss+xml" />${items}
  </channel>
</rss>`;

  return new Response(feed, { headers: { "Content-Type": "application/xml" } });
};
