import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Visibility = z.enum(["private", "org"]);

export type InventoryLocation = {
  id: string;
  owner_id: string;
  name: string;
  notes: string | null;
  visibility: "private" | "org";
};

export type InventoryItem = {
  id: string;
  owner_id: string;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
  qty: number;
  qty_reserved: number;
  qty_available: number;
  unit: "pcs" | "scu";
  quality: number | null;
  location_id: string | null;
  location_name: string | null;
  visibility: "private" | "org";
  notes: string | null;
  updated_at: string;
  is_owner: boolean;
  offered_qty: number;
  offered_to_org_id: string | null;
  offered_to_org_name: string | null;
};

function decorate(
  rows: Array<Record<string, unknown>>,
  userId: string,
  locations: Map<string, string>,
  orgs: Map<string, string>,
): InventoryItem[] {
  return rows.map((r) => {
    const qty = Number(r.qty ?? 0);
    const reserved = Number(r.qty_reserved ?? 0);
    const offered = Number(r.offered_qty ?? 0);
    const offeredOrg = (r.offered_to_org_id as string) ?? null;
    return {
      id: r.id as string,
      owner_id: r.owner_id as string,
      item_ref: (r.item_ref as string) ?? null,
      item_name: r.item_name as string,
      item_kind: (r.item_kind as string) ?? null,
      qty,
      qty_reserved: reserved,
      qty_available: Math.max(0, qty - Math.max(reserved, offered)),
      unit: ((r.unit as string) || "pcs") as "pcs" | "scu",
      quality: (r.quality as number) ?? null,
      location_id: (r.location_id as string) ?? null,
      location_name: r.location_id
        ? locations.get(r.location_id as string) ?? null
        : null,
      visibility: r.visibility as "private" | "org",
      notes: (r.notes as string) ?? null,
      updated_at: r.updated_at as string,
      is_owner: r.owner_id === userId,
      offered_qty: offered,
      offered_to_org_id: offeredOrg,
      offered_to_org_name: offeredOrg ? orgs.get(offeredOrg) ?? null : null,
    };
  });
}

/** Returns all inventory rows the user can see (own + org-shared). */
export const listInventory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        scope: z.enum(["mine", "org", "all"]).optional(),
        search: z.string().max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const scope = data.scope ?? "all";

    // Das persönliche Inventar zeigt ausschliesslich eigene Bestände.
    // "Orga" = eigene Stacks, die man im Namen der Orga hält.
    let q = supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("owner_id", userId)
      .order("updated_at", { ascending: false });
    if (scope === "mine") q = q.eq("visibility", "private");
    else if (scope === "org") q = q.eq("visibility", "org");
    if (data.search) q = q.ilike("item_name", `%${data.search}%`);

    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);

    const { data: locs } = await supabaseAdmin
      .from("inventory_locations")
      .select("id,name");
    const locMap = new Map(
      (locs ?? []).map((l) => [l.id as string, l.name as string]),
    );

    const orgIds = Array.from(
      new Set(
        (rows ?? [])
          .map((r) => r.offered_to_org_id as string | null)
          .filter((x): x is string => !!x),
      ),
    );
    const orgMap = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs } = await supabaseAdmin
        .from("orgs")
        .select("id,name")
        .in("id", orgIds);
      for (const o of orgs ?? [])
        orgMap.set(o.id as string, o.name as string);
    }

    return { items: decorate(rows ?? [], userId, locMap, orgMap) };
  });

export const listMyLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { coOrgMemberIds } = await import("./org-membership.server");
    const allowedOwners = await coOrgMemberIds(supabaseAdmin, context.userId);
    const { data, error } = await supabaseAdmin
      .from("inventory_locations")
      .select("*")
      .or(
        `owner_id.eq.${context.userId},and(visibility.eq.org,owner_id.in.(${allowedOwners.join(",")}))`,
      )
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as InventoryLocation[];
  });

