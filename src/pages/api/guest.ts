export const prerender = false;
import type { APIRoute } from "astro";

import nodemailer from "nodemailer";

export const POST: APIRoute = async ({ request }) => {
  // A native (no-JS) form submission is a browser navigation and accepts
  // HTML; our fetch() call does not. For native submissions we redirect to
  // the success/error pages instead of returning JSON.
  const wantsHtml = (request.headers.get("accept") || "").includes("text/html");
  const respond = (ok: boolean, status: number, error?: string) =>
    wantsHtml
      ? Response.redirect(
          new URL(ok ? "/submitted" : "/error", request.url),
          303
        )
      : new Response(JSON.stringify({ success: ok, error }), { status });

  const formData = await request.formData();

  const name = formData.get("name");
  const email = formData.get("email");
  const file = formData.get("article") as File;
  const rel = formData.get("relationship");
  const title = formData.get("title");

  if (!name || !email || !rel || !title) {
    return respond(false, 400, "Missing required fields");
  }

  const user = import.meta.env.EMAIL;
  const pass = import.meta.env.PASS;

  if (!user || !pass) {
    console.error(
      "[api/guest] EMAIL/PASS env vars are not set; cannot send submission email."
    );
    return respond(false, 500, "Mail service not configured");
  }

  let attachment;

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());

    attachment = {
      filename: file.name,
      content: buffer,
    };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass, // App password if 2FA enabled
    },
  });

  try {
    await transporter.sendMail({
      from: `"Guest Post Submission" <${user}>`,
      to: "editor@thetriangle.org",
      subject: `"${title}"`,
      text: `
            Title: ${title}
            Author(s): ${name}
            Email: ${email}
            Relationship to Drexel: ${rel}
`,
      attachments: attachment ? [attachment] : [],
    });
  } catch (err) {
    console.error("[api/guest] Failed to send submission email:", err);
    return respond(false, 500, "Failed to send submission");
  }

  return respond(true, 200);
};
