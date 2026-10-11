import test from 'node:test';
import assert from 'node:assert/strict';
import { createCachedResource } from '../src/utils/cachedResource.ts';

const SECOND = 1000;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A resource over a scripted loader and a fake clock. */
function harness(options: { ttlMs?: number; errorBackoffMs?: number; staleMaxMs?: number } = {}) {
  let clock = 1_000_000;
  const script: (() => Promise<string>)[] = [];
  const errors: unknown[] = [];
  let loads = 0;
  const resource = createCachedResource<string>({
    ttlMs: options.ttlMs ?? 60 * SECOND,
    errorBackoffMs: options.errorBackoffMs ?? 10 * SECOND,
    staleMaxMs: options.staleMaxMs ?? 10 * 60 * SECOND,
    fallback: 'FALLBACK',
    now: () => clock,
    onError: (err) => errors.push(err),
    load: () => {
      loads++;
      const next = script.shift();
      if (!next) throw new Error('unexpected load');
      return next();
    },
  });
  return {
    resource,
    errors,
    get loads() {
      return loads;
    },
    advance(ms: number) {
      clock += ms;
    },
    ok(value: string) {
      script.push(async () => value);
    },
    fail(message = 'cms down') {
      script.push(async () => {
        throw new Error(message);
      });
    },
    hold() {
      const d = deferred<string>();
      script.push(() => d.promise);
      return d;
    },
  };
}

test('a fresh value is served without another load until the TTL passes', async () => {
  const h = harness({ ttlMs: 60 * SECOND });
  h.ok('A');
  assert.equal(await h.resource.get(), 'A');

  h.advance(60 * SECOND - 1);
  assert.equal(await h.resource.get(), 'A');
  assert.equal(h.loads, 1);

  h.advance(1);
  h.ok('B');
  assert.equal(await h.resource.get(), 'B');
  assert.equal(h.loads, 2);
});

test('concurrent misses share one load', async () => {
  const h = harness();
  const pending = h.hold();
  const results = Promise.all([h.resource.get(), h.resource.get(), h.resource.get()]);
  assert.equal(h.loads, 1);
  pending.resolve('A');
  assert.deepEqual(await results, ['A', 'A', 'A']);

  // An expired value is reloaded once for a burst too.
  h.advance(60 * SECOND);
  const again = h.hold();
  const burst = Promise.all(Array.from({ length: 10 }, () => h.resource.get()));
  assert.equal(h.loads, 2);
  again.resolve('B');
  assert.deepEqual(await burst, Array(10).fill('B'));
});

test('a failure with a recent good value serves it stale, and retries after the backoff', async () => {
  const h = harness({ ttlMs: 60 * SECOND, errorBackoffMs: 10 * SECOND });
  h.ok('A');
  await h.resource.get();

  h.advance(60 * SECOND);
  h.fail();
  assert.equal(await h.resource.get(), 'A');
  assert.equal(h.errors.length, 1);

  // Inside the backoff: still stale, no load.
  h.advance(10 * SECOND - 1);
  assert.equal(await h.resource.get(), 'A');
  assert.equal(h.loads, 2);

  h.advance(1);
  h.ok('B');
  assert.equal(await h.resource.get(), 'B');
  assert.equal(h.loads, 3);
});

test('a failure with nothing servable returns the fallback, and backs off', async () => {
  const h = harness({ errorBackoffMs: 10 * SECOND });
  h.fail();
  assert.equal(await h.resource.get(), 'FALLBACK');

  h.advance(10 * SECOND - 1);
  assert.equal(await h.resource.get(), 'FALLBACK');
  assert.equal(h.loads, 1);

  h.advance(1);
  h.ok('A');
  assert.equal(await h.resource.get(), 'A');
});

test('a stale value expires staleMaxMs after it was loaded, however often reloads fail', async () => {
  const h = harness({ ttlMs: 60 * SECOND, errorBackoffMs: 20 * SECOND, staleMaxMs: 120 * SECOND });
  h.ok('A');
  await h.resource.get();

  // Failures at +60s and +80s do not refresh the stale value's age.
  h.advance(60 * SECOND);
  h.fail();
  assert.equal(await h.resource.get(), 'A');
  h.advance(20 * SECOND);
  h.fail();
  assert.equal(await h.resource.get(), 'A');
  h.advance(20 * SECOND);
  h.fail();
  assert.equal(await h.resource.get(), 'A');

  // The +100s failure set a backoff to +120s; the value expires inside it.
  h.advance(20 * SECOND - 1);
  assert.equal(await h.resource.get(), 'A');
  h.advance(1);
  h.fail();
  assert.equal(await h.resource.get(), 'FALLBACK');
  assert.equal(h.loads, 5);

  // Inside the next backoff: fallback with no load.
  h.advance(SECOND);
  assert.equal(await h.resource.get(), 'FALLBACK');
  assert.equal(h.loads, 5);
});

test('concurrent callers during a failing load all get the stale value', async () => {
  const h = harness();
  h.ok('A');
  await h.resource.get();
  h.advance(60 * SECOND);

  const pending = h.hold();
  const results = Promise.all([h.resource.get(), h.resource.get()]);
  pending.reject(new Error('timeout'));
  assert.deepEqual(await results, ['A', 'A']);
  assert.equal(h.loads, 2);
});

test('get never rejects, even when load throws synchronously or onError throws', async () => {
  const resource = createCachedResource<number>({
    ttlMs: 1000,
    errorBackoffMs: 1000,
    staleMaxMs: 1000,
    fallback: 0,
    load: () => {
      throw new Error('sync boom');
    },
    onError: () => {
      throw new Error('logger boom');
    },
  });
  assert.equal(await resource.get(), 0);
});

test('prime stores a fresh value and restarts its TTL', async () => {
  const h = harness({ ttlMs: 30 * SECOND });
  h.ok('A');
  await h.resource.get();

  h.advance(20 * SECOND);
  h.resource.prime('P');
  assert.equal(await h.resource.get(), 'P');

  h.advance(30 * SECOND - 1);
  assert.equal(await h.resource.get(), 'P');
  assert.equal(h.loads, 1);
});

test('a load that started before prime does not overwrite the primed value', async () => {
  const h = harness();
  const pending = h.hold();
  const inFlight = h.resource.get();

  h.resource.prime('PRIMED');
  pending.resolve('OLDER');
  await inFlight;

  assert.equal(await h.resource.get(), 'PRIMED');
  assert.equal(h.loads, 1);
});
