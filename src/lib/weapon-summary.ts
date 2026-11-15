import type { DefaultLoadoutEntry, WeaponMount } from "./ship-catalog.functions";

/**
 * Eine Bucket-Zeile entspricht einer Sammlung gleicher Hardpoints im
 * RSI-Format: "7×2 Size 5" = 7 Turrets mit jeweils 2 S5-Mounts.
 * Bei single-mount Hardpoints (z. B. PDC, Missile, Pilot-Waffe) ist
 * `mountsPerHardpoint = 1` und das Format wird "11× Size 1".
 */
export type WeaponBucketRow = {
  count: number;
  mountsPerHardpoint: number;
  size: number | null;
  itemNames: string[];
};

export type WeaponBucket = {
  category: string;
  rows: WeaponBucketRow[];
  total: number;
};

const WEAPON_CATEGORIES = [
  "Weapons",
  "Manned Turrets",
  "Remote Turrets",
  "Turrets",
  "PDC Turrets",
  "Missile & Bomb Racks",
  "Counter Measures",
] as const;

const WEAPON_CATEGORY_SET = new Set<string>(WEAPON_CATEGORIES);

export function isWeaponCategory(cat: string): boolean {
  return WEAPON_CATEGORY_SET.has(cat);
}

/**
 * Reduziert die default_loadout-Einträge eines Schiffes auf RSI-artige
 * Buckets. Für Hardpoints mit `mounts[]` (z. B. Turrets) wird die Anzahl
 * der inneren Mounts und deren typische Größe zur Gruppierung genutzt.
 * Für Single-Mount-Slots (Pilot-Waffe, PDC, Missile, Countermeasure) wird
 * die Größe des Hardpoints selbst benutzt.
 */
export function buildWeaponBuckets(
  loadout: DefaultLoadoutEntry[],
): WeaponBucket[] {
  const byCat = new Map<string, DefaultLoadoutEntry[]>();
  for (const e of loadout) {
    if (!WEAPON_CATEGORY_SET.has(e.category)) continue;
    const list = byCat.get(e.category) ?? [];
    list.push(e);
    byCat.set(e.category, list);
  }
  const out: WeaponBucket[] = [];
  for (const cat of WEAPON_CATEGORIES) {
    const list = byCat.get(cat);
    if (!list || list.length === 0) continue;
    const rowMap = new Map<string, WeaponBucketRow>();
    for (const entry of list) {
      const mounts = (entry.mounts ?? []).filter(
        (m): m is WeaponMount => !!m,
      );
      const mountsPerHardpoint = mounts.length > 0 ? mounts.length : 1;
      const size =
        mounts.length > 0
          ? (dominantSize(mounts.map((m) => m.size)) ?? entry.size)
          : entry.size;
      const key = `${mountsPerHardpoint}|${size ?? "x"}`;
      const row =
        rowMap.get(key) ??
        ({
          count: 0,
          mountsPerHardpoint,
          size,
          itemNames: [],
        } as WeaponBucketRow);
      row.count += 1;
      if (entry.itemName) row.itemNames.push(entry.itemName);
      rowMap.set(key, row);
    }
    const rows = Array.from(rowMap.values()).sort(
      (a, b) => (b.size ?? -1) - (a.size ?? -1) || b.count - a.count,
    );
    const total = rows.reduce(
      (n, r) => n + r.count * r.mountsPerHardpoint,
      0,
    );
    out.push({ category: cat, rows, total });
  }
  return out;
}

function dominantSize(sizes: Array<number | null>): number | null {
  const counts = new Map<number, number>();
  for (const s of sizes) {
    if (s === null) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best: number | null = null;
  let bestCount = -1;
  for (const [s, c] of counts) {
    if (c > bestCount) {
      best = s;
      bestCount = c;
    }
  }
  return best;
}

/** "7×2 Size 5" / "11× Size 1" / "1× Size 8" */
export function formatBucketRow(row: WeaponBucketRow): string {
  const sizeLabel = row.size !== null ? `Size ${row.size}` : "Mount";
  if (row.mountsPerHardpoint > 1) {
    return `${row.count}×${row.mountsPerHardpoint} ${sizeLabel}`;
  }
  return `${row.count}× ${sizeLabel}`;
}

export const WEAPON_BUCKET_LABEL_DE: Record<string, string> = {
  "Weapons": "Pilotgesteuerte Waffen",
  "Manned Turrets": "Bemannte Turrets",
  "Remote Turrets": "Remote-Turrets",
  "Turrets": "Turrets",
  "PDC Turrets": "PDC",
  "Missile & Bomb Racks": "Raketen & Bomben",
  "Counter Measures": "Gegenmaßnahmen",
};

/**
 * RSI-Pledge-Store-Style:
 *   Weapons          N/A
 *   Missiles         2x10 Size 5
 *   Turrets          2x2 Size 8
 *                    4x2 Size 3
 *                    6x Size 2 PDCs
 *   Counter Measures 4x Size 1
 */
export type RsiWeaponSection = {
  label: string;
  /** Quellkategorien, aus denen sich die Sektion zusammensetzt (für Detail-View). */
  sourceCategories: string[];
  /** Bereits formatierte Zeilen ("2x10 Size 5"). Leer → "N/A". */
  rows: string[];
};

export function buildRsiWeaponSections(
  loadout: DefaultLoadoutEntry[],
): RsiWeaponSection[] {
  const buckets = buildWeaponBuckets(loadout);
  const byCat = new Map(buckets.map((b) => [b.category, b] as const));

  const fmt = (r: WeaponBucketRow, suffix = ""): string => {
    const sizeLabel = r.size !== null ? `Size ${r.size}` : "Mount";
    const head =
      r.mountsPerHardpoint > 1
        ? `${r.count}x${r.mountsPerHardpoint} ${sizeLabel}`
        : `${r.count}x ${sizeLabel}`;
    return suffix ? `${head} ${suffix}` : head;
  };

  const sortRows = (a: WeaponBucketRow, b: WeaponBucketRow) =>
    (b.size ?? -1) - (a.size ?? -1) || b.count - a.count;

  // Turrets: Manned + Remote + generic Turrets + PDC (PDC bekommt Suffix " PDCs")
  const turretRows: string[] = [];
  const turretCats: string[] = [];
  for (const cat of ["Manned Turrets", "Remote Turrets", "Turrets"] as const) {
    const b = byCat.get(cat);
    if (!b) continue;
    turretCats.push(cat);
    for (const r of [...b.rows].sort(sortRows)) turretRows.push(fmt(r));
  }
  const pdc = byCat.get("PDC Turrets");
  if (pdc) {
    turretCats.push("PDC Turrets");
    for (const r of [...pdc.rows].sort(sortRows)) turretRows.push(fmt(r, "PDCs"));
  }

  const sectionFromCat = (cat: string): string[] => {
    const b = byCat.get(cat);
    if (!b) return [];
    return [...b.rows].sort(sortRows).map((r) => fmt(r));
  };

  return [
    { label: "Weapons", sourceCategories: ["Weapons"], rows: sectionFromCat("Weapons") },
    {
      label: "Missiles",
      sourceCategories: ["Missile & Bomb Racks"],
      rows: sectionFromCat("Missile & Bomb Racks"),
    },
    { label: "Turrets", sourceCategories: turretCats, rows: turretRows },
    {
      label: "Counter Measures",
      sourceCategories: ["Counter Measures"],
      rows: sectionFromCat("Counter Measures"),
    },
  ];
}