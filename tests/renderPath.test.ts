import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build, createServer, type ViteDevServer } from 'vite';
import { getViteConfig } from 'astro/config';
import { experimental_AstroContainer } from 'astro/container';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path: string) => readFileSync(join(root, path), 'utf8');
const require = createRequire(join(root, 'package.json'));

// Real renders rather than source matching: a Vite dev server compiles the
// .astro files and the container API renders them to HTML.
let server: ViteDevServer;
let container: Awaited<ReturnType<typeof experimental_AstroContainer.create>>;

// Nothing rendered here may reach the real CMS: every fetch is stubbed for the
// file's lifetime. /homepage answers with `homepageCarousel`; the rest 404,
// which every other reader already treats as a miss.
const realFetch = globalThis.fetch;
let homepageCarousel: unknown[] = [];

before(async () => {
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input instanceof Request ? input.url : input);
    const articles = cards.map((c) => ({ ...c, categories: [{ id: 1, name: 'News', slug: 'news' }] }));
    const pagination = { has_more: false };
    if (/\/homepage\b/.test(url)) {
      return Response.json({
        news: articles, opinion: [], sports: [], entertainment: [], candp: [], columns: [], developingstories: [],
        carousel: homepageCarousel,
      });
    }
    if (/\/sections\/news\/articles\b/.test(url)) {
      return Response.json({ section: { id: 1, name: 'News', slug: 'news' }, subsections: [], articles, pagination });
    }
    if (/\/authors\/jane-doe\/articles\b/.test(url)) {
      return Response.json({ author: { display_name: 'Jane Doe' }, articles, pagination });
    }
    return new Response('not stubbed', { status: 404 });
  };

  const config = await getViteConfig({
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
    logLevel: 'error',
  })({ command: 'serve', mode: 'test' });
  server = await createServer(config);
  container = await experimental_AstroContainer.create();
});

after(async () => {
  await server?.close();
  globalThis.fetch = realFetch;
});

async function render(
  component: string,
  props: Record<string, unknown> = {},
  params: Record<string, string> = {},
): Promise<string> {
  const mod = await server.ssrLoadModule(component);
  return container.renderToString(mod.default, { props, params });
}

const imgTags = (html: string) => html.match(/<img\b[^>]*>/g) ?? [];
const attr = (tag: string | undefined, name: string) => tag?.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];

function card(n: number) {
  return {
    slug: `story-${n}`,
    title: `Story ${n}`,
    authors: [],
    featured_image: `/images/story-${n}.jpg`,
    published_date: '2026-10-01T12:00:00Z',
    excerpt: `Excerpt ${n}`,
  };
}
const cards = Array.from({ length: 9 }, (_, i) => card(i));

// --- 1. Fonts ---------------------------------------------------------------

function walk(dir: string): string[] {
  return readdirSync(join(root, dir)).flatMap((name) => {
    const path = join(dir, name);
    return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
  });
}

