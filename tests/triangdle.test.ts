// Ported from https://github.com/rasen68/triangdle (tests/game.test.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateGuess,
  isValidGuess,
  mergeKeyboardStatuses,
  isGameOver,
  isWin,
  dailyNumber,
  seededIndex,
} from '../src/utils/triangdle/game.ts';

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

test('daily numbering uses Philly date', () => {
  // 2026-01-01 00:00 EST = 05:00 UTC → puzzle 1
  assert.equal(
    dailyNumber(new Date('2026-01-01T05:00:00.000Z')),
    1,
  );
  // 23:00 EST Jan 1 is already Jan 2 UTC; still puzzle 1
  assert.equal(
    dailyNumber(new Date('2026-01-02T04:00:00.000Z')),
    1,
  );
  // 2026-01-02 00:00 EST = 05:00 UTC → puzzle 2
  assert.equal(
    dailyNumber(new Date('2026-01-02T05:00:00.000Z')),
    2,
  );
});

test('daily numbering follows EDT after the spring-forward', () => {
  // 2026-07-01 00:00 EDT = 04:00 UTC
  const july1 = dailyNumber(new Date('2026-07-01T04:00:00.000Z'));
  // 23:00 EDT July 1 is already July 2 UTC; still July 1 in NY
  assert.equal(
    dailyNumber(new Date('2026-07-02T03:00:00.000Z')),
    july1,
  );
  // 2026-07-02 00:00 EDT = 04:00 UTC → next puzzle
  assert.equal(
    dailyNumber(new Date('2026-07-02T04:00:00.000Z')),
    july1 + 1,
  );
});

test('seeded index is deterministic and in range', () => {
  const a = seededIndex(42, 40);
  const b = seededIndex(42, 40);
  assert.equal(a, b);
  assert.ok(a >= 0 && a < 40);
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
