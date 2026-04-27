import { defineConfig } from "drizzle-kit";
import path from "path";

const rawUrl =
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.database_url;

if (!rawUrl) {
  throw new Error("NEON_DATABASE_URL (preferred), DATABASE_URL, or database_url must be set");
}

function normalizeConnectionString(url: string): string {
  try {
    const parsed = new URL(url);
    const sslMode = parsed.searchParams.get("sslmode");
    const hasLibpqCompat = parsed.searchParams.get("uselibpqcompat") === "true";

    if (!hasLibpqCompat && (sslMode === "require" || sslMode === "prefer" || sslMode === "verify-ca")) {
      parsed.searchParams.set("sslmode", "verify-full");
      return parsed.toString();
    }
  } catch {
    // Keep original value if URL parsing fails.
  }

  return url;
}

const url = normalizeConnectionString(rawUrl);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url,
    ssl: process.env.NEON_DATABASE_URL ? "require" : undefined,
  },
});
