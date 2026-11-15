import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasPerm, mergePerms, type OrgPerm } from "@/lib/org-perms";

export type WarehouseItem = {
  id: string;
  org_id: string;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
  qty: number;
  unit: string;
  quality: number | null;
  notes: string | null;
  category: string | null;
  deposited_by: string | null;
  deposited_at: string;
  deposited_by_callsign: string | null;
  locked: boolean;
  locked_by: string | null;
  locked_by_callsign: string | null;
  locked_at: string | null;
  lock_reason: string | null;
  pending_qty: number;
  reserved_qty: number;
  held_by: string | null;
  held_by_callsign: string | null;
  held_at: string | null;
  location_id: string | null;
  location_label: string | null;
  location_since: string | null;
  for_sale: boolean;
  sale_qty: number;
  sale_price: number | null;
};

export type OfferRow = {
  id: string;
  org_id: string;
  inventory_item_id: string | null;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
  qty: number;
  unit: string;
  quality: number | null;
  notes: string | null;
  status: "pending" | "claimed" | "cancelled";
  offered_by: string;
  offered_by_callsign: string | null;
  offered_at: string;
};

export type ReleaseRow = {
  id: string;
  org_id: string;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
  qty_initial: number;
  qty_remaining: number;
  unit: string;
  quality: number | null;
  notes: string | null;
  status: "open" | "closed" | "cancelled";
  released_by: string;
  released_by_callsign: string | null;
  released_at: string;
};

export type ReleaseRequestRow = {
  id: string;
  release_id: string;
  warehouse_id: string | null;
  org_id: string;
  requested_by: string;
  requested_by_callsign: string | null;
  qty: number;
  unit: string;
  item_name: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
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

function assertPerm(
  role: string,
  perms: OrgPerm[],
  perm: OrgPerm,
  msg = "Keine Berechtigung.",
) {
  if (!hasPerm(role, perms, perm)) throw new Error(msg);
}

/**
 * Löst eine Inventar-Location zu {id?, label} für das Orgalager auf.
 * Nur org-sichtbare Locations werden als `location_id` verlinkt; private
 * Locations werden lediglich als Label-Snapshot übernommen.
 */
async function resolveInventoryLocation(
  invLocationId: string | null,
): Promise<{ loc_id: string | null; loc_label: string | null }> {
  if (!invLocationId) return { loc_id: null, loc_label: null };
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data: loc } = await supabaseAdmin
    .from("inventory_locations")
    .select("id, name, visibility")
    .eq("id", invLocationId)
    .maybeSingle();
  if (!loc) return { loc_id: null, loc_label: null };
  return {
    loc_id: loc.visibility === "org" ? (loc.id as string) : null,
    loc_label: (loc.name as string) ?? null,
  };
}

/** Lists the org warehouse stock (member-only). */
export const listOrgWarehouse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertMember(context.userId, data.org_id);
    const { data: rows, error } = await supabaseAdmin
      .from("org_warehouse")
      .select("*")
      .eq("org_id", data.org_id)
      .order("item_name");
    if (error) throw new Error(error.message);
    const userIds = Array.from(
      new Set((rows ?? []).map((r) => r.deposited_by).filter(Boolean) as string[]),
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign")
      .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const callsigns = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id as string, p.callsign as string]),
    );
    // collect locker callsigns
    const lockerIds = Array.from(
      new Set((rows ?? []).map((r) => r.locked_by).filter(Boolean) as string[]),
    );
    const holderIds = Array.from(
      new Set((rows ?? []).map((r) => r.held_by).filter(Boolean) as string[]),
    );
    const allIds = Array.from(new Set([...userIds, ...lockerIds, ...holderIds]));
    const { data: profiles2 } =
      allIds.length > userIds.length
        ? await supabaseAdmin
            .from("profiles")
            .select("id, callsign")
            .in("id", allIds)
        : { data: profiles ?? [] };
    const allCallsigns = new Map<string, string>(
      (profiles2 ?? []).map((p) => [p.id as string, p.callsign as string]),
    );
    // sum pending requests per warehouse item
    const whIds = (rows ?? []).map((r) => r.id as string);
    const pendingMap = new Map<string, number>();
    if (whIds.length > 0) {
      const { data: pendings } = await supabaseAdmin
        .from("org_warehouse_release_requests")
        .select("warehouse_id, qty")
        .in("warehouse_id", whIds)
        .eq("status", "pending");
      for (const p of pendings ?? []) {
        const k = p.warehouse_id as string;
        pendingMap.set(k, (pendingMap.get(k) ?? 0) + Number(p.qty ?? 0));
      }
    }
    // Sum active reservations for this org (from open orga_orders).
    const reservedByRef = new Map<string, number>();
    const reservedByName = new Map<string, number>();
    {
      const { data: reservations } = await supabaseAdmin
        .from("orga_order_reservations")
        .select("item_ref, item_name, qty")
        .eq("org_id", data.org_id);
      for (const r of reservations ?? []) {
        const qty = Number(r.qty ?? 0);
        const ref = (r.item_ref as string) ?? null;
        const name = ((r.item_name as string) ?? "").trim().toLowerCase();
        if (ref) reservedByRef.set(ref, (reservedByRef.get(ref) ?? 0) + qty);
        else if (name)
          reservedByName.set(name, (reservedByName.get(name) ?? 0) + qty);
      }
    }
    // Distribute the org-wide reserved sum across rows for that item.
    const reservedPerRow = new Map<string, number>();
    {
      // Group rows by key so we can proportionally attribute reservations.
      const groups = new Map<string, { ids: string[]; totalFree: number }>();
      for (const r of rows ?? []) {
        const ref = (r.item_ref as string) ?? null;
        const name = ((r.item_name as string) ?? "").trim().toLowerCase();
        const key = ref ? `r:${ref}` : `n:${name}`;
        const g = groups.get(key) ?? { ids: [], totalFree: 0 };
        const free = Math.max(
          0,
          Number(r.qty ?? 0) -
            (pendingMap.get(r.id as string) ?? 0),
        );
        g.ids.push(r.id as string);
        g.totalFree += free;
        groups.set(key, g);
      }
      for (const [key, g] of groups) {
        const total = key.startsWith("r:")
          ? reservedByRef.get(key.slice(2)) ?? 0
          : reservedByName.get(key.slice(2)) ?? 0;
        if (total <= 0 || g.ids.length === 0) continue;
        // Cap at the group's free stock so we don't double-count.
        const capped = Math.min(total, g.totalFree);
        // Attribute proportionally to each row's free stock. Fallback: split evenly.
        for (const id of g.ids) {
          if (g.totalFree > 0) {
            const rowFree = Math.max(
              0,
              Number(
                (rows ?? []).find((x) => x.id === id)?.qty ?? 0,
              ) - (pendingMap.get(id) ?? 0),
            );
            reservedPerRow.set(
              id,
              (reservedPerRow.get(id) ?? 0) +
                (capped * rowFree) / g.totalFree,
            );
          } else {
            reservedPerRow.set(
              id,
              (reservedPerRow.get(id) ?? 0) + capped / g.ids.length,
            );
          }
        }
      }
    }
    const items: WarehouseItem[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      item_ref: (r.item_ref as string) ?? null,
      item_name: r.item_name as string,
      item_kind: (r.item_kind as string) ?? null,
      qty: Number(r.qty ?? 0),
      unit: (r.unit as string) ?? "pcs",
      quality: (r.quality as number) ?? null,
      notes: (r.notes as string) ?? null,
      category: (r.category as string) ?? null,
      deposited_by: (r.deposited_by as string) ?? null,
      deposited_at: r.deposited_at as string,
      deposited_by_callsign: r.deposited_by
        ? callsigns.get(r.deposited_by as string) ?? null
        : null,
      locked: Boolean(r.locked),
      locked_by: (r.locked_by as string) ?? null,
      locked_by_callsign: r.locked_by
        ? allCallsigns.get(r.locked_by as string) ?? null
        : null,
      locked_at: (r.locked_at as string) ?? null,
      lock_reason: (r.lock_reason as string) ?? null,
      pending_qty: pendingMap.get(r.id as string) ?? 0,
      reserved_qty: Math.round(reservedPerRow.get(r.id as string) ?? 0),
      held_by: (r.held_by as string) ?? null,
      held_by_callsign: r.held_by
        ? allCallsigns.get(r.held_by as string) ?? null
        : null,
      held_at: (r.held_at as string) ?? null,
      location_id: (r.location_id as string) ?? null,
      location_label: (r.location_label as string) ?? null,
      location_since: (r.location_since as string) ?? null,
      for_sale: Boolean((r as { for_sale?: boolean }).for_sale),
      sale_qty: Number((r as { sale_qty?: number }).sale_qty ?? 0),
      sale_price:
        (r as { sale_price?: number | null }).sale_price != null
          ? Number((r as { sale_price?: number | null }).sale_price)
          : null,
    }));
    return { items };
  });

