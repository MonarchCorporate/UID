import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/* ============================================================
 * Crafting-Qualitäts-Modell (SC-orientiert)
 * ============================================================
 * Skala 0–1000. Tier-Schwellen + Bonus-Texte:
 */
export type QualityTier =
  | "Poor"
  | "Standard"
  | "Good"
  | "High"
  | "Exceptional";

export function tierFor(quality: number | null): {
  tier: QualityTier | null;
  bonus: string;
} {
  if (quality === null || Number.isNaN(quality))
    return { tier: null, bonus: "—" };
  if (quality < 250) return { tier: "Poor", bonus: "Malus −" };
  if (quality < 500) return { tier: "Standard", bonus: "kein Bonus" };
  if (quality < 700) return { tier: "Good", bonus: "kleiner Bonus +" };
  if (quality < 900) return { tier: "High", bonus: "deutlicher Bonus ++" };
  return { tier: "Exceptional", bonus: "Top-Bonus +++" };
}

/* ============================================================
 * Output-Modifiers (Wiki → blueprints.output_modifiers Cache)
 * ============================================================ */

export type BpModifier = {
  property_key: string | null;
  label: string;
  modifier_type?: "multiplier" | "additive";
  better_when: "higher" | "lower" | null;
  /** Wiki-Flag: bewegt der Slider diesen Wert überhaupt? */
  is_dynamic?: boolean;
  /** Wiki-Preview: Wert am unteren/oberen Ende des Slot-Sliders. */
  modifier_range?: { at_min: number | null; at_max: number | null } | null;
  /**
   * Stückweise lineare Segmente (sccrafter-Modell).
   * Bei Q in [start_q, end_q] wird zwischen mod_at_start und mod_at_end
   * linear interpoliert. Vor erstem Segment = mod_at_start des ersten,
   * nach letztem = mod_at_end des letzten.
   */
  segments: Array<{
    start_q: number;
    end_q: number;
    mod_at_start: number;
    mod_at_end: number;
  }>;
};

export type BpModifierGroup = {
  key: string | null;
  name: string;
  /** Liste der internen Komponenten-IDs, die zu dieser Gruppe gehören. */
  member_component_ids: string[];
  modifiers: BpModifier[];
  /** Wiki-Slider-Grenzen und Default-Position pro Slot. */
  initial_quality?: number;
  slider_min?: number;
  slider_max?: number;
  has_dynamic_modifiers?: boolean;
  input?: {
    kind: string | null;
    uuid: string | null;
    name: string | null;
    quantity_scu: number | null;
  } | null;
};

/**
 * Liest die `output_modifiers`-JSON der Blaupause und mappt sie auf
 * die interne Gruppenstruktur. Unterstützt das neue SCCrafter-Schema
 * `{slots:[...], base_stats:{...}}`.
 */
