import test from 'node:test';
import assert from 'node:assert/strict';
import { renderFeed } from '../src/utils/feed.ts';
import type { ArticleSummary } from '../src/utils/types.ts';

const article = (slug: string, featured_image: unknown) =>
  ({ slug, title: slug, excerpt: `${slug} excerpt`, featured_image, published_date: '2025-02-03T04:05:06Z', categories: [] }) as unknown as ArticleSummary;

const itemFor = (xml: string, slug: string) => {
  const item = xml.split('<item>').find((chunk) => chunk.includes(`/article/${slug}</link>`));
  assert.ok(item, `no <item> for ${slug}`);
  return item.slice(0, item.indexOf('</item>'));
};

test('feed: featured image is exposed as Media RSS and as an <img> in content:encoded', () => {
  const xml = renderFeed('The Triangle', [
    article('abs', 'https://media.thetriangle.org/2025/02/photo.jpg?w=1&h=2'),
    article('rel', '/proxy/wp-content/uploads/2024/12/IMG_2493.jpg'),
  ]);

  assert.match(xml, /<rss [^>]*xmlns:media="http:\/\/search\.yahoo\.com\/mrss\/"/);
  assert.match(xml, /<rss [^>]*xmlns:content="http:\/\/purl\.org\/rss\/1\.0\/modules\/content\/"/);

  const abs = itemFor(xml, 'abs');
  assert.match(abs, /<media:content url="https:\/\/media\.thetriangle\.org\/2025\/02\/photo\.jpg\?w=1&amp;h=2" medium="image" \/>/);
  // Legacy WordPress feed consumers (DrexelOne) look for an <img> in content:encoded.
  assert.match(abs, /<content:encoded>&lt;img src=&quot;https:\/\/media\.thetriangle\.org\/2025\/02\/photo\.jpg\?w=1&amp;amp;h=2&quot;/);
  assert.match(abs, /<content:encoded>[^<]*abs excerpt[^<]*<\/content:encoded>/);

  // Site-relative paths are made absolute against the public origin.
  const rel = itemFor(xml, 'rel');
  assert.match(rel, /<media:content url="https:\/\/www\.thetriangle\.org\/proxy\/wp-content\/uploads\/2024\/12\/IMG_2493\.jpg" medium="image" \/>/);
});

test('feed: missing, blank and -1 sentinel images emit no image markup', () => {
  const xml = renderFeed('The Triangle', [
    article('none', undefined),
    article('null', null),
    article('blank', '   '),
    article('sentinel', '-1'),
    article('numeric', -1),
  ]);
  for (const slug of ['none', 'null', 'blank', 'sentinel', 'numeric']) {
    const item = itemFor(xml, slug);
    assert.doesNotMatch(item, /media:content|<content:encoded>&lt;img/, slug);
  }
});
