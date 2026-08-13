// Server-side cache of the CMS taxonomy, used to answer two routing questions
// the site cannot answer on its own: what a root-level slug is, and where an
// article's category label should link.
//
// Without it the only way to tell /politics (a subsection) from /news (a
// section) is to call the section endpoint and see it fail, which costs every
// subsection page a wasted CMS round trip and puts a permanent error floor
// under the production metrics -- around 1000 failed requests a day, enough to
// make the error-rate panel useless for alerting. Unknown slugs are worse:
// /sw.js and every other stray root path cost two failures before reaching 404.
//
// Like weatherStore, this module is shared across requests because the node
// adapter runs a single long-lived process.

import { getTaxonomy } from './db';
import type { TaxonomyItem } from './types';

/** The taxonomy changes when an editor adds a section, which is rare. */
const CACHE_TTL_MS = 5 * 60 * 1000;
/** After a failure with nothing to serve, retry sooner. */
const ERROR_BACKOFF_MS = 30 * 1000;
/** Keep serving a stale taxonomy this long if the CMS is down. */
const STALE_MAX_MS = 60 * 60 * 1000;

/**
 * What a root-level slug turned out to be.
 *
 * `unknown` means the CMS answered and the slug is in neither list, so the
 * caller can go straight to 404 without touching the CMS again. `unavailable`
 * means we could not find out -- distinct from `unknown`, because sending every
 * section page to 404 during a CMS blip would be far worse than the wasted
 * round trip this module exists to remove.
 */
export type SlugKind = 'section' | 'subsection' | 'unknown' | 'unavailable';

type SlugKinds = Map<string, 'section' | 'subsection'>;

/**
 * Category title (lowercased) -> the routable slug that owns it.
 *
 * Article pages label themselves with the raw category the import gave them, so
 * this is what turns that label into a link that goes somewhere. Two things put
 * a title here, and the order between them matters.
 *
 * A row's OWN title comes first. An alias is second, and only fills a title no
 * row claims: aliases exist so a section can absorb a category that has no page
 * of its own ("Arts & Entertainment" -> /entertainment), so an alias must never
 * outrank that category once it does have a page. Sports still aliases "Men's
 * Lacrosse", and there is now a Men's Lacrosse subsection; the label belongs to
 * the subsection.
 *
 * This is the same precedence the CMS applies when it answers the same question
 * (RefreshCategoryAliases in triangle-cms), and matching it is the point -- the
 * CMS sends a resolved slug on every category, and the two must agree about
 * what that slug should be. Indexing aliases alone got it backwards silently,
 * because /sports is a real page that really does list the article, so the
 * wrong link looked exactly like the right one.
 */
type CategoryOwners = Map<string, string>;

type Taxonomy = {
  kinds: SlugKinds;
  owners: CategoryOwners;
};

