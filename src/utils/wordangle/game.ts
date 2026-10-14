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

// The puzzle date as YYYY-MM-DD, the key the CMS schedules words under.
export function dailyDate(date = new Date()): string {
  const { year, month, day } = civilDateInZone(date, DAILY_TZ);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// The daily word, as the CMS queue serves it. Editors schedule it in Delta,
// which also numbers the puzzles.
export interface ScheduledWord {
  date: string;
  number: number;
  word: string;
}

export function chooseRandomTarget(targets: string[]): { number: null; target: string } {
  if (!targets.length) throw new Error("No target words configured.");
  const index = Math.floor(Math.random() * targets.length);
  return { number: null, target: targets[index] };
}

// Editing a row in place. A row is a fixed-length array of tiles ("" when
// empty) plus a caret, the tile the next letter lands on. The caret moves
// right as letters are typed and can be put on any tile by clicking it, so a
// letter in the middle of a guess can be changed without retyping the rest.
export interface RowEdit {
  letters: string[];
  caret: number;
}

export function typeLetter(letters: string[], caret: number, letter: string): RowEdit {
  if (caret >= letters.length) return { letters, caret };
  const next = letters.slice();
  next[caret] = letter;
  return { letters: next, caret: caret + 1 };
}

// Backspace clears the tile under the caret when the player put the caret
// there (a click or an arrow key) and it holds a letter. Otherwise it clears
// the tile before the caret, which is what typing expects, including right
// after a typed letter advanced the caret onto an existing one.
export function eraseLetter(letters: string[], caret: number, placed: boolean): RowEdit {
  const next = letters.slice();
  if (placed && caret < letters.length && letters[caret]) {
    next[caret] = "";
    return { letters: next, caret };
  }
  if (caret === 0) return { letters, caret };
  next[caret - 1] = "";
  return { letters: next, caret: caret - 1 };
}
