import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { hasPerm, mergePerms, type OrgPerm } from "@/lib/org-perms";


export type TreasuryEntry = {
  id: string;
  org_id: string;
  kind: "deposit" | "withdraw" | "expense" | "adjust";
  amount_auec: number;
  player_id: string | null;
  player_callsign: string | null;
  description: string | null;
  category: string | null;
  booked_by: string;
  booked_by_callsign: string | null;
  booked_at: string;
};

export type TreasurySummary = {
  balance: number;
  totals: {
    deposit: number;
    withdraw: number;
    expense: number;
    adjust: number;
  };
  perPlayer: Array<{
    user_id: string;
    callsign: string | null;
    deposited: number;
    withdrawn: number;
    net: number;
    count: number;
    last_at: string | null;
  }>;
  perMonth: Array<{
    month: string; // YYYY-MM
    deposit: number;
    withdraw: number;
    expense: number;
    net: number;
  }>;
  perCategory: Array<{
    category: string;
    deposit: number;
    expense: number;
    count: number;
  }>;
  currentMonth: { deposit: number; expense: number; net: number };
  previousMonth: { deposit: number; expense: number; net: number };
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

function signOf(kind: TreasuryEntry["kind"], amount: number): number {
  switch (kind) {
    case "deposit":
      return Math.abs(amount);
    case "withdraw":
    case "expense":
      return -Math.abs(amount);
    case "adjust":
      return amount;
  }
}

export type TreasuryCategory = {
  id: string;
  org_id: string;
  name: string;
  kind: "deposit" | "expense" | "both";
  color: string;
  sort_order: number;
};

/** Lists the org's defined treasury categories (all members). */
export const listTreasuryCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    const { data: rows, error } = await supabaseAdmin
      .from("org_treasury_categories")
      .select("*")
      .eq("org_id", data.org_id)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    const categories: TreasuryCategory[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      name: r.name as string,
      kind: (r.kind as TreasuryCategory["kind"]) ?? "both",
      color: (r.color as string) ?? "#22d3ee",
      sort_order: Number(r.sort_order ?? 0),
    }));
    return {
      categories,
      canManage: hasPerm(role, permissions, "treasury.manage"),
    };
  });

/** Creates or updates a treasury category. */
export const upsertTreasuryCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        id: z.string().uuid().optional().nullable(),
        name: z.string().trim().min(1).max(60),
        kind: z.enum(["deposit", "expense", "both"]).default("both"),
        color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/)
          .default("#22d3ee"),
        sort_order: z.number().int().min(0).max(999).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    if (!hasPerm(role, permissions, "treasury.manage"))
      throw new Error("Keine Berechtigung für Kategorien.");

    if (data.id) {
      const { data: existing } = await supabaseAdmin
        .from("org_treasury_categories")
        .select("org_id, name")
        .eq("id", data.id)
        .maybeSingle();
      if (!existing || existing.org_id !== data.org_id)
        throw new Error("Kategorie nicht gefunden.");
      const { error } = await supabaseAdmin
        .from("org_treasury_categories")
        .update({
          name: data.name,
          kind: data.kind,
          color: data.color,
          ...(data.sort_order !== undefined ? { sort_order: data.sort_order } : {}),
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      // Keep existing bookings in sync with the renamed category.
      if ((existing.name as string) !== data.name) {
        await supabaseAdmin
          .from("org_treasury_entries")
          .update({ category: data.name })
          .eq("org_id", data.org_id)
          .eq("category", existing.name as string);
      }
      return { ok: true, id: data.id };
    }

    const { data: created, error } = await supabaseAdmin
      .from("org_treasury_categories")
      .insert({
        org_id: data.org_id,
        name: data.name,
        kind: data.kind,
        color: data.color,
        sort_order: data.sort_order ?? 0,
      })
      .select("id")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { ok: true, id: created?.id as string | undefined };
  });