export const upsertLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(1).max(80),
        notes: z.string().trim().max(500).optional().nullable(),
        visibility: Visibility.default("private"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("inventory_locations")
        .update({
          name: data.name,
          notes: data.notes ?? null,
          visibility: data.visibility,
        })
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("inventory_locations")
      .insert({
        owner_id: context.userId,
        name: data.name,
        notes: data.notes ?? null,
        visibility: data.visibility,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

/**
 * Legt einen `inventory_locations`-Eintrag für einen Preset (Stadt/Station)
 * an, sofern er für den Nutzer noch nicht existiert. Idempotent.
 */
export const ensurePresetLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        preset_key: z.string().trim().min(1).max(120),
        label: z.string().trim().min(1).max(160),
        note: z.string().trim().max(200).optional().nullable(),
        visibility: Visibility.default("private"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: existing } = await supabaseAdmin
      .from("inventory_locations")
      .select("id, visibility")
      .eq("owner_id", context.userId)
      .eq("preset_key", data.preset_key)
      .maybeSingle();
    if (existing?.id) {
      // Bei Bedarf auf 'org' hochstufen, damit alle Mitglieder es sehen.
      if (existing.visibility === "private" && data.visibility === "org") {
        await supabaseAdmin
          .from("inventory_locations")
          .update({ visibility: "org" })
          .eq("id", existing.id as string);
      }
      return { id: existing.id as string, created: false };
    }
    const { data: row, error } = await supabaseAdmin
      .from("inventory_locations")
      .insert({
        owner_id: context.userId,
        name: data.label,
        notes: data.note ?? null,
        visibility: data.visibility,
        source: "preset",
        preset_key: data.preset_key,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string, created: true };
  });

export const deleteLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("inventory_locations")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const StackSchema = z.object({
  id: z.string().uuid().optional(),
  item_ref: z.string().max(120).optional().nullable(),
  item_name: z.string().trim().min(1).max(160),
  item_kind: z.string().trim().max(80).optional().nullable(),
  qty: z.number().min(0).max(1_000_000),
  qty_reserved: z.number().min(0).max(1_000_000).optional(),
  unit: z.enum(["pcs", "scu"]).default("pcs"),
  quality: z.number().int().min(0).max(1000).optional().nullable(),
  location_id: z.string().uuid().optional().nullable(),
  visibility: Visibility.default("private"),
  notes: z.string().max(500).optional().nullable(),
});

export const upsertInventoryStack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => StackSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      item_ref: data.item_ref ?? null,
      item_name: data.item_name,
      item_kind: data.item_kind ?? null,
      qty: data.qty,
      qty_reserved: data.qty_reserved ?? 0,
      unit: data.unit,
      quality: data.quality ?? null,
      location_id: data.location_id ?? null,
      visibility: data.visibility,
      notes: data.notes ?? null,
    };
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("inventory_items")
        .update(payload)
        .eq("id", data.id)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    // Auto-merge: if the user already has a stack with the same catalog ref,
    // location, quality and unit, add the new qty instead of duplicating.
    if (payload.item_ref) {
      let mergeQ = supabaseAdmin
        .from("inventory_items")
        .select("id,qty")
        .eq("owner_id", context.userId)
        .eq("item_ref", payload.item_ref)
        .eq("unit", payload.unit);
      mergeQ = payload.location_id
        ? mergeQ.eq("location_id", payload.location_id)
        : mergeQ.is("location_id", null);
      mergeQ = payload.quality != null
        ? mergeQ.eq("quality", payload.quality)
        : mergeQ.is("quality", null);
      const { data: existing } = await mergeQ.maybeSingle();
      if (existing?.id) {
        const merged = Number(existing.qty ?? 0) + Number(payload.qty);
        const { error } = await supabaseAdmin
          .from("inventory_items")
          .update({
            qty: merged,
            item_name: payload.item_name,
            item_kind: payload.item_kind,
            notes: payload.notes ?? undefined,
          })
          .eq("id", existing.id as string)
          .eq("owner_id", context.userId);
        if (error) throw new Error(error.message);
        return { id: existing.id as string, merged: true };
      }
    }
    const { data: row, error } = await supabaseAdmin
      .from("inventory_items")
      .insert({ ...payload, owner_id: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const deleteInventoryStack = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("inventory_items")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setReservation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        qty_reserved: z.number().min(0).max(1_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("inventory_items")
      .update({ qty_reserved: data.qty_reserved })
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Bulk-import stacks from a parsed JSON file. */
export const importInventoryJson = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        stacks: z.array(StackSchema.omit({ id: true })).max(500),
        replace: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (data.replace) {
      await supabaseAdmin
        .from("inventory_items")
        .delete()
        .eq("owner_id", context.userId);
    }
    if (data.stacks.length === 0) return { inserted: 0 };
    const rows = data.stacks.map((s) => ({
      owner_id: context.userId,
      item_ref: s.item_ref ?? null,
      item_name: s.item_name,
      item_kind: s.item_kind ?? null,
      qty: s.qty,
      qty_reserved: s.qty_reserved ?? 0,
      unit: s.unit,
      quality: s.quality ?? null,
      location_id: s.location_id ?? null,
      visibility: s.visibility,
      notes: s.notes ?? null,
    }));
    const { error } = await supabaseAdmin.from("inventory_items").insert(rows);
    if (error) throw new Error(error.message);
    return { inserted: rows.length };
  });

/** Search the unified item catalog (items + components + ships + BPs). */
export const searchItemCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        q: z.string().trim().max(80),
        kind: z.string().trim().max(80).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const hasKind = !!data.kind && data.kind.length > 0;
    if (data.q.length < 2 && !hasKind) return { items: [] };
    // When a category filter is used, only search the UEX item catalog
    // (categories only exist there). Otherwise search all sources.
    if (hasKind) {
      const { data: rows } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select("item_ref,name,kind,weight,image_url,unit")
        .ilike("name", `%${data.q}%`)
        .eq("kind", data.kind as string)
        .order("name")
        .limit(200);
      return {
        items: (rows ?? []).map((r) => ({
          item_ref: String(r.item_ref),
          name: r.name as string,
          kind: (r.kind as string) ?? null,
          weight: (r.weight as number) ?? null,
          image_url: (r.image_url as string) ?? null,
          unit: (r.unit as string) ?? "pcs",
          source: "item" as const,
        })),
      };
    }
    const { _searchUnifiedCatalog } = await import("./item-catalog.functions");
    const res = await _searchUnifiedCatalog({ q: data.q, limit: 60 });
    return {
      items: res.items.map((h) => ({
        item_ref: h.item_ref,
        name: h.name,
        kind: h.kind,
        weight: null,
        image_url: h.image_url,
        unit: h.unit ?? "pcs",
        source: h.source,
      })),
    };
  });

export const listItemCatalogKinds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: rows } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select("kind")
      .not("kind", "is", null)
      .order("kind");
    const set = new Set<string>();
    for (const r of rows ?? []) {
      if (r.kind) set.add(r.kind as string);
    }
    return { kinds: Array.from(set).sort((a, b) => a.localeCompare(b)) };
  });