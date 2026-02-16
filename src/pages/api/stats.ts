import type { APIRoute } from "astro";
import { getStats } from "../../utils/db.js";

export const prerender = false;

export const GET: APIRoute = async () => {
  try {
    const posts = await getStats();
    return new Response(JSON.stringify(posts), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.log(err)
    return new Response(
      JSON.stringify({ error: err.message || "Failed to load stats" }),
      { status: 500 }
    );
  }
};
