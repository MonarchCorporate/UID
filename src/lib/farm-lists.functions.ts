import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ============================================================
 * Farm-Listen: geteilte Crafting-Sammellisten.
 * Mehrere Blueprints werden summiert, Mitglieder tragen
 * gefarmte Mengen ein. Inventar/Orgalager fließen optional ein.
 * ============================================================ */

export type FarmListSummary = {
  id: string;
  name: string;
  description: string | null;
  status: "active" | "completed" | "archived";
  include_personal_inventory: boolean;
  include_org_warehouse: boolean;
  owner_id: string;
  owner_callsign: string | null;
  is_owner: boolean;
  can_manage: boolean;
  member_role: "viewer" | "editor" | null;
  blueprint_count: number;
  material_count: number;
  progress_pct: number;
  created_at: string;
  updated_at: string;
};

export type FarmListBlueprintRow = {
  id: string;
  blueprint_id: string;
  blueprint_name: string;
  blueprint_item_ref: string | null;
  output_qty: number;
  quantity: number;
};

export type FarmListMemberRow = {
  user_id: string;
  role: "viewer" | "editor";
  status: "pending" | "accepted";
  callsign: string | null;
  display_name: string | null;
  created_at: string;
};

export type FarmListContributionRow = {
  id: string;
  user_id: string;
  user_callsign: string | null;
  material_ref: string;
  material_name: string;
  qty: number;
  quality: number | null;
  note: string | null;
  source: "manual" | "inventory";
  created_at: string;
};

export type FarmListMaterial = {
  material_ref: string;
  material_name: string;
  item_ref: string | null;
  needed: number;
  inventory_qty: number;
  warehouse_qty: number;
  contributed_qty: number;
  remaining: number;
  progress_pct: number;
  unit: string;
};

export type FarmListDetail = {
  list: FarmListSummary;
  blueprints: FarmListBlueprintRow[];
  members: FarmListMemberRow[];
  contributions: FarmListContributionRow[];
  materials: FarmListMaterial[];
  can_edit: boolean;
  invite_token: string | null;
  invite_role: "viewer" | "editor";
};

export type FarmListInvitePreview = {
  id: string;
  name: string;
  description: string | null;
  owner_callsign: string | null;
  role: "viewer" | "editor";
  already_member: boolean;
  is_owner: boolean;
};

export type FarmListInvitation = {
  list_id: string;
  list_name: string;
  description: string | null;
  role: "viewer" | "editor";
  owner_callsign: string | null;
  invited_at: string;
};

function normalizeMaterialKey(itemRef: string | null, name: string): string {
  if (itemRef && itemRef.trim()) return itemRef.trim();
  return `name:${name.trim().toLowerCase()}`;
}

/** App-Admins dürfen jede Farm-Liste verwalten (abschließen, archivieren, löschen). */
async function isAppAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

async function loadAccess(listId: string, userId: string) {
  const isAdmin = await isAppAdmin(userId);
  const { data: list, error } = await supabaseAdmin
    .from("farm_lists")
    .select("*")
    .eq("id", listId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!list) throw new Error("Liste nicht gefunden");
  const isOwner = list.owner_id === userId;
  let role: "viewer" | "editor" | null = null;
  if (!isOwner) {
    const { data: m } = await supabaseAdmin
      .from("farm_list_members")
      .select("role")
      .eq("list_id", listId)
      .eq("user_id", userId)
      .eq("status", "accepted")
      .maybeSingle();
    role = (m?.role as "viewer" | "editor" | undefined) ?? null;
  }
  if (!isOwner && !role && !isAdmin) throw new Error("Kein Zugriff auf diese Liste");
  return {
    list,
    isOwner,
    isAdmin,
    canManage: isOwner || isAdmin,
    role,
    canEdit: isOwner || isAdmin || role === "editor",
  };
}

/* ------------------------------------------------------------ */
/* Listenübersicht                                              */
/* ------------------------------------------------------------ */

