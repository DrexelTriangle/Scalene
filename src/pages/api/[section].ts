import type { APIRoute, GetStaticPaths } from 'astro';
import { callProcedure } from '../../utils/db';

// Define the sections you want to pre-generate
export const getStaticPaths: GetStaticPaths = async () => {
  const sections = ['news', 'sports']; // adjust to your real sections
  return sections.map((section) => ({ params: { section } }));
};

export const GET: APIRoute = async ({ params }) => {
  const section = params.section;
  const limit = params.limit;
  const offset = params.offset;

  try {
    const articles = await callProcedure('get_articles_by_section', [
      section,
      limit,
      offset,
    ]);

    console.log(articles)
    console.log(JSON.stringify(articles))

    return new Response(JSON.stringify(articles), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store"
      }
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
};