/** Lists open offers (pending claims) for an org. */
export const listOrgOffers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        status: z.enum(["pending", "claimed", "cancelled", "all"]).default("pending"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(
      context.userId,
      data.org_id,
    );
    // Nur Lagerverwaltung/Prüfer sehen fremde Angebote – alle anderen
    // ausschließlich ihre eigenen.
    const canSeeAll =
      hasPerm(role, permissions, "warehouse.manage") ||
      hasPerm(role, permissions, "warehouse.requests.review");
    let q = supabaseAdmin
      .from("org_warehouse_claims")
      .select("*")
      .eq("org_id", data.org_id)
      .order("offered_at", { ascending: false });
    if (!canSeeAll) q = q.eq("offered_by", context.userId);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.offered_by as string)),
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const callsigns = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id as string, p.callsign as string]),
    );
    const offers: OfferRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      inventory_item_id: (r.inventory_item_id as string) ?? null,
      item_ref: (r.item_ref as string) ?? null,
      item_name: r.item_name as string,
      item_kind: (r.item_kind as string) ?? null,
      qty: Number(r.qty ?? 0),
      unit: (r.unit as string) ?? "pcs",
      quality: (r.quality as number) ?? null,
      notes: (r.notes as string) ?? null,
      status: r.status as OfferRow["status"],
      offered_by: r.offered_by as string,
      offered_by_callsign: callsigns.get(r.offered_by as string) ?? null,
      offered_at: r.offered_at as string,
    }));
    return { offers };
  });

/** User offers part/all of an inventory stack to an org. Reserves the qty on the stack. */
export const offerInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        inventory_item_id: z.string().uuid(),
        org_id: z.string().uuid(),
        qty: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertMember(context.userId, data.org_id);
    const { data: item, error: ie } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("id", data.inventory_item_id)
      .maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!item || item.owner_id !== context.userId)
      throw new Error("Item gehört dir nicht.");
    const have = Number(item.qty ?? 0);
    const alreadyOffered = Number(item.offered_qty ?? 0);
    const reserved = Number(item.qty_reserved ?? 0);
    const free = have - Math.max(alreadyOffered, reserved);
    if (data.qty > free)
      throw new Error(
        `Nur ${free} ${item.unit ?? "pcs"} verfügbar (Rest reserviert).`,
      );
    const { data: claim, error: ce } = await supabaseAdmin
      .from("org_warehouse_claims")
      .insert({
        org_id: data.org_id,
        inventory_item_id: data.inventory_item_id,
        item_ref: item.item_ref,
        item_name: item.item_name,
        item_kind: item.item_kind,
        qty: data.qty,
        unit: item.unit ?? "pcs",
        quality: item.quality,
        notes: data.notes ?? null,
        offered_by: context.userId,
      })
      .select("id")
      .single();
    if (ce) throw new Error(ce.message);
    const { error: ue } = await supabaseAdmin
      .from("inventory_items")
      .update({
        offered_to_org_id: data.org_id,
        offered_qty: alreadyOffered + data.qty,
      })
      .eq("id", data.inventory_item_id);
    if (ue) throw new Error(ue.message);
    try {
      const { fanoutToOrgPerm } = await import("@/lib/notifications.server");
      await fanoutToOrgPerm(
        data.org_id,
        ["warehouse.manage", "warehouse.requests.review"],
        {
          kind: "warehouse.offer",
          title: "Neue Spende fürs Orgalager",
          body: `${item.item_name}${data.qty ? ` · ${data.qty} ${item.unit ?? "pcs"}` : ""}`,
          link: "/orga/lager",
          ref_table: "org_warehouse_claims",
          ref_id: claim.id as string,
        },
        context.userId,
      );
    } catch { /* best-effort */ }
    return { id: claim.id as string };
  });

/**
 * Direct deposit from inventory to org warehouse. Skips the offer/claim
 * approval flow — only members with `warehouse.manage` permission may do this.
 */
