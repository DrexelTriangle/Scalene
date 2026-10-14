import test from 'node:test';
import assert from 'node:assert/strict';
import { createWeatherStore } from '../src/utils/weatherStore.ts';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void; reject: (err: unknown) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function weatherResponse(celsius: unknown): Response {
  return new Response(JSON.stringify({ currentConditions: { temp: celsius } }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * A store wired to a fake clock and a scripted upstream. Each upstream call
 * takes the next queued responder; an empty queue is a test bug.
 */
function harness() {
  let clock = Date.parse('2026-10-11T12:00:00Z');
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const responders: (() => Promise<Response>)[] = [];
  const errors: unknown[][] = [];
  const timeouts: number[] = [];

  const store = createWeatherStore({
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const next = responders.shift();
      if (!next) throw new Error('unexpected upstream call');
      return next();
    }) as typeof fetch,
    getApiKey: () => 'test-key',
    now: () => clock,
    timeoutSignal: (ms: number) => {
      timeouts.push(ms);
      return new AbortController().signal;
    },
    logError: (...args: unknown[]) => {
      errors.push(args);
    },
  });

  return {
    store,
    calls,
    errors,
    timeouts,
    advance(ms: number) {
      clock += ms;
    },
    respondWith(celsius: unknown) {
      responders.push(async () => weatherResponse(celsius));
    },
    failWith(status = 429) {
      responders.push(async () => new Response('Maximum daily cost exceeded', { status }));
    },
    hold() {
      const d = deferred<Response>();
      responders.push(() => d.promise);
      return d;
    },
  };
}

test('cold cache: peek returns immediately with no label and does not wait for the upstream', async () => {
  const h = harness();
  const pending = h.hold();

  assert.equal(h.store.peek(), '');
  const refreshed = h.store.refresh();
  // Still synchronous and still empty while the upstream is outstanding.
  assert.equal(h.store.peek(), '');
  assert.equal(h.calls.length, 1);

  pending.resolve(weatherResponse(20));
  await refreshed;
  assert.equal(h.store.peek(), 'Philadelphia: 68°F');
});

test('concurrent refreshes share one upstream call', async () => {
  const h = harness();
  const pending = h.hold();

  const a = h.store.refresh();
  const b = h.store.refresh();
  const c = h.store.refresh();
  assert.equal(h.calls.length, 1);

  pending.resolve(weatherResponse(0));
  await Promise.all([a, b, c]);
  assert.equal(h.store.peek(), 'Philadelphia: 32°F');
});

test('a good reading is not refetched within the one-hour TTL', async () => {
  const h = harness();
  h.respondWith(20);
  await h.store.refresh();

  h.advance(HOUR - 1);
  await h.store.refresh();
  assert.equal(h.calls.length, 1);

  h.advance(1);
  h.respondWith(25);
  await h.store.refresh();
  assert.equal(h.calls.length, 2);
  assert.equal(h.store.peek(), 'Philadelphia: 77°F');
});

test('an expired reading is still served while its refresh is in flight', async () => {
  const h = harness();
  h.respondWith(20);
  await h.store.refresh();

  h.advance(HOUR);
  const pending = h.hold();
  const refreshed = h.store.refresh();
  assert.equal(h.store.peek(), 'Philadelphia: 68°F');

  pending.resolve(weatherResponse(30));
  await refreshed;
  assert.equal(h.store.peek(), 'Philadelphia: 86°F');
});

test('a failure with nothing to serve retries after the five-minute backoff', async () => {
  const h = harness();
  h.failWith(429);
  await h.store.refresh();
  assert.equal(h.store.peek(), '');
  assert.equal(h.errors.length, 1);

  h.advance(5 * MINUTE - 1);
  await h.store.refresh();
  assert.equal(h.calls.length, 1);

  h.advance(1);
  h.respondWith(10);
  await h.store.refresh();
  assert.equal(h.calls.length, 2);
  assert.equal(h.store.peek(), 'Philadelphia: 50°F');
});

test('a failed refresh keeps serving the last reading, retrying hourly', async () => {
  const h = harness();
  h.respondWith(20);
  await h.store.refresh();

  h.advance(HOUR);
  h.failWith(500);
  await h.store.refresh();
  assert.equal(h.store.peek(), 'Philadelphia: 68°F');

  // Serving a stale reading is not "nothing to serve", so no five-minute retry.
  h.advance(5 * MINUTE);
  await h.store.refresh();
  assert.equal(h.calls.length, 2);

  h.advance(HOUR - 5 * MINUTE);
  h.failWith(500);
  await h.store.refresh();
  assert.equal(h.calls.length, 3);
  assert.equal(h.store.peek(), 'Philadelphia: 68°F');
});

test('a stale reading is dropped six hours after it was fetched, however often refreshes fail', async () => {
  const h = harness();
  h.respondWith(20);
  await h.store.refresh();

  for (let hour = 1; hour <= 5; hour++) {
    h.advance(HOUR);
    h.failWith(500);
    await h.store.refresh();
    assert.equal(h.store.peek(), 'Philadelphia: 68°F', `hour ${hour}`);
  }

  // Six hours after the last good reading, even without another refresh.
  h.advance(HOUR - 1);
  assert.equal(h.store.peek(), 'Philadelphia: 68°F');
  h.advance(1);
  assert.equal(h.store.peek(), '');

  // The attempt that finds nothing left to serve switches to the short backoff.
  h.failWith(500);
  await h.store.refresh();
  assert.equal(h.store.peek(), '');
  h.advance(5 * MINUTE);
  h.respondWith(15);
  await h.store.refresh();
  assert.equal(h.store.peek(), 'Philadelphia: 59°F');
});

test('each upstream call carries a five-second timeout signal and the API key', async () => {
  const h = harness();
  h.respondWith(20);
  await h.store.refresh();

  assert.deepEqual(h.timeouts, [5000]);
  assert.ok(h.calls[0].init?.signal instanceof AbortSignal);
  const url = new URL(h.calls[0].url);
  assert.equal(url.searchParams.get('key'), 'test-key');
  assert.equal(url.searchParams.get('include'), 'current');
});

test('unusable responses count as failures', async (t) => {
  const cases: [string, () => Response][] = [
    ['non-JSON body', () => new Response('<html>', { status: 200, headers: { 'content-type': 'text/html' } })],
    ['missing temp', () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })],
    ['non-numeric temp', () => weatherResponse('warm')],
    ['malformed JSON', () => new Response('{', { status: 200, headers: { 'content-type': 'application/json' } })],
  ];
  for (const [name, make] of cases) {
    await t.test(name, async () => {
      const h = harness();
      h.hold().resolve(make());
      await h.store.refresh();
      assert.equal(h.store.peek(), '');
      assert.equal(h.errors.length, 1);
    });
  }
});

