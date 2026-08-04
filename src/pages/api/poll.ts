import type { APIRoute } from 'astro';
import { getPollCounts, incrementPollCount, type VoteFailure } from '../../utils/pollStore';

export const prerender = false;

// The browser renders `error` verbatim, so these are reader-facing sentences,
// not diagnostics. `reason` is echoed alongside for the client to branch on.
const VOTE_FAILURES: Record<VoteFailure, { status: number; error: string }> = {
  'invalid-option': { status: 400, error: 'That option is no longer on the ballot.' },
  'poll-closed': { status: 409, error: 'This poll has closed.' },
  'rate-limited': { status: 429, error: 'Too many votes right now. Try again in a minute.' },
  unavailable: { status: 502, error: "Couldn't record your vote. Try again in a moment." }
};

export const GET: APIRoute = async () => {
  return new Response(JSON.stringify({ counts: await getPollCounts() }), {
    headers: { 'Content-Type': 'application/json' }
  });
};

export const POST: APIRoute = async ({ request, clientAddress }) => {
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

    const result = await incrementPollCount(option, clientAddress);
    if (!result.ok) {
      const { status, error } = VOTE_FAILURES[result.reason];
      return new Response(JSON.stringify({ error, reason: result.reason }), {
        status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ counts: result.counts }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch {
    const { status, error } = VOTE_FAILURES.unavailable;
    return new Response(JSON.stringify({ error, reason: 'unavailable' }), {
      status,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
