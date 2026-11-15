import { supabaseAdmin } from "@/integrations/supabase/client.server";

const WIKI_BASE = "https://api.star-citizen.wiki/api";

async function fetchJson<T = unknown>(url: string): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
      return (await res.json()) as T;
    } catch (e) {
      if (attempt === 2) throw e;
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
    }
  }
  throw new Error("unreachable");
}

type Paged<T> = {
  data: T[];
  meta: { current_page: number; last_page: number; total: number };
};

type WikiBlueprint = {
  uuid: string;
  output_item_uuid: string | null;
  output_name: string;
  craft_time_seconds: number | null;
  is_available_by_default: boolean;
  ingredient_count: number;
  unlocking_missions_count: number;
  ingredients: Array<{
    name: string;
    kind: "item" | "resource" | string;
    item_uuid: string | null;
    resource_type_uuid: string | null;
    quantity: number | null;
    quantity_scu: number | null;
  }>;
  output?: { name?: string; type_label?: string; grade?: string } | null;
  web_url?: string | null;
};

type WikiValueSegment = {
  quality_min: number;
  quality_max: number;
  modifier_at_start: number | null;
  modifier_at_end: number | null;
};

type WikiModifier = {
  property_key: string | null;
  label: string | null;
  better_when: string | null;
  value_range_type: string | null;
  value_segments: WikiValueSegment[] | null;
  modifier_range?: {
    at_min_quality: number | null;
    at_max_quality: number | null;
  } | null;
  quality_range?: { min: number | null; max: number | null } | null;
};

type WikiReqGroup = {
  key: string | null;
  name: string | null;
  kind?: string;
  modifiers?: WikiModifier[] | null;
  children?: Array<{
    kind?: string;
    name?: string | null;
    uuid?: string | null;
    ore_uuid?: string | null;
    quantity?: number | null;
    quantity_scu?: number | null;
  }> | null;
};

type WikiAspect = {
  key: string | null;
  name: string | null;
  initial_quality?: number | null;
  slider_min?: number | null;
  slider_max?: number | null;
  has_modifiers?: boolean | null;
  has_dynamic_modifiers?: boolean | null;
  is_selected?: boolean | null;
  selection_group?: string | null;
  modifiers?: WikiModifier[] | null;
  input?: {
    kind?: string | null;
    uuid?: string | null;
    name?: string | null;
    quantity?: number | null;
    quantity_scu?: number | null;
    min_quality?: number | null;
  } | null;
};

type WikiAspectGroup = {
  key: string | null;
  name: string | null;
  display_name?: string | null;
  required_count?: number | null;
  option_count?: number | null;
  is_choice_group?: boolean | null;
  aspect_indexes?: number[] | null;
};

type WikiBlueprintDetail = WikiBlueprint & {
  requirement_groups?: WikiReqGroup[] | null;
  aspects?: {
    aspects?: WikiAspect[] | null;
    aspect_groups?: WikiAspectGroup[] | null;
  } | null;
};

type NormalizedSegment = {
  start_q: number;
  end_q: number;
  mod_at_start: number;
  mod_at_end: number;
};

type NormalizedModifier = {
  property_key: string | null;
  label: string;
  modifier_type: "multiplier" | "additive";
  better_when: "higher" | "lower" | null;
  segments: NormalizedSegment[];
  is_dynamic: boolean;
  modifier_range: {
    at_min: number | null;
    at_max: number | null;
  } | null;
};

type NormalizedSlot = {
  slot_key: string | null;
  slot_name: string;
  modifiers: NormalizedModifier[];
  initial_quality: number;
  slider_min: number;
  slider_max: number;
  has_dynamic_modifiers: boolean;
  input: {
    kind: string | null;
    uuid: string | null;
    name: string | null;
    quantity_scu: number | null;
  } | null;
};

