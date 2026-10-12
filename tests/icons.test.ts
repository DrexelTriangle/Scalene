import test from 'node:test';
import assert from 'node:assert/strict';
import { iconA11yAttributes, icons } from '../src/utils/icons.ts';

test('a labelled icon is an image with that accessible name', () => {
  assert.deepEqual(iconA11yAttributes('Instagram'), { role: 'img', 'aria-label': 'Instagram' });
  assert.deepEqual(iconA11yAttributes('  Reddit '), { role: 'img', 'aria-label': 'Reddit' });
});

test('an unlabelled icon is hidden from assistive tech and never focusable', () => {
  for (const label of [undefined, '', '   ']) {
    assert.deepEqual(iconA11yAttributes(label), { 'aria-hidden': 'true', focusable: 'false' });
  }
});

test('every glyph fits the 1.25em x 1em box Icon.astro renders it in', () => {
  // Icon.astro sizes each SVG 1.25em wide and 1em tall, the box Font Awesome 7
  // drew its glyphs in. A viewBox 512 units tall and at most 640 wide fills
  // that box at the webfont's size; anything else would render smaller.
  for (const [name, icon] of Object.entries(icons)) {
    const [minX, minY, width, height] = icon.viewBox.split(' ').map(Number);
    assert.deepEqual([minX, minY, height], [0, 0, 512], name);
    assert.ok(width > 0 && width / height <= 1.25, `${name} is ${width} wide`);
    assert.match(icon.path, /^M[\d\s.,\-a-zA-Z]+$/, name);
  }
});