export const listFarmLists = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const uid = context.userId;
    const uidIsAdmin = await isAppAdmin(uid);

    const { data: owned } = await supabaseAdmin
      .from("farm_lists")
      .select("*")
      .eq("owner_id", uid);

    const { data: memberRows } = await supabaseAdmin
      .from("farm_list_members")
      .select("list_id, role, created_at, status")
      .eq("user_id", uid);
    const acceptedRows = (memberRows ?? []).filter(
      (r) => ((r as { status?: string }).status ?? "accepted") === "accepted",
    );
    const pendingRows = (memberRows ?? []).filter(
      (r) => (r as { status?: string }).status === "pending",
    );
    const memberListIds = acceptedRows.map((r) => r.list_id as string);
    const roleByList = new Map(
      acceptedRows.map((r) => [r.list_id as string, r.role as "viewer" | "editor"]),
    );

    // Offene Einladungen (pending) – separat, ohne Zugriff auf die Liste.
    const pendingIds = pendingRows.map((r) => r.list_id as string);
    const { data: pendingLists } = pendingIds.length
      ? await supabaseAdmin
          .from("farm_lists")
          .select("id, name, description, owner_id")
          .in("id", pendingIds)
      : { data: [] };
    const { data: pendingOwners } = (pendingLists ?? []).length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, callsign")
          .in("id", Array.from(new Set((pendingLists ?? []).map((l) => l.owner_id as string))))
      : { data: [] };
    const pendingOwnerMap = new Map(
      (pendingOwners ?? []).map((p) => [p.id as string, p.callsign as string | null]),
    );
    const invitations: FarmListInvitation[] = (pendingLists ?? []).map((l) => {
      const row = pendingRows.find((r) => r.list_id === l.id);
      return {
        list_id: l.id as string,
        list_name: l.name as string,
        description: (l.description as string | null) ?? null,
        role: (row?.role as "viewer" | "editor") ?? "editor",
        owner_callsign: pendingOwnerMap.get(l.owner_id as string) ?? null,
        invited_at: (row?.created_at as string) ?? new Date().toISOString(),
      };
    });

    const { data: joined } = memberListIds.length
      ? await supabaseAdmin.from("farm_lists").select("*").in("id", memberListIds)
      : { data: [] };

    const allLists = [...(owned ?? []), ...(joined ?? [])];
    if (allLists.length === 0) return { lists: [] as FarmListSummary[], invitations };

    const listIds = allLists.map((l) => l.id as string);
    const ownerIds = Array.from(new Set(allLists.map((l) => l.owner_id as string)));

    const [{ data: ownerProfiles }, { data: bps }, { data: contribs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id, callsign").in("id", ownerIds),
      supabaseAdmin
        .from("farm_list_blueprints")
        .select("list_id, quantity, blueprint:blueprints(id, item_name, item_ref, output_qty)")
        .in("list_id", listIds),
      supabaseAdmin
        .from("farm_list_contributions")
        .select("list_id, material_ref, qty")
        .in("list_id", listIds),
    ]);

    const ownerMap = new Map(
      (ownerProfiles ?? []).map((p) => [p.id as string, p.callsign as string | null]),
    );

    // Compute basic progress per list (without inventory snapshot, just contributed vs needed).
    const neededByList = new Map<string, Map<string, number>>();
    for (const row of bps ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bp: any = row.blueprint;
      if (!bp) continue;
      const lid = row.list_id as string;
      const mult = Number(row.quantity ?? 1);
      // We need to load components for each blueprint id used.
      // Fetched lazily below.
      if (!neededByList.has(lid)) neededByList.set(lid, new Map());
      neededByList.get(lid)!.set(`__bp:${bp.id}`, (neededByList.get(lid)!.get(`__bp:${bp.id}`) ?? 0) + mult);
    }

    const allBpIds = Array.from(
      new Set(
        (bps ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((r) => (r.blueprint as any)?.id as string | undefined)
          .filter(Boolean) as string[],
      ),
    );
    const { data: comps } = allBpIds.length
      ? await supabaseAdmin
          .from("blueprint_components")
          .select("blueprint_id, item_ref, item_name, qty")
          .in("blueprint_id", allBpIds)
      : { data: [] };

    const compsByBp = new Map<string, Array<{ key: string; qty: number }>>();
    for (const c of comps ?? []) {
      const bid = c.blueprint_id as string;
      const key = normalizeMaterialKey(c.item_ref as string | null, c.item_name as string);
      if (!compsByBp.has(bid)) compsByBp.set(bid, []);
      compsByBp.get(bid)!.push({ key, qty: Number(c.qty ?? 0) });
    }

    const needTotals = new Map<string, Map<string, number>>();
    for (const row of bps ?? []) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bp: any = row.blueprint;
      if (!bp) continue;
      const lid = row.list_id as string;
      const mult = Number(row.quantity ?? 1);
      const list = needTotals.get(lid) ?? new Map<string, number>();
      for (const c of compsByBp.get(bp.id as string) ?? []) {
        list.set(c.key, (list.get(c.key) ?? 0) + c.qty * mult);
      }
      needTotals.set(lid, list);
    }

    const contribTotals = new Map<string, Map<string, number>>();
    for (const c of contribs ?? []) {
      const lid = c.list_id as string;
      const list = contribTotals.get(lid) ?? new Map<string, number>();
      list.set(
        c.material_ref as string,
        (list.get(c.material_ref as string) ?? 0) + Number(c.qty ?? 0),
      );
      contribTotals.set(lid, list);
    }

    const bpCountByList = new Map<string, number>();
    for (const row of bps ?? []) {
      bpCountByList.set(
        row.list_id as string,
        (bpCountByList.get(row.list_id as string) ?? 0) + 1,
      );
    }

    const out: FarmListSummary[] = allLists.map((l) => {
      const lid = l.id as string;
      const needs = needTotals.get(lid) ?? new Map();
      const contribs = contribTotals.get(lid) ?? new Map();
      let totalNeed = 0;
      let totalProgress = 0;
      for (const [k, n] of needs) {
        totalNeed += n;
        totalProgress += Math.min(n, contribs.get(k) ?? 0);
      }
      return {
        id: lid,
        name: l.name as string,
        description: l.description as string | null,
        status: l.status as FarmListSummary["status"],
        include_personal_inventory: l.include_personal_inventory as boolean,
        include_org_warehouse: l.include_org_warehouse as boolean,
        owner_id: l.owner_id as string,
        owner_callsign: ownerMap.get(l.owner_id as string) ?? null,
        is_owner: l.owner_id === uid,
        can_manage: l.owner_id === uid || uidIsAdmin,
        member_role: roleByList.get(lid) ?? null,
        blueprint_count: bpCountByList.get(lid) ?? 0,
        material_count: needs.size,
        progress_pct: totalNeed > 0 ? Math.round((totalProgress / totalNeed) * 100) : 0,
        created_at: l.created_at as string,
        updated_at: l.updated_at as string,
      };
    });

    // Deduplicate (owner may also be in members) and sort: active first, then updated_at desc.
    const dedup = Array.from(new Map(out.map((l) => [l.id, l])).values());
    dedup.sort((a, b) => {
      if (a.status !== b.status) {
        const order = { active: 0, completed: 1, archived: 2 } as const;
        return order[a.status] - order[b.status];
      }
      return b.updated_at.localeCompare(a.updated_at);
    });
    return { lists: dedup, invitations };
  });

