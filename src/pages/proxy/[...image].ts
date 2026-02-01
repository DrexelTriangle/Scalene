export const prerender = false;
import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ params, request }) => {
  try {
    const queryString = new URL(request.url).search; // preserves ?ver=...
    const url = `https://cms.thetriangle.org/${params.image}${queryString}`;

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
