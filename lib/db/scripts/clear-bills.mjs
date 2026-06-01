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

const { rowCount } = await pool.query(`DELETE FROM bills`);
await pool.query(`ALTER SEQUENCE bills_id_seq RESTART WITH 1`).catch(() => {});

console.log(`Deleted ${rowCount ?? 0} bill(s).`);
await pool.end();
