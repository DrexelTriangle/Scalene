export const prerender = false;
import type { APIRoute } from "astro";

import { getArticle } from '../../utils/db.js'

const MATOMO_URL = "https://stats.thetriangle.org/index.php";
const MATOMO_TOKEN = import.meta.env.MATOMO; // your .env token
const SITE_ID = "1";

const today = new Date();
const twoWeeksAgo = new Date();
twoWeeksAgo.setDate(today.getDate() - 13); // inclusive of today

const start = twoWeeksAgo.toISOString().slice(0, 10);
const end = today.toISOString().slice(0, 10);

export const GET: APIRoute = async () => {
  const body = new URLSearchParams({
    module: "API",
    method: "Actions.getPageUrls",
    idSite: SITE_ID,
    period: "range",
    date: `${start},${end}`,

    // flatten the tree & force leaf nodes
    flat: "1",
    expanded: "1",
    // filter_truncate: "0",

    // limit + sort
    filter_sort_column: "nb_hits",
    filter_sort_order: "desc",
    filter_limit: "20",

    // filter for article-shaped URLs: /section/slug (optional trailing slash)
    filter_column: "Actions_PageUrl",
    // filter_pattern: "^/[^/]+/[^/]+/?$",

    // // exclude non-article folders
    // filter_exclude_column: "label",
    // filter_exclude_pattern: "^/(tag|about|contact|wp-admin)/",

    // // force session for full data
    // force_api_session: "1",

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
    return new Response(JSON.stringify({ error: res.status, body: text }), {
      status: 500,
    });
  }

  const data = await res.json();

  // Return only top 5
const leafPages = data.filter((row: any) => !row.is_summary).filter((row: any) => !row.Actions_PageUrl?.includes("/feed/")).filter((row: any) => !row.Actions_PageUrl?.startsWith("/?")).filter((row: any) => row.Actions_PageUrl !== "/");

const slugs = leafPages
    .map((row: any) => {
      const parts = row.label.split("/").filter(Boolean); // split by slash, remove empty
      return parts[parts.length - 1];                     // last part = slug
    })
    .slice(0, 5); // top 5 only

  const posts = await Promise.all(slugs.map(slug => getArticle(slug)));

  return new Response(JSON.stringify(posts.filter(Boolean)), { //posts.filter(Boolean)
    headers: { "Content-Type": "application/json" },
  });

};
