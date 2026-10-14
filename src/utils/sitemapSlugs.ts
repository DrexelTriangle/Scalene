// The one slug-list cache shared by sitemap-index.xml and sitemap-<year>.xml.
// Kept apart from utils/sitemap so that module stays free of import.meta.env.

import { getSitemapSlugs } from "./db";
import { createSitemapSlugStore } from "./sitemap";

export const sitemapSlugStore = createSitemapSlugStore({
  load: getSitemapSlugs,
  onError: (err) => console.error("Sitemap: slug list load failed:", err instanceof Error ? err.message : err),
});
