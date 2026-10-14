import type { APIRoute } from "astro";
import { getStats } from "../../utils/db.js";
import { createStatsHandler, createStatsStore } from "../../utils/statsStore";

export const prerender = false;

const statsStore = createStatsStore({
  load: getStats,
  onError: (err) => console.error("Stats: load failed:", err instanceof Error ? err.message : err),
});

/** Cached for an hour; see utils/statsStore. */
export const GET: APIRoute = createStatsHandler(statsStore);
