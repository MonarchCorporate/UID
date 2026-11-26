// Receives Game.log events from the companion and feeds them into the UID
// data model: inventory (inventory_items / inventory_locations), ships
// (user_ships), blueprints (user_blueprint_collection), contracts and the
// session plan.
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { q, q1, run, sqlDate, type Device } from "./db.server";
import { containerName, itemCategory, itemName, placeName, shipName, stripId } from "./names";

const MAX_EVENTS = 1000;
const TYPES = new Set([
  "session_start", "session_end", "game_version", "login", "join_pu", "location", "vehicle_control",
  "vehicle_destruction", "actor_death", "mission", "mission_ended", "zone", "notification",
  "inventory_move", "shop_buy", "blueprint",
]);

type Ev = {
  uid: string;
  type: string;
  ts: Date;
  session: string | null;
  player: string | null;
  data: Record<string, string>;
};

const str = (v: unknown, n = 150): string | null => (v == null ? null : String(v).slice(0, n));
const MOVE_VERB: Record<string, string> = { store: "eingelagert", take: "entnommen", move: "verschoben", drop: "abgelegt" };

function validate(raw: unknown): Ev | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const type = String(r.type ?? "");
  const uid = String(r.uid ?? "");
  if (!TYPES.has(type) || !/^[a-f0-9]{16,64}$/.test(uid)) return null;
  let ts = new Date(String(r.ts));
  if (Number.isNaN(ts.getTime()) || ts.getTime() > Date.now() + 86_400_000) ts = new Date();
  const data: Record<string, string> = {};
  if (r.data && typeof r.data === "object") {
    for (const [k, v] of Object.entries(r.data as Record<string, unknown>).slice(0, 40)) data[k.slice(0, 40)] = String(v ?? "").slice(0, 300);
  }
  return { uid, type, ts, session: str(r.session, 40), player: r.player ? str(r.player, 100) : null, data };
}

export function summarize(e: { type: string; data: Record<string, string> }): string {
  const d = e.data;
  switch (e.type) {
    case "session_start": return `Spiel gestartet (${d.channel || "LIVE"})`;
    case "session_end": return "Spiel beendet";
    case "game_version": return `Version ${d.branch}`;
    case "login": return `${d.handle} hat sich angemeldet`;
    case "join_pu": return `Persistent Universe betreten – Shard ${d.shard}`;
    case "location": return `Ort: ${placeName(d.location)}`;
    case "vehicle_control": return `${d.action === "exit" ? "Verlässt" : "Steuert"} ${shipName(d.vehicle_class || d.vehicle)}`;
    case "vehicle_destruction": return `${shipName(d.vehicle_class || d.vehicle)} ${d.to_level === "2" ? "zerstört" : "beschädigt"} durch ${stripId(d.caused_by)}`;
    case "actor_death":
      if (d.killer === d.victim) return `${stripId(d.victim)} ist gestorben (${d.damage_type})`;
      return `${stripId(d.killer)} hat ${d.victim_npc === "1" ? "einen NPC" : stripId(d.victim)} getötet (${itemName(d.weapon_class) || d.damage_type})`;
    case "mission": case "zone": case "notification": return d.text;
    case "mission_ended": return `Mission beendet: ${d.state}`;
    case "blueprint": return `Blueprint erhalten: ${d.name}`;
    case "inventory_move": {
      const to = d.to_type === "dropped" ? "" : ` → ${containerName(d.to_type, d.to_name)}`;
      return `${Number(d.amount) > 1 ? d.amount + "× " : ""}${itemName(d.item)} ${MOVE_VERB[d.action] || "bewegt"}: ${containerName(d.from_type, d.from_name)}${to}`;
    }
    case "shop_buy": return `${Number(d.quantity) > 1 ? d.quantity + "× " : ""}${itemName(d.item)} gekauft${d.location ? " in " + placeName(d.location) : ""}`;
    default: return e.type;
  }
}