export const depositInventoryDirect = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        inventory_item_id: z.string().uuid(),
        org_id: z.string().uuid(),
        qty: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    assertPerm(
      role,
      permissions,
      "warehouse.manage",
      "Nur Lagerverwalter dürfen direkt einlagern.",
    );

    const { data: item, error: ie } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("id", data.inventory_item_id)
      .maybeSingle();
    if (ie) throw new Error(ie.message);
    if (!item || item.owner_id !== context.userId)
      throw new Error("Item gehört dir nicht.");
    const have = Number(item.qty ?? 0);
    const alreadyOffered = Number(item.offered_qty ?? 0);
    const reserved = Number(item.qty_reserved ?? 0);
    const free = have - Math.max(alreadyOffered, reserved);
    if (data.qty > free)
      throw new Error(
        `Nur ${free} ${item.unit ?? "pcs"} verfügbar (Rest reserviert).`,
      );

    // 1) reduce / delete inventory row
    const newQty = Math.max(0, have - data.qty);
    if (newQty <= 0) {
      await supabaseAdmin
        .from("inventory_items")
        .delete()
        .eq("id", data.inventory_item_id);
    } else {
      await supabaseAdmin
        .from("inventory_items")
        .update({ qty: newQty })
        .eq("id", data.inventory_item_id);
    }

    // 2) add to org warehouse (merge by item_ref/name/unit)
    let mergeQ = supabaseAdmin
      .from("org_warehouse")
      .select("id, qty")
      .eq("org_id", data.org_id)
      .eq("item_name", item.item_name)
      .eq("unit", item.unit ?? "pcs")
      .eq("held_by", context.userId);
    mergeQ = item.item_ref
      ? mergeQ.eq("item_ref", item.item_ref as string)
      : mergeQ.is("item_ref", null);
    mergeQ = item.quality != null
      ? mergeQ.eq("quality", item.quality as number)
      : mergeQ.is("quality", null);
    const { data: existing } = await mergeQ.maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("org_warehouse")
        .update({ qty: Number(existing.qty ?? 0) + Number(data.qty) })
        .eq("id", existing.id as string);
    } else {
      const category = await (
        await import("./warehouse-categories")
      ).autoCategorizeWithCatalog(
        item.item_ref as string | null,
        item.item_kind as string | null,
        item.item_name as string | null,
      );
      // Standort + Halter aus dem Inventar übernehmen.
      const { loc_id, loc_label } = await resolveInventoryLocation(
        item.location_id as string | null,
      );
      const nowIso2 = new Date().toISOString();
      await supabaseAdmin.from("org_warehouse").insert({
        org_id: data.org_id,
        item_ref: item.item_ref,
        item_name: item.item_name,
        item_kind: item.item_kind,
        qty: data.qty,
        unit: item.unit ?? "pcs",
        quality: item.quality,
        notes: data.notes ?? null,
        deposited_by: context.userId,
        category,
        held_by: context.userId,
        held_at: nowIso2,
        location_id: loc_id,
        location_label: loc_label,
        location_since: loc_label ? nowIso2 : null,
      });
    }

    // 3) audit trail: log as immediately-claimed offer
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("org_warehouse_claims").insert({
      org_id: data.org_id,
      inventory_item_id: newQty > 0 ? data.inventory_item_id : null,
      item_ref: item.item_ref,
      item_name: item.item_name,
      item_kind: item.item_kind,
      qty: data.qty,
      unit: item.unit ?? "pcs",
      quality: item.quality,
      notes: data.notes ?? null,
      offered_by: context.userId,
      status: "claimed",
      claimed_by: context.userId,
      claimed_at: nowIso,
    });

    return { ok: true };
  });

/** User cancels their own pending offer. Releases the reservation. */
export const cancelOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ claim_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: claim, error } = await supabaseAdmin
      .from("org_warehouse_claims")
      .select("*")
      .eq("id", data.claim_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claim) throw new Error("Angebot nicht gefunden.");
    if (claim.offered_by !== context.userId)
      throw new Error("Nur der Anbieter kann zurückziehen.");
    if (claim.status !== "pending")
      throw new Error("Nur offene Angebote können zurückgezogen werden.");
    const { error: ue } = await supabaseAdmin
      .from("org_warehouse_claims")
      .update({ status: "cancelled", cancelled_at: new Date().toISOString() })
      .eq("id", data.claim_id);
    if (ue) throw new Error(ue.message);
    if (claim.inventory_item_id) {
      const { data: inv } = await supabaseAdmin
        .from("inventory_items")
        .select("offered_qty")
        .eq("id", claim.inventory_item_id)
        .maybeSingle();
      if (inv) {
        const remaining = Math.max(
          0,
          Number(inv.offered_qty ?? 0) - Number(claim.qty),
        );
        await supabaseAdmin
          .from("inventory_items")
          .update({
            offered_qty: remaining > 0 ? remaining : null,
            offered_to_org_id: remaining > 0 ? claim.org_id : null,
          })
          .eq("id", claim.inventory_item_id);
      }
    }
    return { ok: true };
  });

/** Quartermaster claims a pending offer: moves qty from user inventory to org warehouse. */
export const claimOffer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        claim_id: z.string().uuid(),
        held_by: z.string().uuid().nullable().optional(),
        location_id: z.string().uuid().nullable().optional(),
        location_label: z.string().trim().min(1).max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: claim, error } = await supabaseAdmin
      .from("org_warehouse_claims")
      .select("*")
      .eq("id", data.claim_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!claim) throw new Error("Angebot nicht gefunden.");
    if (claim.status !== "pending")
      throw new Error("Angebot ist nicht mehr offen.");
    const { role, permissions } = await assertMember(context.userId, claim.org_id as string);
    assertPerm(role, permissions, "warehouse.manage", "Nur Quartermaster/Officer/Owner dürfen beanspruchen.");

    // Standort aus dem Ursprungs-Inventar VORAB lesen – die Inventar-Zeile
    // kann gleich gelöscht werden.
    let srcInvLoc: string | null = null;
    if (claim.inventory_item_id) {
      const { data: invMeta } = await supabaseAdmin
        .from("inventory_items")
        .select("location_id")
        .eq("id", claim.inventory_item_id)
        .maybeSingle();
      srcInvLoc = (invMeta?.location_id as string) ?? null;
    }

    // 1) reduce / delete inventory row
    if (claim.inventory_item_id) {
      const { data: inv } = await supabaseAdmin
        .from("inventory_items")
        .select("qty, offered_qty")
        .eq("id", claim.inventory_item_id)
        .maybeSingle();
      if (inv) {
        const newQty = Math.max(0, Number(inv.qty ?? 0) - Number(claim.qty));
        const newOffered = Math.max(
          0,
          Number(inv.offered_qty ?? 0) - Number(claim.qty),
        );
        if (newQty <= 0) {
          await supabaseAdmin
            .from("inventory_items")
            .delete()
            .eq("id", claim.inventory_item_id);
        } else {
          await supabaseAdmin
            .from("inventory_items")
            .update({
              qty: newQty,
              offered_qty: newOffered > 0 ? newOffered : null,
              offered_to_org_id: newOffered > 0 ? claim.org_id : null,
            })
            .eq("id", claim.inventory_item_id);
        }
      }
    }

    // Übergabe-Wahl der Quartermaster (Halter + Standort). Falls nicht
    // angegeben, fällt der Halter auf den Spender und der Ort auf den
    // Ursprungsstandort aus dem Inventar zurück.
    const overrideHolder = data.held_by !== undefined;
    const overrideLoc =
      data.location_id !== undefined || data.location_label !== undefined;
    const chosenHolder = overrideHolder ? (data.held_by ?? null) : (claim.offered_by as string);
    let chosenLocId: string | null;
    let chosenLocLabel: string | null;
    if (overrideLoc) {
      chosenLocId = data.location_id ?? null;
      chosenLocLabel = data.location_label ?? null;
      if (chosenLocId && !chosenLocLabel) {
        const { data: locRow } = await supabaseAdmin
          .from("inventory_locations")
          .select("name")
          .eq("id", chosenLocId)
          .maybeSingle();
        chosenLocLabel = (locRow?.name as string) ?? null;
      }
    } else {
      const resolved = await resolveInventoryLocation(srcInvLoc);
      chosenLocId = resolved.loc_id;
      chosenLocLabel = resolved.loc_label;
    }
    const nowIsoClaim = new Date().toISOString();

    // 2) add to org warehouse (merge by item_ref if same)
    let mergeQ = supabaseAdmin
      .from("org_warehouse")
      .select("id, qty")
      .eq("org_id", claim.org_id)
      .eq("item_name", claim.item_name)
      .eq("unit", claim.unit);
    mergeQ = claim.item_ref
      ? mergeQ.eq("item_ref", claim.item_ref as string)
      : mergeQ.is("item_ref", null);
    mergeQ = chosenHolder
      ? mergeQ.eq("held_by", chosenHolder)
      : mergeQ.is("held_by", null);
    mergeQ = claim.quality != null
      ? mergeQ.eq("quality", claim.quality as number)
      : mergeQ.is("quality", null);
    const { data: existing } = await mergeQ.maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("org_warehouse")
        .update({
          qty: Number(existing.qty ?? 0) + Number(claim.qty),
          ...(overrideLoc
            ? {
                location_id: chosenLocId,
                location_label: chosenLocLabel,
                location_since: chosenLocLabel ? nowIsoClaim : null,
              }
            : {}),
        })
        .eq("id", existing.id as string);
    } else {
      await supabaseAdmin.from("org_warehouse").insert({
        org_id: claim.org_id,
        item_ref: claim.item_ref,
        item_name: claim.item_name,
        item_kind: claim.item_kind,
        qty: claim.qty,
        unit: claim.unit,
        quality: claim.quality,
        notes: claim.notes,
        deposited_by: claim.offered_by,
          category: await (
            await import("./warehouse-categories")
          ).autoCategorizeWithCatalog(
            claim.item_ref as string | null,
            claim.item_kind as string | null,
            claim.item_name as string | null,
          ),
          held_by: chosenHolder,
          held_at: nowIsoClaim,
          location_id: chosenLocId,
          location_label: chosenLocLabel,
          location_since: chosenLocLabel ? nowIsoClaim : null,
      });
    }

    // 3) mark claim as claimed
    await supabaseAdmin
      .from("org_warehouse_claims")
      .update({
        status: "claimed",
        claimed_by: context.userId,
        claimed_at: new Date().toISOString(),
      })
      .eq("id", data.claim_id);

    return { ok: true };
  });

