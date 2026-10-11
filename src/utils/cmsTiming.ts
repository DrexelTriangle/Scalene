// Server-Timing for the CMS calls one request made, so a slow page can be
// pinned on the CMS (or cleared of it) from the browser's network panel.
//
// Request-scoped through AsyncLocalStorage: the middleware opens a scope around
// the render, and cmsFetch reports into whichever scope its caller is running
// in. Nothing is module-global, so one request's timings cannot reach another
// -- including when two requests share one deduplicated CMS call, since each
// caller reports its own wait from its own context.
//
// Only what finished before the response headers went out can be in the
// header. That is the page frontmatter -- the article, its comments, the
// homepage, a section's listing -- which is what decides how long the page
// takes to start. Components that fetch while the body streams are not
// counted.

import { AsyncLocalStorage } from 'node:async_hooks';
import { endpointLabel } from './cmsFetch.ts';

type Timing = { count: number; totalMs: number };
type Scope = Map<string, Timing>;

/** Distinct endpoints one response can report; a page uses three or four. */
const MAX_ENDPOINTS = 12;

const storage = new AsyncLocalStorage<Scope>();

/** cmsFetch's onTiming sink. A no-op outside a request scope. */
export function recordCmsTiming(endpoint: string, durationMs: number): void {
  const scope = storage.getStore();
  if (!scope) return;
  const label = endpointLabel(endpoint);
  const timing = scope.get(label);
  if (timing) {
    timing.count++;
    timing.totalMs += durationMs;
  } else if (scope.size < MAX_ENDPOINTS) {
    scope.set(label, { count: 1, totalMs: durationMs });
  }
}

/** One metric per endpoint: `cms_article;dur=41.2`, with a count when >1. */
export function formatServerTiming(scope: ReadonlyMap<string, Timing>): string {
  return [...scope]
    .map(([label, { count, totalMs }]) => {
      const desc = count > 1 ? `;desc="${count} calls"` : '';
      return `cms_${label};dur=${totalMs.toFixed(1)}${desc}`;
    })
    .join(', ');
}

/**
 * Run a middleware's downstream inside a timing scope and add the result to
 * the response as Server-Timing.
 *
 * A rewrite runs middleware again inside the same request; that inner pass
 * joins the outer scope rather than opening its own, so the header is written
 * once, by the outer pass, with everything in it.
 */
export async function withCmsServerTiming(handler: () => Promise<Response>): Promise<Response> {
  if (storage.getStore()) return handler();

  const scope: Scope = new Map();
  const response = await storage.run(scope, handler);
  if (scope.size === 0) return response;

  try {
    response.headers.append('Server-Timing', formatServerTiming(scope));
  } catch {
    // A Response passed through from fetch() has immutable headers. Losing the
    // header is fine; losing the response is not.
  }
  return response;
}
