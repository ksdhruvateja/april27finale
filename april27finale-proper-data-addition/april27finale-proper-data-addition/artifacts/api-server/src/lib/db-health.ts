import { pool } from "@workspace/db";
import { logger } from "./logger";
import { ensureLocalUploadDirs, isLocalStorageMode } from "./localFileStorage";

/**
 * Creates the documents table when missing (e.g. before drizzle push is run).
 */
export async function ensureDocumentsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id serial PRIMARY KEY,
      name text NOT NULL,
      original_name text NOT NULL,
      mime_type text NOT NULL,
      size integer NOT NULL DEFAULT 0,
      object_path text NOT NULL,
      category text DEFAULT 'general',
      description text,
      tags text[] DEFAULT '{}',
      uploaded_by text,
      starred boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT now(),
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  logger.info("Documents table ready");
}

/**
 * Keeps serial/identity sequences in sync with imported IDs.
 * This prevents insert failures after manual JSON backfills.
 */
export async function ensureSerialSequencesAligned() {
  const { rows } = await pool.query<{
    table_name: string;
    column_name: string;
  }>(`
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and column_default like 'nextval(%'
    order by table_name, column_name
  `);

  for (const row of rows) {
    const tableName = row.table_name;
    const columnName = row.column_name;

    await pool.query(
      `
        select setval(
          pg_get_serial_sequence($1, $2),
          coalesce((select max("${columnName}") from "${tableName}"), 0) + 1,
          false
        )
      `,
      [tableName, columnName],
    );
  }

  logger.info({ sequencesChecked: rows.length }, "Serial sequences aligned");
}
