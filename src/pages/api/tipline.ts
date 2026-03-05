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

  await fetch(import.meta.env.SLACK_WEBHOOK_TIPS, {
    method: "POST",
    body: JSON.stringify({
      text: `NEW TIP \n-----\n *Subject*: ${data.name} \n *Contact*: ${data.email} \n\n Additional Info: ${data.message}`
    })
  });

  return new Response("ok");
}