test('no Google Fonts origin is requested anywhere in the site source', () => {
  const textFiles = [...walk('src'), ...walk('public'), 'astro.config.mjs', 'tailwind.config.mjs'].filter((path) =>
    ['.astro', '.css', '.ts', '.mjs', '.js', '.html', '.json', '.webmanifest', '.txt', ''].includes(extname(path)),
  );
  for (const path of textFiles) {
    assert.doesNotMatch(read(path), /fonts\.googleapis\.com|fonts\.gstatic\.com/, path);
  }
  assert.doesNotMatch(read('src/styles/global.css'), /@import\s+url\(\s*['"]?https?:/);
});

type FontFace = { family: string; style: string; weight: string; display: string; src: string; range: string };

function fontFaces(css: string): FontFace[] {
  return [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map(([, body]) => {
    const get = (prop: string) => body.match(new RegExp(`${prop}\\s*:\\s*([^;]+);`))?.[1].trim() ?? '';
    return {
      family: get('font-family').replace(/['"]/g, ''),
      style: get('font-style'),
      weight: get('font-weight'),
      display: get('font-display'),
      src: get('src'),
      range: get('unicode-range'),
    };
  });
}

// What the three Google Fonts imports served, latin + latin-ext only: Roboto
// Slab and Playfair Display at their default 400 upright, Libre Franklin's full
// variable weight axis upright and italic.
const EXPECTED_FACES = [
  { pkg: '@fontsource/roboto-slab', css: '400.css', file: 'roboto-slab-latin-400-normal.woff2', family: 'Roboto Slab', style: 'normal', weight: '400' },
  { pkg: '@fontsource/roboto-slab', css: '400.css', file: 'roboto-slab-latin-ext-400-normal.woff2', family: 'Roboto Slab', style: 'normal', weight: '400' },
  { pkg: '@fontsource/playfair-display', css: '400.css', file: 'playfair-display-latin-400-normal.woff2', family: 'Playfair Display', style: 'normal', weight: '400' },
  { pkg: '@fontsource/playfair-display', css: '400.css', file: 'playfair-display-latin-ext-400-normal.woff2', family: 'Playfair Display', style: 'normal', weight: '400' },
  { pkg: '@fontsource-variable/libre-franklin', css: 'wght.css', file: 'libre-franklin-latin-wght-normal.woff2', family: 'Libre Franklin', style: 'normal', weight: '100 900' },
  { pkg: '@fontsource-variable/libre-franklin', css: 'wght.css', file: 'libre-franklin-latin-ext-wght-normal.woff2', family: 'Libre Franklin', style: 'normal', weight: '100 900' },
  { pkg: '@fontsource-variable/libre-franklin', css: 'wght-italic.css', file: 'libre-franklin-latin-wght-italic.woff2', family: 'Libre Franklin', style: 'italic', weight: '100 900' },
  { pkg: '@fontsource-variable/libre-franklin', css: 'wght-italic.css', file: 'libre-franklin-latin-ext-wght-italic.woff2', family: 'Libre Franklin', style: 'italic', weight: '100 900' },
];

test('self-hosted @font-face rules match the Google faces and come from the pinned Fontsource packages', () => {
  const faces = fontFaces(read('src/styles/fonts.css'));
  assert.equal(faces.length, EXPECTED_FACES.length);

  const pkg = JSON.parse(read('package.json'));
  for (const expected of EXPECTED_FACES) {
    const face = faces.find((f) => f.src.includes(`/${expected.file}`));
    assert.ok(face, `missing @font-face for ${expected.file}`);
    assert.equal(face.family, expected.family, expected.file);
    assert.equal(face.style, expected.style, expected.file);
    assert.equal(face.weight, expected.weight, expected.file);
    assert.equal(face.display, 'swap', expected.file);

    // One woff2 source, imported from the package so Vite fingerprints and
    // emits it; no woff fallback for the service worker to precache.
    const url = face.src.match(/^url\(['"]?([^'")]+)['"]?\)\s+format\(['"]?(woff2|woff2-variations)['"]?\)$/)?.[1];
    assert.equal(url, `${expected.pkg}/files/${expected.file}`, expected.file);
    assert.ok(require.resolve(url), url);

    // Pinned exactly, so the lockfile decides what ships.
    assert.match(pkg.dependencies[expected.pkg] ?? '', /^\d+\.\d+\.\d+$/, expected.pkg);

    // Same unicode-range the package itself declares for that file, so the
    // browser still downloads only the subset a page actually uses.
    const upstream = fontFaces(readFileSync(require.resolve(`${expected.pkg}/${expected.css}`), 'utf8')).find((f) =>
      f.src.includes(`/${expected.file}`),
    );
    assert.ok(upstream?.range, `${expected.pkg}/${expected.css} has no range for ${expected.file}`);
    assert.equal(face.range, upstream.range, expected.file);
  }
});

test('a production build of global.css inlines the local faces and emits only their woff2 files, none precached', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'scalene-fonts-'));
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir,
        // Where Astro puts hashed assets, so the service worker's globs apply.
        assetsDir: '_astro',
        emptyOutDir: true,
        rollupOptions: { input: { global: join(root, 'src/styles/global.css') } },
      },
    });
    const files = walkAbs(outDir);
    const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(f, 'utf8')).join('\n');
    assert.doesNotMatch(css, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
    assert.doesNotMatch(css, /@import/);
    assert.equal(fontFaces(css).length, EXPECTED_FACES.length);

    const fonts = files.filter((f) => /\.(woff2?|ttf|otf|eot)$/.test(f)).map((f) => f.split('/').at(-1)!);
    assert.equal(fonts.length, EXPECTED_FACES.length, fonts.join(', '));
    for (const expected of EXPECTED_FACES) {
      const stem = expected.file.replace(/\.woff2$/, '');
      const emitted = fonts.find((f) => f.startsWith(`${stem}.`) || f.startsWith(`${stem}-`));
      assert.ok(emitted?.endsWith('.woff2'), `${expected.file} not emitted (got ${fonts.join(', ')})`);
      assert.match(css, new RegExp(`url\\([^)]*${emitted!.replace(/\./g, '\\.')}`), `${emitted} not referenced`);
    }

    // The precache list sw.js would get from the site's own workbox options:
    // the stylesheet yes, the fonts no -- precaching them would download every
    // face in the background and defeat unicode-range picking only what a page
    // uses. Hashed fonts still get ordinary immutable HTTP caching.
    const { workbox } = await import('../astro.config.mjs');
    const { getManifest } = createRequire(require.resolve('vite-plugin-pwa'))('workbox-build');
    const { manifestEntries } = await getManifest({
      globDirectory: outDir,
      globPatterns: workbox.globPatterns,
      dontCacheBustURLsMatching: workbox.dontCacheBustURLsMatching,
    });
    const precached: string[] = manifestEntries.map((entry: { url: string }) => entry.url);
    assert.ok(precached.some((url) => /^_astro\/.+\.css$/.test(url)), precached.join(', '));
    assert.deepEqual(precached.filter((url) => /\.(woff2?|ttf|otf|eot)$/.test(url)), []);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
});

function walkAbs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walkAbs(path) : [path];
  });
}

