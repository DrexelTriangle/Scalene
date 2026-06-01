type PollCounts = Record<string, number>;

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1';
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, '');
const pollUrl = `${normalizedCmsBaseUrl}/poll`;
const pollOptionsUrl = `${normalizedCmsBaseUrl}/poll/options`;
const pollTitleUrl = `${normalizedCmsBaseUrl}/poll/title`;

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
    return "What is your favorite section of The Triangle?";
  }

  const payload = await response.json() as { title?: unknown };
  const title = typeof payload?.title === 'string' ? payload.title.trim() : '';
  return title || "What is your favorite section of The Triangle?";
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
