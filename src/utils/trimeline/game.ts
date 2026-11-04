// Tri-meline game rules. Pure functions only -- no DOM -- so
// tests/trimeline.test.ts can run them under plain Node.

export const SLOT_COUNT = 5;

// Puzzles roll over at midnight in Philadelphia, wherever the reader is.
const DAILY_TZ = 'America/New_York';

export interface Headline {
  title: string;
  slug: string;
  pub_date: string; // RFC3339
}

// The daily puzzle, as the CMS queue serves it. Headlines arrive shuffled.
export interface Puzzle {
  date: string; // YYYY-MM-DD
  number: number;
  headlines: Headline[];
}

function civilDateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: num('year'), month: num('month'), day: num('day') };
}

// The puzzle date as YYYY-MM-DD, the key the CMS schedules puzzles under.
export function dailyDate(date = new Date()): string {
  const { year, month, day } = civilDateInZone(date, DAILY_TZ);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// Parses an RFC3339 timestamp into a comparable number (UTC ms). Invalid
// input sorts last, so a malformed date can never crash the reveal.
export function pubTime(pubDate: string): number {
  const time = Date.parse(pubDate);
  return Number.isNaN(time) ? Number.MAX_SAFE_INTEGER : time;
}

// Ranks a shuffled puzzle's headlines oldest→newest, stably, so equal
// pub_dates keep their original order. Returns indices into `headlines`.
export function chronologicalOrder(headlines: Headline[]): number[] {
  return headlines
    .map((_, index) => index)
    .sort((a, b) => pubTime(headlines[a].pub_date) - pubTime(headlines[b].pub_date) || a - b);
}

// Slots each headline's true position occupies. Headlines that share a
// pub_date form one group covering all its slots, so any arrangement within
// the group is as correct as the truth. Grouped by slot index: entry i is
// the group slot i belongs to.
function slotGroups(headlines: Headline[]): number[] {
  const truth = chronologicalOrder(headlines);
  const groups: number[] = [];
  let group = 0;
  truth.forEach((headlineIndex, position) => {
    if (position > 0 && pubTime(headlines[headlineIndex].pub_date) !== pubTime(headlines[truth[position - 1]].pub_date)) {
      group += 1;
    }
    groups[position] = group;
  });
  return groups;
}

// Checks the player's ordering. `order` holds indices into `headlines` (the
// player's arrangement, oldest slot first). A slot is correct when the
// headline in it belongs to the slot's true chronological position, counting
// any arrangement of equal-pub_date headlines as correct.
export interface CheckResult {
  slotCorrect: boolean[];
  score: number;
  allCorrect: boolean;
}

export function checkOrder(headlines: Headline[], order: number[]): CheckResult {
  const slots = Math.min(order.length, headlines.length);
  const truth = chronologicalOrder(headlines);
  const groups = slotGroups(headlines);
  // The slot group each headline truly belongs to, by headline index.
  const headlineGroup = new Map<number, number>();
  truth.forEach((headlineIndex, position) => headlineGroup.set(headlineIndex, groups[position]));

  const slotCorrect: boolean[] = Array.from({ length: slots }, () => false);
  for (let slot = 0; slot < slots; slot += 1) {
    const headlineIndex = order[slot];
    if (headlineIndex == null || headlineIndex < 0 || headlineIndex >= headlines.length) continue;
    // The headline is correct when the slot it was given belongs to the group
    // of slots it truly occupies.
    slotCorrect[slot] = headlineGroup.get(headlineIndex) === groups[slot];
  }
  const score = slotCorrect.filter(Boolean).length;
  return { slotCorrect, score, allCorrect: score === headlines.length };
}

// True chronological order as an arrangement the player could have submitted,
// used when restoring a saved game's reveal.
export function trueOrder(headlines: Headline[]): number[] {
  return chronologicalOrder(headlines);
}

// Formats an RFC3339 timestamp the way the archive shows it.
export function formatDate(pubDate: string): string {
  const time = Date.parse(pubDate);
  if (Number.isNaN(time)) return pubDate;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(time));
}

// The state persisted per puzzle, keyed by puzzle number.
export interface SavedResult {
  order: number[]; // the submitted arrangement, oldest slot first
  score: number;
  slotCorrect: boolean[];
}

export function parseSavedResult(raw: string | null): SavedResult | undefined {
  if (!raw) return undefined;
  try {
    const body = JSON.parse(raw) as { order?: unknown; score?: unknown; slotCorrect?: unknown };
    if (
      !Array.isArray(body.order) ||
      body.order.every((item) => typeof item === 'number') === false ||
      typeof body.score !== 'number' ||
      !Array.isArray(body.slotCorrect) ||
      body.slotCorrect.every((item) => typeof item === 'boolean') === false
    ) {
      return undefined;
    }
    return {
      order: body.order as number[],
      score: body.score as number,
      slotCorrect: body.slotCorrect as boolean[],
    };
  } catch {
    return undefined;
  }
}

// The share text: one emoji per slot, then the puzzle id and a link.
export const SHARE_URL = 'thetriangle.org/trimeline';

export function shareText(puzzle: Puzzle, slotCorrect: boolean[]): string {
  const grid = puzzle.headlines
    .slice(0, slotCorrect.length)
    .map((_, slot) => (slotCorrect[slot] ? '🟩' : '🟪'))
    .join('');
  const score = slotCorrect.filter(Boolean).length;
  return `Tri-meline #${puzzle.number} ${puzzle.date}\n${score}/${puzzle.headlines.length}\n\n${grid}\n\n${SHARE_URL}`;
}