/** Deletes a treasury category (bookings keep their text label). */
export const deleteTreasuryCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row } = await supabaseAdmin
      .from("org_treasury_categories")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Kategorie nicht gefunden.");
    const { role, permissions } = await assertMember(
      context.userId,
      row.org_id as string,
    );
    if (!hasPerm(role, permissions, "treasury.manage"))
      throw new Error("Keine Berechtigung für Kategorien.");
    const { error } = await supabaseAdmin
      .from("org_treasury_categories")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lists treasury entries with computed summary. */
export const listTreasuryEntries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    const canBook = hasPerm(role, permissions, "treasury.manage");
    const canSeePlayers =
      canBook || hasPerm(role, permissions, "treasury.report");
    const { data: rows, error } = await supabaseAdmin
      .from("org_treasury_entries")
      .select("*")
      .eq("org_id", data.org_id)
      .order("booked_at", { ascending: false })
      .limit(1000);
    if (error) throw new Error(error.message);
    const userIds = Array.from(
      new Set(
        [
          ...(rows ?? []).map((r) => r.player_id as string | null),
          ...(rows ?? []).map((r) => r.booked_by as string | null),
        ].filter((x): x is string => !!x),
      ),
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign, rsi_handle")
      .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const callsigns = new Map<string, string>(
      (profiles ?? []).map((p) => [
        p.id as string,
        ((p.rsi_handle as string | null) || (p.callsign as string)) ?? "",
      ]),
    );
    const entries: TreasuryEntry[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      kind: r.kind as TreasuryEntry["kind"],
      amount_auec: Number(r.amount_auec ?? 0),
      player_id: (r.player_id as string) ?? null,
      player_callsign: r.player_id
        ? callsigns.get(r.player_id as string) ?? null
        : null,
      description: (r.description as string) ?? null,
      category: (r.category as string) ?? null,
      booked_by: r.booked_by as string,
      booked_by_callsign: callsigns.get(r.booked_by as string) ?? null,
      booked_at: r.booked_at as string,
    }));

    const totals = { deposit: 0, withdraw: 0, expense: 0, adjust: 0 };
    const perPlayer = new Map<
      string,
      {
        deposited: number;
        withdrawn: number;
        count: number;
        last_at: string | null;
        callsign: string | null;
      }
    >();
    const perMonth = new Map<
      string,
      { deposit: number; withdraw: number; expense: number; net: number }
    >();
    const perCategory = new Map<
      string,
      { deposit: number; expense: number; count: number }
    >();
    let balance = 0;
    const now = new Date();
    const curKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    const prevDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const prevKey = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const currentMonth = { deposit: 0, expense: 0, net: 0 };
    const previousMonth = { deposit: 0, expense: 0, net: 0 };
    for (const e of entries) {
      totals[e.kind] += Math.abs(e.amount_auec);
      const signed = signOf(e.kind, e.amount_auec);
      balance += signed;
      const d = new Date(e.booked_at);
      const mKey = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      const mo = perMonth.get(mKey) ?? { deposit: 0, withdraw: 0, expense: 0, net: 0 };
      if (e.kind === "deposit") mo.deposit += Math.abs(e.amount_auec);
      else if (e.kind === "withdraw") mo.withdraw += Math.abs(e.amount_auec);
      else if (e.kind === "expense") mo.expense += Math.abs(e.amount_auec);
      mo.net += signed;
      perMonth.set(mKey, mo);

      if (mKey === curKey) {
        if (e.kind === "deposit") currentMonth.deposit += Math.abs(e.amount_auec);
        if (e.kind === "expense") currentMonth.expense += Math.abs(e.amount_auec);
        currentMonth.net += signed;
      } else if (mKey === prevKey) {
        if (e.kind === "deposit") previousMonth.deposit += Math.abs(e.amount_auec);
        if (e.kind === "expense") previousMonth.expense += Math.abs(e.amount_auec);
        previousMonth.net += signed;
      }

      if (e.category && (e.kind === "deposit" || e.kind === "expense")) {
        const c = perCategory.get(e.category) ?? { deposit: 0, expense: 0, count: 0 };
        if (e.kind === "deposit") c.deposit += Math.abs(e.amount_auec);
        else c.expense += Math.abs(e.amount_auec);
        c.count += 1;
        perCategory.set(e.category, c);
      }

      if (e.player_id && (e.kind === "deposit" || e.kind === "withdraw")) {
        const prev = perPlayer.get(e.player_id) ?? {
          deposited: 0,
          withdrawn: 0,
          count: 0,
          last_at: null as string | null,
          callsign: e.player_callsign,
        };
        if (e.kind === "deposit") prev.deposited += Math.abs(e.amount_auec);
        else prev.withdrawn += Math.abs(e.amount_auec);
        prev.count += 1;
        if (!prev.last_at || e.booked_at > prev.last_at) prev.last_at = e.booked_at;
        prev.callsign = e.player_callsign ?? prev.callsign;
        perPlayer.set(e.player_id, prev);
      }
    }

    const summary: TreasurySummary = {
      balance,
      totals,
      perPlayer: Array.from(perPlayer.entries())
        .map(([user_id, v]) => ({
          user_id,
          callsign: v.callsign,
          deposited: v.deposited,
          withdrawn: v.withdrawn,
          net: v.deposited - v.withdrawn,
          count: v.count,
          last_at: v.last_at,
        }))
        .sort((a, b) => b.net - a.net || b.deposited - a.deposited),
      perMonth: Array.from(perMonth.entries())
        .map(([month, v]) => ({ month, ...v }))
        .sort((a, b) => a.month.localeCompare(b.month)),
      perCategory: Array.from(perCategory.entries())
        .map(([category, v]) => ({ category, ...v }))
        .sort((a, b) => b.deposit + b.expense - (a.deposit + a.expense)),
      currentMonth,
      previousMonth,
    };

    if (!canSeePlayers) {
      const anonymized: TreasuryEntry[] = entries.map((e) => ({
        ...e,
        player_id: null,
        player_callsign: null,
        booked_by: "",
        booked_by_callsign: null,
      }));
      return {
        entries: anonymized,
        summary: { ...summary, perPlayer: [] },
        canSeePlayers,
        canBook,
      };
    }

    return { entries, summary, canSeePlayers, canBook };
  });