test('a missing API key skips the upstream and backs off', async () => {
  const errors: unknown[][] = [];
  let calls = 0;
  let clock = 0;
  const store = createWeatherStore({
    fetch: (async () => {
      calls++;
      return weatherResponse(20);
    }) as typeof fetch,
    getApiKey: () => undefined,
    now: () => clock,
    logError: (...args: unknown[]) => errors.push(args),
  });

  await store.refresh();
  assert.equal(calls, 0);
  assert.equal(store.peek(), '');
  assert.equal(errors.length, 1);

  clock += 5 * MINUTE - 1;
  await store.refresh();
  assert.equal(errors.length, 1);
});

test('read waits for the upstream only when nothing is servable', async () => {
  const h = harness();
  const pending = h.hold();

  let settled = false;
  const label = h.store.read().then((value) => {
    settled = true;
    return value;
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'a cold read waits for the reading');

  pending.resolve(weatherResponse(20));
  assert.equal(await label, 'Philadelphia: 68°F');
  assert.equal(h.calls.length, 1);
});

test('read returns an expired reading at once and refreshes it in the background', async () => {
  const h = harness();
  h.respondWith(20);
  await h.store.read();

  h.advance(HOUR);
  const pending = h.hold();
  assert.equal(await h.store.read(), 'Philadelphia: 68°F');
  assert.equal(h.calls.length, 2, 'the expired reading triggered a refresh');

  pending.resolve(weatherResponse(30));
  await h.store.refresh();
  assert.equal(await h.store.read(), 'Philadelphia: 86°F');
  assert.equal(h.calls.length, 2, 'the fresh reading is not refetched');
});

test('read honours the failure backoff and shares an in-flight refresh', async () => {
  const h = harness();
  h.failWith(429);
  assert.equal(await h.store.read(), '');

  // Inside the backoff: no upstream call, no waiting.
  h.advance(5 * MINUTE - 1);
  assert.equal(await h.store.read(), '');
  assert.equal(h.calls.length, 1);

  h.advance(1);
  const pending = h.hold();
  const reads = [h.store.read(), h.store.read(), h.store.read()];
  assert.equal(h.calls.length, 2);
  pending.resolve(weatherResponse(0));
  assert.deepEqual(await Promise.all(reads), Array(3).fill('Philadelphia: 32°F'));
});

test('a background refresh never rejects, even when every dependency throws', async () => {
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on('unhandledRejection', onUnhandled);
  try {
    const throwing = [
      createWeatherStore({
        fetch: (() => {
          throw new Error('sync fetch failure');
        }) as typeof fetch,
        getApiKey: () => 'k',
        logError: () => {},
      }),
      createWeatherStore({
        fetch: (async () => {
          throw new DOMException('The operation timed out.', 'TimeoutError');
        }) as typeof fetch,
        getApiKey: () => 'k',
        logError: () => {},
      }),
      createWeatherStore({
        fetch: (async () => weatherResponse(20)) as typeof fetch,
        getApiKey: () => {
          throw new Error('env exploded');
        },
        logError: () => {},
      }),
      createWeatherStore({
        fetch: (async () => new Response('nope', { status: 500 })) as typeof fetch,
        getApiKey: () => 'k',
        logError: () => {
          throw new Error('logger exploded');
        },
      }),
    ];

    for (const store of throwing) {
      // Fire-and-forget, the way the component calls it.
      void store.refresh();
    }
    await Promise.all(throwing.map((store) => store.refresh()));
    await new Promise((resolve) => setImmediate(resolve));

    for (const store of throwing) assert.equal(store.peek(), '');
    // read() must not reject either; the island path awaits it.
    assert.deepEqual(await Promise.all(throwing.map((store) => store.read())), ['', '', '', '']);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off('unhandledRejection', onUnhandled);
  }
});
