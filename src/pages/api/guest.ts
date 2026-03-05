export const prerender = false;
import type { APIRoute } from "astro";

import nodemailer from "nodemailer";

export const POST: APIRoute = async ({ request }) => {
  const formData = await request.formData();

  const name = formData.get("name");
  const email = formData.get("email");
  const file = formData.get("article") as File;
  const rel = formData.get("relationship");
  const title = formData.get("title")

  let attachment;

  if (file && file.size > 0) {
    const buffer = Buffer.from(await file.arrayBuffer());

    attachment = {
      filename: file.name,
      content: buffer
    };
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: import.meta.env.EMAIL,
        pass: import.meta.env.PASS // App password if 2FA enabled
    },
  });

  await transporter.sendMail({
    from: `"Guest Post Submission" <${import.meta.env.EMAIL}>`,
    to: "editor@thetriangle.org",
    subject: `"${title}"`,
    text: `
            Title: ${title}
            Author(s): ${name}
            Email: ${email}
            Relationship to Drexel: ${rel}
`,
    attachments: attachment ? [attachment] : []
  });

  return new Response(JSON.stringify({ success: true }), {
    status: 200
  });
};