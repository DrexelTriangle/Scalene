import { isValidChosen } from "./scoring.ts";
import type { Definition } from "./scoring.ts";

// Per-play bookkeeping for the quiz player, kept out of Quiz.astro so it runs
// under the node test runner. Storage is passed in: the page hands over
// localStorage, or null when reading it throws, and every call below catches,
// because private mode and a full quota throw too. Without storage the quiz
// plays and may count a replay again; the spec accepts that (section 8).
export type QuizStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type Play = {
  token: string;
  // False when this browser already counted a play of this version: the
  // reader may replay, but the counts must not move twice.
  posting: boolean;
  posted: number[];
};

const stateKey = (quizId: number) => `tr-quiz-${quizId}`;
const countedKey = (quizId: number) => `tr-quiz-${quizId}-counted`;

function readJson(storage: QuizStorage | null, key: string): unknown {
  try {
    const raw = storage?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeJson(storage: QuizStorage | null, key: string, value: unknown): void {
  try {
    storage?.setItem(key, JSON.stringify(value));
  } catch {
    // Full or blocked: play on without persistence.
  }
}

function removeKey(storage: QuizStorage | null, key: string): void {
  try {
    storage?.removeItem(key);
  } catch {
    // Same as above.
  }
}

const randomToken = () => Math.random().toString(36).slice(2);

/**
 * Called on the first accepted answer of a play. Writes the counted marker at
 * once, so another instance or tab that starts later finds it and stays
 * silent, and makes the token that ties replies to this play.
 */
export function startPlay(
  storage: QuizStorage | null,
  quizId: number,
  version: number,
  makeToken: () => string = randomToken,
): Play {
  const marker = readJson(storage, countedKey(quizId)) as { version?: unknown } | null;
  const posting = marker?.version !== version;
  if (posting) writeJson(storage, countedKey(quizId), { version });
  return { token: makeToken(), posting, posted: [] };
}

/** True the first time a counted play answers this question; records it. */
export function claimPost(play: Play, questionIndex: number): boolean {
  if (!play.posting || play.posted.includes(questionIndex)) return false;
  play.posted.push(questionIndex);
  return true;
}

/** A reply that lands after Play again belongs to a play that has ended. */
export function isCurrentPlay(play: Play | null, token: string): boolean {
  return play !== null && play.token === token;
}

/** The stored answers for this version, or null; anything invalid is removed. */
export function loadChosen(
  storage: QuizStorage | null,
  quizId: number,
  version: number,
  def: Definition,
): number[] | null {
  const saved = readJson(storage, stateKey(quizId)) as { version?: unknown; chosen?: unknown } | null;
  if (saved === null) return null;
  if (saved.version === version && isValidChosen(def, saved.chosen)) return saved.chosen;
  removeKey(storage, stateKey(quizId));
  return null;
}

export function saveChosen(storage: QuizStorage | null, quizId: number, version: number, chosen: number[]): void {
  writeJson(storage, stateKey(quizId), { version, chosen });
}

/** Play again: forget the answers, keep the counted marker. */
export function clearChosen(storage: QuizStorage | null, quizId: number): void {
  removeKey(storage, stateKey(quizId));
}