/* ------------------------------------------------------------ */
/* Detail                                                       */
/* ------------------------------------------------------------ */

export const getFarmList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<FarmListDetail> => {
    const uid = context.userId;
    const { list, isOwner, role, canEdit, canManage } = await loadAccess(data.id, uid);

    // Blueprints in the list
    const { data: bpRows } = await supabaseAdmin
      .from("farm_list_blueprints")
      .select("id, quantity, blueprint:blueprints(id, item_name, item_ref, output_qty)")
      .eq("list_id", data.id);

    const bps: FarmListBlueprintRow[] = (bpRows ?? [])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .map((r: any) => ({
        id: r.id as string,
        blueprint_id: r.blueprint?.id as string,
        blueprint_name: r.blueprint?.item_name as string,
        blueprint_item_ref: (r.blueprint?.item_ref as string | null) ?? null,
        output_qty: Number(r.blueprint?.output_qty ?? 1),
        quantity: Number(r.quantity ?? 1),
      }))
      .filter((r) => r.blueprint_id);

    // Components for those blueprints
    const bpIds = bps.map((b) => b.blueprint_id);
    const { data: comps } = bpIds.length
      ? await supabaseAdmin
          .from("blueprint_components")
          .select("blueprint_id, item_ref, item_name, qty, unit")
          .in("blueprint_id", bpIds)
      : { data: [] };

    type Need = { ref: string; name: string; item_ref: string | null; qty: number; unit: string };
    const needs = new Map<string, Need>();
    for (const bp of bps) {
      const bpComps = (comps ?? []).filter((c) => c.blueprint_id === bp.blueprint_id);
      for (const c of bpComps) {
        const ref = normalizeMaterialKey(c.item_ref as string | null, c.item_name as string);
        const cur = needs.get(ref);
        const add = Number(c.qty ?? 0) * bp.quantity;
        if (cur) cur.qty += add;
        else
          needs.set(ref, {
            ref,
            name: c.item_name as string,
            item_ref: (c.item_ref as string | null) ?? null,
            qty: add,
            unit: (c.unit as string) ?? "pcs",
          });
      }
    }

    // Member access: list members may not see private inventory of others.
    // include_personal_inventory only applies to the requesting user's inventory.
    let invMap = new Map<string, number>();
    if (list.include_personal_inventory) {
      const { data: inv } = await supabaseAdmin
        .from("inventory_items")
        .select("item_ref, item_name, qty")
        .eq("owner_id", uid);
      for (const r of inv ?? []) {
        const key = normalizeMaterialKey(r.item_ref as string | null, r.item_name as string);
        invMap.set(key, (invMap.get(key) ?? 0) + Number(r.qty ?? 0));
      }
    }

    let warehouseMap = new Map<string, number>();
    if (list.include_org_warehouse && list.org_id) {
      const { data: wh } = await supabaseAdmin
        .from("org_warehouse")
        .select("item_ref, item_name, qty, locked")
        .eq("org_id", list.org_id)
        .eq("locked", false);
      for (const r of wh ?? []) {
        const key = normalizeMaterialKey(r.item_ref as string | null, r.item_name as string);
        warehouseMap.set(key, (warehouseMap.get(key) ?? 0) + Number(r.qty ?? 0));
      }
    }

    // Contributions
    const { data: contribRows } = await supabaseAdmin
      .from("farm_list_contributions")
      .select("id, user_id, material_ref, material_name, qty, quality, note, source, created_at")
      .eq("list_id", data.id)
      .order("created_at", { ascending: false });

    const contribUserIds = Array.from(
      new Set((contribRows ?? []).map((c) => c.user_id as string)),
    );
    const { data: contribProfiles } = contribUserIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, callsign")
          .in("id", contribUserIds)
      : { data: [] };
    const callsignByUser = new Map(
      (contribProfiles ?? []).map((p) => [p.id as string, p.callsign as string | null]),
    );

    const contributions: FarmListContributionRow[] = (contribRows ?? []).map((c) => ({
      id: c.id as string,
      user_id: c.user_id as string,
      user_callsign: callsignByUser.get(c.user_id as string) ?? null,
      material_ref: c.material_ref as string,
      material_name: c.material_name as string,
      qty: Number(c.qty ?? 0),
      quality: (c.quality as number | null) ?? null,
      note: (c.note as string | null) ?? null,
      source: (c.source as "manual" | "inventory") ?? "manual",
      created_at: c.created_at as string,
    }));

    const contribTotals = new Map<string, number>();
    for (const c of contributions) {
      contribTotals.set(c.material_ref, (contribTotals.get(c.material_ref) ?? 0) + c.qty);
    }

    const materials: FarmListMaterial[] = Array.from(needs.values())
      .map((n) => {
        const inv = invMap.get(n.ref) ?? 0;
        const wh = warehouseMap.get(n.ref) ?? 0;
        const contrib = contribTotals.get(n.ref) ?? 0;
        const have = inv + wh + contrib;
        const remaining = Math.max(0, n.qty - have);
        const progress_pct = n.qty > 0 ? Math.min(100, Math.round((have / n.qty) * 100)) : 0;
        return {
          material_ref: n.ref,
          material_name: n.name,
          item_ref: n.item_ref,
          needed: n.qty,
          inventory_qty: inv,
          warehouse_qty: wh,
          contributed_qty: contrib,
          remaining,
          progress_pct,
          unit: n.unit,
        };
      })
      .sort((a, b) => {
        if (a.remaining !== b.remaining) return b.remaining - a.remaining;
        return a.material_name.localeCompare(b.material_name);
      });

    // Members
    const { data: members } = await supabaseAdmin
      .from("farm_list_members")
      .select("user_id, role, created_at, status")
      .eq("list_id", data.id);
    const memberUserIds = (members ?? []).map((m) => m.user_id as string);
    const { data: memberProfiles } = memberUserIds.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, callsign, display_name")
          .in("id", memberUserIds)
      : { data: [] };
    const profileMap = new Map(
      (memberProfiles ?? []).map((p) => [p.id as string, p]),
    );
    const memberRows: FarmListMemberRow[] = (members ?? []).map((m) => {
      const p = profileMap.get(m.user_id as string);
      return {
        user_id: m.user_id as string,
        role: m.role as "viewer" | "editor",
        status: (((m as { status?: string }).status ?? "accepted") === "pending"
          ? "pending"
          : "accepted") as "pending" | "accepted",
        callsign: (p?.callsign as string | undefined) ?? null,
        display_name: (p?.display_name as string | undefined) ?? null,
        created_at: m.created_at as string,
      };
    });

    // Owner summary fields
    const { data: ownerProfile } = await supabaseAdmin
      .from("profiles")
      .select("callsign")
      .eq("id", list.owner_id as string)
      .maybeSingle();

    const totalNeed = materials.reduce((s, m) => s + m.needed, 0);
    const totalProgress = materials.reduce(
      (s, m) => s + Math.min(m.needed, m.inventory_qty + m.warehouse_qty + m.contributed_qty),
      0,
    );

    const summary: FarmListSummary = {
      id: list.id as string,
      name: list.name as string,
      description: (list.description as string | null) ?? null,
      status: list.status as FarmListSummary["status"],
      include_personal_inventory: list.include_personal_inventory as boolean,
      include_org_warehouse: list.include_org_warehouse as boolean,
      owner_id: list.owner_id as string,
      owner_callsign: (ownerProfile?.callsign as string | null) ?? null,
      is_owner: isOwner,
      can_manage: canManage,
      member_role: role,
      blueprint_count: bps.length,
      material_count: materials.length,
      progress_pct: totalNeed > 0 ? Math.round((totalProgress / totalNeed) * 100) : 0,
      created_at: list.created_at as string,
      updated_at: list.updated_at as string,
    };

    return {
      list: summary,
      blueprints: bps,
      members: memberRows,
      contributions,
      materials,
      can_edit: canEdit,
      invite_token: isOwner ? ((list.invite_token as string | null) ?? null) : null,
      invite_role: ((list.invite_role as "viewer" | "editor" | undefined) ?? "editor"),
    };
  });

