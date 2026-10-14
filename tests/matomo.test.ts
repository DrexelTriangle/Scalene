import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const matomoSource = read('src/components/Matomo.astro');

function inlineScript(): string {
  const scripts = [...matomoSource.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 1, 'Matomo.astro should ship exactly one script');
  assert.match(scripts[0][1], /is:inline/);
  return scripts[0][2];
}

type Command = unknown[];
type Listener = () => void;

class FakeElement {
  private attrs = new Map<string, string>();
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, value);
  }
}

/**
 * Just enough browser for the tracker snippet: a document whose <body> can be
 * swapped the way ClientRouter swaps it, document events, and a stand-in for
 * matomo.js taking over window._paq once it "loads".
 */
function fakeBrowser() {
  const listeners = new Map<string, Listener[]>();
  const injected: { src?: string; async?: boolean }[] = [];
  const document = {
    title: 'The Triangle',
    body: new FakeElement(),
    addEventListener(type: string, fn: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), fn]);
    },
    createElement: () => ({}),
    getElementsByTagName: () => [{ parentNode: { insertBefore: (node: object) => injected.push(node) } }],
  };
  const window: Record<string, unknown> = { document, location: { href: 'https://www.thetriangle.org/' } };
  window.window = window;
  const context = vm.createContext(window);
  const script = new vm.Script(inlineScript());
  const sent: Command[] = [];

  return {
    injected,
    /** Commands that reached the tracker, whether queued or pushed after load. */
    commands(): Command[] {
      const queue = window._paq;
      // JSON round trip: arrays built inside the vm context have another
      // realm's prototype, which deepStrictEqual rejects.
      return JSON.parse(JSON.stringify(Array.isArray(queue) ? [...queue, ...sent] : sent));
    },
    pageViews() {
      return this.commands().filter((c) => c[0] === 'trackPageView').length;
    },
    run() {
      script.runInContext(context);
    },
    fire(type: string) {
      for (const fn of listeners.get(type) ?? []) fn();
    },
    /** matomo.js replaces the array with an object whose push() sends. */
    loadMatomoJs() {
      sent.push(...(window._paq as Command[]));
      window._paq = { push: (command: Command) => sent.push(command) };
    },
    /** What ClientRouter does: new head (title) and a brand-new <body>. */
    swapTo(href: string, title: string) {
      (window.location as { href: string }).href = href;
      document.title = title;
      document.body = new FakeElement();
    },
  };
}

test('ClientRouter page: initial load counts one view despite inline run + astro:page-load', () => {
  const b = fakeBrowser();
  b.run();
  b.fire('DOMContentLoaded');
  b.loadMatomoJs();
  b.fire('astro:page-load'); // ClientRouter fires this on window load too
  assert.equal(b.pageViews(), 1);
});

test('each ClientRouter navigation counts exactly one view, with the new URL and title', () => {
  const b = fakeBrowser();
  b.run();
  b.loadMatomoJs();
  b.fire('astro:page-load');

  b.swapTo('https://www.thetriangle.org/news', 'News');
  // Astro does not re-run an inline script whose text it has already run...
  b.fire('astro:page-load');
  assert.equal(b.pageViews(), 2);

  b.swapTo('https://www.thetriangle.org/sports', 'Sports');
  // ...but if something re-runs it anyway (data-astro-rerun, Rocket Loader),
  // the view is still keyed to the new body and counted once.
  b.run();
  b.fire('astro:page-load');
  assert.equal(b.pageViews(), 3);

  const commands = b.commands();
  const last = commands.findLastIndex((c) => c[0] === 'trackPageView');
  assert.deepEqual(commands.slice(last - 2, last + 1), [
    ['setCustomUrl', 'https://www.thetriangle.org/sports'],
    ['setDocumentTitle', 'Sports'],
    ['trackPageView'],
  ]);
});

test('ArticleLayout page (no ClientRouter, no astro:page-load) counts one view', () => {
  const b = fakeBrowser();
  b.run();
  b.fire('DOMContentLoaded');
  b.loadMatomoJs();
  assert.equal(b.pageViews(), 1);
});

test('tracker is initialised once: one matomo.js, one link-tracking and site setup', () => {
  const b = fakeBrowser();
  b.run();
  b.loadMatomoJs();
  b.fire('astro:page-load');
  for (const page of ['a', 'b', 'c']) {
    b.swapTo(`https://www.thetriangle.org/${page}`, page);
    b.run();
    b.fire('astro:page-load');
  }
  const count = (name: string) => b.commands().filter((c) => c[0] === name).length;
  assert.equal(count('enableLinkTracking'), 1);
  assert.equal(count('setTrackerUrl'), 1);
  assert.equal(count('setSiteId'), 1);
  assert.deepEqual(b.commands().find((c) => c[0] === 'setSiteId'), ['setSiteId', '1']);
  assert.deepEqual(b.injected, [{ async: true, src: 'https://stats.thetriangle.org/matomo.js' }]);
  assert.equal(b.pageViews(), 4);
});

test('both layouts use the shared Matomo component and carry no tracker code of their own', () => {
  for (const layout of ['src/layouts/BaseLayout.astro', 'src/layouts/ArticleLayout.astro']) {
    const source = read(layout);
    assert.match(source, /import Matomo from "\.\.\/components\/Matomo\.astro"/, layout);
    assert.equal(source.match(/<Matomo \/>/g)?.length, 1, layout);
    assert.doesNotMatch(source, /_paq|trackPageView|matomo\.js/, layout);
  }
});
