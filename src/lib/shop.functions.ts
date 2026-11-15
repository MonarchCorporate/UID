import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createDbClient } from "@/lib/db/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";
import { hasPerm, mergePerms, type OrgPerm } from "@/lib/org-perms";

export type PublicShopItem = {
  id: string;
  org_id: string;
  org_name: string | null;
  org_tag: string | null;
  item_name: string;
  item_ref: string | null;
  item_kind: string | null;
  category: string | null;
  quality: number | null;
  unit: string;
  available_qty: number;
  unit_price: number;
  sale_note: string | null;
};

/**
 * Aggregated public shop group. One group = alle Positionen desselben Items
 * innerhalb einer Orga zusammengefasst. Käufer sehen nur Gesamtmenge und
 * niedrigsten Preis, nicht die einzelnen Halter/Standorte.
 */
export type PublicShopGroup = {
  key: string;
  org_id: string;
  org_name: string | null;
  org_tag: string | null;
  item_name: string;
  item_ref: string | null;
  item_kind: string | null;
  category: string | null;
  unit: string;
  available_qty: number;
  min_unit_price: number;
  max_unit_price: number;
  sale_note: string | null;
  position_count: number;
};

export type ShopReservationAllocation = {
  id: string;
  warehouse_id: string;
  qty: number;
  unit: string;
  quality: number | null;
  held_by_callsign: string | null;
  location_name: string | null;
  position_qty: number;
  position_reserved: number;
  position_sale_qty: number;
};

export type ShopWarehousePosition = {
  id: string;
  qty: number;
  reserved_qty: number;
  sale_qty: number;
  quality: number | null;
  unit: string;
  held_by_callsign: string | null;
  location_name: string | null;
  allocated_here: number;
  free_for_realloc: number;
};

export type ShopReservationRow = {
  id: string;
  warehouse_id: string;
  org_id: string;
  item_ref: string | null;
  item_name: string;
  qty: number;
  unit: string;
  unit_price: number;
  total_price: number;
  buyer_ingame_name: string;
  buyer_discord_name: string;
  buyer_note: string | null;
  internal_notes: string | null;
  status: ShopReservationStatus;
  created_at: string;
};

export type ShopReservationStatus =
  | "pending"
  | "reserved"
  | "in_progress"
  | "fulfilled"
  | "cancelled";

export const SHOP_STATUS_LABELS: Record<ShopReservationStatus, string> = {
  pending: "Eingegangen",
  reserved: "Reserviert",
  in_progress: "In Bearbeitung",
  fulfilled: "Erfüllt",
  cancelled: "Storniert",
};

export type ShopReservationHistoryEntry = {
  id: string;
  reservation_id: string;
  from_status: ShopReservationStatus | null;
  to_status: ShopReservationStatus;
  note: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
};

function makeServerPublicClient() {
  return createDbClient({ kind: "anon" });
}

async function assertWarehouseManager(userId: string, orgId: string) {
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
  const customPerms =
    (data.org_custom_roles as { permissions: string[] } | null)?.permissions ??
    [];
  const merged = mergePerms(data.permissions as string[] | null, customPerms);
  if (!hasPerm(data.role as string, merged, "warehouse.manage" as OrgPerm)) {
    throw new Error("Nur die Lagerverwaltung darf das.");
  }
  return { role: data.role as string, permissions: merged };
}

