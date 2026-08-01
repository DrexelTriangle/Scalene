/**
 * @typedef {import('./types').Article} Article
 * @typedef {import('./types').ArticleSummary} ArticleSummary
 * @typedef {import('./types').Homepage} Homepage
 * @typedef {import('./types').SectionArticles} SectionArticles
 * @typedef {import('./types').AuthorArticles} AuthorArticles
 * @typedef {import('./types').GalleryImage} GalleryImage
 * @typedef {import('./types').RandomArticle} RandomArticle
 * @typedef {import('./types').SitemapSlug} SitemapSlug
 * @typedef {import('./types').ClassifiedPost} ClassifiedPost
 * @typedef {import('./types').ArticleComments} ArticleComments
 */

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");

async function getOptionalJson(url, fallback = undefined) {
  try {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'force-cache',
    });

    if (!res.ok) return fallback;
    return res.json();
  } catch {
    return fallback;
  }
}

function normalizeArticle(post) {
  if (post && !post.categories_list && Array.isArray(post.categories)) {
    post.categories_list = post.categories;
  }
  return post;
}

/** @returns {Promise<Homepage>} */
export async function getHomepageArticles() {
  //const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/homepage';
  const url = normalizedCmsBaseUrl + '/homepage';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) throw new Error(String(res.status));
  return res.json();
}

/** @returns {Promise<ClassifiedPost[]>} */
export async function getClassifieds() {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/classifieds';
  const url = normalizedCmsBaseUrl + '/classifieds';

  // Approved-and-unexpired filtering happens in the CMS, so this is the list
  // as-is. No-store because an approval should show up on the next page load,
  // not whenever a cache decides.
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });

  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body?.classifieds) ? body.classifieds : [];
}

/**
 * @param {string} section
 * @param {number|string} page
 * @returns {Promise<SectionArticles|undefined>}
 */
export async function getSectionArticles(section, page) {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/section/'+section+'?page='+page;
  const limit = 20;
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const url = normalizedCmsBaseUrl + '/sections/'+section+'/articles?limit='+limit+'&offset='+offset;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function getSubsectionArticles(subsection, page) {
  const limit = 20;
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const url = normalizedCmsBaseUrl + '/subsections/' + subsection + '/articles?limit=' + limit + '&offset=' + offset;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

/**
 * @param {string} author
 * @param {number|string} page
 * @returns {Promise<AuthorArticles|undefined>}
 */
export async function getAuthorArticles(author, page) {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/author/'+author+'?page='+page;
  const limit = 20;
  const offset = (Math.max(Number(page) || 1, 1) - 1) * limit;
  const url = normalizedCmsBaseUrl + '/authors/'+author+'/articles?limit='+limit+'&offset='+offset;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

/**
 * @param {string} article
 * @returns {Promise<Article|undefined>}
 */
export async function getArticle(article) {
  //const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/post/' + article;
  const url = normalizedCmsBaseUrl + '/articles/' + article;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return normalizeArticle(await res.json());
}

/**
 * @param {string} article
 * @returns {Promise<ArticleComments>}
 */
export async function getArticleComments(article) {
  const url = normalizedCmsBaseUrl + '/articles/' + article + '/comments';

  return getOptionalJson(url, { comments: [], total_count: 0 });
}

/** @returns {Promise<RandomArticle|undefined>} */
export async function getRandomArticle() {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/random/';
  const url = normalizedCmsBaseUrl + '/articles/random';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

/**
 * @param {string} search
 * @returns {Promise<ArticleSummary[]|undefined>}
 */
export async function search(search) {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/search?q=' + search;
  const url = normalizedCmsBaseUrl + '/search?q=' + search;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}
/** @returns {Promise<GalleryImage[]>} */
export async function gallery() {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/gallery';
  const url = normalizedCmsBaseUrl + '/gallery';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body?.media) ? body.media : [];
}

/**
 * The most recently published articles, newest first. Used by the RSS feed.
 * @param {number} limit
 * @returns {Promise<ArticleSummary[]>}
 */
export async function getRecentArticles(limit = 20) {
  const url = normalizedCmsBaseUrl + '/articles?limit=' + limit + '&sort_by=published_date&sort_direction=desc';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body?.articles) ? body.articles : [];
}

/**
 * Every live article's slug and last-modified date, for the year-partitioned
 * sitemaps. Unpaginated by design: both sitemap routes bucket the whole set.
 * @returns {Promise<SitemapSlug[]>}
 */
export async function getSitemapSlugs() {
  // const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/sitemap-slugs';
  const url = normalizedCmsBaseUrl + '/sitemap/slugs';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return [];
  const body = await res.json();
  return Array.isArray(body) ? body : [];
}

const MATOMO_URL = "https://stats.thetriangle.org/index.php";
const MATOMO_TOKEN = import.meta.env.MATOMO;
const SITE_ID = "1";

function getDateRange() {
  const today = new Date();
  const twoWeeksAgo = new Date();
  twoWeeksAgo.setDate(today.getDate() - 13);

  const start = twoWeeksAgo.toISOString().slice(0, 10);
  const end = today.toISOString().slice(0, 10);

  return { start, end };
}

/** @returns {Promise<Article[]>} */
export async function getStats() {
  const { start, end } = getDateRange();

  const body = new URLSearchParams({
    module: "API",
    method: "Actions.getPageUrls",
    idSite: SITE_ID,
    period: "range",
    date: `${start},${end}`,

    flat: "1",
    expanded: "1",

    filter_sort_column: "nb_hits",
    filter_sort_order: "desc",
    filter_limit: "25",

    filter_column: "Actions_PageUrl",

    format: "JSON",
    token_auth: MATOMO_TOKEN,
  });

  const res = await fetch(MATOMO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Matomo status:", res.status);
    console.error("Matomo response:", text);
    throw new Error(`Matomo error ${res.status}`);
  }

  const data = await res.json();

  const leafPages = data
    .filter((row) => !row.is_summary)
    .filter((row) => !row.Actions_PageUrl?.includes("/feed/"))
    .filter((row) => !row.Actions_PageUrl?.startsWith("/?"))
    .filter((row) => row.Actions_PageUrl !== "/");

  const slugs = leafPages
    .map((row) => {
      const parts = row.label.split("/").filter(Boolean);
      return parts[parts.length - 1];
    })
    .slice(0, 5);

  const posts = await Promise.all(
    slugs.map((slug) => getArticle(slug))
  );

  return posts.filter(Boolean);
}