/** Treasurer creates a booking. */
export const createTreasuryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        kind: z.enum(["deposit", "withdraw", "expense", "adjust"]),
        amount_auec: z.number(),
        player_id: z.string().uuid().optional().nullable(),
        description: z.string().trim().max(500).optional().nullable(),
        category: z.string().trim().max(60).optional().nullable(),
        booked_at: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    if (!hasPerm(role, permissions, "treasury.manage")) throw new Error("Nur Treasurer/Officer/Owner dürfen buchen.");
    if ((data.kind === "deposit" || data.kind === "withdraw") && !data.player_id)
      throw new Error("Ein-/Auszahlung erfordert einen Spieler.");
    const { error } = await supabaseAdmin.from("org_treasury_entries").insert({
      org_id: data.org_id,
      kind: data.kind,
      amount_auec: data.amount_auec,
      player_id: data.player_id ?? null,
      description: data.description ?? null,
      category: data.category ?? null,
      booked_by: context.userId,
      booked_at: data.booked_at ?? new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    const { announceBooking } = await import("@/lib/treasury-discord.server");
    await announceBooking(supabaseAdmin, data.org_id, {
      kind: data.kind,
      amount: data.amount_auec,
      playerId: data.player_id ?? null,
      description: data.description ?? null,
      category: data.category ?? null,
    });
    return { ok: true };
  });

