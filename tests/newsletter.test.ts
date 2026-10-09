import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOneClickUrl, parseKey, unsubscribe } from '../src/utils/newsletter.ts';

const BASE = 'https://cms.thetriangle.org/';

const fakeFetch = (status: number, body: string, seen: { url?: string; init?: RequestInit } = {}) =>
  (async (url: string | URL | Request, init?: RequestInit) => {
    seen.url = String(url);
    seen.init = init;
    return new Response(body, { status });
  }) as typeof fetch;

test('parseKey accepts plugin keys and rejects anything else', () => {
  assert.equal(parseKey('465-c903961123'), '465-c903961123');
  assert.equal(parseKey(' 48-abcDEF09 '), '48-abcDEF09');
  for (const value of [null, undefined, 465, '', '465', '-abc', 'x-abc', '465-', '465-abc&na=c', '465-ab cd', `1-${'a'.repeat(65)}`]) {
    assert.equal(parseKey(value), null, String(value));
  }
});

test('buildOneClickUrl targets na=ocu and only adds nek when present', () => {
  assert.equal(buildOneClickUrl(BASE, '465-abc'), 'https://cms.thetriangle.org/?na=ocu&nk=465-abc');
  assert.equal(buildOneClickUrl(BASE, '465-abc', '48-def'), 'https://cms.thetriangle.org/?na=ocu&nk=465-abc&nek=48-def');
});

test('unsubscribe POSTs the RFC 8058 body and maps "ok" to success', async () => {
  const seen: { url?: string; init?: RequestInit } = {};
  assert.equal(await unsubscribe(BASE, '465-abc', '48-def', fakeFetch(200, 'ok', seen)), 'ok');
  assert.equal(seen.url, 'https://cms.thetriangle.org/?na=ocu&nk=465-abc&nek=48-def');
  assert.equal(seen.init?.method, 'POST');
  assert.equal(seen.init?.body, 'List-Unsubscribe=One-Click');
  assert.equal(seen.init?.redirect, 'manual');
});

test('unsubscribe maps plugin failures', async () => {
  assert.equal(await unsubscribe(BASE, '1-bogus', null, fakeFetch(404, 'Subscriber not found')), 'not-found');
  assert.equal(await unsubscribe(BASE, '1-abc', null, fakeFetch(200, 'ko')), 'error');
  assert.equal(await unsubscribe(BASE, '1-abc', null, fakeFetch(200, '<html>challenge</html>')), 'error');
  assert.equal(await unsubscribe(BASE, '1-abc', null, fakeFetch(302, '')), 'error');
  assert.equal(await unsubscribe(BASE, '1-abc', null, fakeFetch(503, '')), 'error');
  const throwing = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  assert.equal(await unsubscribe(BASE, '1-abc', null, throwing), 'error');
});
