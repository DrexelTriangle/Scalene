import type { APIRoute } from 'astro';

export const prerender = false;

const cmsBaseUrl = String(import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1').replace(/\/$/, '');
// The CMS refuses anything else too; checking here keeps junk off it.
const FILE_RE = /^(targets|allowed-[2-6]|SCOWL-Copyright)\.txt$/;

// Wordangle's word lists live only in the CMS, which embeds them; the game
// loads them through here.
export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? '';
  if (!FILE_RE.test(file)) return new Response('Not found', { status: 404 });

  try {
    const response = await fetch(`${cmsBaseUrl}/wordangle/lists/${file}`, {
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) return new Response('Word list unavailable', { status: 502 });
    return new Response(await response.text(), {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': response.headers.get('Cache-Control') ?? 'public, max-age=3600'
      }
    });
  } catch {
    return new Response('Word list unavailable', { status: 502 });
  }
};
