import type { APIRoute } from "astro";

export const prerender = false;

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const isIndex = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0;

// Browsers send Origin on every cross-origin and same-origin POST from
// fetch, so a missing one, the literal "null" (sandboxed frames, file pages)
// or one that does not parse is a scripted post, refused like a foreign one.
function isSameOrigin(origin: string | null, requestUrl: string): boolean {
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

// Same shape as api/poll.ts. The reader's address goes to the CMS in
// X-Forwarded-For so its per-reader rate limit is per reader, not per site;
// the CMS keys on the first entry and this is the only proxy in front of it.
export const POST: APIRoute = async ({ request, clientAddress }) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return jsonResponse({ error: "Expected JSON" }, 415);
  }
  if (!isSameOrigin(request.headers.get("origin"), request.url)) {
    return jsonResponse({ error: "Wrong origin" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Bad JSON" }, 400);
  }
  const quizId = body.quiz_id;
  const version = body.definition_version;
  const questionIndex = body.question_index;
  const answerIndex = body.answer_index;
  if (!isIndex(quizId) || !isIndex(version) || !isIndex(questionIndex) || !isIndex(answerIndex)) {
    return jsonResponse({ error: "Bad answer" }, 400);
  }

  let response: Response;
  try {
    response = await fetch(`${normalizedCmsBaseUrl}/quiz/${quizId}/answers`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(clientAddress ? { "X-Forwarded-For": clientAddress } : {}),
      },
      body: JSON.stringify({
        definition_version: version,
        question_index: questionIndex,
        answer_index: answerIndex,
      }),
      cache: "no-store",
    });
  } catch {
    return jsonResponse({ error: "Quiz service unavailable" }, 502);
  }

  const text = await response.text();
  const responseType = response.headers.get("content-type") ?? "";
  if (responseType.includes("application/json")) {
    return new Response(text, { status: response.status, headers: { "Content-Type": "application/json" } });
  }
  return jsonResponse({ error: `Quiz service returned ${response.status}` }, response.status);
};
