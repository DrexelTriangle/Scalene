import type { APIRoute } from 'astro';
import { callProcedure } from "../../utils/db";
export const GET: APIRoute = async ({ params }) => {

  const section = params.section; // Create a URL object from the request
  const limit = params.limit || 6;
  const offset = params.offset || 0;
  try {
    const articles = await callProcedure("get_articles_by_section", [section, limit, offset]);

    return new Response(JSON.stringify(articles), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err: any) {
    
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
    });
    
  }
}