async function ensureBlueprintModifiers(
  bp: Record<string, unknown>,
  components: ComponentPlan[],
): Promise<BpModifierGroup[]> {
  const raw = bp.output_modifiers as
    | { slots?: Array<Record<string, unknown>> }
    | null
    | undefined;
  if (!raw || !Array.isArray(raw.slots)) return [];
  return raw.slots.map((slotRaw) => {
    const s = slotRaw as {
      slot_key?: string;
      slot_name?: string;
      item_name?: string;
      initial_quality?: number;
      slider_min?: number;
      slider_max?: number;
      has_dynamic_modifiers?: boolean;
      input?: {
        kind?: string | null;
        uuid?: string | null;
        name?: string | null;
        quantity_scu?: number | null;
      } | null;
      modifiers?: Array<{
        property_key?: string;
        label?: string;
        modifier_type?: string;
        better_when?: string;
        is_dynamic?: boolean;
        modifier_range?: {
          at_min?: number | null;
          at_max?: number | null;
        } | null;
        segments?: Array<{
          start_q: number;
          end_q: number;
          mod_at_start: number;
          mod_at_end: number;
        }>;
      }>;
    };
    const slotName = s.slot_name ?? s.slot_key ?? "—";
    // Komponenten, die zu diesem Slot gehören (nach slot_label = slot_name match)
    const member = components.filter(
      (c) => (c.slot_label ?? "") === slotName,
    );
    const sliderMin = Number.isFinite(Number(s.slider_min))
      ? Number(s.slider_min)
      : 0;
    const sliderMax = Number.isFinite(Number(s.slider_max))
      ? Number(s.slider_max)
      : 1000;
    const initQ = Number.isFinite(Number(s.initial_quality))
      ? Number(s.initial_quality)
      : Math.round((sliderMin + sliderMax) / 2);
    return {
      key: s.slot_key ?? null,
      name: slotName,
      member_component_ids: member.map((c) => c.component_id),
      initial_quality: initQ,
      slider_min: sliderMin,
      slider_max: sliderMax,
      has_dynamic_modifiers:
        typeof s.has_dynamic_modifiers === "boolean"
          ? s.has_dynamic_modifiers
          : (s.modifiers ?? []).some((mm) => mm?.is_dynamic === true),
      input: s.input
        ? {
            kind: s.input.kind ?? null,
            uuid: s.input.uuid ?? null,
            name: s.input.name ?? null,
            quantity_scu: Number.isFinite(Number(s.input.quantity_scu))
              ? Number(s.input.quantity_scu)
              : null,
          }
        : null,
      modifiers: (s.modifiers ?? []).map((m) => ({
        property_key: m.property_key ?? null,
        label: m.label ?? m.property_key ?? "—",
        modifier_type: m.modifier_type === "additive" ? "additive" : "multiplier",
        better_when:
          m.better_when === "higher" || m.better_when === "lower"
            ? m.better_when
            : null,
        is_dynamic: m.is_dynamic !== false,
        modifier_range: m.modifier_range
          ? {
              at_min: Number.isFinite(Number(m.modifier_range.at_min))
                ? Number(m.modifier_range.at_min)
                : null,
              at_max: Number.isFinite(Number(m.modifier_range.at_max))
                ? Number(m.modifier_range.at_max)
                : null,
            }
          : null,
        segments: (m.segments ?? []).map((seg) => ({
          start_q: Number(seg.start_q),
          end_q: Number(seg.end_q),
          mod_at_start: Number(seg.mod_at_start),
          mod_at_end: Number(seg.mod_at_end),
        })),
      })),
    };
  });
}

/**
 * Wertet ein stückweise lineares Modifier-Profil bei Qualität q (0..1000) aus.
 * Außerhalb der Segmente werden die Randwerte gehalten.
 */
function evalSegments(
  segments: BpModifier["segments"],
  q: number,
  modifierType: "multiplier" | "additive" = "multiplier",
): number {
  const neutral = modifierType === "additive" ? 0 : 1;
  if (segments.length === 0) return neutral;
  const safe = segments.map((s) => ({
    start_q: Number(s.start_q),
    end_q: Number(s.end_q),
    mod_at_start: Number.isFinite(Number(s.mod_at_start))
      ? Number(s.mod_at_start)
      : neutral,
    mod_at_end: Number.isFinite(Number(s.mod_at_end))
      ? Number(s.mod_at_end)
      : neutral,
  }));
  const sorted = safe.sort((a, b) => a.start_q - b.start_q);
  if (q <= sorted[0].start_q) return sorted[0].mod_at_start;
  const last = sorted[sorted.length - 1];
  if (q >= last.end_q) return last.mod_at_end;
  for (const s of sorted) {
    if (q >= s.start_q && q <= s.end_q) {
      const span = s.end_q - s.start_q;
      const t = span > 0 ? (q - s.start_q) / span : 0;
      return s.mod_at_start + (s.mod_at_end - s.mod_at_start) * t;
    }
  }
  return neutral;
}

