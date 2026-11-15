import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { OrgBranding } from "@/lib/orgs.functions";

const slugInput = z.object({ slug: z.string().trim().toLowerCase().min(2).max(40) });

export type PublicOrg = {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  branding: OrgBranding;
  member_count: number;
  created_at: string;
};

/** Resolve a public org by slug (active only). */
export const getPublicOrg = createServerFn({ method: "GET" })
  .inputValidator((i) => slugInput.parse(i))
  .handler(async ({ data }): Promise<PublicOrg | null> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: o, error } = await supabaseAdmin
      .from("orgs")
      .select("id, slug, name, tag, branding, created_at")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!o) return null;
    const { count } = await supabaseAdmin
      .from("org_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", o.id as string);
    return {
      id: o.id as string,
      slug: o.slug as string,
      name: o.name as string,
      tag: (o.tag as string | null) ?? null,
      branding: ((o.branding ?? {}) as OrgBranding) || {},
      member_count: count ?? 0,
      created_at: o.created_at as string,
    };
  });

export type PublicOrgMission = {
  id: string;
  slug: string;
  title: string;
  description: string;
  starts_at: string | null;
  status: string;
  category: { id: string; name: string; color: string } | null;
  participant_count: number | null;
};

/** Public missions filtered by org. */
export const listPublicOrgMissions = createServerFn({ method: "GET" })
  .inputValidator((i) => slugInput.parse(i))
  .handler(async ({ data }): Promise<{ missions: PublicOrgMission[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!org) return { missions: [] };
    const orgId = org.id as string;
    const { data: rows, error } = await supabaseAdmin
      .from("missions")
      .select("id, slug, title, description, starts_at, status, category_id, show_participant_count")
      .is("password_hash", null)
      .eq("show_in_calendar", true)
      .eq("org_id", orgId)
      .in("status", ["active", "draft"])
      .order("starts_at", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    const { data: cats } = await supabaseAdmin
      .from("mission_categories")
      .select("id, name, color");
    const catMap = new Map<string, { id: string; name: string; color: string }>();
    for (const c of cats ?? [])
      catMap.set(c.id as string, c as { id: string; name: string; color: string });
    const ids = (rows ?? []).map((r) => r.id as string);
    const countMap = new Map<string, number>();
    if (ids.length > 0) {
      const { data: parts } = await supabaseAdmin
        .from("mission_participants")
        .select("mission_id")
        .in("mission_id", ids);
      for (const p of parts ?? []) {
        const k = p.mission_id as string;
        countMap.set(k, (countMap.get(k) ?? 0) + 1);
      }
    }
    return {
      missions: (rows ?? []).map((m) => ({
        id: m.id as string,
        slug: m.slug as string,
        title: m.title as string,
        description: (m.description as string | null) ?? "",
        starts_at: m.starts_at as string | null,
        status: m.status as string,
        category: m.category_id ? catMap.get(m.category_id as string) ?? null : null,
        participant_count: (m as { show_participant_count: boolean }).show_participant_count
          ? countMap.get(m.id as string) ?? 0
          : null,
      })),
    };
  });

export type PublicOrgFleetShip = {
  slug: string;
  name: string;
  manufacturer: string | null;
  manufacturerCode: string | null;
  classification: string | null;
  focus: string | null;
  size: string | null;
  length: string | null;
  crew: string | null;
  cargo: string | null;
  image: string | null;
  storeUrl: string | null;
  count: number;
};

/**
 * Aggregated fleet of the org's members — strictly scoped to this org.
 * A ship counts for the org when it is explicitly assigned to it, or when it
 * has no assignment yet and its owner is a member of exactly this one org.
 */
export const listPublicOrgFleet = createServerFn({ method: "GET" })
  .inputValidator((i) => slugInput.parse(i))
  .handler(async ({ data }): Promise<{ ships: PublicOrgFleetShip[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("id, fleet_source")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!org) return { ships: [] };
    const orgId = org.id as string;

    if ((org.fleet_source as string | null) === "fleetyards") {
      const { data: rows } = await supabaseAdmin
        .from("org_fleet_ships")
        .select("*")
        .eq("org_id", orgId);
      const ships: PublicOrgFleetShip[] = (rows ?? []).map((r) => ({
        slug: r.slug as string,
        name: r.name as string,
        manufacturer: (r.manufacturer as string | null) ?? null,
        manufacturerCode: (r.manufacturer_code as string | null) ?? null,
        classification: (r.classification as string | null) ?? null,
        focus: (r.focus as string | null) ?? null,
        size: (r.size as string | null) ?? null,
        length: (r.length as string | null) ?? null,
        crew: (r.crew as string | null) ?? null,
        cargo: (r.cargo as string | null) ?? null,
        image: (r.image as string | null) ?? null,
        storeUrl: (r.store_url as string | null) ?? null,
        count: (r.count as number) ?? 1,
      }));
      ships.sort((a, b) => {
        const ma = (a.manufacturer ?? "zzz").toLowerCase();
        const mb = (b.manufacturer ?? "zzz").toLowerCase();
        if (ma !== mb) return ma.localeCompare(mb, "de");
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
      return { ships };
    }

    const { data: members } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId);
    const memberIds = (members ?? []).map((m) => m.user_id as string);
    if (memberIds.length === 0) return { ships: [] };

    // Owners that belong to more than one org: their unassigned ships must not
    // leak onto this org's page.
    const { data: allMemberships } = await supabaseAdmin
      .from("org_members")
      .select("user_id, org_id")
      .in("user_id", memberIds);
    const orgCount = new Map<string, number>();
    for (const m of allMemberships ?? []) {
      const u = m.user_id as string;
      orgCount.set(u, (orgCount.get(u) ?? 0) + 1);
    }

    const { data: userShips } = await supabaseAdmin
      .from("user_ships")
      .select("ship_slug, ship_name, manufacturer, org_id, user_id")
      .in("user_id", memberIds);
    const rows = (userShips ?? []).filter((s) => {
      const so = s.org_id as string | null;
      if (so) return so === orgId;
      return (orgCount.get(s.user_id as string) ?? 0) === 1;
    });

    const counts = new Map<
      string,
      { count: number; name: string; manufacturer: string | null }
    >();
    for (const s of rows) {
      const slug = s.ship_slug as string | null;
      if (!slug) continue;
      const ex = counts.get(slug);
      if (ex) ex.count += 1;
      else
        counts.set(slug, {
          count: 1,
          name: s.ship_name as string,
          manufacturer: (s.manufacturer as string | null) ?? null,
        });
    }
    const slugs = Array.from(counts.keys());
    const catalog: Record<
      string,
      {
        slug: string;
        name: string;
        manufacturer: string | null;
        manufacturer_code: string | null;
        classification: string | null;
        focus: string | null;
        size: string | null;
        length_m: number | null;
        crew_max: number | null;
        cargo_scu: number | null;
        hero_image: string | null;
        store_image: string | null;
        angled_view: string | null;
        store_url: string | null;
      }
    > = {};
    if (slugs.length > 0) {
      const { data: cat } = await supabaseAdmin
        .from("ship_catalog")
        .select(
          "slug,name,manufacturer,manufacturer_code,classification,focus,size,length_m,crew_max,cargo_scu,hero_image,store_image,angled_view,store_url",
        )
        .in("slug", slugs);
      for (const r of cat ?? []) catalog[r.slug as string] = r as never;
    }
    const ships: PublicOrgFleetShip[] = [];
    for (const [slug, info] of counts) {
      const meta = catalog[slug];
      if (meta) {
        ships.push({
          slug: meta.slug,
          name: meta.name,
          manufacturer: meta.manufacturer,
          manufacturerCode: meta.manufacturer_code,
          classification: meta.classification,
          focus: meta.focus,
          size: meta.size,
          length: meta.length_m != null ? String(meta.length_m) : null,
          crew: meta.crew_max != null ? String(meta.crew_max) : null,
          cargo: meta.cargo_scu != null ? String(meta.cargo_scu) : null,
          image: meta.hero_image ?? meta.store_image ?? meta.angled_view ?? null,
          storeUrl: meta.store_url,
          count: info.count,
        });
      } else {
        ships.push({
          slug,
          name: info.name,
          manufacturer: info.manufacturer,
          manufacturerCode: null,
          classification: null,
          focus: null,
          size: null,
          length: null,
          crew: null,
          cargo: null,
          image: null,
          storeUrl: null,
          count: info.count,
        });
      }
    }
    ships.sort((a, b) => {
      const ma = (a.manufacturer ?? "zzz").toLowerCase();
      const mb = (b.manufacturer ?? "zzz").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb, "de");
      if (b.count !== a.count) return b.count - a.count;
      return a.name.localeCompare(b.name);
    });
    return { ships };
  });

export type PublicFleetOrg = {
  slug: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  ships: PublicOrgFleetShip[];
  totalHulls: number;
  manufacturers: number;
};

/** Fleets of all publicly listed orgs, clustered per org. */
export const listPublicFleetsByOrg = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ orgs: PublicFleetOrg[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orgRows } = await supabaseAdmin
      .from("orgs")
      .select("id, slug, name, tag, branding, fleet_source")
      .eq("is_active", true)
      .order("name", { ascending: true });
    const orgs = (orgRows ?? []).filter((o) => {
      const br = (o.branding ?? {}) as { show_in_overview?: boolean };
      return br.show_in_overview !== false;
    });
    if (orgs.length === 0) return { orgs: [] };

    const orgIds = orgs.map((o) => o.id as string);

    // Fleetyards-synced ships per org
    const { data: fyRows } = await supabaseAdmin
      .from("org_fleet_ships")
      .select("*")
      .in("org_id", orgIds);

    // Member ships per org
    const { data: memberRows } = await supabaseAdmin
      .from("org_members")
      .select("user_id, org_id");
    const orgCount = new Map<string, number>();
    const membersByOrg = new Map<string, string[]>();
    for (const m of memberRows ?? []) {
      const u = m.user_id as string;
      const o = m.org_id as string;
      orgCount.set(u, (orgCount.get(u) ?? 0) + 1);
      const list = membersByOrg.get(o) ?? [];
      list.push(u);
      membersByOrg.set(o, list);
    }
    const allMemberIds = Array.from(orgCount.keys());
    let userShips:
      | { ship_slug: string | null; ship_name: string; manufacturer: string | null; org_id: string | null; user_id: string }[]
      | null = [];
    if (allMemberIds.length > 0) {
      const { data: us } = await supabaseAdmin
        .from("user_ships")
        .select("ship_slug, ship_name, manufacturer, org_id, user_id")
        .in("user_id", allMemberIds);
      userShips = (us ?? []) as never;
    }

    // Catalog metadata for every referenced slug
    const slugs = new Set<string>();
    for (const s of userShips ?? []) if (s.ship_slug) slugs.add(s.ship_slug);
    const catalog = new Map<string, Record<string, unknown>>();
    if (slugs.size > 0) {
      const { data: cat } = await supabaseAdmin
        .from("ship_catalog")
        .select(
          "slug,name,manufacturer,manufacturer_code,classification,focus,size,length_m,crew_max,cargo_scu,hero_image,store_image,angled_view,store_url",
        )
        .in("slug", Array.from(slugs));
      for (const r of cat ?? []) catalog.set(r.slug as string, r as never);
    }

    const sortShips = (ships: PublicOrgFleetShip[]) =>
      ships.sort((a, b) => {
        const ma = (a.manufacturer ?? "zzz").toLowerCase();
        const mb = (b.manufacturer ?? "zzz").toLowerCase();
        if (ma !== mb) return ma.localeCompare(mb, "de");
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });

    const result: PublicFleetOrg[] = orgs.map((o) => {
      const orgId = o.id as string;
      let ships: PublicOrgFleetShip[] = [];

      if ((o.fleet_source as string | null) === "fleetyards") {
        ships = (fyRows ?? [])
          .filter((r) => r.org_id === orgId)
          .map((r) => ({
            slug: r.slug as string,
            name: r.name as string,
            manufacturer: (r.manufacturer as string | null) ?? null,
            manufacturerCode: (r.manufacturer_code as string | null) ?? null,
            classification: (r.classification as string | null) ?? null,
            focus: (r.focus as string | null) ?? null,
            size: (r.size as string | null) ?? null,
            length: (r.length as string | null) ?? null,
            crew: (r.crew as string | null) ?? null,
            cargo: (r.cargo as string | null) ?? null,
            image: (r.image as string | null) ?? null,
            storeUrl: (r.store_url as string | null) ?? null,
            count: (r.count as number) ?? 1,
          }));
      } else {
        const memberIds = new Set(membersByOrg.get(orgId) ?? []);
        const counts = new Map<
          string,
          { count: number; name: string; manufacturer: string | null }
        >();
        for (const s of userShips ?? []) {
          if (!memberIds.has(s.user_id)) continue;
          const so = s.org_id;
          if (so ? so !== orgId : (orgCount.get(s.user_id) ?? 0) !== 1) continue;
          const slug = s.ship_slug;
          if (!slug) continue;
          const ex = counts.get(slug);
          if (ex) ex.count += 1;
          else counts.set(slug, { count: 1, name: s.ship_name, manufacturer: s.manufacturer });
        }
        for (const [slug, info] of counts) {
          const meta = catalog.get(slug) as
            | {
                slug: string;
                name: string;
                manufacturer: string | null;
                manufacturer_code: string | null;
                classification: string | null;
                focus: string | null;
                size: string | null;
                length_m: number | null;
                crew_max: number | null;
                cargo_scu: number | null;
                hero_image: string | null;
                store_image: string | null;
                angled_view: string | null;
                store_url: string | null;
              }
            | undefined;
          ships.push(
            meta
              ? {
                  slug: meta.slug,
                  name: meta.name,
                  manufacturer: meta.manufacturer,
                  manufacturerCode: meta.manufacturer_code,
                  classification: meta.classification,
                  focus: meta.focus,
                  size: meta.size,
                  length: meta.length_m != null ? String(meta.length_m) : null,
                  crew: meta.crew_max != null ? String(meta.crew_max) : null,
                  cargo: meta.cargo_scu != null ? String(meta.cargo_scu) : null,
                  image: meta.hero_image ?? meta.store_image ?? meta.angled_view ?? null,
                  storeUrl: meta.store_url,
                  count: info.count,
                }
              : {
                  slug,
                  name: info.name,
                  manufacturer: info.manufacturer,
                  manufacturerCode: null,
                  classification: null,
                  focus: null,
                  size: null,
                  length: null,
                  crew: null,
                  cargo: null,
                  image: null,
                  storeUrl: null,
                  count: info.count,
                },
          );
        }
      }

      sortShips(ships);
      const br = (o.branding ?? {}) as { logo_url?: string | null };
      const logo = (br.logo_url ?? "").trim();
      return {
        slug: o.slug as string,
        name: o.name as string,
        tag: (o.tag as string | null) ?? null,
        logoUrl: logo.length > 0 ? logo : null,
        ships,
        totalHulls: ships.reduce((a, s) => a + (s.count ?? 1), 0),
        manufacturers: new Set(ships.map((s) => s.manufacturer).filter(Boolean)).size,
      };
    });

    result.sort((a, b) => b.totalHulls - a.totalHulls || a.name.localeCompare(b.name, "de"));
    return { orgs: result };
  },
);

