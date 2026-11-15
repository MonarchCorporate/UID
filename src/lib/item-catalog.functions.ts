import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Supabase's Data API caps every SELECT at ~1000 rows regardless of the
 * `.limit()` we pass, so any "scan the whole catalog" query must page
 * through explicit ranges. This helper does exactly that.
 */
async function fetchAllCatalog<T extends Record<string, unknown>>(
  columns: string,
  extra?: (q: any) => any,
): Promise<T[]> {
  const pageSize = 1000;
  const out: T[] = [];
  for (let page = 0; page < 200; page++) {
    let q: any = supabaseAdmin
      .from("inventory_item_catalog")
      .select(columns)
      .is("merged_into", null)
      .order("item_ref", { ascending: true })
      .range(page * pageSize, page * pageSize + pageSize - 1);
    if (extra) q = extra(q);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

/** Paginated browse over `inventory_item_catalog` for the /items page. */
export const listCatalogItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        q: z.string().trim().max(80).optional().default(""),
        kind: z.string().trim().max(80).optional().default(""),
        source: z.string().trim().max(40).optional().default(""),
        category: z.string().trim().max(40).optional().default(""),
        hasBlueprint: z.boolean().optional().default(false),
        page: z.number().int().min(1).max(500).optional().default(1),
        pageSize: z.number().int().min(12).max(120).optional().default(48),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;
    // Optional: restrict to items that appear as blueprint output.
    let bpRefsFilter: string[] | null = null;
    if (data.hasBlueprint) {
      const { data: bps } = await supabaseAdmin
        .from("blueprints")
        .select("item_ref")
        .not("item_ref", "is", null)
        .limit(10000);
      const refs = Array.from(
        new Set((bps ?? []).map((b) => String(b.item_ref)).filter(Boolean)),
      );
      if (refs.length === 0) {
        return { items: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
      bpRefsFilter = refs;
    }
    // Optional: high-level category grouping over the messy `kind` field.
    // Resolve on-demand by scanning distinct kinds and matching via the
    // shared categoryForKind() classifier so we can narrow the DB query.
    let categoryKinds: string[] | null = null;
    if (data.category) {
      const kinds = await fetchAllCatalog<{ kind: string | null }>(
        "kind",
        (q) => q.not("kind", "is", null),
      );
      const set = new Set<string>();
      for (const r of kinds) {
        const k = ((r.kind as string) ?? "").trim();
        if (k && categoryForKind(k) === data.category) set.add(k);
      }
      categoryKinds = Array.from(set);
      if (categoryKinds.length === 0) {
        return { items: [], total: 0, page: data.page, pageSize: data.pageSize };
      }
    }
    let query = supabaseAdmin
      .from("inventory_item_catalog")
      .select(
        "item_ref,name,kind,unit,image_url,weight,price_buy,price_sell,source",
        { count: "exact" },
      )
      .order("name", { ascending: true })
      .range(from, to);
    query = query.is("merged_into", null);
    if (data.q) query = query.ilike("name", `%${data.q}%`);
    if (data.kind) query = query.eq("kind", data.kind);
    if (data.source) query = query.eq("source", data.source);
    if (categoryKinds && categoryKinds.length) query = query.in("kind", categoryKinds);
    if (bpRefsFilter) query = query.in("item_ref", bpRefsFilter);
    const { data: rows, count, error } = await query;
    if (error) throw new Error(error.message);
    // Blueprint flag for the returned page.
    const pageRefs = (rows ?? []).map((r) => String(r.item_ref)).filter(Boolean);
    const bpSet = new Set<string>();
    if (pageRefs.length) {
      const { data: bps } = await supabaseAdmin
        .from("blueprints")
        .select("item_ref")
        .in("item_ref", pageRefs);
      for (const b of bps ?? []) {
        if (b.item_ref) bpSet.add(String(b.item_ref));
      }
    }
    return {
      items: (rows ?? []).map((r) => ({
        item_ref: String(r.item_ref),
        name: r.name as string,
        kind: (r.kind as string) ?? null,
        unit: ((r.unit as string) ?? "pcs") as "pcs" | "scu",
        image_url: (r.image_url as string) ?? null,
        weight: (r.weight as number | null) ?? null,
        price_buy: (r.price_buy as number | null) ?? null,
        price_sell: (r.price_sell as number | null) ?? null,
        source: (r.source as string) ?? null,
        has_blueprint: bpSet.has(String(r.item_ref)),
        category: categoryForKind((r.kind as string) ?? null),
      })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/**
 * High-level item categories derived from the messy `kind` values coming
 * from Wiki + UEX. Used by the /items catalog page's top-level filter.
 */
export const ITEM_CATEGORIES = [
  { key: "armor", label: "Rüstung" },
  { key: "clothing", label: "Kleidung" },
  { key: "weapons", label: "Waffen" },
  { key: "consumables", label: "Verbrauch" },
  { key: "components", label: "Schiffskomponenten" },
  { key: "commodities", label: "Handelsgüter" },
  { key: "misc", label: "Sonstiges" },
] as const;

function categoryForKind(kind: string | null): string {
  if (!kind) return "misc";
  const k = kind.toLowerCase();
  if (
    /(armor|helmet|torso|arms|legs|backpack|undersuit)/.test(k) &&
    !/livery|liveries/.test(k)
  )
    return "armor";
  if (/(weapon|gun|attachment|rifle|pistol|magazine|ammo)/.test(k))
    return "weapons";
  if (
    /(clothing|jacket|shirt|shoe|footwear|hat|glove|legwear|pant|coat|scarf)/.test(
      k,
    )
  )
    return "clothing";
  if (/(food|drink|consumable|medical|medpen)/.test(k)) return "consumables";
  if (
    /(cooler|power plant|shield|quantum|thruster|missile rack|weapon rack|jump module|scanner|radar|qed)/.test(
      k,
    )
  )
    return "components";
  if (/(commodit|mineral|gas|refined|ore)/.test(k)) return "commodities";
  return "misc";
}

/** Aggregate stats for the item catalog page (counts per top category etc.). */
export const getCatalogStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const kindRows = await fetchAllCatalog<{
      kind: string | null;
      source: string | null;
    }>("kind,source");
    const byCategory: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    let total = 0;
    for (const r of kindRows) {
      total++;
      const cat = categoryForKind((r.kind as string | null) ?? null);
      byCategory[cat] = (byCategory[cat] ?? 0) + 1;
      const src = (r.source as string | null) ?? "unknown";
      bySource[src] = (bySource[src] ?? 0) + 1;
    }
    // Distinct item_refs used as blueprint outputs.
    const { data: bpOut } = await supabaseAdmin
      .from("blueprints")
      .select("item_ref")
      .not("item_ref", "is", null)
      .limit(10000);
    const bpCount = new Set(
      (bpOut ?? []).map((b) => String(b.item_ref)).filter(Boolean),
    ).size;
    return { total, byCategory, bySource, bp_output_refs: bpCount };
  });

/** Distinct `kind` values from the catalog (for filter dropdowns). */
export const listCatalogKinds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const data = await fetchAllCatalog<{ kind: string | null }>(
      "kind",
      (q) => q.not("kind", "is", null),
    );
    const set = new Set<string>();
    for (const r of data) {
      const k = (r.kind as string | null)?.trim();
      if (k) set.add(k);
    }
    return { kinds: Array.from(set).sort((a, b) => a.localeCompare(b)) };
  });

/**
 * Unified item catalog.
 *
 * Every "item" a user can put in their inventory, the org warehouse, a
 * blueprint recipe, an order or a farm list is represented by a stable
 * `item_ref` string. The ref is source-scoped so the same string always
 * refers to the same real-world thing:
 *
 *   commodity / material / component (UEX)  → the ref stored in
 *     `inventory_item_catalog.item_ref` (numeric id or `commodity:*`).
 *   ship component (weapons, shields …)     → the ref stored in
 *     `ship_components_catalog.item_ref` (e.g. `wiki:<uuid>`).
 *   ship / vehicle                          → `ship:<slug>`.
 *   blueprint output (crafted item)         → the ref stored in
 *     `blueprints.item_ref` when set (usually already matching one of the
 *     above so an FR-66 blueprint and an FR-66 in inventory share the
 *     same ref), otherwise `bp:<blueprint_id>` as a fallback.
 */

export type UnifiedHit = {
  item_ref: string;
  name: string;
  kind: string | null;
  unit: "pcs" | "scu" | null;
  image_url: string | null;
  source: "item" | "component" | "ship" | "blueprint";
  blueprint_id?: string | null;
};

const SearchInput = z.object({
  q: z.string().trim().max(80).default(""),
  kind: z.string().trim().max(80).optional(),
  sources: z
    .array(z.enum(["item", "component", "ship", "blueprint"]))
    .optional(),
  limit: z.number().int().min(1).max(200).optional(),
});

type SearchOptions = z.infer<typeof SearchInput>;

export async function _searchUnifiedCatalog(
  data: SearchOptions,
): Promise<{ items: UnifiedHit[] }> {
    const q = data.q ?? "";
    const hasQ = q.length >= 2;
    const hasKind = !!data.kind && data.kind.length > 0;
    if (!hasQ && !hasKind) return { items: [] as UnifiedHit[] };
    const per = Math.min(data.limit ?? 40, 60);
    const sources = new Set(data.sources ?? ["item", "component", "ship", "blueprint"]);
    const seen = new Map<string, UnifiedHit>();
    const add = (h: UnifiedHit) => {
      if (!h.item_ref) return;
      if (!seen.has(h.item_ref)) seen.set(h.item_ref, h);
    };

    // 1) UEX items / commodities / materials
    if (sources.has("item")) {
      let query = supabaseAdmin
        .from("inventory_item_catalog")
        .select("item_ref,name,kind,image_url,unit")
        .order("name")
        .limit(per);
      query = query.is("merged_into", null);
      if (hasQ) query = query.ilike("name", `%${q}%`);
      if (hasKind) query = query.eq("kind", data.kind as string);
      const { data: rows } = await query;
      for (const r of rows ?? []) {
        add({
          item_ref: String(r.item_ref),
          name: r.name as string,
          kind: (r.kind as string) ?? null,
          unit: ((r.unit as string) ?? "pcs") as "pcs" | "scu",
          image_url: (r.image_url as string) ?? null,
          source: "item",
        });
      }
    }

    // 2) Ship components (weapons, shields, thrusters …)
    if (sources.has("component") && !hasKind && hasQ) {
      const { data: rows } = await supabaseAdmin
        .from("ship_components_catalog")
        .select("item_ref,name,type_label,category,image_url")
        .not("item_ref", "is", null)
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(per);
      for (const r of rows ?? []) {
        add({
          item_ref: String(r.item_ref),
          name: r.name as string,
          kind: (r.type_label as string) ?? (r.category as string) ?? "Komponente",
          unit: "pcs",
          image_url: (r.image_url as string) ?? null,
          source: "component",
        });
      }
    }

    // 3) Ships / vehicles
    if (sources.has("ship") && !hasKind && hasQ) {
      const { data: rows } = await supabaseAdmin
        .from("ship_catalog")
        .select("slug,name,classification_label,store_image,hero_image")
        .ilike("name", `%${q}%`)
        .order("name")
        .limit(per);
      for (const r of rows ?? []) {
        add({
          item_ref: `ship:${r.slug}`,
          name: r.name as string,
          kind: (r.classification_label as string) ?? "Schiff",
          unit: "pcs",
          image_url:
            (r.store_image as string) ?? (r.hero_image as string) ?? null,
          source: "ship",
        });
      }
    }

    // 4) Blueprint outputs (only defaults, only searchable by name)
    if (sources.has("blueprint") && !hasKind && hasQ) {
      const { data: rows } = await supabaseAdmin
        .from("blueprints")
        .select("id,item_ref,item_name")
        .eq("is_default", true)
        .ilike("item_name", `%${q}%`)
        .order("item_name")
        .limit(per);
      for (const r of rows ?? []) {
        const ref = (r.item_ref as string) ?? `bp:${r.id}`;
        add({
          item_ref: ref,
          name: r.item_name as string,
          kind: "Blueprint-Output",
          unit: "pcs",
          image_url: null,
          source: "blueprint",
          blueprint_id: r.id as string,
        });
      }
    }

    // 5) Blueprint-Materialien (Rohstoffe/Commodities aus Rezepten – z. B.
    //    Iron, Copper, Aslarite). Diese sind nach dem UEX-Purge nicht mehr
    //    im `inventory_item_catalog`, tauchen aber in `blueprint_components`
    //    mit stabilen `wiki:*`-Refs auf. So können Nutzer sie im Lager/
    //    Inventar einlagern und die Refs matchen die Blueprint-Anforderungen.
    if (sources.has("item") && !hasKind && hasQ) {
      const { data: rows } = await supabaseAdmin
        .from("blueprint_components")
        .select("item_ref,item_name")
        .not("item_ref", "is", null)
        .ilike("item_name", `%${q}%`)
        .limit(per * 4);
      const uniq = new Map<string, string>();
      for (const r of rows ?? []) {
        const ref = String(r.item_ref);
        if (!uniq.has(ref)) uniq.set(ref, r.item_name as string);
      }
      for (const [ref, name] of uniq) {
        add({
          item_ref: ref,
          name,
          kind: "Material",
          unit: "pcs",
          image_url: null,
          source: "item",
        });
      }
    }

    // Rank so exact / prefix matches (e.g. "Iron" the raw material) always
    // surface before longer names that merely contain the query (e.g.
    // "Cardona Jacket Iron"). Without this the 200-row armor slice can
    // monopolize the response and hide materials entirely.
    const needle = q.toLowerCase();
    const scored = Array.from(seen.values()).map((h) => {
      const n = h.name.toLowerCase();
      let score = 3;
      if (needle && n === needle) score = 0;
      else if (needle && n.startsWith(needle)) score = 1;
      else if (needle && new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`).test(n)) score = 2;
      // Slight boost for materials so raw commodities beat armor pieces.
      if (h.source === "item" && (h.kind === "Material" || h.kind === null)) score -= 0.1;
      return { h, score };
    });
    scored.sort((a, b) => a.score - b.score || a.h.name.localeCompare(b.h.name));
    const items = scored.slice(0, per).map((s) => s.h);
    return { items };
}

export const searchUnifiedCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => SearchInput.parse(input ?? {}))
  .handler(async ({ data }) => _searchUnifiedCatalog(data));

/** Resolve one or many item refs to their canonical display shape. */
export const resolveItemRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ refs: z.array(z.string().max(120)).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const refs = Array.from(new Set(data.refs.filter(Boolean)));
    if (refs.length === 0) return { items: {} as Record<string, UnifiedHit> };
    const out: Record<string, UnifiedHit> = {};
    const shipSlugs: string[] = [];
    const plain: string[] = [];
    for (const r of refs) {
      if (r.startsWith("ship:")) shipSlugs.push(r.slice(5));
      else plain.push(r);
    }

    if (plain.length) {
      const { data: rows } = await supabaseAdmin
        .from("inventory_item_catalog")
        .select("item_ref,name,kind,unit,image_url,merged_into")
        .in("item_ref", plain);
      const followUp: Array<{ original: string; target: string }> = [];
      for (const r of rows ?? []) {
        if (r.merged_into) {
          followUp.push({ original: String(r.item_ref), target: String(r.merged_into) });
          continue;
        }
        out[String(r.item_ref)] = {
          item_ref: String(r.item_ref),
          name: r.name as string,
          kind: (r.kind as string) ?? null,
          unit: ((r.unit as string) ?? "pcs") as "pcs" | "scu",
          image_url: (r.image_url as string) ?? null,
          source: "item",
        };
      }
      if (followUp.length) {
        const targets = Array.from(new Set(followUp.map((f) => f.target)));
        const { data: canon } = await supabaseAdmin
          .from("inventory_item_catalog")
          .select("item_ref,name,kind,unit,image_url")
          .in("item_ref", targets)
          .is("merged_into", null);
        const byRef = new Map<string, NonNullable<typeof canon>[number]>();
        for (const c of canon ?? []) byRef.set(String(c.item_ref), c);
        for (const f of followUp) {
          const c = byRef.get(f.target);
          if (!c) continue;
          out[f.original] = {
            item_ref: String(c.item_ref),
            name: c.name as string,
            kind: (c.kind as string) ?? null,
            unit: ((c.unit as string) ?? "pcs") as "pcs" | "scu",
            image_url: (c.image_url as string) ?? null,
            source: "item",
          };
        }
      }

      const missing = plain.filter((r) => !out[r]);
      if (missing.length) {
        const { data: rows2 } = await supabaseAdmin
          .from("ship_components_catalog")
          .select("item_ref,name,type_label,category,image_url")
          .in("item_ref", missing);
        for (const r of rows2 ?? [])
          out[String(r.item_ref)] = {
            item_ref: String(r.item_ref),
            name: r.name as string,
            kind:
              (r.type_label as string) ?? (r.category as string) ?? "Komponente",
            unit: "pcs",
            image_url: (r.image_url as string) ?? null,
            source: "component",
          };
      }

      const stillMissing = plain.filter((r) => !out[r]);
      if (stillMissing.length) {
        const { data: rows3 } = await supabaseAdmin
          .from("blueprints")
          .select("id,item_ref,item_name")
          .eq("is_default", true)
          .in("item_ref", stillMissing);
        for (const r of rows3 ?? [])
          out[String(r.item_ref)] = {
            item_ref: String(r.item_ref),
            name: r.item_name as string,
            kind: "Blueprint-Output",
            unit: "pcs",
            image_url: null,
            source: "blueprint",
            blueprint_id: r.id as string,
          };
      }
    }

    if (shipSlugs.length) {
      const { data: rows } = await supabaseAdmin
        .from("ship_catalog")
        .select("slug,name,classification_label,store_image,hero_image")
        .in("slug", shipSlugs);
      for (const r of rows ?? [])
        out[`ship:${r.slug}`] = {
          item_ref: `ship:${r.slug}`,
          name: r.name as string,
          kind: (r.classification_label as string) ?? "Schiff",
          unit: "pcs",
          image_url:
            (r.store_image as string) ?? (r.hero_image as string) ?? null,
          source: "ship",
        };
    }

    return { items: out };
  });

/**
 * Detail view for one catalog item, including blueprint references
 * (produced by / used in), ship-component match, my inventory stacks,
 * org warehouse stock and an inventory-mapping status summary.
 */
export const getItemDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ item_ref: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    let ref = data.item_ref;

    let { data: cat } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select(
        "item_ref,name,kind,unit,image_url,weight,price_buy,price_sell,source,wiki_uuid,description,shops,acquisition,last_synced_at,sources_fetched_at,raw,merged_into",
      )
      .eq("item_ref", ref)
      .maybeSingle();

    // Follow merge pointer so legacy refs resolve to their canonical wiki row.
    if (cat?.merged_into) {
      ref = String(cat.merged_into);
      const followed = await supabaseAdmin
        .from("inventory_item_catalog")
        .select(
          "item_ref,name,kind,unit,image_url,weight,price_buy,price_sell,source,wiki_uuid,description,shops,acquisition,last_synced_at,sources_fetched_at,raw,merged_into",
        )
        .eq("item_ref", ref)
        .maybeSingle();
      cat = followed.data ?? cat;
    }

    const { data: comp } = await supabaseAdmin
      .from("ship_components_catalog")
      .select("item_ref,name,type_label,category,image_url,manufacturer_name,size,web_url")
      .eq("item_ref", ref)
      .maybeSingle();

    // Produced by (blueprints whose output == ref)
    const { data: producedBy } = await supabaseAdmin
      .from("blueprints")
      .select("id,item_name,output_qty,source,is_default")
      .eq("item_ref", ref)
      .order("is_default", { ascending: false })
      .limit(50);

    // Used in (blueprint_components referencing ref) → group by blueprint
    const { data: usedInRaw } = await supabaseAdmin
      .from("blueprint_components")
      .select("blueprint_id,qty,unit,item_name")
      .eq("item_ref", ref)
      .limit(500);
    const bpIds = Array.from(
      new Set((usedInRaw ?? []).map((r) => r.blueprint_id as string)),
    );
    const bpNameMap = new Map<string, string>();
    if (bpIds.length) {
      const { data: bpRows } = await supabaseAdmin
        .from("blueprints")
        .select("id,item_name")
        .in("id", bpIds);
      for (const b of bpRows ?? [])
        bpNameMap.set(b.id as string, b.item_name as string);
    }
    const usedInAgg = new Map<
      string,
      { blueprint_id: string; item_name: string; qty: number; unit: string | null }
    >();
    for (const r of usedInRaw ?? []) {
      const id = r.blueprint_id as string;
      const prev = usedInAgg.get(id);
      const qty = Number(r.qty ?? 0);
      if (prev) prev.qty += qty;
      else
        usedInAgg.set(id, {
          blueprint_id: id,
          item_name: bpNameMap.get(id) ?? (r.item_name as string) ?? "?",
          qty,
          unit: (r.unit as string | null) ?? null,
        });
    }
    const used_in = Array.from(usedInAgg.values()).sort((a, b) =>
      a.item_name.localeCompare(b.item_name),
    );

    // My inventory stacks referencing this exact ref.
    const { data: myInv } = await supabaseAdmin
      .from("inventory_items")
      .select(
        "id,qty,qty_reserved,unit,quality,location_id,visibility,updated_at,item_name",
      )
      .eq("owner_id", userId)
      .eq("item_ref", ref)
      .order("updated_at", { ascending: false });

    // Same name but unmapped (item_ref null) → mapping gap for the user.
    const catalogName = (cat?.name as string | undefined) ?? null;
    let unmappedSameName = 0;
    if (catalogName) {
      const { count } = await supabaseAdmin
        .from("inventory_items")
        .select("id", { count: "exact", head: true })
        .eq("owner_id", userId)
        .is("item_ref", null)
        .ilike("item_name", catalogName);
      unmappedSameName = count ?? 0;
    }

    // Location names for my stacks.
    const locIds = Array.from(
      new Set((myInv ?? []).map((r) => r.location_id).filter((x): x is string => !!x)),
    );
    const locMap = new Map<string, string>();
    if (locIds.length) {
      const { data: locs } = await supabaseAdmin
        .from("inventory_locations")
        .select("id,name")
        .in("id", locIds);
      for (const l of locs ?? []) locMap.set(l.id as string, l.name as string);
    }

    // Org warehouse: only orgs the user is a member of.
    const { data: myOrgs } = await supabaseAdmin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);
    const orgIds = (myOrgs ?? []).map((o) => o.org_id as string);
    let orgStock: Array<{
      id: string;
      org_id: string;
      org_name: string | null;
      qty: number;
      unit: string;
      quality: number | null;
      locked: boolean;
      updated_at: string;
    }> = [];
    if (orgIds.length) {
      const { data: wh } = await supabaseAdmin
        .from("org_warehouse")
        .select("id,org_id,qty,unit,quality,locked,updated_at")
        .eq("item_ref", ref)
        .in("org_id", orgIds);
      const { data: orgs } = await supabaseAdmin
        .from("orgs")
        .select("id,name")
        .in("id", orgIds);
      const orgNameMap = new Map<string, string>();
      for (const o of orgs ?? []) orgNameMap.set(o.id as string, o.name as string);
      orgStock = (wh ?? []).map((r) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        org_name: orgNameMap.get(r.org_id as string) ?? null,
        qty: Number(r.qty ?? 0),
        unit: (r.unit as string) ?? "pcs",
        quality: (r.quality as number | null) ?? null,
        locked: !!r.locked,
        updated_at: r.updated_at as string,
      }));
    }

    return {
      catalog: cat
        ? {
            item_ref: cat.item_ref as string,
            name: cat.name as string,
            kind: (cat.kind as string) ?? null,
            unit: ((cat.unit as string) ?? "pcs") as "pcs" | "scu",
            image_url: (cat.image_url as string) ?? null,
            weight: (cat.weight as number | null) ?? null,
            price_buy: (cat.price_buy as number | null) ?? null,
            price_sell: (cat.price_sell as number | null) ?? null,
            source: (cat.source as string) ?? null,
            wiki_uuid: (cat.wiki_uuid as string) ?? null,
            description: (cat.description as string) ?? null,
            shops_count: Array.isArray(cat.shops) ? cat.shops.length : 0,
            shops: Array.isArray(cat.shops)
              ? (cat.shops as Array<Record<string, unknown>>).map((s) => ({
                  terminal_name: (s.terminal_name as string) ?? null,
                  terminal_code: (s.terminal_code as string) ?? null,
                  location: (s.location as string) ?? null,
                  parent: (s.parent as string) ?? null,
                  system: (s.system as string) ?? null,
                  price_buy: (s.price_buy as number | null) ?? null,
                  price_sell: (s.price_sell as number | null) ?? null,
                  uex_link: (s.uex_link as string) ?? null,
                }))
              : [],
            manufacturer:
              (cat.raw as { manufacturer?: { name?: string | null } | null } | null)
                ?.manufacturer?.name ?? null,
            web_url:
              (cat.raw as { web_url?: string | null } | null)?.web_url ?? null,
            acquisition_keys:
              cat.acquisition && typeof cat.acquisition === "object"
                ? Object.keys(cat.acquisition as Record<string, unknown>)
                : [],
            last_synced_at: (cat.last_synced_at as string | null) ?? null,
            sources_fetched_at: (cat.sources_fetched_at as string | null) ?? null,
          }
        : null,
      component: comp
        ? {
            item_ref: comp.item_ref as string,
            name: comp.name as string,
            type_label: (comp.type_label as string) ?? null,
            category: (comp.category as string) ?? null,
            image_url: (comp.image_url as string) ?? null,
            manufacturer: (comp.manufacturer_name as string) ?? null,
            size: (comp.size as number | null) ?? null,
            web_url: (comp.web_url as string) ?? null,
          }
        : null,
      produced_by: (producedBy ?? []).map((b) => ({
        id: b.id as string,
        item_name: b.item_name as string,
        output_qty: Number(b.output_qty ?? 1),
        source: (b.source as string) ?? null,
        is_default: !!b.is_default,
      })),
      used_in,
      my_inventory: (myInv ?? []).map((r) => ({
        id: r.id as string,
        qty: Number(r.qty ?? 0),
        qty_reserved: Number(r.qty_reserved ?? 0),
        unit: ((r.unit as string) ?? "pcs") as "pcs" | "scu",
        quality: (r.quality as number | null) ?? null,
        location_name: r.location_id
          ? locMap.get(r.location_id as string) ?? null
          : null,
        visibility: (r.visibility as string) ?? "private",
        updated_at: r.updated_at as string,
      })),
      org_stock: orgStock,
      mapping: {
        has_catalog: !!cat,
        has_wiki_uuid: !!(cat?.wiki_uuid ?? null),
        has_component: !!comp,
        unmapped_same_name: unmappedSameName,
        produced_by_count: (producedBy ?? []).length,
        used_in_count: used_in.length,
        my_inventory_stacks: (myInv ?? []).length,
        org_stock_rows: orgStock.length,
      },
    };
  });