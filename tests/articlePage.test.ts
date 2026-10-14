import test from 'node:test';
import assert from 'node:assert/strict';
import { loadArticlePage } from '../src/utils/articlePage.ts';

type Post = { slug: string };
type Comments = { comments?: { id: number }[] } | null | undefined;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Readers whose answers the test releases by hand, recording what was asked. */
function readers() {
  const article = deferred<Post | undefined>();
  const comments = deferred<Comments>();
  const calls: string[] = [];
  let commentsSignal: AbortSignal | undefined;
  return {
    article,
    comments,
    calls,
    commentsSignal: () => commentsSignal,
    readers: {
      getArticle(slug: string) {
        calls.push(`article:${slug}`);
        return article.promise;
      },
      getArticleComments(slug: string, options: { signal?: AbortSignal }) {
        calls.push(`comments:${slug}`);
        commentsSignal = options.signal;
        return comments.promise;
      },
    },
  };
}

test('article and comments are both requested before either answers', async () => {
  const r = readers();
  const page = loadArticlePage('slug', r.readers);
  assert.deepEqual(r.calls.sort(), ['article:slug', 'comments:slug']);

  r.comments.resolve({ comments: [{ id: 1 }] });
  r.article.resolve({ slug: 'slug' });
  assert.deepEqual(await page, { post: { slug: 'slug' }, comments: [{ id: 1 }] });
  assert.equal(r.commentsSignal()?.aborted, false);
});

test('comments arriving last are still waited for', async () => {
  const r = readers();
  const page = loadArticlePage('slug', r.readers);
  r.article.resolve({ slug: 'slug' });
  await new Promise((resolve) => setImmediate(resolve));
  r.comments.resolve({ comments: [{ id: 2 }] });
  assert.deepEqual((await page).comments, [{ id: 2 }]);
});

test('no article: no comments; the comments request was still attempted, then aborted', async () => {
  const r = readers();
  const page = loadArticlePage('gone', r.readers);
  assert.ok(r.calls.includes('comments:gone'), 'the parallel comments request goes out before the miss is known');
  r.article.resolve(undefined);

  assert.deepEqual(await page, { post: undefined, comments: [] });
  assert.equal(r.commentsSignal()?.aborted, true);
  // The cancelled request settling later is not an unhandled rejection.
  r.comments.reject(new Error('aborted'));
  await new Promise((resolve) => setImmediate(resolve));
});

test('an article read that throws still throws (the page 500s as before), and comments are cancelled', async () => {
  const r = readers();
  const page = loadArticlePage('slug', r.readers);
  r.article.reject(new Error('CMS down'));

  await assert.rejects(page, /CMS down/);
  assert.equal(r.commentsSignal()?.aborted, true);
});

test('a comments failure -- even one that rejects early -- is an empty list, not a failed article', async () => {
  const r = readers();
  const page = loadArticlePage('slug', r.readers);
  r.comments.reject(new Error('comments broke'));
  await new Promise((resolve) => setImmediate(resolve));
  r.article.resolve({ slug: 'slug' });
  assert.deepEqual(await page, { post: { slug: 'slug' }, comments: [] });
});

test('a comments payload without a list is an empty list', async () => {
  for (const payload of [null, undefined, {}, { comments: 'nope' }] as Comments[]) {
    const r = readers();
    const page = loadArticlePage('slug', r.readers);
    r.comments.resolve(payload);
    r.article.resolve({ slug: 'slug' });
    assert.deepEqual((await page).comments, []);
  }
});

test('total wait is the slower read, not the sum', async () => {
  const delay = <T>(ms: number, value: T) => new Promise<T>((resolve) => setTimeout(() => resolve(value), ms));
  const started = performance.now();
  await loadArticlePage('slug', {
    getArticle: () => delay(120, { slug: 'slug' }),
    getArticleComments: () => delay(120, { comments: [] }),
  });
  const elapsed = performance.now() - started;
  assert.ok(elapsed < 220, `took ${elapsed}ms; the reads ran one after the other`);
});