export type ComputedModifier = BpModifier & {
  value: number; // berechneter Multiplikator bei group_quality
  is_bonus: boolean | null;
};

export type ComputedGroup = {
  name: string;
  group_quality: number | null;
  member_component_ids: string[];
  modifiers: ComputedModifier[];
  slider_min: number;
  slider_max: number;
  initial_quality: number;
  has_dynamic_modifiers: boolean;
  input?: BpModifierGroup["input"];
};

export type FinalModifier = {
  key: string;
  label: string;
  better_when: "higher" | "lower" | null;
  multiplier_pct: number; // Summe aller Multiplikator-Slot-Modifier in %
  additive: number; // Summe aller additiven Slot-Modifier
  contributions: Array<{
    slot_name: string;
    quality: number | null;
    value: number;
    modifier_type: "multiplier" | "additive";
  }>;
};

function computeGroups(
  groups: BpModifierGroup[],
  components: ComponentPlan[],
  _fallbackQuality: number | null,
): ComputedGroup[] {
  const byId = new Map(components.map((c) => [c.component_id, c] as const));
  return groups.map((g) => {
    const sliderMin = g.slider_min ?? 0;
    const sliderMax = g.slider_max ?? 1000;
    const initQ = g.initial_quality ?? Math.round((sliderMin + sliderMax) / 2);
    const members = g.member_component_ids
      .map((id) => byId.get(id))
      .filter((c): c is ComponentPlan => !!c && c.quality_used !== null);
    let gq: number | null = null;
    if (members.length > 0) {
      let sum = 0;
      let w = 0;
      for (const m of members) {
        sum += (m.quality_used ?? 0) * m.required_qty;
        w += m.required_qty;
      }
      gq = w > 0 ? sum / w : null;
    }
    if (gq === null) {
      // Slot without a matching material stack falls back to the wiki-provided
      // initial slider position (500 by default), not to the blueprint-wide
      // average — otherwise every slot would echo the same number.
      gq = initQ;
    }
    // Clamp to the wiki-defined slider window.
    gq = Math.min(sliderMax, Math.max(sliderMin, gq));
    return {
      name: g.name,
      group_quality: gq === null ? null : Math.round(gq),
      member_component_ids: g.member_component_ids,
      slider_min: sliderMin,
      slider_max: sliderMax,
      initial_quality: initQ,
      has_dynamic_modifiers: g.has_dynamic_modifiers ?? true,
      input: g.input ?? null,
      modifiers: g.modifiers.map((m) => {
        const modifierType = m.modifier_type ?? "multiplier";
        const neutral = modifierType === "additive" ? 0 : 1;
        const value = evalSegments(m.segments, gq ?? initQ, modifierType);
        const isBonus =
          m.better_when === "higher"
            ? value > neutral
            : m.better_when === "lower"
              ? value < neutral
              : null;
        return { ...m, value, is_bonus: isBonus };
      }),
    };
  });
}

function aggregateFinalModifiers(groups: ComputedGroup[]): FinalModifier[] {
  const map = new Map<string, FinalModifier>();
  for (const g of groups) {
    if (g.group_quality === null) continue;
    for (const m of g.modifiers) {
      const key = m.property_key ?? m.label;
      const existing = map.get(key);
      const modifierType = m.modifier_type ?? "multiplier";
      const contrib = {
        slot_name: g.name,
        quality: g.group_quality,
        value: m.value,
        modifier_type: modifierType,
      };
      if (existing) {
        if (modifierType === "additive") existing.additive += m.value;
        else existing.multiplier_pct += (m.value - 1) * 100;
        existing.contributions.push(contrib);
      } else {
        map.set(key, {
          key,
          label: m.label,
          better_when: m.better_when,
          multiplier_pct: modifierType === "additive" ? 0 : (m.value - 1) * 100,
          additive: modifierType === "additive" ? m.value : 0,
          contributions: [contrib],
        });
      }
    }
  }
  return Array.from(map.values());
}

