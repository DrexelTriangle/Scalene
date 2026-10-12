// The one way this site reads JSON from the CMS's public API.
//
// Every read used to be its own bare fetch(): no timeout, so a CMS that
// accepted the connection and then stalled held the page render open
// indefinitely; slugs and search terms concatenated straight into the URL, so
// a "/" or "#" in one changed which endpoint was asked; and no record of how
// long anything took. This gives them one shape:
//
//  - URLs are built from path segments and query values under CMS_API_BASE_URL
//    and checked to still be under it. A segment cannot add a path level or a
//    query, and a dot segment is refused rather than sent.
//  - A total time budget (default 3s) covers connect, headers and body, and a
//    caller's AbortSignal cancels on top of that.
//  - Failures are classified -- timeout, aborted, network, http, invalid_json,
//    invalid_path, config -- into a CmsFetchError whose message carries only
//    the endpoint label and the class. Never the URL (it holds slugs and search
//    terms), never the response body.
//  - Identical GETs in flight at the same moment share one upstream request.
//    That is all it shares: the entry is dropped the moment the request
//    settles, so nothing here can serve an editor's change late. Each caller
//    parses its own copy of the body, so one caller mutating the result
//    (sanitizeExcerpts does) cannot reach another.
//  - No retries. A CMS that is failing is the last thing to send more load to,
//    and a retry would break the time budget a page render is counting on.
//
// Timing goes two places: a bounded journald line for failures and slow
// successes, and the request-scoped Server-Timing collector in cmsTiming.ts.

export type CmsFailureKind =
  | 'timeout'
  | 'aborted'
  | 'network'
  | 'http'
  | 'invalid_json'
  | 'invalid_path'
  | 'config';

export type CmsOutcome = 'ok' | CmsFailureKind;

export class CmsFetchError extends Error {
  readonly kind: CmsFailureKind;
  readonly endpoint: string;
  readonly status: number | undefined;
  /** A system error code such as ECONNREFUSED, when the platform gave one. */
  readonly code: string | undefined;

  constructor(kind: CmsFailureKind, endpoint: string, details: { status?: number; code?: string } = {}) {
    const status = details.status === undefined ? '' : ` (HTTP ${details.status})`;
    super(`CMS ${endpoint} request failed: ${kind}${status}`);
    this.name = 'CmsFetchError';
    this.kind = kind;
    this.endpoint = endpoint;
    this.status = details.status;
    this.code = details.code;
  }
}

export function isCmsFetchError(err: unknown): err is CmsFetchError {
  return err instanceof CmsFetchError;
}

/**
 * The CMS answered "no such thing", or the request named something that cannot
 * exist. Readers that used to return a fallback on a non-2xx status return it
 * for both: a slug of ".." is as missing as one the CMS has never heard of.
 */
export function isCmsMiss(err: unknown): err is CmsFetchError {
  return isCmsFetchError(err) && (err.kind === 'http' || err.kind === 'invalid_path');
}

export type CmsFetchLogRecord = {
  msg: 'cms_fetch';
  endpoint: string;
  outcome: CmsOutcome;
  status?: number;
  code?: string;
  duration_ms: number;
  deduplicated: boolean;
  /** Lines dropped by the rate limit since the last one written. */
  suppressed?: number;
};

export type CmsTimingSink = (endpoint: string, durationMs: number) => void;

export type CmsClientOptions = {
  baseUrl: string;
  fetch?: typeof fetch;
  /** Milliseconds; used for durations and the log rate limit. */
  now?: () => number;
  log?: (record: CmsFetchLogRecord) => void;
  /** Receives every request's duration, whatever the outcome. */
  onTiming?: CmsTimingSink;
  timeoutMs?: number;
  /** Successes at least this slow are logged. */
  slowMs?: number;
  /** Log lines allowed per minute; the rest are counted, not written. */
  logLinesPerMinute?: number;
};

