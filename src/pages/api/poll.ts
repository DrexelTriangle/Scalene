import type { APIRoute } from 'astro';
import { getPollCounts, incrementPollCount } from '../../utils/pollStore';

export const prerender = false;

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ counts: getPollCounts() }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const contentType = request.headers.get('content-type') ?? '';
    let option = '';

    if (contentType.includes('application/json')) {
      const body = await request.json();
      option = typeof body?.option === 'string' ? body.option : '';
    } else {
      const formData = await request.formData();
      option = String(formData.get('poll') ?? '');
    }

    const counts = incrementPollCount(option);
    if (!counts) {
      return new Response(JSON.stringify({ error: 'Invalid poll option' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ counts }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to update poll' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
