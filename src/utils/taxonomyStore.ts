// Server-side cache of the CMS taxonomy, used to route a root-level slug to
// the right article endpoint.
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

type CacheEntry = {
  /** null when the last attempt failed and we have nothing to serve. */
  kinds: SlugKinds | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
/** Dedupes concurrent misses so a burst of traffic makes one upstream call. */
let inFlight: Promise<CacheEntry> | null = null;

function indexBySlug(items: TaxonomyItem[]): SlugKinds {
  const kinds: SlugKinds = new Map();

  for (const item of items) {
    if (item?.type !== 'section' && item?.type !== 'subsection') continue;
    if (typeof item.slug !== 'string' || !item.slug) continue;
    // Sections win a collision, matching the order the old probe tried them in.
    if (item.type === 'subsection' && kinds.has(item.slug)) continue;
    kinds.set(item.slug, item.type);
  }

  return kinds;
}

async function fetchKinds(): Promise<SlugKinds | null> {
  try {
    const items = await getTaxonomy();
    if (!items) {
      console.error('Taxonomy: CMS did not return a usable /v1/taxonomy payload.');
      return null;
    }

    const kinds = indexBySlug(items);
    if (kinds.size === 0) {
      // A CMS that answers with no sections at all is a broken CMS, not a site
      // with no sections. Treat it as a failure so routing falls back to
      // probing rather than 404ing every section page.
      console.error('Taxonomy: /v1/taxonomy held no sections or subsections.');
      return null;
    }

    return kinds;
  } catch (err) {
    console.error('Taxonomy: fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function isFresh(entry: CacheEntry, now: number): boolean {
  const ttl = entry.kinds === null ? ERROR_BACKOFF_MS : CACHE_TTL_MS;
  return now - entry.fetchedAt < ttl;
}

async function loadKinds(): Promise<SlugKinds | null> {
  const now = Date.now();

  if (cache && isFresh(cache, now)) {
    return cache.kinds;
  }

  if (!inFlight) {
    inFlight = fetchKinds()
      .then((kinds) => {
        // If this attempt failed but we still hold a recent-enough taxonomy,
        // keep using it. A stale taxonomy is very likely still correct, and it
        // beats routing on guesses.
        if (kinds === null && cache?.kinds && now - cache.fetchedAt < STALE_MAX_MS) {
          return { kinds: cache.kinds, fetchedAt: now };
        }
        return { kinds, fetchedAt: now };
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
  return entry.kinds;
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

  const kinds = await loadKinds();
  if (!kinds) return 'unavailable';

  return kinds.get(slug) ?? 'unknown';
}