export type CmsGetOptions = {
  /** Low-cardinality label for logs and Server-Timing, e.g. "article". */
  endpoint: string;
  /** Path below the base URL, one entry per segment. Each is escaped. */
  path: ReadonlyArray<string | number>;
  query?: Readonly<Record<string, string | number>>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type CmsClient = {
  getJson<T = unknown>(options: CmsGetOptions): Promise<T>;
  /** Exposed for tests; throws CmsFetchError('invalid_path' | 'config'). */
  buildUrl(endpoint: string, path: CmsGetOptions['path'], query?: CmsGetOptions['query']): URL;
};

export const DEFAULT_CMS_TIMEOUT_MS = 3000;
export const DEFAULT_CMS_SLOW_MS = 1000;
export const DEFAULT_CMS_LOG_LINES_PER_MINUTE = 60;

const ENDPOINT_LABEL = /^[a-z][a-z0-9_]{0,39}$/;
const ERROR_CODE = /^[A-Z][A-Z0-9_]{1,39}$/;

/** A label that is safe to log and to put in a header, whatever was passed. */
export function endpointLabel(endpoint: string): string {
  return ENDPOINT_LABEL.test(endpoint) ? endpoint : 'other';
}

// WHATWG URL parsing treats these as "." and ".." however they are spelled,
// and there is no escaping that makes them anything else.
const DOT_SEGMENT = /^(?:\.|%2e){1,2}$/i;

function encodeSegment(segment: string): string | undefined {
  if (segment === '' || DOT_SEGMENT.test(segment)) return undefined;
  // Only the characters that would change the URL's structure. Everything else
  // -- spaces, non-ASCII, a %XX escape a slug already carries -- goes through
  // exactly as it did when the slug was concatenated in, so what reaches the
  // CMS is unchanged for every slug that worked before.
  return segment.replace(/[/?#\\]/g, (c) => encodeURIComponent(c));
}

function errorCode(err: unknown): string | undefined {
  const cause = (err as { cause?: { code?: unknown } } | undefined)?.cause;
  const code = cause?.code ?? (err as { code?: unknown } | undefined)?.code;
  return typeof code === 'string' && ERROR_CODE.test(code) ? code : undefined;
}

type InFlight = {
  promise: Promise<string>;
  controller: AbortController;
  waiters: WaiterGroup;
  settled: boolean;
};

/**
 * The callers waiting on one shared request. The count decides whether a
 * caller cancelling also cancels the upstream request, so each caller has to
 * leave exactly once -- whether it aborts, the request settles, or both happen
 * in either order. join() hands each caller its own leave(), and only its
 * first call counts.
 *
 * Exported, with awaitShared, so tests can check that invariant directly; the
 * client's own map and controllers stay private.
 */
export type WaiterGroup = {
  readonly count: number;
  /** `abandoning`: this caller gave up, rather than got its answer. */
  join(): (abandoning: boolean) => void;
};

export function createWaiterGroup(onAbandoned: () => void): WaiterGroup {
  let count = 0;
  return {
    get count() {
      return count;
    },
    join() {
      count++;
      let left = false;
      return (abandoning) => {
        if (left) return;
        left = true;
        count--;
        if (abandoning && count === 0) onAbandoned();
      };
    },
  };
}

/** The shared result, or this caller's own cancellation, whichever is first. */
export function awaitShared<T>(
  shared: Promise<T>,
  waiters: WaiterGroup,
  signal: AbortSignal | undefined,
  abortError: () => Error,
): Promise<T> {
  const leave = waiters.join();
  if (!signal) return shared.finally(() => leave(false));

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      leave(true);
      reject(abortError());
    };
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        leave(false);
        resolve(value);
      },
      (err) => {
        signal.removeEventListener('abort', onAbort);
        leave(false);
        reject(err);
      },
    );
  });
}

