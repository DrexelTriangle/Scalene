// Server-side cache for the Visual Crossing current-conditions lookup.
//
// The Weather component renders with `server:defer`, so without this every
// page view would fire its own upstream request and burn the API key's daily
// record budget (which is what took the widget offline: the API starts
// returning 429 "Maximum daily cost exceeded" for the rest of the day).
//
// This module is shared across requests because the node adapter runs a
// single long-lived process, so the cache below holds for the whole server
// -- roughly one upstream call per hour no matter how much traffic arrives.

const CACHE_TTL_MS = 60 * 60 * 1000; // one hour; matches the widget's freshness needs
const ERROR_BACKOFF_MS = 5 * 60 * 1000; // after a failure with nothing to serve, retry sooner
const STALE_MAX_MS = 6 * 60 * 60 * 1000; // keep serving a stale reading this long if the API is down
const FETCH_TIMEOUT_MS = 5000; // never let a slow upstream hold a page render open

const ENDPOINT =
  'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/Philadelphia';

type CacheEntry = {
  /** Formatted label, or null when the last attempt failed and we have nothing. */
  label: string | null;
  fetchedAt: number;
};

let cache: CacheEntry | null = null;
/** Dedupes concurrent misses so a burst of traffic makes one upstream call. */
let inFlight: Promise<CacheEntry> | null = null;

function celsiusToLabel(celsius: number): string {
  return `Philadelphia: ${Math.round(celsius * 9 / 5 + 32)}°F`;
}

async function fetchLabel(): Promise<string | null> {
  const key = import.meta.env.WEATHER_API_KEY;
  if (!key) {
    console.error('Weather: WEATHER_API_KEY is not set; skipping fetch.');
    return null;
  }

  const url = `${ENDPOINT}?unitGroup=metric&include=current&key=${encodeURIComponent(key)}&contentType=json`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS)
    });

    if (!response.ok) {
      // The body carries the useful reason (quota vs. bad key); it is short.
      const detail = await response.text().catch(() => '');
      console.error(`Weather: API returned ${response.status}: ${detail.slice(0, 200)}`);
      return null;
    }

    if (!(response.headers.get('content-type') || '').includes('json')) {
      console.error('Weather: API returned a non-JSON body.');
      return null;
    }

    const data = await response.json();
    const temp = data?.currentConditions?.temp;
    if (typeof temp !== 'number' || Number.isNaN(temp)) {
      console.error('Weather: API response had no usable currentConditions.temp.');
      return null;
    }

    return celsiusToLabel(temp);
  } catch (err) {
    console.error('Weather: fetch failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

function isFresh(entry: CacheEntry, now: number): boolean {
  // A failed lookup is retried on the shorter backoff so an outage recovers
  // quickly, but still cannot turn every page view into an upstream call.
  const ttl = entry.label === null ? ERROR_BACKOFF_MS : CACHE_TTL_MS;
  return now - entry.fetchedAt < ttl;
}

/**
 * Returns the formatted temperature label, or an empty string when no reading
 * is available. Never throws and never blocks longer than FETCH_TIMEOUT_MS.
 */
export async function getWeatherLabel(): Promise<string> {
  const now = Date.now();

  if (cache && isFresh(cache, now)) {
    return cache.label ?? '';
  }

  if (!inFlight) {
    inFlight = fetchLabel()
      .then((label) => {
        // If this attempt failed but we still hold a recent-enough reading,
        // keep showing it rather than blanking the widget over a blip.
        if (label === null && cache?.label && now - cache.fetchedAt < STALE_MAX_MS) {
          return { label: cache.label, fetchedAt: now };
        }
        return { label, fetchedAt: now };
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
  return entry.label ?? '';
}
