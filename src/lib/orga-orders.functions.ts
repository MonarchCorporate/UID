import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasPerm, mergePerms, type OrgPerm } from "@/lib/org-perms";
import type { Json } from "@/integrations/supabase/types";

const MAX_DEPTH = 6;

export type OrderAnalysisRow = {
  kind: "component" | "material" | "unknown";
  item_ref: string | null;
  item_name: string;
  required: number;
  available: number;
  missing: number;
  best_available_quality: number | null;
  requester_will_supply: boolean;
  depth: number;
  from_blueprint_name?: string | null;
};

export type OrderAnalysis = {
  target: {
    item_ref: string | null;
    item_name: string;
    qty: number;
    on_hand_available: number;
    on_hand_locked: number;
    blueprint_id: string | null;
    blueprint_output_qty: number | null;
    craft_runs_needed: number | null;
  };
  rows: OrderAnalysisRow[];
  computed_min_quality: number | null;
  can_be_crafted: boolean;
  resolve_deep: boolean;
  existing_open_order: {
    id: string;
    status: "pending" | "in_progress";
    requested_by_callsign: string | null;
    created_at: string;
    qty: number;
  } | null;
};

export type OrderRow = {
  id: string;
  org_id: string;
  requested_by: string;
  requested_by_callsign: string | null;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
  qty: number;
  notes: string | null;
  blueprint_id: string | null;
  resolve_deep: boolean;
  analysis_snapshot: OrderAnalysisRow[];
  computed_min_quality: number | null;
  status: "pending" | "in_progress" | "fulfilled" | "rejected" | "cancelled";
  decided_by: string | null;
  decided_by_callsign: string | null;
  decided_at: string | null;
  decision_note: string | null;
  created_at: string;
  updated_at: string;
  allocations: OrderAllocationRow[];
};

export type OrderAllocationRow = {
  reservation_id: string;
  warehouse_id: string | null;
  item_ref: string | null;
  item_name: string;
  qty: number;
  quality: number | null;
  held_by_callsign: string | null;
  location_name: string | null;
};

async function assertMember(userId: string, orgId: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data } = await supabaseAdmin
    .from("org_members")
    .select("role, permissions, org_custom_roles:custom_role_id(permissions)")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Kein Mitglied dieser Orga.");
  const customPerms = (data.org_custom_roles as { permissions: string[] } | null)
    ?.permissions ?? [];
  return {
    role: data.role as string,
    permissions: mergePerms(data.permissions as string[] | null, customPerms),
  };
}

function isReviewer(role: string, permissions: OrgPerm[]) {
  return hasPerm(role, permissions, "orders.review");
}

type WhRow = {
  qty: number;
  quality: number | null;
  locked: boolean;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
};

function summarizeStock(rows: WhRow[]) {
  let available = 0;
  let locked = 0;
  let bestQ: number | null = null;
  for (const r of rows) {
    const q = Number(r.qty ?? 0);
    if (r.locked) locked += q;
    else {
      available += q;
      if (q > 0 && r.quality != null) {
        if (bestQ == null || Number(r.quality) > bestQ) bestQ = Number(r.quality);
      }
    }
  }
  return { available, locked, bestQ };
}

type StockIndex = {
  byRef: Map<string, WhRow[]>;
  byName: Map<string, WhRow[]>;
  reservedByKey: Map<string, number>;
};

function stockFor(idx: StockIndex, ref: string | null, name: string): WhRow[] {
  if (ref && idx.byRef.has(ref)) return idx.byRef.get(ref)!;
  const key = name.trim().toLowerCase();
  return idx.byName.get(key) ?? [];
}

function reservedFor(
  idx: StockIndex,
  ref: string | null,
  name: string,
): number {
  if (ref) {
    const v = idx.reservedByKey.get(ref);
    if (v != null) return v;
  }
  return idx.reservedByKey.get(`n:${name.trim().toLowerCase()}`) ?? 0;
}

async function loadStock(orgId: string): Promise<StockIndex> {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data } = await supabaseAdmin
    .from("org_warehouse")
    .select("item_ref, item_name, item_kind, qty, quality, locked")
    .eq("org_id", orgId);
  const byRef = new Map<string, WhRow[]>();
  const byName = new Map<string, WhRow[]>();
  for (const r of data ?? []) {
    const row: WhRow = {
      qty: Number(r.qty ?? 0),
      quality: r.quality == null ? null : Number(r.quality),
      locked: !!r.locked,
      item_ref: (r.item_ref as string) ?? null,
      item_name: r.item_name as string,
      item_kind: (r.item_kind as string) ?? null,
    };
    if (row.item_ref) {
      const arr = byRef.get(row.item_ref) ?? [];
      arr.push(row);
      byRef.set(row.item_ref, arr);
    }
    const nk = row.item_name.trim().toLowerCase();
    const arr2 = byName.get(nk) ?? [];
    arr2.push(row);
    byName.set(nk, arr2);
  }
  const { data: resRows } = await supabaseAdmin
    .from("orga_order_reservations")
    .select("item_ref, item_name, qty")
    .eq("org_id", orgId);
  const reservedByKey = new Map<string, number>();
  for (const r of resRows ?? []) {
    const ref = (r.item_ref as string) ?? null;
    const name = (r.item_name as string) ?? "";
    const qty = Number(r.qty ?? 0);
    const key = ref ?? `n:${name.trim().toLowerCase()}`;
    reservedByKey.set(key, (reservedByKey.get(key) ?? 0) + qty);
  }
  return { byRef, byName, reservedByKey };
}