type Pick = {
  stack_id: string;
  item_name: string;
  item_ref: string | null;
  stack_quality: number | null;
  qty_use: number;
  location_id: string | null;
  location_name: string | null;
};

type ComponentPlan = {
  component_id: string;
  slot_label: string | null;
  item_name: string;
  item_ref: string | null;
  kind: string | null;
  weight: number;
  unit: string;
  required_qty: number;
  available_qty: number;
  shortage: number;
  eff_quality: number | null;
  auto_quality: number | null;
  quality_used: number | null;
  picks: Pick[];
  available_stacks: Array<{
    quality: number | null;
    qty_total: number;
    locations: string[];
  }>;
};

function wikiUuidFromRef(ref: string | null): string | null {
  return ref?.startsWith("wiki:") ? ref.slice(5) : null;
}

async function resolveInventoryRefs(
  itemRef: string | null,
  itemName: string,
): Promise<string[]> {
  const refs = new Set<string>();
  if (itemRef) refs.add(itemRef);

  const uuid = wikiUuidFromRef(itemRef);
  if (uuid) {
    const { data } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select("item_ref,wiki_uuid")
      .eq("wiki_uuid", uuid);
    for (const row of data ?? []) {
      if (row.item_ref) refs.add(row.item_ref as string);
      if (row.wiki_uuid) refs.add(`wiki:${row.wiki_uuid}`);
    }
  }

  const { data: byName } = await supabaseAdmin
    .from("inventory_item_catalog")
    .select("item_ref,wiki_uuid")
    .ilike("name", itemName);
  for (const row of byName ?? []) {
    if (row.item_ref) refs.add(row.item_ref as string);
    if (row.wiki_uuid) refs.add(`wiki:${row.wiki_uuid}`);
  }

  return Array.from(refs);
}

async function findInventoryStacks(
  userId: string,
  itemRef: string | null,
  itemName: string,
): Promise<Array<Record<string, unknown>>> {
  const rows = new Map<string, Record<string, unknown>>();
  const refs = await resolveInventoryRefs(itemRef, itemName);

  if (refs.length > 0) {
    const { data, error } = await supabaseAdmin
      .from("inventory_items")
      .select("*")
      .eq("owner_id", userId)
      .in("item_ref", refs);
    if (error) throw new Error(error.message);
    for (const row of data ?? []) rows.set(row.id as string, row as Record<string, unknown>);
  }

  const { data: byName, error: nameErr } = await supabaseAdmin
    .from("inventory_items")
    .select("*")
    .eq("owner_id", userId)
    .ilike("item_name", itemName);
  if (nameErr) throw new Error(nameErr.message);
  for (const row of byName ?? []) rows.set(row.id as string, row as Record<string, unknown>);

  return Array.from(rows.values());
}