// --- 2. Lead-card image priority --------------------------------------------

test('PhotoArticle images stay lazy by default', async () => {
  const [img] = imgTags(await render('/src/components/PhotoArticle.astro', { title: 'T', image: '/x.jpg', slug: 'article/x' }));
  assert.equal(attr(img, 'loading'), 'lazy');
  assert.equal(attr(img, 'fetchpriority'), undefined);
});

test('PhotoArticle priority mode loads eagerly at high fetch priority', async () => {
  const [img] = imgTags(
    await render('/src/components/PhotoArticle.astro', { title: 'T', image: '/x.jpg', slug: 'article/x', priority: true }),
  );
  assert.equal(attr(img, 'loading'), 'eager');
  assert.equal(attr(img, 'fetchpriority'), 'high');
});

for (const style of ['5-3-4', '3-6-3']) {
  test(`Section ${style}: priority reaches only the lead card`, async () => {
    const imgs = imgTags(await render('/src/components/Sections/Section.astro', { articles: cards, style, priority: true }));
    assert.equal(imgs.length, 3);
    const eager = imgs.filter((img) => attr(img, 'loading') === 'eager');
    assert.equal(eager.length, 1);
    assert.equal(attr(eager[0], 'src'), cards[0].featured_image);
    assert.equal(attr(eager[0], 'fetchpriority'), 'high');
    for (const img of imgs.filter((i) => i !== eager[0])) {
      assert.equal(attr(img, 'loading'), 'lazy');
      assert.equal(attr(img, 'fetchpriority'), undefined);
    }
  });

  test(`Section ${style}: without priority every card stays lazy`, async () => {
    const imgs = imgTags(await render('/src/components/Sections/Section.astro', { articles: cards, style }));
    assert.equal(imgs.length, 3);
    assert.ok(imgs.every((img) => attr(img, 'loading') === 'lazy' && attr(img, 'fetchpriority') === undefined));
  });
}

const sectionTags = (path: string) => read(path).match(/<Section\b[^>]*\/>/g) ?? [];

test('only the first, above-the-fold Section on section and author pages asks for priority', () => {
  for (const [page, style] of [
    ['src/pages/[sectionSlug].astro', '5-3-4'],
    ['src/pages/author/[author].astro', '5-3-4'],
  ]) {
    const tags = sectionTags(page);
    const prioritized = tags.filter((tag) => /\spriority\b/.test(tag));
    assert.equal(prioritized.length, 1, page);
    assert.equal(prioritized[0], tags[0], `${page}: priority must be on the first Section`);
    assert.match(prioritized[0], new RegExp(`style="${style}"`), page);
  }
  // The homepage's desktop LCP is the anniversary background (see below). On
  // phones it is the news lead image, but that is requested early and raised
  // to high priority by layout anyway: measured, `priority` there bought
  // nothing, and on desktop it would race the background.
  for (const page of ['src/pages/index.astro', 'src/pages/search.astro', 'src/pages/[sections]/[article].astro']) {
    assert.ok(sectionTags(page).every((tag) => !/\spriority\b/.test(tag)), page);
  }
});

// --- 3. Homepage anniversary background -------------------------------------

