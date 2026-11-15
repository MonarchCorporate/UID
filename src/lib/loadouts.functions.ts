import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildSeedStations } from "./board.server";

const ScopeEnum = z.enum(["admin", "user"]);

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { isAdmin: await isAdmin(context.userId) };
  });

// Lists the user's ships with an indicator of which loadout layer is active.
export const listMyShipsWithTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: ships, error } = await supabaseAdmin
      .from("user_ships")
      .select("id, ship_slug, ship_name, manufacturer, custom_name")
      .eq("user_id", userId)
      .order("ship_name");
    if (error) throw new Error(error.message);
    const slugs = Array.from(
      new Set((ships ?? []).map((s) => s.ship_slug).filter((s): s is string => !!s)),
    );
    if (slugs.length === 0) return { ships: ships ?? [], templates: [] };
    const { data: tpls } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id, scope, user_id, ship_slug")
      .in("ship_slug", slugs);
    return { ships: ships ?? [], templates: tpls ?? [] };
  });

// Admin only: every fleet ship with admin-template status.
export const listAllShipsWithAdminTemplates = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Nur Admins.");
    const { data: ships, error } = await supabaseAdmin
      .from("ship_catalog")
      .select("slug, name, manufacturer, classification, focus")
      .order("name");
    if (error) throw new Error(error.message);
    const { data: tpls } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id, ship_slug")
      .eq("scope", "admin");
    return { ships: ships ?? [], templates: tpls ?? [] };
  });

// Admin only: effective default stations a Boardcomputer session would load
// for a ship — admin template if present, otherwise Fleetyards seed.
export const getEffectiveDefaultStations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ship_slug: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Nur Admins.");
    const { data: tpl } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id")
      .eq("scope", "admin")
      .is("user_id", null)
      .eq("ship_slug", data.ship_slug)
      .maybeSingle();
    if (tpl) {
      const { data: stations } = await supabaseAdmin
        .from("ship_loadout_stations")
        .select("slot_key, label, hardpoint_name, category, sort_order")
        .eq("template_id", tpl.id)
        .order("sort_order");
      return {
        source: "admin" as const,
        stations: (stations ?? []).map((s) => ({
          slot_key: s.slot_key,
          label: s.label,
          hardpoint_name: s.hardpoint_name,
          category: s.category,
          sort_order: s.sort_order,
        })),
      };
    }
    const seed = await buildSeedStations(data.ship_slug);
    return {
      source: "fleetyards" as const,
      stations: (seed.stations ?? []).map((s) => ({
        slot_key: s.slot_key,
        label: s.label,
        hardpoint_name: s.hardpoint_name,
        category: s.category,
        sort_order: s.sort_order,
      })),
    };
  });

export const getTemplateWithStations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      scope: ScopeEnum,
      ship_slug: z.string().min(1).max(120),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const q = supabaseAdmin
      .from("ship_loadout_templates")
      .select("id, scope, user_id, ship_slug, updated_at")
      .eq("ship_slug", data.ship_slug)
      .eq("scope", data.scope);
    const filtered = data.scope === "user" ? q.eq("user_id", userId) : q.is("user_id", null);
    const { data: tpl } = await filtered.maybeSingle();
    type StationRow = {
      id: string;
      slot_key: string;
      label: string;
      hardpoint_name: string | null;
      category: string | null;
      notes: string | null;
      sort_order: number;
    };
    if (!tpl) return { template: null, stations: [] as StationRow[] };
    const { data: stations } = await supabaseAdmin
      .from("ship_loadout_stations")
      .select("id, slot_key, label, hardpoint_name, category, notes, sort_order")
      .eq("template_id", tpl.id)
      .order("sort_order");
    return { template: tpl, stations: stations ?? [] };
  });

// Returns Fleetyards-derived preview stations (no DB writes).
export const previewFleetyardsStations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ ship_slug: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data }) => {
    const seed = await buildSeedStations(data.ship_slug);
    return seed;
  });

