// The CMS reads behind utils/db.js, built on one CmsClient so they can be
// exercised against a fake or a loopback CMS in tests. db.js wires them to the
// configured client and re-exports them; import from there.
//
// Each keeps the contract its callers were written against: which ones return
// a fallback when the CMS answers with an error status, which return
// undefined, and which throw. What changed underneath is the transport -- see
// cmsFetch.ts -- so a stalled CMS now fails these within the time budget
// instead of holding the render open, and slugs are escaped into the path.

import type {
  Article,
  ArticleComments,
  ArticleSummary,
  AuthorArticles,
  ClassifiedPost,
  GalleryImage,
  Homepage,
  RandomArticle,
  SectionArticles,
  SitemapSlug,
  TaxonomyItem,
} from './types';
import { isCmsFetchError, isCmsMiss, type CmsClient, type CmsGetOptions } from './cmsFetch.ts';
import { stripShortcodes } from './shortcodes.ts';

/** Every live slug in one payload; it grows with the archive. */
export const SITEMAP_TIMEOUT_MS = 10_000;
/** Search runs a query the other endpoints do not, so it gets more room. */
export const SEARCH_TIMEOUT_MS = 8_000;

const PAGE_SIZE = 20;

function normalizeArticle<T>(post: T): T {
  const p = post as { categories_list?: unknown; categories?: unknown } | null;
  if (p && !p.categories_list && Array.isArray(p.categories)) {
    p.categories_list = p.categories;
  }
  return post;
}

/**
 * Strip WordPress shortcodes out of every excerpt in a CMS payload.
 *
 * Done here rather than at the ~10 places an excerpt is rendered: excerpts ride
 * along inside a different shape on every endpoint (homepage sections, section
 * and author listings, search) and reach the page through cards, the RSS feed,
 * the infinite-scroll route and <meta name="description">. Walking the parsed
 * body once covers all of them, and the payloads are a page of articles.
 */
function sanitizeExcerpts<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(sanitizeExcerpts);
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record.excerpt === 'string') {
      record.excerpt = stripShortcodes(record.excerpt).replace(/\s+/g, ' ').trim();
    }
    Object.values(record).forEach(sanitizeExcerpts);
  }
  return value;
}

const offsetFor = (page: number | string) => (Math.max(Number(page) || 1, 1) - 1) * PAGE_SIZE;

const noComments = () => ({ comments: [], total_count: 0 }) as unknown as ArticleComments;

