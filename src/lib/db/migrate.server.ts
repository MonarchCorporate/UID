// Applies db/mysql/schema.sql (idempotent CREATE TABLE IF NOT EXISTS) on
// server start, so a fresh Hostinger database is set up automatically.
import process from "node:process";
import { createHash } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import schemaSql from "../../../db/mysql/schema.sql?raw";
import { getPool } from "./pool.server";

let done: Promise<void> | undefined;

export function runMigrations(): Promise<void> {
  if (!done) done = migrate();
  return done;
}

async function migrate() {
  if (!process.env.DB_NAME && !process.env.DATABASE_URL) {
    console.warn("[db] no database configured – skipping migrations");
    return;
  }
  const pool = getPool();
  const hash = createHash("sha256").update(schemaSql).digest("hex");
  await pool.query(
    "CREATE TABLE IF NOT EXISTS app_schema (id INT NOT NULL PRIMARY KEY, hash CHAR(64) NOT NULL, applied_at DATETIME(6) NOT NULL) ENGINE=InnoDB",
  );
  const [rows] = await pool.query<RowDataPacket[]>("SELECT hash FROM app_schema WHERE id = 1");
  if (rows[0]?.hash === hash) return;
  const conn = await pool.getConnection();
  try {
    const statements = schemaSql
      .split(/;\s*\n/)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter(Boolean);
    for (const stmt of statements) await conn.query(stmt);
    await conn.query("SET FOREIGN_KEY_CHECKS = 1");
    await conn.query(
      "INSERT INTO app_schema (id, hash, applied_at) VALUES (1, ?, UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE hash = VALUES(hash), applied_at = VALUES(applied_at)",
      [hash],
    );
    console.log(`[db] schema applied (${statements.length} statements)`);
  } finally {
    conn.release();
  }
}
