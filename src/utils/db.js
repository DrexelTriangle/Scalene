
export async function getHomepageArticles() {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/homepage';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) throw new Error(res.status);
  return res.json();
}

export async function getSectionArticles(section, page) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/section/'+section+'?page='+page;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function getAuthorArticles(author, page) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v2/author/'+author+'?page='+page;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function getArticle(article) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/post/' + article;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}

export async function search(search) {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/search?q=' + search;

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
}
export async function gallery() {
  const url = 'https://cms.thetriangle.org/wp-json/triangle/v1/gallery';

  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'force-cache',
  });

  if (!res.ok) return;
  return res.json();
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
    filter_limit: "30",

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
    throw new Error(`Matomo error ${res.status}: ${text}`);
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
