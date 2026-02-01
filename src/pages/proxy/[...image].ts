export const prerender = false;

import type { APIRoute, GetStaticPaths } from 'astro';

export async function GET({ params }) {
  const url = "https://cms.thetriangle.org/" + params.image;
  const res = await fetch(url);

  return new Response(await res.arrayBuffer(), {
    headers: { "Content-Type": res.headers.get("content-type") }
  });
}
