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
// Add an entry only where the destination genuinely holds the content, and only
// where the slug has no taxonomy row of its own. A row is always the better
// answer: it gives the category its own page instead of pointing at a section
// that merely contains it.
//
// If a slug here is ever given a real taxonomy row, remove it from this map.
// The redirect runs ahead of routing, so it shadows the new page completely --
// which is what happened to /podcasts. The CMS gave Podcasts a subsection row
// with 75 articles, and this map went on sending every request for it to
// /columns -- 784 of them in the ten days of logs that were retained when this
// entry was added, none of them from a link on the site.
//
// Empty is the healthy state. Every WordPress sub-category the migration left
// behind now has a row.
export const LEGACY_SECTION_SLUGS: Record<string, string> = {};
