import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userHasAnyOrgPerm } from "./org-perms.server";

async function ensureCanMutateListing(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  listingId: string,
) {
  const { data: row, error } = await supabase
    .from("marketplace_listings")
    .select("created_by")
    .eq("id", listingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Eintrag nicht gefunden");
  if (row.created_by === userId) return;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ok = await userHasAnyOrgPerm(supabaseAdmin, userId, "marketplace.moderate");
  if (!ok) throw new Error("Keine Berechtigung, diesen Eintrag zu ändern.");
}

const ListingType = z.enum(["auftrag", "suche", "verkauf", "tausch"]);
const ListingScope = z.enum(["intern", "allianz"]);
const ListingStatus = z.enum([
  "offen",
  "angenommen",
  "in_lieferung",
  "abgeschlossen",
  "storniert",
  "abgelaufen",
]);
const ClaimStatus = z.enum([
  "angenommen",
  "in_lieferung",
  "geliefert",
  "abgeschlossen",
  "storniert",
]);

export type MarketplaceListing = {
  id: string;
  created_by: string;
  creator_name: string;
  type: z.infer<typeof ListingType>;
  scope: z.infer<typeof ListingScope>;
  org_id: string | null;
  org_name: string | null;
  status: z.infer<typeof ListingStatus>;
  title: string;
  description: string;
  category: string | null;
  price_auec: number | null;
  quantity: number | null;
  unit: string | null;
  trade_offer: string | null;
  trade_want: string | null;
  location: string | null;
  inventory_item_id: string | null;
  org_warehouse_id: string | null;
  image_urls: string[];
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  is_owner: boolean;
  active_claim: {
    id: string;
    claimed_by: string;
    claimant_name: string;
    status: z.infer<typeof ClaimStatus>;
    note: string | null;
    created_at: string;
  } | null;
};

type Row = Record<string, unknown>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Sb = any;

async function mapProfiles(supabase: Sb, ids: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return map;
  const uniq = Array.from(new Set(ids));
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, callsign")
    .in("id", uniq);
  for (const p of (data ?? []) as Row[]) {
    const id = p.id as string;
    const name = (p.display_name as string) || (p.callsign as string) || "Unbekannt";
    map.set(id, name);
  }
  return map;
}

async function attachOrgNames(supabase: Sb, rows: Row[]) {
  const ids = Array.from(
    new Set(rows.map((r) => r.org_id as string | null).filter((x): x is string => !!x)),
  );
  if (ids.length === 0) return;
  const { data } = await supabase.from("orgs").select("id, name").in("id", ids);
  const map = new Map<string, string>();
  for (const o of (data ?? []) as Row[]) map.set(o.id as string, o.name as string);
  for (const r of rows) {
    if (r.org_id) r.org_name = map.get(r.org_id as string) ?? null;
  }
}

function toListing(
  r: Row,
  userId: string,
  names: Map<string, string>,
  claim: Row | null,
): MarketplaceListing {
  const createdBy = r.created_by as string;
  const claimantId = (claim?.claimed_by as string | undefined) ?? null;
  return {
    id: r.id as string,
    created_by: createdBy,
    creator_name: names.get(createdBy) ?? "Unbekannt",
    type: r.type as MarketplaceListing["type"],
    scope: ((r.scope as string) ?? "allianz") as MarketplaceListing["scope"],
    org_id: (r.org_id as string) ?? null,
    org_name: (r.org_name as string) ?? null,
    status: r.status as MarketplaceListing["status"],
    title: r.title as string,
    description: (r.description as string) ?? "",
    category: (r.category as string) ?? null,
    price_auec: r.price_auec == null ? null : Number(r.price_auec),
    quantity: r.quantity == null ? null : Number(r.quantity),
    unit: (r.unit as string) ?? null,
    trade_offer: (r.trade_offer as string) ?? null,
    trade_want: (r.trade_want as string) ?? null,
    location: (r.location as string) ?? null,
    inventory_item_id: (r.inventory_item_id as string) ?? null,
    org_warehouse_id: (r.org_warehouse_id as string) ?? null,
    image_urls: (r.image_urls as string[]) ?? [],
    expires_at: (r.expires_at as string) ?? null,
    created_at: r.created_at as string,
    updated_at: r.updated_at as string,
    is_owner: createdBy === userId,
    active_claim: claim
      ? {
          id: claim.id as string,
          claimed_by: claimantId!,
          claimant_name: names.get(claimantId!) ?? "Unbekannt",
          status: claim.status as z.infer<typeof ClaimStatus>,
          note: (claim.note as string) ?? null,
          created_at: claim.created_at as string,
        }
      : null,
  };
}

// ---------- list ----------
export const listListings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        type: ListingType.optional(),
        status: ListingStatus.optional(),
        scope: ListingScope.optional(),
        onlyOpen: z.boolean().optional().default(false),
        onlyMine: z.boolean().optional().default(false),
        search: z.string().optional().default(""),
      })
      .optional()
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await supabase
      .from("marketplace_listings")
      .update({ status: "abgelaufen" })
      .eq("status", "offen")
      .not("expires_at", "is", null)
      .lt("expires_at", new Date().toISOString());

    let q = supabase
      .from("marketplace_listings")
      .select("*")
      .order("created_at", { ascending: false });
    if (data.type) q = q.eq("type", data.type);
    if (data.scope) q = q.eq("scope", data.scope);
    if (data.status) q = q.eq("status", data.status);
    if (data.onlyOpen) q = q.eq("status", "offen");
    if (data.onlyMine) q = q.eq("created_by", userId);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);

    const ids = ((rows ?? []) as Row[]).map((r) => r.id as string);
    let claims: Row[] = [];
    if (ids.length > 0) {
      const { data: c } = await supabase
        .from("marketplace_claims")
        .select("*")
        .in("listing_id", ids)
        .in("status", ["angenommen", "in_lieferung", "geliefert"]);
      claims = (c ?? []) as Row[];
    }
    const claimMap = new Map<string, Row>();
    for (const c of claims) claimMap.set(c.listing_id as string, c);

    const userIds = new Set<string>();
    for (const r of (rows ?? []) as Row[]) userIds.add(r.created_by as string);
    for (const c of claims) userIds.add(c.claimed_by as string);
    const names = await mapProfiles(supabase, Array.from(userIds));
    await attachOrgNames(supabase, (rows ?? []) as Row[]);

    return {
      listings: ((rows ?? []) as Row[]).map((r) =>
        toListing(r, userId, names, claimMap.get(r.id as string) ?? null),
      ),
    };
  });

