/** Maps a raw item_kind (from UEX / wiki) to a broad warehouse category. */
const KIND_MAP: Record<string, string> = {};

function reg(cat: string, kinds: string[]) {
  for (const k of kinds) KIND_MAP[k.toLowerCase()] = cat;
}

reg("Schiffskomponenten", [
  "Shield Generators", "Power Plants", "Coolers", "Quantum Drives",
  "Mining Laser Heads", "Mining Modules", "Jump Modules",
  "Missile Racks", "Missiles", "Bomb Racks", "Bombs", "Torpedo Tubes",
  "Radar", "Tractor Beams", "Scraper Beams", "Salvage Beams",
  "External Fuel Tanks", "Life Support Generator", "Point Defense Cannon",
  "Docking Collars", "Flight Blade", "Module",
  // Singular / alternative wiki + ship-component names
  "Shield Generator", "Shield", "Power Plant", "Cooler", "Cooling",
  "Quantum Drive", "Quantum Fuel Tank", "Jump Drive", "Jump Module",
  "Mining Laser Head", "Mining Module", "Missile Rack", "Missile",
  "Bomb Rack", "Bomb", "Torpedo Tube", "Torpedo", "Countermeasure",
  "Countermeasures", "Tractor Beam", "Scraper Beam", "Salvage Beam",
  "External Fuel Tank", "Fuel Tank", "Fuel Intake", "Life Support",
  "EMP Generator", "QED", "QED Generator", "Ship Weapon", "Turret",
  "Gimbal", "Gadget", "Thruster", "Main Thruster", "Maneuvering Thruster",
  "Utility Item", "Paint", "Livery",
]);
reg("Rüstung", [
  "Helmet (Armor)", "Arms (Armor)", "Torso (Armor)", "Legs (Armor)",
  "Backpack (Armor)", "Full Set", "Helmets", "Backpack", "Backpacks", "Helmet",
]);
reg("Kleidung", [
  "Hat", "Hats", "Shirt", "Shirts", "Jacket", "Jackets", "Legs", "Legwear",
  "Shoes", "Footwear", "Gloves", "Eyeware", "Suit", "Torso",
]);
reg("Waffen", [
  "FPS Weapon", "Personal Weapons", "Guns", "Ammunition", "Grenade",
  "Attachments", "Arms",
]);
reg("Konsumgüter", [
  "Food", "Foods", "Drink", "Drinks", "Medicine", "Medical",
  "Consumables", "Fps Consumable", "Bottle",
]);
reg("Rohstoffe", [
  "Mineral", "Minteral", "Metal", "Non-Metal", "Alloy", "Gas", "Liquid",
  "Halogen", "Chemical", "Raw Materials", "Organic", "Organics", "Natural",
  "Man-made", "Man-Made", "Agricultural", "Harvestables", "Seed", "Scrap",
  "Erz", "Ore", "Material", "Materials", "Rohstoff", "Rohstoffe",
]);
reg("Handelswaren", ["Commodities", "Commodity"]);
reg("Sonstiges", [
  "Miscellaneous", "Other", "Decorations", "Liveries", "Gadgets",
  "Mobi Glas", "Mobiglas", "Container", "Temporary", "Surface", "Drug",
  "Explosive", "Animal", "Char Accessory Eyes", "Electronics", "Crafting",
  "Fuel",
]);

export function autoCategorize(
  kind?: string | null,
  name?: string | null,
): string | null {
  if (kind) {
    const raw = kind.toLowerCase().trim();
    const hit =
      KIND_MAP[raw] ??
      // drop a trailing plural "s" (e.g. "coolers" → "cooler")
      (raw.endsWith("s") ? KIND_MAP[raw.slice(0, -1)] : undefined);
    if (hit) return hit;
  }
  const n = (name ?? "").toLowerCase();
  const k = (kind ?? "").toLowerCase();
  // Kind-based substring fallback (catches "Quantum Drive - Size 2", …)
  if (k) {
    if (/(shield|power plant|cooler|quantum|thruster|missile|torpedo|radar|scanner|jump drive|tractor|salvage|scraper|fuel tank|life support|countermeasure|emp|qed|turret|gimbal)/.test(k))
      return "Schiffskomponenten";
    if (/(armor|helmet|backpack|torso|undersuit)/.test(k)) return "Rüstung";
    if (/(weapon|rifle|pistol|smg|shotgun|sniper|ammo|grenade|attachment)/.test(k))
      return "Waffen";
  }
  if (!n) return null;
  if (/(shield|power plant|cooler|quantum|thruster|missile|torpedo|radar|scanner|jump drive|tractor|salvage beam|scraper|fuel tank|life support|countermeasure|\bemp\b|\bqed\b|turret|gimbal)/.test(n))
    return "Schiffskomponenten";
  if (/(helmet|armor|rüstung|chest|torso|arms|legs|backpack)/.test(n)) return "Rüstung";
  if (/(rifle|pistol|gun|weapon|smg|shotgun|sniper|ammo|grenade)/.test(n)) return "Waffen";
  if (/(ore|mineral|gold|copper|iron|titan|quartz|diamond|erz)/.test(n)) return "Rohstoffe";
  return null;
}

/**
 * Wie {@link autoCategorize}, zieht aber zusätzlich Metadaten aus dem
 * Item-Katalog (`inventory_item_catalog`) heran, wenn `item_ref` gesetzt ist –
 * so werden Wiki-/UEX-Items automatisch korrekt einsortiert, auch wenn beim
 * Einlagern nur der Name/Ref ohne `kind` vorliegt.
 */
export async function autoCategorizeWithCatalog(
  item_ref?: string | null,
  kind?: string | null,
  name?: string | null,
): Promise<string | null> {
  // Commodity-Refs sind immer Handelswaren.
  if (item_ref && item_ref.startsWith("commodity:")) return "Handelswaren";

  // Erst mit vorhandenen Angaben versuchen.
  const direct = autoCategorize(kind, name);
  if (direct) return direct;

  if (!item_ref) return null;
  try {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const { data } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select("kind, name")
      .eq("item_ref", item_ref)
      .maybeSingle();
    if (!data) return null;
    return autoCategorize(
      (data as { kind?: string | null }).kind ?? null,
      (data as { name?: string | null }).name ?? name ?? null,
    );
  } catch {
    return null;
  }
}