function normalizeModifier(m: WikiModifier): NormalizedModifier | null {
  const rangeType = (m.value_range_type ?? "linear").toLowerCase();
  const modType: "multiplier" | "additive" = rangeType.includes("additive")
    ? "additive"
    : "multiplier";
  const neutral = modType === "additive" ? 0 : 1;
  const rawSegs = Array.isArray(m.value_segments) ? m.value_segments : [];
  let segs: NormalizedSegment[] = rawSegs.map((s) => ({
    start_q: Number(s.quality_min),
    end_q: Number(s.quality_max),
    mod_at_start: Number.isFinite(Number(s.modifier_at_start))
      ? Number(s.modifier_at_start)
      : neutral,
    mod_at_end: Number.isFinite(Number(s.modifier_at_end))
      ? Number(s.modifier_at_end)
      : neutral,
  }));
  // Wiki-Fallback: viele Blueprints liefern KEINE value_segments, sondern nur
  // modifier_range + quality_range (linear zwischen at_min_quality und
  // at_max_quality). Wir bauen daraus ein einzelnes Segment.
  if (segs.length === 0) {
    const rMin = Number(m.modifier_range?.at_min_quality);
    const rMax = Number(m.modifier_range?.at_max_quality);
    const qMin = Number(m.quality_range?.min);
    const qMax = Number(m.quality_range?.max);
    if (
      Number.isFinite(rMin) &&
      Number.isFinite(rMax) &&
      Number.isFinite(qMin) &&
      Number.isFinite(qMax) &&
      qMax > qMin
    ) {
      segs = [
        { start_q: qMin, end_q: qMax, mod_at_start: rMin, mod_at_end: rMax },
      ];
    }
  }
  if (segs.length === 0) return null;
  // Dynamic = the slider actually moves the value somewhere in its range.
  const isDynamic = segs.some((s) => s.mod_at_start !== s.mod_at_end);
  // Impact = ever leaves the neutral value (useful even for constants like 1.2×).
  const hasImpact = segs.some(
    (s) => s.mod_at_start !== neutral || s.mod_at_end !== neutral,
  );
  if (!hasImpact) return null;
  const bw =
    m.better_when === "higher" || m.better_when === "lower"
      ? m.better_when
      : null;
  return {
    property_key: m.property_key ?? null,
    label: (m.label ?? m.property_key ?? "—").toString(),
    modifier_type: modType,
    better_when: bw,
    segments: segs,
    is_dynamic: isDynamic,
    modifier_range: m.modifier_range
      ? {
          at_min: Number.isFinite(Number(m.modifier_range.at_min_quality))
            ? Number(m.modifier_range.at_min_quality)
            : null,
          at_max: Number.isFinite(Number(m.modifier_range.at_max_quality))
            ? Number(m.modifier_range.at_max_quality)
            : null,
        }
      : null,
  };
}

function normalizeWikiAspects(
  aspects: WikiAspect[] | null | undefined,
): NormalizedSlot[] {
  if (!Array.isArray(aspects)) return [];
  const out: NormalizedSlot[] = [];
  for (const a of aspects) {
    const slotName = (a.name ?? a.key ?? "").trim();
    if (!slotName) continue;
    const mods: NormalizedModifier[] = [];
    for (const m of a.modifiers ?? []) {
      const nm = normalizeModifier(m);
      if (nm) mods.push(nm);
    }
    const sliderMin = Number.isFinite(Number(a.slider_min))
      ? Number(a.slider_min)
      : 0;
    const sliderMax = Number.isFinite(Number(a.slider_max))
      ? Number(a.slider_max)
      : 1000;
    const initQ = Number.isFinite(Number(a.initial_quality))
      ? Number(a.initial_quality)
      : Math.round((sliderMin + sliderMax) / 2);
    out.push({
      slot_key: a.key ?? null,
      slot_name: slotName,
      modifiers: mods,
      initial_quality: initQ,
      slider_min: sliderMin,
      slider_max: sliderMax,
      has_dynamic_modifiers:
        typeof a.has_dynamic_modifiers === "boolean"
          ? a.has_dynamic_modifiers
          : mods.some((mm) => mm.is_dynamic),
      input: a.input
        ? {
            kind: a.input.kind ?? null,
            uuid: a.input.uuid ?? null,
            name: a.input.name ?? null,
            quantity_scu: Number.isFinite(Number(a.input.quantity_scu))
              ? Number(a.input.quantity_scu)
              : null,
          }
        : null,
    });
  }
  return out;
}