/** Treasurer edits an existing booking. */
export const updateTreasuryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        kind: z.enum(["deposit", "withdraw", "expense", "adjust"]),
        amount_auec: z.number(),
        player_id: z.string().uuid().optional().nullable(),
        description: z.string().trim().max(500).optional().nullable(),
        category: z.string().trim().max(60).optional().nullable(),
        booked_at: z.string().datetime().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row } = await supabaseAdmin
      .from("org_treasury_entries")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Eintrag nicht gefunden.");
    const { role, permissions } = await assertMember(
      context.userId,
      row.org_id as string,
    );
    if (!hasPerm(role, permissions, "treasury.manage"))
      throw new Error("Keine Berechtigung.");
    if ((data.kind === "deposit" || data.kind === "withdraw") && !data.player_id)
      throw new Error("Ein-/Auszahlung erfordert einen Spieler.");
    const { error } = await supabaseAdmin
      .from("org_treasury_entries")
      .update({
        kind: data.kind,
        amount_auec: data.amount_auec,
        player_id:
          data.kind === "expense" || data.kind === "adjust"
            ? (data.player_id ?? null)
            : data.player_id!,
        description: data.description ?? null,
        category: data.category ?? null,
        ...(data.booked_at ? { booked_at: data.booked_at } : {}),
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Treasurer deletes a booking. */
export const deleteTreasuryEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: row } = await supabaseAdmin
      .from("org_treasury_entries")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Eintrag nicht gefunden.");
    const { role, permissions } = await assertMember(context.userId, row.org_id as string);
    if (!hasPerm(role, permissions, "treasury.manage")) throw new Error("Keine Berechtigung.");
    const { error } = await supabaseAdmin
      .from("org_treasury_entries")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type TreasuryRequest = {
  id: string;
  org_id: string;
  kind: "deposit" | "withdraw";
  amount_auec: number;
  player_id: string;
  player_callsign: string | null;
  reason: string | null;
  category: string | null;
  status: "pending" | "approved" | "rejected" | "cancelled";
  reviewed_by: string | null;
  reviewed_by_callsign: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  resulting_entry_id: string | null;
  created_at: string;
};

/** Member submits a deposit/withdraw request. */
export const createTreasuryRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        kind: z.enum(["deposit", "withdraw"]),
        amount_auec: z.number().positive(),
        reason: z.string().trim().max(500).optional().nullable(),
        category: z.string().trim().max(60).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    await assertMember(context.userId, data.org_id);
    if (data.kind === "withdraw" && !data.reason?.trim())
      throw new Error("Bei Auszahlungen ist eine Begründung erforderlich.");
    const { error } = await supabaseAdmin.from("org_treasury_requests").insert({
      org_id: data.org_id,
      kind: data.kind,
      amount_auec: data.amount_auec,
      player_id: context.userId,
      reason: data.reason?.trim() || null,
      category: data.category?.trim() || null,
      status: "pending",
    });
    if (error) throw new Error(error.message);
    try {
      const { fanoutToOrgPerm } = await import("@/lib/notifications.server");
      const fmt = new Intl.NumberFormat("de-DE").format(data.amount_auec);
      await fanoutToOrgPerm(
        data.org_id,
        ["treasury.manage"],
        {
          kind: "treasury.request",
          title:
            data.kind === "deposit"
              ? "Neue Spendenanfrage in die Orgakasse"
              : "Neue Auszahlungsanfrage aus der Orgakasse",
          body: `${fmt} aUEC${data.reason ? ` · ${data.reason}` : ""}`,
          link: "/orga/kasse",
          ref_table: "org_treasury_requests",
          ref_id: null,
        },
        context.userId,
      );
    } catch { /* best-effort */ }
    return { ok: true };
  });

/** List requests visible to the user in the org. */
export const listTreasuryRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    const canReview = hasPerm(role, permissions, "treasury.manage");
    let query = supabaseAdmin
      .from("org_treasury_requests")
      .select("*")
      .eq("org_id", data.org_id)
      .order("created_at", { ascending: false })
      .limit(500);
    if (!canReview) query = query.eq("player_id", context.userId);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const userIds = Array.from(
      new Set(
        [
          ...(rows ?? []).map((r) => r.player_id as string),
          ...(rows ?? []).map((r) => r.reviewed_by as string | null),
        ].filter((x): x is string => !!x),
      ),
    );
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign")
      .in("id", userIds.length > 0 ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const callsigns = new Map<string, string>(
      (profiles ?? []).map((p) => [p.id as string, p.callsign as string]),
    );
    const requests: TreasuryRequest[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      org_id: r.org_id as string,
      kind: r.kind as TreasuryRequest["kind"],
      amount_auec: Number(r.amount_auec ?? 0),
      player_id: r.player_id as string,
      player_callsign: callsigns.get(r.player_id as string) ?? null,
      reason: (r.reason as string) ?? null,
      category: (r.category as string) ?? null,
      status: r.status as TreasuryRequest["status"],
      reviewed_by: (r.reviewed_by as string) ?? null,
      reviewed_by_callsign: r.reviewed_by
        ? callsigns.get(r.reviewed_by as string) ?? null
        : null,
      reviewed_at: (r.reviewed_at as string) ?? null,
      review_note: (r.review_note as string) ?? null,
      resulting_entry_id: (r.resulting_entry_id as string) ?? null,
      created_at: r.created_at as string,
    }));
    return { requests, canReview };
  });