export type PublicOrgShopGroup = {
  key: string;
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

/** Public shop items scoped to a single org. */
export const listPublicOrgShop = createServerFn({ method: "GET" })
  .inputValidator((i) => slugInput.parse(i))
  .handler(async ({ data }): Promise<{ groups: PublicOrgShopGroup[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("id")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (!org) return { groups: [] };
    const orgId = org.id as string;
    const { data: rows, error } = await supabaseAdmin
      .from("org_warehouse")
      .select(
        "id, item_ref, item_name, item_kind, category, unit, qty, sale_qty, reserved_qty, sale_price, sale_note",
      )
      .eq("org_id", orgId)
      .eq("for_sale", true)
      .eq("locked", false);
    if (error) throw new Error(error.message);
    const map = new Map<string, PublicOrgShopGroup>();
    for (const r of rows ?? []) {
      const qty = Number(r.qty ?? 0);
      const reserved = Number(r.reserved_qty ?? 0);
      const offered = Math.min(Number((r as { sale_qty?: number }).sale_qty ?? 0), qty);
      const avail = Math.max(0, offered - reserved);
      if (avail <= 0) continue;
      const price = Number(r.sale_price ?? 0);
      const ref = (r.item_ref as string | null) ?? null;
      const name = (r.item_name as string) ?? "Item";
      const key = ref ?? `n:${name.trim().toLowerCase()}`;
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
  });
export type PublicOrgListItem = {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  member_count: number;
  description: string | null;
};

/** All active orgs for the public community marquee. */
export const listPublicOrgs = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ orgs: PublicOrgListItem[] }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("orgs")
      .select("id, slug, name, tag, branding")
      .eq("is_active", true)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const countMap = new Map<string, number>();
    if ((data ?? []).length > 0) {
      const { data: members, error: membersError } = await supabaseAdmin
        .from("org_members")
        .select("org_id");
      if (membersError) throw new Error(membersError.message);
      for (const m of members ?? []) {
        const orgId = m.org_id as string;
        countMap.set(orgId, (countMap.get(orgId) ?? 0) + 1);
      }
    }

    return {
      orgs: (data ?? [])
        .filter((o) => {
          const br = (o.branding ?? {}) as { show_in_overview?: boolean };
          return br.show_in_overview !== false;
        })
        .map((o) => {
        const br = (o.branding ?? {}) as {
          logo_url?: string | null;
          hero_subtitle?: string;
          about_md?: string;
        };
        const raw = (br.logo_url ?? "").trim();
        const desc = (br.hero_subtitle ?? br.about_md ?? "")
          .replace(/[#*_>`]/g, "")
          .replace(/\s+/g, " ")
          .trim();
        return {
          id: o.id as string,
          slug: o.slug as string,
          name: o.name as string,
          tag: (o.tag as string | null) ?? null,
          logoUrl: raw.length > 0 ? raw : null,
          member_count: countMap.get(o.id as string) ?? 0,
          description: desc.length > 0 ? (desc.length > 220 ? `${desc.slice(0, 220)}…` : desc) : null,
        };
      }),
    };
  },
);

