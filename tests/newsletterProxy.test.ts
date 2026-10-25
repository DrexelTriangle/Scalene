import test from 'node:test';
import assert from 'node:assert/strict';
import { newsletterUpstreamUrl, proxyNewsletter, type ProxyNewsletterOptions } from '../src/utils/newsletterProxy.ts';

const CMS = 'https://cms.test/v1';

interface Call {
  url: string;
  init: RequestInit;
}

const mockFetch = (response: Response | Error) => {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    if (response instanceof Error) throw response;
    return response;
  }) as typeof fetch;
  return { fetchImpl, calls };
};

const run = (fetchImpl: typeof fetch, overrides: Partial<ProxyNewsletterOptions>) =>
  proxyNewsletter({
    cmsBaseUrl: CMS,
    path: 'unsubscribe',
    search: '',
    method: 'GET',
    requestHeaders: new Headers(),
    fetchImpl,
    ...overrides,
  });

test('forwards only the public newsletter paths, with their methods', () => {
  assert.equal(newsletterUpstreamUrl(CMS, 'unsubscribe', 'GET', '?t=abc'), 'https://cms.test/v1/newsletter/unsubscribe?t=abc');
  assert.equal(newsletterUpstreamUrl(CMS, 'unsubscribe', 'POST', '?nk=1-a'), 'https://cms.test/v1/newsletter/unsubscribe?nk=1-a');
  assert.equal(newsletterUpstreamUrl(CMS, 'resubscribe', 'POST', '?t=abc'), 'https://cms.test/v1/newsletter/resubscribe?t=abc');
  assert.equal(newsletterUpstreamUrl(CMS, 'issues/12', 'GET', ''), 'https://cms.test/v1/newsletter/issues/12');
  assert.equal(newsletterUpstreamUrl(CMS, 'issues/latest/', 'GET', ''), 'https://cms.test/v1/newsletter/issues/latest');
  assert.equal(newsletterUpstreamUrl(CMS, 'c/dlv_tok-1/41', 'GET', ''), 'https://cms.test/v1/newsletter/c/dlv_tok-1/41');
  assert.equal(newsletterUpstreamUrl(CMS, 'o/dlv', 'GET', ''), 'https://cms.test/v1/newsletter/o/dlv');

  for (const [path, method] of [
    ['resubscribe', 'GET'], // only the button POSTs
    ['issues/12', 'POST'],
    ['../newsletters', 'GET'], // the dashboard API stays off the public site
    ['issues/../../newsletters', 'GET'],
    ['c/tok/41/extra', 'GET'],
    ['subscribers', 'GET'],
    [undefined, 'GET'],
  ] as const) {
    assert.equal(newsletterUpstreamUrl(CMS, path, method, ''), null, `${method} ${path}`);
  }
});

test('passes a click redirect to the reader instead of following it', async () => {
  const { fetchImpl, calls } = mockFetch(
    new Response(null, { status: 302, headers: { Location: 'https://www.thetriangle.org/article/a', 'Set-Cookie': 'x=1' } }),
  );
  const res = await run(fetchImpl, { path: 'c/dlv/3', clientAddress: '203.0.113.9' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), 'https://www.thetriangle.org/article/a');
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(calls[0].init.redirect, 'manual');
  assert.equal(new Headers(calls[0].init.headers).get('x-forwarded-for'), '203.0.113.9');
});

test("posts the unsubscribe button's form and returns the CMS page with its policy", async () => {
  const csp = "default-src 'none'; form-action 'self'";
  const { fetchImpl, calls } = mockFetch(
    new Response('<p>You are unsubscribed</p>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Content-Security-Policy': csp },
    }),
  );
  const res = await run(fetchImpl, { method: 'POST', search: '?t=abc', body: '' });
  assert.equal(calls[0].url, 'https://cms.test/v1/newsletter/unsubscribe?t=abc');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(new Headers(calls[0].init.headers).get('content-type'), 'application/x-www-form-urlencoded');
  assert.equal(res.headers.get('content-security-policy'), csp);
  assert.equal(await res.text(), '<p>You are unsubscribed</p>');
});

test('answers 404 without calling the CMS for anything else', async () => {
  const { fetchImpl, calls } = mockFetch(new Error('should not be called'));
  const res = await run(fetchImpl, { path: 'subscribers' });
  assert.equal(res.status, 404);
  assert.equal(calls.length, 0);
});

test('answers 502 when the CMS is down', async () => {
  const { fetchImpl } = mockFetch(new TypeError('fetch failed'));
  const res = await run(fetchImpl, { path: 'issues/latest' });
  assert.equal(res.status, 502);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});
