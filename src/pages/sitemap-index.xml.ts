import type { APIRoute } from "astro";
import { createSitemapIndexHandler } from "../utils/sitemap";
import { sitemapSlugStore } from "../utils/sitemapSlugs";

export const GET: APIRoute = createSitemapIndexHandler(sitemapSlugStore);