/** Quartermaster adjusts/removes warehouse stock. */
export const adjustWarehouseStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        new_qty: z.number().min(0),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row } = await supabaseAdmin
      .from("org_warehouse")
      .select("org_id")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (!row) throw new Error("Eintrag nicht gefunden.");
    const { role, permissions } = await assertMember(context.userId, row.org_id as string);
    assertPerm(role, permissions, "warehouse.manage", "Keine Berechtigung.");
    if (data.new_qty <= 0) {
      await supabaseAdmin
        .from("org_warehouse")
        .delete()
        .eq("id", data.warehouse_id);
    } else {
      await supabaseAdmin
        .from("org_warehouse")
        .update({
          qty: data.new_qty,
          notes: data.notes ?? null,
        })
        .eq("id", data.warehouse_id);
    }
    return { ok: true };
  });

/** Quartermaster issues stock from the org warehouse to a member's private inventory. */
export const issueWarehouseToMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        recipient_user_id: z.string().uuid(),
        qty: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error: we } = await supabaseAdmin
      .from("org_warehouse")
      .select("*")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (we) throw new Error(we.message);
    if (!wh) throw new Error("Lagereintrag nicht gefunden.");
    const { role, permissions } = await assertMember(context.userId, wh.org_id as string);
    assertPerm(role, permissions, "warehouse.manage", "Nur Quartermaster/Officer/Owner dürfen ausgeben.");
    // recipient must be member of the same org
    const { data: recip } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", wh.org_id as string)
      .eq("user_id", data.recipient_user_id)
      .maybeSingle();
    if (!recip) throw new Error("Empfänger ist kein Mitglied dieser Orga.");
    const have = Number(wh.qty ?? 0);
    if (data.qty > have)
      throw new Error(`Nur ${have} ${wh.unit ?? "pcs"} im Lager.`);

    // 1) reduce/delete warehouse row
    const newQty = have - data.qty;
    if (newQty <= 0) {
      await supabaseAdmin
        .from("org_warehouse")
        .delete()
        .eq("id", data.warehouse_id);
    } else {
      await supabaseAdmin
        .from("org_warehouse")
        .update({ qty: newQty })
        .eq("id", data.warehouse_id);
    }

    // 2) merge into recipient inventory (by item_ref + name + unit, no location)
    let mergeQ = supabaseAdmin
      .from("inventory_items")
      .select("id, qty")
      .eq("owner_id", data.recipient_user_id)
      .eq("item_name", wh.item_name as string)
      .eq("unit", (wh.unit as string) ?? "pcs")
      .is("location_id", null);
    mergeQ = wh.item_ref
      ? mergeQ.eq("item_ref", wh.item_ref as string)
      : mergeQ.is("item_ref", null);
    const { data: existing } = await mergeQ.maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("inventory_items")
        .update({ qty: Number(existing.qty ?? 0) + Number(data.qty) })
        .eq("id", existing.id as string);
    } else {
      await supabaseAdmin.from("inventory_items").insert({
        owner_id: data.recipient_user_id,
        item_ref: wh.item_ref,
        item_name: wh.item_name,
        item_kind: wh.item_kind,
        qty: data.qty,
        qty_reserved: 0,
        unit: wh.unit ?? "pcs",
        quality: wh.quality,
        visibility: "private",
        notes: data.notes
          ? `Aus Orgalager: ${data.notes}`
          : "Aus Orgalager ausgegeben",
      });
    }
    return { ok: true };
  });
/** QM releases stock from the warehouse so members can claim it. Reduces warehouse stock. */
export const releaseWarehouseStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        qty: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error } = await supabaseAdmin
      .from("org_warehouse")
      .select("*")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wh) throw new Error("Lagereintrag nicht gefunden.");
    const { role, permissions } = await assertMember(context.userId, wh.org_id as string);
    assertPerm(role, permissions, "warehouse.manage", "Nur Quartermaster/Officer/Owner dürfen freigeben.");
    const have = Number(wh.qty ?? 0);
    if (data.qty > have)
      throw new Error(`Nur ${have} ${wh.unit ?? "pcs"} verfügbar.`);
    // reduce/delete warehouse row
    const newQty = have - data.qty;
    if (newQty <= 0) {
      await supabaseAdmin
        .from("org_warehouse")
        .delete()
        .eq("id", data.warehouse_id);
    } else {
      await supabaseAdmin
        .from("org_warehouse")
        .update({ qty: newQty })
        .eq("id", data.warehouse_id);
    }
    const { error: ie } = await supabaseAdmin
      .from("org_warehouse_releases")
      .insert({
        org_id: wh.org_id,
        item_ref: wh.item_ref,
        item_name: wh.item_name,
        item_kind: wh.item_kind,
        qty_initial: data.qty,
        qty_remaining: data.qty,
        unit: wh.unit ?? "pcs",
        quality: wh.quality,
        notes: data.notes ?? null,
        released_by: context.userId,
      });
    if (ie) throw new Error(ie.message);
    return { ok: true };
  });

