import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SCCRAFTER_URL = "https://www.sccrafter.com/Blueprints.json";

type SCSegment = {
  startQuality: number;
  endQuality: number;
  modifierAtStart?: number;
  modifierAtEnd?: number;
  additiveModifierAtStart?: number;
  additiveModifierAtEnd?: number;
};

type SCModifier = {
  gameplayProperty: string;
} & SCSegment;

type SCOption = {
  type: string;
  resourceName?: string;
  entityName?: string;
  quantity?: number;
  standardCargoUnits?: number;
  minQuality?: number;
  modifiers?: SCModifier[];
};

type SCSlot = {
  slotDebugName: string;
  slotDisplayName: string;
  requiredCount: number;
  options: SCOption[];
};

type SCBlueprint = {
  blueprintName?: string;
  internalName?: string;
  categoryName?: string;
  subCategoryName?: string;
  vehicleBaseStats?: Record<string, number>;
  craftTime?: { days?: number; hours?: number; minutes?: number; seconds?: number };
  slots?: SCSlot[];
};

type SCFile = { version?: string; blueprints?: SCBlueprint[] };

/** Normalisiert Blueprint-Namen für Matching (Fancy-Quotes etc.). */
function normalizeName(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/** Entfernt nur die Quotes, behält das Variantenlabel: `LH86 "Boneyard" Pistol` → `LH86 Boneyard Pistol`. */
function unquoteVariant(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Entfernt das gesamte gequotete Variantenlabel: `LH86 "Boneyard" Pistol` → `LH86 Pistol`. */
function stripVariantLabel(s: string): string {
  return s
    .replace(/[\u2018\u2019\u02BC]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s*"[^"]+"\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Aggregierte Slot-Daten: pro Modifier neue interne Form mit Segmenten. */
export type CraftSlotModifier = {
  property_key: string;
  label: string;
  modifier_type: "multiplier" | "additive";
  better_when: "higher" | "lower" | null;
  segments: Array<{
    start_q: number;
    end_q: number;
    mod_at_start: number;
    mod_at_end: number;
  }>;
};

export type CraftSlot = {
  slot_key: string;
  slot_name: string;
  required_count: number;
  option_type: "resource" | "item" | string;
  resource_name: string | null;
  entity_name: string | null;
  item_name: string;
  scu: number | null;
  quantity: number | null;
  min_quality: number;
  modifiers: CraftSlotModifier[];
};

export type CraftBlueprintShape = {
  slots: CraftSlot[];
  base_stats: Record<string, number>;
};

/** Wandelt sccrafter-Property in einen menschenfreundlichen DE-Label. */
const LABEL_MAP: Record<string, string> = {
  Health_Maxhealth: "Integrität",
  Shield_Maxhealth: "Max. Schildstärke",
  Weapon_Damage: "Schaden",
  Weapon_Firerate: "Feuerrate",
  Weapon_Recoil_Handling: "Rückstoßkontrolle",
  Weapon_Recoil_Kick: "Rückstoß-Kick",
  Weapon_Recoil_Smoothness: "Rückstoßglättung",
  Armor_Damagemitigation: "Schadensresistenz",
  Armor_Temperaturemax: "Max. Hitzeschutz",
  Armor_Temperaturemin: "Min. Hitzeschutz",
  Armor_Radiationdissipation: "Strahlungsabführung",
  Itemresource_Coolantgeneration: "Kühlmittelproduktion",
  Itemresource_Powergeneration: "Energieerzeugung",
  Quantum_Fuelrequirement: "Quantum-Kraftstoffbedarf",
  Quantum_Speed: "Quantum-Geschwindigkeit",
  Radar_Maxaimassistdistance: "Max. Zielhilfe-Reichweite",
  Radar_Minaimassistdistance: "Min. Zielhilfe-Reichweite",
  Weapon_Hullscraping_Efficiency: "Schrott-Effizienz",
  Weapon_Hullscraping_Radius: "Schrott-Radius",
  Weapon_Hullscraping_Speed: "Schrott-Geschwindigkeit",
  Weapon_Tractor_Force: "Traktor-Kraft",
  Weapon_Tractor_Fullstrengthdist: "Traktor-Vollkraft-Reichweite",
  Weapon_Tractor_Maxdist: "Traktor-Reichweite",
  Weapon_Tractor_Maxvolume: "Traktor-Volumen",
};

function labelFor(key: string): string {
  return LABEL_MAP[key] ?? key.replace(/_/g, " ");
}

function modifierTypeFor(m: SCModifier): "multiplier" | "additive" {
  const hasMultiplier =
    Number.isFinite(Number(m.modifierAtStart)) ||
    Number.isFinite(Number(m.modifierAtEnd));
  return hasMultiplier ? "multiplier" : "additive";
}

function normalizeBlueprint(bp: SCBlueprint): CraftBlueprintShape | null {
  if (!bp.slots || bp.slots.length === 0) return null;
  const slots: CraftSlot[] = [];
  for (const s of bp.slots) {
    const opt = s.options?.[0];
    if (!opt) continue;
    const itemName = (opt.resourceName ?? opt.entityName ?? "").trim();
    if (!itemName) continue;
    const modifiers: CraftSlotModifier[] = [];
    // Gruppiere Modifier nach Property
    const byProp = new Map<string, SCModifier[]>();
    for (const m of opt.modifiers ?? []) {
      const kind = modifierTypeFor(m);
      const mapKey = `${m.gameplayProperty}::${kind}`;
      const arr = byProp.get(mapKey) ?? [];
      arr.push(m);
      byProp.set(mapKey, arr);
    }
    for (const [mapKey, segs] of byProp) {
      const [prop, kindRaw] = mapKey.split("::");
      const modifierType: "multiplier" | "additive" =
        kindRaw === "additive" ? "additive" : "multiplier";
      const neutral = modifierType === "additive" ? 0 : 1;
      const sorted = [...segs].sort((a, b) => a.startQuality - b.startQuality);
      const last = sorted[sorted.length - 1];
      const lastEnd = Number(
        modifierType === "additive"
          ? last.additiveModifierAtEnd
          : last.modifierAtEnd,
      );
      const bw: "higher" | "lower" | null =
        Number.isFinite(lastEnd) && lastEnd > neutral
          ? "higher"
          : Number.isFinite(lastEnd) && lastEnd < neutral
            ? "lower"
            : null;
      // Segmente, in denen mod-Werte im Quelldatensatz fehlen, werden als
      // neutral (1.0) behandelt, damit evalSegments nicht NaN liefert.
      const cleaned = sorted.map((x) => ({
        start_q: x.startQuality,
        end_q: x.endQuality,
        mod_at_start: Number.isFinite(
          Number(
            modifierType === "additive"
              ? x.additiveModifierAtStart
              : x.modifierAtStart,
          ),
        )
          ? Number(
              modifierType === "additive"
                ? x.additiveModifierAtStart
                : x.modifierAtStart,
            )
          : neutral,
        mod_at_end: Number.isFinite(
          Number(
            modifierType === "additive"
              ? x.additiveModifierAtEnd
              : x.modifierAtEnd,
          ),
        )
          ? Number(
              modifierType === "additive"
                ? x.additiveModifierAtEnd
                : x.modifierAtEnd,
            )
          : neutral,
      }));
      // Wenn ALLE Segmente neutral sind, Modifier komplett überspringen
      // (kein Einfluss → in der UI nicht anzeigen).
      const hasImpact = cleaned.some(
        (c) => c.mod_at_start !== neutral || c.mod_at_end !== neutral,
      );
      if (!hasImpact) continue;
      modifiers.push({
        property_key: prop,
        label: labelFor(prop),
        modifier_type: modifierType,
        better_when: bw,
        segments: cleaned,
      });
    }
    slots.push({
      slot_key: s.slotDebugName,
      slot_name: s.slotDisplayName,
      required_count: s.requiredCount ?? 1,
      option_type: opt.type,
      resource_name: opt.resourceName ?? null,
      entity_name: opt.entityName ?? null,
      item_name: itemName,
      scu: typeof opt.standardCargoUnits === "number" ? opt.standardCargoUnits : null,
      quantity: typeof opt.quantity === "number" ? opt.quantity : null,
      min_quality: opt.minQuality ?? 1,
      modifiers,
    });
  }
  return {
    slots,
    base_stats: bp.vehicleBaseStats ?? {},
  };
}

function craftSeconds(ct: SCBlueprint["craftTime"]): number | null {
  if (!ct) return null;
  return (
    (ct.days ?? 0) * 86400 +
    (ct.hours ?? 0) * 3600 +
    (ct.minutes ?? 0) * 60 +
    (ct.seconds ?? 0)
  );
}

/**
 * Synchronisiert SCCrafter Blueprint-Daten in unsere Datenbank.
 * Matched per blueprintName ↔ item_name (case-insensitive, quote-normalisiert).
 * Ersetzt für jeden Treffer: blueprint_components + output_modifiers + base_stats.
 */
export async function runSCCrafterSync(): Promise<{
  total: number;
  matched: number;
  updated: number;
  unmatched: string[];
}> {
  const res = await fetch(SCCRAFTER_URL, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`SCCrafter HTTP ${res.status}`);
  const data = (await res.json()) as SCFile;
  const bps = data.blueprints ?? [];

  // Index SC-Blueprints per normalisiertem Namen
  const scByName = new Map<string, SCBlueprint>();
  for (const b of bps) {
    if (!b.blueprintName) continue;
    scByName.set(normalizeName(b.blueprintName), b);
  }

  // Alle DB-Blueprints holen
  const { data: dbBps, error } = await supabaseAdmin
    .from("blueprints")
    .select("id,item_name,output_modifiers");
  if (error) throw new Error(error.message);

  let matched = 0;
  let updated = 0;
  const unmatched: string[] = [];

  for (const row of dbBps ?? []) {
    const key = normalizeName(row.item_name as string);
    let sc = scByName.get(key);
    if (!sc) {
      // Fallback 1: nur Quotes entfernen → matched variantenspezifische SCCrafter-Einträge
      //   z.B. `LH86 "Boneyard" Pistol` → `LH86 Boneyard Pistol`
      const unq = normalizeName(unquoteVariant(row.item_name as string));
      if (unq !== key) sc = scByName.get(unq);
    }
    if (!sc) {
      // Fallback 2: Variantenlabel komplett entfernen → matched Basis-Blueprint
      //   z.B. `Foo "SkinX" Bar` → `Foo Bar`
      const base = normalizeName(stripVariantLabel(row.item_name as string));
      if (base && base !== key) {
        sc = scByName.get(base);
      }
    }
    if (!sc) {
      unmatched.push(row.item_name as string);
      continue;
    }
    matched++;
    const shape = normalizeBlueprint(sc);
    if (!shape) continue;

    // Wiki-Sync ist die primäre Quelle für output_modifiers. Wenn dort bereits
    // Slots vorhanden sind, nur base_stats + craft_time ergänzen.
    const existing = (row as { output_modifiers?: { slots?: unknown[] } | null })
      .output_modifiers;
    const wikiHasSlots =
      !!existing && Array.isArray(existing.slots) && existing.slots.length > 0;
    const update = wikiHasSlots
      ? {
          base_stats: shape.base_stats as unknown as never,
          craft_time_seconds: craftSeconds(sc.craftTime),
        }
      : {
          base_stats: shape.base_stats as unknown as never,
          craft_time_seconds: craftSeconds(sc.craftTime),
          output_modifiers: shape as unknown as never,
          modifiers_fetched_at: new Date().toISOString(),
        };
    const { error: upErr } = await supabaseAdmin
      .from("blueprints")
      .update(update)
      .eq("id", row.id as string);
    if (upErr) throw new Error(upErr.message);

    // Komponenten nur neu schreiben, wenn Wiki noch keine Slot-Zuordnung liefert.
    if (wikiHasSlots) {
      updated++;
      continue;
    }
    await supabaseAdmin
      .from("blueprint_components")
      .delete()
      .eq("blueprint_id", row.id as string);

    const inserts = shape.slots.map((s, i) => ({
      blueprint_id: row.id as string,
      slot_label: s.slot_name,
      item_name: s.item_name,
      item_ref: null,
      kind: s.option_type,
      qty: s.option_type === "resource" ? s.scu ?? 1 : s.quantity ?? 1,
      weight: 1,
      unit: s.option_type === "resource" ? "scu" : "pcs",
      quantity_scu: s.scu ?? null,
      position: i,
    }));
    if (inserts.length > 0) {
      const { error: insErr } = await supabaseAdmin
        .from("blueprint_components")
        .insert(inserts);
      if (insErr) throw new Error(insErr.message);
    }
    updated++;
  }

  return { total: bps.length, matched, updated, unmatched: unmatched.slice(0, 50) };
}