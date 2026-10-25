import type { APIRoute } from 'astro';
import { forwardSubscribe } from '../../utils/newsletterSubscribe';

export const prerender = false;

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1';

export const POST: APIRoute = async ({ request, clientAddress }) => {
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    // An empty or broken body goes on as empty fields, for the CMS to refuse.
  }
  const result = await forwardSubscribe({ cmsBaseUrl: String(cmsBaseUrl), body, clientAddress });
  return new Response(JSON.stringify(result.body), {
    status: result.status,
    headers: { 'Content-Type': 'application/json' },
  });
};
