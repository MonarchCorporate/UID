import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type SearchHit = {
  group: "Schiffe" | "Komponenten" | "Items" | "Materialien" | "Blueprints" | "Missionen";
  label: string;
  detail: string | null;
  image: string | null;
  to: string;
  params: Record<string, string>;
};

/**
 * Eine Suche über alle Spieldaten-Kataloge (für die Schnellsuche ⌘K).
 * Treffer am Wortanfang werden bevorzugt, pro Gruppe höchstens `limit`.
 */
export const globalSearch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ q: z.string().trim().min(2).max(80), limit: z.number().int().min(1).max(12).default(5) }).parse(i))
  .handler(async ({ data, context }): Promise<SearchHit[]> => {
    const { getPool } = await import("@/lib/db/pool.server");
    const pool = getPool();
    const esc = data.q.replace(/[\\%_]/g, (c) => "\\" + c);
    const any = `%${esc}%`;
    const prefix = `${esc}%`;
    const word = `% ${esc}%`;
    const lim = data.limit;
    // Rang: 0 = beginnt mit Suchbegriff, 1 = Wortanfang, 2 = irgendwo
    const rank = (col: string) =>
      `CASE WHEN LOWER(${col}) LIKE LOWER(?) THEN 0 WHEN LOWER(${col}) LIKE LOWER(?) THEN 1 ELSE 2 END`;

    const q = async (sql: string, params: unknown[]) => (await pool.query<RowDataPacket[]>(sql, params))[0];

    const [ships, comps, items, mats, bps, missions] = await Promise.all([
      q(
        `SELECT slug, name, manufacturer, classification_label, COALESCE(store_image, hero_image, angled_view) img
           FROM ship_catalog
          WHERE LOWER(name) LIKE LOWER(?) OR LOWER(manufacturer) LIKE LOWER(?)
          ORDER BY ${rank("name")}, name LIMIT ${lim}`,
        [any, any, prefix, word],
      ),
      q(
        `SELECT item_ref, name, type_label, size, grade, manufacturer_name, image_url
           FROM ship_components_catalog
          WHERE item_ref IS NOT NULL AND LOWER(name) LIKE LOWER(?)
          ORDER BY ${rank("name")}, name LIMIT ${lim}`,
        [any, prefix, word],
      ),
      q(
        `SELECT item_ref, name, kind, image_url
           FROM inventory_item_catalog
          WHERE merged_into IS NULL AND LOWER(name) LIKE LOWER(?)
          ORDER BY ${rank("name")}, name LIMIT ${lim}`,
        [any, prefix, word],
      ),
      q(
        `SELECT COALESCE(MAX(item_ref), CONCAT('name:', LOWER(item_name))) ref, item_name name, MAX(kind) kind, COUNT(DISTINCT blueprint_id) n
           FROM blueprint_components
          WHERE LOWER(item_name) LIKE LOWER(?)
          GROUP BY item_name
          ORDER BY ${rank("item_name")}, item_name LIMIT ${lim}`,
        [any, prefix, word],
      ),
      q(
        `SELECT id, item_name, output_qty, source
           FROM blueprints
          WHERE (source <> 'manual' OR owner_id = ?) AND LOWER(item_name) LIKE LOWER(?)
          ORDER BY ${rank("item_name")}, item_name LIMIT ${lim}`,
        [context.userId, any, prefix, word],
      ),
      q(
        `SELECT mission_uuid, MAX(mission_title) title, MAX(mission_giver) giver, COUNT(*) n
           FROM blueprint_missions
          WHERE mission_uuid IS NOT NULL AND LOWER(mission_title) LIKE LOWER(?)
          GROUP BY mission_uuid
          ORDER BY ${rank("MAX(mission_title)")}, title LIMIT ${lim}`,
        [any, prefix, word],
      ),
    ]);

    const hits: SearchHit[] = [];
    for (const r of ships)
      hits.push({
        group: "Schiffe",
        label: r.name,
        detail: [r.manufacturer, r.classification_label].filter(Boolean).join(" · ") || null,
        image: r.img ?? null,
        to: "/schiff/$slug",
        params: { slug: r.slug },
      });
    for (const r of comps)
      hits.push({
        group: "Komponenten",
        label: r.name,
        detail: [r.type_label, r.size != null ? `Größe ${r.size}` : null, r.grade ? `Klasse ${r.grade}` : null, r.manufacturer_name]
          .filter(Boolean)
          .join(" · ") || null,
        image: r.image_url ?? null,
        to: "/schiffskomponenten/$ref",
        params: { ref: r.item_ref },
      });
    for (const r of items)
      hits.push({ group: "Items", label: r.name, detail: r.kind ?? null, image: r.image_url ?? null, to: "/items/$ref", params: { ref: r.item_ref } });
    for (const r of mats)
      hits.push({
        group: "Materialien",
        label: r.name,
        detail: `in ${r.n} Blueprint${Number(r.n) === 1 ? "" : "s"}`,
        image: null,
        to: "/materialien/$ref",
        params: { ref: r.ref },
      });
    for (const r of bps)
      hits.push({
        group: "Blueprints",
        label: r.item_name,
        detail: r.source === "manual" ? "eigener Blueprint" : `ergibt ${r.output_qty ?? 1}×`,
        image: null,
        to: "/blueprints/$id",
        params: { id: r.id },
      });
    for (const r of missions)
      hits.push({
        group: "Missionen",
        label: r.title,
        detail: [r.giver, `${r.n} Blueprint${Number(r.n) === 1 ? "" : "s"}`].filter(Boolean).join(" · "),
        image: null,
        to: "/missions/$uuid",
        params: { uuid: r.mission_uuid },
      });
    return hits;
  });
