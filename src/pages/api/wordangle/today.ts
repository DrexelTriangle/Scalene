import type { APIRoute } from 'astro';

export const prerender = false;

const cmsBaseUrl = String(import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1').replace(/\/$/, '');
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// The day's Wordangle answer from the CMS queue. The CMS serves only today and
// earlier, so this cannot be used to read ahead.
export const GET: APIRoute = async ({ url }) => {
  const date = url.searchParams.get('date') ?? '';
  if (!DATE_RE.test(date)) return json({ error: 'invalid date' }, 400);

  try {
    const response = await fetch(`${cmsBaseUrl}/wordangle/days/${date}`, {
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) return json({ error: 'no word for that day' }, response.status === 404 ? 404 : 502);
    const body = await response.json();
    if (typeof body?.word !== 'string' || typeof body?.number !== 'number') {
      return json({ error: 'no word for that day' }, 502);
    }
    return json({ date, number: body.number, word: body.word }, 200, 'public, max-age=60');
  } catch {
    return json({ error: 'could not reach the CMS' }, 502);
  }
};

function json(body: unknown, status: number, cacheControl = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': cacheControl }
  });
}
