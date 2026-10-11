import { createPollWidgetStore, extractCounts, type PollCounts, type PollWidget } from './pollWidgetStore';

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1';
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, '');
const pollUrl = `${normalizedCmsBaseUrl}/poll`;
const pollsUrl = `${normalizedCmsBaseUrl}/polls`;

// The live poll's options, title and counts, cached in-process. See
// utils/pollWidgetStore for the TTLs.
const widgetStore = createPollWidgetStore({
  baseUrl: normalizedCmsBaseUrl,
  fetch: (input, init) => fetch(input, init),
  onError: (err) => console.error('Poll: CMS fetch failed:', err instanceof Error ? err.message : err),
});

export type ArchivedPollOption = {
  option: string;
  votes: number;
  percentage: number;
};

export type ArchivedPoll = {
  id: number;
  question: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalVotes: number;
  options: ArchivedPollOption[];
};

async function fetchCms(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const response = await fetch(url, init);
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

export function getPollOptions(): Promise<string[]> {
  return widgetStore.getOptions();
}

export function getPollTitle(): Promise<string> {
  return widgetStore.getTitle();
}

export function getPollCounts(): Promise<PollCounts> {
  return widgetStore.getCounts();
}

/** Options, title and counts for the widget, fetched in parallel. Never rejects. */
export function getPollWidget(): Promise<PollWidget> {
  return widgetStore.load();
}

function coerceArchivedPoll(value: unknown): ArchivedPoll | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const raw = value as Record<string, unknown>;
  const id = typeof raw.id === 'number' ? raw.id : Number(raw.id);
  const question = typeof raw.question === 'string' ? raw.question.trim() : '';
  if (!Number.isFinite(id) || !question) {
    return null;
  }

  const rawOptions = Array.isArray(raw.options) ? raw.options : [];
  const options: ArchivedPollOption[] = [];
  for (const entry of rawOptions) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const opt = entry as Record<string, unknown>;
    const label = typeof opt.option === 'string' ? opt.option.trim() : '';
    if (!label) {
      continue;
    }
    const votes = Number(opt.votes);
    const percentage = Number(opt.percentage);
    options.push({
      option: label,
      votes: Number.isFinite(votes) && votes >= 0 ? Math.floor(votes) : 0,
      percentage: Number.isFinite(percentage) && percentage >= 0 ? percentage : 0
    });
  }

  const totalVotes = Number(raw.total_votes);

  return {
    id,
    question,
    status: typeof raw.status === 'string' ? raw.status : '',
    startsAt: typeof raw.starts_at === 'string' ? raw.starts_at : '',
    endsAt: typeof raw.ends_at === 'string' ? raw.ends_at : '',
    totalVotes: Number.isFinite(totalVotes) && totalVotes >= 0 ? Math.floor(totalVotes) : 0,
    options
  };
}

// Published polls, newest first, for the archive page. The CMS already excludes
// drafts from this endpoint, so nothing unpublished can reach the public site.
// /v1/polls answers 50 at a time unless asked otherwise and caps a request at
// 200, so a single unparameterised fetch silently truncates the archive -- it
// returned 50 of 179 polls. Page through instead of asking for one big number,
// so the archive keeps working when it outgrows the cap too.
const POLL_PAGE_SIZE = 200;
const POLL_PAGE_LIMIT = 50;

export async function getPolls(): Promise<ArchivedPoll[]> {
  const polls: ArchivedPoll[] = [];

  for (let page = 0; page < POLL_PAGE_LIMIT; page += 1) {
    const offset = page * POLL_PAGE_SIZE;
    const response = await fetchCms(
      `${pollsUrl}?limit=${POLL_PAGE_SIZE}&offset=${offset}`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      }
    );

    // A failure part-way through would render a truncated archive as if it were
    // the whole thing, so only the first page can fall back to empty; later
    // ones keep what has already been read.
    if (!response) {
      return page === 0 ? [] : polls;
    }

    const payload = await response.json() as { polls?: unknown };
    if (!Array.isArray(payload?.polls)) {
      return page === 0 ? [] : polls;
    }

    for (const poll of payload.polls.map(coerceArchivedPoll)) {
      if (poll !== null) {
        polls.push(poll);
      }
    }

    // A short page is the last page.
    if (payload.polls.length < POLL_PAGE_SIZE) {
      break;
    }
  }

  return polls;
}

// Why this returns a reason instead of null: a vote can fail because the option
// is bogus, because the poll closed underneath the reader, because the CMS is
// rate limiting us, or because the CMS is unreachable. Collapsing all four into
// null means the reader is told "invalid option" when the truth is "try again in
// a minute", so the reason has to survive the trip back to the browser.
export type VoteFailure = 'invalid-option' | 'poll-closed' | 'rate-limited' | 'unavailable';

export type VoteResult =
  | { ok: true; counts: PollCounts }
  | { ok: false; reason: VoteFailure };

// clientAddress is the reader's IP, forwarded the same way api/comments.ts does
// it. Votes are proxied by this server, so without it every vote on the site
// reaches the CMS from one address and its per-IP rate limit (5/min) becomes a
// site-wide cap that turns away the sixth reader of every minute.
export async function incrementPollCount(option: string, clientAddress?: string): Promise<VoteResult> {
  const trimmedOption = option.trim();
  if (!trimmedOption) {
    return { ok: false, reason: 'invalid-option' };
  }

  let response: Response;
  try {
    response = await fetch(pollUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(clientAddress ? { 'X-Forwarded-For': clientAddress } : {})
      },
      body: JSON.stringify({ option: trimmedOption }),
      cache: 'no-store'
    });
  } catch {
    return { ok: false, reason: 'unavailable' };
  }

  if (!response.ok) {
    // The CMS statuses this maps: 400 invalid option, 409 no poll running or
    // poll closed, 429 rate limit, 5xx anything else.
    switch (response.status) {
      case 400:
        return { ok: false, reason: 'invalid-option' };
      case 409:
        return { ok: false, reason: 'poll-closed' };
      case 429:
        return { ok: false, reason: 'rate-limited' };
      default:
        return { ok: false, reason: 'unavailable' };
    }
  }

  const payload = await response.json();
  const counts = extractCounts(payload);
  // These are the freshest counts there are; the next page render (the voter's
  // own, most likely) should show them rather than a cached total without
  // this vote.
  if (Object.keys(counts).length > 0) widgetStore.primeCounts(counts);
  return { ok: true, counts };
}
