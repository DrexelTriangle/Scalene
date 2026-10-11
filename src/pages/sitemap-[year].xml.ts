import type { APIRoute } from "astro";
import { createYearSitemapHandler } from "../utils/sitemap";
import { sitemapSlugStore } from "../utils/sitemapSlugs";

export const GET: APIRoute = createYearSitemapHandler(sitemapSlugStore);