/** Public: lists all shop items across all orgs (safe projection). */
export const listPublicShopItems = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin
      .from("org_warehouse")
      .select(
        "id, org_id, item_ref, item_name, item_kind, category, quality, unit, qty, sale_qty, reserved_qty, sale_price, sale_note, orgs:org_id(name, tag)",
      )
      .eq("for_sale", true)
      .eq("locked", false);
    if (error) throw new Error(error.message);
    const items: PublicShopItem[] = (data ?? [])
      .map((r) => {
        const org = r.orgs as { name?: string; tag?: string } | null;
        const qty = Number(r.qty ?? 0);
        const reserved = Number(r.reserved_qty ?? 0);
        const offered = Math.min(Number((r as { sale_qty?: number }).sale_qty ?? 0), qty);
        const available = offered - reserved;
        return {
          id: r.id as string,
          org_id: r.org_id as string,
          org_name: org?.name ?? null,
          org_tag: org?.tag ?? null,
          item_name: (r.item_name as string) ?? "Item",
          item_ref: (r.item_ref as string | null) ?? null,
          item_kind: (r.item_kind as string | null) ?? null,
          category: (r.category as string | null) ?? null,
          quality: (r.quality as number | null) ?? null,
          unit: (r.unit as string) ?? "pcs",
          available_qty: available,
          unit_price: Number(r.sale_price ?? 0),
          sale_note: (r.sale_note as string | null) ?? null,
        };
      })
      .filter((r) => r.available_qty > 0);
    return { items };
  },
);

/** Public: aggregate items into groups (one per item + org). */
export const listPublicShopGroups = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data, error } = await supabaseAdmin
      .from("org_warehouse")
      .select(
        "id, org_id, item_ref, item_name, item_kind, category, unit, qty, sale_qty, reserved_qty, sale_price, sale_note, orgs:org_id(name, tag)",
      )
      .eq("for_sale", true)
      .eq("locked", false);
    if (error) throw new Error(error.message);

    const map = new Map<string, PublicShopGroup>();
    for (const r of data ?? []) {
      const qty = Number(r.qty ?? 0);
      const reserved = Number(r.reserved_qty ?? 0);
      const offered = Math.min(Number((r as { sale_qty?: number }).sale_qty ?? 0), qty);
      const avail = Math.max(0, offered - reserved);
      if (avail <= 0) continue;
      const price = Number(r.sale_price ?? 0);
      const orgId = r.org_id as string;
      const ref = (r.item_ref as string | null) ?? null;
      const name = (r.item_name as string) ?? "Item";
      const key = `${orgId}::${ref ?? `n:${name.trim().toLowerCase()}`}`;
      const org = r.orgs as { name?: string; tag?: string } | null;
      const g = map.get(key);
      if (g) {
        g.available_qty += avail;
        g.min_unit_price = Math.min(g.min_unit_price, price);
        g.max_unit_price = Math.max(g.max_unit_price, price);
        g.position_count += 1;
        if (!g.sale_note && r.sale_note) g.sale_note = r.sale_note as string;
      } else {
        map.set(key, {
          key,
          org_id: orgId,
          org_name: org?.name ?? null,
          org_tag: org?.tag ?? null,
          item_name: name,
          item_ref: ref,
          item_kind: (r.item_kind as string | null) ?? null,
          category: (r.category as string | null) ?? null,
          unit: (r.unit as string) ?? "pcs",
          available_qty: avail,
          min_unit_price: price,
          max_unit_price: price,
          sale_note: (r.sale_note as string | null) ?? null,
          position_count: 1,
        });
      }
    }
    return { groups: Array.from(map.values()) };
  },
);

/** Public: create a shop reservation (buyer submits ingame + discord names). */
export const createShopReservation = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        qty: z.number().positive().max(1_000_000),
        buyer_ingame_name: z.string().trim().min(2).max(40),
        buyer_discord_name: z.string().trim().min(2).max(60),
        buyer_note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rid, error } = await supabaseAdmin.rpc(
      "create_shop_reservation",
      {
        _warehouse_id: data.warehouse_id,
        _qty: data.qty,
        _buyer_ingame: data.buyer_ingame_name,
        _buyer_discord: data.buyer_discord_name,
        _buyer_note: data.buyer_note ?? "",
      },
    );
    if (error) throw new Error(error.message);

    // Fanout notification to warehouse managers of that org (best effort).
    try {
      const { data: reservation } = await supabaseAdmin
        .from("shop_reservations")
        .select("org_id, item_name, qty, unit, buyer_ingame_name")
        .eq("id", rid as string)
        .maybeSingle();
      if (reservation) {
        const { fanoutToOrgPerm } = await import("@/lib/notifications.server");
        await fanoutToOrgPerm(
          reservation.org_id as string,
          ["warehouse.manage"],
          {
            kind: "shop.reservation.new",
            title: "Neue Shop-Reservierung",
            body: `${reservation.item_name} · ${reservation.qty} ${reservation.unit ?? "pcs"} · ${reservation.buyer_ingame_name}`,
            link: "/orga/shop",
            ref_table: "shop_reservations",
            ref_id: rid as string,
          },
          undefined,
        );
      }
    } catch { /* best effort */ }

    return { ok: true, id: rid as string };
  });

