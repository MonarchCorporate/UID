// HTTP API for the desktop companion: /api/public/companion/<path>
//
//   POST pair/start, pair/poll          – device pairing (public, code + secret)
//   GET  version                        – current companion build (public)
//   POST ingest                         – Game.log events            (device token)
//   GET  overview | POST inventory      – inventory, locations, ships (device token)
//   GET  suggest?q=                     – item names                  (device token)
//   GET|POST plan, GET contracts        – session plan, contracts     (device token)
//   GET  trade?location=, routes?scu=&budget=&from=, mining           (device token)
import { randomBytes, randomUUID } from "node:crypto";
// build info of the exe in public/downloads (written by scripts/build-companion.sh)
import companionInfo from "../../../public/downloads/companion.json?raw";
import type { RowDataPacket } from "mysql2/promise";
import { deviceFromRequest, newDeviceToken, q, q1, run, sha256, sqlDate, type Device } from "./db.server";
import { addItemAt, ingest, locationFor } from "./ingest.server";
import { locationKey } from "./presets";
import { containerName, itemName, placeName, categoryLabel, itemCategory } from "./names";
import { planApply, planList } from "./plan.server";
import { mining, routes, tradeAt } from "./trade.server";

const PAIR_TTL_MS = 15 * 60 * 1000;
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "cache-control": "no-store" } });
const bad = (error: string, status = 400) => json({ error }, status);
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

// tiny per-IP limiter for the public pairing endpoint
const hits = new Map<string, { n: number; reset: number }>();
function limited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const h = hits.get(key);
  if (!h || h.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return false;
  }
  h.n += 1;
  return h.n > max;
}

function clientIp(request: Request): string {
  return (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || request.headers.get("x-real-ip") || "";
}

export function publicOrigin(request: Request): string {
  const env = process.env.PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (env) return env;
  const u = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? u.protocol.replace(":", "");
  const host = request.headers.get("x-forwarded-host") ?? u.host;
  return `${proto}://${host}`;
}

const normCode = (c: unknown) => clip(c, 20).toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^(.{4})(.{4})$/, "$1-$2");

// ------------------------------------------------------------ pairing ---

async function pairStart(request: Request): Promise<Response> {
  if (limited(`pair:${clientIp(request)}`, 30, 15 * 60 * 1000)) return bad("Zu viele Anfragen – bitte später erneut versuchen", 429);
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const raw = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const secret = randomBytes(24).toString("base64url");
  await run("DELETE FROM companion_pairings WHERE expires_at < ?", [sqlDate(Date.now() - 86_400_000)]);
  await run(
    "INSERT INTO companion_pairings (code, secret_hash, device, version, ip, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    [code, sha256(secret), clip(body.device, 100) || "PC", clip(body.version, 40) || null, clientIp(request).slice(0, 64), sqlDate(), sqlDate(Date.now() + PAIR_TTL_MS)],
  );
  return json({ code, secret, url: `${publicOrigin(request)}/companion/pair/${code}`, expires_in: PAIR_TTL_MS / 1000 });
}

async function pairPoll(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const p = await q1<RowDataPacket>("SELECT * FROM companion_pairings WHERE code = ?", [normCode(body.code)]);
  if (!p || p.secret_hash !== sha256(clip(body.secret, 100))) return bad("Unbekannter Code", 404);
  if (p.status === "pending" && String(p.expires_at) < sqlDate()) return bad("Code abgelaufen", 410);
  if (p.status === "pending") return json({ status: "pending" });
  if (p.status === "approved" && p.token) {
    const r = await run("UPDATE companion_pairings SET status = 'claimed', token = NULL WHERE id = ? AND status = 'approved'", [p.id]);
    if (r.changes !== 1) return bad("Code bereits verwendet", 410);
    const prof = await q1<RowDataPacket>("SELECT callsign, display_name FROM profiles WHERE id = ?", [p.user_id]);
    return json({ status: "approved", token: p.token, user: prof?.display_name || prof?.callsign || "" });
  }
  return bad("Code nicht mehr gültig", 410);
}

