import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ALLOWED_KEYS = [
  "easyship_api_key",
  "stripe_secret_key",
  "stripe_publishable_key",
  "stripe_webhook_secret",
  "company_name",
  "company_tagline",
  "company_address",
  "company_city",
  "company_state",
  "company_zip",
  "company_phone",
  "company_email",
  "company_website",
  "company_logo",          // base64 data-URL of the company logo
  "net_terms",
  "company_addresses",
];

const MASKED_KEYS = ["easyship_api_key", "stripe_secret_key", "stripe_webhook_secret"];

const maskValue = (value: string) => value.slice(0, 6) + "••••••••" + value.slice(-4);

router.get("/app-settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(appSettingsTable);
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    if (MASKED_KEYS.includes(row.key) && row.value) {
      result[row.key] = maskValue(row.value);
    } else {
      result[row.key] = row.value ?? null;
    }
  }
  res.json(result);
});

router.get("/app-settings/:key", async (req, res): Promise<void> => {
  const key = req.params.key;
  const [row] = await db.select().from(appSettingsTable).where(eq(appSettingsTable.key, key));
  // Return null value for settings that haven't been saved yet (not a 404)
  res.json({ key, value: row?.value ?? null });
});

router.put("/app-settings/:key", async (req, res): Promise<void> => {
  const key = req.params.key;
  if (!ALLOWED_KEYS.includes(key)) {
    res.status(400).json({ error: "Key not allowed" });
    return;
  }
  const value = String(req.body.value ?? "").trim() || null;
  await db.insert(appSettingsTable)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettingsTable.key, set: { value, updatedAt: new Date() } });
  res.json({ success: true, key });
});

export default router;
