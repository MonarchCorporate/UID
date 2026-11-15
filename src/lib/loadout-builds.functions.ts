import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SlotPick = {
  slot_key: string;
  hardpoint_name: string | null;
  category: string | null;
  size: number | null;
  item_ref: string | null;
};

export type LoadoutBuild = {
  id: string;
  user_id: string;
  ship_slug: string;
  name: string;
  description: string | null;
  fleet_ship_id: string | null;
  slots: SlotPick[];
  share_token: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

const SlotSchema = z.object({
  slot_key: z.string().min(1).max(120),
  hardpoint_name: z.string().max(200).nullable(),
  category: z.string().max(60).nullable(),
  size: z.number().int().min(0).max(20).nullable(),
  item_ref: z.string().max(255).nullable(),
});

/* ----- list my builds ----- */
export const listMyBuilds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("ship_loadout_builds")
      .select("id, ship_slug, name, description, share_token, updated_at")
      .eq("user_id", context.userId)
      .order("updated_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

/* ----- get one (auth, own) ----- */
export const getBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: b, error } = await supabaseAdmin
      .from("ship_loadout_builds")
      .select("*")
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!b) throw new Error("Build nicht gefunden.");
    return b as LoadoutBuild;
  });

/* ----- public by share token ----- */
export const getBuildByToken = createServerFn({ method: "GET" })
  .inputValidator((i) => z.object({ token: z.string().min(4).max(64) }).parse(i))
  .handler(async ({ data }) => {
    const { data: b, error } = await supabaseAdmin
      .from("ship_loadout_builds")
      .select("id, ship_slug, name, description, slots, share_token, updated_at, is_public")
      .eq("share_token", data.token)
      .eq("is_public", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!b) return null;
    return b;
  });

/* ----- save (upsert) ----- */
export const saveBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid().optional(),
      ship_slug: z.string().min(1).max(120),
      name: z.string().min(1).max(120),
      description: z.string().max(2000).nullable().optional(),
      fleet_ship_id: z.string().uuid().nullable().optional(),
      slots: z.array(SlotSchema).max(200),
      is_public: z.boolean().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { data: updated, error } = await supabaseAdmin
        .from("ship_loadout_builds")
        .update({
          ship_slug: data.ship_slug,
          name: data.name,
          description: data.description ?? null,
          fleet_ship_id: data.fleet_ship_id ?? null,
          slots: data.slots,
          is_public: data.is_public ?? true,
        })
        .eq("id", data.id)
        .eq("user_id", context.userId)
        .select("id, share_token")
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!updated) throw new Error("Build nicht gefunden.");
      return updated;
    }
    const { data: created, error } = await supabaseAdmin
      .from("ship_loadout_builds")
      .insert({
        user_id: context.userId,
        ship_slug: data.ship_slug,
        name: data.name,
        description: data.description ?? null,
        fleet_ship_id: data.fleet_ship_id ?? null,
        slots: data.slots,
        is_public: data.is_public ?? true,
      })
      .select("id, share_token")
      .single();
    if (error || !created) throw new Error(error?.message || "Speichern fehlgeschlagen.");
    return created;
  });

export const deleteBuild = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("ship_loadout_builds")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const rotateShareToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const newToken = Array.from(crypto.getRandomValues(new Uint8Array(12)))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const { data: upd, error } = await supabaseAdmin
      .from("ship_loadout_builds")
      .update({ share_token: newToken })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .select("share_token")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!upd) throw new Error("Build nicht gefunden.");
    return upd;
  });

/* ----- list compatible components (weapons/missiles/systems/propulsion) ----- */
export type CompatComponent = {
  item_ref: string;
  name: string;
  manufacturer_name: string | null;
  size: number | null;
  grade: string | null;
  classification_label: string | null;
  image_url: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw: any;
};