/** Adds a new item directly to the org warehouse (requires warehouse.manage). */
export const addWarehouseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        item_ref: z.string().max(120).optional().nullable(),
        item_name: z.string().trim().min(1).max(160),
        item_kind: z.string().trim().max(80).optional().nullable(),
        qty: z.number().positive(),
        unit: z.enum(["pcs", "scu"]).default("pcs"),
        quality: z.number().int().min(0).max(1000).optional().nullable(),
        notes: z.string().trim().max(500).optional().nullable(),
        category: z.string().trim().max(80).optional().nullable(),
        location_id: z.string().uuid().optional().nullable(),
        location_label: z.string().trim().max(160).optional().nullable(),
        held_by: z.string().uuid().optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(
      context.userId,
      data.org_id,
    );
    assertPerm(
      role,
      permissions,
      "warehouse.manage",
      "Nur Quartermaster/Officer/Owner dürfen einlagern.",
    );
    if (data.held_by) {
      await assertHolderIsMember(data.org_id, data.held_by);
    }
    return await insertOrMergeWarehouseRow(supabaseAdmin, {
      org_id: data.org_id,
      item_ref: data.item_ref ?? null,
      item_name: data.item_name,
      item_kind: data.item_kind ?? null,
      qty: data.qty,
      unit: data.unit,
      quality: data.quality ?? null,
      notes: data.notes ?? null,
      category: data.category ?? null,
      location_id: data.location_id ?? null,
      location_label: data.location_label ?? null,
      held_by: data.held_by ?? null,
      deposited_by: context.userId,
    });
  });

async function assertHolderIsMember(orgId: string, userId: string) {
  const { supabaseAdmin } = await import(
    "@/integrations/supabase/client.server"
  );
  const { data: m } = await supabaseAdmin
    .from("org_members")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!m) throw new Error("Halter ist kein Mitglied dieser Orga.");
}

async function insertOrMergeWarehouseRow(
  supabaseAdmin: any,
  input: {
    org_id: string;
    item_ref: string | null;
    item_name: string;
    item_kind: string | null;
    qty: number;
    unit: "pcs" | "scu";
    quality: number | null;
    notes: string | null;
    category: string | null;
    location_id: string | null;
    location_label: string | null;
    held_by: string | null;
    deposited_by: string;
  },
): Promise<{ id: string; merged: boolean }> {
  const { autoCategorizeWithCatalog } = await import("./warehouse-categories");
  const category =
    input.category ??
    (await autoCategorizeWithCatalog(
      input.item_ref,
      input.item_kind,
      input.item_name,
    ));
  // Merge with an existing row that matches ref/name + unit + quality + category + holder.
  let mergeQ = supabaseAdmin
    .from("org_warehouse")
    .select("id, qty")
    .eq("org_id", input.org_id)
    .eq("item_name", input.item_name)
    .eq("unit", input.unit);
  mergeQ = input.item_ref
    ? mergeQ.eq("item_ref", input.item_ref)
    : mergeQ.is("item_ref", null);
  mergeQ =
    input.quality != null
      ? mergeQ.eq("quality", input.quality)
      : mergeQ.is("quality", null);
  mergeQ = category
    ? mergeQ.eq("category", category)
    : mergeQ.is("category", null);
  mergeQ = input.held_by
    ? mergeQ.eq("held_by", input.held_by)
    : mergeQ.is("held_by", null);
  const { data: existing } = await mergeQ.maybeSingle();
  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("org_warehouse")
      .update({ qty: Number(existing.qty ?? 0) + input.qty })
      .eq("id", existing.id as string);
    if (error) throw new Error(error.message);
    return { id: existing.id as string, merged: true };
  }
  const now = new Date().toISOString();
  const { data: row, error } = await supabaseAdmin
    .from("org_warehouse")
    .insert({
      org_id: input.org_id,
      item_ref: input.item_ref,
      item_name: input.item_name,
      item_kind: input.item_kind,
      qty: input.qty,
      unit: input.unit,
      quality: input.quality,
      notes: input.notes,
      category: category ?? null,
      deposited_by: input.deposited_by,
      location_id: input.location_id,
      location_label: input.location_label,
      location_since:
        input.location_id || input.location_label ? now : null,
      held_by: input.held_by,
      held_since: input.held_by ? now : null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: row.id as string, merged: false };
}

/**
 * Bulk-Einlagerung mehrerer Items mit einem gemeinsamen Halter & Lagerort.
 * Berechtigung wie `addWarehouseItem`.
 */
export const addWarehouseItemsBulk = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        held_by: z.string().uuid().nullable().optional(),
        location_id: z.string().uuid().nullable().optional(),
        location_label: z.string().trim().max(160).nullable().optional(),
        items: z
          .array(
            z.object({
              item_ref: z.string().max(120).nullable().optional(),
              item_name: z.string().trim().min(1).max(160),
              item_kind: z.string().trim().max(80).nullable().optional(),
              qty: z.number().positive(),
              unit: z.enum(["pcs", "scu"]).default("pcs"),
              quality: z.number().int().min(0).max(1000).nullable().optional(),
              notes: z.string().trim().max(500).nullable().optional(),
              category: z.string().trim().max(80).nullable().optional(),
            }),
          )
          .min(1)
          .max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(
      context.userId,
      data.org_id,
    );
    assertPerm(
      role,
      permissions,
      "warehouse.manage",
      "Nur Quartermaster/Officer/Owner dürfen einlagern.",
    );
    if (data.held_by) {
      await assertHolderIsMember(data.org_id, data.held_by);
    }
    const results: Array<{ id: string; merged: boolean }> = [];
    for (const it of data.items) {
      const r = await insertOrMergeWarehouseRow(supabaseAdmin, {
        org_id: data.org_id,
        item_ref: it.item_ref ?? null,
        item_name: it.item_name,
        item_kind: it.item_kind ?? null,
        qty: it.qty,
        unit: it.unit,
        quality: it.quality ?? null,
        notes: it.notes ?? null,
        category: it.category ?? null,
        location_id: data.location_id ?? null,
        location_label: data.location_label ?? null,
        held_by: data.held_by ?? null,
        deposited_by: context.userId,
      });
      results.push(r);
    }
    return { count: results.length, results };
  });

