// Cached /api/stats ("most read"). One uncached request is a Matomo range
// report over two weeks plus five CMS article reads, and the answer only moves
// over hours, so it is loaded at most once an hour per process.
// No import.meta.env in here -- the route passes getStats -- so tests can drive
// it with a fake loader and clock.

import { createCachedResource } from './cachedResource.ts';
import type { Article } from './types.ts';

export const STATS_TTL_MS = 60 * 60 * 1000;
const ERROR_BACKOFF_MS = 60 * 1000;
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
/** Browsers and the CDN may keep a good answer as long as this process does. */
export const STATS_CACHE_CONTROL = 'public, max-age=3600';

export type StatsStoreOptions = {
  load: () => Promise<Article[]>;
  now?: () => number;
  onError?: (err: unknown) => void;
};

/** get() resolves to null when there is no good list to serve. */
export function createStatsStore(options: StatsStoreOptions) {
  return createCachedResource<Article[] | null>({
    ttlMs: STATS_TTL_MS,
    errorBackoffMs: ERROR_BACKOFF_MS,
    staleMaxMs: STALE_MAX_MS,
    fallback: null,
    now: options.now,
    onError: options.onError,
    load: async () => {
      const posts = await options.load();
      // getArticle answers a CMS error with undefined, which getStats drops, so
      // an outage looks like an empty list. Never cache that for an hour.
      if (!Array.isArray(posts) || posts.length === 0) throw new Error('stats resolved no articles');
      return posts;
    },
  });
}

export function createStatsHandler(store: { get(): Promise<Article[] | null> }) {
  return async () => {
    const posts = await store.get();
    if (!posts) {
      // Generic on purpose: the underlying error can carry Matomo's response.
      return new Response(JSON.stringify({ error: 'Failed to load stats' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
      });
    }
    return new Response(JSON.stringify(posts), {
      headers: { 'Content-Type': 'application/json', 'Cache-Control': STATS_CACHE_CONTROL },
    });
  };
}