export const listCompatibleComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      category: z.enum(["weapons", "systems", "missiles", "propulsion"]),
      maxSize: z.number().int().min(0).max(20).nullable().optional(),
      size: z.number().int().min(0).max(20).nullable().optional(),
      kind: z
        .enum(["weapon", "rack", "ammo", "system", "propulsion"])
        .nullable()
        .optional(),
      expectedType: z.string().max(60).nullable().optional(),
      expectedSubType: z.string().max(60).nullable().optional(),
      sizeExact: z.boolean().optional(),
      currentItemRef: z.string().max(255).nullable().optional(),
      shipSlug: z.string().max(120).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data }) => {
    // Bespoke ist pro-Schiff-Eigenschaft und lebt in `ship_bespoke_components`.
    // Regel: ein Item ist im Picker sichtbar, außer es ist auf einem ANDEREN
    // Schiff bespoke und weder für dieses Schiff freigegeben noch der aktuell
    // verbaute Ref. Das globale `is_bespoke`-Flag im Katalog wird NICHT mehr
    // ausgewertet — es kann durch alte Sync-Läufe verzerrt sein.
    const thisShipRefs = new Set<string>();
    if (data.shipSlug) {
      const { data: rows } = await supabaseAdmin
        .from("ship_bespoke_components")
        .select("item_ref")
        .eq("ship_slug", data.shipSlug);
      for (const r of rows ?? []) thisShipRefs.add(r.item_ref as string);
    }
    if (data.currentItemRef) thisShipRefs.add(data.currentItemRef);

    const { data: otherRows } = await supabaseAdmin
      .from("ship_bespoke_components")
      .select("item_ref, ship_slug");
    const excludeRefs = new Set<string>();
    for (const r of otherRows ?? []) {
      const ref = r.item_ref as string;
      const slug = r.ship_slug as string;
      if (slug === data.shipSlug) continue;
      if (thisShipRefs.has(ref)) continue;
      excludeRefs.add(ref);
    }

    let q = supabaseAdmin
      .from("ship_components_catalog")
      .select(
        "item_ref,name,manufacturer_name,size,grade,classification_label,image_url,raw",
      )
      .eq("category", data.category)
      .order("size", { ascending: false })
      .order("name", { ascending: true })
      .limit(2000);
    if (data.size != null) {
      if (data.sizeExact === false) q = q.lte("size", data.size);
      else q = q.eq("size", data.size);
    } else if (data.maxSize != null) {
      q = q.lte("size", data.maxSize);
    }
    // Präziser Typ-Filter (bevorzugt). Kompat-Fallback über kind/classification.
    if (data.expectedType) {
      q = q.eq("type", data.expectedType);
    } else if (data.kind === "rack") {
      q = q.eq("classification_label", "Missile Rack");
    } else if (data.kind === "ammo") {
      q = q.in("classification_label", ["Missile", "Torpedo", "Rocket"]);
    } else if (data.category === "missiles" && data.kind == null) {
      q = q.in("classification_label", [
        "Missile",
        "Torpedo",
        "Rocket",
        "Missile Rack",
      ]);
    }
    if (data.expectedSubType) {
      // sub_type ODER classification_label darf matchen (Racks nutzen classification).
      q = q.or(
        `sub_type.eq.${data.expectedSubType},classification_label.eq.${data.expectedSubType}`,
      );
    }
    // Ground-Vehicle-Munition ist für Schiffs-Loadouts nie relevant.
    if (data.category === "missiles") {
      q = q.neq("sub_type", "GroundVehicleMissile");
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const filtered = excludeRefs.size > 0
      ? (rows ?? []).filter((r) => !excludeRefs.has(r.item_ref as string))
      : (rows ?? []);
    return filtered as CompatComponent[];
  });