/** Public: create a group-based reservation across all matching positions. */
export const createShopReservationGroup = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        item_ref: z.string().max(200).nullable().optional(),
        item_name: z.string().trim().min(1).max(200),
        qty: z.number().positive().max(1_000_000),
        buyer_ingame_name: z.string().trim().min(2).max(40),
        buyer_discord_name: z.string().trim().min(2).max(60),
        buyer_note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rid, error } = await supabaseAdmin.rpc(
      "create_shop_reservation_group",
      {
        _org_id: data.org_id,
        _item_ref: (data.item_ref ?? null) as unknown as string,
        _item_name: data.item_name,
        _qty: data.qty,
        _buyer_ingame: data.buyer_ingame_name,
        _buyer_discord: data.buyer_discord_name,
        _buyer_note: data.buyer_note ?? "",
      },
    );
    if (error) throw new Error(error.message);

    try {
      const { fanoutToOrgPerm } = await import("@/lib/notifications.server");
      await fanoutToOrgPerm(
        data.org_id,
        ["warehouse.manage"],
        {
          kind: "shop.reservation.new",
          title: "Neue Shop-Reservierung",
          body: `${data.item_name} · ${data.qty} · ${data.buyer_ingame_name}`,
          link: "/orga/shop",
          ref_table: "shop_reservations",
          ref_id: rid as string,
        },
        undefined,
      );
    } catch { /* best effort */ }

    return { ok: true, id: rid as string };
  });

/** Auth: warehouse.manage sets or clears sale flag with price. */
export const setWarehouseItemForSale = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        warehouse_id: z.string().uuid(),
        for_sale: z.boolean(),
        unit_price: z.number().nonnegative().max(1e12).optional(),
        sale_qty: z.number().nonnegative().max(1e9).optional(),
        sale_note: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: wh, error } = await supabaseAdmin
      .from("org_warehouse")
      .select("org_id, qty, reserved_qty")
      .eq("id", data.warehouse_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!wh) throw new Error("Lagereintrag nicht gefunden.");
    await assertWarehouseManager(context.userId, wh.org_id as string);
    if (data.for_sale) {
      if (data.unit_price == null)
        throw new Error("Preis pro Einheit ist erforderlich.");
      const totalQty = Number(wh.qty ?? 0);
      const reserved = Number(wh.reserved_qty ?? 0);
      const saleQty = Number(data.sale_qty ?? 0);
      if (saleQty <= 0)
        throw new Error("Bitte Verkaufsmenge angeben (mind. 1).");
      if (saleQty > totalQty)
        throw new Error(`Verkaufsmenge (${saleQty}) übersteigt Bestand (${totalQty}).`);
      if (saleQty < reserved)
        throw new Error(
          `Es sind bereits ${reserved} reserviert — Verkaufsmenge darf nicht kleiner sein.`,
        );
      const { error: ue } = await supabaseAdmin
        .from("org_warehouse")
        .update({
          for_sale: true,
          sale_price: data.unit_price,
          sale_qty: saleQty,
          sale_note: data.sale_note ?? null,
        } as never)
        .eq("id", data.warehouse_id);
      if (ue) throw new Error(ue.message);
    } else {
      if (Number(wh.reserved_qty ?? 0) > 0)
        throw new Error(
          "Es gibt offene Reservierungen — bitte zuerst schließen.",
        );
      const { error: ue } = await supabaseAdmin
        .from("org_warehouse")
        .update({
          for_sale: false,
          sale_price: null,
          sale_qty: 0,
          sale_note: null,
        } as never)
        .eq("id", data.warehouse_id);
      if (ue) throw new Error(ue.message);
    }
    return { ok: true };
  });

