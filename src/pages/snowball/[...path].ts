export const prerender = false;
import type { APIRoute } from "astro";

// The Snowball long-form stories (2014-2017), served from a preserved copy at
// their original addresses, /snowball/<slug>/.
//
// Snowball was a WordPress plugin that laid each story out as its own page:
// full-bleed photo splashes, custom typography, hand-built HTML sections. It
// is gone from WordPress, and files.thetriangle.org, where most story images
// lived, no longer resolves. Each story was rebuilt from the Wayback Machine's
// copy of the page as it ran, with its assets recovered from the archive and
// CephFS (see triangle-infrastructure docs/legacy-content-recovery.md), and
// stored on CephFS under wp-content/snowball/<slug>/. Converting them into
// ordinary articles would have kept the words and lost the design.
//
// Pages reference their assets relatively (assets/...), so the trailing slash
// on the story URL is load-bearing: /snowball/wasted redirects to
// /snowball/wasted/ so that "assets/x.jpg" resolves under the story.
//
// MEDIA_BASE_URL is the same origin the /proxy route reads; like there, it is
// substituted at build time.
const mediaBaseUrl = String(
  import.meta.env.MEDIA_BASE_URL ?? "https://cms.thetriangle.org",
).replace(/\/$/, "");

export const GET: APIRoute = async ({ params, request, redirect }) => {
  const path = params.path ?? "";
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0 || segments.some((s) => s === ".." || s === ".")) {
    return new Response(null, { status: 404 });
  }

  const { pathname } = new URL(request.url);
  const isStoryRoot = segments.length === 1;
  if (isStoryRoot && !pathname.endsWith("/")) {
    return redirect(`/snowball/${segments[0]}/`, 301);
  }

  const file = isStoryRoot ? `${segments[0]}/index.html` : segments.join("/");
  try {
    const res = await fetch(`${mediaBaseUrl}/wp-content/snowball/${file}`, {
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) {
      return new Response(null, { status: res.status === 404 ? 404 : 502 });
    }
    const contentType = res.headers.get("content-type") || "application/octet-stream";
    return new Response(Buffer.from(await res.arrayBuffer()), {
      headers: {
        "Content-Type": contentType,
        // An archive does not change; let the edge keep it.
        "Cache-Control": "public, max-age=86400",
      },
    });
  } catch (err) {
    console.error(err);
    return new Response("Snowball archive unavailable", { status: 502 });
  }
};