// ---------- get one ----------
export const getListing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row, error } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Eintrag nicht gefunden");

    const { data: claims } = await supabase
      .from("marketplace_claims")
      .select("*")
      .eq("listing_id", data.id)
      .order("created_at", { ascending: false });
    const active = ((claims ?? []) as Row[]).find((c) =>
      ["angenommen", "in_lieferung", "geliefert"].includes(c.status as string),
    );

    const userIds = new Set<string>([row.created_by as string]);
    for (const c of (claims ?? []) as Row[]) userIds.add(c.claimed_by as string);
    const names = await mapProfiles(supabase, Array.from(userIds));
    await attachOrgNames(supabase, [row as Row]);

    return {
      listing: toListing(row as Row, userId, names, active ?? null),
      claims: ((claims ?? []) as Row[]).map((c) => ({
        id: c.id as string,
        claimed_by: c.claimed_by as string,
        claimant_name: names.get(c.claimed_by as string) ?? "Unbekannt",
        status: c.status as z.infer<typeof ClaimStatus>,
        note: (c.note as string) ?? null,
        cancel_reason: (c.cancel_reason as string) ?? null,
        created_at: c.created_at as string,
        updated_at: c.updated_at as string,
      })),
    };
  });

// ---------- create / update ----------
const listingInput = z.object({
  type: ListingType,
  scope: ListingScope.optional().default("allianz"),
  org_id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(140),
  description: z.string().max(4000).optional().default(""),
  category: z.string().max(64).nullable().optional(),
  price_auec: z.number().int().nonnegative().nullable().optional(),
  quantity: z.number().nonnegative().nullable().optional(),
  unit: z.string().max(16).nullable().optional(),
  trade_offer: z.string().max(500).nullable().optional(),
  trade_want: z.string().max(500).nullable().optional(),
  location: z.string().max(120).nullable().optional(),
  inventory_item_id: z.string().uuid().nullable().optional(),
  org_warehouse_id: z.string().uuid().nullable().optional(),
  image_urls: z.array(z.string()).max(6).optional().default([]),
  expires_at: z.string().datetime().nullable().optional(),
});

/** Interne Anzeigen brauchen eine Orga, in der der Nutzer Mitglied ist. */
async function resolveScopeOrg(
  userId: string,
  scope: z.infer<typeof ListingScope>,
  orgId: string | null,
): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: rows, error } = await supabaseAdmin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  const myOrgs = (rows ?? []).map((r) => r.org_id as string);
  if (scope === "allianz") return orgId && myOrgs.includes(orgId) ? orgId : null;
  if (myOrgs.length === 0) throw new Error("Du bist in keiner Organisation – nur orgaübergreifend möglich.");
  if (orgId) {
    if (!myOrgs.includes(orgId)) throw new Error("Keine Berechtigung für diese Organisation.");
    return orgId;
  }
  if (myOrgs.length > 1) throw new Error("Bitte Organisation auswählen.");
  return myOrgs[0]!;
}

export const createListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listingInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const orgId = await resolveScopeOrg(userId, data.scope, data.org_id ?? null);
    const { data: row, error } = await supabase
      .from("marketplace_listings")
      .insert({ ...data, org_id: orgId, created_by: userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id as string };
  });