/** Used by the web page after the logged-in user confirmed the code. */
export async function approvePairing(userId: string, code: string): Promise<{ device: string }> {
  const p = await q1<RowDataPacket>("SELECT * FROM companion_pairings WHERE code = ?", [normCode(code)]);
  if (!p) throw new Error("Code nicht gefunden");
  if (p.status !== "pending") throw new Error("Dieser Code wurde bereits verwendet");
  if (String(p.expires_at) < sqlDate()) throw new Error("Code abgelaufen – im Companion wird automatisch ein neuer angezeigt");
  const token = newDeviceToken();
  const d = await run(
    "INSERT INTO companion_devices (user_id, name, token_hash, token_prefix, created_at) VALUES (?, ?, ?, ?, ?)",
    [userId, p.device, sha256(token), token.slice(0, 12), sqlDate()],
  );
  const r = await run("UPDATE companion_pairings SET status = 'approved', user_id = ?, device_id = ?, token = ? WHERE id = ? AND status = 'pending'", [userId, d.insertId, token, p.id]);
  if (r.changes !== 1) {
    await run("DELETE FROM companion_devices WHERE id = ?", [d.insertId]);
    throw new Error("Dieser Code wurde bereits verwendet");
  }
  return { device: String(p.device) };
}

export async function getPairing(code: string) {
  const p = await q1<RowDataPacket>("SELECT code, device, version, status, expires_at FROM companion_pairings WHERE code = ?", [normCode(code)]);
  if (!p) return null;
  return { code: String(p.code), device: String(p.device), version: p.version ? String(p.version) : null, status: p.status === "pending" && String(p.expires_at) < sqlDate() ? "expired" : String(p.status) };
}

// ---------------------------------------------------------- inventory ---

const SC_KEY = /^sc:(location|ship|body|other):(.*)$/;

/** Inventory of a user in the shape the overlay renders. */
export async function overview(userId: string, codes: { location?: string | null; ship?: string | null } = {}) {
  const [locs, items, ships, prof] = await Promise.all([
    q<RowDataPacket>("SELECT id, name, preset_key FROM inventory_locations WHERE owner_id = ?", [userId]),
    q<RowDataPacket>("SELECT id, item_ref, item_name, item_kind, qty, location_id, notes, updated_at FROM inventory_items WHERE owner_id = ? ORDER BY item_name", [userId]),
    q<RowDataPacket>("SELECT id, ship_slug, ship_name, custom_name, location, notes, source FROM user_ships WHERE user_id = ? ORDER BY created_at DESC", [userId]),
    q1<RowDataPacket>("SELECT callsign, display_name, rsi_handle FROM profiles WHERE id = ?", [userId]),
  ]);
  const locInfo = new Map<string, { type: string; name: string; display: string }>();
  for (const l of locs) {
    const pk = String(l.preset_key ?? "");
    const m = SC_KEY.exec(pk);
    if (m) locInfo.set(String(l.id), { type: m[1], name: m[2], display: containerName(m[1], m[2]) });
    else if (pk) locInfo.set(String(l.id), { type: pk === "sonstige:im-rucksack" ? "body" : "location", name: `preset:${pk}`, display: String(l.name) });
    else locInfo.set(String(l.id), { type: "other", name: String(l.id), display: String(l.name) });
  }
  const containers = new Map<string, { type: string; name: string; display: string; stacks: number; quantity: number }>();
  const outItems = items.map((it) => {
    const li = it.location_id ? locInfo.get(String(it.location_id)) : undefined;
    const c = li ?? { type: "other", name: "none", display: "Ohne Lagerort" };
    const key = `${c.type}:${c.name}`;
    const qty = Number(it.qty);
    const cur = containers.get(key) ?? { ...c, stacks: 0, quantity: 0 };
    cur.stacks += 1;
    cur.quantity += qty;
    containers.set(key, cur);
    const kind = it.item_kind ? String(it.item_kind) : itemCategory(it.item_name);
    return {
      id: String(it.id), item_name: String(it.item_name), display_name: String(it.item_name), quantity: qty,
      container_type: c.type, container_name: c.name, container_display: c.display,
      category: kind, category_label: categoryLabel(kind), catalog: !!it.item_ref,
      source: String(it.notes ?? "").startsWith("Companion:") ? "log" : "manuell", updated_at: it.updated_at,
    };
  });
  for (const l of locInfo.values()) if (!containers.has(`${l.type}:${l.name}`)) containers.set(`${l.type}:${l.name}`, { ...l, stacks: 0, quantity: 0 });
  // the overlay knows game codes (Stanton2_Orison); tell it which container they map to
  const aliases: Record<string, { type: string; name: string; display: string }> = {};
  const alias = (type: string, code: string | null | undefined) => {
    if (!code) return;
    const k = locationKey(type, code);
    const name = k.source === "preset" ? `preset:${k.key}` : code;
    aliases[`${type}:${code}`] = { type: k.source === "preset" && k.key === "sonstige:im-rucksack" ? "body" : type, name, display: k.label };
  };
  alias("location", codes.location);
  alias("body", "Am Körper");
  return {
    aliases,
    user: { display_name: prof?.display_name || prof?.callsign || "", handle: prof?.rsi_handle ?? null },
    containers: [...containers.values()].sort((a, b) => a.type.localeCompare(b.type) || a.display.localeCompare(b.display)),
    items: outItems,
    ships: ships.map((s) => {
      const cls = /\(([A-Za-z0-9_]+)\)/.exec(String(s.notes ?? ""))?.[1];
      return {
        id: String(s.id), ship_class: cls ?? String(s.ship_name), display_name: String(s.custom_name || s.ship_name),
        status: s.source === "companion" ? "aus dem Spiel" : String(s.source), location_display: s.location ? String(s.location) : null,
      };
    }),
  };
}