/* ------------------------------------------------------------ */
/* Mutations: list lifecycle                                    */
/* ------------------------------------------------------------ */

export const createFarmList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().min(1).max(120),
        description: z.string().max(2000).optional(),
        include_personal_inventory: z.boolean().default(true),
        include_org_warehouse: z.boolean().default(true),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const uid = context.userId;
    const { data: org } = await supabaseAdmin
      .from("org_members")
      .select("org_id")
      .eq("user_id", uid)
      .limit(1)
      .maybeSingle();
    const { data: row, error } = await supabaseAdmin
      .from("farm_lists")
      .insert({
        owner_id: uid,
        org_id: org?.org_id ?? null,
        name: data.name,
        description: data.description ?? null,
        include_personal_inventory: data.include_personal_inventory,
        include_org_warehouse: data.include_org_warehouse,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateFarmList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120).optional(),
        description: z.string().max(2000).nullable().optional(),
        status: z.enum(["active", "completed", "archived"]).optional(),
        include_personal_inventory: z.boolean().optional(),
        include_org_warehouse: z.boolean().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canManage } = await loadAccess(data.id, context.userId);
    if (!canManage) throw new Error("Nur der Ersteller oder ein Admin darf die Liste ändern");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const patch: any = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.description !== undefined) patch.description = data.description;
    if (data.status !== undefined) patch.status = data.status;
    if (data.include_personal_inventory !== undefined)
      patch.include_personal_inventory = data.include_personal_inventory;
    if (data.include_org_warehouse !== undefined)
      patch.include_org_warehouse = data.include_org_warehouse;
    const { error } = await supabaseAdmin.from("farm_lists").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteFarmList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { canManage } = await loadAccess(data.id, context.userId);
    if (!canManage) throw new Error("Nur der Ersteller oder ein Admin darf löschen");
    const { error } = await supabaseAdmin.from("farm_lists").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------ */