type BpRow = {
  id: string;
  item_name: string;
  item_ref: string | null;
  output_qty: number;
};
type BpComp = {
  item_ref: string | null;
  item_name: string;
  qty: number;
  kind: string | null;
};

async function findBlueprintFor(
  userId: string,
  itemRef: string | null,
  itemName: string,
): Promise<{ bp: BpRow; comps: BpComp[] } | null> {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { coOrgMemberIds } = await import("./org-membership.server");
  const allowedOwners = await coOrgMemberIds(supabaseAdmin, userId);

  // 1) Match by item_ref (preferred), else by name (case-insensitive).
  // If item_ref yields nothing visible, fall back to a name lookup — the
  // warehouse row and the blueprint may reference different IDs for the
  // same item.
  async function query(byRef: boolean) {
    let q = supabaseAdmin
      .from("blueprints")
      .select(
        "id, item_name, item_ref, output_qty, owner_id, visibility, source, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(20);
    if (byRef && itemRef) q = q.eq("item_ref", itemRef);
    else q = q.ilike("item_name", itemName);
    const { data } = await q;
    return data ?? [];
  }
  const isVisible = (r: { owner_id: unknown; source: unknown; visibility: unknown }) => {
    if (r.owner_id === userId) return true;
    if (r.source !== "manual") return true;
    if (r.visibility === "org" && allowedOwners.includes(r.owner_id as string)) return true;
    return false;
  };
  let visible = (await query(true)).filter(isVisible);
  if (visible.length === 0 && itemRef) {
    visible = (await query(false)).filter(isVisible);
  }
  const pick = visible[0];
  if (!pick) return null;
  const { data: comps } = await supabaseAdmin
    .from("blueprint_components")
    .select("item_ref, item_name, qty, kind")
    .eq("blueprint_id", pick.id)
    .order("position");
  return {
    bp: {
      id: pick.id as string,
      item_name: pick.item_name as string,
      item_ref: (pick.item_ref as string) ?? null,
      output_qty: Number(pick.output_qty ?? 1) || 1,
    },
    comps: (comps ?? []).map((c) => ({
      item_ref: (c.item_ref as string) ?? null,
      item_name: c.item_name as string,
      qty: Number(c.qty ?? 0),
      kind: (c.kind as string) ?? null,
    })),
  };
}

function classifyKind(kind: string | null): OrderAnalysisRow["kind"] {
  if (!kind) return "unknown";
  const k = kind.toLowerCase();
  if (k.includes("component") || k.includes("komponente")) return "component";
  if (
    k.includes("material") ||
    k.includes("mineral") ||
    k.includes("ore") ||
    k.includes("rohstoff") ||
    k.includes("gas") ||
    k.includes("commodity")
  )
    return "material";
  return "unknown";
}

async function findConflictingOrder(
  orgId: string,
  itemRef: string | null,
  itemName: string,
): Promise<OrderAnalysis["existing_open_order"]> {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  let q = supabaseAdmin
    .from("orga_orders")
    .select("id, status, requested_by, qty, created_at, item_ref, item_name")
    .eq("org_id", orgId)
    .in("status", ["pending", "in_progress"]);
  if (itemRef) q = q.or(`item_ref.eq.${itemRef},item_name.ilike.${itemName}`);
  else q = q.ilike("item_name", itemName);
  const { data } = await q.order("created_at", { ascending: true }).limit(1);
  const row = data?.[0];
  if (!row) return null;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("callsign")
    .eq("id", row.requested_by as string)
    .maybeSingle();
  return {
    id: row.id as string,
    status: row.status as "pending" | "in_progress",
    requested_by_callsign: (profile?.callsign as string) ?? null,
    created_at: row.created_at as string,
    qty: Number(row.qty ?? 0),
  };
}

async function analyze(
  userId: string,
  orgId: string,
  input: {
    item_ref: string | null;
    item_name: string;
    qty: number;
    resolve_deep: boolean;
  },
): Promise<OrderAnalysis> {
  const stock = await loadStock(orgId);
  const existing_open_order = await findConflictingOrder(
    orgId,
    input.item_ref,
    input.item_name,
  );

  // Target on-hand
  const targetStock = stockFor(stock, input.item_ref, input.item_name);
  const targetSum = summarizeStock(targetStock);
  const targetReserved = reservedFor(stock, input.item_ref, input.item_name);
  const targetAvailable = Math.max(0, targetSum.available - targetReserved);

  const bpRes = await findBlueprintFor(userId, input.item_ref, input.item_name);
  const target: OrderAnalysis["target"] = {
    item_ref: input.item_ref,
    item_name: input.item_name,
    qty: input.qty,
    on_hand_available: targetAvailable,
    on_hand_locked: targetSum.locked,
    blueprint_id: bpRes?.bp.id ?? null,
    blueprint_output_qty: bpRes?.bp.output_qty ?? null,
    craft_runs_needed: null,
  };

  const rows: OrderAnalysisRow[] = [];
  const minQualities: number[] = [];
  let canCraft = true;

  if (!bpRes) {
    // No blueprint. Nothing to break down.
    return {
      target,
      rows: [],
      computed_min_quality: null,
      can_be_crafted: false,
      resolve_deep: input.resolve_deep,
      existing_open_order,
    };
  }

  const needFromTarget = Math.max(0, input.qty - targetAvailable);
  const runs = needFromTarget > 0
    ? Math.ceil(needFromTarget / (bpRes.bp.output_qty || 1))
    : 0;
  target.craft_runs_needed = runs;

  // Aggregate demand per (ref|name)
  type Need = {
    key: string;
    item_ref: string | null;
    item_name: string;
    kind: OrderAnalysisRow["kind"];
    required: number;
    depth: number;
    from: string | null;
  };
  const demand: Need[] = [];
  const seen = new Set<string>();
  const keyOf = (ref: string | null, name: string) =>
    (ref ?? `n:${name.trim().toLowerCase()}`);

  async function pushBreakdown(
    comps: BpComp[],
    multiplier: number,
    depth: number,
    fromName: string,
  ) {
    for (const c of comps) {
      const kind = classifyKind(c.kind);
      const req = c.qty * multiplier;
      const key = keyOf(c.item_ref, c.item_name);

      if (
        input.resolve_deep &&
        kind === "component" &&
        depth < MAX_DEPTH &&
        !seen.has(key)
      ) {
        seen.add(key);
        // Compute how much of this component we still need after on-hand.
        const subStock = stockFor(stock, c.item_ref, c.item_name);
        const subSum = summarizeStock(subStock);
        const subReserved = reservedFor(stock, c.item_ref, c.item_name);
        const subAvail = Math.max(0, subSum.available - subReserved);
        const stillNeed = Math.max(0, req - subAvail);
        if (stillNeed > 0) {
          const subBp = await findBlueprintFor(
            userId,
            c.item_ref,
            c.item_name,
          );
          if (subBp) {
            const subRuns = Math.ceil(stillNeed / (subBp.bp.output_qty || 1));
            await pushBreakdown(subBp.comps, subRuns, depth + 1, c.item_name);
            // The component's own on-hand still counts — add a row for what we already have.
            if (subAvail > 0) {
              demand.push({
                key,
                item_ref: c.item_ref,
                item_name: c.item_name,
                kind,
                required: Math.min(req, subAvail),
                depth,
                from: fromName,
              });
            }
            continue;
          }
        }
      }

      demand.push({
        key,
        item_ref: c.item_ref,
        item_name: c.item_name,
        kind,
        required: req,
        depth,
        from: depth > 0 ? fromName : null,
      });
    }
  }

  if (runs > 0) {
    await pushBreakdown(bpRes.comps, runs, 0, bpRes.bp.item_name);
  }

  // Merge by key (sum required)
  const merged = new Map<string, Need>();
  for (const n of demand) {
    const prev = merged.get(n.key);
    if (prev) {
      prev.required += n.required;
      // Keep shallowest depth for display grouping.
      if (n.depth < prev.depth) {
        prev.depth = n.depth;
        prev.from = n.from;
      }
    } else {
      merged.set(n.key, { ...n });
    }
  }

  for (const n of merged.values()) {
    const st = stockFor(stock, n.item_ref, n.item_name);
    const s = summarizeStock(st);
    const reserved = reservedFor(stock, n.item_ref, n.item_name);
    const avail = Math.max(0, s.available - reserved);
    const missing = Math.max(0, n.required - avail);
    rows.push({
      kind: n.kind,
      item_ref: n.item_ref,
      item_name: n.item_name,
      required: n.required,
      available: avail,
      missing,
      best_available_quality: s.bestQ,
      requester_will_supply: false,
      depth: n.depth,
      from_blueprint_name: n.from,
    });
    if (missing > 0) canCraft = false;
    else if (s.bestQ != null) minQualities.push(s.bestQ);
  }

  // Sort: missing first, then components before materials, then name.
  rows.sort((a, b) => {
    if ((a.missing > 0) !== (b.missing > 0)) return a.missing > 0 ? -1 : 1;
    if (a.kind !== b.kind) return a.kind === "component" ? -1 : 1;
    return a.item_name.localeCompare(b.item_name);
  });

  const computed_min_quality =
    canCraft && minQualities.length > 0 ? Math.min(...minQualities) : null;

  return {
    target,
    rows,
    computed_min_quality,
    can_be_crafted: canCraft && runs > 0,
    resolve_deep: input.resolve_deep,
    existing_open_order,
  };
}

/** Live-analyze availability + breakdown for a prospective order. */
export const analyzeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        item_ref: z.string().max(200).nullable().optional(),
        item_name: z.string().trim().min(1).max(200),
        qty: z.number().positive().max(1_000_000),
        resolve_deep: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.org_id);
    return analyze(context.userId, data.org_id, {
      item_ref: data.item_ref ?? null,
      item_name: data.item_name,
      qty: data.qty,
      resolve_deep: !!data.resolve_deep,
    });
  });

