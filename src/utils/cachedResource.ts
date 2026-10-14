// In-process cache for small, shared CMS reads (site title, poll widget data).
//
// Node's fetch has no HTTP cache -- a `cache:` option on it is accepted and
// ignored -- so without this every page render re-fetches the same global data.
// This is the pattern taxonomyStore and weatherStore already use, generalized:
// the node adapter runs one long-lived process, so one cache serves all
// requests.
//
//  - A value is served from memory until ttlMs after it was loaded.
//  - Concurrent misses share one load, so a burst of traffic makes one call.
//  - A failed load serves the last good value while it is under staleMaxMs
//    old, otherwise the fallback, and the next attempt waits errorBackoffMs so
//    an outage cannot turn every page view into a CMS call.
//  - get() never rejects.

export type CachedResourceOptions<T> = {
  /** Fetch a fresh value. Throw (or reject) on any failure. */
  load: () => Promise<T>;
  ttlMs: number;
  errorBackoffMs: number;
  staleMaxMs: number;
  /** Served when a load fails and there is no recent-enough good value. */
  fallback: T;
  now?: () => number;
  onError?: (err: unknown) => void;
};

export type CachedResource<T> = {
  get(): Promise<T>;
  /** Store a value known to be current (e.g. counts a vote just returned). */
  prime(value: T): void;
};

export function createCachedResource<T>(options: CachedResourceOptions<T>): CachedResource<T> {
  const now = options.now ?? Date.now;
  const reportError = (err: unknown) => {
    try {
      options.onError?.(err);
    } catch {
      // A broken logger must not turn a handled failure into a rejection.
    }
  };

  let good: { value: T; loadedAt: number } | null = null;
  /** No load before this time; set after a failure. */
  let retryAt = 0;
  /** Bumped by prime() so a load already in flight cannot overwrite it. */
  let version = 0;
  let inFlight: Promise<T> | null = null;

  function servable(at: number): T {
    return good && at - good.loadedAt < options.staleMaxMs ? good.value : options.fallback;
  }

  async function attempt(): Promise<T> {
    const startedAt = now();
    const startedVersion = version;
    try {
      const value = await options.load();
      if (version === startedVersion) {
        good = { value, loadedAt: startedAt };
        retryAt = 0;
      }
      return value;
    } catch (err) {
      reportError(err);
      if (version === startedVersion) retryAt = startedAt + options.errorBackoffMs;
      return servable(now());
    }
  }

  return {
    get() {
      const at = now();
      if (good && at - good.loadedAt < options.ttlMs) return Promise.resolve(good.value);
      if (inFlight) return inFlight;
      if (at < retryAt) return Promise.resolve(servable(at));

      inFlight = attempt().finally(() => {
        inFlight = null;
      });
      return inFlight;
    },

    prime(value) {
      version++;
      good = { value, loadedAt: now() };
      retryAt = 0;
    },
  };
}