/* Blueprints in a list                                         */
/* ------------------------------------------------------------ */

export const addBlueprintToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        blueprint_id: z.string().uuid(),
        quantity: z.number().positive().max(10000).default(1),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canEdit } = await loadAccess(data.list_id, context.userId);
    if (!canEdit) throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin
      .from("farm_list_blueprints")
      .upsert(
        {
          list_id: data.list_id,
          blueprint_id: data.blueprint_id,
          quantity: data.quantity,
        },
        { onConflict: "list_id,blueprint_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateBlueprintQty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        quantity: z.number().positive().max(10000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("farm_list_blueprints")
      .select("list_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Eintrag nicht gefunden");
    const { canEdit } = await loadAccess(row.list_id as string, context.userId);
    if (!canEdit) throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin
      .from("farm_list_blueprints")
      .update({ quantity: data.quantity })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Mehrere Blueprints auf einmal hinzufügen (Mehrfachauswahl im Dialog). */
export const addBlueprintsToList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        items: z
          .array(
            z.object({
              blueprint_id: z.string().uuid(),
              quantity: z.number().positive().max(10000).default(1),
            }),
          )
          .min(1)
          .max(100),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canEdit } = await loadAccess(data.list_id, context.userId);
    if (!canEdit) throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin.from("farm_list_blueprints").upsert(
      data.items.map((it) => ({
        list_id: data.list_id,
        blueprint_id: it.blueprint_id,
        quantity: it.quantity,
      })),
      { onConflict: "list_id,blueprint_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, count: data.items.length };
  });

export const removeBlueprintFromList = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("farm_list_blueprints")
      .select("list_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    const { canEdit } = await loadAccess(row.list_id as string, context.userId);
    if (!canEdit) throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin.from("farm_list_blueprints").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------ */
/* Contributions                                                */
/* ------------------------------------------------------------ */

export const addContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        material_ref: z.string().min(1).max(200),
        material_name: z.string().min(1).max(200),
        qty: z.number().positive().max(10_000_000),
        quality: z.number().int().min(0).max(1000).nullable().optional(),
        note: z.string().max(500).nullable().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canEdit } = await loadAccess(data.list_id, context.userId);
    if (!canEdit) throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin.from("farm_list_contributions").insert({
      list_id: data.list_id,
      user_id: context.userId,
      material_ref: data.material_ref,
      material_name: data.material_name,
      qty: data.qty,
      quality: data.quality ?? null,
      note: data.note ?? null,
      source: "manual",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteContribution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("farm_list_contributions")
      .select("list_id, user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    const { list } = await loadAccess(row.list_id as string, context.userId);
    if (row.user_id !== context.userId && list.owner_id !== context.userId)
      throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin
      .from("farm_list_contributions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Ein abgehaktes Material wieder freischalten: löscht die eingetragenen
 * Beiträge für dieses Material. Ersteller/Admin dürfen alle Beiträge
 * zurücksetzen, Mitglieder nur ihre eigenen.
 */
export const resetMaterialProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        material_ref: z.string().min(1).max(200),
        scope: z.enum(["mine", "all"]).default("all"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { canEdit, canManage } = await loadAccess(data.list_id, context.userId);
    if (!canEdit) throw new Error("Keine Berechtigung");
    const scope = data.scope === "all" && canManage ? "all" : "mine";
    let qb = supabaseAdmin
      .from("farm_list_contributions")
      .delete()
      .eq("list_id", data.list_id)
      .eq("material_ref", data.material_ref);
    if (scope === "mine") qb = qb.eq("user_id", context.userId);
    const { error } = await qb;
    if (error) throw new Error(error.message);
    return { ok: true, scope };
  });

/* ------------------------------------------------------------ */
/* Members                                                      */
/* ------------------------------------------------------------ */

export const inviteFarmListMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        callsign: z.string().min(1).max(60),
        role: z.enum(["viewer", "editor"]).default("editor"),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { list } = await loadAccess(data.list_id, context.userId);
    if (list.owner_id !== context.userId) throw new Error("Nur der Ersteller darf einladen");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign")
      .ilike("callsign", data.callsign)
      .maybeSingle();
    if (!profile) throw new Error(`Nutzer "${data.callsign}" nicht gefunden`);
    if (profile.id === context.userId)
      throw new Error("Du bist bereits Ersteller der Liste");

    // Nur innerhalb der eigenen Orga teilen.
    const { data: sharesOrg } = await supabaseAdmin.rpc("shares_org_with", {
      _a: context.userId,
      _b: profile.id as string,
    });
    if (!sharesOrg)
      throw new Error(`"${data.callsign}" ist in keiner gemeinsamen Orga mit dir`);

    const { data: existing } = await supabaseAdmin
      .from("farm_list_members")
      .select("status")
      .eq("list_id", data.list_id)
      .eq("user_id", profile.id as string)
      .maybeSingle();
    if (((existing as { status?: string } | null)?.status ?? null) === "accepted")
      throw new Error(`"${data.callsign}" ist bereits Mitglied`);

    const { error } = await supabaseAdmin
      .from("farm_list_members")
      .upsert(
        {
          list_id: data.list_id,
          user_id: profile.id,
          role: data.role,
          status: "pending",
          invited_by: context.userId,
        },
        { onConflict: "list_id,user_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, callsign: profile.callsign as string };
  });

/** Eingeladene Person nimmt die Einladung an oder lehnt sie ab. */
export const respondFarmListInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        accept: z.boolean(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { data: row } = await supabaseAdmin
      .from("farm_list_members")
      .select("status")
      .eq("list_id", data.list_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!row) throw new Error("Keine Einladung gefunden");
    if (((row as { status?: string }).status ?? "accepted") !== "pending")
      throw new Error("Einladung ist nicht mehr offen");

    if (!data.accept) {
      const { error } = await supabaseAdmin
        .from("farm_list_members")
        .delete()
        .eq("list_id", data.list_id)
        .eq("user_id", context.userId);
      if (error) throw new Error(error.message);
      return { ok: true, joined: false };
    }

    const { error } = await supabaseAdmin
      .from("farm_list_members")
      .update({ status: "accepted" })
      .eq("list_id", data.list_id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true, joined: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        user_id: z.string().uuid(),
        role: z.enum(["viewer", "editor"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { list } = await loadAccess(data.list_id, context.userId);
    if (list.owner_id !== context.userId) throw new Error("Nur der Ersteller");
    const { error } = await supabaseAdmin
      .from("farm_list_members")
      .update({ role: data.role })
      .eq("list_id", data.list_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeFarmListMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        user_id: z.string().uuid(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { list } = await loadAccess(data.list_id, context.userId);
    if (list.owner_id !== context.userId && data.user_id !== context.userId)
      throw new Error("Keine Berechtigung");
    const { error } = await supabaseAdmin
      .from("farm_list_members")
      .delete()
      .eq("list_id", data.list_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ------------------------------------------------------------ */
/* Blueprint search (for "add blueprint" dialog)                */
/* ------------------------------------------------------------ */

export const searchBlueprintsForList = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ search: z.string().max(120).optional() }).parse(i ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { coOrgMemberIds } = await import("./org-membership.server");
    const allowed = await coOrgMemberIds(supabaseAdmin, context.userId);
    let q = supabaseAdmin
      .from("blueprints")
      .select("id, item_name, item_ref, output_qty, owner_id, visibility, source")
      .order("item_name");
    q = q.or(
      `owner_id.eq.${context.userId},and(visibility.eq.org,owner_id.in.(${allowed.join(",")})),source.neq.manual`,
    );
    if (data.search) q = q.ilike("item_name", `%${data.search}%`);
    const { data: rows, error } = await q.limit(50);
    if (error) throw new Error(error.message);
    return {
      blueprints: (rows ?? []).map((r) => ({
        id: r.id as string,
        name: r.item_name as string,
        item_ref: (r.item_ref as string | null) ?? null,
        output_qty: Number(r.output_qty ?? 1),
      })),
    };
  });

/* ------------------------------------------------------------ */
/* Invite token (shareable link)                                */
/* ------------------------------------------------------------ */

function genToken() {
  // 22-char url-safe token from random uuid + random suffix
  const a = crypto.randomUUID().replace(/-/g, "");
  const b = crypto.randomUUID().replace(/-/g, "");
  return (a + b).slice(0, 32);
}

export const rotateFarmListInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        role: z.enum(["viewer", "editor"]).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { list } = await loadAccess(data.list_id, context.userId);
    if (list.owner_id !== context.userId) throw new Error("Nur der Ersteller darf den Link verwalten");
    const token = genToken();
    const { error } = await supabaseAdmin
      .from("farm_lists")
      .update({ invite_token: token, ...(data.role ? { invite_role: data.role } : {}) })
      .eq("id", data.list_id);
    if (error) throw new Error(error.message);
    return { token, role: (data.role ?? (list.invite_role as "viewer" | "editor")) };
  });

export const disableFarmListInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ list_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { list } = await loadAccess(data.list_id, context.userId);
    if (list.owner_id !== context.userId) throw new Error("Nur der Ersteller");
    const { error } = await supabaseAdmin
      .from("farm_lists")
      .update({ invite_token: null })
      .eq("id", data.list_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setFarmListInviteRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        list_id: z.string().uuid(),
        role: z.enum(["viewer", "editor"]),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { list } = await loadAccess(data.list_id, context.userId);
    if (list.owner_id !== context.userId) throw new Error("Nur der Ersteller");
    const { error } = await supabaseAdmin
      .from("farm_lists")
      .update({ invite_role: data.role })
      .eq("id", data.list_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const previewFarmListInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ token: z.string().min(8).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: list, error } = await supabaseAdmin
      .from("farm_lists")
      .select("id, name, description, owner_id, invite_role")
      .eq("invite_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!list) throw new Error("Einladung ist ungültig oder wurde deaktiviert");
    const { data: owner } = await supabaseAdmin
      .from("profiles")
      .select("callsign")
      .eq("id", list.owner_id as string)
      .maybeSingle();
    const isOwner = (list.owner_id as string) === context.userId;
    let alreadyMember = false;
    if (!isOwner) {
      const { data: m } = await supabaseAdmin
        .from("farm_list_members")
        .select("user_id")
        .eq("list_id", list.id as string)
        .eq("user_id", context.userId)
        .maybeSingle();
      alreadyMember = !!m;
    }
    return {
      id: list.id as string,
      name: list.name as string,
      description: (list.description as string | null) ?? null,
      owner_callsign: (owner?.callsign as string | null) ?? null,
      role: (list.invite_role as "viewer" | "editor") ?? "editor",
      already_member: alreadyMember,
      is_owner: isOwner,
    };
  });

export const joinFarmListByInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ token: z.string().min(8).max(64) }).parse(i))
  .handler(async ({ data, context }) => {
    const { data: list, error } = await supabaseAdmin
      .from("farm_lists")
      .select("id, owner_id, invite_role")
      .eq("invite_token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!list) throw new Error("Einladung ist ungültig oder wurde deaktiviert");
    if ((list.owner_id as string) === context.userId) {
      return { id: list.id as string, already: true };
    }
    const role = (list.invite_role as "viewer" | "editor") ?? "editor";
    const { error: upErr } = await supabaseAdmin
      .from("farm_list_members")
      .upsert(
        { list_id: list.id as string, user_id: context.userId, role, status: "accepted" },
        { onConflict: "list_id,user_id" },
      );
    if (upErr) throw new Error(upErr.message);
    return { id: list.id as string, already: false };
  });