import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const Visibility = z.enum(["private", "org"]);

export type Blueprint = {
  id: string;
  owner_id: string;
  item_ref: string | null;
  item_name: string;
  output_qty: number;
  source_mission_ref: string | null;
  source_url: string | null;
  visibility: "private" | "org";
  notes: string | null;
  updated_at: string;
  is_owner: boolean;
  mission?: MissionRow | null;
};

export type BlueprintComponent = {
  id: string;
  blueprint_id: string;
  slot_label: string;
  item_ref: string | null;
  item_name: string;
  qty: number;
  unit: "pcs" | "scu";
  weight: number;
  position: number;
  external_uuid?: string | null;
};

export type MissionRow = {
  mission_ref: string;
  name: string;
  faction: string | null;
  rank: string | null;
  payout: number | null;
  reputation: string | null;
  location: string | null;
  url: string | null;
};

export type WikiMissionRow = {
  mission_uuid: string;
  title: string;
  giver: string | null;
  faction: string | null;
  reward_min: number | null;
  reward_max: number | null;
  min_standing_name: string | null;
  min_reputation: number | null;
  max_standing_name: string | null;
  max_reputation: number | null;
  reward_scope: string | null;
  web_url: string | null;
  legality_label: string | null;
  star_systems: string[] | null;
};

export const listBlueprints = createServerFn({ method: "GET" })
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
    const { coOrgMemberIds } = await import("./org-membership.server");
    const allowedOwners = await coOrgMemberIds(supabaseAdmin, context.userId);
    const scope = data.scope ?? "all";
    let q = supabaseAdmin
      .from("blueprints")
      .select("*")
      .order("updated_at", { ascending: false });
    if (scope === "mine") q = q.eq("owner_id", context.userId);
    else if (scope === "org")
      q = q.eq("visibility", "org").in("owner_id", allowedOwners);
    else
      q = q.or(
        `owner_id.eq.${context.userId},and(visibility.eq.org,owner_id.in.(${allowedOwners.join(",")}))`,
      );
    if (data.search) q = q.ilike("item_name", `%${data.search}%`);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return {
      blueprints: (rows ?? []).map((r) => ({
        ...(r as unknown as Omit<Blueprint, "is_owner">),
        is_owner: r.owner_id === context.userId,
      })) as Blueprint[],
    };
  });

export const getBlueprint = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: bp, error } = await supabaseAdmin
      .from("blueprints")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!bp) return null;
    if (bp.owner_id !== context.userId) {
      // Wiki/non-manual blueprints are public to all authenticated users
      // (matches RLS: source <> 'manual'). Manual + org-visible requires co-org.
      if (bp.source === "manual") {
        if (bp.visibility !== "org") return null;
        const { coOrgMemberIds } = await import("./org-membership.server");
        const allowed = await coOrgMemberIds(supabaseAdmin, context.userId);
        if (!allowed.includes(bp.owner_id as string)) return null;
      }
    }

    const { data: comps } = await supabaseAdmin
      .from("blueprint_components")
      .select("*")
      .eq("blueprint_id", data.id)
      .order("position");

    let mission: MissionRow | null = null;
    if (bp.source_mission_ref) {
      const { data: m } = await supabaseAdmin
        .from("missions_catalog")
        .select("*")
        .eq("mission_ref", bp.source_mission_ref)
        .maybeSingle();
      mission = (m as MissionRow) ?? null;
    }

    const { data: wm } = await supabaseAdmin
      .from("blueprint_missions")
      .select(
        "mission_uuid, mission_title, mission_giver, faction, reward_min, reward_max, min_standing_name, min_reputation, max_standing_name, max_reputation, reward_scope, web_url, legality_label, star_systems",
      )
      .eq("blueprint_id", data.id)
      .order("min_reputation", { ascending: true, nullsFirst: true });
    const wiki_missions: WikiMissionRow[] = (wm ?? []).map((r) => ({
      mission_uuid: r.mission_uuid as string,
      title: r.mission_title as string,
      giver: (r.mission_giver as string | null) ?? null,
      faction: (r.faction as string | null) ?? null,
      reward_min: (r.reward_min as number | null) ?? null,
      reward_max: (r.reward_max as number | null) ?? null,
      min_standing_name: (r.min_standing_name as string | null) ?? null,
      min_reputation: (r.min_reputation as number | null) ?? null,
      max_standing_name: (r.max_standing_name as string | null) ?? null,
      max_reputation: (r.max_reputation as number | null) ?? null,
      reward_scope: (r.reward_scope as string | null) ?? null,
      web_url: (r.web_url as string | null) ?? null,
      legality_label: (r.legality_label as string | null) ?? null,
      star_systems: (r.star_systems as string[] | null) ?? null,
    }));

    return {
      blueprint: {
        ...(bp as unknown as Omit<Blueprint, "is_owner" | "mission">),
        is_owner: bp.owner_id === context.userId,
        mission,
      } as Blueprint,
      components: (comps ?? []) as BlueprintComponent[],
      wiki_missions,
    };
  });