async function assertCanWrite(
  userId: string,
  scope: "admin" | "user",
  shipSlug: string,
) {
  if (scope === "admin") {
    if (!(await isAdmin(userId))) throw new Error("Nur Admins dürfen Admin-Templates ändern.");
    return;
  }
  const { data: owned } = await supabaseAdmin
    .from("user_ships")
    .select("id")
    .eq("user_id", userId)
    .eq("ship_slug", shipSlug)
    .maybeSingle();
  if (!owned) throw new Error("Du besitzt dieses Schiff nicht in deiner Flotte.");
}

// Create (or fetch existing) template row.
export const ensureTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      scope: ScopeEnum,
      ship_slug: z.string().min(1).max(120),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await assertCanWrite(userId, data.scope, data.ship_slug);

    const baseQ = supabaseAdmin
      .from("ship_loadout_templates")
      .select("id")
      .eq("scope", data.scope)
      .eq("ship_slug", data.ship_slug);
    const existingQ = data.scope === "user" ? baseQ.eq("user_id", userId) : baseQ.is("user_id", null);
    const { data: existing } = await existingQ.maybeSingle();
    if (existing) return { template_id: existing.id, created: false };

    const { data: created, error } = await supabaseAdmin
      .from("ship_loadout_templates")
      .insert({
        scope: data.scope,
        ship_slug: data.ship_slug,
        user_id: data.scope === "user" ? userId : null,
      })
      .select("id")
      .single();
    if (error || !created) throw new Error(error?.message || "Konnte Template nicht anlegen.");
    return { template_id: created.id, created: true };
  });

// Seed (or reseed) stations on a template from Fleetyards.
export const seedTemplateFromFleetyards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ template_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: tpl } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id, scope, user_id, ship_slug")
      .eq("id", data.template_id)
      .maybeSingle();
    if (!tpl) throw new Error("Template nicht gefunden.");
    await assertCanWrite(userId, tpl.scope as "admin" | "user", tpl.ship_slug);

    await supabaseAdmin.from("ship_loadout_stations").delete().eq("template_id", tpl.id);
    const { stations: seeds } = await buildSeedStations(tpl.ship_slug);
    if (seeds.length > 0) {
      const { error } = await supabaseAdmin.from("ship_loadout_stations").insert(
        seeds.map((s) => ({
          template_id: tpl.id,
          slot_key: s.slot_key,
          label: s.label,
          hardpoint_name: s.hardpoint_name,
          category: s.category,
          sort_order: s.sort_order,
        })),
      );
      if (error) throw new Error(error.message);
    }
    await supabaseAdmin
      .from("ship_loadout_templates")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", tpl.id);
    return { ok: true, count: seeds.length };
  });

async function assertCanWriteByTemplate(userId: string, templateId: string) {
  const { data: tpl } = await supabaseAdmin
    .from("ship_loadout_templates")
    .select("id, scope, ship_slug")
    .eq("id", templateId)
    .maybeSingle();
  if (!tpl) throw new Error("Template nicht gefunden.");
  await assertCanWrite(userId, tpl.scope as "admin" | "user", tpl.ship_slug);
  return tpl;
}

