import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pollOptions = [
  'News',
  'Opinion',
  'Sports',
  'Arts & Entertainment',
  'Comics',
  'Photography'
] as const;

type PollOption = (typeof pollOptions)[number];

type PollCounts = Record<PollOption, number>;

const defaultPollCounts: PollCounts = {
  News: 0,
  Opinion: 0,
  Sports: 0,
  'Arts & Entertainment': 0,
  Comics: 0,
  Photography: 0
};

const dataDir = path.join(process.cwd(), 'data');
const pollCountsFile = path.join(dataDir, 'poll-counts.json');

const pollOptionSet = new Set<string>(pollOptions);

function coercePollCounts(value: unknown): PollCounts {
  const nextCounts = { ...defaultPollCounts };
  if (!value || typeof value !== 'object') {
    return nextCounts;
  }

  for (const option of pollOptions) {
    const maybeCount = (value as Record<string, unknown>)[option];
    if (typeof maybeCount === 'number' && Number.isFinite(maybeCount) && maybeCount >= 0) {
      nextCounts[option] = Math.floor(maybeCount);
    }
  }

  return nextCounts;
}

function persistPollCounts(counts: PollCounts): void {
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
  writeFileSync(pollCountsFile, JSON.stringify(counts, null, 2), 'utf-8');
}

function loadPollCounts(): PollCounts {
  if (!existsSync(pollCountsFile)) {
    persistPollCounts(defaultPollCounts);
    return { ...defaultPollCounts };
  }

  try {
    const raw = readFileSync(pollCountsFile, 'utf-8');
    return coercePollCounts(JSON.parse(raw));
  } catch {
    persistPollCounts(defaultPollCounts);
    return { ...defaultPollCounts };
  }
}

const pollCounts: PollCounts = loadPollCounts();

export function getPollOptions() {
  return [...pollOptions];
}

export function getPollCounts(): PollCounts {
  return { ...pollCounts };
}

export function incrementPollCount(option: string): PollCounts | null {
  if (!pollOptionSet.has(option)) {
    return null;
  }

  pollCounts[option as PollOption] += 1;
  persistPollCounts(pollCounts);
  return getPollCounts();
}
