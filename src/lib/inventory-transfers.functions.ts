import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type TransferPerson = {
  id: string;
  callsign: string | null;
  rsi_handle: string | null;
};

export type InventoryTransfer = {
  id: string;
  direction: "in" | "out";
  from_user_id: string;
  to_user_id: string;
  counterpart_name: string | null;
  item_ref: string | null;
  item_name: string;
  item_kind: string | null;
  qty: number;
  unit: "pcs" | "scu";
  quality: number | null;
  note: string | null;
  status: string;
  created_at: string;
};

/** Search members of the same org(s) that can receive items. */
export const searchTransferRecipients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ q: z.string().max(60).optional() }).parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { coOrgMemberIds } = await import("./org-membership.server");
    const ids = (await coOrgMemberIds(supabaseAdmin, context.userId)).filter(
      (id) => id !== context.userId,
    );
    if (ids.length === 0) return { people: [] as TransferPerson[] };
    let q = supabaseAdmin
      .from("profiles")
      .select("id,callsign,rsi_handle")
      .in("id", ids)
      .limit(20);
    const term = (data.q ?? "").trim();
    if (term) q = q.or(`callsign.ilike.%${term}%,rsi_handle.ilike.%${term}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      people: (rows ?? []).map((r) => ({
        id: r.id as string,
        callsign: (r.callsign as string) ?? null,
        rsi_handle: (r.rsi_handle as string) ?? null,
      })) as TransferPerson[],
    };
  });

/** Send (part of) a stack to another member; qty is reserved until answered. */
export const sendInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        item_id: z.string().uuid(),
        to_user_id: z.string().uuid(),
        qty: z.number().positive().max(1_000_000),
        note: z.string().max(300).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    if (data.to_user_id === userId)
      throw new Error("Du kannst dir nichts selbst senden.");

    const { coOrgMemberIds } = await import("./org-membership.server");
    const allowed = await coOrgMemberIds(supabaseAdmin, userId);
    if (!allowed.includes(data.to_user_id))
      throw new Error("Empfänger ist nicht in deiner Orga.");

    const { data: item, error } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("id", data.item_id)
      .eq("owner_id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!item) throw new Error("Stack nicht gefunden.");

    const qty = Number(item.qty ?? 0);
    const reserved = Number(item.qty_reserved ?? 0);
    const free = Math.max(0, qty - reserved);
    if (data.qty > free + 1e-9)
      throw new Error(`Nur ${free} verfügbar (Rest ist reserviert).`);

    const { error: resErr } = await supabaseAdmin
      .from("inventory_items")
      .update({ qty_reserved: reserved + data.qty })
      .eq("id", item.id as string)
      .eq("owner_id", userId);
    if (resErr) throw new Error(resErr.message);

    const { error: insErr } = await supabaseAdmin
      .from("inventory_transfers")
      .insert({
        from_user_id: userId,
        to_user_id: data.to_user_id,
        source_item_id: item.id as string,
        item_ref: (item.item_ref as string) ?? null,
        item_name: item.item_name as string,
        item_kind: (item.item_kind as string) ?? null,
        qty: data.qty,
        unit: (item.unit as string) ?? "pcs",
        quality: (item.quality as number) ?? null,
        note: data.note?.trim() || null,
      });
    if (insErr) {
      await supabaseAdmin
        .from("inventory_items")
        .update({ qty_reserved: reserved })
        .eq("id", item.id as string);
      throw new Error(insErr.message);
    }
    return { ok: true };
  });

/** Open transfers where the user is sender or recipient. */
export const listMyTransfers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: rows, error } = await supabaseAdmin
      .from("inventory_transfers")
      .select("*")
      .eq("status", "pending")
      .or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    const others = Array.from(
      new Set(
        (rows ?? []).map((r) =>
          r.from_user_id === userId
            ? (r.to_user_id as string)
            : (r.from_user_id as string),
        ),
      ),
    );
    const names = new Map<string, string | null>();
    if (others.length > 0) {
      const { data: profs } = await supabaseAdmin
        .from("profiles")
        .select("id,callsign,rsi_handle")
        .in("id", others);
      for (const p of profs ?? [])
        names.set(
          p.id as string,
          ((p.rsi_handle as string) || (p.callsign as string)) ?? null,
        );
    }

    const transfers: InventoryTransfer[] = (rows ?? []).map((r) => {
      const out = r.from_user_id === userId;
      return {
        id: r.id as string,
        direction: out ? "out" : "in",
        from_user_id: r.from_user_id as string,
        to_user_id: r.to_user_id as string,
        counterpart_name:
          names.get((out ? r.to_user_id : r.from_user_id) as string) ?? null,
        item_ref: (r.item_ref as string) ?? null,
        item_name: r.item_name as string,
        item_kind: (r.item_kind as string) ?? null,
        qty: Number(r.qty ?? 0),
        unit: ((r.unit as string) || "pcs") as "pcs" | "scu",
        quality: (r.quality as number) ?? null,
        note: (r.note as string) ?? null,
        status: r.status as string,
        created_at: r.created_at as string,
      };
    });
    return { transfers };
  });

/** Accept / decline (recipient) or cancel (sender) a pending transfer. */
export const respondInventoryTransfer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["accept", "decline", "cancel"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: t, error } = await supabaseAdmin
      .from("inventory_transfers")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!t || t.status !== "pending")
      throw new Error("Sendung nicht gefunden oder bereits bearbeitet.");

    const isRecipient = t.to_user_id === userId;
    const isSender = t.from_user_id === userId;
    if (data.action === "cancel" && !isSender)
      throw new Error("Nur der Absender kann zurückziehen.");
    if (data.action !== "cancel" && !isRecipient)
      throw new Error("Nur der Empfänger kann antworten.");

    const qty = Number(t.qty ?? 0);
    const srcId = (t.source_item_id as string) ?? null;
    const { data: src } = srcId
      ? await supabaseAdmin
          .from("inventory_items")
          .select("*")
          .eq("id", srcId)
          .maybeSingle()
      : { data: null };

    if (data.action !== "accept") {
      if (src) {
        const rest = Math.max(0, Number(src.qty_reserved ?? 0) - qty);
        await supabaseAdmin
          .from("inventory_items")
          .update({ qty_reserved: rest })
          .eq("id", src.id as string);
      }
      await supabaseAdmin
        .from("inventory_transfers")
        .update({
          status: data.action === "cancel" ? "cancelled" : "declined",
          responded_at: new Date().toISOString(),
        })
        .eq("id", t.id as string);
      return { ok: true };
    }

    if (!src) throw new Error("Der Absender besitzt das Item nicht mehr.");
    const srcQty = Number(src.qty ?? 0);
    if (srcQty + 1e-9 < qty)
      throw new Error("Der Absender hat nicht mehr genug Bestand.");

    // Remove from sender
    const newQty = srcQty - qty;
    const newReserved = Math.max(0, Number(src.qty_reserved ?? 0) - qty);
    if (newQty <= 1e-9) {
      await supabaseAdmin
        .from("inventory_items")
        .delete()
        .eq("id", src.id as string);
    } else {
      await supabaseAdmin
        .from("inventory_items")
        .update({ qty: newQty, qty_reserved: newReserved })
        .eq("id", src.id as string);
    }

    // Add to recipient (merge on same ref/unit/quality, no location)
    const itemRef = (t.item_ref as string) ?? null;
    const unit = ((t.unit as string) || "pcs") as string;
    const quality = (t.quality as number) ?? null;
    let mergedId: string | null = null;
    if (itemRef) {
      let mq = supabaseAdmin
        .from("inventory_items")
        .select("id,qty")
        .eq("owner_id", userId)
        .eq("item_ref", itemRef)
        .eq("unit", unit)
        .is("location_id", null);
      mq = quality != null ? mq.eq("quality", quality) : mq.is("quality", null);
      const { data: existing } = await mq.maybeSingle();
      if (existing?.id) {
        mergedId = existing.id as string;
        await supabaseAdmin
          .from("inventory_items")
          .update({ qty: Number(existing.qty ?? 0) + qty })
          .eq("id", mergedId);
      }
    }
    if (!mergedId) {
      const { error: insErr } = await supabaseAdmin
        .from("inventory_items")
        .insert({
          owner_id: userId,
          item_ref: itemRef,
          item_name: t.item_name as string,
          item_kind: (t.item_kind as string) ?? null,
          qty,
          qty_reserved: 0,
          unit,
          quality,
          location_id: null,
          visibility: "private",
        });
      if (insErr) throw new Error(insErr.message);
    }

    await supabaseAdmin
      .from("inventory_transfers")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("id", t.id as string);
    return { ok: true };
  });