export const addTemplateStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      template_id: z.string().uuid(),
      label: z.string().min(1).max(120),
      category: z.string().min(1).max(40).default("seat"),
      slot_key: z.string().min(1).max(80).optional(),
      notes: z.string().max(400).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCanWriteByTemplate(context.userId, data.template_id);
    const { data: last } = await supabaseAdmin
      .from("ship_loadout_stations")
      .select("sort_order")
      .eq("template_id", data.template_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextOrder = (last?.sort_order ?? -1) + 1;
    const slot = data.slot_key ?? `manual_${Date.now().toString(36)}`;
    const { error } = await supabaseAdmin.from("ship_loadout_stations").insert({
      template_id: data.template_id,
      slot_key: slot,
      label: data.label,
      category: data.category,
      notes: data.notes ?? null,
      sort_order: nextOrder,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateTemplateStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      station_id: z.string().uuid(),
      label: z.string().min(1).max(120).optional(),
      category: z.string().min(1).max(40).optional(),
      slot_key: z.string().min(1).max(80).optional(),
      notes: z.string().max(400).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: st } = await supabaseAdmin
      .from("ship_loadout_stations")
      .select("id, template_id")
      .eq("id", data.station_id)
      .maybeSingle();
    if (!st) throw new Error("Station nicht gefunden.");
    await assertCanWriteByTemplate(context.userId, st.template_id);
    const patch: {
      label?: string;
      category?: string;
      slot_key?: string;
      notes?: string | null;
    } = {};
    if (data.label !== undefined) patch.label = data.label;
    if (data.category !== undefined) patch.category = data.category;
    if (data.slot_key !== undefined) patch.slot_key = data.slot_key;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("ship_loadout_stations")
      .update(patch)
      .eq("id", data.station_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeTemplateStation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ station_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: st } = await supabaseAdmin
      .from("ship_loadout_stations")
      .select("id, template_id")
      .eq("id", data.station_id)
      .maybeSingle();
    if (!st) throw new Error("Station nicht gefunden.");
    await assertCanWriteByTemplate(context.userId, st.template_id);
    const { error } = await supabaseAdmin
      .from("ship_loadout_stations")
      .delete()
      .eq("id", data.station_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const reorderTemplateStations = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      template_id: z.string().uuid(),
      ordered_ids: z.array(z.string().uuid()).min(1).max(200),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertCanWriteByTemplate(context.userId, data.template_id);
    // Update sort_order one by one (small N).
    for (let i = 0; i < data.ordered_ids.length; i++) {
      await supabaseAdmin
        .from("ship_loadout_stations")
        .update({ sort_order: i })
        .eq("id", data.ordered_ids[i])
        .eq("template_id", data.template_id);
    }
    return { ok: true };
  });

export const deleteLoadoutTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ template_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await assertCanWriteByTemplate(context.userId, data.template_id);
    await supabaseAdmin.from("ship_loadout_stations").delete().eq("template_id", data.template_id);
    const { error } = await supabaseAdmin
      .from("ship_loadout_templates")
      .delete()
      .eq("id", data.template_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Admin only: update a single station label by ship_slug + slot_key.
// If no admin template exists yet, it is created and seeded from Fleetyards
// first so the label edit has a real station row to update.
export const updateEffectiveStationLabel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ship_slug: z.string().min(1).max(120),
      slot_key: z.string().min(1).max(120),
      label: z.string().min(1).max(120),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    if (!(await isAdmin(context.userId))) throw new Error("Nur Admins.");

    let { data: tpl } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id")
      .eq("scope", "admin")
      .is("user_id", null)
      .eq("ship_slug", data.ship_slug)
      .maybeSingle();

    if (!tpl) {
      const { data: created, error: cErr } = await supabaseAdmin
        .from("ship_loadout_templates")
        .insert({ scope: "admin", ship_slug: data.ship_slug, user_id: null })
        .select("id")
        .single();
      if (cErr || !created) throw new Error(cErr?.message || "Konnte Template nicht anlegen.");
      tpl = created;
      const { stations: seeds } = await buildSeedStations(data.ship_slug);
      if (seeds.length > 0) {
        const { error: sErr } = await supabaseAdmin.from("ship_loadout_stations").insert(
          seeds.map((s) => ({
            template_id: tpl!.id,
            slot_key: s.slot_key,
            label: s.label,
            hardpoint_name: s.hardpoint_name,
            category: s.category,
            sort_order: s.sort_order,
          })),
        );
        if (sErr) throw new Error(sErr.message);
      }
    }

    const { data: existing } = await supabaseAdmin
      .from("ship_loadout_stations")
      .select("id")
      .eq("template_id", tpl.id)
      .eq("slot_key", data.slot_key)
      .maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("ship_loadout_stations")
        .update({ label: data.label })
        .eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { data: last } = await supabaseAdmin
        .from("ship_loadout_stations")
        .select("sort_order")
        .eq("template_id", tpl.id)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { error } = await supabaseAdmin.from("ship_loadout_stations").insert({
        template_id: tpl.id,
        slot_key: data.slot_key,
        label: data.label,
        category: "seat",
        sort_order: (last?.sort_order ?? -1) + 1,
      });
      if (error) throw new Error(error.message);
    }

    await supabaseAdmin
      .from("ship_loadout_templates")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", tpl.id);

    return { ok: true };
  });