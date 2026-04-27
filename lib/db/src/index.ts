import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const rawConnectionString =
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.database_url;

if (!rawConnectionString) {
  throw new Error(
    "NEON_DATABASE_URL (preferred), DATABASE_URL, or database_url must be set. Did you forget to provision a database?",
  );
}

function normalizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    const sslMode = parsed.searchParams.get("sslmode");
    const hasLibpqCompat = parsed.searchParams.get("uselibpqcompat") === "true";

    // pg currently treats require/prefer/verify-ca as verify-full and emits a warning.
    // Make that behavior explicit to keep logs clean without changing security posture.
    if (!hasLibpqCompat && (sslMode === "require" || sslMode === "prefer" || sslMode === "verify-ca")) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {
    // Keep original value if URL parsing fails.
  }

  return url;
}

const connectionString = normalizeConnectionString(rawConnectionString);

export const pool = new Pool({
  connectionString,
  ssl: process.env.NEON_DATABASE_URL
    ? { rejectUnauthorized: false }
    : undefined,
});

pool.on("error", (err) => {
  console.error("[pg pool error]", err.message, (err as any).code, (err as any).detail);
});

export const db = drizzle(pool, {
  schema,
  logger: {
    logQuery(query, params) {
      // only log on error — suppress by default
    },
  },
});

export * from "./schema";
