export const prerender = false;
import type { APIRoute } from 'astro';

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

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const queryString = new URL(request.url).search; // preserves ?ver=...
    const url = `${mediaBaseUrl}/${params.image}${queryString}`;

    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
    });

    if (!res.ok) {
      return new Response(`Failed to fetch image: ${res.status}`, { status: res.status });
    }

    // Forward content-type header safely
    const contentType = res.headers.get("content-type") || "application/octet-stream";

    const buffer = await res.arrayBuffer();
    return new Response(Buffer.from(buffer), {
      headers: { "Content-Type": contentType }
    });

  } catch (err) {
    console.error(err);
    return new Response("Proxy error", { status: 500 });
  }
};
