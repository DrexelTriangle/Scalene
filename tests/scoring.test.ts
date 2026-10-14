import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { PublicResult } from "../src/utils/quizzes.ts";
import { bandFor, isValidChosen, scoreTrivia, tallyPersonality } from "../src/utils/quizzes/scoring.ts";

// Trivia bands carry min and max; personality results do not, as the CMS sends them.
const band = (key: string, min: number, max: number): PublicResult => ({ key, min, max, title: key, body: "" });
const outcome = (key: string): PublicResult => ({ key, title: key, body: "" });

const trivia = {
  questions: [
    { text: "q1", explanation: "", answers: [{ text: "a", correct: true, result_key: null }, { text: "b", correct: false, result_key: null }] },
    { text: "q2", explanation: "", answers: [{ text: "a", correct: false, result_key: null }, { text: "b", correct: true, result_key: null }] },
    { text: "q3", explanation: "", answers: [{ text: "a", correct: true, result_key: null }, { text: "b", correct: false, result_key: null }] },
  ],
  results: [band("0-1", 0, 1), band("2-3", 2, 3)],
};

describe("scoreTrivia", () => {
  it("counts the chosen answers that are correct", () => {
    assert.equal(scoreTrivia(trivia, [0, 1, 1]), 2);
  });
  it("ignores answers past the end of the question list", () => {
    assert.equal(scoreTrivia(trivia, [0, 1, 0, 0]), 3);
  });
});

describe("bandFor", () => {
  it("picks the band whose inclusive range holds the score, at both edges", () => {
    assert.equal(bandFor(trivia.results, 1)?.key, "0-1");
    assert.equal(bandFor(trivia.results, 2)?.key, "2-3");
  });
  it("returns null when no band holds the score", () => {
    assert.equal(bandFor(trivia.results, 4), null);
  });
});

const personality = {
  questions: [
    { text: "q1", explanation: "", answers: [{ text: "a", correct: false, result_key: "owl" }, { text: "b", correct: false, result_key: "cat" }] },
    { text: "q2", explanation: "", answers: [{ text: "a", correct: false, result_key: "owl" }, { text: "b", correct: false, result_key: "cat" }] },
  ],
  results: [outcome("cat"), outcome("owl")],
};

describe("tallyPersonality", () => {
  it("returns the result picked most", () => {
    assert.equal(tallyPersonality(personality, [0, 0])?.key, "owl");
  });
  it("breaks a tie by the order of results", () => {
    assert.equal(tallyPersonality(personality, [0, 1])?.key, "cat");
  });
  it("returns null with no answers", () => {
    assert.equal(tallyPersonality(personality, []), null);
  });
});

describe("isValidChosen", () => {
  it("accepts an array of in-range answer indexes no longer than the question list", () => {
    assert.equal(isValidChosen(trivia, [0, 1]), true);
  });
  it("rejects a non-array, an out-of-range index, a non-integer, and too many entries", () => {
    assert.equal(isValidChosen(trivia, "0,1"), false);
    assert.equal(isValidChosen(trivia, [0, 5]), false);
    assert.equal(isValidChosen(trivia, [0.5]), false);
    assert.equal(isValidChosen(trivia, [0, 0, 0, 0]), false);
  });
});
