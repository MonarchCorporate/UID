// Mining/Scanner-Frequenzen (Resistance-Harmonics).
// Basisfrequenz × 1..N je nach Seltenheitsklasse.

export type Rarity =
  | "legendary"
  | "epic"
  | "rare"
  | "uncommon"
  | "common"
  | "roc"
  | "fps"
  | "salvage";

export const RARITY_LABEL: Record<Rarity, string> = {
  legendary: "Legendary",
  epic: "Epic",
  rare: "Rare",
  uncommon: "Uncommon",
  common: "Common",
  roc: "ROC Mineable",
  fps: "FPS Mineable",
  salvage: "Salvage",
};

export const RARITY_MAX: Record<Rarity, number> = {
  legendary: 2,
  epic: 3,
  rare: 4,
  uncommon: 5,
  common: 6,
  roc: 7,
  fps: 10,
  salvage: 15,
};

export const RARITY_COLOR: Record<Rarity, string> = {
  legendary: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  epic: "text-fuchsia-300 border-fuchsia-500/40 bg-fuchsia-500/10",
  rare: "text-indigo-300 border-indigo-500/40 bg-indigo-500/10",
  uncommon: "text-sky-300 border-sky-500/40 bg-sky-500/10",
  common: "text-emerald-300 border-emerald-500/40 bg-emerald-500/10",
  roc: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  fps: "text-slate-300 border-slate-500/40 bg-slate-500/10",
  salvage: "text-orange-300 border-orange-500/40 bg-orange-500/10",
};

type Entry = { base: number; rarity: Rarity; aliases?: string[] };

// Kanonischer Name → Basisfrequenz + Seltenheit
const DATA: Record<string, Entry> = {
  Quantainium: { base: 3.17, rarity: "legendary" },
  Stileron: { base: 3.185, rarity: "legendary" },
  Savrilium: { base: 3.2, rarity: "legendary" },
  Ouratite: { base: 3.37, rarity: "epic" },
  Riccite: { base: 3.385, rarity: "epic" },
  Lindinium: { base: 3.4, rarity: "epic" },
  Beryl: { base: 3.54, rarity: "rare" },
  Taranite: { base: 3.555, rarity: "rare" },
  Borase: { base: 3.57, rarity: "rare" },
  Gold: { base: 3.585, rarity: "rare" },
  Bexalite: { base: 3.6, rarity: "rare" },
  Laranite: { base: 3.825, rarity: "uncommon" },
  Aslarite: { base: 3.84, rarity: "uncommon" },
  Titanium: { base: 3.855, rarity: "uncommon" },
  Tungsten: { base: 3.87, rarity: "uncommon" },
  Agricium: { base: 3.885, rarity: "uncommon" },
  Torite: { base: 3.9, rarity: "uncommon" },
  Hephaestanite: { base: 4.18, rarity: "common" },
  Tin: { base: 4.195, rarity: "common" },
  Quartz: { base: 4.21, rarity: "common" },
  Corundum: { base: 4.225, rarity: "common" },
  Copper: { base: 4.24, rarity: "common" },
  Silicon: { base: 4.255, rarity: "common" },
  Iron: { base: 4.27, rarity: "common" },
  Aluminium: { base: 4.285, rarity: "common", aliases: ["Aluminum"] },
  Ice: { base: 4.3, rarity: "common" },
};

const LOOKUP = new Map<string, { name: string; entry: Entry }>();
for (const [name, entry] of Object.entries(DATA)) {
  LOOKUP.set(name.toLowerCase(), { name, entry });
  for (const a of entry.aliases ?? []) LOOKUP.set(a.toLowerCase(), { name, entry });
}

export type FrequencyInfo = {
  canonicalName: string;
  rarity: Rarity;
  rarityLabel: string;
  max: number;
  harmonics: number[]; // 1× … max×
};

export function getFrequencyInfo(name: string | null | undefined): FrequencyInfo | null {
  if (!name) return null;
  const hit = LOOKUP.get(name.trim().toLowerCase());
  if (!hit) return null;
  const { entry } = hit;
  const max = RARITY_MAX[entry.rarity];
  return {
    canonicalName: hit.name,
    rarity: entry.rarity,
    rarityLabel: RARITY_LABEL[entry.rarity],
    max,
    harmonics: Array.from({ length: max }, (_, i) => +(entry.base * (i + 1)).toFixed(3)),
  };
}

export function formatFreq(v: number): string {
  return v.toFixed(3);
}