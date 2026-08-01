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

function fallbackErrorFromText(text: string, status: number) {
  const trimmed = text.replace(/\s+/g, " ").trim();
  if (trimmed) {
    return trimmed.slice(0, 240);
  }
  return `Comment service returned ${status}`;
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

    const response = await fetch(`${normalizedCmsBaseUrl}/articles/${encodeURIComponent(slug)}/comments`, {
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
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      return new Response(text, {
        status: response.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!response.ok) {
      return jsonResponse({ error: fallbackErrorFromText(text, response.status) }, response.status);
    }

    return jsonResponse({ error: "Comment service returned an invalid response" }, 502);
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : "Failed to submit comment";
    return jsonResponse({ error: message }, 500);
  }
};