const ComponentSchema = z.object({
  slot_label: z.string().trim().min(1).max(80),
  item_ref: z.string().max(120).optional().nullable(),
  item_name: z.string().trim().min(1).max(160),
  qty: z.number().min(0.0001).max(1_000_000),
  unit: z.enum(["pcs", "scu"]).default("pcs"),
  weight: z.number().min(0).max(100).default(1),
});

const BlueprintSchema = z.object({
  id: z.string().uuid().optional(),
  item_name: z.string().trim().min(1).max(160),
  item_ref: z.string().max(120).optional().nullable(),
  output_qty: z.number().min(0.0001).max(1_000_000).default(1),
  source_mission_ref: z.string().max(120).optional().nullable(),
  source_url: z.string().url().max(500).optional().nullable(),
  visibility: Visibility.default("private"),
  notes: z.string().max(2000).optional().nullable(),
  components: z.array(ComponentSchema).max(50).default([]),
});

export const upsertBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => BlueprintSchema.parse(input))
  .handler(async ({ data, context }) => {
    const payload = {
      item_name: data.item_name,
      item_ref: data.item_ref ?? null,
      output_qty: data.output_qty,
      source_mission_ref: data.source_mission_ref ?? null,
      source_url: data.source_url ?? null,
      visibility: data.visibility,
      notes: data.notes ?? null,
    };
    let bpId = data.id;
    if (bpId) {
      const { error } = await supabaseAdmin
        .from("blueprints")
        .update(payload)
        .eq("id", bpId)
        .eq("owner_id", context.userId);
      if (error) throw new Error(error.message);
      await supabaseAdmin
        .from("blueprint_components")
        .delete()
        .eq("blueprint_id", bpId);
    } else {
      const { data: row, error } = await supabaseAdmin
        .from("blueprints")
        .insert({ ...payload, owner_id: context.userId })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      bpId = row.id as string;
    }
    if (data.components.length > 0) {
      const rows = data.components.map((c, i) => ({
        blueprint_id: bpId,
        slot_label: c.slot_label,
        item_ref: c.item_ref ?? null,
        item_name: c.item_name,
        qty: c.qty,
        unit: c.unit,
        weight: c.weight,
        position: i,
      }));
      const { error: insErr } = await supabaseAdmin
        .from("blueprint_components")
        .insert(rows);
      if (insErr) throw new Error(insErr.message);
    }
    return { id: bpId! };
  });

export const deleteBlueprint = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin
      .from("blueprints")
      .delete()
      .eq("id", data.id)
      .eq("owner_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Save/cache a mission record. Free-form fields, no external API call. */
export const upsertMission = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        mission_ref: z.string().trim().min(1).max(120),
        name: z.string().trim().min(1).max(200),
        faction: z.string().trim().max(120).optional().nullable(),
        rank: z.string().trim().max(80).optional().nullable(),
        payout: z.number().min(0).max(1_000_000_000).optional().nullable(),
        reputation: z.string().trim().max(120).optional().nullable(),
        location: z.string().trim().max(160).optional().nullable(),
        url: z.string().url().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("missions_catalog")
      .upsert(
        {
          mission_ref: data.mission_ref,
          name: data.name,
          faction: data.faction ?? null,
          rank: data.rank ?? null,
          payout: data.payout ?? null,
          reputation: data.reputation ?? null,
          location: data.location ?? null,
          url: data.url ?? null,
        },
        { onConflict: "mission_ref" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listMissions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data } = await supabaseAdmin
      .from("missions_catalog")
      .select("*")
      .order("name");
    return (data ?? []) as MissionRow[];
  });