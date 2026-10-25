export const prerender = false;
import type { APIRoute } from 'astro';
import { proxyNewsletter } from '../../utils/newsletterProxy';

// www.thetriangle.org/newsletter/... -> the CMS's /v1/newsletter/... (the
// unsubscribe page, view online, click redirects, open pixel). See
// utils/newsletterProxy.
const cmsBaseUrl = String(import.meta.env.CMS_API_BASE_URL ?? 'https://localhost:8080/v1');

const handle: APIRoute = async ({ params, request, clientAddress }) =>
  proxyNewsletter({
    cmsBaseUrl,
    path: params.path,
    search: new URL(request.url).search,
    method: request.method,
    requestHeaders: request.headers,
    body: request.method === 'POST' ? await request.text() : undefined,
    clientAddress,
  });

export const GET = handle;
export const HEAD = handle;
export const POST = handle;
