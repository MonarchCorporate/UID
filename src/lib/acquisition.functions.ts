import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type Acquisition = {
  name: string;
  buy: { terminal: string; location: string; price: number; updated: string | null; count: number } | null;
  sell: { terminal: string; location: string; price: number } | null;
  craft: {
    blueprints: { id: string; name: string; outputQty: number; missions: number; isDefault: boolean }[];
    missions: { uuid: string; title: string; giver: string | null }[];
  };
  org: { available: number; unit: string | null; forSale: number; rows: number } | null;
  members: { holders: number; qty: number };
  market: { id: string; title: string; type: string; price: number | null }[];
};

type Shop = {
  terminal_name?: string;
  location?: string;
  system?: string;
  price_buy?: number | null;
  price_sell?: number | null;
  date_updated?: string | null;
};

/**
 * „Wie komme ich an X?“ – fasst alle Beschaffungswege eines Items zusammen:
 * kaufen (UEX-Terminals), craften (Blueprints + Missionen), Orga-Lager,
 * Mitglieder-Inventar (sichtbar für die Orga) und Schwarzes Brett.
 */
export const getAcquisition = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ ref: z.string().trim().max(255).nullable(), name: z.string().trim().max(255).nullable() }).parse(i),
  )
  .handler(async ({ data, context }): Promise<Acquisition | null> => {
    const { getPool } = await import("@/lib/db/pool.server");
    const pool = getPool();
    const q = async (sql: string, params: unknown[]) => (await pool.query<RowDataPacket[]>(sql, params))[0];
    const ref = data.ref && !data.ref.startsWith("name:") ? data.ref : null;

    // Katalogeintrag (Item oder Schiffskomponente) für Name + Shops
    let cat: RowDataPacket | undefined;
    if (ref) {
      cat =
        (await q("SELECT name, shops FROM inventory_item_catalog WHERE item_ref = ? LIMIT 1", [ref]))[0] ??
        (await q("SELECT name, shops FROM ship_components_catalog WHERE item_ref = ? LIMIT 1", [ref]))[0];
      if (!cat && ref.startsWith("wiki:")) {
        cat = (await q("SELECT name, shops FROM inventory_item_catalog WHERE wiki_uuid = ? LIMIT 1", [ref.slice(5)]))[0];
      }
    }
    const name = (cat?.name as string | undefined) ?? data.name ?? (data.ref?.startsWith("name:") ? data.ref.slice(5) : null);
    if (!name && !ref) return null;
    if (!cat && name) {
      cat = (await q("SELECT name, shops FROM inventory_item_catalog WHERE LOWER(name) = LOWER(?) AND shops IS NOT NULL LIMIT 1", [name]))[0];
    }

    // Kaufen / Verkaufen
    let shops: Shop[] = [];
    try {
      shops = cat?.shops ? (JSON.parse(String(cat.shops)) as Shop[]) : [];
    } catch {
      shops = [];
    }
    const buys = shops.filter((s) => (s.price_buy ?? 0) > 0).sort((a, b) => (a.price_buy ?? 0) - (b.price_buy ?? 0));
    const sells = shops.filter((s) => (s.price_sell ?? 0) > 0).sort((a, b) => (b.price_sell ?? 0) - (a.price_sell ?? 0));
    const loc = (s: Shop) => [s.location, s.system && s.system !== s.location ? s.system : null].filter(Boolean).join(", ");

    // Craften: Blueprints, die dieses Item erzeugen, + freischaltende Missionen
    const bps = await q(
      `SELECT b.id, b.item_name, b.output_qty, MAX(b.is_default) is_default, COUNT(DISTINCT m.mission_uuid) missions
         FROM blueprints b
         LEFT JOIN blueprint_missions m ON m.blueprint_id = b.id
        WHERE (b.source <> 'manual' OR b.owner_id = ?)
          AND (${ref ? "b.item_ref = ? OR " : ""}LOWER(b.item_name) = LOWER(?))
        GROUP BY b.id, b.item_name, b.output_qty
        ORDER BY missions DESC LIMIT 5`,
      ref ? [context.userId, ref, name ?? ""] : [context.userId, name ?? ""],
    );
    const bpIds = bps.map((b) => b.id as string);
    const missions = bpIds.length
      ? await q(
          `SELECT mission_uuid, MAX(mission_title) title, MAX(mission_giver) giver
             FROM blueprint_missions WHERE blueprint_id IN (${bpIds.map(() => "?").join(",")}) AND mission_uuid IS NOT NULL
            GROUP BY mission_uuid ORDER BY title LIMIT 6`,
          bpIds,
        )
      : [];

    // Orga-Lager der eigenen Orgas
    const match = ref ? "(w.item_ref = ? OR LOWER(w.item_name) = LOWER(?))" : "LOWER(w.item_name) = LOWER(?)";
    const matchParams = ref ? [ref, name ?? ""] : [name ?? ""];
    const org = (
      await q(
        `SELECT COUNT(*) n_rows, SUM(GREATEST(w.qty - COALESCE(w.reserved_qty, 0), 0)) avail,
                SUM(CASE WHEN w.for_sale = 1 THEN LEAST(COALESCE(w.sale_qty, 0), w.qty) - COALESCE(w.reserved_qty, 0) ELSE 0 END) for_sale,
                MAX(w.unit) unit
           FROM org_warehouse w
          WHERE w.org_id IN (SELECT org_id FROM org_members WHERE user_id = ?) AND ${match}`,
        [context.userId, ...matchParams],
      )
    )[0];

    // Mitglieder, die das Item für die Orga sichtbar im Inventar haben
    const imatch = ref ? "(i.item_ref = ? OR LOWER(i.item_name) = LOWER(?))" : "LOWER(i.item_name) = LOWER(?)";
    const mem = (
      await q(
        `SELECT COUNT(DISTINCT i.owner_id) holders, SUM(i.qty - COALESCE(i.qty_reserved, 0)) qty
           FROM inventory_items i
          WHERE i.owner_id <> ? AND i.visibility = 'org' AND ${imatch}
            AND EXISTS (SELECT 1 FROM org_members a JOIN org_members b ON a.org_id = b.org_id
                         WHERE a.user_id = ? AND b.user_id = i.owner_id)`,
        [context.userId, ...matchParams, context.userId],
      )
    )[0];

    // Schwarzes Brett: offene Angebote/Gesuche mit diesem Item im Titel
    const market = name
      ? await q(
          `SELECT l.id, l.title, l.type, l.price_auec
             FROM marketplace_listings l
            WHERE l.status = 'offen' AND LOWER(l.title) LIKE LOWER(?)
              AND (l.scope = 'allianz' OR l.org_id IS NULL OR l.created_by = ?
                   OR EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = l.org_id AND m.user_id = ?))
            ORDER BY l.created_at DESC LIMIT 3`,
          [`%${name.replace(/[\\%_]/g, (c) => "\\" + c)}%`, context.userId, context.userId],
        )
      : [];

    return {
      name: name ?? ref ?? "",
      buy: buys[0]
        ? {
            terminal: buys[0].terminal_name ?? "Terminal",
            location: loc(buys[0]),
            price: Number(buys[0].price_buy),
            updated: buys[0].date_updated ?? null,
            count: buys.length,
          }
        : null,
      sell: sells[0] ? { terminal: sells[0].terminal_name ?? "Terminal", location: loc(sells[0]), price: Number(sells[0].price_sell) } : null,
      craft: {
        blueprints: bps.map((b) => ({ id: b.id, name: b.item_name, outputQty: Number(b.output_qty ?? 1), missions: Number(b.missions), isDefault: Number(b.is_default) === 1 })),
        missions: missions.map((m) => ({ uuid: m.mission_uuid, title: m.title, giver: m.giver ?? null })),
      },
      org: Number(org?.n_rows) > 0
        ? { available: Number(org.avail ?? 0), unit: org.unit ?? null, forSale: Math.max(0, Number(org.for_sale ?? 0)), rows: Number(org.n_rows) }
        : null,
      members: { holders: Number(mem?.holders ?? 0), qty: Number(mem?.qty ?? 0) },
      market: market.map((m) => ({ id: m.id, title: m.title, type: m.type, price: m.price_auec != null ? Number(m.price_auec) : null })),
    };
  });