async function buildPlan(
  userId: string,
  blueprintId: string,
  multiplier: number,
  targetLocationId: string | null,
  slotQualities: Record<string, number>,
): Promise<{
  blueprint: Record<string, unknown>;
  components: ComponentPlan[];
  output_quality: number | null;
  output_qty_total: number;
  can_craft: boolean;
}> {
  const { data: bp, error: bpErr } = await supabaseAdmin
    .from("blueprints")
    .select("*")
    .eq("id", blueprintId)
    .maybeSingle();
  if (bpErr) throw new Error(bpErr.message);
  if (!bp) throw new Error("Blaupause nicht gefunden.");

  const { data: comps, error: cErr } = await supabaseAdmin
    .from("blueprint_components")
    .select("*")
    .eq("blueprint_id", blueprintId)
    .order("position", { ascending: true })
    .order("id", { ascending: true });
  if (cErr) throw new Error(cErr.message);
  const components = comps ?? [];

  // Lager-Namen für Anzeige
  const { data: locs } = await supabaseAdmin
    .from("inventory_locations")
    .select("id,name");
  const locMap = new Map(
    (locs ?? []).map((l) => [l.id as string, l.name as string]),
  );

  const plans: ComponentPlan[] = [];

  for (const c of components) {
    const required = Number(c.qty ?? c.weight ?? 0) * multiplier;
    // Stacks suchen: Blueprint-Wiki-Refs, lokale Katalog-Refs und Namen matchen.
    const stacks = await findInventoryStacks(
      userId,
      (c.item_ref as string) ?? null,
      c.item_name as string,
    );

    // Verfügbare Menge je Stack
    const candidates = (stacks ?? [])
      .map((s) => ({
        id: s.id as string,
        item_name: s.item_name as string,
        item_ref: (s.item_ref as string) ?? null,
        qty_avail: Math.max(
          0,
          Number(s.qty ?? 0) - Number(s.qty_reserved ?? 0),
        ),
        quality: (s.quality as number | null) ?? null,
        location_id: (s.location_id as string | null) ?? null,
      }))
      .filter((s) => s.qty_avail > 0);

    // Sortierung: Ziel-Lager zuerst, dann Qualität DESC (null = -1)
    candidates.sort((a, b) => {
      const aLoc = a.location_id === targetLocationId ? 0 : 1;
      const bLoc = b.location_id === targetLocationId ? 0 : 1;
      if (aLoc !== bLoc) return aLoc - bLoc;
      const aq = a.quality ?? -1;
      const bq = b.quality ?? -1;
      return bq - aq;
    });

    let need = required;
    const picks: Pick[] = [];
    let availableTotal = 0;
    for (const cand of candidates) availableTotal += cand.qty_avail;

    for (const cand of candidates) {
      if (need <= 0) break;
      const take = Math.min(cand.qty_avail, need);
      picks.push({
        stack_id: cand.id,
        item_name: cand.item_name,
        item_ref: cand.item_ref,
        stack_quality: cand.quality,
        qty_use: take,
        location_id: cand.location_id,
        location_name: cand.location_id
          ? locMap.get(cand.location_id) ?? null
          : null,
      });
      need -= take;
    }

    // eff_quality
    let wSum = 0;
    let wTot = 0;
    for (const p of picks) {
      if (p.stack_quality === null) continue;
      wSum += p.qty_use * p.stack_quality;
      wTot += p.qty_use;
    }
    const eff = wTot > 0 ? wSum / wTot : null;

    // Available stacks: gruppiere alle Kandidaten nach Qualität (für UI-Dropdown)
    const groupMap = new Map<
      string,
      { quality: number | null; qty_total: number; locations: Set<string> }
    >();
    for (const cand of candidates) {
      const key = cand.quality === null ? "null" : String(cand.quality);
      const ex = groupMap.get(key);
      const locName = cand.location_id
        ? locMap.get(cand.location_id) ?? "—"
        : "ohne Lager";
      if (ex) {
        ex.qty_total += cand.qty_avail;
        ex.locations.add(locName);
      } else {
        groupMap.set(key, {
          quality: cand.quality,
          qty_total: cand.qty_avail,
          locations: new Set([locName]),
        });
      }
    }
    const available_stacks = Array.from(groupMap.values())
      .map((g) => ({
        quality: g.quality,
        qty_total: g.qty_total,
        locations: Array.from(g.locations),
      }))
      .sort((a, b) => {
        if (a.quality === null) return 1;
        if (b.quality === null) return -1;
        return b.quality - a.quality;
      });

    plans.push({
      component_id: c.id as string,
      slot_label: (c.slot_label as string) ?? null,
      item_name: c.item_name as string,
      item_ref: (c.item_ref as string) ?? null,
      kind: (c.kind as string) ?? null,
      weight: Number(c.weight),
      unit: (c.unit as string) ?? "pcs",
      required_qty: required,
      available_qty: availableTotal,
      shortage: Math.max(0, required - availableTotal),
      eff_quality: eff,
      auto_quality: eff,
      quality_used:
        slotQualities[c.id as string] !== undefined
          ? Math.max(0, Math.min(1000, Math.round(slotQualities[c.id as string])))
          : eff,
      picks,
      available_stacks,
    });
  }

  // Output-Qualität (für Inventar-Stack-Gruppierung): weighted nach required_qty
  let outSum = 0;
  let outW = 0;
  for (const p of plans) {
    if (p.quality_used === null) continue;
    outSum += p.required_qty * p.quality_used;
    outW += p.required_qty;
  }
  const output_quality = outW > 0 ? Math.round(outSum / outW) : null;

  const can_craft = plans.length > 0 && plans.every((p) => p.shortage <= 1e-9);
  const output_qty_total = Number(bp.output_qty ?? 1) * multiplier;

  return { blueprint: bp, components: plans, output_quality, output_qty_total, can_craft };
}

