import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  claimPost,
  clearChosen,
  isCurrentPlay,
  loadChosen,
  saveChosen,
  startPlay,
} from "../src/utils/quizzes/playState.ts";
import type { QuizStorage } from "../src/utils/quizzes/playState.ts";
import type { Definition } from "../src/utils/quizzes/scoring.ts";

// An in-memory localStorage. The map is exposed so a test can read what the
// module wrote under the exact keys the spec names.
const memoryStorage = (entries: Record<string, string> = {}) => {
  const map = new Map(Object.entries(entries));
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
  };
};

const blockedStorage: QuizStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

const def: Definition = {
  questions: [
    { text: "q1", explanation: "", answers: [{ text: "a", correct: true, result_key: null }, { text: "b", correct: false, result_key: null }] },
    { text: "q2", explanation: "", answers: [{ text: "a", correct: false, result_key: null }, { text: "b", correct: true, result_key: null }] },
  ],
  results: [],
};

const token = () => "t1";

describe("startPlay", () => {
  it("posts when this version was never counted", () => {
    assert.deepEqual(startPlay(memoryStorage(), 7, 2, token), { token: "t1", posting: true, posted: [] });
  });

  it("writes the counted marker when the play starts", () => {
    const storage = memoryStorage();
    startPlay(storage, 7, 2, token);
    assert.equal(storage.map.get("tr-quiz-7-counted"), '{"version":2}');
  });

  it("does not post when the marker holds the current version", () => {
    const storage = memoryStorage({ "tr-quiz-7-counted": '{"version":2}' });
    assert.equal(startPlay(storage, 7, 2, token).posting, false);
  });

  it("posts again when the marker is for an older version", () => {
    const storage = memoryStorage({ "tr-quiz-7-counted": '{"version":1}' });
    assert.equal(startPlay(storage, 7, 2, token).posting, true);
  });

  it("plays without persistence when storage throws", () => {
    assert.deepEqual(startPlay(blockedStorage, 7, 2, token), { token: "t1", posting: true, posted: [] });
  });

  it("plays without persistence when there is no storage", () => {
    assert.deepEqual(startPlay(null, 7, 2, token), { token: "t1", posting: true, posted: [] });
  });
});

describe("claimPost", () => {
  it("lets every question of a counted play post once, in turn", () => {
    const play = startPlay(memoryStorage(), 7, 2, token);
    assert.deepEqual([0, 1, 2].map((i) => claimPost(play, i)), [true, true, true]);
  });

  it("refuses a second post for the same question", () => {
    const play = startPlay(memoryStorage(), 7, 2, token);
    claimPost(play, 0);
    assert.equal(claimPost(play, 0), false);
  });

  it("never claims for a play that does not post", () => {
    const play = startPlay(memoryStorage({ "tr-quiz-7-counted": '{"version":2}' }), 7, 2, token);
    assert.equal(claimPost(play, 0), false);
  });
});

describe("isCurrentPlay", () => {
  it("accepts a reply carrying the running play's token", () => {
    assert.equal(isCurrentPlay(startPlay(null, 7, 2, () => "t2"), "t2"), true);
  });

  it("ignores a reply from an earlier play", () => {
    assert.equal(isCurrentPlay(startPlay(null, 7, 2, () => "t2"), "t1"), false);
  });

  it("ignores a reply when no play is running", () => {
    assert.equal(isCurrentPlay(null, "t1"), false);
  });
});

describe("loadChosen", () => {
  it("returns the stored answers for the current version", () => {
    const storage = memoryStorage({ "tr-quiz-7": '{"version":2,"chosen":[0,1]}' });
    assert.deepEqual(loadChosen(storage, 7, 2, def), [0, 1]);
  });

  it("discards an answer index past the question's answer count", () => {
    const storage = memoryStorage({ "tr-quiz-7": '{"version":2,"chosen":[0,5]}' });
    assert.equal(loadChosen(storage, 7, 2, def), null);
  });

  it("removes the state it discards", () => {
    const storage = memoryStorage({ "tr-quiz-7": '{"version":2,"chosen":[0,5]}' });
    loadChosen(storage, 7, 2, def);
    assert.equal(storage.map.has("tr-quiz-7"), false);
  });

  it("discards state saved for another version", () => {
    const storage = memoryStorage({ "tr-quiz-7": '{"version":1,"chosen":[0]}' });
    assert.equal(loadChosen(storage, 7, 2, def), null);
  });

  it("returns null for state that is not JSON", () => {
    const storage = memoryStorage({ "tr-quiz-7": "{not json" });
    assert.equal(loadChosen(storage, 7, 2, def), null);
  });

  it("returns null when storage throws", () => {
    assert.equal(loadChosen(blockedStorage, 7, 2, def), null);
  });
});

describe("saveChosen and clearChosen", () => {
  it("saves the answers with the version", () => {
    const storage = memoryStorage();
    saveChosen(storage, 7, 2, [0]);
    assert.equal(storage.map.get("tr-quiz-7"), '{"version":2,"chosen":[0]}');
  });

  it("clears the answers and keeps the counted marker", () => {
    const storage = memoryStorage({ "tr-quiz-7": '{"version":2,"chosen":[0]}', "tr-quiz-7-counted": '{"version":2}' });
    clearChosen(storage, 7);
    assert.deepEqual([...storage.map.keys()], ["tr-quiz-7-counted"]);
  });
});
