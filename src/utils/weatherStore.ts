// Server-side cache for the Visual Crossing current-conditions lookup.
//
// The Weather component sits in the site header, so without this every page
// view would fire its own upstream request and burn the API key's daily record
// budget (which is what took the widget offline: the API starts returning 429
// "Maximum daily cost exceeded" for the rest of the day).
//
// A server-rendered page never waits on the upstream: the component reads
// whatever the cache holds right now (peek) and kicks off a background refresh
// when the cache is due. An expired reading keeps showing while it refreshes;
// only a cold cache (just after a restart, or no good reading for six hours)
// renders without a temperature -- never a render held open on a slow API.
// Prerendered pages get the widget as a server island instead (see
// Header.astro); that request can afford to wait on a cold cache (read).
//
// This module is shared across requests because the node adapter runs a
// single long-lived process, so the cache below holds for the whole server
// -- roughly one upstream call per hour no matter how much traffic arrives.

const CACHE_TTL_MS = 60 * 60 * 1000; // one hour; matches the widget's freshness needs
const ERROR_BACKOFF_MS = 5 * 60 * 1000; // after a failure with nothing to serve, retry sooner
const STALE_MAX_MS = 6 * 60 * 60 * 1000; // keep serving a stale reading this long if the API is down
const FETCH_TIMEOUT_MS = 5000; // never let a slow upstream tie up a refresh

const ENDPOINT =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Philadelphia';

export type WeatherStoreOptions = {
  fetch: typeof fetch;
  getApiKey: () => string | undefined;
  now?: () => number;
  timeoutSignal?: (ms: number) => AbortSignal;
  logError?: (...args: unknown[]) => void;
};

export type WeatherStore = {
  /** The label to render right now, or '' when there is nothing servable. Never blocks. */
  peek(): string;
  /**
   * Fetches a new reading if the cache is due, sharing any refresh already in
   * flight. Resolves when that refresh settles; never rejects, so callers can
   * fire and forget.
   */
  refresh(): Promise<void>;
  /**
   * Like peek, but when nothing is servable it waits for a due refresh (still
   * deduped, still bounded by the timeout and the failure backoff). For the
   * server-island render, where waiting holds no page open. Never rejects.
   */
  read(): Promise<string>;
};

type Reading = { label: string; fetchedAt: number };

function celsiusToLabel(celsius: number): string {
  return `Philadelphia: ${Math.round(celsius * 9 / 5 + 32)}°F`;
}

export function createWeatherStore(options: WeatherStoreOptions): WeatherStore {
  const now = options.now ?? Date.now;
  const timeoutSignal = options.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms));
  const logError = (...args: unknown[]) => {
    try {
      (options.logError ?? console.error)(...args);
    } catch {
      // A broken logger must not turn a handled failure into a rejection.
    }
  };

  /** The last good reading, kept for STALE_MAX_MS from when it was fetched. */
  let reading: Reading | null = null;
  /** When the next upstream attempt is allowed. */
  let nextAttemptAt = 0;
  /** Dedupes concurrent refreshes so a burst of traffic makes one upstream call. */
  let inFlight: Promise<void> | null = null;

  function servable(at: number): string | null {
    return reading && at - reading.fetchedAt < STALE_MAX_MS ? reading.label : null;
  }

  async function fetchLabel(): Promise<string | null> {
    const key = options.getApiKey();
    if (!key) {
      logError('Weather: WEATHER_API_KEY is not set; skipping fetch.');
      return null;
    }

    const url = `${ENDPOINT}?unitGroup=metric&include=current&key=${encodeURIComponent(key)}&contentType=json`;

    try {
      const response = await options.fetch(url, {
        method: 'GET',
        signal: timeoutSignal(FETCH_TIMEOUT_MS),
      });

      if (!response.ok) {
        // The body carries the useful reason (quota vs. bad key); it is short.
        const detail = await response.text().catch(() => '');
        logError(`Weather: API returned ${response.status}: ${detail.slice(0, 200)}`);
        return null;
      }

      if (!(response.headers.get('content-type') || '').includes('json')) {
        logError('Weather: API returned a non-JSON body.');
        return null;
      }

      const data = await response.json();
      const temp = data?.currentConditions?.temp;
      if (typeof temp !== 'number' || Number.isNaN(temp)) {
        logError('Weather: API response had no usable currentConditions.temp.');
        return null;
      }

      return celsiusToLabel(temp);
    } catch (err) {
      logError('Weather: fetch failed:', err instanceof Error ? err.message : err);
      return null;
    }
  }

  async function attempt(): Promise<void> {
    const startedAt = now();
    let label: string | null = null;
    try {
      label = await fetchLabel();
    } catch (err) {
      logError('Weather: refresh failed:', err instanceof Error ? err.message : err);
    }

    if (label !== null) reading = { label, fetchedAt: startedAt };
    // A failed lookup that leaves nothing to show is retried on the shorter
    // backoff so an outage recovers quickly, but still cannot turn every page
    // view into an upstream call. If a recent-enough reading survives the
    // failure, keep showing it and retry on the normal cadence.
    const hasLabel = servable(startedAt) !== null;
    nextAttemptAt = startedAt + (hasLabel ? CACHE_TTL_MS : ERROR_BACKOFF_MS);
  }

  function peek(): string {
    return servable(now()) ?? '';
  }

  function refresh(): Promise<void> {
    if (inFlight) return inFlight;
    if (now() < nextAttemptAt) return Promise.resolve();

    inFlight = attempt()
      .catch(() => {})
      .finally(() => {
        inFlight = null;
      });
    return inFlight;
  }

  return {
    peek,
    refresh,
    async read() {
      const label = peek();
      if (label) {
        void refresh();
        return label;
      }
      await refresh();
      return peek();
    },
  };
}

const store = createWeatherStore({
  fetch: (input, init) => fetch(input, init),
  getApiKey: () => import.meta.env.WEATHER_API_KEY,
});

/** The label to render right now, or '' when there is nothing servable. Never blocks. */
export function peekWeatherLabel(): string {
  return store.peek();
}

/** Starts a background refresh if the cache is due. Never rejects; safe to not await. */
export function refreshWeatherLabel(): Promise<void> {
  return store.refresh();
}

/** The label, waiting for the upstream only when nothing is servable. Never rejects. */
export function readWeatherLabel(): Promise<string> {
  return store.read();
}