/* ----- lookup component raw for a set of item_refs (for shared view) ----- */
export const getComponentsByRefs = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z.object({ refs: z.array(z.string().max(255)).max(200) }).parse(i),
  )
  .handler(async ({ data }) => {
    if (data.refs.length === 0) return [];
    const { data: rows, error } = await supabaseAdmin
      .from("ship_components_catalog")
      .select(
        "item_ref,name,manufacturer_name,size,grade,classification_label,image_url,raw,category",
      )
      .in("item_ref", data.refs);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ----- resolve components by scunpacked class_names (case-insensitive) ----- */
/**
 * Für ein Set an scunpacked-`ClassName`s die zugehörigen Katalog-Einträge
 * (`item_ref`, `name`, `raw`, ...) finden. Wird vom Loadout-Editor genutzt,
 * um Stock-Loadout-Slots, die im DB-Snapshot noch keinen `item_ref` haben
 * (weil das Item nachträglich in `ship_components_catalog` gelandet ist),
 * dennoch beim „Werk-Loadout anwenden" korrekt zu setzen.
 *
 * Match-Regeln (in dieser Reihenfolge, alle case-insensitive):
 *   1. exakter `raw.class_name`
 *   2. `raw.class_name` ohne Suffix `_SCItem` / `_scitem`
 *   3. `class_name` als Teil-String im `item_ref`
 *
 * `is_bespoke` wird bewusst NICHT gefiltert — Stock-Loadouts enthalten
 * bespoke Komponenten (z.B. Apollo-Rack, ship-eigene Fixed-Guns).
 */
export const resolveComponentsByClassNames = createServerFn({ method: "POST" })
  .inputValidator((i) =>
    z
      .object({ classNames: z.array(z.string().max(200)).max(200) })
      .parse(i),
  )
  .handler(async ({ data }) => {
    if (data.classNames.length === 0) return [] as Array<CompatComponent & { matched_class_name: string }>;
    const classNameAliases = (v: string): string[] => {
      const lc = v.toLowerCase().trim();
      const stripped = lc.replace(/_scitem$/i, "");
      return Array.from(new Set([lc, stripped]));
    };
    // Zielset normalisiert. Wichtig: scunpacked liefert mal `..._SCItem`,
    // mal denselben ClassName ohne Suffix; der Wiki-Katalog kann wiederum
    // beide Varianten enthalten. Wir merken uns deshalb alle Alias-Formen und
    // geben immer den ursprünglich angefragten ClassName zurück.
    const targetAliases = new Map<string, string>();
    for (const cn of data.classNames) {
      const lc = cn.toLowerCase();
      if (!lc) continue;
      for (const a of classNameAliases(lc)) {
        if (!targetAliases.has(a)) targetAliases.set(a, lc);
      }
    }
    const out: Array<CompatComponent & { matched_class_name: string }> = [];
    // PostgREST kappt Antworten serverseitig typischerweise bei 1000 Rows.
    // Deshalb paginiert scannen, sonst liegen Einträge wie Tiburon SureStop/Resolu
    // außerhalb des ersten Fensters und Stock-Slots bleiben leer.
    for (let from = 0; from < 20000; from += 1000) {
      const { data: rows, error } = await supabaseAdmin
        .from("ship_components_catalog")
        .select(
          "item_ref,name,manufacturer_name,size,grade,classification_label,image_url,raw,category",
        )
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      for (const r of rows ?? []) {
        const cls = String(
          ((r.raw as Record<string, unknown> | null)?.class_name as string) ?? "",
        ).toLowerCase();
        const ref = String(r.item_ref as string).toLowerCase();
        let matched: string | null = null;
        if (cls) {
          for (const a of classNameAliases(cls)) {
            const hit = targetAliases.get(a);
            if (hit) {
              matched = hit;
              break;
            }
          }
        }
        if (!matched) {
          for (const [alias, original] of targetAliases) {
            if (alias && ref.includes(alias)) {
              matched = original;
              break;
            }
          }
        }
        if (matched) {
          out.push({ ...(r as unknown as CompatComponent), matched_class_name: matched });
        }
      }
      if (!rows || rows.length < 1000) break;
    }
    return out;
  });