// ------------------------------------------------------------ catalog ---

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/** Finds the catalog ship for a game class such as "DRAK_Cutlass_Black". */
async function matchShip(cls: string): Promise<{ slug: string; name: string; manufacturer: string | null } | null> {
  const base = stripId(cls);
  const parts = base.split("_");
  const code = parts[0]?.toUpperCase() ?? "";
  const rest = norm(parts.slice(1).join(" "));
  const rows = await q<RowDataPacket>("SELECT slug, name, manufacturer, manufacturer_code FROM ship_catalog WHERE manufacturer_code = ?", [code]);
  const hit = rows.find((r) => norm(String(r.name)) === rest) ?? rows.find((r) => rest && norm(String(r.name)).includes(rest)) ?? rows.find((r) => rest && rest.includes(norm(String(r.name))));
  return hit ? { slug: String(hit.slug), name: String(hit.name), manufacturer: hit.manufacturer ? String(hit.manufacturer) : null } : null;
}

/** Finds the catalog item for a game class (wiki raw.class_name) or readable name. */
async function matchItem(cls: string): Promise<{ item_ref: string; name: string; kind: string | null } | null> {
  const c = stripId(cls);
  if (!c) return null;
  const byClass = await q1<RowDataPacket>(
    "SELECT item_ref, name, kind FROM inventory_item_catalog WHERE merged_into IS NULL AND JSON_VALID(raw) AND LOWER(JSON_UNQUOTE(JSON_EXTRACT(raw, '$.class_name'))) = ? LIMIT 1",
    [c.toLowerCase()],
  ).catch(() => undefined);
  if (byClass) return { item_ref: String(byClass.item_ref), name: String(byClass.name), kind: byClass.kind ? String(byClass.kind) : null };
  if (/\s/.test(c)) {
    const byName = await q1<RowDataPacket>("SELECT item_ref, name, kind FROM inventory_item_catalog WHERE merged_into IS NULL AND LOWER(name) = ? LIMIT 1", [c.toLowerCase()]);
    if (byName) return { item_ref: String(byName.item_ref), name: String(byName.name), kind: byName.kind ? String(byName.kind) : null };
  }
  return null;
}

// ---------------------------------------------------------- inventory ---

/** inventory_locations row for a game container (station, ship, body). */
async function locationFor(userId: string, type: string, name: string): Promise<string> {
  const key = `sc:${type}:${name}`.slice(0, 255);
  const hit = await q1<RowDataPacket>("SELECT id FROM inventory_locations WHERE owner_id = ? AND preset_key = ?", [userId, key]);
  if (hit) return String(hit.id);
  const id = randomUUID();
  await run(
    "INSERT IGNORE INTO inventory_locations (id, owner_id, name, notes, visibility, source, preset_key, created_at, updated_at) VALUES (?, ?, ?, ?, 'private', 'companion', ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))",
    [id, userId, containerName(type, name), type === "ship" ? "Schiff (aus dem Spiel)" : type === "location" ? "Lager (aus dem Spiel)" : null, key],
  );
  const again = await q1<RowDataPacket>("SELECT id FROM inventory_locations WHERE owner_id = ? AND preset_key = ?", [userId, key]);
  return String(again?.id ?? id);
}

