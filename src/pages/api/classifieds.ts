export const prerender = false;
export async function POST({ request }) {
  let data;

  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    data = await request.json();
  } else {
    const form = await request.formData();
    data = Object.fromEntries(form.entries());
  }

  const buttonData = btoa(JSON.stringify({
  name: data.name,
  email: data.email,
  message: data.message,
  label: data.category,
  end_date: data.end
}));

await fetch(import.meta.env.SLACK_WEBHOOK_CLASSIFIEDS, {
  method: "POST",
  body: JSON.stringify({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*NEW CLASSIFIED*\n*From:* ${data.name} (${data.email})\n*Type*: ${data.category}\n*Classified:* ${data.message}\n*End Date*: ${data.end}`
        }
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              emoji: true,
              text: "Approve"
            },
            style: "primary",
            action_id: "approved",
            value: buttonData
          },
          {
            type: "button",
            text: {
              type: "plain_text",
              emoji: true,
              text: "Reject"
            },
            style: "danger",
            action_id: "rejected",
            value: buttonData
          }
        ]
      }
    ]
  })
});

  return new Response("ok");
}