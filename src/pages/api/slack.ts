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

  await fetch(import.meta.env.SLACK_WEBHOOK, {
    method: "POST",
    body: JSON.stringify({
      text: `NEW INQUIRY \n From: ${data.name} (${data.email}) \n Message: ${data.message}`
    })
  });

  return new Response("ok");
}