export function createCmsReaders(cms: CmsClient) {
  const MISS = Symbol('miss');

  /** The body, or MISS when the CMS answered with an error status. */
  async function read<T>(request: CmsGetOptions): Promise<T | typeof MISS> {
    try {
      return await cms.getJson<T>(request);
    } catch (err) {
      if (isCmsMiss(err)) return MISS;
      throw err;
    }
  }

  async function getHomepageArticles(): Promise<Homepage> {
    try {
      return sanitizeExcerpts(await cms.getJson<Homepage>({ endpoint: 'homepage', path: ['homepage'] }));
    } catch (err) {
      // The homepage has no fallback, and its error has always been the bare
      // status.
      if (isCmsFetchError(err) && err.kind === 'http') throw new Error(String(err.status), { cause: err });
      throw err;
    }
  }

  async function getClassifieds(): Promise<ClassifiedPost[]> {
    // Approved-and-unexpired filtering happens in the CMS, so this is the list
    // as-is.
    const body = await read<{ classifieds?: unknown } | null>({ endpoint: 'classifieds', path: ['classifieds'] });
    if (body === MISS) return [];
    return Array.isArray(body?.classifieds) ? (body.classifieds as ClassifiedPost[]) : [];
  }

  async function listing<T>(endpoint: string, kind: string, slug: string, page: number | string): Promise<T | undefined> {
    const body = await read<T>({
      endpoint,
      path: [kind, slug, 'articles'],
      query: { limit: PAGE_SIZE, offset: offsetFor(page) },
    });
    return body === MISS ? undefined : sanitizeExcerpts(body);
  }

  function getSectionArticles(section: string, page: number | string): Promise<SectionArticles | undefined> {
    return listing('section_articles', 'sections', section, page);
  }

  function getSubsectionArticles(subsection: string, page: number | string): Promise<SectionArticles | undefined> {
    return listing('subsection_articles', 'subsections', subsection, page);
  }

  function getAuthorArticles(author: string, page: number | string): Promise<AuthorArticles | undefined> {
    return listing('author_articles', 'authors', author, page);
  }

  /**
   * Every author, paged out of the CMS.
   *
   * Only used to answer "which slug holds the person this URL names", so it is
   * worth the several round trips it costs -- 875 authors at 200 a page today.
   * Go through authorIndex rather than calling this directly: it has no cache of
   * its own, and this must never sit on the path of a URL that already resolves.
   *
   * Returns undefined if any page fails, so a caller can tell an unreachable CMS
   * from a genuinely empty list. A partial index is worse than none here: a page
   * that failed to load looks exactly like an author who does not exist.
   */
  async function getAllAuthors(): Promise<{ slug: string; display_name: string }[] | undefined> {
    const limit = 200;
    const authors: { slug: string; display_name: string }[] = [];

    for (let offset = 0; ; offset += limit) {
      const body = await read<{ authors?: unknown; pagination?: { has_more?: unknown } } | null>({
        endpoint: 'authors',
        path: ['authors'],
        query: { limit, offset },
      });

      if (body === MISS) return;
      if (!Array.isArray(body?.authors)) return;

      authors.push(...body.authors);
      if (!body.pagination?.has_more) return authors;

      // The CMS decides when the pages run out; this only stops a pagination bug
      // from spinning here forever.
      if (authors.length > 20000) return authors;
    }
  }

  /**
   * Every section, subsection and tag the CMS knows about, in one response
   * (~52 rows / 8 KB today). Distinguishes a section slug from a subsection slug
   * without asking the article endpoints, which is otherwise only answerable by
   * calling one and seeing it fail.
   *
   * Go through taxonomyStore rather than calling this directly: it sits on the
   * path of every section page, and this function has no cache of its own.
   * Returns undefined on failure, so a caller can tell an unreachable CMS from a
   * genuinely empty taxonomy.
   */
  async function getTaxonomy(): Promise<TaxonomyItem[] | undefined> {
    // Freshness is taxonomyStore's job, where there is an explicit TTL.
    const body = await read<unknown>({ endpoint: 'taxonomy', path: ['taxonomy'] });
    if (body === MISS) return;
    return Array.isArray(body) ? (body as TaxonomyItem[]) : undefined;
  }

  async function getArticle(article: string, options: { signal?: AbortSignal } = {}): Promise<Article | undefined> {
    const body = await read<Article>({ endpoint: 'article', path: ['articles', article], signal: options.signal });
    if (body === MISS) return;
    return sanitizeExcerpts(normalizeArticle(body));
  }

  /** Never throws: comments are not worth failing an article over. */
  async function getArticleComments(article: string, options: { signal?: AbortSignal } = {}): Promise<ArticleComments> {
    try {
      return await cms.getJson<ArticleComments>({
        endpoint: 'article_comments',
        path: ['articles', article, 'comments'],
        signal: options.signal,
      });
    } catch {
      return noComments();
    }
  }

  async function getRandomArticle(): Promise<RandomArticle | undefined> {
    const body = await read<RandomArticle>({ endpoint: 'random_article', path: ['articles', 'random'] });
    return body === MISS ? undefined : sanitizeExcerpts(body);
  }

  async function search(term: string): Promise<ArticleSummary[] | undefined> {
    const body = await read<ArticleSummary[]>({
      endpoint: 'search',
      path: ['search'],
      query: { q: term },
      timeoutMs: SEARCH_TIMEOUT_MS,
    });
    return body === MISS ? undefined : sanitizeExcerpts(body);
  }

  async function gallery(): Promise<GalleryImage[]> {
    const body = await read<{ media?: unknown } | null>({ endpoint: 'gallery', path: ['gallery'] });
    if (body === MISS) return [];
    return Array.isArray(body?.media) ? (body.media as GalleryImage[]) : [];
  }

  /** The most recently published articles, newest first. Used by the RSS feed. */
  async function getRecentArticles(limit = 20): Promise<ArticleSummary[]> {
    const body = await read<{ articles?: unknown } | null>({
      endpoint: 'recent_articles',
      path: ['articles'],
      query: { limit, sort_by: 'published_date', sort_direction: 'desc' },
    });
    if (body === MISS) return [];
    return Array.isArray(body?.articles) ? sanitizeExcerpts(body.articles as ArticleSummary[]) : [];
  }

  /**
   * Every live article's slug and last-modified date, for the year-partitioned
   * sitemaps. Unpaginated by design: both sitemap routes bucket the whole set.
   */
  async function getSitemapSlugs(): Promise<SitemapSlug[]> {
    const body = await read<unknown>({ endpoint: 'sitemap_slugs', path: ['sitemap', 'slugs'], timeoutMs: SITEMAP_TIMEOUT_MS });
    if (body === MISS) return [];
    return Array.isArray(body) ? (body as SitemapSlug[]) : [];
  }

  return {
    getHomepageArticles,
    getClassifieds,
    getSectionArticles,
    getSubsectionArticles,
    getAuthorArticles,
    getAllAuthors,
    getTaxonomy,
    getArticle,
    getArticleComments,
    getRandomArticle,
    search,
    gallery,
    getRecentArticles,
    getSitemapSlugs,
  };
}