/** Treasurer approves/rejects a pending request. Approving books it. */
export const reviewTreasuryRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        action: z.enum(["approve", "reject"]),
        note: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: req } = await supabaseAdmin
      .from("org_treasury_requests")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) throw new Error("Anfrage nicht gefunden.");
    if (req.status !== "pending") throw new Error("Anfrage ist nicht mehr offen.");
    const { role, permissions } = await assertMember(context.userId, req.org_id as string);
    if (!hasPerm(role, permissions, "treasury.manage"))
      throw new Error("Keine Berechtigung.");

    if (data.action === "reject") {
      const { error } = await supabaseAdmin
        .from("org_treasury_requests")
        .update({
          status: "rejected",
          reviewed_by: context.userId,
          reviewed_at: new Date().toISOString(),
          review_note: data.note ?? null,
        })
        .eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true };
    }

    const desc = `Freigegebene Anfrage${req.reason ? `: ${req.reason}` : ""}`;
    const { data: entry, error: entryErr } = await supabaseAdmin
      .from("org_treasury_entries")
      .insert({
        org_id: req.org_id,
        kind: req.kind as "deposit" | "withdraw",
        amount_auec: req.amount_auec,
        player_id: req.player_id,
        description: desc,
        category: req.category,
        booked_by: context.userId,
        booked_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (entryErr) throw new Error(entryErr.message);
    const { error } = await supabaseAdmin
      .from("org_treasury_requests")
      .update({
        status: "approved",
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        review_note: data.note ?? null,
        resulting_entry_id: entry.id,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    const { announceBooking } = await import("@/lib/treasury-discord.server");
    await announceBooking(supabaseAdmin, req.org_id as string, {
      kind: req.kind as "deposit" | "withdraw",
      amount: Number(req.amount_auec ?? 0),
      playerId: req.player_id as string,
      description: desc,
      category: (req.category as string) ?? null,
    });
    return { ok: true };
  });

/** Author cancels their own pending request. */
export const cancelTreasuryRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data: req } = await supabaseAdmin
      .from("org_treasury_requests")
      .select("player_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!req) throw new Error("Anfrage nicht gefunden.");
    if (req.player_id !== context.userId) throw new Error("Keine Berechtigung.");
    if (req.status !== "pending") throw new Error("Anfrage ist nicht mehr offen.");
    const { error } = await supabaseAdmin
      .from("org_treasury_requests")
      .update({ status: "cancelled" })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
/* ── Discord-Updates zur Orgakasse ─────────────────────────────────────── */

export type TreasuryDiscordConfig = {
  channel_id: string | null;
  channel_name: string | null;
  post_deposits: boolean;
  deposits_show_name: boolean;
  post_withdrawals: boolean;
  withdrawals_show_name: boolean;
  post_monthly: boolean;
  monthly_day: number;
  monthly_hour: number;
  last_monthly_posted_at: string | null;
};

async function assertTreasuryDiscord(userId: string, orgId: string) {
  const { role, permissions } = await assertMember(userId, orgId);
  if (!hasPerm(role, permissions, "treasury.discord"))
    throw new Error("Keine Berechtigung für Kassen-Discord-Updates.");
}

/** Settings + released Discord channels for the treasury bot tab. */
export const getTreasuryDiscordSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { role, permissions } = await assertMember(context.userId, data.org_id);
    const canManage = hasPerm(role, permissions, "treasury.discord");
    if (!canManage)
      return {
        canManage,
        syncError: null as string | null,
        settings: null,
        channels: [] as { channel_id: string; channel_name: string }[],
      };
    // Immer erst mit Discord abgleichen, damit die Auswahl aktuell ist.
    const { syncOrgDiscordChannels } = await import("@/lib/discord-channel-sync.server");
    const sync = await syncOrgDiscordChannels(supabaseAdmin, data.org_id);
    const { loadTreasuryDiscordSettings } = await import("@/lib/treasury-discord.server");
    const settings = await loadTreasuryDiscordSettings(supabaseAdmin, data.org_id);
    const { data: chans } = await supabaseAdmin
      .from("discord_org_channels")
      .select("channel_id, channel_name")
      .eq("org_id", data.org_id)
      .order("channel_name");
    return {
      canManage,
      syncError: sync.error,
      settings: settings as TreasuryDiscordConfig & { org_id: string },
      channels: (chans ?? []).map((c) => ({
        channel_id: c.channel_id as string,
        channel_name: (c.channel_name as string) ?? (c.channel_id as string),
      })),
    };
  });