export const getCraftPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        blueprint_id: z.string().uuid(),
        multiplier: z.number().int().min(1).max(100),
        output_location_id: z.string().uuid().optional().nullable(),
        slot_qualities: z.record(z.string(), z.number().min(0).max(1000)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const plan = await buildPlan(
      context.userId,
      data.blueprint_id,
      data.multiplier,
      data.output_location_id ?? null,
      data.slot_qualities ?? {},
    );
    const groups = await ensureBlueprintModifiers(plan.blueprint, plan.components);
    const computed = computeGroups(groups, plan.components, plan.output_quality);
    const final_modifiers = aggregateFinalModifiers(computed);
    return {
      blueprint: {
        id: plan.blueprint.id as string,
        item_name: plan.blueprint.item_name as string,
        item_ref: (plan.blueprint.item_ref as string) ?? null,
        output_qty: Number(plan.blueprint.output_qty ?? 1),
        base_stats:
          (plan.blueprint.base_stats as Record<string, number> | null) ?? {},
      },
      components: plan.components,
      output_quality: plan.output_quality,
      output_qty_total: plan.output_qty_total,
      can_craft: plan.can_craft,
      modifier_groups: computed,
      final_modifiers,
    };
  });

/**
 * Crafting-Transaktion (sequentiell, mit Vorab-Validierung).
 * Auto-Pick: höchste Qualität zuerst, Ziel-Lager bevorzugt.
 */
