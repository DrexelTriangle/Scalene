// Wordangle game rules, ported from Triangdle (https://github.com/rasen68/triangdle).
// Pure functions only -- no DOM -- so tests/wordangle.test.ts can run them
// under plain Node.

export const ROW_LENGTHS = [1, 2, 3, 4, 5, 6];

export type TileStatus = "absent" | "present" | "exact";

export interface TileResult {
  status: TileStatus;
  arrows: { left: number; right: number };
}

export interface Row {
  length: number;
  guess: string;
  submitted: boolean;
}

export type Dictionaries = Partial<Record<number, Set<string>>>;
export type KeyboardStatuses = Partial<Record<string, TileStatus>>;

const STATUS_RANK: Record<TileStatus, number> = { absent: 0, present: 1, exact: 2 };

export function normalizeWord(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function evaluateGuess(guessInput: string, targetInput: string): TileResult[] {
  const guess = normalizeWord(guessInput);
  const target = normalizeWord(targetInput);
  const result: TileResult[] = Array.from({ length: guess.length }, () => ({
    status: "absent",
    arrows: { left: 0, right: 0 },
  }));
  const targetChars = [...target];
  const exactAt = Array<boolean>(targetChars.length).fill(false);

  // Exact matches claim their target positions first.
  for (let i = 0; i < guess.length; i += 1) {
    if (guess[i] === targetChars[i]) {
      result[i].status = "exact";
      exactAt[i] = true;
    }
  }

  // Present matches claim the earliest still-unclaimed target copy.
  const claimed = exactAt.slice();
  for (let i = 0; i < guess.length; i += 1) {
    if (result[i].status === "exact") continue;
    const targetIndex = targetChars.findIndex((char, index) => char === guess[i] && !claimed[index]);
    if (targetIndex >= 0) {
      result[i].status = "present";
      claimed[targetIndex] = true;
    }
  }

  // Arrows count target copies of this letter that are not exact.
  // Present-claimed copies still count; the exact tile itself does not.
  for (let i = 0; i < result.length; i += 1) {
    if (result[i].status === "absent") continue;
    const letter = guess[i];
    const left = targetChars.filter((char, index) => char === letter && index < i && !exactAt[index]).length;
    const right = targetChars.filter((char, index) => char === letter && index > i && !exactAt[index]).length;
    result[i].arrows = { left, right };
  }

  return result;
}

export function isValidGuess(guessInput: string, rowLength: number, dictionaries: Dictionaries): boolean {
  const guess = normalizeWord(guessInput);
  if (guess.length !== rowLength) return false;
  if (rowLength === 1) return /^[a-z]$/.test(guess);
  return dictionaries[rowLength]?.has(guess) ?? false;
}

export function mergeKeyboardStatuses(
  current: KeyboardStatuses,
  evaluation: TileResult[],
  guess: string,
): KeyboardStatuses {
  const next = { ...current };
  for (let i = 0; i < guess.length; i += 1) {
    const letter = guess[i];
    const status = evaluation[i]?.status;
    if (!status) continue;
    const previous = next[letter];
    if (previous === undefined || STATUS_RANK[status] > STATUS_RANK[previous]) next[letter] = status;
  }
  return next;
}

// The full-length row is the only one that can win, so submitting it ends
// the game either way; shorter rows left over are dead weight.
export function isGameOver(rows: Row[], targetInput: string): boolean {
  const target = normalizeWord(targetInput);
  if (rows.every((row) => row.submitted)) return true;
  return rows.some((row) => row.submitted && row.length === target.length);
}

export function isWin(rows: Row[], targetInput: string): boolean {
  const target = normalizeWord(targetInput);
  return rows.some((row) => row.submitted && normalizeWord(row.guess) === target);
}

// Puzzles roll over at midnight in Philadelphia, wherever the reader is.
const DAILY_TZ = "America/New_York";

function civilDateInZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(date);
  const num = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: num("year"), month: num("month"), day: num("day") };
}

export function dailyNumber(date = new Date()): number {
  const { year, month, day } = civilDateInZone(date, DAILY_TZ);
  const start = Date.UTC(2026, 0, 1);
  const utc = Date.UTC(year, month - 1, day);
  return Math.floor((utc - start) / 86400000) + 1;
}

export function seededIndex(seed: number | string, length: number): number {
  let hash = 2166136261 >>> 0;
  for (const char of String(seed)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % length;
}

export function chooseDailyTarget(targets: string[], date = new Date()): { number: number; target: string } {
  if (!targets.length) throw new Error("No target words configured.");
  const number = dailyNumber(date);
  return { number, target: targets[seededIndex(number, targets.length)] };
}

export function chooseRandomTarget(targets: string[]): { number: null; target: string } {
  if (!targets.length) throw new Error("No target words configured.");
  const index = Math.floor(Math.random() * targets.length);
  return { number: null, target: targets[index] };
}
