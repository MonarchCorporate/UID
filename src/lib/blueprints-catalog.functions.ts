import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type CatalogIngredient = {
  name: string;
  qty: number;
  kind: string | null;
  external_uuid: string | null;
  item_ref: string | null;
  unit: "pcs" | "scu";
  have: number;
  need: number;
};

export type CatalogMission = {
  mission_uuid: string;
  title: string;
  giver: string | null;
  faction: string | null;
  reward_min: number | null;
  reward_max: number | null;
};

export type CatalogBlueprint = {
  id: string;
  external_uuid: string | null;
  name: string;
  source: "wiki" | "manual";
  category: string | null;
  craft_time_seconds: number | null;
  is_default: boolean;
  output_qty: number;
  owned: boolean;
  craftable: boolean;
  ingredients: CatalogIngredient[];
  missing: string[];
  missions: CatalogMission[];
};

export const listBlueprintCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().max(120).optional(),
        only_owned: z.boolean().optional(),
        only_craftable: z.boolean().optional(),
        source: z.enum(["wiki", "manual", "all"]).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { coOrgMemberIds } = await import("./org-membership.server");
    const allowedOwners = new Set(await coOrgMemberIds(supabaseAdmin, context.userId));

    // 1) Blueprints (RLS-respecting via admin + manual filter)
    // PostgREST caps responses at 1000 rows → paginate via .range()
    const BP_PAGE = 1000;
    type BpRow = {
      id: string;
      external_uuid: string | null;
      item_name: string;
      output_qty: number | null;
      source: string;
      notes: string | null;
      craft_time_seconds: number | null;
      is_default: boolean | null;
      owner_id: string | null;
      visibility: string | null;
    };
    const bpRows: BpRow[] = [];
    for (let from = 0; from < 50_000; from += BP_PAGE) {
      let q = supabaseAdmin
        .from("blueprints")
        .select(
          "id, external_uuid, item_name, output_qty, source, notes, craft_time_seconds, is_default, owner_id, visibility",
        )
        .order("item_name", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + BP_PAGE - 1);
      if (data.search) q = q.ilike("item_name", `%${data.search}%`);
      if (data.source && data.source !== "all")
        q = q.eq("source", data.source);
      const { data: page, error: bpErr } = await q;
      if (bpErr) throw new Error(bpErr.message);
      const rows = (page ?? []) as BpRow[];
      bpRows.push(...rows);
      if (rows.length < BP_PAGE) break;
    }

    // Filter access (wiki = all; manual = own or org)
    const accessible = (bpRows ?? []).filter(
      (b) =>
        b.source !== "manual" ||
        b.owner_id === context.userId ||
        (b.visibility === "org" && b.owner_id !== null && allowedOwners.has(b.owner_id)),
    );
    const ids = accessible.map((b) => b.id);
    if (ids.length === 0) return { blueprints: [] as CatalogBlueprint[] };

    // 2) Components, missions, owned set, inventory (parallel)
    // Avoid PostgREST URL-length failures from large `IN (...)` filters by
    // paging the child tables and filtering to accessible blueprint ids in JS.
    const accessibleIdSet = new Set(ids);
    const pageRows = async <T,>(
      table: "blueprint_components" | "blueprint_missions",
      select: string,
      orderColumn?: string,
    ): Promise<T[]> => {
      const rows: T[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        let req = supabaseAdmin
          .from(table)
          .select(select)
          .range(from, from + pageSize - 1);
        // Deterministic ordering: primary column (if given) then `id` as
        // tiebreaker. Without a stable tiebreaker, Postgres can return
        // duplicated/missing rows across pages when the primary column has
        // many ties (e.g. position=0 across thousands of blueprints).
        if (orderColumn) req = req.order(orderColumn, { ascending: true });
        req = req.order("id", { ascending: true });
        const { data: page, error } = await req;
        if (error) throw new Error(`${table}: ${error.message}`);
        rows.push(...((page ?? []) as T[]));
        if (!page || page.length < pageSize) break;
      }
      return rows.filter((row) =>
        accessibleIdSet.has((row as { blueprint_id: string }).blueprint_id),
      );
    };

    const [compsData, missionsData, ownedRes, invRes, catRes] = await Promise.all([
      pageRows<{
        blueprint_id: string;
        item_name: string;
        item_ref: string | null;
        external_uuid: string | null;
        kind: string | null;
        qty: number;
        unit: string | null;
        position: number | null;
      }>(
        "blueprint_components",
        "blueprint_id, item_name, item_ref, external_uuid, kind, qty, unit, position",
        "position",
      ),
      pageRows<{
        blueprint_id: string;
        mission_uuid: string;
        mission_title: string;
        mission_giver: string | null;
        faction: string | null;
        reward_min: number | null;
        reward_max: number | null;
      }>(
        "blueprint_missions",
        "blueprint_id, mission_uuid, mission_title, mission_giver, faction, reward_min, reward_max",
      ),
      supabaseAdmin
        .from("user_blueprint_collection")
        .select("blueprint_id")
        .eq("user_id", context.userId),
      // Eigenes + Org-Inventar (visibility='org' shared in org)
      supabaseAdmin
        .from("inventory_items")
        .select("item_ref, item_name, qty, qty_reserved, owner_id, visibility, unit")
        .or(
          `owner_id.eq.${context.userId},and(visibility.eq.org,owner_id.in.(${Array.from(allowedOwners).join(",")}))`,
        ),
      // Catalog → wiki_uuid map for UUID-based matching
      supabaseAdmin
        .from("inventory_item_catalog")
        .select("item_ref, name, wiki_uuid")
        .not("wiki_uuid", "is", null),
    ]);
    if (ownedRes.error) throw new Error(ownedRes.error.message);
    if (invRes.error) throw new Error(invRes.error.message);
    if (catRes.error) throw new Error(catRes.error.message);

    // Build catalog item_ref → wiki_uuid map (UUID bridge)
    const refToWiki = new Map<string, string>();
    for (const c of catRes.data ?? []) {
      if (c.item_ref && c.wiki_uuid) refToWiki.set(c.item_ref, c.wiki_uuid);
    }

    // Aggregate inventory by wiki_uuid (primary), item_ref, and name (fallback).
    // Keys are scoped per unit so an ingredient in SCU never picks up a pcs-stack.
    const byWiki = new Map<string, number>(); // `${unit}:${uuid}`
    const byRef = new Map<string, number>();  // `${unit}:${ref}`
    const byName = new Map<string, number>(); // `${unit}:${name}`
    for (const it of invRes.data ?? []) {
      const avail = Math.max(0, Number(it.qty) - Number(it.qty_reserved ?? 0));
      const u = (it.unit as string) || "pcs";
      if (it.item_ref) {
        const k = `${u}:${it.item_ref}`;
        byRef.set(k, (byRef.get(k) ?? 0) + avail);
        const w = refToWiki.get(it.item_ref);
        if (w) {
          const kw = `${u}:${w}`;
          byWiki.set(kw, (byWiki.get(kw) ?? 0) + avail);
        }
      }
      const nk = String(it.item_name ?? "").trim().toLowerCase();
      if (nk) {
        const kn = `${u}:${nk}`;
        byName.set(kn, (byName.get(kn) ?? 0) + avail);
      }
    }

    const ownedSet = new Set((ownedRes.data ?? []).map((r) => r.blueprint_id));
    const compsByBp = new Map<string, typeof compsData>();
    for (const c of compsData) {
      const arr = compsByBp.get(c.blueprint_id) ?? [];
      arr.push(c);
      compsByBp.set(c.blueprint_id, arr);
    }
    const missionsByBp = new Map<string, typeof missionsData>();
    for (const m of missionsData) {
      const arr = missionsByBp.get(m.blueprint_id) ?? [];
      arr.push(m);
      missionsByBp.set(m.blueprint_id, arr);
    }

    const result: CatalogBlueprint[] = accessible.map((b) => {
      const comps = compsByBp.get(b.id) ?? [];
      const ingredients: CatalogIngredient[] = comps.map((c) => {
        const need = Number(c.qty);
        const unit = ((c.unit as string) || "pcs") as "pcs" | "scu";
        // 1) wiki uuid match (preferred), 2) shared item_ref, 3) name fallback
        let have = 0;
        if (c.external_uuid)
          have = byWiki.get(`${unit}:${c.external_uuid as string}`) ?? 0;
        if (!have && c.item_ref)
          have = byRef.get(`${unit}:${c.item_ref as string}`) ?? 0;
        if (!have)
          have =
            byName.get(
              `${unit}:${String(c.item_name ?? "").trim().toLowerCase()}`,
            ) ?? 0;
        return {
          name: c.item_name,
          qty: need,
          kind: (c.kind as string | null) ?? null,
          external_uuid: (c.external_uuid as string | null) ?? null,
          item_ref: (c.item_ref as string | null) ?? null,
          unit,
          need,
          have,
        };
      });
      const missing = ingredients
        .filter((i) => i.have < i.need)
        .map((i) => {
          const diff = i.need - i.have;
          if (i.unit === "scu") {
            const label =
              diff < 1
                ? `${Math.round(diff * 100)} cSCU`
                : `${diff.toLocaleString("de-DE", { maximumFractionDigits: 2 })} SCU`;
            return `${label} ${i.name}`;
          }
          return `${diff}× ${i.name}`;
        });
      const craftable = ingredients.length > 0 && missing.length === 0;
      const missions = (missionsByBp.get(b.id) ?? []).map((m) => ({
        mission_uuid: m.mission_uuid,
        title: m.mission_title,
        giver: m.mission_giver as string | null,
        faction: m.faction as string | null,
        reward_min: m.reward_min as number | null,
        reward_max: m.reward_max as number | null,
      }));
      return {
        id: b.id,
        external_uuid: (b.external_uuid as string | null) ?? null,
        name: b.item_name,
        source: (b.source as "wiki" | "manual") ?? "manual",
        category: (b.notes as string | null) ?? null,
        craft_time_seconds: (b.craft_time_seconds as number | null) ?? null,
        is_default: !!b.is_default,
        output_qty: Number(b.output_qty),
        owned: ownedSet.has(b.id),
        craftable,
        ingredients,
        missing,
        missions,
      };
    });

    const filtered = result.filter((r) => {
      if (data.only_owned && !r.owned) return false;
      if (data.only_craftable && !r.craftable) return false;
      return true;
    });

    return { blueprints: filtered };
  });