export function createCmsClient(options: CmsClientOptions): CmsClient {
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const now = options.now ?? (() => performance.now());
  const log = options.log ?? defaultLog;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_CMS_TIMEOUT_MS;
  const slowMs = options.slowMs ?? DEFAULT_CMS_SLOW_MS;
  const linesPerMinute = options.logLinesPerMinute ?? DEFAULT_CMS_LOG_LINES_PER_MINUTE;

  let base: URL | undefined;
  try {
    base = new URL(String(options.baseUrl).replace(/\/+$/, ''));
    base.search = '';
    base.hash = '';
  } catch {
    base = undefined;
  }
  const basePath = base ? base.pathname.replace(/\/+$/, '') : '';

  const inFlight = new Map<string, InFlight>();

  let windowStart = -Infinity;
  let linesInWindow = 0;
  let suppressed = 0;

  function writeLog(record: CmsFetchLogRecord) {
    const at = now();
    if (at - windowStart >= 60_000) {
      windowStart = at;
      linesInWindow = 0;
    }
    if (linesInWindow >= linesPerMinute) {
      suppressed++;
      return;
    }
    linesInWindow++;
    if (suppressed > 0) {
      record.suppressed = suppressed;
      suppressed = 0;
    }
    try {
      log(record);
    } catch {
      // A broken logger must not turn a served page into an error.
    }
  }

  function report(endpoint: string, outcome: CmsOutcome, startedAt: number, deduplicated: boolean, err?: CmsFetchError) {
    const durationMs = Math.max(0, now() - startedAt);
    try {
      options.onTiming?.(endpoint, durationMs);
    } catch {
      // Same as the logger.
    }

    // A caller cancelling is the caller's decision, a 404 is the CMS's normal
    // answer for a dead slug -- bots ask for thousands of them -- and an
    // invalid path never reached the CMS at all. None of them says anything
    // about the CMS's health, and all would crowd the lines that do out of
    // the rate limit.
    if (outcome === 'aborted' || outcome === 'invalid_path' || (outcome === 'http' && err?.status === 404)) return;
    if (outcome === 'ok' && durationMs < slowMs) return;

    const record: CmsFetchLogRecord = {
      msg: 'cms_fetch',
      endpoint,
      outcome,
      duration_ms: Math.round(durationMs),
      deduplicated,
    };
    if (err?.status !== undefined) record.status = err.status;
    if (err?.code !== undefined) record.code = err.code;
    writeLog(record);
  }

  function buildUrl(endpoint: string, path: CmsGetOptions['path'], query?: CmsGetOptions['query']): URL {
    if (!base) throw new CmsFetchError('config', endpoint);

    const segments: string[] = [];
    for (const raw of path) {
      const segment = encodeSegment(String(raw));
      if (segment === undefined) throw new CmsFetchError('invalid_path', endpoint);
      segments.push(segment);
    }
    if (segments.length === 0) throw new CmsFetchError('invalid_path', endpoint);

    const search = Object.entries(query ?? {})
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
      .join('&');

    let url: URL;
    try {
      url = new URL(`${base.origin}${basePath}/${segments.join('/')}${search ? `?${search}` : ''}`);
    } catch {
      throw new CmsFetchError('invalid_path', endpoint);
    }
    // The escaping above should make this impossible; it is the guarantee, not
    // the mechanism.
    if (url.origin !== base.origin || !url.pathname.startsWith(`${basePath}/`) || url.hash) {
      throw new CmsFetchError('invalid_path', endpoint);
    }
    return url;
  }

  function start(key: string, url: URL, endpoint: string, timeoutMs: number): InFlight {
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, timeoutMs);

    // Registered before the request starts, so even a fetch that throws
    // synchronously finds its entry to remove.
    const entry: InFlight = {
      controller,
      settled: false,
      promise: Promise.resolve(''),
      // The last caller still waiting has gone, so nobody wants the answer:
      // stop the upstream request rather than let it finish into the void.
      waiters: createWaiterGroup(() => {
        if (entry.settled) return;
        if (inFlight.get(key) === entry) inFlight.delete(key);
        controller.abort();
      }),
    };
    inFlight.set(key, entry);

    entry.promise = (async () => {
      try {
        const res = await fetchImpl(url.href, {
          method: 'GET',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) {
          // Not read: an error page is no use here, and must not be logged.
          res.body?.cancel().catch(() => {});
          throw new CmsFetchError('http', endpoint, { status: res.status });
        }
        // Inside the same budget as the headers: a body that trickles in is
        // as stuck as one that never starts.
        return await res.text();
      } catch (err) {
        if (isCmsFetchError(err)) throw err;
        if (timedOut) throw new CmsFetchError('timeout', endpoint);
        if (controller.signal.aborted) throw new CmsFetchError('aborted', endpoint);
        throw new CmsFetchError('network', endpoint, { code: errorCode(err) });
      } finally {
        clearTimeout(timer);
        entry.settled = true;
        if (inFlight.get(key) === entry) inFlight.delete(key);
      }
    })();
    // Every waiter may have walked away; the rejection is still handled.
    entry.promise.catch(() => {});
    return entry;
  }

  async function getJson<T>(request: CmsGetOptions): Promise<T> {
    const endpoint = endpointLabel(request.endpoint);
    const startedAt = now();
    let deduplicated = false;

    try {
      const url = buildUrl(endpoint, request.path, request.query);
      if (request.signal?.aborted) throw new CmsFetchError('aborted', endpoint);

      const timeoutMs = request.timeoutMs ?? defaultTimeoutMs;
      // The budget is part of the key: a caller allowed 10s must not inherit
      // the 3s one a concurrent caller started with.
      const key = `${timeoutMs} ${url.href}`;
      let entry = inFlight.get(key);
      deduplicated = entry !== undefined;
      entry ??= start(key, url, endpoint, timeoutMs);

      const text = await awaitShared(entry.promise, entry.waiters, request.signal, () => new CmsFetchError('aborted', endpoint));
      let data: T;
      try {
        data = JSON.parse(text) as T;
      } catch {
        // The SyntaxError quotes the body; this deliberately does not.
        throw new CmsFetchError('invalid_json', endpoint);
      }
      report(endpoint, 'ok', startedAt, deduplicated);
      return data;
    } catch (err) {
      const failure = isCmsFetchError(err) ? err : new CmsFetchError('network', endpoint);
      report(endpoint, failure.kind, startedAt, deduplicated, failure);
      throw failure;
    }
  }

  return { getJson, buildUrl };
}

function defaultLog(record: CmsFetchLogRecord) {
  // One JSON object per line, which journald keeps whole and `jq` can read.
  const line = JSON.stringify(record);
  if (record.outcome === 'ok') console.log(line);
  else console.warn(line);
}