/** Sets the category of a warehouse item (requires warehouse.manage). */
export const setWarehouseItemCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        category: z.string().trim().max(80).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh } = await supabaseAdmin
      .from("org_warehouse")
      .select("org_id")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (!wh) throw new Error("Lagereintrag nicht gefunden.");
    const { role, permissions } = await assertMember(
      context.userId,
      wh.org_id as string,
    );
    assertPerm(role, permissions, "warehouse.manage", "Keine Berechtigung.");
    const { error } = await supabaseAdmin
      .from("org_warehouse")
      .update({ category: data.category ?? null })
      .eq("id", data.warehouse_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lists distinct categories currently used in the org warehouse. */
export const listOrgWarehouseCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ org_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertMember(context.userId, data.org_id);
    const { data: rows } = await supabaseAdmin
      .from("org_warehouse")
      .select("category")
      .eq("org_id", data.org_id)
      .not("category", "is", null);
    const set = new Set<string>();
    for (const r of rows ?? []) {
      const c = (r.category as string) ?? "";
      if (c) set.add(c);
    }
    return {
      categories: Array.from(set).sort((a, b) => a.localeCompare(b)),
    };
  });

/** Lists releases for an org. */
export const listOrgReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        status: z.enum(["open", "closed", "cancelled", "all"]).default("open"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertMember(context.userId, data.org_id);
    let q = supabaseAdmin
      .from("org_warehouse_releases")
      .select("*")
      .eq("org_id", data.org_id)
      .order("released_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.released_by as string).filter(Boolean)),
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const callsigns = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id as string, p.callsign as string]),
    );
    const releases: ReleaseRow[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      item_ref: (r.item_ref as string) ?? null,
      item_name: r.item_name as string,
      item_kind: (r.item_kind as string) ?? null,
      qty_initial: Number(r.qty_initial ?? 0),
      qty_remaining: Number(r.qty_remaining ?? 0),
      unit: (r.unit as string) ?? "pcs",
      quality: (r.quality as number) ?? null,
      notes: (r.notes as string) ?? null,
      status: r.status as ReleaseRow["status"],
      released_by: r.released_by as string,
      released_by_callsign: callsigns.get(r.released_by as string) ?? null,
      released_at: r.released_at as string,
    }));
    return { releases };
  });

/** QM cancels a release: returns remaining qty back into warehouse stock. */
export const cancelRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ release_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rel, error } = await supabaseAdmin
      .from("org_warehouse_releases")
      .select("*")
      .eq("id", data.release_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rel) throw new Error("Freigabe nicht gefunden.");
    if (rel.status !== "open")
      throw new Error("Nur offene Freigaben können zurückgenommen werden.");
    const { role, permissions } = await assertMember(context.userId, rel.org_id as string);
    assertPerm(role, permissions, "warehouse.manage", "Keine Berechtigung.");
    const remaining = Number(rel.qty_remaining ?? 0);
    if (remaining > 0) {
      // merge back into warehouse
      let mergeQ = supabaseAdmin
        .from("org_warehouse")
        .select("id, qty")
        .eq("org_id", rel.org_id as string)
        .eq("item_name", rel.item_name as string)
        .eq("unit", (rel.unit as string) ?? "pcs");
      mergeQ = rel.item_ref
        ? mergeQ.eq("item_ref", rel.item_ref as string)
        : mergeQ.is("item_ref", null);
      const { data: existing } = await mergeQ.maybeSingle();
      if (existing) {
        await supabaseAdmin
          .from("org_warehouse")
          .update({ qty: Number(existing.qty ?? 0) + remaining })
          .eq("id", existing.id as string);
      } else {
        await supabaseAdmin.from("org_warehouse").insert({
          org_id: rel.org_id,
          item_ref: rel.item_ref,
          item_name: rel.item_name,
          item_kind: rel.item_kind,
          qty: remaining,
          unit: rel.unit ?? "pcs",
          quality: rel.quality,
          notes: rel.notes,
          deposited_by: context.userId,
          category: await (
            await import("./warehouse-categories")
          ).autoCategorizeWithCatalog(
            rel.item_ref as string | null,
            rel.item_kind as string | null,
            rel.item_name as string | null,
          ),
        });
      }
    }
    await supabaseAdmin
      .from("org_warehouse_releases")
      .update({ status: "cancelled", qty_remaining: 0 })
      .eq("id", data.release_id);
    // auto-reject any open requests
    await supabaseAdmin
      .from("org_warehouse_release_requests")
      .update({
        status: "rejected",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("release_id", data.release_id)
      .eq("status", "pending");
    return { ok: true };
  });

/** Member requests a quantity from an open release. */
export const requestRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        release_id: z.string().uuid(),
        qty: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rel, error } = await supabaseAdmin
      .from("org_warehouse_releases")
      .select("*")
      .eq("id", data.release_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!rel) throw new Error("Freigabe nicht gefunden.");
    if (rel.status !== "open") throw new Error("Freigabe ist geschlossen.");
    await assertMember(context.userId, rel.org_id as string);
    if (data.qty > Number(rel.qty_remaining ?? 0))
      throw new Error(
        `Nur noch ${rel.qty_remaining} ${rel.unit ?? "pcs"} verfügbar.`,
      );
    const { error: ie } = await supabaseAdmin
      .from("org_warehouse_release_requests")
      .insert({
        release_id: data.release_id,
        org_id: rel.org_id,
        requested_by: context.userId,
        qty: data.qty,
        notes: data.notes ?? null,
      });
    if (ie) throw new Error(ie.message);
    try {
      const { fanoutToOrgPerm } = await import("@/lib/notifications.server");
      await fanoutToOrgPerm(
        rel.org_id as string,
        ["warehouse.requests.review"],
        {
          kind: "warehouse.release_request",
          title: "Neue Anfrage fürs Orgalager",
          body: `${rel.item_name ?? "Item"} · ${data.qty} ${rel.unit ?? "pcs"}`,
          link: "/orga/lager",
          ref_table: "org_warehouse_release_requests",
          ref_id: null,
        },
        context.userId,
      );
    } catch { /* best-effort */ }
    return { ok: true };
  });

