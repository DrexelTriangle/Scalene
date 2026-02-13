import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ params }) => {
  const year = params.year;

  const res = await fetch(
    "https://cms.thetriangle.org/wp-json/triangle/v2/sitemap-slugs"
  );
  const articles = await res.json();

  const filtered = articles.filter(a =>
    new Date(a.lastmod).getFullYear().toString() === year
  );

  const urls = filtered.map(a => `
    <url>
      <loc>https://thetriangle.org/article/${a.slug}</loc>
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