export const craft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        blueprint_id: z.string().uuid(),
        multiplier: z.number().int().min(1).max(100),
        output_location_id: z.string().uuid().optional().nullable(),
        slot_qualities: z.record(z.string(), z.number().min(0).max(1000)).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const plan = await buildPlan(
      userId,
      data.blueprint_id,
      data.multiplier,
      data.output_location_id ?? null,
      data.slot_qualities ?? {},
    );
    if (!plan.can_craft) {
      const missing = plan.components
        .filter((c) => c.shortage > 0)
        .map((c) => `${c.item_name} (fehlen ${c.shortage})`)
        .join(", ");
      throw new Error(`Nicht genug Material: ${missing}`);
    }

    const bp = plan.blueprint as Record<string, unknown>;
    const consumed: Array<Record<string, unknown>> = [];

    // Materialien abziehen
    for (const comp of plan.components) {
      for (const pick of comp.picks) {
        const { data: row, error: rErr } = await supabaseAdmin
          .from("inventory_items")
          .select("qty,qty_reserved,item_name")
          .eq("id", pick.stack_id)
          .eq("owner_id", userId)
          .maybeSingle();
        if (rErr) throw new Error(rErr.message);
        if (!row) throw new Error("Stack verschwunden – bitte erneut versuchen.");
        const avail =
          Number(row.qty ?? 0) - Number(row.qty_reserved ?? 0);
        if (avail < pick.qty_use)
          throw new Error(
            `Race-Condition: "${row.item_name}" hat nur noch ${avail}.`,
          );
        const newQty = Number(row.qty) - pick.qty_use;
        if (newQty <= 0.000001 && Number(row.qty_reserved ?? 0) <= 0) {
          // Leergeräumte Stacks nicht als 0-Zeile im Inventar stehen lassen.
          const { error: dErr } = await supabaseAdmin
            .from("inventory_items")
            .delete()
            .eq("id", pick.stack_id)
            .eq("owner_id", userId);
          if (dErr) throw new Error(dErr.message);
        } else {
          const { error: uErr } = await supabaseAdmin
            .from("inventory_items")
            .update({ qty: newQty })
            .eq("id", pick.stack_id)
            .eq("owner_id", userId);
          if (uErr) throw new Error(uErr.message);
        }
        consumed.push({
          component_id: comp.component_id,
          stack_id: pick.stack_id,
          qty: pick.qty_use,
          quality: pick.stack_quality,
          location_id: pick.location_id,
        });
      }
    }

    // Output-Stack: bestehenden Stack im Ziel-Lager mit gleicher Qualität
    // wiederverwenden, sonst neuen anlegen.
    const outRef = (bp.item_ref as string) ?? null;
    const outName = bp.item_name as string;
    let outStackId: string | null = null;
    if (outRef) {
      let mq = supabaseAdmin
        .from("inventory_items")
        .select("id,qty")
        .eq("owner_id", userId)
        .eq("item_ref", outRef);
      if (data.output_location_id)
        mq = mq.eq("location_id", data.output_location_id);
      else mq = mq.is("location_id", null);
      if (plan.output_quality === null) mq = mq.is("quality", null);
      else mq = mq.eq("quality", plan.output_quality);
      const { data: existing } = await mq.limit(1);
      if (existing && existing.length > 0) {
        outStackId = existing[0].id as string;
        await supabaseAdmin
          .from("inventory_items")
          .update({ qty: Number(existing[0].qty) + plan.output_qty_total })
          .eq("id", outStackId);
      }
    }
    if (!outStackId) {
      const { data: outRow, error: outErr } = await supabaseAdmin
        .from("inventory_items")
        .insert({
          owner_id: userId,
          item_ref: outRef,
          item_name: outName,
          item_kind: "crafted",
          qty: plan.output_qty_total,
          qty_reserved: 0,
          quality: plan.output_quality,
          location_id: data.output_location_id ?? null,
          visibility: "private",
          notes: `Hergestellt aus Blaupause: ${outName}`,
        })
        .select("id")
        .single();
      if (outErr) throw new Error(outErr.message);
      outStackId = outRow.id as string;
    }

    const finalModsForHistory = aggregateFinalModifiers(
      computeGroups(
        await ensureBlueprintModifiers(bp, plan.components),
        plan.components,
        plan.output_quality,
      ),
    );

    const componentsSnapshot = plan.components.map((c) => ({
      component_id: c.component_id,
      slot_label: c.slot_label,
      item_name: c.item_name,
      item_ref: c.item_ref,
      kind: c.kind,
      weight: c.weight,
      required_qty: c.required_qty,
      eff_quality: c.eff_quality,
      quality_used: c.quality_used,
      picks: c.picks,
    }));

    const t = tierFor(plan.output_quality);
    await supabaseAdmin.from("craft_history").insert({
      user_id: userId,
      blueprint_id: bp.id as string,
      blueprint_name: outName,
      output_qty: plan.output_qty_total,
      output_quality: plan.output_quality,
      components_snapshot: componentsSnapshot as unknown as never,
      consumed_snapshot: ({
        multiplier: data.multiplier,
        output_location_id: data.output_location_id ?? null,
        output_stack_id: outStackId,
        tier: t.tier,
        bonus: t.bonus,
        final_modifiers: finalModsForHistory,
        consumed,
      }) as unknown as never,
    });

    return {
      ok: true,
      output_stack_id: outStackId,
      output_quality: plan.output_quality,
      tier: t.tier,
      bonus: t.bonus,
    };
  });

export const listCraftHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("craft_history")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(200);
    return { history: data ?? [] };
  });