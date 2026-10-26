import type { PublicQuiz, PublicResult } from "../quizzes.ts";

export type Definition = PublicQuiz["definition"];

export function scoreTrivia(def: Definition, chosen: number[]): number {
  let score = 0;
  def.questions.forEach((question, i) => {
    if (question.answers[chosen[i]]?.correct) score += 1;
  });
  return score;
}

// Personality results carry no min or max, so they never match a score.
export function bandFor(results: PublicResult[], score: number): PublicResult | null {
  return (
    results.find((band) => band.min !== undefined && band.max !== undefined && score >= band.min && score <= band.max) ??
    null
  );
}

// Ties go to the result listed first: the editor's order is the only
// tie-break a reader could predict.
export function tallyPersonality(def: Definition, chosen: number[]): PublicResult | null {
  if (chosen.length === 0) return null;
  const tally = new Map<string, number>();
  def.questions.forEach((question, i) => {
    const key = question.answers[chosen[i]]?.result_key;
    if (key) tally.set(key, (tally.get(key) ?? 0) + 1);
  });
  let best: PublicResult | null = null;
  let bestCount = 0;
  for (const result of def.results) {
    const count = tally.get(result.key) ?? 0;
    if (count > bestCount) {
      best = result;
      bestCount = count;
    }
  }
  return best;
}

/** Stored play state is untrusted: the definition may have changed under it. */
export function isValidChosen(def: Definition, chosen: unknown): chosen is number[] {
  if (!Array.isArray(chosen) || chosen.length > def.questions.length) return false;
  return chosen.every(
    (value, i) => Number.isInteger(value) && value >= 0 && value < def.questions[i].answers.length,
  );
}

/**
 * Whole-number percent of readers who chose the correct answer, or null when
 * there is nothing to measure. readerAnswer adds this reader to counts that do
 * not include them yet.
 */
export function percentCorrect(counts: number[], correctIndex: number, readerAnswer?: number): number | null {
  if (correctIndex < 0) return null;
  const all = [...counts];
  if (readerAnswer !== undefined) all[readerAnswer] = (all[readerAnswer] ?? 0) + 1;
  const sum = all.reduce((acc, n) => acc + n, 0);
  return sum === 0 ? null : Math.round(((all[correctIndex] ?? 0) / sum) * 100);
}