export const updateListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    listingInput.extend({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { id, ...patch } = data;
    await ensureCanMutateListing(supabase, userId, id);
    patch.org_id = await resolveScopeOrg(userId, patch.scope, patch.org_id ?? null);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("marketplace_listings")
      .update(patch)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await ensureCanMutateListing(supabase, userId, data.id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("marketplace_listings")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- claims ----------
export const claimListing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ listing_id: z.string().uuid(), note: z.string().max(500).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: listing, error: le } = await supabase
      .from("marketplace_listings")
      .select("id, created_by, status")
      .eq("id", data.listing_id)
      .maybeSingle();
    if (le) throw new Error(le.message);
    if (!listing) throw new Error("Eintrag nicht gefunden");
    if (listing.created_by === userId) throw new Error("Eigener Eintrag");
    if (listing.status !== "offen") throw new Error("Nicht mehr verfügbar");

    const { error: ce } = await supabase
      .from("marketplace_claims")
      .insert({ listing_id: data.listing_id, claimed_by: userId, note: data.note ?? null });
    if (ce) throw new Error(ce.message);
    const { error: ue } = await supabase
      .from("marketplace_listings")
      .update({ status: "angenommen" })
      .eq("id", data.listing_id);
    if (ue) throw new Error(ue.message);
    return { ok: true };
  });

export const updateClaimStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        claim_id: z.string().uuid(),
        status: ClaimStatus,
        cancel_reason: z.string().max(500).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: claim, error: ce } = await supabase
      .from("marketplace_claims")
      .select("id, listing_id")
      .eq("id", data.claim_id)
      .maybeSingle();
    if (ce) throw new Error(ce.message);
    if (!claim) throw new Error("Annahme nicht gefunden");
    const { error: ue } = await supabase
      .from("marketplace_claims")
      .update({ status: data.status, cancel_reason: data.cancel_reason ?? null })
      .eq("id", data.claim_id);
    if (ue) throw new Error(ue.message);

    type ListingStatus =
      | "offen"
      | "angenommen"
      | "in_lieferung"
      | "abgeschlossen"
      | "storniert"
      | "abgelaufen";
    let newListingStatus: ListingStatus | null = null;
    if (data.status === "abgeschlossen") newListingStatus = "abgeschlossen";
    else if (data.status === "storniert") newListingStatus = "offen";
    else if (data.status === "in_lieferung") newListingStatus = "in_lieferung";
    else if (data.status === "geliefert") newListingStatus = "in_lieferung";
    else if (data.status === "angenommen") newListingStatus = "angenommen";
    if (newListingStatus) {
      await supabase
        .from("marketplace_listings")
        .update({ status: newListingStatus })
        .eq("id", claim.listing_id as string);
    }
    return { ok: true };
  });

// ---------- messages ----------
export const listMessages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ listing_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase
      .from("marketplace_messages")
      .select("*")
      .eq("listing_id", data.listing_id)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set(((rows ?? []) as Row[]).map((r) => r.author_id as string)));
    const names = await mapProfiles(supabase, ids);
    return {
      messages: ((rows ?? []) as Row[]).map((r) => ({
        id: r.id as string,
        author_id: r.author_id as string,
        author_name: names.get(r.author_id as string) ?? "Unbekannt",
        body: r.body as string,
        created_at: r.created_at as string,
      })),
    };
  });

export const postMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ listing_id: z.string().uuid(), body: z.string().trim().min(1).max(2000) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("marketplace_messages")
      .insert({ listing_id: data.listing_id, author_id: userId, body: data.body });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- mine ----------
export const listMyMarketplace = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: mine } = await supabase
      .from("marketplace_listings")
      .select("*")
      .eq("created_by", userId)
      .order("created_at", { ascending: false });
    const { data: myClaims } = await supabase
      .from("marketplace_claims")
      .select("*, listing:marketplace_listings(*)")
      .eq("claimed_by", userId)
      .order("created_at", { ascending: false });
    return {
      created: ((mine ?? []) as Row[]).map((r) => ({
        id: r.id as string,
        title: r.title as string,
        type: r.type as string,
        status: r.status as string,
        created_at: r.created_at as string,
      })),
      claimed: ((myClaims ?? []) as Row[]).map((c) => {
        const l = (c.listing as Row) ?? {};
        return {
          claim_id: c.id as string,
          claim_status: c.status as string,
          listing_id: (l.id as string) ?? (c.listing_id as string),
          title: (l.title as string) ?? "",
          type: (l.type as string) ?? "",
          listing_status: (l.status as string) ?? "",
          created_at: c.created_at as string,
        };
      }),
    };
  });

// ---------- signed url ----------
export const signMarketplaceImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ path: z.string().min(1) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: signed, error } = await supabase.storage
      .from("marketplace-images")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
