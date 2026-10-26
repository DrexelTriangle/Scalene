import { beforeEach, describe, it, mock } from "node:test";
import assert from "node:assert/strict";

import { normalizeArticleHtml } from "../src/utils/articleHtml.ts";
import { expandShortcodes } from "../src/utils/shortcodes.ts";
import { fetchQuizBySlug, fetchQuizzesByIds, resetQuizCache, splitAtQuizSlots } from "../src/utils/quizzes.ts";
import type { FetchDeps } from "../src/utils/quizzes.ts";

const slot = (id: number) => `<div class="tr-quiz-slot" data-quiz-id="${id}"></div>`;

describe("splitAtQuizSlots", () => {
  it("returns html and quiz segments in document order with deduplicated ids", () => {
    const html = `<p>a</p>${slot(3)}<p>b</p>${slot(5)}${slot(3)}<p>c</p>`;
    assert.deepEqual(splitAtQuizSlots(html), {
      segments: [
        { html: "<p>a</p>" },
        { quizId: 3, overflow: false },
        { html: "<p>b</p>" },
        { quizId: 5, overflow: false },
        { quizId: 3, overflow: false },
        { html: "<p>c</p>" },
      ],
      ids: [3, 5],
    });
  });

  it("returns one html segment and no ids when there is no slot", () => {
    assert.deepEqual(splitAtQuizSlots("<p>a</p>"), { segments: [{ html: "<p>a</p>" }], ids: [] });
  });

  it("marks distinct ids past the fifth as overflow and leaves them out of ids", () => {
    const html = [1, 2, 3, 4, 5, 6].map(slot).join("");
    const { segments, ids } = splitAtQuizSlots(html);
    assert.deepEqual(ids, [1, 2, 3, 4, 5]);
    assert.deepEqual(segments[5], { quizId: 6, overflow: true });
  });
});

describe("the slot from the shortcode expander", () => {
  it("survives normalizeArticleHtml and is found by the splitter", () => {
    // Same order as [article].astro: expand, then normalize, then split.
    const html = normalizeArticleHtml(expandShortcodes('<p>a</p>\n<p>[quiz id="7"]</p>\n<p>b</p>'));
    assert.deepEqual(splitAtQuizSlots(html).ids, [7]);
  });
});

const quiz = (id: number, version = 1) => ({
  id,
  slug: `q${id}`,
  title: `Quiz ${id}`,
  kind: "trivia",
  intro: "",
  definition_version: version,
  cover_url: null,
  definition: { questions: [], results: [] },
  counts: [],
});

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

type FetchArgs = [input: string | URL | Request, init?: RequestInit];
type FakeFetch = typeof fetch & { mock: { callCount(): number; calls: { arguments: FetchArgs }[] } };

// A fake fetch that answers from a queue (the last response repeats) and
// records every call. Typed as fetch so astro check accepts it as fetchImpl.
const fakeFetch = (...responses: (() => Response)[]) =>
  mock.fn(async (..._args: FetchArgs) => {
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    return next();
  }) as unknown as FakeFetch;

// Never answers. Like a real fetch it rejects when its signal aborts, which is
// the only way out, so the test proves the timeout is what ends the wait.
const hangingFetch = () =>
  mock.fn(
    (...args: FetchArgs) =>
      new Promise<Response>((_resolve, reject) => {
        const signal = args[1]?.signal;
        signal?.addEventListener("abort", () => reject(signal.reason));
      }),
  ) as unknown as FakeFetch;

const calledUrl = (fetchImpl: FakeFetch, n: number) => String(fetchImpl.mock.calls[n].arguments[0]);

const neverFetch = () => fakeFetch(() => { throw new Error("fetch must not be called"); });

// What the article page does with a body: split it, fetch the ids, and give
// each slot its quiz. Returns the quiz title per slot and the html otherwise.
const renderArticle = async (html: string, deps: FetchDeps) => {
  const { segments, ids } = splitAtQuizSlots(html);
  const quizzes = await fetchQuizzesByIds(ids, deps);
  return segments.map((segment) => ("html" in segment ? segment.html : quizzes?.[segment.quizId]?.title));
};

