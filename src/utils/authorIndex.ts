// Server-side cache of author display names, used to answer one question the
// site cannot answer on its own: /author/<slug> named a real person, so which
// slug does the CMS actually hold them under?
//
// The import derives an author's slug from the WordPress login, and the logins
// are not consistent with the names the site links by. Four shapes are live in
// production today:
//
//   ryan-keating       -> rkeating                             (abbreviated login)
//   nayab-iqbal        -> by-nayab-iqbal                        (byline text as login)
//   sanjana-bandi-2    -> sanjana-bandi                         (WordPress duplicate suffix)
//   stefan-kusmirek    -> stefan-kusmirek-dev-thetriangle-org   (email as login)
//
// No pattern covers all four, and the next import will invent a fifth. Matching
// on the display name instead is the one thing they have in common: the CMS
// holds the right name in every case, only the slug is wrong. That also means
// this keeps working after the ETL fix lands and the slugs change.
//
// Like taxonomyStore, this module is shared across requests because the node
// adapter runs a single long-lived process.

import { getAllAuthors } from './db';

/** Authors change when someone writes their first piece. */
const CACHE_TTL_MS = 10 * 60 * 1000;
/** After a failure with nothing to serve, retry sooner. */
const ERROR_BACKOFF_MS = 30 * 1000;
/** Keep serving a stale index this long if the CMS is down. */
const STALE_MAX_MS = 60 * 60 * 1000;

/** Canonicalized display name -> the slug the CMS holds that person under. */
type NameIndex = Map<string, string>;

type CacheEntry = {
  /** null when the last attempt failed and we have nothing to serve. */
  index: NameIndex | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
/** Dedupes concurrent misses so a burst of traffic makes one upstream call. */
let inFlight: Promise<CacheEntry> | null = null;

/** The same transformation the CMS applies when it builds a slug from a name. */
function canonicalize(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function indexAuthors(authors: { slug?: string; display_name?: string }[]): NameIndex {
  const index: NameIndex = new Map();

  for (const author of authors) {
    if (typeof author?.slug !== 'string' || !author.slug) continue;
    if (typeof author.display_name !== 'string') continue;

    const key = canonicalize(author.display_name);
    // The first author to claim a name keeps it. Two people who share a display
    // name are indistinguishable from this URL, and picking the earlier record
    // at least makes the choice stable between restarts.
    if (key && !index.has(key)) index.set(key, author.slug);
  }

  return index;
}

async function fetchIndex(): Promise<NameIndex | null> {
  try {
    const authors = await getAllAuthors();
    if (!authors) {
      console.error('AuthorIndex: CMS did not return a usable /v1/authors payload.');
      return null;
    }

    const index = indexAuthors(authors);
    if (index.size === 0) {
      // A CMS with no authors at all is a broken CMS, not a paper nobody wrote
      // for. Treat it as a failure rather than caching an empty index that
      // would answer "no such person" for everyone.
      console.error('AuthorIndex: /v1/authors held no usable authors.');
      return null;
    }

    return index;
  } catch (err) {
    console.error('AuthorIndex: fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function isFresh(entry: CacheEntry, now: number): boolean {
  const ttl = entry.index === null ? ERROR_BACKOFF_MS : CACHE_TTL_MS;
  return now - entry.fetchedAt < ttl;
}

async function loadIndex(): Promise<NameIndex | null> {
  const now = Date.now();

  if (cache && isFresh(cache, now)) {
    return cache.index;
  }

  if (!inFlight) {
    inFlight = fetchIndex()
      .then((index) => {
        // A failed refresh keeps the last good index while it is recent enough.
        if (index === null && cache?.index && now - cache.fetchedAt < STALE_MAX_MS) {
          return { index: cache.index, fetchedAt: now };
        }
        return { index, fetchedAt: now };
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
  return entry.index;
}

/**
 * The slug the CMS holds for the person a URL names, or null.
 *
 * Call this only after the author lookup has already missed -- it is the
 * recovery path, and it costs several CMS round trips the first time.
 *
 * Also tries the name with a trailing WordPress duplicate suffix removed, since
 * /author/sanjana-bandi-2 names a person the CMS records once, without it.
 * Limited to one or two digits: real CMS slugs carry a numeric id suffix to
 * break collisions (erik-heyman-meltzer-870), and a broader rule would be one
 * bad import away from resolving a URL to a different person.
 *
 * Never throws, and returns null when the index could not be read, so a CMS
 * blip leaves the 404 in place rather than inventing a redirect.
 */
export async function resolveAuthorSlug(requested: string): Promise<string | null> {
  if (!requested) return null;

  const index = await loadIndex();
  if (!index) return null;

  for (const key of [requested, requested.replace(/-\d{1,2}$/, '')]) {
    const slug = index.get(canonicalize(key));
    if (slug && slug !== requested) return slug;
  }

  return null;
}
