// The /proxy/[...image] route's upstream logic, kept out of the route file so
// it can be exercised against a mock fetch. Nothing in here reads
// import.meta.env -- the route resolves MEDIA_BASE_URL and passes it in.

// Long enough for a cold origin to answer, short enough that a dead one turns
// into a 504 instead of a request that hangs until the client gives up. It
// covers both attempts (the original fetch and the 404 retry) up to response
// headers only; once the body starts streaming, a large file is free to take
// as long as the client needs.
export const UPSTREAM_TIMEOUT_MS = 10_000;

// Client headers that make conditional and partial requests work end to end:
// a browser revalidating with If-None-Match gets a body-less 304, and a PDF
// viewer asking for a byte range gets a 206 instead of the whole file. Nothing
// else from the client goes upstream -- in particular no Cookie or
// Authorization, which belong to this site and not the media origin.
const FORWARDED_REQUEST_HEADERS = ["if-none-match", "if-modified-since", "range", "if-range"];

// Representation and caching headers worth passing back. Everything else the
// origin sends (Set-Cookie, Server, Connection and the other hop-by-hop
// headers, HSTS and other security policy meant for the origin's own host)
// stays behind.
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "cache-control",
  "expires",
  "etag",
  "last-modified",
];

// The subset a 304 carries: the validators and freshness a cache needs to
// refresh its stored copy, and no description of a body it does not have.
const NOT_MODIFIED_HEADERS = ["cache-control", "expires", "etag", "last-modified"];

