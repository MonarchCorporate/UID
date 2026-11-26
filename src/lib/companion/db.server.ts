// Companion (desktop overlay) tables. Created on first use so the generated
// db/mysql/schema.sql stays untouched; all statements are idempotent.
import { createHash, randomBytes } from "node:crypto";
import type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db/pool.server";

const T = "ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci";

const STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS companion_devices (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    name VARCHAR(100) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    token_prefix VARCHAR(16) NOT NULL,
    version VARCHAR(40) NULL, os VARCHAR(20) NULL, channel VARCHAR(30) NULL,
    game_running TINYINT(1) NOT NULL DEFAULT 0,
    player_handle VARCHAR(100) NULL,
    last_ip VARCHAR(64) NULL,
    last_seen DATETIME(3) NULL,
    events_total INT NOT NULL DEFAULT 0,
    revoked TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    KEY companion_devices_user (user_id)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS companion_pairings (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    code VARCHAR(16) NOT NULL UNIQUE,
    secret_hash CHAR(64) NOT NULL,
    device VARCHAR(100) NOT NULL,
    version VARCHAR(40) NULL, ip VARCHAR(64) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    user_id CHAR(36) NULL, device_id BIGINT UNSIGNED NULL,
    token VARCHAR(80) NULL,
    created_at DATETIME(3) NOT NULL, expires_at DATETIME(3) NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS companion_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    uid VARCHAR(64) NOT NULL UNIQUE,
    device_id BIGINT UNSIGNED NULL,
    user_id CHAR(36) NULL,
    session VARCHAR(40) NULL,
    player VARCHAR(100) NULL,
    type VARCHAR(40) NOT NULL,
    actor VARCHAR(150) NULL, target VARCHAR(150) NULL,
    summary VARCHAR(300) NULL,
    data MEDIUMTEXT NULL,
    occurred_at DATETIME(3) NOT NULL,
    received_at DATETIME(3) NOT NULL,
    KEY companion_events_user (user_id, id),
    KEY companion_events_time (occurred_at),
    KEY companion_events_type (type, occurred_at)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS companion_sessions (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    session VARCHAR(40) NOT NULL UNIQUE,
    user_id CHAR(36) NULL, device_id BIGINT UNSIGNED NULL,
    player VARCHAR(100) NULL, channel VARCHAR(30) NULL, branch VARCHAR(60) NULL, shard VARCHAR(100) NULL,
    started_at DATETIME(3) NOT NULL, last_event_at DATETIME(3) NOT NULL, ended_at DATETIME(3) NULL,
    kills INT NOT NULL DEFAULT 0, npc_kills INT NOT NULL DEFAULT 0, deaths INT NOT NULL DEFAULT 0, events INT NOT NULL DEFAULT 0,
    KEY companion_sessions_user (user_id, started_at)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS companion_live (
    user_id CHAR(36) NOT NULL PRIMARY KEY,
    handle VARCHAR(100) NULL, location VARCHAR(150) NULL, ship VARCHAR(150) NULL, in_ship TINYINT(1) NOT NULL DEFAULT 0,
    shard VARCHAR(100) NULL, branch VARCHAR(60) NULL, online TINYINT(1) NOT NULL DEFAULT 0,
    updated_at DATETIME(3) NOT NULL
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS companion_contracts (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mission_key VARCHAR(120) NOT NULL UNIQUE,
    mission_id VARCHAR(64) NULL,
    user_id CHAR(36) NULL, handle VARCHAR(100) NOT NULL,
    title VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'aktiv',
    accepted_at DATETIME(3) NOT NULL, ended_at DATETIME(3) NULL,
    KEY companion_contracts_user (user_id, accepted_at)
  ) ${T}`,
  `CREATE TABLE IF NOT EXISTS companion_plan (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    title VARCHAR(150) NOT NULL, item_name VARCHAR(150) NULL,
    quantity INT NOT NULL DEFAULT 1, got INT NOT NULL DEFAULT 0,
    location VARCHAR(150) NULL, notes VARCHAR(300) NULL,
    done TINYINT(1) NOT NULL DEFAULT 0, position INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL, done_at DATETIME(3) NULL,
    KEY companion_plan_user (user_id, done, position)
  ) ${T}`,
  // org knowledge: where which mineral can be mined (UEX has no location data for this)
  `CREATE TABLE IF NOT EXISTS mining_spots (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    mineral VARCHAR(100) NOT NULL,
    location VARCHAR(150) NOT NULL,
    star_system VARCHAR(60) NULL,
    method VARCHAR(20) NOT NULL DEFAULT 'ship',
    notes VARCHAR(500) NULL,
    created_by CHAR(36) NULL,
    created_at DATETIME(3) NOT NULL,
    KEY mining_spots_mineral (mineral)
  ) ${T}`,
];

let ready: Promise<void> | undefined;

/** Creates the companion tables once per process. */
export function ensureCompanionSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const pool = getPool();
      for (const s of STATEMENTS) await pool.query(s);
    })().catch((e) => {
      ready = undefined;
      throw e;
    });
  }
  return ready;
}

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newDeviceToken = () => "uidc_" + randomBytes(30).toString("base64url");

export function sqlDate(d: Date | string | number = new Date()): string {
  const x = d instanceof Date ? d : new Date(d);
  return (Number.isNaN(x.getTime()) ? new Date() : x).toISOString().replace("T", " ").replace("Z", "");
}

export async function q<T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ensureCompanionSchema();
  const [rows] = await getPool().query<T[]>(sql, params);
  return rows;
}

export async function q1<T extends RowDataPacket = RowDataPacket>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return (await q<T>(sql, params))[0];
}

export async function run(sql: string, params: unknown[] = []): Promise<{ insertId: number; changes: number }> {
  await ensureCompanionSchema();
  const [res] = await getPool().query<ResultSetHeader>(sql, params);
  return { insertId: Number(res.insertId), changes: Number(res.affectedRows) };
}

export type Device = RowDataPacket & {
  id: number;
  user_id: string;
  name: string;
  player_handle: string | null;
  channel: string | null;
  revoked: number;
};

/** Resolves the companion device from `Authorization: Bearer uidc_…`. */
export async function deviceFromRequest(request: Request): Promise<Device | null> {
  const m = /^Bearer\s+(\S+)$/i.exec(request.headers.get("authorization") ?? "");
  if (!m) return null;
  return (await q1<Device>("SELECT * FROM companion_devices WHERE token_hash = ? AND revoked = 0", [sha256(m[1])])) ?? null;
}
