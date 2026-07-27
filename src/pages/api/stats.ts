import type { APIRoute } from "astro";
import { getStats } from "../../utils/db.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const posts = await getStats();
    return new Response(JSON.stringify(posts), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.log(err)
    const message = (err instanceof Error && err.message) || "Failed to load stats";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500 }
    );
  }
};
