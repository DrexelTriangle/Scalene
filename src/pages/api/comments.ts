import type { APIRoute } from "astro";

export const prerender = false;

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export const POST: APIRoute = async ({ request, clientAddress }) => {
  try {
    const formData = await request.formData();

    const slug = String(formData.get("slug") ?? "").trim();
    const authorName = String(formData.get("author_name") ?? "").trim();
    const authorEmail = String(formData.get("author_email") ?? "").trim();
    const authorUrl = String(formData.get("author_url") ?? "").trim();
    const content = String(formData.get("content") ?? "").trim();
    const parentID = Number(formData.get("parent_id") ?? 0) || 0;

    if (!slug) return jsonResponse({ error: "Missing article slug" }, 400);
    if (!authorName) return jsonResponse({ error: "Name is required" }, 400);
    if (!content) return jsonResponse({ error: "Comment is required" }, 400);

    const response = await fetch(`${normalizedCmsBaseUrl}/articles/${slug}/comments`, {
      method: "POST",
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        ...(clientAddress ? { "X-Forwarded-For": clientAddress } : {}),
      },
      body: JSON.stringify({
        parent_id: parentID,
        author_name: authorName,
        author_email: authorEmail,
        author_url: authorUrl,
        content,
      }),
    });

    const text = await response.text();
    return new Response(text, {
      status: response.status,
      headers: { "Content-Type": response.headers.get("content-type") ?? "application/json" },
    });
  } catch {
    return jsonResponse({ error: "Failed to submit comment" }, 500);
  }
};
