// Root-level WordPress category archives that no longer exist, mapped to the
// page that absorbed them.
//
// WordPress gave every category an archive at /<slug>/, so URLs like /podcasts
// are in Google's index and on paper the newsroom handed out. The migration
// folded some of those categories into a section instead of giving them a row
// in site_taxonomy, and the CMS only routes slugs that have one -- so the URL
// 404s with nothing to say where its content went.
//
// This is the section-level counterpart to LEGACY_ARTICLE_SLUGS, which only
// covers /article/*. Kept in a separate module deliberately: that map is
// regenerated wholesale after every reseed, and a hand-maintained entry living
// in it would be silently overwritten.
//
// Add an entry only where the destination genuinely holds the content. The CMS
// records this relationship itself as a `category_aliases` entry on the owning
// section -- "Podcasts" is listed on Columns -- so that is the source to check
// before adding a row here.
//
// If a slug here is ever given a real taxonomy row, remove it from this map:
// the redirect runs ahead of routing and would shadow the new page.
export const LEGACY_SECTION_SLUGS: Record<string, string> = {
  // Columns carries "Podcasts" in its category_aliases. 784 requests over the
  // ten days of retained logs, and nothing on the site links it -- this is
  // entirely inbound from the WordPress era.
  podcasts: "/columns",
};