/** Lists release requests for an org (QM view) or own requests. */
export const listReleaseRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        status: z
          .enum(["pending", "approved", "rejected", "cancelled", "all"])
          .default("pending"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(
      context.userId,
      data.org_id,
    );
    // Ohne Prüf-/Verwaltungsrecht sieht ein Mitglied nur die eigenen Anfragen.
    const canSeeAll =
      hasPerm(role, permissions, "warehouse.requests.review") ||
      hasPerm(role, permissions, "warehouse.manage");
    let q = supabaseAdmin
      .from("org_warehouse_release_requests")
      .select("*, release:release_id(item_name, unit), warehouse:warehouse_id(item_name, unit)")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false });
    if (!canSeeAll) q = q.eq("requested_by", context.userId);
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    const ids = Array.from(
      new Set((rows ?? []).map((r) => r.requested_by as string)),
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign")
      .in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    const callsigns = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id as string, p.callsign as string]),
    );
    const requests: ReleaseRequestRow[] = (rows ?? []).map((r) => {
      const rel = (r as { release?: { item_name?: string; unit?: string } })
        .release;
      const wh = (r as { warehouse?: { item_name?: string; unit?: string } })
        .warehouse;
      return {
        id: r.id as string,
        release_id: (r.release_id as string) ?? null as unknown as string,
        warehouse_id: (r.warehouse_id as string) ?? null,
        org_id: r.org_id as string,
        requested_by: r.requested_by as string,
        requested_by_callsign:
          callsigns.get(r.requested_by as string) ?? null,
        qty: Number(r.qty ?? 0),
        unit: rel?.unit ?? wh?.unit ?? "pcs",
        item_name: rel?.item_name ?? wh?.item_name ?? "—",
        notes: (r.notes as string) ?? null,
        status: r.status as ReleaseRequestRow["status"],
        decided_by: (r.decided_by as string) ?? null,
        decided_at: (r.decided_at as string) ?? null,
        created_at: r.created_at as string,
      };
    });
    return { requests };
  });

/** Member cancels their own pending request. */
export const cancelReleaseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ request_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: req } = await supabaseAdmin
      .from("org_warehouse_release_requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (!req) throw new Error("Anfrage nicht gefunden.");
    if (req.requested_by !== context.userId)
      throw new Error("Nur eigene Anfragen können zurückgezogen werden.");
    if (req.status !== "pending")
      throw new Error("Anfrage ist nicht mehr offen.");
    await supabaseAdmin
      .from("org_warehouse_release_requests")
      .update({ status: "cancelled" })
      .eq("id", data.request_id);
    return { ok: true };
  });

/** QM decides on a request: approve moves qty into member's inventory and decreases release. */
export const decideReleaseRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        request_id: z.string().uuid(),
        approve: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: req, error } = await supabaseAdmin
      .from("org_warehouse_release_requests")
      .select("*")
      .eq("id", data.request_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!req) throw new Error("Anfrage nicht gefunden.");
    if (req.status !== "pending")
      throw new Error("Anfrage ist nicht mehr offen.");
    const { role, permissions } = await assertMember(context.userId, req.org_id as string);
    assertPerm(role, permissions, "warehouse.requests.review", "Keine Berechtigung.");

    if (!data.approve) {
      await supabaseAdmin
        .from("org_warehouse_release_requests")
        .update({
          status: "rejected",
          decided_by: context.userId,
          decided_at: new Date().toISOString(),
        })
        .eq("id", data.request_id);
      return { ok: true };
    }

    // Branch: warehouse-direct request vs release-based request
    let srcRef: string | null = null;
    let srcName = "";
    let srcKind: string | null = null;
    let srcUnit = "pcs";
    let srcQuality: number | null = null;
    const wantQty = Number(req.qty ?? 0);

    if (req.warehouse_id) {
      const { data: wh } = await supabaseAdmin
        .from("org_warehouse")
        .select("*")
        .eq("id", req.warehouse_id as string)
        .maybeSingle();
      if (!wh) throw new Error("Lagereintrag nicht gefunden.");
      if (wh.locked) throw new Error("Item ist gesperrt.");
      const have = Number(wh.qty ?? 0);
      if (wantQty > have)
        throw new Error(`Nur ${have} ${wh.unit ?? "pcs"} im Lager.`);
      srcRef = (wh.item_ref as string) ?? null;
      srcName = wh.item_name as string;
      srcKind = (wh.item_kind as string) ?? null;
      srcUnit = (wh.unit as string) ?? "pcs";
      srcQuality = (wh.quality as number) ?? null;

      const newQty = have - wantQty;
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
    } else {
    const { data: rel } = await supabaseAdmin
      .from("org_warehouse_releases")
      .select("*")
      .eq("id", req.release_id as string)
      .maybeSingle();
    if (!rel) throw new Error("Freigabe nicht gefunden.");
    if (rel.status !== "open") throw new Error("Freigabe ist geschlossen.");
    const remaining = Number(rel.qty_remaining ?? 0);
    if (wantQty > remaining)
      throw new Error(`Nur noch ${remaining} ${rel.unit ?? "pcs"} verfügbar.`);
      srcRef = (rel.item_ref as string) ?? null;
      srcName = rel.item_name as string;
      srcKind = (rel.item_kind as string) ?? null;
      srcUnit = (rel.unit as string) ?? "pcs";
      srcQuality = (rel.quality as number) ?? null;

      const newRemain = remaining - wantQty;
      await supabaseAdmin
        .from("org_warehouse_releases")
        .update({
          qty_remaining: newRemain,
          status: newRemain <= 0 ? "closed" : "open",
        })
        .eq("id", rel.id as string);
    }

    // move qty into member's inventory (merge)
    let mergeQ = supabaseAdmin
      .from("inventory_items")
      .select("id, qty")
      .eq("owner_id", req.requested_by as string)
      .eq("item_name", srcName)
      .eq("unit", srcUnit)
      .is("location_id", null);
    mergeQ = srcRef
      ? mergeQ.eq("item_ref", srcRef)
      : mergeQ.is("item_ref", null);
    const { data: existing } = await mergeQ.maybeSingle();
    if (existing) {
      await supabaseAdmin
        .from("inventory_items")
        .update({ qty: Number(existing.qty ?? 0) + wantQty })
        .eq("id", existing.id as string);
    } else {
      await supabaseAdmin.from("inventory_items").insert({
        owner_id: req.requested_by,
        item_ref: srcRef,
        item_name: srcName,
        item_kind: srcKind,
        qty: wantQty,
        qty_reserved: 0,
        unit: srcUnit,
        quality: srcQuality,
        visibility: "private",
        notes: req.warehouse_id ? "Aus Orgalager" : "Aus Orga-Freigabe",
      });
    }

    // mark request approved
    await supabaseAdmin
      .from("org_warehouse_release_requests")
      .update({
        status: "approved",
        decided_by: context.userId,
        decided_at: new Date().toISOString(),
      })
      .eq("id", data.request_id);

    return { ok: true };
  });

/** QM locks/unlocks a warehouse item. Locked items cannot be requested. */
export const setWarehouseLock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        locked: z.boolean(),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error } = await supabaseAdmin
      .from("org_warehouse")
      .select("org_id")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wh) throw new Error("Lagereintrag nicht gefunden.");
    const { role, permissions } = await assertMember(context.userId, wh.org_id as string);
    assertPerm(role, permissions, "warehouse.manage", "Nur Quartermaster/Officer/Owner dürfen sperren.");
    const patch = data.locked
      ? {
          locked: true,
          locked_by: context.userId,
          locked_at: new Date().toISOString(),
          lock_reason: data.reason ?? null,
        }
      : {
          locked: false,
          locked_by: null,
          locked_at: null,
          lock_reason: null,
        };
    const { error: ue } = await supabaseAdmin
      .from("org_warehouse")
      .update(patch)
      .eq("id", data.warehouse_id);
    if (ue) throw new Error(ue.message);
    return { ok: true };
  });

