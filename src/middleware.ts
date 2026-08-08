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
export const onRequest: MiddlewareHandler = (context, next) => {
  const { pathname } = context.url;

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
