import { getTableColumns, getTableName, is, sql } from "drizzle-orm";
import { PgTable, isPgEnum } from "drizzle-orm/pg-core";
import { db, schema } from "@/lib/db";

export type SchemaDrift =
  | { kind: "column"; table: string; column: string }
  | { kind: "enum"; enum: string; value: string };

/**
 * Compares what `schema.ts` declares against what the database actually has,
 * in two queries.
 *
 * This is the check that would have caught both production outages before a
 * user did: the app selects whole tables (`select()` with no column list), so a
 * single missing column takes down every page that touches it. Comparing
 * against the catalog catches drift from any cause — a migration that never
 * ran, a hand-edited table, a faked `__drizzle_migrations` row.
 *
 * Missing enum *values* are covered too: those don't break reads, so a column
 * check alone would miss them, but they fail every INSERT that uses the new
 * value — a quieter outage that only shows up when someone tries to save.
 */
export async function findSchemaDrift(): Promise<SchemaDrift[]> {
  // `schema` also exports enums, relations and types — widen before narrowing.
  const exported = Object.values(schema) as unknown[];
  const tables = exported.filter((v): v is PgTable => is(v, PgTable));
  const enums = exported.filter(isPgEnum);

  const [columnRows, enumRows] = await Promise.all([
    db.execute<{ table_name: string; column_name: string }>(
      sql`select table_name, column_name from information_schema.columns where table_schema = 'public'`,
    ),
    db.execute<{ enum_name: string; enum_value: string }>(
      sql`select t.typname as enum_name, e.enumlabel as enum_value
          from pg_type t
          join pg_enum e on e.enumtypid = t.oid
          join pg_namespace n on n.oid = t.typnamespace
          where n.nspname = 'public'`,
    ),
  ]);

  const actualColumns = new Set<string>();
  for (const r of columnRows) actualColumns.add(`${r.table_name}.${r.column_name}`);

  const actualEnums = new Set<string>();
  for (const r of enumRows) actualEnums.add(`${r.enum_name}.${r.enum_value}`);

  const missing: SchemaDrift[] = [];

  for (const table of tables) {
    const tableName = getTableName(table);
    for (const column of Object.values(getTableColumns(table))) {
      if (!actualColumns.has(`${tableName}.${column.name}`)) {
        missing.push({ kind: "column", table: tableName, column: column.name });
      }
    }
  }

  for (const e of enums) {
    for (const value of e.enumValues) {
      if (!actualEnums.has(`${e.enumName}.${value}`)) {
        missing.push({ kind: "enum", enum: e.enumName, value });
      }
    }
  }

  return missing;
}
