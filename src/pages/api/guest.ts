export const prerender = false;
import type { APIRoute } from "astro";

import nodemailer from "nodemailer";

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();

  const name = formData.get("name");
  const email = formData.get("email");
  const file = formData.get("article") as File;
  const rel = formData.get("relationship");
  const title = formData.get("title");

  if (!name || !email || !rel || !title) {
    return new Response(
      JSON.stringify({ success: false, error: "Missing required fields" }),
      { status: 400 }
    );
  }

  const user = import.meta.env.EMAIL;
  const pass = import.meta.env.PASS;

  if (!user || !pass) {
    console.error(
      "[api/guest] EMAIL/PASS env vars are not set; cannot send submission email."
    );
    return new Response(
      JSON.stringify({ success: false, error: "Mail service not configured" }),
      { status: 500 }
    );
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
    return new Response(
      JSON.stringify({ success: false, error: "Failed to send submission" }),
      { status: 500 }
    );
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
  });
};
