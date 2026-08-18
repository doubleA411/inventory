/**
 * Emits a self-contained SQL script that reports every column and enum value
 * `schema.ts` declares but the target database lacks.
 *
 * Run it against production to find all remaining drift at once, instead of
 * discovering it one runtime error at a time:
 *
 *   npx tsx scripts/gen-drift-sql.ts > drift-audit.sql
 *
 * Reads no database itself — it only inspects schema.ts, so it is safe to run
 * anywhere. The generated SQL is read-only.
 */
import { getTableColumns, getTableName, is } from "drizzle-orm";
import { PgTable, isPgEnum } from "drizzle-orm/pg-core";
import * as schema from "../src/lib/db/schema";

const exported = Object.values(schema) as unknown[];
const tables = exported.filter((v): v is PgTable => is(v, PgTable));
const enums = exported.filter(isPgEnum);

const columns: string[] = [];
for (const table of tables) {
  const tableName = getTableName(table);
  for (const column of Object.values(getTableColumns(table))) {
    columns.push(`  ('${tableName}','${column.name}')`);
  }
}

const enumValues: string[] = [];
for (const e of enums) {
  for (const value of e.enumValues) {
    enumValues.push(`  ('${e.enumName}','${value}')`);
  }
}

console.log(`-- Schema drift audit — generated from schema.ts
-- ${tables.length} tables, ${columns.length} columns, ${enums.length} enums, ${enumValues.length} enum values.
-- Read-only. Any row returned is something the code expects and the database lacks.

WITH expected_columns(table_name, column_name) AS (VALUES
${columns.join(",\n")}
),
expected_enums(enum_name, enum_value) AS (VALUES
${enumValues.join(",\n")}
),
actual_columns AS (
  SELECT table_name::text, column_name::text
  FROM information_schema.columns
  WHERE table_schema = 'public'
),
actual_enums AS (
  SELECT t.typname::text AS enum_name, e.enumlabel::text AS enum_value
  FROM pg_type t
  JOIN pg_enum e ON e.enumtypid = t.oid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
)
SELECT 'missing column' AS problem, c.table_name AS object, c.column_name AS detail
FROM expected_columns c
LEFT JOIN actual_columns a
  ON a.table_name = c.table_name AND a.column_name = c.column_name
WHERE a.column_name IS NULL

UNION ALL

SELECT 'missing enum value', e.enum_name, e.enum_value
FROM expected_enums e
LEFT JOIN actual_enums a
  ON a.enum_name = e.enum_name AND a.enum_value = e.enum_value
WHERE a.enum_value IS NULL

ORDER BY 1, 2, 3;

-- No rows = the database matches schema.ts exactly. Nothing else can throw
-- "column ... does not exist" at runtime.`);