const ANNIVERSARY = '/images/100YearBanner.webp';
const preloads = (html: string) =>
  (html.match(/<link\b[^>]*>/g) ?? []).filter((tag) => attr(tag, 'rel') === 'preload' && attr(tag, 'href') === ANNIVERSARY);
const imageOnlySlides = [
  { enabled: true, title: 'Podcast', link_url: '/p', image_url: '/images/PodcastBanner.webp', background_color: '', text_color: '', desktop_only: false },
];
const disabledAnniversary = [
  ...imageOnlySlides,
  { enabled: false, title: '100 Years', link_url: '/one-hundred', image_url: '', background_color: '', text_color: '', desktop_only: true },
];

test('anniversary background gets exactly one desktop-only preload when the carousel renders it', async () => {
  for (const slides of [[], undefined]) {
    const banner = await render('/src/components/Banner.astro', { slides });
    assert.match(banner, /class="one-hundred-bg hidden md:block"/);

    const [link, ...rest] = preloads(await render('/src/components/HeroBackgroundPreload.astro', { slides }));
    assert.equal(rest.length, 0);
    assert.ok(link, 'expected a preload for the anniversary background');
    assert.equal(attr(link, 'as'), 'image');
    assert.equal(attr(link, 'fetchpriority'), 'high');
    // Same breakpoint as `hidden md:block`: phones never paint it, so they
    // must not download it either.
    assert.equal(attr(link, 'media'), '(min-width: 768px)');
  }
});

test('no anniversary preload when the carousel does not render the background', async () => {
  for (const slides of [imageOnlySlides, disabledAnniversary]) {
    const banner = await render('/src/components/Banner.astro', { slides });
    assert.doesNotMatch(banner, /one-hundred-bg/);
    assert.equal(preloads(await render('/src/components/HeroBackgroundPreload.astro', { slides })).length, 0);
  }
});

// The whole homepage, with the CMS stubbed out: proves the hint lands in <head>
// (BaseLayout's "head" slot) and tracks the carousel the Banner is given.
async function renderHomepage(carousel: unknown[]): Promise<string> {
  homepageCarousel = carousel;
  server.moduleGraph.invalidateAll(); // drop any cached homepage from the last render
  return render('/src/pages/index.astro');
}

test('homepage <head> carries the anniversary preload exactly when its Banner draws the background', async () => {
  const withBackground = await renderHomepage([]);
  const head = withBackground.slice(0, withBackground.indexOf('</head>'));
  assert.equal(preloads(head).length, 1);
  assert.equal(preloads(withBackground).length, 1);
  assert.match(withBackground, /class="one-hundred-bg hidden md:block"/);

  const without = await renderHomepage(imageOnlySlides);
  assert.equal(preloads(without).length, 0);
  assert.doesNotMatch(without, /one-hundred-bg/);
});

/** Every image the page asks the browser to fetch ahead of normal priority. */
function priorityImageResources(html: string): string[] {
  const imgs = imgTags(html).filter((img) => attr(img, 'fetchpriority') === 'high');
  const links = (html.match(/<link\b[^>]*>/g) ?? []).filter(
    (tag) => attr(tag, 'rel') === 'preload' && attr(tag, 'as') === 'image',
  );
  return [...imgs, ...links];
}

const storyImgs = (html: string) => imgTags(html).filter((img) => attr(img, 'src')?.startsWith('/images/story-'));

test('anniversary homepage has exactly one high-priority image resource: the background preload', async () => {
  const html = await renderHomepage([]);
  const [only, ...rest] = priorityImageResources(html);
  assert.deepEqual(rest, [], 'nothing may compete with the LCP background');
  assert.equal(attr(only, 'href'), ANNIVERSARY);

  // No card asks for priority either, the lead included (see above).
  const cardImgs = storyImgs(html);
  assert.ok(cardImgs.length > 1);
  assert.equal(attr(cardImgs.find((img) => attr(img, 'src') === cards[0].featured_image), 'loading'), 'lazy');
  assert.ok(cardImgs.every((img) => attr(img, 'loading') === 'lazy' && attr(img, 'fetchpriority') === undefined));
});

