import pg from "pg";

const url =
  process.env.NEON_DATABASE_URL ??
  process.env.DATABASE_URL ??
  process.env.database_url;

if (!url) {
  console.error("Set NEON_DATABASE_URL or DATABASE_URL");
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: url,
  ssl: process.env.NEON_DATABASE_URL ? { rejectUnauthorized: false } : undefined,
});

const { rows } = await pool.query(`
  SELECT tablename
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT LIKE 'drizzle%'
`);

if (rows.length === 0) {
  console.log("No tables to truncate.");
  await pool.end();
  process.exit(0);
}

const quoted = rows.map((r) => `"${r.tablename}"`).join(", ");
await pool.query(`TRUNCATE TABLE ${quoted} RESTART IDENTITY CASCADE`);

console.log(
  `Cleared ${rows.length} tables:`,
  rows.map((r) => r.tablename).join(", "),
);

await pool.end();