async function locId(userId: string, type: string, name: string): Promise<string | null> {
  if (type === "other") return name && name !== "none" ? name : null;
  if (name.startsWith("preset:")) {
    const hit = await q1<RowDataPacket>("SELECT id FROM inventory_locations WHERE owner_id = ? AND preset_key = ?", [userId, name.slice(7)]);
    if (hit) return String(hit.id);
  }
  return locationFor(userId, type, name);
}

async function changeQty(userId: string, loc: string | null, name: string, delta: number, set?: number) {
  const row = await q1<RowDataPacket>(
    `SELECT id, qty FROM inventory_items WHERE owner_id = ? AND ${loc ? "location_id = ?" : "location_id IS NULL"} AND item_name = ? LIMIT 1`,
    loc ? [userId, loc, name] : [userId, name],
  );
  if (!row) return 0;
  const next = set != null ? set : Number(row.qty) + delta;
  if (next <= 0) await run("DELETE FROM inventory_items WHERE id = ?", [row.id]);
  else await run("UPDATE inventory_items SET qty = ?, updated_at = UTC_TIMESTAMP(6) WHERE id = ?", [next, row.id]);
  return Number(row.qty);
}

/** Overlay actions: add | remove | set | move. */
export async function inventoryAction(userId: string, b: Record<string, unknown>) {
  const action = String(b.action ?? "add");
  const name = clip(b.item_name, 200);
  if (!name) throw new Error("Item fehlt");
  const qty = Math.trunc(Number(b.quantity ?? 1));
  if (!Number.isFinite(qty) || qty < 0 || qty > 1_000_000) throw new Error("Menge ungültig");
  const type = ["location", "ship", "body", "other"].includes(String(b.container_type)) ? String(b.container_type) : "other";
  const cname = clip(b.container_name, 150) || (type === "body" ? "Am Körper" : "");
  if (type !== "other" && !cname) throw new Error("Lagerort fehlt");
  const loc = await locId(userId, type, cname);
  switch (action) {
    case "add": {
      const existing = await changeQty(userId, loc, name, qty);
      if (!existing) await addItemAt(userId, name, qty, loc);
      break;
    }
    case "remove": await changeQty(userId, loc, name, -qty); break;
    case "set": await changeQty(userId, loc, name, 0, qty); break;
    case "move": {
      const tt = ["location", "ship", "body", "other"].includes(String(b.to_type)) ? String(b.to_type) : "other";
      const tn = clip(b.to_name, 150) || (tt === "body" ? "Am Körper" : "");
      const had = await changeQty(userId, loc, name, -qty);
      if (!had) throw new Error("Item nicht gefunden");
      const to = await locId(userId, tt, tn);
      const moved = Math.min(had, qty);
      if (!(await changeQty(userId, to, name, moved))) {
        await run(
          "INSERT INTO inventory_items (id, owner_id, item_name, item_kind, qty, location_id, visibility, unit, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 'private', 'pcs', UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))",
          [randomUUID(), userId, name, itemCategory(name), moved, to],
        );
      }
      break;
    }
    default: throw new Error("Unbekannte Aktion");
  }
}