/** Create a new order with snapshot analysis. */
export const createOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        item_ref: z.string().max(200).nullable().optional(),
        item_name: z.string().trim().min(1).max(200),
        item_kind: z.string().max(60).nullable().optional(),
        qty: z.number().positive().max(1_000_000),
        notes: z.string().max(2000).nullable().optional(),
        resolve_deep: z.boolean().default(false),
        will_supply_keys: z.array(z.string()).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.org_id);
    const analysis = await analyze(context.userId, data.org_id, {
      item_ref: data.item_ref ?? null,
      item_name: data.item_name,
      qty: data.qty,
      resolve_deep: !!data.resolve_deep,
    });
    const willSupply = new Set(data.will_supply_keys);
    const snapshot: OrderAnalysisRow[] = analysis.rows.map((r) => ({
      ...r,
      requester_will_supply: willSupply.has(
        r.item_ref ?? `n:${r.item_name.trim().toLowerCase()}`,
      ),
    }));
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: inserted, error } = await supabaseAdmin
      .from("orga_orders")
      .insert({
        org_id: data.org_id,
        requested_by: context.userId,
        item_ref: data.item_ref ?? null,
        item_name: data.item_name,
        item_kind: data.item_kind ?? null,
        qty: data.qty,
        notes: data.notes ?? null,
        blueprint_id: analysis.target.blueprint_id,
        resolve_deep: !!data.resolve_deep,
        analysis_snapshot: snapshot as unknown as Json,
        computed_min_quality: analysis.computed_min_quality,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const orderId = inserted!.id as string;

    // FIFO-allocate reservations to specific warehouse positions (cheapest
    // quality first). Existing reservations for the same warehouse row are
    // subtracted so parallel orders don't double-book the same stock.
    const reservedByWh = new Map<string, number>();
    {
      const { data: existing } = await supabaseAdmin
        .from("orga_order_reservations")
        .select("warehouse_id, qty")
        .eq("org_id", data.org_id)
        .not("warehouse_id", "is", null);
      for (const r of existing ?? []) {
        const id = r.warehouse_id as string;
        reservedByWh.set(id, (reservedByWh.get(id) ?? 0) + Number(r.qty ?? 0));
      }
    }

    type ReservationEntry = {
      order_id: string;
      org_id: string;
      warehouse_id: string | null;
      item_ref: string | null;
      item_name: string;
      item_kind: string | null;
      qty: number;
    };
    const reservations: ReservationEntry[] = [];

    async function allocate(
      itemRef: string | null,
      itemName: string,
      itemKind: string | null,
      amount: number,
    ) {
      if (amount <= 0) return;
      let q = supabaseAdmin
        .from("org_warehouse")
        .select("id, qty, quality, deposited_at")
        .eq("org_id", data.org_id)
        .eq("locked", false)
        .gt("qty", 0)
        .order("quality", { ascending: true, nullsFirst: true })
        .order("deposited_at", { ascending: true });
      if (itemRef) q = q.eq("item_ref", itemRef);
      else q = q.ilike("item_name", itemName);
      const { data: whRows } = await q;
      let remaining = amount;
      for (const w of whRows ?? []) {
        if (remaining <= 0) break;
        const id = w.id as string;
        const avail = Math.max(
          0,
          Number(w.qty ?? 0) - (reservedByWh.get(id) ?? 0),
        );
        if (avail <= 0) continue;
        const take = Math.min(avail, remaining);
        reservations.push({
          order_id: orderId,
          org_id: data.org_id,
          warehouse_id: id,
          item_ref: itemRef,
          item_name: itemName,
          item_kind: itemKind,
          qty: take,
        });
        reservedByWh.set(id, (reservedByWh.get(id) ?? 0) + take);
        remaining -= take;
      }
      // If we couldn't cover the full amount from concrete positions, park
      // the remainder as a positionless reservation so ledger totals stay
      // consistent (rare — analyze already capped by available stock).
      if (remaining > 0) {
        reservations.push({
          order_id: orderId,
          org_id: data.org_id,
          warehouse_id: null,
          item_ref: itemRef,
          item_name: itemName,
          item_kind: itemKind,
          qty: remaining,
        });
      }
    }

    const targetUse = Math.min(
      Number(data.qty),
      Number(analysis.target.on_hand_available ?? 0),
    );
    await allocate(
      data.item_ref ?? null,
      data.item_name,
      data.item_kind ?? null,
      targetUse,
    );

    for (const row of snapshot) {
      if (row.requester_will_supply) continue;
      const reserveQty = Math.max(
        0,
        Math.min(Number(row.required), Number(row.available)),
      );
      if (reserveQty <= 0) continue;
      await allocate(
        row.item_ref,
        row.item_name,
        row.kind === "unknown" ? null : row.kind,
        reserveQty,
      );
    }

    if (reservations.length > 0) {
      const { error: resErr } = await supabaseAdmin
        .from("orga_order_reservations")
        .insert(reservations);
      if (resErr) {
        await supabaseAdmin.from("orga_orders").delete().eq("id", orderId);
        throw new Error(`Reservierung fehlgeschlagen: ${resErr.message}`);
      }
    }

    return { id: orderId };
  });

