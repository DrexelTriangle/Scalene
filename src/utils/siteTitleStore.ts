// Cached CMS site title. Every layout awaits it before the first byte, so an
// uncached fetch put one CMS round trip in front of every page. The title is
// edited rarely; five minutes is how long a rename can take to show.
// No import.meta.env in here -- siteConfig passes the URL -- so tests can
// drive it with a fake fetch and clock.

import { createCachedResource } from './cachedResource.ts';

export const SITE_TITLE_TTL_MS = 5 * 60 * 1000;
const ERROR_BACKOFF_MS = 30 * 1000;
const STALE_MAX_MS = 60 * 60 * 1000;
export const DEFAULT_SITE_TITLE = 'The Triangle';

export type SiteTitleStoreOptions = {
  url: string;
  fetch: typeof fetch;
  now?: () => number;
  onError?: (err: unknown) => void;
};

export function createSiteTitleStore(options: SiteTitleStoreOptions) {
  return createCachedResource<string>({
    ttlMs: SITE_TITLE_TTL_MS,
    errorBackoffMs: ERROR_BACKOFF_MS,
    staleMaxMs: STALE_MAX_MS,
    fallback: DEFAULT_SITE_TITLE,
    now: options.now,
    onError: options.onError,
    load: async () => {
      const response = await options.fetch(options.url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`site settings returned ${response.status}`);
      const payload = (await response.json()) as { site_title?: unknown };
      const title = String(payload?.site_title ?? '').trim();
      return title || DEFAULT_SITE_TITLE;
    },
  });
}
