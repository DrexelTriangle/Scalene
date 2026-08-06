import type { MiddlewareHandler } from "astro";
import { LEGACY_ARTICLE_SLUGS } from "./utils/legacySlugs";

// The WordPress archive and the CMS disagree on a handful of article slugs, so
// URLs Google already indexed would 404 after the cutover. A 301 hands the
// accumulated ranking to the new URL instead of dropping it.
//
// This runs ahead of the /article/[slug] route, and only fires on an exact map
// hit, so every other request costs one object lookup and nothing else.
export const onRequest: MiddlewareHandler = (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith("/article/")) return next();

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
