import { Router } from "express";
import { db, appSettingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router = Router();

const ALLOWED_KEYS = [
  "easyship_api_key",
  "company_name",
  "company_address",
  "company_city",
  "company_state",
  "company_zip",
  "company_phone",
  "company_email",
  "net_terms",
  "quote_validity_text",
  "invoice_prefix",
  "invoice_start",
  "quote_prefix",
  "quote_start",
  "stripe_secret_key",
  "stripe_publishable_key",
];

/** Keys whose values are masked in GET responses (show first 8 + •••• + last 4) */
const MASKED_KEYS = new Set(["easyship_api_key", "stripe_secret_key"]);

function maskValue(value: string): string {
  if (value.length <= 12) return "••••••••••••";
  return value.slice(0, 8) + "••••••••" + value.slice(-4);
}

router.get("/app-settings", async (_req, res): Promise<void> => {
  const rows = await db.select().from(appSettingsTable);
  const result: Record<string, string | null> = {};
  for (const row of rows) {
    if (MASKED_KEYS.has(row.key) && row.value) {
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
  if (!row) { res.status(404).json({ error: "Not found" }); return; }
  // Return masked value for sensitive keys
  const value = (MASKED_KEYS.has(key) && row.value) ? maskValue(row.value) : row.value;
  res.json({ key: row.key, value, configured: !!row.value });
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