/** List orders for an org (all members can see all orders). */
export const listOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        mine: z.boolean().default(false),
        status: z
          .enum(["pending", "in_progress", "fulfilled", "rejected", "cancelled"])
          .nullable()
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    let q = supabaseAdmin
      .from("orga_orders")
      .select("*")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    // Only members with orders.view can see other people's orders; otherwise
    // restrict to their own.
    if (data.mine || !hasPerm(role, permissions, "orders.view")) {
      q = q.eq("requested_by", context.userId);
    }
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    const ids = new Set<string>();
    for (const r of rows ?? []) {
      if (r.requested_by) ids.add(r.requested_by as string);
      if (r.decided_by) ids.add(r.decided_by as string);
    }
    const idList = Array.from(ids);
    const { data: profiles } = idList.length
      ? await supabaseAdmin
          .from("profiles")
          .select("id, callsign")
          .in("id", idList)
      : { data: [] as { id: string; callsign: string }[] };
    const cs = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id as string, p.callsign as string]),
    );

    // Fetch reservations (allocations) for these orders together with the
    // referenced warehouse position so managers see holder + location.
    const orderIds = (rows ?? []).map((r) => r.id as string);
    const allocByOrder = new Map<string, OrderAllocationRow[]>();
    if (orderIds.length > 0) {
      const { data: resRows } = await supabaseAdmin
        .from("orga_order_reservations")
        .select("id, order_id, warehouse_id, item_ref, item_name, qty")
        .in("order_id", orderIds);
      const whIds = Array.from(
        new Set(
          (resRows ?? [])
            .map((r) => r.warehouse_id as string | null)
            .filter((v): v is string => !!v),
        ),
      );
      const whMap = new Map<string, {
        quality: number | null;
        held_by: string | null;
        location_id: string | null;
        location_label: string | null;
      }>();
      if (whIds.length > 0) {
        const { data: whRows } = await supabaseAdmin
          .from("org_warehouse")
          .select("id, quality, held_by, location_id, location_label")
          .in("id", whIds);
        for (const w of whRows ?? [])
          whMap.set(w.id as string, {
            quality: w.quality == null ? null : Number(w.quality),
            held_by: (w.held_by as string) ?? null,
            location_id: (w.location_id as string) ?? null,
            location_label: (w.location_label as string) ?? null,
          });
      }
      const holderIds = Array.from(
        new Set(
          Array.from(whMap.values())
            .map((w) => w.held_by)
            .filter((v): v is string => !!v),
        ),
      );
      if (holderIds.length > 0) {
        const { data: hp } = await supabaseAdmin
          .from("profiles")
          .select("id, callsign")
          .in("id", holderIds);
        for (const p of hp ?? [])
          cs.set(p.id as string, p.callsign as string);
      }
      const locIds = Array.from(
        new Set(
          Array.from(whMap.values())
            .map((w) => w.location_id)
            .filter((v): v is string => !!v),
        ),
      );
      const locMap = new Map<string, string>();
      if (locIds.length > 0) {
        const { data: locs } = await supabaseAdmin
          .from("inventory_locations")
          .select("id, name")
          .in("id", locIds);
        for (const l of locs ?? [])
          locMap.set(l.id as string, l.name as string);
      }
      for (const r of resRows ?? []) {
        const wh = r.warehouse_id ? whMap.get(r.warehouse_id as string) : null;
        const locName = wh?.location_id
          ? locMap.get(wh.location_id) ?? wh.location_label ?? null
          : wh?.location_label ?? null;
        const arr = allocByOrder.get(r.order_id as string) ?? [];
        arr.push({
          reservation_id: r.id as string,
          warehouse_id: (r.warehouse_id as string) ?? null,
          item_ref: (r.item_ref as string) ?? null,
          item_name: r.item_name as string,
          qty: Number(r.qty ?? 0),
          quality: wh?.quality ?? null,
          held_by_callsign: wh?.held_by ? cs.get(wh.held_by) ?? null : null,
          location_name: locName,
        });
        allocByOrder.set(r.order_id as string, arr);
      }
    }

    const orders: OrderRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      requested_by: r.requested_by as string,
      requested_by_callsign: cs.get(r.requested_by as string) ?? null,
      item_ref: (r.item_ref as string) ?? null,
      item_name: r.item_name as string,
      item_kind: (r.item_kind as string) ?? null,
      qty: Number(r.qty ?? 0),
      notes: (r.notes as string) ?? null,
      blueprint_id: (r.blueprint_id as string) ?? null,
      resolve_deep: !!r.resolve_deep,
      analysis_snapshot:
        (r.analysis_snapshot as unknown as OrderAnalysisRow[]) ?? [],
      computed_min_quality:
        r.computed_min_quality == null ? null : Number(r.computed_min_quality),
      status: r.status as OrderRow["status"],
      decided_by: (r.decided_by as string) ?? null,
      decided_by_callsign: r.decided_by
        ? cs.get(r.decided_by as string) ?? null
        : null,
      decided_at: (r.decided_at as string) ?? null,
      decision_note: (r.decision_note as string) ?? null,
      created_at: r.created_at as string,
      updated_at: r.updated_at as string,
      allocations: allocByOrder.get(r.id as string) ?? [],
    }));
    return { orders };
  });