/** Saves the treasury bot configuration. */
export const saveTreasuryDiscordSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        channel_id: z.string().max(32).nullable(),
        channel_name: z.string().max(120).nullable(),
        post_deposits: z.boolean(),
        deposits_show_name: z.boolean(),
        post_withdrawals: z.boolean(),
        withdrawals_show_name: z.boolean(),
        post_monthly: z.boolean(),
        monthly_day: z.number().int().min(1).max(28),
        monthly_hour: z.number().int().min(0).max(23),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTreasuryDiscord(context.userId, data.org_id);
    if (data.channel_id) {
      const { data: ch } = await supabaseAdmin
        .from("discord_org_channels")
        .select("channel_id")
        .eq("org_id", data.org_id)
        .eq("channel_id", data.channel_id)
        .maybeSingle();
      if (!ch) throw new Error("Dieser Channel ist für deine Orga nicht freigegeben.");
    }
    const { error } = await supabaseAdmin
      .from("org_treasury_discord_settings")
      .upsert({ ...data, updated_at: new Date().toISOString() }, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Sends a clearly marked sample message into the configured channel. */
export const sendTreasuryDiscordPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        type: z.enum(["deposit", "withdraw", "monthly"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertTreasuryDiscord(context.userId, data.org_id);
    const mod = await import("@/lib/treasury-discord.server");
    const { postEmbed } = await import("@/lib/discord.server");
    const settings = await mod.loadTreasuryDiscordSettings(supabaseAdmin, data.org_id);
    if (!settings.channel_id) throw new Error("Bitte zuerst einen Channel auswählen und speichern.");
    const { data: ch } = await supabaseAdmin
      .from("discord_org_channels")
      .select("channel_id")
      .eq("org_id", data.org_id)
      .eq("channel_id", settings.channel_id)
      .maybeSingle();
    if (!ch) throw new Error("Der gewählte Channel ist für deine Orga nicht mehr freigegeben.");

    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("name")
      .eq("id", data.org_id)
      .maybeSingle();
    const name = (org?.name as string) ?? "Orga";

    if (data.type === "monthly") {
      const { getRequest } = await import("@tanstack/react-start/server");
      let baseUrl: string | null = null;
      try {
        baseUrl = new URL(getRequest().url).origin;
      } catch {
        baseUrl = null;
      }
      const now = new Date();
      const month = mod.monthKey(
        new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
      );
      await mod.postTreasuryMonthly(supabaseAdmin, data.org_id, month, baseUrl, true);
      return { ok: true };
    }

    const stats = await mod.computeTreasuryStats(supabaseAdmin, data.org_id, mod.monthKey(new Date()));
    const showName =
      data.type === "deposit" ? settings.deposits_show_name : settings.withdrawals_show_name;
    await postEmbed(
      settings.channel_id,
      mod.buildBookingEmbed(
        name,
        {
          kind: data.type,
          amount: 250_000,
          playerName: "Beispiel-Pilot",
          description: "Beispielbuchung zur Vorschau der Bot-Nachricht.",
          category: data.type === "deposit" ? "Mining" : "Ausrüstung",
          balance: stats.balance,
          sample: true,
        },
        showName,
      ),
    );
    return { ok: true };
  });