export async function addItem(userId: string, cls: string, qty: number, type: string, container: string): Promise<void> {
  const locId = await locationFor(userId, type, container);
  const cat = await matchItem(cls);
  const name = cat?.name ?? itemName(cls);
  const ref = cat?.item_ref ?? null;
  const existing = await q1<RowDataPacket>(
    `SELECT id FROM inventory_items WHERE owner_id = ? AND location_id = ? AND ${ref ? "item_ref = ?" : "item_ref IS NULL AND item_name = ?"} LIMIT 1`,
    [userId, locId, ref ?? name],
  );
  if (existing) {
    await run("UPDATE inventory_items SET qty = qty + ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [qty, existing.id]);
    return;
  }
  await run(
    `INSERT INTO inventory_items (id, owner_id, item_ref, item_name, item_kind, qty, location_id, visibility, notes, unit, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'private', ?, 'pcs', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
    [randomUUID(), userId, ref, name, cat?.kind ?? itemCategory(cls), qty, locId, `Companion: ${stripId(cls)}`],
  );
}

export async function takeItem(userId: string, cls: string, qty: number, type: string, container: string): Promise<number> {
  const key = `sc:${type}:${container}`.slice(0, 255);
  const loc = await q1<RowDataPacket>("SELECT id FROM inventory_locations WHERE owner_id = ? AND preset_key = ?", [userId, key]);
  if (!loc) return 0;
  const cat = await matchItem(cls);
  const name = cat?.name ?? itemName(cls);
  const row = await q1<RowDataPacket>(
    `SELECT id, qty FROM inventory_items WHERE owner_id = ? AND location_id = ? AND (${cat ? "item_ref = ? OR " : ""}item_name = ?) LIMIT 1`,
    cat ? [userId, loc.id, cat.item_ref, name] : [userId, loc.id, name],
  );
  if (!row) return 0;
  const have = Number(row.qty);
  const taken = Math.min(have, qty);
  if (have - taken <= 0) await run("DELETE FROM inventory_items WHERE id = ?", [row.id]);
  else await run("UPDATE inventory_items SET qty = qty - ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [taken, row.id]);
  return taken;
}

// --------------------------------------------------------------- plan ---

/** Ticks off session-plan entries when matching items arrive. */
export async function planGot(userId: string, item: string, qty: number): Promise<boolean> {
  if (!item) return false;
  const disp = itemName(item).toLowerCase();
  const cls = stripId(item).toLowerCase();
  const open = await q<RowDataPacket>("SELECT * FROM companion_plan WHERE user_id = ? AND done = 0 ORDER BY position", [userId]);
  let left = qty;
  let changed = false;
  for (const p of open) {
    if (left <= 0) break;
    const names = [String(p.item_name ?? "").toLowerCase(), String(p.title ?? "").toLowerCase()];
    const hit = names.some((n) => n && (n === cls || n === disp || (n.length >= 4 && (disp.includes(n) || cls.includes(n)))));
    if (!hit) continue;
    const take = Math.min(left, Number(p.quantity) - Number(p.got));
    const got = Number(p.got) + take;
    left -= take;
    const done = got >= Number(p.quantity);
    await run("UPDATE companion_plan SET got = ?, done = ?, done_at = ? WHERE id = ?", [got, done ? 1 : 0, done ? sqlDate() : null, p.id]);
    changed = true;
  }
  return changed;
}

// ------------------------------------------------------------ effects ---

function missionTitle(text: string): string {
  const i = text.indexOf(":");
  return (i >= 0 ? text.slice(i + 1) : text).trim().slice(0, 200) || "Auftrag";
}

const CONTRACT_STATUS: Record<string, string> = { accepted: "aktiv", completed: "abgeschlossen", failed: "fehlgeschlagen", abandoned: "abgebrochen" };

async function setLive(userId: string, fields: Record<string, unknown>) {
  await run("INSERT IGNORE INTO companion_live (user_id, updated_at) VALUES (?, ?)", [userId, sqlDate()]);
  const cols = Object.keys(fields);
  if (cols.length) await run(`UPDATE companion_live SET ${cols.map((c) => `${c} = ?`).join(", ")}, updated_at = ? WHERE user_id = ?`, [...cols.map((c) => fields[c]), sqlDate(), userId]);
}

async function upsertShip(userId: string, cls: string, location: string | null) {
  const cat = await matchShip(cls);
  const name = cat?.name ?? shipName(cls);
  const existing = await q1<RowDataPacket>(
    "SELECT id FROM user_ships WHERE user_id = ? AND source = 'companion' AND (ship_slug = ? OR ship_name = ?) LIMIT 1",
    [userId, cat?.slug ?? "", name],
  );
  if (existing) {
    if (location) await run("UPDATE user_ships SET location = ? WHERE id = ?", [placeName(location), existing.id]);
    return;
  }
  // only when the profile exists (user_ships references profiles)
  const prof = await q1<RowDataPacket>("SELECT id FROM profiles WHERE id = ?", [userId]);
  if (!prof) return;
  await run(
    "INSERT INTO user_ships (id, user_id, ship_slug, ship_name, manufacturer, source, location, notes, created_at) VALUES (?, ?, ?, ?, ?, 'companion', ?, ?, UTC_TIMESTAMP(6))",
    [randomUUID(), userId, cat?.slug ?? null, name, cat?.manufacturer ?? null, location ? placeName(location) : null, `Vom Companion erkannt (${stripId(cls)})`],
  );
}

async function addBlueprint(userId: string, name: string) {
  const bp = await q1<RowDataPacket>(
    "SELECT id FROM blueprints WHERE owner_id IS NULL AND LOWER(item_name) = ? ORDER BY is_default DESC LIMIT 1",
    [name.toLowerCase()],
  );
  if (bp) await run("INSERT IGNORE INTO user_blueprint_collection (user_id, blueprint_id, acquired_at) VALUES (?, ?, UTC_TIMESTAMP(6))", [userId, bp.id]);
}

type Flags = { inventory?: boolean; plan?: boolean; contracts?: boolean };

async function applyEffects(e: Ev, device: Device, at: string, flags: Flags) {
  const d = e.data;
  const uid = device.user_id;
  const p = e.player;

  if (e.session) {
    await run(
      "INSERT IGNORE INTO companion_sessions (session, user_id, device_id, player, channel, started_at, last_event_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [e.session, uid, device.id, p, d.channel || device.channel || null, at, at],
    );
    await run(
      "UPDATE companion_sessions SET events = events + 1, last_event_at = GREATEST(last_event_at, ?), player = COALESCE(?, player) WHERE session = ?",
      [at, p, e.session],
    );
  }

  switch (e.type) {
    case "login":
      await setLive(uid, { handle: d.handle, online: 1 });
      await run("UPDATE companion_devices SET player_handle = ? WHERE id = ?", [d.handle, device.id]);
      break;
    case "game_version":
      if (e.session) await run("UPDATE companion_sessions SET branch = ? WHERE session = ?", [d.branch, e.session]);
      await setLive(uid, { branch: d.branch });
      break;
    case "join_pu":
      if (e.session) await run("UPDATE companion_sessions SET shard = ? WHERE session = ?", [d.shard, e.session]);
      await setLive(uid, { shard: d.shard, online: 1 });
      break;
    case "location":
      await setLive(uid, { location: d.location });
      break;
    case "vehicle_control": {
      const cls = d.vehicle_class || stripId(d.vehicle);
      const live = await q1<RowDataPacket>("SELECT location FROM companion_live WHERE user_id = ?", [uid]);
      await setLive(uid, d.action === "exit" ? { in_ship: 0 } : { ship: cls, in_ship: 1 });
      await upsertShip(uid, cls, live?.location ? String(live.location) : null);
      break;
    }
    case "actor_death":
      if (p && d.killer === p && d.victim !== p && e.session) {
        await run(`UPDATE companion_sessions SET ${d.victim_npc === "1" ? "npc_kills = npc_kills + 1" : "kills = kills + 1"} WHERE session = ?`, [e.session]);
      }
      if (p && d.victim === p && e.session) await run("UPDATE companion_sessions SET deaths = deaths + 1 WHERE session = ?", [e.session]);
      break;
    case "mission": {
      const status = CONTRACT_STATUS[d.category];
      if (!status || !p) break;
      const title = missionTitle(d.text);
      if (status === "aktiv") {
        await run(
          "INSERT IGNORE INTO companion_contracts (mission_key, mission_id, user_id, handle, title, status, accepted_at) VALUES (?, ?, ?, ?, ?, 'aktiv', ?)",
          [`${p}:${d.mission_id || e.session + ":" + title}`.slice(0, 120), d.mission_id || null, uid, p, title, at],
        );
      } else {
        const r = d.mission_id
          ? await run("UPDATE companion_contracts SET status = ?, ended_at = ? WHERE handle = ? AND mission_id = ? AND status = 'aktiv'", [status, at, p, d.mission_id])
          : { changes: 0 };
        if (!r.changes) {
          const m = await q1<RowDataPacket>("SELECT id FROM companion_contracts WHERE handle = ? AND title = ? AND status = 'aktiv' ORDER BY id DESC LIMIT 1", [p, title]);
          if (m) await run("UPDATE companion_contracts SET status = ?, ended_at = ? WHERE id = ?", [status, at, m.id]);
        }
      }
      flags.contracts = true;
      break;
    }
    case "mission_ended": {
      const s = String(d.state || "").toLowerCase();
      const status = s.includes("succe") || s.includes("complete") ? "abgeschlossen" : s.includes("fail") ? "fehlgeschlagen" : s.includes("abandon") ? "abgebrochen" : null;
      if (status && d.mission_id && p) {
        await run("UPDATE companion_contracts SET status = ?, ended_at = ? WHERE handle = ? AND mission_id = ? AND status = 'aktiv'", [status, at, p, d.mission_id]);
        flags.contracts = true;
      }
      break;
    }
    case "blueprint":
      if (d.name) await addBlueprint(uid, d.name);
      break;
    case "shop_buy": {
      const qty = Math.max(1, Number(d.quantity) || 1);
      await addItem(uid, d.item, qty, "location", d.location || "Unbekannter Ort");
      flags.inventory = true;
      if (await planGot(uid, d.item, qty)) flags.plan = true;
      break;
    }
    case "inventory_move": {
      const qty = Math.max(1, Number(d.amount) || 1);
      await takeItem(uid, d.item, qty, d.from_type || "body", d.from_name || "Am Körper");
      if (d.to_type !== "dropped") await addItem(uid, d.item, qty, d.to_type || "body", d.to_name || "Am Körper");
      if (d.to_type === "location" && d.to_name) await setLive(uid, { location: d.to_name });
      flags.inventory = true;
      if (d.action === "take" && d.from_type !== "location" && (await planGot(uid, d.item, qty))) flags.plan = true;
      break;
    }
    case "session_end":
      if (e.session) await run("UPDATE companion_sessions SET ended_at = ? WHERE session = ?", [at, e.session]);
      await setLive(uid, { online: 0, in_ship: 0 });
      break;
    default:
  }
}

function actorTarget(e: Ev): [string | null, string | null] {
  const d = e.data;
  switch (e.type) {
    case "actor_death": return [d.killer, d.victim];
    case "vehicle_destruction": return [d.caused_by, d.vehicle_class || d.vehicle];
    case "vehicle_control": return [e.player, d.vehicle_class];
    case "login": return [d.handle, null];
    default: return [e.player, null];
  }
}

export type IngestResult = { accepted: number; duplicates: number; rejected: number; flags: Flags };

export async function ingest(device: Device, body: unknown, ip: string | null): Promise<IngestResult> {
  const b = (body ?? {}) as { client?: Record<string, unknown>; events?: unknown[] };
  const status = b.client ?? {};
  const list = Array.isArray(b.events) ? b.events : [];
  if (list.length > MAX_EVENTS) throw Object.assign(new Error(`Maximal ${MAX_EVENTS} Events pro Anfrage`), { status: 413 });
  const now = sqlDate();
  let accepted = 0;
  let rejected = 0;
  const flags: Flags = {};
  for (const raw of list) {
    const e = validate(raw);
    if (!e) {
      rejected += 1;
      continue;
    }
    const at = sqlDate(e.ts);
    const [actor, target] = actorTarget(e);
    const r = await run(
      `INSERT IGNORE INTO companion_events (uid, device_id, user_id, session, player, type, actor, target, summary, data, occurred_at, received_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [e.uid, device.id, device.user_id, e.session, e.player, e.type, str(actor), str(target), str(summarize(e), 300), JSON.stringify(e.data), at, now],
    );
    if (r.changes !== 1) continue;
    accepted += 1;
    try {
      await applyEffects(e, device, at, flags);
    } catch (err) {
      console.error("[companion] effect failed", e.type, err instanceof Error ? err.message : err);
    }
  }
  await run(
    `UPDATE companion_devices SET last_seen = ?, last_ip = ?, version = ?, os = ?, channel = ?, game_running = ?,
       player_handle = COALESCE(?, player_handle), events_total = events_total + ? WHERE id = ?`,
    [now, str(ip, 64), str(status.version, 40), str(status.os, 20), str(status.channel, 30), status.game_running ? 1 : 0,
      status.player ? str(status.player, 100) : null, accepted, device.id],
  );
  if (status.player) await setLive(device.user_id, { handle: str(status.player, 100), online: status.game_running ? 1 : 0 });
  return { accepted, duplicates: list.length - accepted - rejected, rejected, flags };
}
