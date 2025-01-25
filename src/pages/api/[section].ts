import type { APIRoute } from 'astro';
import { callProcedure } from "../../utils/db";


// Needed to compile dynamic routing
export async function getStaticPaths() {
  //TODO: Change this to pull from the Database
  const sections = ["sports", "news", "opinions"];
  return sections.map((section) => ({
    params: { section },
  }));
}

export const GET: APIRoute = async ({ params, url }) => {

  const section = params.section;
  const limit = parseInt(url.searchParams.get("limit") || "20", 10);
  const offset = parseInt(url.searchParams.get("offset") || "0", 10);

  console.log(section, limit, offset);
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