/** Auth: list warehouse items for shop management (mgr view). */
export const listShopManageableItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ orgId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWarehouseManager(context.userId, data.orgId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: rows, error } = await supabaseAdmin
      .from("org_warehouse")
      .select(
        "id, item_name, item_ref, item_kind, category, quality, unit, qty, sale_qty, reserved_qty, sale_price, sale_note, for_sale, locked, held_by, location_id",
      )
      .eq("org_id", data.orgId)
      .order("item_name");
    if (error) throw new Error(error.message);
    const rowList = rows ?? [];
    // Resolve holder callsigns + location names in one round-trip each.
    const holderIds = Array.from(
      new Set(
        rowList
          .map((r) => r.held_by as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const locIds = Array.from(
      new Set(
        rowList
          .map((r) => r.location_id as string | null)
          .filter((v): v is string => !!v),
      ),
    );
    const holderMap = new Map<string, string>();
    if (holderIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, callsign, display_name")
        .in("id", holderIds);
      for (const p of profs ?? []) {
        holderMap.set(
          p.id as string,
          ((p.callsign as string) || (p.display_name as string)) ?? "",
        );
      }
    }
    const locMap = new Map<string, string>();
    if (locIds.length > 0) {
      const { data: locs } = await supabaseAdmin
        .from("inventory_locations")
        .select("id, name")
        .in("id", locIds);
      for (const l of locs ?? []) locMap.set(l.id as string, l.name as string);
    }
    const items = rowList.map((r) => ({
      ...r,
      held_by_callsign: r.held_by
        ? holderMap.get(r.held_by as string) ?? null
        : null,
      location_name: r.location_id
        ? locMap.get(r.location_id as string) ?? null
        : null,
    }));
    return { items };
  });

/** Auth: list shop reservations for org. */
export const listShopReservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        orgId: z.string().uuid(),
        status: z
          .enum(["pending", "fulfilled", "cancelled", "all"])
          .default("pending"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertWarehouseManager(context.userId, data.orgId);
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    let q = supabaseAdmin
      .from("shop_reservations")
      .select(
        "id, warehouse_id, org_id, item_ref, item_name, qty, unit, unit_price, total_price, buyer_ingame_name, buyer_discord_name, buyer_note, internal_notes, status, created_at",
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { data: rows, error } = await q.limit(500);
    if (error) throw new Error(error.message);
    return { reservations: (rows ?? []) as ShopReservationRow[] };
  });

/** Auth: change reservation status and log history. */
export const updateShopReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        reservation_id: z.string().uuid(),
        to_status: z.enum([
          "pending",
          "reserved",
          "in_progress",
          "fulfilled",
          "cancelled",
        ]),
        note: z.string().trim().max(1000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: res, error } = await supabaseAdmin
      .from("shop_reservations")
      .select("id, org_id, warehouse_id, qty, status")
      .eq("id", data.reservation_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!res) throw new Error("Reservierung nicht gefunden.");
    await assertWarehouseManager(context.userId, res.org_id as string);

    const from = res.status as ShopReservationStatus;
    const to = data.to_status;
    if (from === to) throw new Error("Status ist bereits gesetzt.");
    if (from === "fulfilled" || from === "cancelled")
      throw new Error(
        "Reservierung ist abgeschlossen und kann nicht geändert werden.",
      );

    // Collect allocations for this reservation. Legacy reservations may have
    // only warehouse_id set on the row itself; treat that as one allocation.
    let allocations: { id: string | null; warehouse_id: string; qty: number }[] = [];
    const { data: allocRows } = await supabaseAdmin
      .from("shop_reservation_allocations")
      .select("id, warehouse_id, qty")
      .eq("reservation_id", res.id as string);
    if ((allocRows ?? []).length > 0) {
      allocations = (allocRows ?? []).map((a) => ({
        id: a.id as string,
        warehouse_id: a.warehouse_id as string,
        qty: Number(a.qty),
      }));
    } else if (res.warehouse_id) {
      allocations = [
        {
          id: null,
          warehouse_id: res.warehouse_id as string,
          qty: Number(res.qty ?? 0),
        },
      ];
    }

    if (to === "fulfilled" || to === "cancelled") {
      for (const a of allocations) {
        const { data: wh } = await supabaseAdmin
          .from("org_warehouse")
          .select("id, qty, reserved_qty, sale_qty")
          .eq("id", a.warehouse_id)
          .maybeSingle();
        if (!wh) continue;
        const curQty = Number(wh.qty ?? 0);
        const curReserved = Number(wh.reserved_qty ?? 0);
        const curSaleQty = Number((wh as { sale_qty?: number }).sale_qty ?? 0);
        const newReserved = Math.max(0, curReserved - a.qty);
        if (to === "cancelled") {
          await supabaseAdmin
            .from("org_warehouse")
            .update({ reserved_qty: newReserved })
            .eq("id", a.warehouse_id);
        } else {
          const newQty = Math.max(0, curQty - a.qty);
          const newSaleQty = Math.max(0, Math.min(curSaleQty - a.qty, newQty));
          const patch =
            newQty <= 0
              ? {
                  qty: newQty,
                  reserved_qty: newReserved,
                  for_sale: false,
                  sale_price: null,
                  sale_qty: 0,
                  sale_note: null,
                }
              : { qty: newQty, reserved_qty: newReserved, sale_qty: newSaleQty };
          await supabaseAdmin
            .from("org_warehouse")
            .update(patch as never)
            .eq("id", a.warehouse_id);
        }
      }
      // Remove allocation rows (audit stays via history + updated reservation).
      await supabaseAdmin
        .from("shop_reservation_allocations")
        .delete()
        .eq("reservation_id", res.id as string);
    }
    // pending/reserved/in_progress keep the stock reservation intact.

    const terminal = to === "fulfilled" || to === "cancelled";
    const { error: se } = await supabaseAdmin
      .from("shop_reservations")
      .update({
        status: to,
        decided_by: terminal ? context.userId : null,
        decided_at: terminal ? new Date().toISOString() : null,
      })
      .eq("id", res.id as string);
    if (se) throw new Error(se.message);

    await supabaseAdmin.from("shop_reservation_history").insert({
      reservation_id: res.id as string,
      org_id: res.org_id as string,
      from_status: from,
      to_status: to,
      note: data.note?.trim() || null,
      actor_id: context.userId,
    });
    return { ok: true };
  });

