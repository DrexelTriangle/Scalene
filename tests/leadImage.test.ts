import test from 'node:test';
import assert from 'node:assert/strict';
import { prioritizeLeadImage } from '../src/utils/articleHtml.ts';

test('the lead photo loses loading=lazy and gains high fetch priority', () => {
  const html = '<figure><img src="/a.webp" alt="" loading="lazy"></figure><p>Body</p>';
  assert.equal(
    prioritizeLeadImage(html),
    '<figure><img loading="eager" fetchpriority="high" src="/a.webp" alt=""></figure><p>Body</p>',
  );
});

test('only the first image is touched', () => {
  const html = '<img src="/a.webp" loading="lazy"><p>Text</p><img src="/b.webp" loading="lazy">';
  const out = prioritizeLeadImage(html);
  assert.match(out, /^<img loading="eager" fetchpriority="high" src="\/a.webp">/);
  assert.match(out, /<img src="\/b.webp" loading="lazy">$/);
});

test('an image after several paragraphs stays lazy', () => {
  const prose = '<p>' + 'word '.repeat(80) + '</p>';
  const html = prose + '<img src="/a.webp" loading="lazy">';
  assert.equal(prioritizeLeadImage(html), html);
});

test('a short dek before the image still counts as the lead', () => {
  const html = '<p><em>Photo by Staff</em></p><img src="/a.webp" loading=\'lazy\'>';
  assert.equal(
    prioritizeLeadImage(html),
    '<p><em>Photo by Staff</em></p><img loading="eager" fetchpriority="high" src="/a.webp">',
  );
});

test('bodies without images are unchanged', () => {
  assert.equal(prioritizeLeadImage('<p>Just text</p>'), '<p>Just text</p>');
  assert.equal(prioritizeLeadImage(''), '');
});
