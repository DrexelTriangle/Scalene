/**
 * @typedef {import('./types').Article} Article
 */

import { cms } from "./cmsClient";
import { createCmsReaders } from "./cmsReaders";

// The public CMS reads. They live in cmsReaders.ts so tests can run them
// against a fake CMS; this binds them to the site's configured client.
export const {
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
} = createCmsReaders(cms);

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
