import type { APIRoute } from "astro";
import {
  getAuthorArticles,
  getSectionArticles,
  getSubsectionArticles,
} from "../../../utils/db.js";

export const prerender = false;

// Infinite scroll runs in the browser, which cannot reach the CMS directly:
// CMS_API_BASE_URL points at an internal host and the CMS sends no CORS
// headers. So the page fetches this same-origin route and we make the CMS
// call server-side, exactly like the first page of results does.
const loaders = {
  sections: getSectionArticles,
  subsections: getSubsectionArticles,
  authors: getAuthorArticles,
} as const;

export const GET: APIRoute = async ({ params, url }) => {
  const { taxonomy, slug } = params;
  const loadArticles = loaders[taxonomy as keyof typeof loaders];

  if (!loadArticles) {
    return new Response(JSON.stringify({ error: "Unknown taxonomy" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!slug) {
    return new Response(JSON.stringify({ error: "Missing slug" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const page = Math.max(Number(url.searchParams.get("page")) || 1, 1);

  try {
    const posts = await loadArticles(slug, page);

    if (!posts) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(posts), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log(err);
    const message =
      (err instanceof Error && err.message) || "Failed to load articles";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
