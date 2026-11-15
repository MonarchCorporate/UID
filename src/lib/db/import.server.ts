// One-time data import from the former Supabase/Postgres database.
// Input: { [table]: rows[] } as exported with json_agg(); auth users under
// "auth_users", storage files under "storage_objects" (content as base64).
import type { PoolConnection } from "mysql2/promise";
import { withTransaction } from "./pool.server";
import { TABLES } from "./schema.gen";
import { toDb } from "./values";

const q = (id: string) => "`" + id.replace(/`/g, "``") + "`";

async function insertRows(conn: PoolConnection, table: string, rows: Record<string, unknown>[]) {
  if (table === "storage_objects") {
    for (const r of rows) {
      await conn.query(
        `INSERT INTO storage_objects (id, bucket_id, name, owner, content_type, size, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          r.id, r.bucket_id, r.name, r.owner ?? null, r.content_type ?? null,
          Number(r.size ?? 0), Buffer.from(String(r.content_base64 ?? ""), "base64"),
          toDb({ kind: "ts", nullable: false }, r.created_at ?? new Date()),
          toDb({ kind: "ts", nullable: false }, r.updated_at ?? r.created_at ?? new Date()),
        ],
      );
    }
    return rows.length;
  }
  const meta = TABLES[table];
  if (!meta) throw new Error(`unknown table ${table}`);
  const cols = Object.keys(meta.columns);
  let n = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const params: unknown[] = [];
    const values = chunk
      .map((r) => {
        for (const c of cols) {
          let v = r[c];
          if (v === undefined) v = null;
          // NOT NULL columns without a value fall back to their default
          if (v === null && !meta.columns[c].nullable && meta.columns[c].default && "value" in meta.columns[c].default!) {
            v = (meta.columns[c].default as { value: unknown }).value;
          }
          params.push(toDb(meta.columns[c], v));
        }
        return "(" + cols.map(() => "?").join(", ") + ")";
      })
      .join(", ");
    await conn.query(`INSERT INTO ${q(table)} (${cols.map(q).join(", ")}) VALUES ${values}`, params);
    n += chunk.length;
  }
  return n;
}

/** Replaces the contents of the given tables with the provided rows. */
export async function importTables(data: Record<string, Record<string, unknown>[]>, opts: { truncate?: boolean } = {}) {
  const result: Record<string, number> = {};
  await withTransaction(async (conn) => {
    await conn.query("SET FOREIGN_KEY_CHECKS = 0");
    try {
      for (const [table, rows] of Object.entries(data)) {
        if (table === "_pad") continue;
        if (!TABLES[table] && table !== "storage_objects") throw new Error(`unknown table ${table}`);
        if (opts.truncate) await conn.query(`DELETE FROM ${q(table)}`);
        result[table] = await insertRows(conn, table, rows ?? []);
      }
    } finally {
      await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    }
  });
  return result;
}