async function suggest(userId: string, term: string) {
  const t = `%${term.replace(/[%_]/g, "")}%`;
  const [cat, own] = await Promise.all([
    q<RowDataPacket>("SELECT DISTINCT name FROM inventory_item_catalog WHERE merged_into IS NULL AND name LIKE ? ORDER BY name LIMIT 12", [t]),
    q<RowDataPacket>("SELECT DISTINCT item_name AS name FROM inventory_items WHERE owner_id = ? AND item_name LIKE ? LIMIT 8", [userId, t]),
  ]);
  const names = [...new Set([...own, ...cat].map((r) => String(r.name)))];
  return { items: names.slice(0, 15).map((n) => ({ item_name: n, display_name: n })) };
}

async function contracts(userId: string) {
  const rows = await q<RowDataPacket>("SELECT * FROM companion_contracts WHERE user_id = ? ORDER BY (status = 'aktiv') DESC, accepted_at DESC LIMIT 100", [userId]);
  const stats: Record<string, number> = {};
  for (const r of rows) stats[String(r.status)] = (stats[String(r.status)] ?? 0) + 1;
  return { missions: rows, stats };
}

// ------------------------------------------------------------- router ---

async function version(): Promise<Response> {
  try {
    return json(JSON.parse(companionInfo));
  } catch {
    return bad("Kein Companion-Build vorhanden", 404);
  }
}

export async function handleCompanion(request: Request, sub: string): Promise<Response> {
  const method = request.method.toUpperCase();
  const url = new URL(request.url);
  try {
    if (sub === "pair/start" && method === "POST") return await pairStart(request);
    if (sub === "pair/poll" && method === "POST") return await pairPoll(request);
    if (sub === "version" && method === "GET") return await version();

    const device: Device | null = await deviceFromRequest(request);
    if (!device) return bad("Token ungültig", 401);
    const uid = device.user_id;

    switch (`${method} ${sub}`) {
      case "POST ingest": {
        if (limited(`ingest:${device.id}`, 120, 60_000)) return bad("Rate-Limit erreicht", 429);
        const r = await ingest(device, await request.json().catch(() => ({})), clientIp(request));
        return json({ ok: true, accepted: r.accepted, duplicates: r.duplicates, rejected: r.rejected });
      }
      case "GET overview": return json(await overview(uid, { location: url.searchParams.get("location") }));
      case "POST inventory":
        await inventoryAction(uid, (await request.json().catch(() => ({}))) as Record<string, unknown>);
        return json({ ok: true, ...(await overview(uid, { location: url.searchParams.get("location") })) });
      case "GET suggest": return json(await suggest(uid, clip(url.searchParams.get("q"), 60)));
      case "GET plan": return json({ items: await planList(uid) });
      case "POST plan":
        await planApply(uid, (await request.json().catch(() => ({}))) as Record<string, unknown>);
        return json({ items: await planList(uid) });
      case "GET contracts": return json(await contracts(uid));
      case "GET trade": {
        const live = await q1<RowDataPacket>("SELECT location FROM companion_live WHERE user_id = ?", [uid]);
        return json(await tradeAt(clip(url.searchParams.get("location"), 150) || (live?.location ? String(live.location) : null)));
      }
      case "GET routes":
        return json(await routes({
          scu: Math.min(10_000, Math.max(1, Number(url.searchParams.get("scu")) || 32)),
          budget: Number(url.searchParams.get("budget")) || null,
          from: clip(url.searchParams.get("from"), 150) || null,
          illegal: url.searchParams.get("illegal") === "1",
        }));
      case "GET mining": return json(await mining());
      default: return bad("Unbekannter Endpunkt", 404);
    }
  } catch (err) {
    const e = err as Error & { status?: number };
    if (["trade", "routes", "mining"].includes(sub)) {
      console.error("[companion] market data", e.message);
      return bad("Marktdaten (UEX) gerade nicht erreichbar – bitte später erneut versuchen", 503);
    }
    if (e.status && e.status < 500) return bad(e.message, e.status);
    // validation errors thrown as plain Error carry a German message meant for the user
    if (!e.status && /^[A-ZÄÖÜ]/.test(e.message) && !/ER_|ECONN|UEX|SQL/i.test(e.message)) return bad(e.message, 400);
    console.error("[companion]", sub, e.message);
    return bad("Interner Fehler", 500);
  }
}

export { placeName };
