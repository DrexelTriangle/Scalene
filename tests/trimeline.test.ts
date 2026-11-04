// Tri-meline rules, mirroring tests/wordangle.test.ts (node:test, not vitest,
// to match the repo's test script).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  chronologicalOrder,
  checkOrder,
  dailyDate,
  formatDate,
  parseSavedResult,
  pubTime,
  shareText,
  trueOrder,
  type Headline,
} from '../src/utils/trimeline/game.ts';

const headlines = (dates: string[]): Headline[] =>
  dates.map((pub_date, index) => ({ title: `Headline ${index + 1}`, slug: `story-${index + 1}`, pub_date }));

test('chronologicalOrder sorts oldest first, stably', () => {
  const items = headlines([
    '2005-03-02T00:00:00Z',
    '1989-11-15T00:00:00Z',
    '2015-06-01T00:00:00Z',
    '1997-01-20T00:00:00Z',
    '2020-08-30T00:00:00Z',
  ]);
  assert.deepEqual(chronologicalOrder(items), [1, 3, 0, 2, 4]);
});

test('equal pub_dates keep their original order (stable sort)', () => {
  const items = headlines([
    '2000-01-01T00:00:00Z',
    '1990-01-01T00:00:00Z',
    '2000-01-01T00:00:00Z',
    '1990-01-01T00:00:00Z',
    '2010-01-01T00:00:00Z',
  ]);
  assert.deepEqual(chronologicalOrder(items), [1, 3, 0, 2, 4]);
});

test('a fully correct order scores 5/5', () => {
  const items = headlines([
    '2005-03-02T00:00:00Z',
    '1989-11-15T00:00:00Z',
    '2015-06-01T00:00:00Z',
    '1997-01-20T00:00:00Z',
    '2020-08-30T00:00:00Z',
  ]);
  const result = checkOrder(items, trueOrder(items));
  assert.equal(result.score, 5);
  assert.deepEqual(result.slotCorrect, [true, true, true, true, true]);
  assert.equal(result.allCorrect, true);
});

test('a wrong slot is marked incorrect without sinking the rest', () => {
  const items = headlines([
    '2005-03-02T00:00:00Z',
    '1989-11-15T00:00:00Z',
    '2015-06-01T00:00:00Z',
    '1997-01-20T00:00:00Z',
    '2020-08-30T00:00:00Z',
  ]);
  // Correct order is [1, 3, 0, 2, 4]; swap the first two.
  const result = checkOrder(items, [3, 1, 0, 2, 4]);
  assert.equal(result.score, 3);
  assert.deepEqual(result.slotCorrect, [false, false, true, true, true]);
  assert.equal(result.allCorrect, false);
});

test('a circular shift marks every slot correct that holds its own headline', () => {
  const items = headlines([
    '2005-03-02T00:00:00Z',
    '1989-11-15T00:00:00Z',
    '2015-06-01T00:00:00Z',
    '1997-01-20T00:00:00Z',
    '2020-08-30T00:00:00Z',
  ]);
  // Reverse of [1, 3, 0, 2, 4]: only slot 2 keeps its headline.
  const result = checkOrder(items, [4, 2, 0, 3, 1]);
  assert.equal(result.score, 1);
  assert.deepEqual(result.slotCorrect, [false, false, true, false, false]);
});

test('equal pub_dates count as correct in any order among themselves', () => {
  const items = headlines([
    '2000-01-01T00:00:00Z',
    '2000-01-01T00:00:00Z',
    '2010-01-01T00:00:00Z',
    '1990-01-01T00:00:00Z',
    '1990-01-01T00:00:00Z',
  ]);
  // True order [3, 4, 0, 1, 2]; swapping inside each equal pair stays correct.
  const result = checkOrder(items, [4, 3, 1, 0, 2]);
  assert.equal(result.score, 5);
  assert.equal(result.allCorrect, true);
});

test('checkOrder tolerates a short or out-of-range order', () => {
  const items = headlines([
    '2005-03-02T00:00:00Z',
    '1989-11-15T00:00:00Z',
    '2015-06-01T00:00:00Z',
    '1997-01-20T00:00:00Z',
    '2020-08-30T00:00:00Z',
  ]);
  const short = checkOrder(items, [1, 3]);
  assert.equal(short.score, 2);
  assert.equal(short.allCorrect, false);
  const junk = checkOrder(items, [99, 3, 0, 2, 4]);
  assert.equal(junk.score, 4);
});

test('pubTime pushes invalid dates last rather than throwing', () => {
  const items = headlines(['not-a-date', '1990-01-01T00:00:00Z']);
  assert.deepEqual(chronologicalOrder(items), [1, 0]);
  assert.ok(pubTime('not-a-date') > pubTime('2999-01-01T00:00:00Z'));
});

test('dailyDate uses the Philadelphia calendar day', () => {
  // 03:30 UTC on Nov 5 is still Nov 4 in New York (EST after the fallback).
  assert.equal(dailyDate(new Date('2026-11-05T03:30:00Z')), '2026-11-04');
});

test('dailyDate rolls over at midnight in both EST and EDT', () => {
  assert.equal(dailyDate(new Date('2026-03-08T04:30:00Z')), '2026-03-07');
  assert.equal(dailyDate(new Date('2026-03-08T05:00:00Z')), '2026-03-08');
  assert.equal(dailyDate(new Date('2026-07-02T03:59:00Z')), '2026-07-01');
  assert.equal(dailyDate(new Date('2026-07-02T04:00:00Z')), '2026-07-02');
});

test('formatDate renders a full UTC date', () => {
  assert.equal(formatDate('1989-11-15T05:00:00Z'), 'November 15, 1989');
  assert.equal(formatDate('garbage'), 'garbage');
});

test('parseSavedResult round-trips a saved game and rejects junk', () => {
  const saved = { order: [3, 1, 0, 2, 4], score: 3, slotCorrect: [false, false, true, true, true] };
  assert.deepEqual(parseSavedResult(JSON.stringify(saved)), saved);
  assert.equal(parseSavedResult(null), undefined);
  assert.equal(parseSavedResult('not json'), undefined);
  assert.equal(parseSavedResult('{"order":"nope"}'), undefined);
});

test('shareText shows the puzzle id, score, emoji grid and link', () => {
  const puzzle = {
    date: '2026-11-04',
    number: 12,
    headlines: headlines([
      '2005-03-02T00:00:00Z',
      '1989-11-15T00:00:00Z',
      '2015-06-01T00:00:00Z',
      '1997-01-20T00:00:00Z',
      '2020-08-30T00:00:00Z',
    ]),
  };
  const text = shareText(puzzle, [true, false, true, true, false]);
  assert.equal(
    text,
    'Tri-meline #12 2026-11-04\n3/5\n\n🟩🟪🟩🟩🟪\n\nthetriangle.org/trimeline',
  );
});
