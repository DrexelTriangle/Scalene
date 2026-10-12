// The CMS reads an article page needs before it can render, made at the same
// time instead of one after the other.
//
// Comments used to wait for the article to arrive, which put two CMS round
// trips end to end in front of every article view. They do not depend on it,
// so both start together and the slower one sets the pace. What the page does
// with the answers is unchanged:
//
//  - No article: no comments either, and the page goes to 404 as before.
//  - The article read throws: that propagates, as before.
//  - Comments fail: an empty list. They never failed an article before
//    either, except through one path -- a malformed comments body -- that
//    getArticleComments now catches too.
//
// The cost, accepted on purpose: a slug with no article now also makes one
// comments request, where before it made none. In both miss cases the comments
// request is aborted, but abort only stops this side waiting and closes the
// connection -- it cannot unsend a request the CMS may already have received
// and started on. So 404 traffic, much of it bots asking for dead slugs, costs
// the CMS up to one extra attempted comments request per miss. That is the
// price of taking a serial round trip off every real article view.

export type ArticlePageReaders<A, C> = {
  getArticle(slug: string): Promise<A | undefined>;
  getArticleComments(slug: string, options: { signal?: AbortSignal }): Promise<{ comments?: C[] } | null | undefined>;
};

export type ArticlePageData<A, C> = { post: A; comments: C[] } | { post: undefined; comments: [] };

export async function loadArticlePage<A, C>(slug: string, readers: ArticlePageReaders<A, C>): Promise<ArticlePageData<A, C>> {
  const commentsController = new AbortController();
  // Caught here, so a comments failure while the article is still loading is
  // never an unhandled rejection; it reads as "no comments" below.
  const commentsRequest = readers
    .getArticleComments(slug, { signal: commentsController.signal })
    .catch(() => undefined);

  let post: A | undefined;
  try {
    post = await readers.getArticle(slug);
  } catch (err) {
    commentsController.abort();
    throw err;
  }

  if (!post) {
    commentsController.abort();
    return { post: undefined, comments: [] };
  }

  const commentsResponse = await commentsRequest;
  const comments = Array.isArray(commentsResponse?.comments) ? commentsResponse.comments : [];
  return { post, comments };
}
