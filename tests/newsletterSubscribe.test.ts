import test from 'node:test';
import assert from 'node:assert/strict';
import { forwardSubscribe, subscribePayload } from '../src/utils/newsletterSubscribe.ts';

const BASE = 'https://cms.test/v1/';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const recordingFetch = (respond: () => Response | Promise<Response>) => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return respond();
  }) as typeof fetch;
  return { calls, fetchImpl };
};

test('forwards the reader address and only the fields the CMS takes', async () => {
  const { calls, fetchImpl } = recordingFetch(() => json(200, { success: true }));
  const result = await forwardSubscribe({
    cmsBaseUrl: BASE,
    body: { email: 'reader@drexel.edu', lists: ['1', 2, 'x'], website: '', extra: 'dropped' },
    clientAddress: '203.0.113.7',
    fetchImpl,
  });

  assert.deepEqual(result, { status: 200, body: { success: true } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://cms.test/v1/newsletter-subscribers/subscribe');
  assert.equal(new Headers(calls[0].init.headers).get('X-Forwarded-For'), '203.0.113.7');
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), { email: 'reader@drexel.edu', lists: [1, 2], website: '' });
});

test('passes the CMS refusal message through', async () => {
  const { fetchImpl } = recordingFetch(() => json(400, { success: false, error: "That doesn't look like an email address." }));
  const result = await forwardSubscribe({ cmsBaseUrl: BASE, body: { email: 'nope' }, fetchImpl });
  assert.deepEqual(result, { status: 400, body: { success: false, error: "That doesn't look like an email address." } });
});

test('turns the rate limit into a reader-facing sentence', async () => {
  const { fetchImpl } = recordingFetch(() => json(429, { error: 'rate limit exceeded' }));
  const result = await forwardSubscribe({ cmsBaseUrl: BASE, body: {}, fetchImpl });
  assert.equal(result.status, 429);
  assert.equal(result.body.success, false);
  assert.match(result.body.error ?? '', /wait a minute/);
});

test('reports the CMS being down or unreadable as unavailable, never as success', async () => {
  for (const respond of [
    () => Promise.reject(new Error('connect ECONNREFUSED')),
    () => new Response('<html>Bad gateway</html>', { status: 502 }),
    () => json(500, { success: true }),
    () => json(200, { ok: true }),
  ]) {
    const { fetchImpl } = recordingFetch(respond);
    const result = await forwardSubscribe({ cmsBaseUrl: BASE, body: { email: 'a@b.org' }, fetchImpl });
    assert.equal(result.status, 502);
    assert.equal(result.body.success, false);
  }
});

test('subscribePayload copes with junk', () => {
  assert.deepEqual(subscribePayload(null), { email: '', lists: [], website: '' });
  assert.deepEqual(subscribePayload({ email: 5, lists: 'all' }), { email: '', lists: [], website: '' });
});
