export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyMedia } from '../../utils/mediaProxy';

// Origin that actually stores the uploads. This used to be hardcoded to the
// WordPress host; media now lives on CephFS behind the CMS host's nginx, so the
// legacy origin is being decommissioned and anything still pointing at it breaks
// when that happens. MEDIA_BASE_URL should match what the ETL canonicalized
// article image URLs to, so proxied chrome and inline article images resolve
// from the same place. The old host stays as the fallback so an unset variable
// degrades to today's behaviour rather than to a broken page.
//
// NOTE: Astro substitutes import.meta.env.* into the server bundle at BUILD
// time, so MEDIA_BASE_URL must be set in the build environment. Setting it only
// at run time leaves the fallback baked in, silently serving from the legacy
// host with no error to notice.
const mediaBaseUrl = String(
  import.meta.env.MEDIA_BASE_URL ?? "https://cms.thetriangle.org",
).replace(/\/$/, "");

// Streams the upstream body through rather than buffering it, forwards the
// conditional/range request headers and the representation/cache response
// headers, and retries a 404 once past the edge cache. See utils/mediaProxy.
export const GET: APIRoute = ({ params, request }) =>
  proxyMedia({
    baseUrl: mediaBaseUrl,
    path: params.image,
    search: new URL(request.url).search, // preserves ?ver=...
    requestHeaders: request.headers,
    signal: request.signal,
  });
