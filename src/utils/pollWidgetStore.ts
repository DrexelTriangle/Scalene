// Cached reads for the poll widget, which renders on the home, article, section
// and author pages. Uncached, it cost three CMS calls per page view, made one
// after another.
//
// Options and title change when an editor starts a new poll: 60 seconds. Counts
// move with every vote, but a vote already returns fresh counts to the voter's
// browser (and primes this cache), so other readers seeing totals up to 15
// seconds old costs nothing.
//
// No import.meta.env in here -- pollStore passes the base URL -- so tests can
// drive it with a fake fetch and clock.

import { createCachedResource } from './cachedResource.ts';

export type PollCounts = Record<string, number>;

export const POLL_OPTIONS_TTL_MS = 60 * 1000;
export const POLL_TITLE_TTL_MS = 60 * 1000;
export const POLL_COUNTS_TTL_MS = 15 * 1000;
const ERROR_BACKOFF_MS = 10 * 1000;
// A poll that was live ten minutes ago is still the right thing to show during
// a CMS blip; much longer and a closed poll could linger.
const STALE_MAX_MS = 10 * 60 * 1000;

function coercePollCounts(value: unknown): PollCounts {
  const nextCounts: PollCounts = {};
  if (!value || typeof value !== 'object') {
    return nextCounts;
  }

  for (const [option, maybeCount] of Object.entries(value as Record<string, unknown>)) {
    const normalizedOption = option.trim();
    if (!normalizedOption) {
      continue;
    }
    if (typeof maybeCount === 'number' && Number.isFinite(maybeCount) && maybeCount >= 0) {
      nextCounts[normalizedOption] = Math.floor(maybeCount);
    }
  }

  return nextCounts;
}

export function extractCounts(payload: unknown): PollCounts {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const maybeCounts = (payload as Record<string, unknown>).counts;
  if (maybeCounts && typeof maybeCounts === 'object') {
    return coercePollCounts(maybeCounts);
  }

  return coercePollCounts(payload);
}

function extractOptions(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const value = (payload as Record<string, unknown>).options;
  if (!Array.isArray(value)) {
    return [];
  }

  const options = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return options;
}

function extractTitle(payload: unknown): string {
  const title = (payload as { title?: unknown } | null)?.title;
  return typeof title === 'string' ? title.trim() : '';
}

export type PollWidget = { options: string[]; title: string; counts: PollCounts };

export type PollWidgetStoreOptions = {
  /** CMS_API_BASE_URL with no trailing slash. */
  baseUrl: string;
  fetch: typeof fetch;
  now?: () => number;
  onError?: (err: unknown) => void;
};

export function createPollWidgetStore(options: PollWidgetStoreOptions) {
  const getJson = async (path: string): Promise<unknown> => {
    const response = await options.fetch(`${options.baseUrl}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    return response.json();
  };

  const shared = {
    errorBackoffMs: ERROR_BACKOFF_MS,
    staleMaxMs: STALE_MAX_MS,
    now: options.now,
    onError: options.onError,
  };

  const pollOptions = createCachedResource<string[]>({
    ...shared,
    ttlMs: POLL_OPTIONS_TTL_MS,
    fallback: [],
    load: async () => extractOptions(await getJson('/poll/options')),
  });
  const title = createCachedResource<string>({
    ...shared,
    ttlMs: POLL_TITLE_TTL_MS,
    fallback: '',
    load: async () => extractTitle(await getJson('/poll/title')),
  });
  const counts = createCachedResource<PollCounts>({
    ...shared,
    ttlMs: POLL_COUNTS_TTL_MS,
    fallback: {},
    load: async () => extractCounts(await getJson('/poll')),
  });

  return {
    getOptions: () => pollOptions.get(),
    getTitle: () => title.get(),
    getCounts: () => counts.get(),
    /** Counts a successful vote just returned; they are the freshest we have. */
    primeCounts: (value: PollCounts) => counts.prime(value),
    /** Everything the widget renders, fetched in parallel. Never rejects. */
    async load(): Promise<PollWidget> {
      const [o, t, c] = await Promise.all([pollOptions.get(), title.get(), counts.get()]);
      return { options: o, title: t, counts: c };
    },
  };
}
