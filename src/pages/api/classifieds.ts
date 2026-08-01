import type { APIContext } from "astro";

export const prerender = false;

const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");

/**
 * Classified submissions are persisted in the CMS first and only then announced
 * in Slack. The Slack message used to *be* the submission — it carried the whole
 * classified base64-encoded in the button value, so an unclicked or scrolled-away
 * message lost it. Now the buttons carry the CMS row id, and the same row can be
 * moderated from the CMS queue if nobody clicks.
 */
export async function POST({ request }: APIContext) {
  let data;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await request.json();
  } else {
    const form = await request.formData();
    data = Object.fromEntries(form.entries());
  }

  const created = await fetch(`${normalizedCmsBaseUrl}/classifieds`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      name: data.name,
      email: data.email,
      label: data.category,
      message: data.message,
      end_date: data.end,
    }),
  });

  // Failing loudly matters here: the form sends the reader to /error on a
  // non-ok response, which is far better than silently dropping the classified.
  if (!created.ok) {
    return new Response("could not save classified", { status: 502 });
  }

  const classified = (await created.json()) as { id: number };

  // Slack is a notification, not the record. A failure to post must not fail
  // the submission — it is already safely in the CMS queue.
  try {
    await fetch(import.meta.env.SLACK_WEBHOOK_CLASSIFIEDS, {
      method: "POST",
      body: JSON.stringify({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*NEW CLASSIFIED*\n*From:* ${data.name} (${data.email})\n*Type*: ${data.category}\n*Classified:* ${data.message}\n*End Date*: ${data.end}`,
            },
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: { type: "plain_text", emoji: true, text: "Approve" },
                style: "primary",
                action_id: "approved",
                value: String(classified.id),
              },
              {
                type: "button",
                text: { type: "plain_text", emoji: true, text: "Reject" },
                style: "danger",
                action_id: "rejected",
                value: String(classified.id),
              },
            ],
          },
        ],
      }),
    });
  } catch (err) {
    console.error("classified saved but Slack notification failed", err);
  }

  return new Response("ok");
}
