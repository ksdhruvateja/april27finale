import { db, appSettingsTable } from "@workspace/db";
import { inArray } from "drizzle-orm";

/**
 * Returns the Stripe secret key.
 * Priority: STRIPE_SECRET_KEY env var → stripe_secret_key app-setting.
 */
export async function getStripeSecretKey(): Promise<string | null> {
  if (process.env.STRIPE_SECRET_KEY) return process.env.STRIPE_SECRET_KEY;
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, ["stripe_secret_key"]));
  return rows.find(r => r.key === "stripe_secret_key")?.value ?? null;
}

/**
 * Returns the Stripe publishable key.
 * Priority: STRIPE_PUBLISHABLE_KEY env var → stripe_publishable_key app-setting.
 */
export async function getStripePublishableKey(): Promise<string | null> {
  if (process.env.STRIPE_PUBLISHABLE_KEY) return process.env.STRIPE_PUBLISHABLE_KEY;
  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, ["stripe_publishable_key"]));
  return rows.find(r => r.key === "stripe_publishable_key")?.value ?? null;
}

/**
 * Returns both keys in one DB round-trip.
 */
export async function getStripeKeys(): Promise<{ secretKey: string | null; publishableKey: string | null }> {
  const envSecret = process.env.STRIPE_SECRET_KEY ?? null;
  const envPublic = process.env.STRIPE_PUBLISHABLE_KEY ?? null;
  if (envSecret && envPublic) return { secretKey: envSecret, publishableKey: envPublic };

  const rows = await db
    .select()
    .from(appSettingsTable)
    .where(inArray(appSettingsTable.key, ["stripe_secret_key", "stripe_publishable_key"]));

  return {
    secretKey:      envSecret ?? rows.find(r => r.key === "stripe_secret_key")?.value   ?? null,
    publishableKey: envPublic ?? rows.find(r => r.key === "stripe_publishable_key")?.value ?? null,
  };
}