function normalizeWikiRequirementGroups(
  groups: WikiReqGroup[] | null | undefined,
): NormalizedSlot[] {
  if (!Array.isArray(groups)) return [];
  const out: NormalizedSlot[] = [];
  for (const g of groups) {
    const slotName = (g.name ?? g.key ?? "").trim();
    if (!slotName) continue;
    const mods: NormalizedModifier[] = [];
    for (const m of g.modifiers ?? []) {
      const nm = normalizeModifier(m);
      if (nm) mods.push(nm);
    }
    const firstChild = (g.children ?? [])[0] ?? null;
    out.push({
      slot_key: g.key ?? null,
      slot_name: slotName,
      modifiers: mods,
      initial_quality: 500,
      slider_min: 0,
      slider_max: 1000,
      has_dynamic_modifiers: mods.some((mm) => mm.is_dynamic),
      input: firstChild
        ? {
            kind: firstChild.kind ?? null,
            uuid: firstChild.uuid ?? firstChild.ore_uuid ?? null,
            name: firstChild.name ?? null,
            quantity_scu: Number.isFinite(Number(firstChild.quantity_scu))
              ? Number(firstChild.quantity_scu)
              : null,
          }
        : null,
    });
  }
  return out;
}

function slugFromWebUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = url.match(/\/blueprints\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

type WikiMission = {
  uuid: string;
  title: string;
  mission_giver: string | null;
  faction: { name: string } | null;
  reward_min: number | null;
  reward_max: number | null;
  blueprints: Array<{ name: string; uuid: string; link: string }> | null;
  min_standing?: { name: string | null; min_reputation: number | null } | null;
  max_standing?: { name: string | null; min_reputation: number | null } | null;
  reward_scope?: string | null;
  web_url?: string | null;
  legality_label?: string | null;
  star_systems?: Array<{ name?: string | null } | string> | null;
};

function extractBlueprintUuid(link: string): string | null {
  const m = link.match(/\/api\/blueprints\/([0-9a-f-]{36})/i);
  return m ? m[1] : null;
}

async function chunkUpsert<T extends Record<string, unknown>>(
  table: string,
  rows: T[],
  onConflict: string,
  size = 200,
) {
  for (let i = 0; i < rows.length; i += size) {
    const chunk = rows.slice(i, i + size);
    const { error } = await supabaseAdmin
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .from(table as any)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .upsert(chunk as any, { onConflict });
    if (error) throw new Error(`upsert ${table}: ${error.message}`);
  }
}

export async function runWikiBlueprintSync() {
  const started = Date.now();
  const now = new Date().toISOString();

  // 1) Fetch all blueprints (paginated)
  const allBlueprints: WikiBlueprint[] = [];
  let page = 1;
  let lastPage = 1;
  do {
    const url = `${WIKI_BASE}/blueprints?page%5Bsize%5D=100&page%5Bnumber%5D=${page}`;
    const res = await fetchJson<Paged<WikiBlueprint>>(url);
    allBlueprints.push(...(res.data ?? []));
    lastPage = res.meta?.last_page ?? 1;
    page += 1;
  } while (page <= lastPage);

  // Filter out placeholder entries the wiki API ships with (no real item).
  const isPlaceholderName = (s: string | null | undefined) => {
    const t = (s ?? "").trim();
    if (!t) return true;
    if (/placeholder/i.test(t)) return true;
    if (/^<=.*=>$/.test(t)) return true;
    return false;
  };
  const filteredBlueprints = allBlueprints.filter(
    (b) => !isPlaceholderName(b.output_name),
  );
  allBlueprints.length = 0;
  allBlueprints.push(...filteredBlueprints);

  // 2) Upsert blueprints (by external_uuid)
  const bpRows = allBlueprints.map((b) => ({
    external_uuid: b.uuid,
    item_name: b.output_name ?? "Unknown",
    item_ref: b.output_item_uuid ? `wiki:${b.output_item_uuid}` : null,
    output_uuid: b.output_item_uuid,
    output_qty: 1,
    craft_time_seconds: b.craft_time_seconds,
    is_default: !!b.is_available_by_default,
    source: "wiki",
    visibility: "org",
    owner_id: null,
    source_url: b.web_url ?? null,
    notes: b.output?.type_label
      ? `${b.output.type_label}${b.output.grade ? ` · Grade ${b.output.grade}` : ""}`
      : null,
    last_synced_at: now,
    updated_at: now,
  }));
  await chunkUpsert("blueprints", bpRows, "external_uuid");

  // 3) Map external_uuid -> blueprint_id
  const uuids = bpRows.map((r) => r.external_uuid);
  const idMap = new Map<string, string>();
  for (let i = 0; i < uuids.length; i += 100) {
    const chunk = uuids.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("blueprints")
      .select("id, external_uuid")
      .in("external_uuid", chunk);
    if (error) throw new Error(`select bp ids: ${error.message}`);
    for (const row of data ?? []) {
      if (row.external_uuid && row.id) idMap.set(row.external_uuid, row.id);
    }
  }

  // 4) Rebuild components (delete-then-insert per blueprint set)
  const bpIds = Array.from(idMap.values());
  for (let i = 0; i < bpIds.length; i += 200) {
    const chunk = bpIds.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("blueprint_components")
      .delete()
      .in("blueprint_id", chunk);
    if (error) throw new Error(`del bpc: ${error.message}`);
  }

  // 4b) Fetch detail (requirement_groups + modifiers) per blueprint
  const details = new Map<string, WikiBlueprintDetail>();
  await mapWithConcurrency(allBlueprints, 8, async (b) => {
    const slug = slugFromWebUrl(b.web_url) ?? b.uuid;
    try {
      const res = await fetchJson<{ data: WikiBlueprintDetail }>(
        `${WIKI_BASE}/v2/blueprints/${encodeURIComponent(slug)}`,
      );
      if (res?.data) details.set(b.uuid, res.data);
    } catch {
      // best-effort — skip; existing modifiers stay if sccrafter had them
    }
  });

  // 4c) Write output_modifiers per blueprint (only when the detail returned groups)
  for (const b of allBlueprints) {
    const bid = idMap.get(b.uuid);
    if (!bid) continue;
    const det = details.get(b.uuid);
    const fromAspects = normalizeWikiAspects(det?.aspects?.aspects);
    const slots =
      fromAspects.length > 0
        ? fromAspects
        : normalizeWikiRequirementGroups(det?.requirement_groups);
    if (slots.length === 0) continue;
    const payload = {
      slots,
      aspect_groups: det?.aspects?.aspect_groups ?? null,
    };
    const { error } = await supabaseAdmin
      .from("blueprints")
      .update({
        output_modifiers: payload as unknown as never,
        modifiers_fetched_at: now,
      })
      .eq("id", bid);
    if (error) throw new Error(`upd modifiers: ${error.message}`);
  }

  // 4d) Rebuild components, mapping each ingredient to its requirement_group name
  const compRows: Record<string, unknown>[] = [];
  for (const b of allBlueprints) {
    const bid = idMap.get(b.uuid);
    if (!bid) continue;
    const det = details.get(b.uuid);
    // Build lookup: ingredient UUID → group name (via requirement_groups.children)
    const uuidToSlot = new Map<string, string>();
    // Prefer aspects.aspects[*].input.uuid (aligned with the v2 slider model);
    // fall back to requirement_groups.children for older shapes.
    for (const a of det?.aspects?.aspects ?? []) {
      const slotName = (a.name ?? a.key ?? "").trim();
      const key = a.input?.uuid ?? null;
      if (slotName && key) uuidToSlot.set(key, slotName);
    }
    for (const g of det?.requirement_groups ?? []) {
      const slotName = (g.name ?? g.key ?? "").trim();
      if (!slotName) continue;
      for (const c of g.children ?? []) {
        const k = c.uuid ?? c.ore_uuid ?? null;
        if (k && !uuidToSlot.has(k)) uuidToSlot.set(k, slotName);
      }
    }
    (b.ingredients ?? []).forEach((ing, idx) => {
      const externalUuid = ing.item_uuid ?? ing.resource_type_uuid ?? null;
      const itemRef = externalUuid ? `wiki:${externalUuid}` : null;
      const isResource = ing.kind === "resource" || ing.quantity_scu != null;
      const unit = isResource ? "scu" : "pcs";
      const qty = isResource
        ? Number(ing.quantity_scu ?? ing.quantity ?? 0)
        : Number(ing.quantity ?? ing.quantity_scu ?? 1);
      const slotLabel =
        (externalUuid && uuidToSlot.get(externalUuid)) ?? `${idx + 1}`;
      compRows.push({
        blueprint_id: bid,
        slot_label: slotLabel,
        item_name: ing.name,
        item_ref: itemRef,
        external_uuid: externalUuid,
        kind: ing.kind ?? null,
        qty,
        unit,
        quantity_scu: ing.quantity_scu,
        weight: 1,
        position: idx,
      });
    });
  }
  for (let i = 0; i < compRows.length; i += 500) {
    const chunk = compRows.slice(i, i + 500);
    const { error } = await supabaseAdmin
      .from("blueprint_components")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .insert(chunk as any);
    if (error) throw new Error(`ins bpc: ${error.message}`);
  }

  // 5) Sync missions that unlock blueprints
  const allMissions: WikiMission[] = [];
  page = 1;
  lastPage = 1;
  do {
    const url = `${WIKI_BASE}/missions?page%5Bsize%5D=100&page%5Bnumber%5D=${page}&filter%5Bhas_blueprints%5D=1`;
    const res = await fetchJson<Paged<WikiMission>>(url);
    allMissions.push(...(res.data ?? []));
    lastPage = res.meta?.last_page ?? 1;
    page += 1;
  } while (page <= lastPage);

  // Clear & rebuild blueprint_missions for synced blueprints
  for (let i = 0; i < bpIds.length; i += 200) {
    const chunk = bpIds.slice(i, i + 200);
    const { error } = await supabaseAdmin
      .from("blueprint_missions")
      .delete()
      .in("blueprint_id", chunk);
    if (error) throw new Error(`del bm: ${error.message}`);
  }

  const missionRows: Record<string, unknown>[] = [];
  for (const m of allMissions) {
    for (const link of m.blueprints ?? []) {
      const bpUuid = extractBlueprintUuid(link.link);
      if (!bpUuid) continue;
      const bid = idMap.get(bpUuid);
      if (!bid) continue;
      missionRows.push({
        blueprint_id: bid,
        mission_uuid: m.uuid,
        mission_title: m.title,
        mission_giver: m.mission_giver,
        faction: m.faction?.name ?? null,
        reward_min: m.reward_min,
        reward_max: m.reward_max,
        min_standing_name: m.min_standing?.name ?? null,
        min_reputation: m.min_standing?.min_reputation ?? null,
        max_standing_name: m.max_standing?.name ?? null,
        max_reputation: m.max_standing?.min_reputation ?? null,
        reward_scope: m.reward_scope ?? null,
        web_url: m.web_url ?? null,
        legality_label: m.legality_label ?? null,
        star_systems: Array.isArray(m.star_systems)
          ? m.star_systems
              .map((s) =>
                typeof s === "string" ? s : (s?.name ?? null),
              )
              .filter((x): x is string => !!x)
          : null,
      });
    }
  }
  // de-dupe (blueprint_id, mission_uuid)
  const seen = new Set<string>();
  const deduped = missionRows.filter((r) => {
    const k = `${r.blueprint_id}:${r.mission_uuid}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  await chunkUpsert("blueprint_missions", deduped, "blueprint_id,mission_uuid");

  // 5b) Auto-match wiki UUIDs onto inventory_item_catalog by name
  const matched = await matchInventoryWikiUuidsServer();

  // 6) Update sync status in app_settings
  await supabaseAdmin.from("app_settings").upsert(
    {
      key: "wiki_blueprint_sync",
      value: JSON.stringify({
        last_synced_at: now,
        blueprints_count: allBlueprints.length,
        missions_count: deduped.length,
        catalog_matched_count: matched.updated,
        duration_ms: Date.now() - started,
      }),
    },
    { onConflict: "key" },
  );

  return {
    blueprints_count: allBlueprints.length,
    components_count: compRows.length,
    mission_links_count: deduped.length,
    catalog_matched_count: matched.updated,
    duration_ms: Date.now() - started,
    synced_at: now,
  };
}

/**
 * Build a name → wiki_uuid map from blueprint_components (most frequent UUID
 * per normalized name wins) and update inventory_item_catalog.wiki_uuid where
 * the catalog name matches. Idempotent — safe to run multiple times.
 */
export async function matchInventoryWikiUuidsServer() {
  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ");

  // Pull every component name/uuid pair (chunked iteration)
  const counts = new Map<string, Map<string, number>>(); // name -> uuid -> count
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("blueprint_components")
      .select("item_name, external_uuid")
      .not("external_uuid", "is", null)
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`scan bpc: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data) {
      const name = normalize(String(r.item_name ?? ""));
      const uuid = r.external_uuid as string | null;
      if (!name || !uuid) continue;
      const m = counts.get(name) ?? new Map<string, number>();
      m.set(uuid, (m.get(uuid) ?? 0) + 1);
      counts.set(name, m);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  // Pick most frequent UUID per name (only when unambiguous-ish)
  const nameToUuid = new Map<string, string>();
  for (const [name, m] of counts) {
    let best: { uuid: string; count: number } | null = null;
    for (const [uuid, count] of m) {
      if (!best || count > best.count) best = { uuid, count };
    }
    if (best) nameToUuid.set(name, best.uuid);
  }

  if (nameToUuid.size === 0) return { updated: 0, scanned: 0 };

  // Walk catalog and update mismatches
  let updated = 0;
  let scanned = 0;
  from = 0;
  while (true) {
    const { data, error } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select("item_ref, name, wiki_uuid")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`scan catalog: ${error.message}`);
    if (!data || data.length === 0) break;
    scanned += data.length;

    const updates: Array<{ item_ref: string; wiki_uuid: string }> = [];
    for (const row of data) {
      const target = nameToUuid.get(normalize(String(row.name ?? "")));
      if (target && row.wiki_uuid !== target) {
        updates.push({ item_ref: row.item_ref as string, wiki_uuid: target });
      }
    }
    // Apply updates one-by-one in small batches via individual updates
    for (const u of updates) {
      const { error: uErr } = await supabaseAdmin
        .from("inventory_item_catalog")
        .update({ wiki_uuid: u.wiki_uuid })
        .eq("item_ref", u.item_ref);
      if (uErr) throw new Error(`update catalog: ${uErr.message}`);
      updated += 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }

  return { updated, scanned };
}

export async function getWikiBlueprintSyncStatusServer() {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", "wiki_blueprint_sync")
    .maybeSingle();
  let v: Record<string, unknown> = {};
  if (data?.value) {
    try {
      v = JSON.parse(data.value) as Record<string, unknown>;
    } catch {
      v = {};
    }
  }
  const { count } = await supabaseAdmin
    .from("blueprints")
    .select("id", { count: "exact", head: true })
    .eq("source", "wiki");
  return {
    last_synced_at: (v.last_synced_at as string | null) ?? null,
    blueprints_count: count ?? 0,
    missions_count: (v.missions_count as number | null) ?? null,
    duration_ms: (v.duration_ms as number | null) ?? null,
  };
}