/** Member requests qty directly from a warehouse item (must not be locked). */
export const requestWarehouseItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        qty: z.number().positive(),
        notes: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error } = await supabaseAdmin
      .from("org_warehouse")
      .select("*")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wh) throw new Error("Lagereintrag nicht gefunden.");
    await assertMember(context.userId, wh.org_id as string);
    if (wh.locked) throw new Error("Item ist gesperrt.");
    const have = Number(wh.qty ?? 0);
    // sum already-pending requests on this item
    const { data: pendings } = await supabaseAdmin
      .from("org_warehouse_release_requests")
      .select("qty")
      .eq("warehouse_id", data.warehouse_id)
      .eq("status", "pending");
    const pendingSum = (pendings ?? []).reduce(
      (a, p) => a + Number(p.qty ?? 0),
      0,
    );
    // Sum active orga_order reservations for this item within the org.
    const nameKey = ((wh.item_name as string) ?? "").trim();
    let resQ = supabaseAdmin
      .from("orga_order_reservations")
      .select("qty")
      .eq("org_id", wh.org_id as string);
    if (wh.item_ref)
      resQ = resQ.eq("item_ref", wh.item_ref as string);
    else resQ = resQ.is("item_ref", null).ilike("item_name", nameKey);
    const { data: reservedRows } = await resQ;
    const reservedSum = (reservedRows ?? []).reduce(
      (a, r) => a + Number(r.qty ?? 0),
      0,
    );
    const free = have - pendingSum - reservedSum;
    if (data.qty > free)
      throw new Error(
        `Nur ${Math.max(0, free)} ${wh.unit ?? "pcs"} anforderbar (Rest angefragt oder für Bestellungen reserviert).`,
      );
    const { error: ie } = await supabaseAdmin
      .from("org_warehouse_release_requests")
      .insert({
        org_id: wh.org_id,
        warehouse_id: data.warehouse_id,
        requested_by: context.userId,
        qty: data.qty,
        notes: data.notes ?? null,
      });
    if (ie) throw new Error(ie.message);
    return { ok: true };
  });

/**
 * Trägt einen aktuellen Halter für einen Lager-Eintrag ein (oder entfernt ihn).
 * Nur Mitglieder mit `warehouse.manage` dürfen den Halter setzen; als Halter
 * sind nur Mitglieder mit `warehouse.hold` (Owner/Officer/Quartermaster
 * inklusive) zulässig.
 */
export const setWarehouseItemHolder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        holder_user_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error: we } = await supabaseAdmin
      .from("org_warehouse")
      .select("id, org_id")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (we || !wh) throw new Error("Lager-Eintrag nicht gefunden.");
    const { role, permissions } = await assertMember(
      context.userId,
      wh.org_id as string,
    );
    assertPerm(
      role,
      permissions,
      "warehouse.manage",
      "Nur Lager-Verwalter dürfen Halter setzen.",
    );
    if (data.holder_user_id) {
      // Ziel muss Mitglied dieser Orga sein und `warehouse.hold` haben.
      const { data: m } = await supabaseAdmin
        .from("org_members")
        .select(
          "role, permissions, org_custom_roles:custom_role_id(permissions)",
        )
        .eq("org_id", wh.org_id as string)
        .eq("user_id", data.holder_user_id)
        .maybeSingle();
      if (!m) throw new Error("Zielperson ist kein Mitglied dieser Orga.");
      const customPerms =
        (m.org_custom_roles as { permissions: string[] } | null)
          ?.permissions ?? [];
      const merged = mergePerms(
        m.permissions as string[] | null,
        customPerms,
      );
      const eligible =
        m.role === "owner" || m.role === "officer" ||
        merged.includes("warehouse.hold");
      if (!eligible)
        throw new Error(
          "Zielperson hat keine Berechtigung, Orgabestand zu halten.",
        );
    }
    const { error } = await supabaseAdmin
      .from("org_warehouse")
      .update({
        held_by: data.holder_user_id,
        held_at: data.holder_user_id ? new Date().toISOString() : null,
      })
      .eq("id", data.warehouse_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/**
 * Listet alle Orga-Lager-Einträge, deren aktueller Halter der eingeloggte
 * User ist – über alle Orgas hinweg, in denen er Mitglied ist.
 */
export const listMyHeldOrgWarehouse = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rows, error } = await supabaseAdmin
      .from("org_warehouse")
      .select(
        "id, org_id, item_ref, item_name, item_kind, qty, unit, quality, notes, category, held_at, locked",
      )
      .eq("held_by", context.userId)
      .order("item_name");
    if (error) throw new Error(error.message);
    const orgIds = Array.from(
      new Set((rows ?? []).map((r) => r.org_id as string)),
    );
    const orgMap = new Map<string, string>();
    if (orgIds.length > 0) {
      const { data: orgs } = await supabaseAdmin
        .from("orgs")
        .select("id, name")
        .in("id", orgIds);
      for (const o of orgs ?? [])
        orgMap.set(o.id as string, o.name as string);
    }
    return {
      items: (rows ?? []).map((r) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        org_name: orgMap.get(r.org_id as string) ?? "—",
        item_ref: (r.item_ref as string) ?? null,
        item_name: r.item_name as string,
        item_kind: (r.item_kind as string) ?? null,
        qty: Number(r.qty ?? 0),
        unit: (r.unit as string) ?? "pcs",
        quality: (r.quality as number) ?? null,
        notes: (r.notes as string) ?? null,
        category: (r.category as string) ?? null,
        held_at: (r.held_at as string) ?? null,
        locked: Boolean(r.locked),
      })),
    };
  });

/**
 * Setzt den aktuellen Lagerort eines Orgalager-Eintrags. Aktualisiert
 * gleichzeitig `location_since`. Nur Mitglieder mit `warehouse.manage`.
 */
export const setWarehouseItemLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        location_id: z.string().uuid().nullable(),
        location_label: z.string().trim().max(160).nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error: we } = await supabaseAdmin
      .from("org_warehouse")
      .select("id, org_id, location_id")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (we || !wh) throw new Error("Lager-Eintrag nicht gefunden.");
    const { role, permissions } = await assertMember(
      context.userId,
      wh.org_id as string,
    );
    assertPerm(
      role,
      permissions,
      "warehouse.manage",
      "Nur Lager-Verwalter dürfen den Lagerort ändern.",
    );
    const changed = wh.location_id !== data.location_id;
    const { error } = await supabaseAdmin
      .from("org_warehouse")
      .update({
        location_id: data.location_id,
        location_label: data.location_label,
        location_since: changed ? new Date().toISOString() : undefined,
      })
      .eq("id", data.warehouse_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
