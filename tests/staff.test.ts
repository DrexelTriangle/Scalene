import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PORTRAIT_SRC,
  EAGER_PORTRAITS,
  PORTRAIT_SIZES,
  STAFF,
  original,
  portraitAttrs,
  portraitDerivative,
  responsive,
  type Portrait,
  type StaffMember,
} from '../src/utils/staff.ts';

const member = (photo: Portrait | null): StaffMember => ({
  name: 'Test Person',
  role: 'Tester',
  emails: ['desk@thetriangle.org', 'test.person@thetriangle.org'],
  photo,
});

// The candidates a browser would choose from, as [url, width] pairs. An empty
// srcset offers none ("".split() would yield one empty entry).
const candidates = (srcset: string) =>
  (srcset ? srcset.split(', ') : []).map((entry) => {
    const [url, descriptor] = entry.split(' ');
    assert.match(descriptor, /^\d+w$/);
    return [url, Number.parseInt(descriptor, 10)] as const;
  });

test('derivative names follow the WordPress sub-size convention', () => {
  assert.equal(
    portraitDerivative('2026/04/SanjanaBandi_byKaseyShamis_Scaled.jpg', 240, 300),
    '/proxy/wp-content/uploads/2026/04/SanjanaBandi_byKaseyShamis_Scaled-240x300.jpg',
  );
  // Only the last dot is the extension.
  assert.equal(
    portraitDerivative('2026/04/A.B_c.jpeg', 768, 960),
    '/proxy/wp-content/uploads/2026/04/A.B_c-768x960.jpeg',
  );
  assert.throws(() => portraitDerivative('2026.04/no-extension', 240, 300));
});

test('a responsive portrait offers only the 240w and 768w derivatives', () => {
  const attrs = portraitAttrs(member(responsive('2026/04/Foo_Scaled.jpg')), 0);
  assert.deepEqual(candidates(attrs.srcset ?? ''), [
    ['/proxy/wp-content/uploads/2026/04/Foo_Scaled-240x300.jpg', 240],
    ['/proxy/wp-content/uploads/2026/04/Foo_Scaled-768x960.jpg', 768],
  ]);
  // The fallback src is a derivative too, never the multi-MB original.
  assert.equal(attrs.src, '/proxy/wp-content/uploads/2026/04/Foo_Scaled-240x300.jpg');
  assert.equal(attrs.sizes, PORTRAIT_SIZES);
  assert.deepEqual([attrs.width, attrs.height], [240, 300]);
  assert.equal(attrs.alt, 'Portrait of Test Person');
  assert.equal(attrs.decoding, 'async');
});

test('an original-only portrait is served as-is at its intrinsic size', () => {
  const attrs = portraitAttrs(member(original('2026/01/Bar.jpg', 1200, 800)), EAGER_PORTRAITS);
  assert.deepEqual(attrs, {
    src: '/proxy/wp-content/uploads/2026/01/Bar.jpg',
    width: 1200,
    height: 800,
    alt: 'Portrait of Test Person',
    loading: 'lazy',
    decoding: 'async',
  });
});

test('no photo falls back to the default portrait with no srcset', () => {
  const attrs = portraitAttrs(member(null), 0);
  assert.equal(attrs.src, DEFAULT_PORTRAIT_SRC);
  assert.equal(attrs.srcset, undefined);
  assert.deepEqual(candidates(attrs.srcset ?? ''), []);
  assert.equal(attrs.sizes, undefined);
  // Decorative: the name is right below it.
  assert.equal(attrs.alt, '');
  assert.ok(attrs.width > 0 && attrs.height > 0);
});

test('only the first row loads eagerly', () => {
  const loading = STAFF.map((m, i) => portraitAttrs(m, i).loading);
  assert.deepEqual(loading.slice(0, EAGER_PORTRAITS), Array(EAGER_PORTRAITS).fill('eager'));
  assert.ok(loading.slice(EAGER_PORTRAITS).every((l) => l === 'lazy'));
  assert.equal(EAGER_PORTRAITS, 5);
});

test('sizes covers every breakpoint and ends with an unconditional width', () => {
  const parts = PORTRAIT_SIZES.split(', ');
  assert.deepEqual(
    parts.slice(0, -1).map((p) => p.match(/^\(min-width: (\d+)px\)/)?.[1]),
    ['1280', '1024', '640'],
  );
  assert.doesNotMatch(parts.at(-1) ?? '', /^\(/);
});

test('staff roster invariants', () => {
  assert.equal(STAFF.length, 25);
  assert.equal(new Set(STAFF.map((m) => m.name)).size, STAFF.length);
  const personal = STAFF.map((m) => m.emails[1]);
  assert.equal(new Set(personal).size, STAFF.length);
  for (const m of STAFF) {
    assert.ok(m.name.trim() && m.role.trim(), `${m.name} needs a name and role`);
    for (const email of m.emails) {
      assert.match(email, /^[a-z.-]+@thetriangle\.org$/, `${m.name}: ${email}`);
    }
    assert.ok(m.photo, `${m.name} has a photo`);
    assert.match(m.photo.path, /^\d{4}\/\d{2}\/[^/]+\.jpg$/, `${m.name}: ${m.photo.path}`);
  }
});

test('everyone but Joshua gets responsive derivatives', () => {
  const kinds = STAFF.map((m) => [m.name, m.photo?.kind]);
  assert.deepEqual(
    kinds.filter(([, kind]) => kind !== 'responsive'),
    [['Joshua Fendyke', 'original']],
  );
  assert.equal(kinds.filter(([, kind]) => kind === 'responsive').length, 24);
});

test('Joshua is the live original with no srcset or sizes', () => {
  const index = STAFF.findIndex((m) => m.name === 'Joshua Fendyke');
  assert.equal(index, 2);
  assert.deepEqual(portraitAttrs(STAFF[index], index), {
    src: '/proxy/wp-content/uploads/2026/09/josh-fendyke-scaled.jpg',
    width: 5198,
    height: 3462,
    alt: 'Portrait of Joshua Fendyke',
    loading: 'eager',
    decoding: 'async',
  });
});
