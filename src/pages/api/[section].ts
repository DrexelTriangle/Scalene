import type { APIRoute, GetStaticPaths } from 'astro';
import { callProcedure } from '../../utils/db';

export const getStaticPaths: GetStaticPaths = async () => {
  const sections = ['news', 'sports', 'opinion']; // adjust to your real sections
  return sections.map((section) => ({ params: { section } }));
};

export const GET: APIRoute = async ({ params }) => {

  try {
    const articles = await get

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
