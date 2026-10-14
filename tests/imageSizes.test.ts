import test from 'node:test';
import assert from 'node:assert/strict';
import { slotSizes } from '../src/utils/imageSizes.ts';

/** The width `sizes` advertises at a viewport width, in CSS px. */
function resolve(sizes: string, viewport: number): number {
  for (const entry of sizes.split(',').map((s) => s.trim())) {
    const media = entry.match(/^\(min-width:\s*(\d+)px\)\s+(.+)$/);
    const length = media ? (viewport >= Number(media[1]) ? media[2] : null) : entry;
    if (length === null) continue;
    const px = length.match(/^(\d+(?:\.\d+)?)px$/);
    if (px) return Number(px[1]);
    const vw = length.match(/^(\d+(?:\.\d+)?)vw$/);
    if (vw) return (Number(vw[1]) * viewport) / 100;
    throw new Error(`unparsed length ${length}`);
  }
  throw new Error(`no default length in ${sizes}`);
}

/** The rendition a browser picks at DPR 1 from the CMS's 480w/960w/... set. */
const pick = (sizes: string, viewport: number, dpr = 1) =>
  [480, 960, 1440, 1920].find((w) => w >= resolve(sizes, viewport) * dpr) ?? 1920;

test('3-6-3 lead advertises its real ~576px desktop slot, not an undersized one', () => {
  const lead = slotSizes('full', { md: { share: 6 / 9, gutter: 24 }, lg: { share: 6 / 12, gutter: 24 } });
  assert.equal(lead, '(min-width: 1280px) 576px, (min-width: 1024px) 426px, (min-width: 768px) 60vw, 90vw');
  assert.equal(resolve(lead, 1440), 576);
  assert.equal(pick(lead, 1440), 960);
});

test('3-6-3 side cards advertise ~288px, so a 1x desktop picks the 480w rendition', () => {
  const side = slotSizes('full', { md: { share: 3 / 9 }, lg: { share: 3 / 12, gutter: 12 } });
  assert.equal(side, '(min-width: 1280px) 288px, (min-width: 1024px) 213px, (min-width: 768px) 30vw, 90vw');
  assert.equal(pick(side, 1440), 480);
  assert.equal(pick(side, 1100), 480);
  assert.equal(pick(side, 1440, 2), 960);
});

test('6-6 in the homepage main column advertises ~388px, not the old 500px', () => {
  const sizes = slotSizes('main', { md: { share: 1 / 2, gutter: 12 } });
  assert.equal(sizes, '(min-width: 1280px) 388px, (min-width: 1024px) 288px, (min-width: 768px) 30vw, (min-width: 640px) 60vw, 90vw');
  assert.equal(pick(sizes, 1440), 480);
});

test('rows split their column evenly between cards, less the 32px gaps', () => {
  const row = (column: 'full' | 'main', n: number) =>
    slotSizes(column, { sm: { share: 1 / n, gutter: (32 * (n - 1)) / n } });
  assert.equal(row('full', 4), '(min-width: 1280px) 276px, (min-width: 1024px) 201px, (min-width: 640px) 23vw, 90vw');
  assert.equal(row('main', 3), '(min-width: 1280px) 246px, (min-width: 1024px) 179px, (min-width: 640px) 20vw, 90vw');
  assert.equal(pick(row('full', 4), 1440), 480);
  assert.equal(pick(row('main', 3), 1440), 480);
});

test('a slot never advertises less than it draws: widths round up', () => {
  // 900px * 3/8 = 337.5px; 90vw * 3/8 = 33.75vw
  assert.equal(slotSizes('full', { md: { share: 3 / 8 } }), '(min-width: 1280px) 450px, (min-width: 1024px) 338px, (min-width: 768px) 34vw, 90vw');
});
