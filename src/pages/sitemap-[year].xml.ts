import type { APIRoute } from "astro";
import { getSitemapSlugs } from "../utils/db";

export const GET: APIRoute = async ({ params }) => {
  const year = params.year;

  const articles = await getSitemapSlugs();

  const filtered = articles.filter(a =>
    a.lastmod && new Date(a.lastmod).getFullYear().toString() === year
  );

  const urls = filtered.map(a => `
    <url>
      <loc>https://www.thetriangle.org/article/${a.slug}</loc>
      <lastmod>${a.lastmod}</lastmod>
    </url>
  `).join("");

  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
     <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
       ${urls}
     </urlset>`,
    { headers: { "Content-Type": "application/xml" } }
  );
};