/** QM decision — approve/reject/in-progress/fulfilled. */
export const updateOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        order_id: z.string().uuid(),
        status: z.enum(["in_progress", "fulfilled", "rejected"]),
        note: z.string().max(1000).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: ord } = await supabaseAdmin
      .from("orga_orders")
      .select(
        "id, org_id, status, requested_by, item_ref, item_name, item_kind, qty, computed_min_quality",
      )
      .eq("id", data.order_id)
      .maybeSingle();
    if (!ord) throw new Error("Bestellung nicht gefunden.");
    const { role, permissions } = await assertMember(context.userId, ord.org_id as string);
    if (!isReviewer(role, permissions))
      throw new Error("Keine Berechtigung, Bestellungen zu entscheiden.");
    if (ord.status === "cancelled" || ord.status === "fulfilled")
      throw new Error("Bestellung ist bereits abgeschlossen.");

    if (data.status === "fulfilled") {
      // Deduct reserved stock. Prefer the exact warehouse position that was
      // allocated at order time; if that position no longer covers it (or
      // the reservation is positionless), fall back to FIFO by cheapest
      // quality across matching rows.
      const { data: reservations } = await supabaseAdmin
        .from("orga_order_reservations")
        .select("id, warehouse_id, item_ref, item_name, qty")
        .eq("order_id", data.order_id);
      for (const r of reservations ?? []) {
        let remaining = Number(r.qty ?? 0);
        if (remaining <= 0) continue;
        const ref = (r.item_ref as string) ?? null;
        const name = r.item_name as string;
        const whId = (r.warehouse_id as string) ?? null;

        if (whId) {
          const { data: wh } = await supabaseAdmin
            .from("org_warehouse")
            .select("id, qty")
            .eq("id", whId)
            .maybeSingle();
          if (wh) {
            const have = Number(wh.qty ?? 0);
            const take = Math.min(have, remaining);
            if (take > 0) {
              const newQty = have - take;
              if (newQty <= 0) {
                await supabaseAdmin
                  .from("org_warehouse")
                  .delete()
                  .eq("id", wh.id as string);
              } else {
                await supabaseAdmin
                  .from("org_warehouse")
                  .update({ qty: newQty })
                  .eq("id", wh.id as string);
              }
              remaining -= take;
            }
          }
        }

        if (remaining > 0) {
          let whQ = supabaseAdmin
            .from("org_warehouse")
            .select("id, qty")
            .eq("org_id", ord.org_id as string)
            .eq("locked", false)
            .gt("qty", 0)
            .order("quality", { ascending: true, nullsFirst: true });
          if (ref) whQ = whQ.eq("item_ref", ref);
          else whQ = whQ.ilike("item_name", name);
          const { data: whRows } = await whQ;
          for (const wh of whRows ?? []) {
            if (remaining <= 0) break;
            const have = Number(wh.qty ?? 0);
            const take = Math.min(have, remaining);
            const newQty = have - take;
            if (newQty <= 0) {
              await supabaseAdmin
                .from("org_warehouse")
                .delete()
                .eq("id", wh.id as string);
            } else {
              await supabaseAdmin
                .from("org_warehouse")
                .update({ qty: newQty })
                .eq("id", wh.id as string);
            }
            remaining -= take;
          }
        }

        if (remaining > 0) {
          throw new Error(
            `Bestand für „${name}" reicht nicht mehr — fehlend: ${remaining}. Bestellung bleibt in Arbeit.`,
          );
        }
      }

      // 2) Credit the finished item to the requester's personal inventory
      const shortId = (ord.id as string).slice(0, 8);
      const { error: invErr } = await supabaseAdmin
        .from("inventory_items")
        .insert({
          owner_id: ord.requested_by as string,
          item_ref: (ord.item_ref as string) ?? null,
          item_name: ord.item_name as string,
          item_kind: (ord.item_kind as string) ?? null,
          qty: Number(ord.qty ?? 0),
          unit: "pcs",
          quality:
            ord.computed_min_quality == null
              ? null
              : Number(ord.computed_min_quality),
          visibility: "private",
          notes: `Aus Orgabestellung #${shortId}`,
        });
      if (invErr) throw new Error(`Inventar-Buchung fehlgeschlagen: ${invErr.message}`);
    }

    const { error } = await supabaseAdmin
      .from("orga_orders")
      .update({
        status: data.status,
        decision_note: data.note ?? null,
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    if (data.status === "rejected" || data.status === "fulfilled") {
      await supabaseAdmin
        .from("orga_order_reservations")
        .delete()
        .eq("order_id", data.order_id);
    }
    return { ok: true };
  });

