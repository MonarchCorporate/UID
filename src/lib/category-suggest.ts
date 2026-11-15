// Heuristische Zuordnung "Item → Orgalager-Kategorie".
// Wird beim Einlagern automatisch vorgeschlagen und kann vom Nutzer
// jederzeit überschrieben werden.

export type CategorySuggestInput = {
  name?: string | null;
  kind?: string | null;
  /** Aus dem Katalog-Picker: "item" | "material" | "component" | "ship" | "blueprint" */
  source?: string | null;
};

const KIND_MAP: Array<[RegExp, string]> = [
  [/armor|helmet|torso|legs \(armor\)|arms \(armor\)|undersuit|backpack \(armor\)/i, "Rüstung"],
  [/fps weapon|weapon attachment|grenade/i, "Waffen"],
  [/food|drink|bottle|consumable/i, "Verbrauch"],
  [/jacket|shirt|shoes|hat|gloves|suit|accessory|^legs$|backpack$/i, "Kleidung"],
  [/mobi ?glas|tool/i, "Tools"],
  [/resource|material|ore|gas|metal|mineral/i, "Rohstoffe"],
  [/component|cooler|shield|quantum|power plant|radar|thruster|missile rack|turret/i, "Schiffskomponenten"],
  [/ship|vehicle/i, "Schiffe"],
  [/blueprint/i, "Blueprints"],
];

const NAME_MAP: Array<[RegExp, string]> = [
  [/\bmedpen|medical|medkit\b/i, "Medizin"],
  [/\bammo|magazine|clip\b/i, "Munition"],
  [/\bfuel|hydrogen|quantum fuel\b/i, "Treibstoff"],
];

/**
 * Ordnet ein Item einer Kategorie zu. Gibt `null` zurück, wenn keine
 * verlässliche Zuordnung möglich ist — dann bleibt das Feld leer.
 */
export function suggestCategory(input: CategorySuggestInput): string | null {
  const src = (input.source ?? "").toLowerCase();
  if (src === "ship") return "Schiffe";
  if (src === "component") return "Schiffskomponenten";
  if (src === "material") return "Rohstoffe";
  if (src === "blueprint") return "Blueprints";

  const kind = (input.kind ?? "").trim();
  if (kind) {
    for (const [rx, cat] of KIND_MAP) if (rx.test(kind)) return cat;
  }
  const name = (input.name ?? "").trim();
  if (name) {
    for (const [rx, cat] of NAME_MAP) if (rx.test(name)) return cat;
    for (const [rx, cat] of KIND_MAP) if (rx.test(name)) return cat;
  }
  return null;
}

/**
 * Wählt die "beste" Kategorie: existierende Kategorie (case-insensitive Match)
 * bevorzugt, sonst der Vorschlag selbst.
 */
export function resolveSuggestedCategory(
  input: CategorySuggestInput,
  existingCategories: readonly string[],
): string | null {
  const s = suggestCategory(input);
  if (!s) return null;
  const match = existingCategories.find(
    (c) => c.trim().toLowerCase() === s.toLowerCase(),
  );
  return match ?? s;
}