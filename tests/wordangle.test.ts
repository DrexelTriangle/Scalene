// Ported from https://github.com/rasen68/triangdle (tests/game.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGuess,
  isValidGuess,
  mergeKeyboardStatuses,
  isGameOver,
  isWin,
  dailyDate,
} from '../src/utils/wordangle/game.ts';

test('short guesses compare against the full target', () => {
  assert.deepEqual(
    evaluateGuess('ee', 'drexel').map((x) => x.status),
    ['present', 'present'],
  );
});

test('exact matches are resolved before duplicate present matches', () => {
  assert.deepEqual(
    evaluateGuess('eeeeee', 'peewee').map((x) => x.status),
    ['absent', 'exact', 'exact', 'absent', 'exact', 'exact'],
  );
});

test('directional arrows ignore exact and claimed target copies', () => {
  const result = evaluateGuess('aaaa', 'aaaaab');
  assert.equal(result[0].status, 'exact');
  assert.equal(result[0].arrows.right, 1);
  assert.equal(result[1].status, 'exact');
  assert.equal(result[1].arrows.right, 1);
});

test('present tiles point at non-exact copies they claimed', () => {
  const mail = evaluateGuess('mail', 'smutty');
  assert.equal(mail[0].status, 'present');
  assert.deepEqual(mail[0].arrows, { left: 0, right: 1 });

  const comet = evaluateGuess('comet', 'smutty');
  assert.equal(comet[2].status, 'present');
  assert.deepEqual(comet[2].arrows, { left: 1, right: 0 });
  assert.equal(comet[4].status, 'exact');
  assert.deepEqual(comet[4].arrows, { left: 1, right: 0 });
});

test('arrow stacks split across directions and ignore exact copies', () => {
  const result = evaluateGuess('be', 'exceed');
  assert.equal(result[1].status, 'present');
  assert.deepEqual(result[1].arrows, { left: 1, right: 2 });

  const o = evaluateGuess('o', 'voodoo');
  assert.equal(o[0].status, 'present');
  assert.equal(o[0].arrows.left, 0);
  assert.equal(o[0].arrows.right, 4);
});

test('one-letter row accepts any letter', () => {
  assert.equal(isValidGuess('z', 1, {}), true);
  assert.equal(isValidGuess('ab', 1, {}), false);
});

test('dictionary validation requires the exact row length', () => {
  const dict = { 2: new Set(['an']), 3: new Set(['and']) };
  assert.equal(isValidGuess('an', 2, dict), true);
  assert.equal(isValidGuess('and', 2, dict), false);
  assert.equal(isValidGuess('foo', 3, dict), false);
});

test('keyboard status only improves', () => {
  const first = mergeKeyboardStatuses({}, evaluateGuess('in', 'ilysia'), 'in');
  const second = mergeKeyboardStatuses(first, evaluateGuess('si', 'ilysia'), 'si');
  assert.equal(first.i, 'exact');
  assert.equal(first.n, 'absent');
  assert.equal(second.s, 'present');
  assert.equal(second.i, 'exact');
});

const board = (...entries: [number, string?][]) => entries.map(([length, guess]) => ({
  length,
  guess: guess ?? '',
  submitted: guess != null,
}));

test('a wrong full-length guess ends the game with rows to spare', () => {
  const rows = board([1, 'a'], [2], [3], [4], [5], [6, 'planet']);
  assert.equal(isGameOver(rows, 'silver'), true);
  assert.equal(isWin(rows, 'silver'), false);
});

test('the game runs on while only short rows are submitted', () => {
  const rows = board([1, 'a'], [2, 'an'], [3, 'ant'], [4], [5], [6]);
  assert.equal(isGameOver(rows, 'silver'), false);
  assert.equal(isWin(rows, 'silver'), false);
});

test('a correct full-length guess wins', () => {
  const rows = board([1], [2], [3], [4], [5], [6, 'silver']);
  assert.equal(isGameOver(rows, 'silver'), true);
  assert.equal(isWin(rows, 'SILVER '), true);
});

test('spending every row ends the game even without a full-length row', () => {
  const rows = board([1, 'a'], [2, 'an'], [3, 'ant']);
  assert.equal(isGameOver(rows, 'silver'), true);
  assert.equal(isWin(rows, 'silver'), false);
});

test("dailyDate uses the Philadelphia calendar day", () => {
  // 03:30 UTC on Oct 5 is still Oct 4 in New York.
  assert.equal(dailyDate(new Date("2026-10-05T03:30:00Z")), "2026-10-04");
});


test("dailyDate rolls over at midnight in both EST and EDT", () => {
  // EST (UTC-5): 04:30 UTC on Mar 8 is 23:30 on Mar 7.
  assert.equal(dailyDate(new Date("2026-03-08T04:30:00Z")), "2026-03-07");
  assert.equal(dailyDate(new Date("2026-03-08T05:00:00Z")), "2026-03-08");
  // EDT (UTC-4): midnight is 04:00 UTC.
  assert.equal(dailyDate(new Date("2026-07-02T03:59:00Z")), "2026-07-01");
  assert.equal(dailyDate(new Date("2026-07-02T04:00:00Z")), "2026-07-02");
});
