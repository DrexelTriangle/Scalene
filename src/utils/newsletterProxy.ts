// Newsletter links readers see in their inbox -- the unsubscribe page, "view
// online", click-tracking redirects -- say www.thetriangle.org/newsletter/...
// rather than the CMS's host. This forwards them to the CMS's /v1/newsletter,
// which serves the pages (with relative links and form actions, so they work
// under either prefix). Only those public paths are forwarded; nothing else
// under /v1 is reachable through here.
//
// The inbox's one-click unsubscribe (List-Unsubscribe) still goes straight to
// the CMS, so it never depends on this hop.

export interface ProxyNewsletterOptions {
  /** CMS_API_BASE_URL, e.g. https://cms.thetriangle.org/v1 */
  cmsBaseUrl: string;
  /** The path after /newsletter/, e.g. "unsubscribe" or "c/<token>/12". */
  path: string | undefined;
  search: string;
  method: string;
  requestHeaders: Headers;
  /** The form body of a POST (the unsubscribe page's button). */
  body?: string;
  clientAddress?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const TOKEN = '[A-Za-z0-9_-]{1,128}';
const ROUTES: Array<{ pattern: RegExp; methods: string[] }> = [
  { pattern: /^unsubscribe$/, methods: ['GET', 'HEAD', 'POST'] },
  { pattern: /^resubscribe$/, methods: ['POST'] },
  { pattern: /^issues\/(?:\d{1,12}|latest)$/, methods: ['GET', 'HEAD'] },
  { pattern: new RegExp(`^c/${TOKEN}/\\d{1,12}$`), methods: ['GET', 'HEAD'] },
  { pattern: new RegExp(`^o/${TOKEN}$`), methods: ['GET', 'HEAD'] },
];

// Response headers worth passing on: the page and its security policy, the
// click redirect's target, and the no-store that keeps per-reader pages out of
// Cloudflare and the browser cache.
const PASSED_HEADERS = [
  'content-type',
  'cache-control',
  'location',
  'content-security-policy',
  'referrer-policy',
  'x-content-type-options',
  'x-robots-tag',
];

/** The upstream URL for a request, or null if the path isn't forwarded. */
export function newsletterUpstreamUrl(cmsBaseUrl: string, path: string | undefined, method: string, search: string): string | null {
  const clean = (path ?? '').replace(/\/+$/, '');
  const route = ROUTES.find((r) => r.pattern.test(clean));
  if (!route || !route.methods.includes(method)) return null;
  return `${cmsBaseUrl.replace(/\/+$/, '')}/newsletter/${clean}${search}`;
}

export async function proxyNewsletter({
  cmsBaseUrl,
  path,
  search,
  method,
  requestHeaders,
  body,
  clientAddress,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: ProxyNewsletterOptions): Promise<Response> {
  const upstream = newsletterUpstreamUrl(cmsBaseUrl, path, method, search);
  if (!upstream) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });

  const headers: Record<string, string> = { Accept: requestHeaders.get('accept') ?? '*/*' };
  if (clientAddress) headers['X-Forwarded-For'] = clientAddress;
  const userAgent = requestHeaders.get('user-agent');
  if (userAgent) headers['User-Agent'] = userAgent;
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

  let response: Response;
  try {
    response = await fetchImpl(upstream, {
      method,
      headers,
      body: method === 'POST' ? (body ?? '').slice(0, 1024) : undefined,
      // A click redirect goes to the reader, not followed here.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return new Response('The newsletter service is unavailable. Please try again in a minute.', {
      status: 502,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const out = new Headers();
  for (const name of PASSED_HEADERS) {
    const value = response.headers.get(name);
    if (value) out.set(name, value);
  }
  if (!out.has('cache-control')) out.set('Cache-Control', 'no-store');
  return new Response(method === 'HEAD' ? null : response.body, { status: response.status, headers: out });
}