/** Auth: set / clear the internal note on a reservation. */
export const setShopReservationInternalNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        reservation_id: z.string().uuid(),
        note: z.string().trim().max(2000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: res, error } = await supabaseAdmin
      .from("shop_reservations")
      .select("id, org_id")
      .eq("id", data.reservation_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!res) throw new Error("Reservierung nicht gefunden.");
    await assertWarehouseManager(context.userId, res.org_id as string);
    const { error: ue } = await supabaseAdmin
      .from("shop_reservations")
      .update({ internal_notes: data.note || null })
      .eq("id", data.reservation_id);
    if (ue) throw new Error(ue.message);
    return { ok: true };
  });

/** Auth: fetch the history for one reservation. */
export const listShopReservationHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ reservation_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: res } = await supabaseAdmin
      .from("shop_reservations")
      .select("org_id")
      .eq("id", data.reservation_id)
      .maybeSingle();
    if (!res) throw new Error("Reservierung nicht gefunden.");
    await assertWarehouseManager(context.userId, res.org_id as string);
    const { data: rows, error } = await supabaseAdmin
      .from("shop_reservation_history")
      .select(
        "id, reservation_id, from_status, to_status, note, actor_id, created_at, profiles:actor_id(display_name, callsign)",
      )
      .eq("reservation_id", data.reservation_id)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const entries: ShopReservationHistoryEntry[] = (rows ?? []).map((r) => {
      const p = r.profiles as {
        display_name?: string;
        callsign?: string;
      } | null;
      return {
        id: r.id as string,
        reservation_id: r.reservation_id as string,
        from_status: (r.from_status as ShopReservationStatus | null) ?? null,
        to_status: r.to_status as ShopReservationStatus,
        note: (r.note as string | null) ?? null,
        actor_id: (r.actor_id as string | null) ?? null,
        actor_name: p?.display_name ?? p?.callsign ?? null,
        created_at: r.created_at as string,
      };
    });
    return { history: entries };
  });

