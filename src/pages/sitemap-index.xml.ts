import type { APIRoute } from "astro";
import { getSitemapSlugs } from "../utils/db";

export const GET: APIRoute = async () => {
  const articles = await getSitemapSlugs();

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

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
     <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       ${links}
     </sitemapindex>`,
    { headers: { "Content-Type": "application/xml" } }
  );
};
