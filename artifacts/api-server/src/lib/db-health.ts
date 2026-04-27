import { pool } from "@workspace/db";
import { logger } from "./logger";

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