/** Requester cancels their own pending order. */
export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ order_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: ord } = await supabaseAdmin
      .from("orga_orders")
      .select("id, requested_by, status")
      .eq("id", data.order_id)
      .maybeSingle();
    if (!ord) throw new Error("Bestellung nicht gefunden.");
    if (ord.requested_by !== context.userId)
      throw new Error("Nur der Besteller darf stornieren.");
    if (ord.status !== "pending")
      throw new Error("Nur offene Bestellungen können storniert werden.");
    const { error } = await supabaseAdmin
      .from("orga_orders")
      .update({ status: "cancelled" })
      .eq("id", data.order_id);
    if (error) throw new Error(error.message);
    await supabaseAdmin
      .from("orga_order_reservations")
      .delete()
      .eq("order_id", data.order_id);
    return { ok: true };
  });

/** Suggestion helper: search across org warehouse + org-visible blueprints. */
export type OrgBlueprintSettings = {
  source_mode: "all" | "roles";
  allowed_roles: string[];
  allowed_custom_role_ids: string[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadBlueprintSettings(sb: any, orgId: string): Promise<OrgBlueprintSettings> {
  const { data } = await sb
    .from("org_blueprint_settings")
    .select("source_mode, allowed_roles, allowed_custom_role_ids")
    .eq("org_id", orgId)
    .maybeSingle();
  return {
    source_mode: ((data?.source_mode as string) ?? "all") === "roles" ? "roles" : "all",
    allowed_roles: (data?.allowed_roles as string[] | null) ?? [],
    allowed_custom_role_ids: (data?.allowed_custom_role_ids as string[] | null) ?? [],
  };
}

/**
 * Blueprint-IDs, die von Mitgliedern der Orga gesammelt wurden – je nach
 * Orga-Einstellung von allen Mitgliedern oder nur von freigegebenen Rollen.
 */
async function allowedOrgBlueprintIds(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sb: any,
  orgId: string,
): Promise<Set<string>> {
  const settings = await loadBlueprintSettings(sb, orgId);
  const { data: members } = await sb
    .from("org_members")
    .select("user_id, role, custom_role_id")
    .eq("org_id", orgId);
  let userIds = (members ?? []).map((m: Record<string, unknown>) => m.user_id as string);
  if (settings.source_mode === "roles") {
    const roles = new Set(settings.allowed_roles);
    const customs = new Set(settings.allowed_custom_role_ids);
    userIds = (members ?? [])
      .filter(
        (m: Record<string, unknown>) =>
          roles.has((m.role as string) ?? "") ||
          (m.custom_role_id && customs.has(m.custom_role_id as string)),
      )
      .map((m: Record<string, unknown>) => m.user_id as string);
  }
  if (userIds.length === 0) return new Set<string>();
  const { data: coll } = await sb
    .from("user_blueprint_collection")
    .select("blueprint_id")
    .in("user_id", userIds);
  return new Set((coll ?? []).map((c: Record<string, unknown>) => c.blueprint_id as string));
}

export const getOrgBlueprintSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.org_id);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const settings = await loadBlueprintSettings(supabaseAdmin, data.org_id);
    const { data: custom } = await supabaseAdmin
      .from("org_custom_roles")
      .select("id, name, color")
      .eq("org_id", data.org_id)
      .order("name");
    return {
      settings,
      custom_roles: (custom ?? []).map((r) => ({
        id: r.id as string,
        name: r.name as string,
        color: (r.color as string | null) ?? null,
      })),
    };
  });

