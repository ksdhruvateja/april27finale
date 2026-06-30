import { Router } from "express";
import nodemailer from "nodemailer";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  return row?.value ?? null;
}

router.post("/payments/test-smtp", async (_req, res): Promise<void> => {
  const [host, port, user, pass] = await Promise.all([
    getSetting("smtp_host"),
    getSetting("smtp_port"),
    getSetting("smtp_user"),
    getSetting("smtp_pass"),
  ]);

  if (!host || !user || !pass) {
    res.status(400).json({ ok: false, error: "SMTP settings are incomplete. Please fill in Host, Username, and Password." });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host,
      port: Number(port ?? 587),
      secure: Number(port ?? 587) === 465,
      auth: { user, pass },
      connectionTimeout: 8000,
      greetingTimeout: 8000,
    });
    await transporter.verify();
    res.json({ ok: true, message: `Connected to ${host}:${port ?? 587} successfully.` });
  } catch (err: any) {
    res.status(200).json({ ok: false, error: err.message || "Connection failed." });
  }
});

router.post("/payments/test-payment-link", async (_req, res): Promise<void> => {
  const url = await getSetting("payment_link_url");

  if (!url) {
    res.status(400).json({ ok: false, error: "No payment link URL configured." });
    return;
  }

  try {
    new URL(url);
  } catch {
    res.status(200).json({ ok: false, error: "The URL is not valid. Make sure it starts with https://." });
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(url, { method: "HEAD", signal: controller.signal, redirect: "follow" });
    clearTimeout(timer);
    if (resp.ok || resp.status === 405) {
      res.json({ ok: true, message: `URL reachable (HTTP ${resp.status}).` });
    } else {
      res.json({ ok: false, error: `URL returned HTTP ${resp.status}. Check that the link is correct and publicly accessible.` });
    }
  } catch (err: any) {
    const msg = err.name === "AbortError"
      ? "Request timed out (8s). The URL may be unreachable."
      : `Could not reach URL: ${err.message}`;
    res.status(200).json({ ok: false, error: msg });
  }
});

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