export const toggleBlueprintOwned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ blueprint_id: z.string().uuid(), owned: z.boolean() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    if (data.owned) {
      const { error } = await supabaseAdmin
        .from("user_blueprint_collection")
        .upsert(
          { user_id: context.userId, blueprint_id: data.blueprint_id },
          { onConflict: "user_id,blueprint_id" },
        );
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin
        .from("user_blueprint_collection")
        .delete()
        .eq("user_id", context.userId)
        .eq("blueprint_id", data.blueprint_id);
      if (error) throw new Error(error.message);
    }
    return { ok: true, owned: data.owned };
  });

export const syncWikiBlueprints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Nur Admins.");
    const { runWikiBlueprintSync } = await import("./blueprints-sync.server");
    return runWikiBlueprintSync();
  });

export const getWikiBlueprintSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { getWikiBlueprintSyncStatusServer } = await import(
      "./blueprints-sync.server"
    );
    return getWikiBlueprintSyncStatusServer();
  });

export const rematchInventoryWikiUuids = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: role } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw new Error("Nur Admins.");
    const { matchInventoryWikiUuidsServer } = await import(
      "./blueprints-sync.server"
    );
    return matchInventoryWikiUuidsServer();
  });

function normName(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
function unquoteVariant(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/["']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
function stripVariantLabel(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*["'][^"']+["']\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export const importBlueprintCollection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        blueprints: z
          .array(
            z.object({
              key: z.string().min(1).max(500),
              isDone: z.boolean().optional(),
              isMarked: z.boolean().optional(),
            }),
          )
          .max(5000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const doneKeys = data.blueprints
      .filter((b) => b.isDone)
      .map((b) => b.key);

    const bps: Array<{ id: string; item_name: string | null }> = [];
    const pageSize = 1000;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error: pErr } = await supabaseAdmin
        .from("blueprints")
        .select("id, item_name")
        .range(from, from + pageSize - 1);
      if (pErr) throw new Error(pErr.message);
      if (!page || page.length === 0) break;
      bps.push(...(page as Array<{ id: string; item_name: string | null }>));
      if (page.length < pageSize) break;
    }

    const byName = new Map<string, string>();
    const byUnq = new Map<string, string>();
    const byStripped = new Map<string, string>();
    for (const b of bps ?? []) {
      const name = (b.item_name as string | null) ?? "";
      if (!name) continue;
      const id = b.id as string;
      byName.set(normName(name), id);
      const unq = normName(unquoteVariant(name));
      if (!byUnq.has(unq)) byUnq.set(unq, id);
      const stripped = normName(stripVariantLabel(name));
      if (stripped && !byStripped.has(stripped)) byStripped.set(stripped, id);
    }

    const matchedIds = new Set<string>();
    const unmatched: string[] = [];
    for (const key of doneKeys) {
      const k = normName(key);
      const id =
        byName.get(k) ??
        byUnq.get(normName(unquoteVariant(key))) ??
        byStripped.get(normName(stripVariantLabel(key)));
      if (id) matchedIds.add(id);
      else unmatched.push(key);
    }

    const { data: existing, error: exErr } = await supabaseAdmin
      .from("user_blueprint_collection")
      .select("blueprint_id")
      .eq("user_id", context.userId);
    if (exErr) throw new Error(exErr.message);
    const existingSet = new Set(
      (existing ?? []).map((r) => r.blueprint_id as string),
    );

    const toInsert = [...matchedIds].filter((id) => !existingSet.has(id));
    const alreadyOwned = matchedIds.size - toInsert.length;

    if (toInsert.length > 0) {
      const rows = toInsert.map((blueprint_id) => ({
        user_id: context.userId,
        blueprint_id,
      }));
      const { error: insErr } = await supabaseAdmin
        .from("user_blueprint_collection")
        .upsert(rows, { onConflict: "user_id,blueprint_id" });
      if (insErr) throw new Error(insErr.message);
    }

    return {
      added: toInsert.length,
      already_owned: alreadyOwned,
      unmatched,
    };
  });