export interface ProxyMediaOptions {
  // MEDIA_BASE_URL with no trailing slash.
  baseUrl: string;
  // The route's [...image] param.
  path: string | undefined;
  // The incoming request's query string, "?ver=..." or "".
  search: string;
  requestHeaders: Headers;
  // The incoming request's signal, so a client that hangs up stops the upstream
  // transfer too.
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const copyHeaders = (from: Headers, names: string[]): Headers => {
  const headers = new Headers();
  for (const name of names) {
    const value = from.get(name);
    if (value !== null) headers.set(name, value);
  }
  return headers;
};

// Drop a body we are not going to send, releasing the upstream connection. A
// failure to cancel changes nothing about the answer, so it is not an error.
const discard = (res: Response): Promise<void> =>
  res.body ? res.body.cancel().catch(() => {}) : Promise.resolve();

// The URL to fetch, or null if the path is outside <base>/wp-content/. new URL()
// resolves "..", "%2e%2e" and backslashes the same way fetch would, so checking
// its result (rather than the raw string) catches a path that only escapes
// after normalization. Same-origin is not enough: MEDIA_BASE_URL is a bare
// origin (the CMS host), and without the /wp-content/ scope this route would
// relay its login page, REST API and anything else it serves. Everything the
// site proxies (uploads, a couple of plugin assets, rewritten article HTML)
// lives under /wp-content/.
//
// An encoded separator is refused outright. new URL() keeps "..%2f" as one
// opaque segment, so it passes the prefix check here, but an origin that
// decodes it before normalizing would see "../" and climb out. The same goes
// for any number of extra layers ("%252f", "%25252f", "%25%32%66"), and the
// path may arrive with one layer already peeled: Astro decodeURI()s the
// pathname before building params, and passes it raw if that fails.
//
// Rather than decode until it stops changing, refuse what every extra layer
// needs. A second decode can only produce a separator if a "%" survives the
// first, and a "%" only survives as "%25" or as a stray "%" without two hex
// digits after it. So: no %2f, %5c or %25, and no stray "%". Ordinary escapes
// (%20, UTF-8 bytes) still pass, and no media file name needs any of these.
const ENCODED_SEPARATOR = /%(?:2f|5c|25|(?![0-9a-f]{2}))/i;

export const upstreamUrl = (baseUrl: string, path: string, search: string): string | null => {
  if (ENCODED_SEPARATOR.test(path)) return null;
  let scope: string;
  let url: URL;
  try {
    // Normalized the same way, so a base spelled with an uppercase host or a
    // default port still matches its own children.
    scope = new URL(`${baseUrl}/wp-content/`).href;
    url = new URL(`${baseUrl}/${path}${search}`);
  } catch {
    return null;
  }
  // Compare origin + path only, so the query string cannot satisfy the check.
  return `${url.origin}${url.pathname}`.startsWith(scope) ? url.href : null;
};

export async function proxyMedia({
  baseUrl,
  path,
  search,
  requestHeaders,
  signal,
  fetchImpl = fetch,
  timeoutMs = UPSTREAM_TIMEOUT_MS,
}: ProxyMediaOptions): Promise<Response> {
  if (!path) return new Response("Not found", { status: 404 });

  const url = upstreamUrl(baseUrl, path, search);
  if (!url) return new Response("Bad request", { status: 400 });

  const headers = copyHeaders(requestHeaders, FORWARDED_REQUEST_HEADERS);
  headers.set("User-Agent", "Mozilla/5.0");
  // fetch would otherwise ask for gzip/br and transparently decode the reply,
  // leaving the origin's Content-Length and Content-Range describing bytes we
  // never send. Asking for the identity encoding keeps them truthful.
  headers.set("Accept-Encoding", "identity");

  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), timeoutMs);
  const upstreamSignal = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  const init: RequestInit = { redirect: "follow", headers, signal: upstreamSignal };

  let res: Response;
  try {
    res = await fetchImpl(url, init);

    // A 404 here is not proof the file is missing. The media origin sits behind
    // Cloudflare and (until the nginx `always` fix ships everywhere) stamped
    // 30-day immutable Cache-Control onto its OWN 404s, so the edge pins "does
    // not exist" for a month. Every file added to the corpus after something
    // first requested it then stays invisible -- provably on disk, served fine
    // by the origin, still 404 through the edge.
    //
    // A different query string is a different cache key, so one retry with a
    // cache-buster reaches the origin and returns the real answer. Costs a
    // second upstream fetch only on 404s, and a genuinely missing file just
    // 404s twice. Retry exactly once -- never loop, or a real miss becomes a
    // hot spin against the origin.
    if (res.status === 404) {
      await discard(res);
      // `url` already carries the query string -- append to it, do not re-add it.
      const bust = new URL(url).search ? "&" : "?";
      res = await fetchImpl(`${url}${bust}cb=${Date.now()}`, init);
    }
  } catch (err) {
    if (timeout.signal.aborted) {
      return new Response("Upstream timed out", { status: 504 });
    }
    // A client that hung up is not a proxy fault and nobody reads the answer.
    if (!signal?.aborted) console.error(err);
    return new Response("Proxy error", { status: 502 });
  } finally {
    // Headers are in (or the fetch failed); from here the body streams without
    // a deadline, still cancelled if the client disconnects.
    clearTimeout(timer);
  }

  if (res.status === 304) {
    await discard(res);
    return new Response(null, {
      status: 304,
      headers: copyHeaders(res.headers, NOT_MODIFIED_HEADERS),
    });
  }

  if (!res.ok) {
    await discard(res);
    // A 416 is only useful to the client with the "bytes */<length>" telling it
    // what range it could have asked for.
    const errorHeaders = copyHeaders(res.headers, res.status === 416 ? ["content-range"] : []);
    return new Response(`Failed to fetch image: ${res.status}`, {
      status: res.status,
      headers: errorHeaders,
    });
  }

  const responseHeaders = copyHeaders(res.headers, FORWARDED_RESPONSE_HEADERS);
  if (!responseHeaders.has("content-type")) {
    responseHeaders.set("content-type", "application/octet-stream");
  }
  // An origin that compressed anyway had its body decoded by fetch, so its
  // Content-Length no longer matches what we stream.
  const encoding = res.headers.get("content-encoding");
  if (encoding && encoding.toLowerCase() !== "identity") {
    responseHeaders.delete("content-length");
  }

  return new Response(res.body, { status: res.status, headers: responseHeaders });
}