// Phones hide the sidebar, but an eager <img> under display:none still
// downloads. The subscribe image (~340 KB) was the biggest download competing
// with the phone LCP; lazy, a hidden sidebar fetches nothing.
test('the sidebar subscribe image is lazy, so phones that hide the sidebar never fetch it', async () => {
  const [img, ...rest] = imgTags(await render('/src/components/SubscribeLink.astro'));
  assert.equal(rest.length, 0);
  assert.equal(attr(img, 'src'), '/images/subscribe.webp');
  assert.equal(attr(img, 'loading'), 'lazy');

  const html = await renderHomepage([]);
  const sidebar = html.slice(html.indexOf('id="main-right"'));
  assert.match(html, /id="main-right" class="hidden sm:block/);
  const subscribe = imgTags(sidebar).filter((tag) => attr(tag, 'src') === '/images/subscribe.webp');
  assert.equal(subscribe.length, 1);
  assert.equal(attr(subscribe[0], 'loading'), 'lazy');
});

for (const [name, page, params] of [
  ['section', '/src/pages/[sectionSlug].astro', { sectionSlug: 'news' }],
  ['author', '/src/pages/author/[author].astro', { author: 'jane-doe' }],
] as const) {
  test(`${name} page: the lead card is the one eager, high-priority image`, async () => {
    const html = await render(page, {}, params);
    const [only, ...rest] = priorityImageResources(html);
    assert.deepEqual(rest, []);
    assert.equal(attr(only, 'src'), cards[0].featured_image);
    assert.equal(attr(only, 'loading'), 'eager');

    const others = storyImgs(html).filter((img) => img !== only);
    assert.ok(others.length > 0);
    assert.ok(others.every((img) => attr(img, 'loading') === 'lazy' && attr(img, 'fetchpriority') === undefined));
  });
}

test('the preload targets the URL the CSS background fetches, and only the homepage carries it', () => {
  assert.match(read('src/styles/global.css'), /\.one-hundred-bg\s*{[^}]*url\("\/images\/100YearBanner\.webp"\)/);

  const index = read('src/pages/index.astro');
  const hint = index.match(/<HeroBackgroundPreload\b[^>]*\/>/g) ?? [];
  assert.equal(hint.length, 1);
  assert.match(hint[0], /slot="head"/);
  // Fed the same slides as the Banner, so the hint and the background agree.
  const slidesExpr = (tag: string) => tag.match(/slides=\{([^}]*)\}/)?.[1];
  assert.equal(slidesExpr(hint[0]), slidesExpr(index.match(/<Banner\b[^>]*\/>/)![0]));

  for (const path of walk('src').filter((p) => p.endsWith('.astro') && p !== join('src', 'pages', 'index.astro'))) {
    assert.doesNotMatch(read(path), /<HeroBackgroundPreload\b/, path);
    assert.doesNotMatch(read(path), /rel="preload"[^>]*100YearBanner/, path);
  }
});

// --- Guard: analytics and ads are untouched ---------------------------------

const sha = (text: string) => createHash('sha256').update(text).digest('hex');
const adScripts = (path: string) =>
  [...read(path).matchAll(/<script\b[\s\S]*?<\/script>/g)]
    .map((m) => m[0])
    .filter((block) => /googlesyndication|flytedesk/.test(block))
    .join('\n');

// Pinned: a change to analytics or ad loading has to update these on purpose.
test('Matomo and ad code are byte-for-byte unchanged', () => {
  assert.equal(sha(read('src/components/Matomo.astro')), 'be01845850efcc51ef840b8aa4e58bfa8af47bf1947c7b72b2ca9e67c5712973');
  assert.equal(sha(read('src/components/Ad.astro')), '76a61f2b4ce5ea4bf4954489403264bb27dc5aafa78a822adadd4a43fc366a7a');
  assert.equal(sha(read('src/utils/ads.ts')), '654ca4f667281d5450ecbd3abe8b7aeb4401b6fe19bd7b78006f0d7dbd0f67a0');
  assert.equal(sha(adScripts('src/layouts/BaseLayout.astro')), AD_SCRIPTS_SHA.base);
  assert.equal(sha(adScripts('src/layouts/ArticleLayout.astro')), AD_SCRIPTS_SHA.article);
  assert.match(read('src/layouts/BaseLayout.astro'), /<link rel="dns-prefetch" href="https:\/\/pagead2\.googlesyndication\.com" \/>/);
  assert.match(read('src/layouts/BaseLayout.astro'), /<link rel="dns-prefetch" href="https:\/\/stats\.thetriangle\.org" \/>/);
});

const AD_SCRIPTS_SHA = {
  base: '415c1f6be58b60d70288fc016d6d43f939f19896e57ed5b0c798cf8325b3bbef',
  article: '415c1f6be58b60d70288fc016d6d43f939f19896e57ed5b0c798cf8325b3bbef',
};
