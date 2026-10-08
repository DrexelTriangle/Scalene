import test from 'node:test';
import assert from 'node:assert/strict';
import { isFooterEntryVisible, normalizeFooterColumns } from '../src/utils/footer.ts';

const now = Date.parse('2026-10-07T16:00:00Z');
const labels = (columns: ReturnType<typeof normalizeFooterColumns>) =>
  columns.map((column) => column.entries.map((entry) => entry.label || '<spacer>'));

test('future visible_from hides the entry', () => {
  assert.equal(isFooterEntryVisible('2026-10-07T16:00:01Z', now), false);
  assert.equal(isFooterEntryVisible('2026-10-07T12:00:01-04:00', now), false);
});

test('visible_from at or before now shows the entry', () => {
  assert.equal(isFooterEntryVisible('2026-10-07T16:00:00Z', now), true);
  assert.equal(isFooterEntryVisible('2026-10-07T12:00:00-04:00', now), true);
  assert.equal(isFooterEntryVisible('2026-10-07T15:59:59.999Z', now), true);
  assert.equal(isFooterEntryVisible('2020-01-01T00:00:00Z', now), true);
});

test('missing, malformed, non-string or blank visible_from fails open', () => {
  for (const value of [
    undefined,
    null,
    '',
    '   ',
    'tomorrow',
    '2099-01-01',
    '2099-01-01 00:00:00',
    '2099-13-01T00:00:00Z',
    'Jan 1 2099',
    4102444800000,
    true,
    { at: '2099-01-01T00:00:00Z' },
  ]) {
    assert.equal(isFooterEntryVisible(value, now), true, `value: ${JSON.stringify(value)}`);
  }
});

test('normalizeFooterColumns drops only scheduled-future entries', () => {
  const columns = normalizeFooterColumns(
    [
      {
        entries: [
          { kind: 'heading', label: 'Comics & Puzzles', href: '/comics-puzzles' },
          { kind: 'link', label: 'Crossword', href: '/crossword' },
          { kind: 'link', label: 'Games', href: '/games', visible_from: '2026-10-08T00:00:00Z' },
          { kind: 'link', label: 'Sudoku', href: '/sudoku', visible_from: '2026-10-07T16:00:00Z' },
          { kind: 'link', label: 'Wordangle', href: '/wordangle', visible_from: 'soon' },
        ],
      },
    ],
    now,
  );
  assert.deepEqual(labels(columns), [['Comics & Puzzles', 'Crossword', 'Sudoku', 'Wordangle']]);
  assert.deepEqual(Object.keys(columns[0].entries[2]).sort(), ['href', 'kind', 'label', 'new_tab']);
});

test('a column left with only spacers after filtering is dropped', () => {
  const future = '2026-10-08T00:00:00Z';
  const raw = [
    { entries: [{ kind: 'heading', label: 'About', href: '/about' }] },
    {
      entries: [
        { kind: 'heading', label: 'Games', href: '/games', visible_from: future },
        { kind: 'spacer' },
        { kind: 'link', label: 'Wordangle', href: '/wordangle', visible_from: future },
      ],
    },
    { entries: [{ kind: 'link', label: 'Later', href: '/later', visible_from: future }] },
  ];
  assert.deepEqual(labels(normalizeFooterColumns(raw, now)), [['About']]);
  assert.deepEqual(labels(normalizeFooterColumns(raw, Date.parse(future))), [
    ['About'],
    ['Games', '<spacer>', 'Wordangle'],
    ['Later'],
  ]);
});

test('a scheduled spacer is hidden until its instant', () => {
  const raw = [
    {
      entries: [
        { kind: 'heading', label: 'Opinion', href: '/opinion' },
        { kind: 'spacer', visible_from: '2026-10-08T00:00:00Z' },
      ],
    },
  ];
  assert.deepEqual(labels(normalizeFooterColumns(raw, now)), [['Opinion']]);
});

test('existing normalization still applies alongside scheduling', () => {
  const columns = normalizeFooterColumns(
    [
      null,
      { entries: 'nope' },
      { entries: [{ kind: 'bogus', label: '  Staff ', href: ' /staff ', new_tab: 1 }, { label: '   ' }, null] },
    ],
    now,
  );
  assert.deepEqual(columns, [{ entries: [{ kind: 'link', label: 'Staff', href: '/staff', new_tab: true }] }]);
  assert.deepEqual(normalizeFooterColumns('not an array', now), []);
});