type CacheEntry = {
  /** null when the last attempt failed and we have nothing to serve. */
  taxonomy: Taxonomy | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
/** Dedupes concurrent misses so a burst of traffic makes one upstream call. */
let inFlight: Promise<CacheEntry> | null = null;

function indexTaxonomy(items: TaxonomyItem[]): Taxonomy {
  const kinds: SlugKinds = new Map();
  const owners: CategoryOwners = new Map();
  const aliased: CategoryOwners = new Map();

  for (const item of items) {
    if (item?.type !== 'section' && item?.type !== 'subsection') continue;
    if (typeof item.slug !== 'string' || !item.slug) continue;

    // Sections win a collision, matching the order the old probe tried them in.
    if (!(item.type === 'subsection' && kinds.has(item.slug))) {
      kinds.set(item.slug, item.type);
    }

    if (typeof item.canonical_title === 'string') {
      const title = item.canonical_title.trim().toLowerCase();
      // First writer wins within a tier, so a title two rows share cannot make
      // the resolved slug depend on the order the CMS listed them in.
      if (title && !owners.has(title)) owners.set(title, item.slug);
    }

    for (const alias of item.category_aliases ?? []) {
      if (typeof alias !== 'string') continue;
      const key = alias.trim().toLowerCase();
      if (key && !aliased.has(key)) aliased.set(key, item.slug);
    }
  }

  // Aliases fill only the titles no row claims as its own.
  for (const [title, slug] of aliased) {
    if (!owners.has(title)) owners.set(title, slug);
  }

  return { kinds, owners };
}

async function fetchTaxonomy(): Promise<Taxonomy | null> {
  try {
    const items = await getTaxonomy();
    if (!items) {
      console.error('Taxonomy: CMS did not return a usable /v1/taxonomy payload.');
      return null;
    }

    const taxonomy = indexTaxonomy(items);
    if (taxonomy.kinds.size === 0) {
      // A CMS that answers with no sections at all is a broken CMS, not a site
      // with no sections. Treat it as a failure so routing falls back to
      // probing rather than 404ing every section page.
      console.error('Taxonomy: /v1/taxonomy held no sections or subsections.');
      return null;
    }

    return taxonomy;
  } catch (err) {
    console.error('Taxonomy: fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function isFresh(entry: CacheEntry, now: number): boolean {
  const ttl = entry.taxonomy === null ? ERROR_BACKOFF_MS : CACHE_TTL_MS;
  return now - entry.fetchedAt < ttl;
}

async function loadTaxonomy(): Promise<Taxonomy | null> {
  const now = Date.now();

  if (cache && isFresh(cache, now)) {
    return cache.taxonomy;
  }

  if (!inFlight) {
    inFlight = fetchTaxonomy()
      .then((taxonomy) => {
        // If this attempt failed but we still hold a recent-enough taxonomy,
        // keep using it. A stale taxonomy is very likely still correct, and it
        // beats routing on guesses.
        if (taxonomy === null && cache?.taxonomy && now - cache.fetchedAt < STALE_MAX_MS) {
          return { taxonomy: cache.taxonomy, fetchedAt: now };
        }
        return { taxonomy, fetchedAt: now };
      })
      .then((entry) => {
        cache = entry;
        return entry;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  const entry = await inFlight;
  return entry.taxonomy;
}

/**
 * Classify a root-level slug. Never throws; returns 'unavailable' when the
 * taxonomy could not be read, which callers should treat as "find out the
 * expensive way" rather than "not found".
 *
 * Matching is exact, which is what the article endpoints do too -- /News does
 * not resolve to the News section here or in the CMS.
 */
export async function getSlugKind(slug: string): Promise<SlugKind> {
  if (!slug) return 'unknown';

  const taxonomy = await loadTaxonomy();
  if (!taxonomy) return 'unavailable';

  return taxonomy.kinds.get(slug) ?? 'unknown';
}

/** The `{ name, slug }` shape every CMS payload uses for an article category. */
type ArticleCategory = { name?: string; slug?: string };

/**
 * Where an article's category label should link, or null if nowhere.
 *
 * An article carries whatever category WordPress gave it, and most of those are
 * not pages. 273 articles name a primary category that is not a section or a
 * subsection -- `wrestling` (103), `triangle-talks` (72), `theater` (25),
 * `sjn-grant` (9) -- and the kicker above their headline used to link to it
 * regardless, so every one of those articles shipped a link to a 404.
 *
 * Resolution order: the slug itself if it is routable, then the category title
 * against the taxonomy's owner map ("Podcasts" -> /podcasts, and
 * "Arts & Entertainment" -> /entertainment, which has no page of its own).
 * Null means the caller should render the label as plain text rather than a
 * dead link.
 */
export async function getCategoryHref(category: ArticleCategory | undefined): Promise<string | null> {
  if (!category) return null;

  const taxonomy = await loadTaxonomy();
  // With no taxonomy to check against, keep the old behaviour and link to the
  // slug: a link that might 404 beats dropping every category link site-wide
  // for as long as the CMS is unreachable.
  if (!taxonomy) return category.slug ? `/${category.slug}` : null;

  if (category.slug && taxonomy.kinds.has(category.slug)) return `/${category.slug}`;

  const owner = category.name && taxonomy.owners.get(category.name.trim().toLowerCase());
  return owner ? `/${owner}` : null;
}