export const setOrgBlueprintSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        source_mode: z.enum(["all", "roles"]),
        allowed_roles: z.array(z.string().max(40)).max(20).default([]),
        allowed_custom_role_ids: z.array(z.string().uuid()).max(50).default([]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const me = await assertMember(context.userId, data.org_id);
    if (!hasPerm(me.role, me.permissions, "settings.manage")) {
      throw new Error("Keine Berechtigung für Orga-Einstellungen.");
    }
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { error } = await supabaseAdmin
      .from("org_blueprint_settings")
      .upsert(
        {
          org_id: data.org_id,
          source_mode: data.source_mode,
          allowed_roles: data.allowed_roles,
          allowed_custom_role_ids: data.allowed_custom_role_ids,
        },
        { onConflict: "org_id" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const searchOrderableItems = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        search: z.string().trim().max(100).default(""),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.userId, data.org_id);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const like = `%${data.search}%`;
    const [whRes, bpRes] = await Promise.all([
      supabaseAdmin
        .from("org_warehouse")
        .select("item_ref, item_name, item_kind, category")
        .eq("org_id", data.org_id)
        .ilike("item_name", like)
        .limit(50),
      supabaseAdmin
        .from("blueprints")
        .select("id, item_ref, item_name, owner_id, visibility, source")
        .ilike("item_name", like)
        .limit(50),
    ]);
    const { coOrgMemberIds } = await import("./org-membership.server");
    const allowed = await coOrgMemberIds(supabaseAdmin, context.userId);
    const allowedBlueprintIds = await allowedOrgBlueprintIds(
      supabaseAdmin,
      data.org_id,
    );
    const seen = new Set<string>();
    type Item = {
      item_ref: string | null;
      item_name: string;
      item_kind: string | null;
      has_blueprint: boolean;
      in_warehouse: boolean;
      category: string | null;
    };
    const items: Item[] = [];
    const push = (it: Item) => {
      // Dedupe strictly by normalized name so a warehouse row and a
      // blueprint row for the same item collapse into ONE entry, even
      // when their item_ref values differ.
      const k = it.item_name.trim().toLowerCase();
      const prev = items.find((x) => x.item_name.trim().toLowerCase() === k);
      if (prev) {
        prev.has_blueprint = prev.has_blueprint || it.has_blueprint;
        prev.in_warehouse = prev.in_warehouse || it.in_warehouse;
        if (!prev.item_kind && it.item_kind) prev.item_kind = it.item_kind;
        if (!prev.category && it.category) prev.category = it.category;
        // Prefer a non-null item_ref if we didn't have one yet.
        if (!prev.item_ref && it.item_ref) prev.item_ref = it.item_ref;
      } else {
        items.push(it);
        seen.add(k);
      }
    };
    for (const r of whRes.data ?? []) {
      push({
        item_ref: (r.item_ref as string) ?? null,
        item_name: r.item_name as string,
        item_kind: (r.item_kind as string) ?? null,
        has_blueprint: false,
        in_warehouse: true,
        category: ((r as { category?: string | null }).category as string) ?? null,
      });
    }
    for (const r of bpRes.data ?? []) {
      const visible =
        r.owner_id === context.userId ||
        r.source !== "manual" ||
        (r.visibility === "org" && allowed.includes(r.owner_id as string));
      if (!visible) continue;
      // Nur Blueprints anzeigen, die von freigegebenen Orga-Rollen
      // gesammelt wurden.
      if (!allowedBlueprintIds.has(r.id as string)) continue;
      push({
        item_ref: (r.item_ref as string) ?? null,
        item_name: r.item_name as string,
        item_kind: null,
        has_blueprint: true,
        in_warehouse: false,
        category: null,
      });
    }
    items.sort((a, b) => a.item_name.localeCompare(b.item_name));
    return { items: items.slice(0, 80) };
  });