// "Top stories": the most-read articles of the last few days, ranked by
// Cloudflare's edge request counts for /article/<slug> and resolved to cards
// through the CMS. One uncached load is a GraphQL analytics query plus a CMS
// read per candidate, and the ranking only moves over hours, so it is loaded at
// most once an hour per process.
//
// The free plan has no bot score, so obvious crawlers are dropped by user
// agent. What is left still counts every page fetch, not unique readers.
//
// No import.meta.env in here -- db.js binds it to the token and the CMS -- so
// tests can drive it with a fake fetch, CMS and clock.

import { createCachedResource } from './cachedResource.ts';
import type { Article, SectionCardArticle } from './types.ts';

export const TOP_STORIES_TTL_MS = 60 * 60 * 1000;
const ERROR_BACKOFF_MS = 5 * 60 * 1000;
const STALE_MAX_MS = 6 * 60 * 60 * 1000;
export const TOP_STORIES_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;
/** Ranked paths to ask Cloudflare for: room for dead slugs and repeats. */
const CANDIDATE_LIMIT = 15;
/** CMS reads per load, at most. */
const RESOLVE_LIMIT = 8;
const CLOUDFLARE_TIMEOUT_MS = 5000;
const GRAPHQL_URL = 'https://api.cloudflare.com/client/v4/graphql';

const CRAWLER_AGENTS = ['%bot%', '%Bot%', '%spider%', '%crawl%'];

const QUERY = `query TopArticles($zone: String!, $since: Time!, $until: Time!, $limit: Int!, $agents: [ZoneHttpRequestsAdaptiveGroupsFilter_InputObject!]) {
  viewer {
    zones(filter: { zoneTag: $zone }) {
      httpRequestsAdaptiveGroups(
        limit: $limit
        filter: {
          datetime_geq: $since
          datetime_lt: $until
          clientRequestPath_like: "/article/%"
          clientRequestHTTPMethodName: "GET"
          requestSource: "eyeball"
          edgeResponseStatus: 200
          AND: $agents
        }
        orderBy: [count_DESC]
      ) {
        count
        dimensions { clientRequestPath }
      }
    }
  }
}`;

const ARTICLE_PATH = /^\/article\/([a-z0-9-]+)\/?$/i;

/** The article slugs in ranked request paths, in order, each once. */
export function slugsFromPaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const slugs: string[] = [];
  for (const path of paths) {
    const slug = ARTICLE_PATH.exec(path)?.[1]?.toLowerCase();
    if (slug && !seen.has(slug)) {
      seen.add(slug);
      slugs.push(slug);
    }
  }
  return slugs;
}

export type CloudflareTopSlugsOptions = {
  fetch: typeof fetch;
  token: string;
  zoneId: string;
  now?: () => number;
};

/** The most-requested article slugs over the window, most read first. Throws on any failure. */
export async function fetchTopArticleSlugs(options: CloudflareTopSlugsOptions): Promise<string[]> {
  const until = (options.now ?? Date.now)();
  const res = await options.fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${options.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: QUERY,
      variables: {
        zone: options.zoneId,
        since: new Date(until - TOP_STORIES_WINDOW_MS).toISOString(),
        until: new Date(until).toISOString(),
        limit: CANDIDATE_LIMIT,
        agents: CRAWLER_AGENTS.map((agent) => ({ userAgent_notlike: agent })),
      },
    }),
    signal: AbortSignal.timeout(CLOUDFLARE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Cloudflare analytics ${res.status}`);
  const body = (await res.json()) as {
    data?: { viewer?: { zones?: { httpRequestsAdaptiveGroups?: { dimensions?: { clientRequestPath?: string } }[] }[] } };
    errors?: { message?: string }[] | null;
  };
  // Only the first message: the rest can echo the query back.
  if (body.errors?.length) throw new Error(`Cloudflare analytics: ${body.errors[0]?.message ?? 'error'}`);
  const groups = body.data?.viewer?.zones?.[0]?.httpRequestsAdaptiveGroups;
  if (!Array.isArray(groups)) throw new Error('Cloudflare analytics: no zone data');
  return slugsFromPaths(groups.map((group) => group.dimensions?.clientRequestPath ?? ''));
}

/** The card fields only: a full article carries its whole body. */
function toCard(article: Article): SectionCardArticle {
  return {
    slug: article.slug,
    title: article.title,
    date: article.date,
    authors: article.authors,
    featured_image: article.featured_image,
    featured_image_variants: article.featured_image_variants,
    categories_list: article.categories_list,
    categories: article.categories,
    published_date: article.published_date,
  } as SectionCardArticle;
}

export type TopStoriesStoreOptions = {
  loadSlugs: () => Promise<string[]>;
  getArticle: (slug: string) => Promise<Article | undefined>;
  count: number;
  now?: () => number;
  onError?: (err: unknown) => void;
};

/** get() resolves to the top `count` cards, or [] when there is no good list. Never rejects. */
export function createTopStoriesStore(options: TopStoriesStoreOptions) {
  return createCachedResource<SectionCardArticle[]>({
    ttlMs: TOP_STORIES_TTL_MS,
    errorBackoffMs: ERROR_BACKOFF_MS,
    staleMaxMs: STALE_MAX_MS,
    fallback: [],
    now: options.now,
    onError: options.onError,
    load: async () => {
      const slugs = (await options.loadSlugs()).slice(0, RESOLVE_LIMIT);
      // A slug the CMS no longer has (renamed, unpublished) just drops out.
      const articles = await Promise.all(slugs.map((slug) => options.getArticle(slug).catch(() => undefined)));
      const cards = articles.filter((article): article is Article => Boolean(article?.slug)).map(toCard);
      // A CMS outage looks like no articles. Never cache that for an hour.
      if (cards.length === 0) throw new Error('top stories resolved no articles');
      return cards.slice(0, options.count);
    },
  });
}