describe("fetchQuizzesByIds", () => {
  beforeEach(() => resetQuizCache());

  it("asks the CMS for all ids in one request and keys the result by id", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ "3": quiz(3), "5": quiz(5) }));
    const out = await fetchQuizzesByIds([3, 5], { fetchImpl, now: () => 0 });
    assert.equal(fetchImpl.mock.callCount(), 1);
    assert.match(calledUrl(fetchImpl, 0), /\/quiz\?ids=3,5$/);
    assert.deepEqual(Object.keys(out ?? {}), ["3", "5"]);
  });

  it("serves a second call inside 60 seconds from the cache", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ "3": quiz(3) }));
    await fetchQuizzesByIds([3], { fetchImpl, now: () => 0 });
    const out = await fetchQuizzesByIds([3], { fetchImpl, now: () => 59_000 });
    assert.equal(fetchImpl.mock.callCount(), 1);
    assert.equal(out?.[3]?.id, 3);
  });

  it("refetches after 60 seconds", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ "3": quiz(3, 2) }));
    await fetchQuizzesByIds([3], { fetchImpl, now: () => 0 });
    const out = await fetchQuizzesByIds([3], { fetchImpl, now: () => 60_001 });
    assert.equal(fetchImpl.mock.callCount(), 2);
    assert.equal(out?.[3]?.definition_version, 2);
  });

  it("fetches only the ids that are not cached", async () => {
    const fetchImpl = fakeFetch(
      () => jsonResponse({ "3": quiz(3) }),
      () => jsonResponse({ "5": quiz(5) }),
    );
    await fetchQuizzesByIds([3], { fetchImpl, now: () => 0 });
    const out = await fetchQuizzesByIds([3, 5], { fetchImpl, now: () => 1 });
    assert.match(calledUrl(fetchImpl, 1), /\/quiz\?ids=5$/);
    assert.deepEqual(Object.keys(out ?? {}).sort(), ["3", "5"]);
  });

  it("leaves an unpublished id out and does not cache its absence", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ "3": quiz(3) }));
    const out = await fetchQuizzesByIds([3, 9], { fetchImpl, now: () => 0 });
    assert.deepEqual(Object.keys(out ?? {}), ["3"]);
    assert.equal(out?.[3]?.id, 3);
    await fetchQuizzesByIds([9], { fetchImpl, now: () => 1 });
    assert.equal(fetchImpl.mock.callCount(), 2);
  });

  it("returns null when the CMS fails or returns a non-2xx", async () => {
    const down = fakeFetch(() => { throw new Error("down"); });
    assert.equal(await fetchQuizzesByIds([3], { fetchImpl: down, now: () => 0 }), null);
    const failing = fakeFetch(() => jsonResponse({}, 500));
    assert.equal(await fetchQuizzesByIds([3], { fetchImpl: failing, now: () => 0 }), null);
  });

  it("returns null when the CMS does not answer within the timeout", async () => {
    const fetchImpl = hangingFetch();
    assert.equal(await fetchQuizzesByIds([3], { fetchImpl, now: () => 0, timeoutMs: 10 }), null);
  });

  it("returns an empty object without fetching when given no ids", async () => {
    const fetchImpl = neverFetch();
    assert.deepEqual(await fetchQuizzesByIds([], { fetchImpl, now: () => 0 }), {});
    assert.equal(fetchImpl.mock.callCount(), 0);
  });
});

describe("an article with the same quiz twice", () => {
  beforeEach(() => resetQuizCache());

  const body = `${slot(3)}<p>b</p>${slot(3)}`;

  it("gives both slots the quiz", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ "3": quiz(3) }));
    assert.deepEqual(await renderArticle(body, { fetchImpl, now: () => 0 }), ["Quiz 3", "<p>b</p>", "Quiz 3"]);
  });

  it("fetches once across two renders inside the cache window", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse({ "3": quiz(3) }));
    await renderArticle(body, { fetchImpl, now: () => 0 });
    await renderArticle(body, { fetchImpl, now: () => 30_000 });
    assert.equal(fetchImpl.mock.callCount(), 1);
  });
});

describe("fetchQuizBySlug", () => {
  beforeEach(() => resetQuizCache());

  it("returns the quiz on 200", async () => {
    const fetchImpl = fakeFetch(() => jsonResponse(quiz(3)));
    const out = await fetchQuizBySlug("q3", { fetchImpl, now: () => 0 });
    assert.match(calledUrl(fetchImpl, 0), /\/quiz\/q3$/);
    assert.equal(typeof out === "object" && out !== null ? out.id : out, 3);
  });

  it("returns null on 404 and unavailable on any other failure", async () => {
    const gone = fakeFetch(() => jsonResponse({}, 404));
    assert.equal(await fetchQuizBySlug("gone", { fetchImpl: gone, now: () => 0 }), null);
    const down = fakeFetch(() => { throw new Error("down"); });
    assert.equal(await fetchQuizBySlug("q3", { fetchImpl: down, now: () => 0 }), "unavailable");
  });

  it("returns unavailable when the CMS does not answer within the timeout", async () => {
    const fetchImpl = hangingFetch();
    assert.equal(await fetchQuizBySlug("q3", { fetchImpl, now: () => 0, timeoutMs: 10 }), "unavailable");
  });

  it("rejects a slug that is not lowercase letters, digits and hyphens without fetching", async () => {
    const fetchImpl = neverFetch();
    assert.equal(await fetchQuizBySlug("../x", { fetchImpl, now: () => 0 }), null);
    assert.equal(fetchImpl.mock.callCount(), 0);
  });
});