/** Auth: list allocations (which positions currently hold reservation stock). */
export const listShopReservationAllocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ reservation_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: res } = await supabaseAdmin
      .from("shop_reservations")
      .select("id, org_id, warehouse_id, qty")
      .eq("id", data.reservation_id)
      .maybeSingle();
    if (!res) throw new Error("Reservierung nicht gefunden.");
    await assertWarehouseManager(context.userId, res.org_id as string);

    const { data: allocRows } = await supabaseAdmin
      .from("shop_reservation_allocations")
      .select("id, warehouse_id, qty")
      .eq("reservation_id", data.reservation_id);
    const rows =
      (allocRows ?? []).length > 0
        ? (allocRows ?? []).map((a) => ({
            id: a.id as string,
            warehouse_id: a.warehouse_id as string,
            qty: Number(a.qty),
          }))
        : res.warehouse_id
          ? [
              {
                id: "legacy",
                warehouse_id: res.warehouse_id as string,
                qty: Number(res.qty ?? 0),
              },
            ]
          : [];

    if (rows.length === 0) return { allocations: [] as ShopReservationAllocation[] };

    const whIds = rows.map((r) => r.warehouse_id);
    const { data: whs } = await supabaseAdmin
      .from("org_warehouse")
      .select(
        "id, qty, reserved_qty, sale_qty, quality, unit, held_by, location_id",
      )
      .in("id", whIds);
    const whMap = new Map<string, {
      qty: number; reserved_qty: number; sale_qty: number;
      quality: number | null; unit: string;
      held_by: string | null; location_id: string | null;
    }>();
    for (const w of whs ?? []) {
      whMap.set(w.id as string, {
        qty: Number(w.qty ?? 0),
        reserved_qty: Number(w.reserved_qty ?? 0),
        sale_qty: Number((w as { sale_qty?: number }).sale_qty ?? 0),
        quality: (w.quality as number | null) ?? null,
        unit: (w.unit as string) ?? "pcs",
        held_by: (w.held_by as string | null) ?? null,
        location_id: (w.location_id as string | null) ?? null,
      });
    }

    const holderIds = Array.from(
      new Set(
        Array.from(whMap.values())
          .map((w) => w.held_by)
          .filter((v): v is string => !!v),
      ),
    );
    const locIds = Array.from(
      new Set(
        Array.from(whMap.values())
          .map((w) => w.location_id)
          .filter((v): v is string => !!v),
      ),
    );
    const holderMap = new Map<string, string>();
    if (holderIds.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id, callsign, display_name")
        .in("id", holderIds);
      for (const p of profs ?? [])
        holderMap.set(
          p.id as string,
          ((p.callsign as string) || (p.display_name as string)) ?? "",
        );
    }
    const locMap = new Map<string, string>();
    if (locIds.length > 0) {
      const { data: locs } = await supabaseAdmin
        .from("inventory_locations")
        .select("id, name")
        .in("id", locIds);
      for (const l of locs ?? [])
        locMap.set(l.id as string, l.name as string);
    }

    const allocations: ShopReservationAllocation[] = rows.map((r) => {
      const w = whMap.get(r.warehouse_id);
      return {
        id: r.id,
        warehouse_id: r.warehouse_id,
        qty: r.qty,
        unit: w?.unit ?? "pcs",
        quality: w?.quality ?? null,
        held_by_callsign: w?.held_by ? holderMap.get(w.held_by) ?? null : null,
        location_name: w?.location_id ? locMap.get(w.location_id) ?? null : null,
        position_qty: w?.qty ?? 0,
        position_reserved: w?.reserved_qty ?? 0,
        position_sale_qty: w?.sale_qty ?? 0,
      };
    });
    return { allocations };
  });

// Silence unused import warning for makeServerPublicClient — reserved for
// future public read paths without RLS bypass.
void makeServerPublicClient;