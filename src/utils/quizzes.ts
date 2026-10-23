// Reads for the quiz block and the quiz page, plus the splitter the article
// page uses to render Quiz.astro into each slot. Same base URL handling as
// pollStore.ts. Optional chaining because tests/ run this module under plain
// node, where import.meta.env does not exist.
const cmsBaseUrl = import.meta.env?.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");

// Optional fields mirror the CMS encoding: image_url, min and max are
// omitempty in Go, so they are absent rather than null.
export type PublicAnswer = { text: string; correct: boolean; result_key: string | null };
export type PublicQuestion = {
  text: string;
  image_url?: string;
  answers: PublicAnswer[];
  explanation: string;
};
export type PublicResult = {
  key: string;
  min?: number;
  max?: number;
  title: string;
  body: string;
  image_url?: string;
};
export type PublicQuiz = {
  id: number;
  slug: string;
  title: string;
  kind: "trivia" | "personality";
  intro: string;
  definition_version: number;
  cover_url: string | null;
  definition: { questions: PublicQuestion[]; results: PublicResult[] };
  counts: number[][];
};

export type QuizSegment = { html: string } | { quizId: number; overflow: boolean };

/** Distinct quizzes one article may render; later slots show the unavailable box. */
export const MAX_QUIZZES_PER_ARTICLE = 5;

// Exactly what quizSlot() in shortcodes.ts emits. Anchored to that string so a
// reader cannot type a slot by hand into prose: the editor escapes < in text.
const QUIZ_SLOT = /<div class="tr-quiz-slot" data-quiz-id="(\d+)"><\/div>/g;

export function splitAtQuizSlots(html: string): { segments: QuizSegment[]; ids: number[] } {
  const segments: QuizSegment[] = [];
  const ids: number[] = [];
  let cursor = 0;
  QUIZ_SLOT.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = QUIZ_SLOT.exec(html)) !== null) {
    if (match.index > cursor) segments.push({ html: html.slice(cursor, match.index) });
    const quizId = Number(match[1]);
    const known = ids.includes(quizId);
    const overflow = !known && ids.length >= MAX_QUIZZES_PER_ARTICLE;
    if (!known && !overflow) ids.push(quizId);
    segments.push({ quizId, overflow });
    cursor = match.index + match[0].length;
  }
  if (cursor < html.length || segments.length === 0) segments.push({ html: html.slice(cursor) });
  return { segments, ids };
}

export type FetchDeps = { fetchImpl?: typeof fetch; now?: () => number; timeoutMs?: number };

const CACHE_TTL_MS = 60_000;
const FETCH_TIMEOUT_MS = 1_500;

// Per-process cache so an article with a quiz costs one CMS round trip a
// minute, not one per reader. Keyed by id; the stored quiz carries its
// definition_version, so a stale entry costs one 409 on the first answer.
const cache = new Map<number, { expires: number; quiz: PublicQuiz }>();

export function resetQuizCache(): void {
  cache.clear();
}

function isQuiz(value: unknown): value is PublicQuiz {
  if (!value || typeof value !== "object") return false;
  const q = value as Record<string, unknown>;
  return typeof q.id === "number" && typeof q.slug === "string" && typeof q.definition_version === "number";
}

async function cmsJson(
  url: string,
  fetchImpl: typeof fetch,
  timeoutMs: number,
): Promise<{ status: number; body: unknown } | null> {
  // A plain timer rather than AbortSignal.timeout: Node unrefs that one's
  // timer, so under the test runner a hung fetch ends the process instead of
  // timing out.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) return { status: response.status, body: null };
    return { status: response.status, body: await response.json() };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchQuizzesByIds(
  ids: number[],
  { fetchImpl = fetch, now = Date.now, timeoutMs = FETCH_TIMEOUT_MS }: FetchDeps = {},
): Promise<Record<number, PublicQuiz> | null> {
  const out: Record<number, PublicQuiz> = {};
  const missing: number[] = [];
  const at = now();
  for (const id of ids) {
    const hit = cache.get(id);
    if (hit && hit.expires > at) out[id] = hit.quiz;
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  const result = await cmsJson(`${normalizedCmsBaseUrl}/quiz?ids=${missing.join(",")}`, fetchImpl, timeoutMs);
  if (!result || result.status !== 200 || !result.body || typeof result.body !== "object") return null;

  for (const value of Object.values(result.body as Record<string, unknown>)) {
    if (!isQuiz(value)) continue;
    cache.set(value.id, { expires: at + CACHE_TTL_MS, quiz: value });
    out[value.id] = value;
  }
  return out;
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export async function fetchQuizBySlug(
  slug: string,
  { fetchImpl = fetch, now = Date.now, timeoutMs = FETCH_TIMEOUT_MS }: FetchDeps = {},
): Promise<PublicQuiz | null | "unavailable"> {
  if (!SLUG.test(slug)) return null;
  const result = await cmsJson(`${normalizedCmsBaseUrl}/quiz/${slug}`, fetchImpl, timeoutMs);
  if (!result) return "unavailable";
  if (result.status === 404) return null;
  if (result.status !== 200 || !isQuiz(result.body)) return "unavailable";
  cache.set(result.body.id, { expires: now() + CACHE_TTL_MS, quiz: result.body });
  return result.body;
}
