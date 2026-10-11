import type { APIRoute } from "astro";
import { getRecentArticles } from "../utils/db";
import { createFeedHandler } from "../utils/feed";
import { getSiteTitle } from "../utils/siteConfig";

export const GET: APIRoute = createFeedHandler({ getSiteTitle, getRecentArticles });
