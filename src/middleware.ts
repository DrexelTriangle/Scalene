import type { MiddlewareHandler } from "astro";
import { LEGACY_ARTICLE_SLUGS } from "./utils/legacySlugs";
import { LEGACY_SECTION_SLUGS } from "./utils/legacySections";

// The WordPress archive and the CMS disagree on a handful of URLs, so addresses
// Google already indexed would 404 after the cutover. A 301 hands the
// accumulated ranking to the new URL instead of dropping it.
//
// Two maps, because the two cases have nothing to do with each other: renamed
// article slugs under /article/, and root-level category archives that were
// folded into a section. Both only fire on an exact hit, so every other request
// costs one or two object lookups and nothing else.
// WordPress published a feed under every archive and every post -- /news/feed,
// /tag/phillies/feed, /<post-slug>/feed, plus the /atom and .xml spellings of
// each. Those are subscriptions: a reader's aggregator polls the URL forever and
// silently drops the paper when it starts 404ing. This site has one feed, so
// they all land there rather than nowhere. 131 requests over the ten days of
// retained logs, all of which previously 301'd to /article/feed and 404'd.
const FEED_SEGMENTS = new Set([
  "feed",
  "atom",
  "rss",
  "feed.xml",
  "atom.xml",
  "rss.xml",
  "index.xml",
]);

// Asset requests for a site that no longer serves them: sw.js and
// the sitemap spellings WordPress used and this site does not serve. Answered
// here so they stop at the edge -- [sectionSlug] otherwise asks the CMS about
// each one twice, once as a section and once as a subsection.
//
// Only genuinely dead paths belong here, and "dead" has to be checked against
// the built site rather than assumed from the logs. /sw.js, /workbox-<hash>.js
// and /manifest.webmanifest look like the same kind of WordPress leftover and
// are not: they are this site's own PWA output, the manifest is referenced from
// every page's <link rel="manifest">, and listing them here would be a 404 for
// the service worker and the install manifest the moment a request reached
// middleware ahead of static file serving.
//
// Which is also why this is an explicit list and not a general "has a file
// extension" test: robots.txt, ads.txt, favicon.ico and the rest of public/ are
// real files, and /sitemap-index.xml and /sitemap-<year>.xml are real routes.
const DEAD_ASSETS = new Set([
  "/sitemap.xml",
  "/sitemap_index.xml",
]);

export const onRequest: MiddlewareHandler = (context, next) => {
  const { pathname } = context.url;

  // /feed is itself a real route and must not be folded into itself.
  const last = pathname.split("/").filter(Boolean).at(-1)?.toLowerCase();
  if (last && FEED_SEGMENTS.has(last) && pathname !== "/feed") {
    return context.redirect("/feed", 301);
  }

  if (DEAD_ASSETS.has(pathname)) {
    return new Response(null, { status: 404 });
  }

  if (!pathname.startsWith("/article/")) {
    // A dead category archive. Checked before the catch-all route sees it,
    // which is also what keeps these off the CMS: an unrouted root path
    // otherwise reaches [sectionSlug] and asks the taxonomy about it.
    const section = pathname.slice(1).replace(/\/+$/, "").toLowerCase();
    const sectionTarget = section ? LEGACY_SECTION_SLUGS[section] : undefined;
    if (sectionTarget) return context.redirect(sectionTarget, 301);

    return next();
  }

  const slug = pathname.slice("/article/".length).replace(/\/+$/, "");
  // A malformed escape ("%zz") throws rather than returning the input, and a
  // bad URL should fall through to the normal 404, not crash the request.
  let decoded = slug;
  try {
    decoded = decodeURIComponent(slug);
  } catch {
    /* keep the raw form */
  }

  const target = LEGACY_ARTICLE_SLUGS[slug] ?? LEGACY_ARTICLE_SLUGS[decoded];
  if (!target || target === slug) return next();

  return context.redirect(`/article/${target}`, 301);
};
