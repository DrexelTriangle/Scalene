type PollCounts = Record<string, number>;

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1';
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, '');
const pollUrl = `${normalizedCmsBaseUrl}/poll`;
const pollOptionsUrl = `${normalizedCmsBaseUrl}/poll/options`;
const pollTitleUrl = `${normalizedCmsBaseUrl}/poll/title`;
const pollsUrl = `${normalizedCmsBaseUrl}/polls`;

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

function coercePollCounts(value: unknown): PollCounts {
  const nextCounts: PollCounts = {};
  if (!value || typeof value !== 'object') {
    return nextCounts;
  }

  for (const [option, maybeCount] of Object.entries(value as Record<string, unknown>)) {
    const normalizedOption = option.trim();
    if (!normalizedOption) {
      continue;
    }
    if (typeof maybeCount === 'number' && Number.isFinite(maybeCount) && maybeCount >= 0) {
      nextCounts[normalizedOption] = Math.floor(maybeCount);
    }
  }

  return nextCounts;
}

function extractCounts(payload: unknown): PollCounts {
  if (!payload || typeof payload !== 'object') {
    return {};
  }

  const maybeCounts = (payload as Record<string, unknown>).counts;
  if (maybeCounts && typeof maybeCounts === 'object') {
    return coercePollCounts(maybeCounts);
  }

  return coercePollCounts(payload);
}

async function fetchCms(url: string, init: RequestInit): Promise<Response | null> {
  try {
    const response = await fetch(url, init);
    return response.ok ? response : null;
  } catch {
    return null;
  }
}

function extractOptions(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const value = (payload as Record<string, unknown>).options;
  if (!Array.isArray(value)) {
    return [];
  }

  const options = value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);

  return options;
}

export async function getPollOptions(): Promise<string[]> {
  const response = await fetchCms(pollOptionsUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response) {
    return [];
  }

  const payload = await response.json();
  return extractOptions(payload);
}

export async function getPollTitle(): Promise<string> {
  const response = await fetchCms(pollTitleUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response) {
    return "";
  }

  const payload = await response.json() as { title?: unknown };
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  return title;
}

export async function getPollCounts(): Promise<PollCounts> {
  const response = await fetchCms(pollUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response) {
    return {};
  }

  const payload = await response.json();
  return extractCounts(payload);
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
export async function getPolls(): Promise<ArchivedPoll[]> {
  const response = await fetchCms(pollsUrl, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    cache: 'no-store'
  });

  if (!response) {
    return [];
  }

  const payload = await response.json() as { polls?: unknown };
  if (!Array.isArray(payload?.polls)) {
    return [];
  }

  return payload.polls
    .map(coerceArchivedPoll)
    .filter((poll): poll is ArchivedPoll => poll !== null);
}

export async function incrementPollCount(option: string): Promise<PollCounts | null> {
  const trimmedOption = option.trim();
  if (!trimmedOption) {
    return null;
  }

  const response = await fetchCms(pollUrl, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ option: trimmedOption }),
    cache: 'no-store'
  });

  if (!response) {
    return null;
  }

  const payload = await response.json();
  return extractCounts(payload);
}
