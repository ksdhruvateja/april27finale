import { Router } from "express";
import nodemailer from "nodemailer";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

router.post("/payments/send-reminder", async (req, res): Promise<void> => {
  const { to, subject, body } = req.body as { to: string; subject: string; body: string };

  if (!to || !subject || !body) {
    res.status(400).json({ error: "Missing required fields: to, subject, body" });
    return;
  }

  const [host, port, user, pass, from] = await Promise.all([
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_user"),
    getSetting("smtp_pass"),
    getSetting("smtp_from"),
  ]);

  if (!host || !user || !pass) {
    res.status(503).json({
      error: "Email not configured. Please set up SMTP settings in Settings → Email.",
    });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port ?? 587),
      secure: Number(port ?? 587) === 465,
      auth: { user, pass },
    });

    const htmlBody = body
      .split("\n")
      .map(line => line.trim() ? `<p style="margin:0 0 10px;font-family:sans-serif;font-size:14px;color:#334155">${line}</p>` : `<br/>`)
      .join("");

    await transporter.sendMail({
      from: from || user,
      to,
      subject,
      text: body,
      html: `<div style="max-width:600px;margin:0 auto;padding:32px 24px;background:#f8fafc">${htmlBody}</div>`,
    });

    res.json({ success: true });
  } catch (err: any) {
    console.error("Email send error:", err);
    res.status(500).json({ error: `Failed to send email: ${err.message}` });
  }
});

export default router;
