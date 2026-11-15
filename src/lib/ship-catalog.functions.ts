import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import fleet from "@/data/fleet.json";
import { runShipPriceSync } from "@/lib/ship-prices-sync.server";

const FY = "https://api.fleetyards.net/v1";

/**
 * Nur diese Buckets werden im Loadout-Editor angezeigt.
 * Muss mit `ALLOWED_STOCK_CATEGORIES` in stock-loadouts.functions.ts
 * synchron bleiben.
 */
const ALLOWED_EDITOR_CATEGORIES = new Set<string>([
  "Weapons",
  "Missile & Bomb Racks",
  "Shield Generators",
  "Radar",
  "Quantum Drives",
  "Power Plants",
  "Coolers",
]);

export type HardpointEntry = {
  group: string;
  category: string;
  name: string;
  size: number | null;
  details: string | null;
  /** Feiner Typ für den Editor-Picker: "weapon" | "rack" | "ammo" | "system" | "propulsion". */
  kind?: string | null;
  /**
   * Exakter Kompat-Filter für `ship_components_catalog.type`
   * (z. B. "Shield", "Cooler", "PowerPlant", "QuantumDrive", "Radar",
   * "MainThruster", "WeaponGun", "MissileLauncher", "Missile").
   */
  expectedType?: string | null;
  /**
   * Optionaler feinerer Match auf `ship_components_catalog.sub_type`
   * (z. B. Ammo-Klasse "Torpedo"/"Rocket"/"Missile").
   */
  expectedSubType?: string | null;
  /** Wenn true, muss die Item-Größe exakt zum Slot passen. */
  sizeExact?: boolean;
};

export type GalleryImage = {
  url: string;
  small: string | null;
  medium: string | null;
  large: string | null;
  alt: string | null;
  background: boolean;
};

/**
 * Pro Hardpoint ein Eintrag. Bei Fleetyards-Daten existieren keine
 * "inneren Mounts" (FY listet jeden Slot als eigenen Hardpoint), daher
 * bleibt `mounts` leer und die UI rendert "N× Size X" pro Bucket.
 */
export type DefaultLoadoutEntry = {
  category: string;
  type: string | null;
  subType: string | null;
  size: number | null;
  itemName: string | null;
  manufacturer: string | null;
  mounts?: WeaponMount[] | null;
  kind?: string | null;
};

export type WeaponMount = {
  size: number | null;
  itemName?: string | null;
};

export type ShipPaint = {
  slug: string;
  name: string;
  image: string | null;
  thumb: string | null;
  large: string | null;
};

export type ShipCatalogEntry = {
  slug: string;
  name: string;
  manufacturer: string | null;
  manufacturerCode: string | null;
  classification: string | null;
  classificationLabel: string | null;
  focus: string | null;
  size: string | null;
  sizeLabel: string | null;
  productionStatus: string | null;
  description: string | null;
  descriptionDe: string | null;
  lengthM: number | null;
  beamM: number | null;
  heightM: number | null;
  massKg: number | null;
  cargoScu: number | null;
  crewMin: number | null;
  crewMax: number | null;
  scmSpeed: number | null;
  maxSpeed: number | null;
  pitchRate: number | null;
  yawRate: number | null;
  rollRate: number | null;
  hydrogenFuel: number | null;
  quantumFuel: number | null;
  priceUec: number | null;
  pledgePriceUsd: number | null;
  priceUecTerminal: string | null;
  priceUecTerminals: ShipPriceTerminalEntry[];
  priceRentUec: number | null;
  priceSource: string | null;
  priceSyncedAt: string | null;
  storeUrl: string | null;
  fleetyardsUrl: string | null;
  heroImage: string | null;
  storeImage: string | null;
  frontView: string | null;
  sideView: string | null;
  topView: string | null;
  angledView: string | null;
  images: GalleryImage[];
  hardpoints: HardpointEntry[];
  defaultLoadout: DefaultLoadoutEntry[];
  holoUrl: string | null;
  paints: ShipPaint[];
  syncedAt: string | null;
};

export type ShipPriceTerminalEntry = {
  terminal: string;
  location: string | null;
  system: string | null;
  price: number;
  updated: string | null;
};

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function rowToEntry(row: Record<string, unknown>): ShipCatalogEntry {
  return {
    slug: row.slug as string,
    name: row.name as string,
    manufacturer: (row.manufacturer as string) ?? null,
    manufacturerCode: (row.manufacturer_code as string) ?? null,
    classification: (row.classification as string) ?? null,
    classificationLabel: (row.classification_label as string) ?? null,
    focus: (row.focus as string) ?? null,
    size: (row.size as string) ?? null,
    sizeLabel: (row.size_label as string) ?? null,
    productionStatus: (row.production_status as string) ?? null,
    description: (row.description as string) ?? null,
    descriptionDe: (row.description_de as string) ?? null,
    lengthM: num(row.length_m),
    beamM: num(row.beam_m),
    heightM: num(row.height_m),
    massKg: num(row.mass_kg),
    cargoScu: num(row.cargo_scu),
    crewMin: num(row.crew_min),
    crewMax: num(row.crew_max),
    scmSpeed: num(row.scm_speed),
    maxSpeed: num(row.max_speed),
    pitchRate: num(row.pitch_rate),
    yawRate: num(row.yaw_rate),
    rollRate: num(row.roll_rate),
    hydrogenFuel: num(row.hydrogen_fuel),
    quantumFuel: num(row.quantum_fuel),
    priceUec: num(row.price_uec),
    pledgePriceUsd: num(row.pledge_price_usd),
    priceUecTerminal: (row.price_uec_terminal as string) ?? null,
    priceUecTerminals: (row.price_uec_terminals as ShipPriceTerminalEntry[]) ?? [],
    priceRentUec: num(row.price_rent_uec),
    priceSource: (row.price_source as string) ?? null,
    priceSyncedAt: (row.price_synced_at as string) ?? null,
    storeUrl: (row.store_url as string) ?? null,
    fleetyardsUrl: (row.fleetyards_url as string) ?? null,
    heroImage: (row.hero_image as string) ?? null,
    storeImage: (row.store_image as string) ?? null,
    frontView: (row.front_view as string) ?? null,
    sideView: (row.side_view as string) ?? null,
    topView: (row.top_view as string) ?? null,
    angledView: (row.angled_view as string) ?? null,
    images: (row.images as GalleryImage[]) ?? [],
    hardpoints: (row.hardpoints as HardpointEntry[]) ?? [],
    defaultLoadout: (row.default_loadout as DefaultLoadoutEntry[]) ?? [],
    holoUrl: (row.holo_url as string) ?? null,
    paints: (row.paints as ShipPaint[]) ?? [],
    syncedAt: (row.synced_at as string) ?? null,
  };
}

function entryFromSeed(slug: string): ShipCatalogEntry | null {
  const seed = (fleet as {
    ships: Array<{
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
    }>;
  }).ships.find((s) => s.slug === slug);
  if (!seed) return null;
  return {
    slug: seed.slug,
    name: seed.name,
    manufacturer: seed.manufacturer,
    manufacturerCode: seed.manufacturerCode,
    classification: seed.classification,
    classificationLabel: seed.classification,
    focus: seed.focus,
    size: seed.size,
    sizeLabel: seed.size,
    productionStatus: null,
    description: null,
    descriptionDe: null,
    lengthM: seed.length ? Number(String(seed.length).replace(/[^0-9.]/g, "")) || null : null,
    beamM: null,
    heightM: null,
    massKg: null,
    cargoScu: seed.cargo ? Number(String(seed.cargo).replace(/[^0-9.]/g, "")) || null : null,
    crewMin: null,
    crewMax: null,
    scmSpeed: null,
    maxSpeed: null,
    pitchRate: null,
    yawRate: null,
    rollRate: null,
    hydrogenFuel: null,
    quantumFuel: null,
    priceUec: null,
    pledgePriceUsd: null,
    priceUecTerminal: null,
    priceUecTerminals: [],
    priceRentUec: null,
    priceSource: null,
    priceSyncedAt: null,
    storeUrl: seed.storeUrl,
    fleetyardsUrl: `https://fleetyards.net/ships/${seed.slug}`,
    heroImage: seed.image,
    storeImage: seed.image,
    frontView: null,
    sideView: null,
    topView: null,
    angledView: null,
    images: [],
    hardpoints: [],
    defaultLoadout: [],
    holoUrl: null,
    paints: [],
    syncedAt: null,
  };
}

/** Public: load a ship from the catalog. Falls back to seed if nothing in DB yet. */
export const getShipCatalogEntry = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ slug: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<ShipCatalogEntry | null> => {
    const { data: row } = await supabaseAdmin
      .from("ship_catalog")
      .select("*")
      .eq("slug", data.slug)
      .maybeSingle();
    if (row) {
      const entry = rowToEntry(row as Record<string, unknown>);
      // Wenn noch alte Slots (z.B. Thruster/Fuel/…) drin sind oder Mounts
      // noch nicht ausgeklappt wurden, aus FY neu ableiten und filtern.
      const hasDisallowed = entry.hardpoints.some(
        (h) => !ALLOWED_EDITOR_CATEGORIES.has(h.category) && h.category !== "Turret Mounts" && h.category !== "Missile Rack Mounts",
      );
      const hasExpandedMounts = entry.hardpoints.some(
        (h) =>
          h.category === "Turret Mounts" ||
          h.category === "Missile Rack Mounts" ||
          (typeof h.name === "string" && h.name.includes("· Mount")),
      );
      const hasKind = entry.hardpoints.some((h) => typeof h.kind === "string");
      // Für den strengen Kompat-Filter brauchen die Hardpoints zusätzlich
      // `expectedType`. Fehlt es (alte Rows), einmalig neu ableiten.
      const hasExpectedType = entry.hardpoints.some(
        (h) => typeof (h as { expectedType?: string | null }).expectedType === "string",
      );
      if (hasDisallowed || !hasExpandedMounts || !hasKind || !hasExpectedType) {
        try {
          const fyHps = await fyFetchHardpoints(entry.slug);
          const { loadout, hardpoints } = mapFyLoadout(fyHps);
          if (hardpoints.length > 0) {
            entry.hardpoints = hardpoints;
            entry.defaultLoadout = loadout;
          }
        } catch {
          // Netzwerk-Ausfall ignorieren, Editor bleibt bedienbar.
        }
      }

      // Overlay: echte Standardkomponenten (scunpacked) einblenden, wenn vorhanden.
      try {
        const { data: stock } = await supabaseAdmin
          .from("ship_stock_loadouts")
          .select("loadout")
          .eq("ship_slug", entry.slug)
          .maybeSingle();
        const stockList = (stock?.loadout as Array<{
          category: string;
          class_name: string;
          size: number | null;
          item_ref: string | null;
          item_name: string | null;
          manufacturer: string | null;
        }> | null) ?? null;
        if (stockList && stockList.length > 0) {
          const byCat = new Map<string, typeof stockList>();
          for (const s of stockList) {
            const arr = byCat.get(s.category) ?? [];
            arr.push(s);
            byCat.set(s.category, arr);
          }
          entry.defaultLoadout = entry.defaultLoadout.map((dl) => {
            const queue = byCat.get(dl.category);
            if (!queue || queue.length === 0) return dl;
            // Bevorzuge Match auf Größe.
            let idx = queue.findIndex((s) => s.size === dl.size);
            if (idx < 0) idx = 0;
            const [pick] = queue.splice(idx, 1);
            return {
              ...dl,
              itemName: pick.item_name ?? pick.class_name,
              manufacturer: pick.manufacturer ?? dl.manufacturer,
            };
          });
        }
      } catch {
        // Overlay optional — Fehler ignorieren.
      }

      return entry;
    }
    return entryFromSeed(data.slug);
  });

/** Public: list all catalog slugs (for prerender / sitemap). */
export const listShipCatalogSlugs = createServerFn({ method: "GET" }).handler(
  async (): Promise<string[]> => {
    const { data } = await supabaseAdmin.from("ship_catalog").select("slug");
    const dbSlugs = (data ?? []).map((r) => r.slug as string);
    const seedSlugs = (fleet as { ships: Array<{ slug: string }> }).ships.map((s) => s.slug);
    return Array.from(new Set([...seedSlugs, ...dbSlugs]));
  },
);

export type ShipCatalogSummary = {
  slug: string;
  name: string;
  manufacturer: string | null;
  manufacturerCode: string | null;
  classification: string | null;
  classificationLabel: string | null;
  focus: string | null;
  size: string | null;
  sizeLabel: string | null;
  lengthM: number | null;
  crewMax: number | null;
  cargoScu: number | null;
  productionStatus: string | null;
  image: string | null;
  priceUec: number | null;
  pledgePriceUsd: number | null;
  storeUrl: string | null;
};

/** Public: list all known ships for the catalog overview. */
export const listShipCatalog = createServerFn({ method: "GET" }).handler(
  async (): Promise<ShipCatalogSummary[]> => {
    const { data, error } = await supabaseAdmin
      .from("ship_catalog")
      .select(
        "slug,name,manufacturer,manufacturer_code,classification,classification_label,focus,size,size_label,length_m,crew_max,cargo_scu,production_status,hero_image,store_image,angled_view,front_view,price_uec,pledge_price_usd,store_url",
      )
      .not("fleetyards_url", "is", null);
    if (error) {
      console.error("listShipCatalog failed", error);
      return [];
    }
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const fromDb: ShipCatalogSummary[] = rows.map((r) => ({
      slug: r.slug as string,
      name: r.name as string,
      manufacturer: (r.manufacturer as string) ?? null,
      manufacturerCode: (r.manufacturer_code as string) ?? null,
      classification: (r.classification as string) ?? null,
      classificationLabel: (r.classification_label as string) ?? null,
      focus: (r.focus as string) ?? null,
      size: (r.size as string) ?? null,
      sizeLabel: (r.size_label as string) ?? null,
      lengthM: num(r.length_m),
      crewMax: num(r.crew_max),
      cargoScu: num(r.cargo_scu),
      productionStatus: (r.production_status as string) ?? null,
      image:
        (r.store_image as string) ??
        (r.hero_image as string) ??
        (r.angled_view as string) ??
        (r.front_view as string) ??
        null,
      priceUec: num(r.price_uec),
      pledgePriceUsd: num(r.pledge_price_usd),
      storeUrl: (r.store_url as string) ?? null,
    }));
    return fromDb.filter((s) => s.image !== null);
  },
);

// ---------- FLEETYARDS SYNC (single source of truth) ----------

type FyImage = {
  name?: string | null;
  url?: string | null;
  smallUrl?: string | null;
  mediumUrl?: string | null;
  largeUrl?: string | null;
  xlargeUrl?: string | null;
} | null;

type FyHardpoint = {
  name?: string | null;
  group?: string | null;
  category?: string | null;
  source?: string | null;
  minSize?: number | null;
  maxSize?: number | null;
  details?: string | null;
  hardpoints?: FyHardpoint[] | null;
};

type FyModel = {
  id: string;
  name: string;
  slug: string;
  scIdentifier?: string | null;
  description?: string | null;
  productionStatus?: string | null;
  productionStatusLabel?: string | null;
  classification?: string | null;
  classificationLabel?: string | null;
  focus?: string | null;
  size?: string | null;
  sizeLabel?: string | null;
  metrics?: {
    length?: number | null;
    beam?: number | null;
    height?: number | null;
    mass?: number | null;
    cargo?: number | null;
    hydrogenFuelTankSize?: number | null;
    quantumFuelTankSize?: number | null;
  } | null;
  speeds?: {
    scmSpeed?: number | null;
    scmSpeedBoosted?: number | null;
    pitchBoosted?: number | null;
    yawBoosted?: number | null;
    rollBoosted?: number | null;
  } | null;
  hydrogenFuelTanks?: Array<{ capacity?: number | null }> | null;
  quantumFuelTanks?: Array<{ capacity?: number | null }> | null;
  price?: number | null;
  pledgePrice?: number | null;
  crew?: { min?: number | null; max?: number | null } | null;
  manufacturer?: { name?: string | null; code?: string | null } | null;
  links?: { storeUrl?: string | null; frontend?: string | null } | null;
  media?: Record<string, FyImage> | null;
  storeImage?: string | null;
  storeImageMedium?: string | null;
  storeImageLarge?: string | null;
  fleetchartImage?: string | null;
  holo?: string | null;
  hasPaints?: boolean | null;
};

async function fyFetchModels(
  page: number,
  perPage: number,
): Promise<{ items: FyModel[]; lastPage: number }> {
  const res = await fetch(`${FY}/models?perPage=${perPage}&page=${page}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Fleetyards /models ${res.status}`);
  const json = (await res.json()) as
    | FyModel[]
    | { items?: FyModel[]; meta?: { pagination?: { totalPages?: number } } };
  const items = Array.isArray(json) ? json : (json.items ?? []);
  const totalPages = Array.isArray(json)
    ? Number(res.headers.get("x-total-pages") ?? "1") || 1
    : json.meta?.pagination?.totalPages ?? 1;
  return { items, lastPage: totalPages };
}

function sumTanks(
  tanks: Array<{ capacity?: number | null }> | null | undefined,
): number | null {
  const total = (tanks ?? []).reduce(
    (sum, t) => sum + (t.capacity ?? 0),
    0,
  );
  return total > 0 ? total : null;
}

async function fyFetchHardpoints(slug: string): Promise<FyHardpoint[]> {
  try {
    const res = await fetch(`${FY}/models/${encodeURIComponent(slug)}/hardpoints`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as FyHardpoint[] | { items?: FyHardpoint[] };
    return Array.isArray(json) ? json : (json.items ?? []);
  } catch {
    return [];
  }
}

type FyPaint = {
  id?: string;
  name?: string | null;
  slug?: string | null;
  media?: { storeImage?: FyImage } | null;
};

async function fyFetchPaints(slug: string): Promise<ShipPaint[]> {
  try {
    const res = await fetch(`${FY}/models/${encodeURIComponent(slug)}/paints`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return [];
    const json = (await res.json()) as FyPaint[] | { items?: FyPaint[] };
    const items = Array.isArray(json) ? json : (json.items ?? []);
    return items
      .map((p): ShipPaint | null => {
        const img = p.media?.storeImage ?? null;
        const large = img?.largeUrl ?? img?.xlargeUrl ?? img?.url ?? null;
        const medium = img?.mediumUrl ?? large;
        const thumb = img?.smallUrl ?? medium;
        if (!p.slug || !p.name) return null;
        return {
          slug: p.slug,
          name: p.name,
          image: medium,
          thumb,
          large,
        };
      })
      .filter((p): p is ShipPaint => p !== null);
  } catch {
    return [];
  }
}

// Bucket-Kategorien matchen die Labels in src/lib/weapon-summary.ts.
const WEAPON_CATEGORY: Record<string, string> = {
  weapon_mounts: "Weapons",
  missile_racks: "Missile & Bomb Racks",
};

// Component-Bucket-Labels für Systems- und Propulsion-Slots.
const COMPONENT_CATEGORY: Record<string, string> = {
  power_plants: "Power Plants",
  power_plant: "Power Plants",
  powerplant: "Power Plants",
  coolers: "Coolers",
  cooler: "Coolers",
  shield_generators: "Shield Generators",
  shield_generator: "Shield Generators",
  shieldgenerator: "Shield Generators",
  quantum_drives: "Quantum Drives",
  quantum_drive: "Quantum Drives",
  quantumdrive: "Quantum Drives",
  main_thrusters: "Main Thrusters",
  retro_thrusters: "Retro Thrusters",
  maneuvering_thrusters: "Maneuvering Thrusters",
  vtol_thrusters: "VTOL Thrusters",
  fuel_intakes: "Fuel Intakes",
  fuel_tanks: "Fuel Tanks",
  fueltanks: "Fuel Tanks",
  quantum_fuel_tanks: "Quantum Fuel Tanks",
  jump_modules: "Jump Modules",
  jumpdrive: "Jump Modules",
  radar: "Radar",
  computers: "Computers",
  computer: "Computers",
};

function isPdcName(name: string): boolean {
  return /pdc|pds|point\s*defense|automated/i.test(name);
}

function isRemoteName(name: string): boolean {
  return /remote/i.test(name);
}

function isMannedName(name: string): boolean {
  return /manned/i.test(name);
}

/**
 * Bucket-Label → `ship_components_catalog.type` für den Kompat-Filter.
 * Muss exakt zum in der DB gespeicherten `type` passen.
 */
function bucketExpectedType(bucket: string): string | null {
  switch (bucket) {
    case "Weapons":
      return "WeaponGun";
    case "Missile & Bomb Racks":
      return "MissileLauncher";
    case "Shield Generators":
      return "Shield";
    case "Power Plants":
      return "PowerPlant";
    case "Coolers":
      return "Cooler";
    case "Radar":
      return "Radar";
    case "Quantum Drives":
      return "QuantumDrive";
    case "Main Thrusters":
      return "MainThruster";
    default:
      return null;
  }
}

/**
 * Aus einem Rack-Namen die zu erwartende Ammo-Klasse ableiten
 * (matcht `ship_components_catalog.sub_type` bzw. `classification_label`).
 */
function rackAmmoSubType(rackName: string | null | undefined): string {
  const n = (rackName ?? "").toLowerCase();
  if (/torpedo/.test(n)) return "Torpedo";
  if (/rocket/.test(n)) return "Rocket";
  return "Missile";
}

/**
 * Mappt FY-Hardpoints (gefiltert auf `source=ship_matrix`) auf unsere
 * `DefaultLoadoutEntry`-Buckets. Reine `game_files`-Einträge werden
 * verworfen, weil sie sich mit der Ship-Matrix überschneiden und sonst
 * doppelt zählen.
 */
function mapFyLoadout(hps: FyHardpoint[]): {
  loadout: DefaultLoadoutEntry[];
  hardpoints: HardpointEntry[];
} {
  const loadout: DefaultLoadoutEntry[] = [];
  const hardpoints: HardpointEntry[] = [];
  // Turret-Index pro Bucket zählen, damit UI "Turret 1 · Mount 1" zeigen kann.
  let turretIdx = 0;
  let rackIdx = 0;
  for (const h of hps) {
    if ((h.source ?? "") !== "ship_matrix") continue;
    const group = h.group ?? "";
    const category = h.category ?? "";
    const name = h.name ?? "";
    const size = h.maxSize ?? h.minSize ?? null;

    let bucket: string | null = null;
    if (group === "weapon") {
      if (category === "turret") {
        // Turrets werden über ihre Sub-Mounts als "Weapons" ausgeklappt
        // (siehe unten). PDC/Remote/Manned separat kein eigener Bucket mehr.
        bucket = "Weapons";
      } else if (category === "missile_racks") {
        bucket = "Missile & Bomb Racks";
      } else if (category === "weapon_mounts" || category === "weapons") {
        bucket = "Weapons";
      } else if (WEAPON_CATEGORY[category]) {
        bucket = WEAPON_CATEGORY[category];
      }
    } else if (
      group === "component" ||
      group === "propulsion" ||
      group === "system" ||
      group === "thruster" ||
      group === "avionic"
    ) {
      bucket = COMPONENT_CATEGORY[category] ?? null;
    }
    if (!bucket) continue;
    // Nur die 7 erlaubten Editor-Kategorien durchlassen.
    if (!ALLOWED_EDITOR_CATEGORIES.has(bucket)) continue;

    const subs = Array.isArray(h.hardpoints) ? h.hardpoints : [];

    // Turret- oder Rack-Mounts als einzelne Slots ausklappen, damit User
    // pro Waffenmount tatsächlich eine Waffe/Missile wählen kann.
    const isTurret = group === "weapon" && category === "turret" && subs.length > 0;
    const isRack =
      group === "weapon" && category === "missile_racks" && subs.length > 0;
    if (isTurret || isRack) {
      const parentIdx = isTurret ? ++turretIdx : ++rackIdx;
      const parentLabel = isTurret ? `Turret ${parentIdx}` : `Rack ${parentIdx}`;
      if (isTurret) {
        // Parent-Slot als Info-Zeile — Turrets selbst sind keine pickbare Komponente.
        hardpoints.push({
          group,
          category: "Turret Mounts",
          name: `${parentLabel} (${name})`,
          size,
          details: h.details ?? null,
          kind: null,
          expectedType: null,
          expectedSubType: null,
          sizeExact: true,
        });
      } else {
        // Rack: pickbarer Launcher-Slot in der Größe des Racks.
        hardpoints.push({
          group,
          category: "Missile & Bomb Racks",
          name: `${parentLabel} · Launcher${size ? ` (S${size})` : ""}`,
          size,
          details: h.details ?? null,
          kind: "rack",
          expectedType: "MissileLauncher",
          expectedSubType: null,
          sizeExact: true,
        });
        loadout.push({
          category: "Missile & Bomb Racks",
          type: "weapon",
          subType: "missile_rack",
          size,
          itemName: name || null,
          manufacturer: null,
          mounts: null,
          kind: "rack",
        });
      }
      // Kind-Slots: pickbare Waffen/Missile-Mounts
      subs.forEach((s, i) => {
        const fromName = typeof s.name === "string"
          ? Number((s.name.match(/\bS(\d+)\b/i) ?? [])[1])
          : NaN;
        const subSize = Number.isFinite(fromName)
          ? fromName
          : s.maxSize ?? s.minSize ?? null;
        const subBucket = isTurret ? "Weapons" : "Missile & Bomb Racks";
        const ammoSub = isTurret ? null : rackAmmoSubType(name);
        hardpoints.push({
          group: "weapon",
          category: subBucket,
          name: `${parentLabel} · Mount ${i + 1}${subSize ? ` (S${subSize})` : ""}`,
          size: subSize,
          details: null,
          kind: isTurret ? "weapon" : "ammo",
          expectedType: isTurret ? "WeaponGun" : "Missile",
          expectedSubType: ammoSub,
          sizeExact: true,
        });
        loadout.push({
          category: subBucket,
          type: "weapon",
          subType: isTurret ? "turret_mount" : "missile_mount",
          size: subSize,
          itemName: s.name ?? null,
          manufacturer: null,
          mounts: null,
          kind: isTurret ? "weapon" : "ammo",
        });
      });
      continue;
    }

    const mounts: WeaponMount[] = subs.map((s) => {
      // FY meldet bei Missile Racks teilweise nur die Rack-Klasse als
      // maxSize. Die tatsächliche Munitionsgröße steht zuverlässig im
      // Namen (z. B. "S2 Missiles") — daher Name zuerst parsen.
      const fromName = typeof s.name === "string"
        ? Number((s.name.match(/\bS(\d+)\b/i) ?? [])[1])
        : NaN;
      const size = Number.isFinite(fromName)
        ? fromName
        : s.maxSize ?? s.minSize ?? null;
      return { size, itemName: s.name ?? null };
    });

    loadout.push({
      category: bucket,
      type: group || null,
      subType: category || null,
      size,
      itemName: name || null,
      manufacturer: null,
      mounts: mounts.length > 0 ? mounts : null,
      kind:
        bucket === "Weapons"
          ? "weapon"
          : bucket === "Missile & Bomb Racks"
            ? "rack"
            : group === "propulsion"
              ? "propulsion"
              : "system",
    });
    hardpoints.push({
      group: group || "weapon",
      category: bucket,
      name,
      size,
      details: h.details ?? null,
      kind:
        bucket === "Weapons"
          ? "weapon"
          : bucket === "Missile & Bomb Racks"
            ? "rack"
            : group === "propulsion"
              ? "propulsion"
              : "system",
      expectedType: bucketExpectedType(bucket),
      expectedSubType: null,
      sizeExact: true,
    });
  }
  return { loadout, hardpoints };
}

function pickHero(m: FyModel): string | null {
  const media = m.media ?? {};
  // Bevorzugt das cineastische Store-/Marketing-Bild (in-flight Beauty Shot)
  // wie auf fleetyards.net. Fallbacks: angledView → frontView → top-level Store-Image.
  const store = media.storeImage ?? null;
  const angled = media.angledView ?? media.angledViewColored ?? null;
  const front = media.frontView ?? null;
  return (
    store?.largeUrl ??
    store?.xlargeUrl ??
    store?.url ??
    angled?.largeUrl ??
    angled?.xlargeUrl ??
    angled?.url ??
    front?.largeUrl ??
    front?.url ??
    m.storeImageLarge ??
    m.storeImage ??
    null
  );
}

function pickGallery(m: FyModel): GalleryImage[] {
  const media = m.media ?? {};
  const out: GalleryImage[] = [];
  const seen = new Set<string>();
  const push = (img: FyImage, alt: string) => {
    if (!img) return;
    const url = img.largeUrl ?? img.xlargeUrl ?? img.url ?? img.mediumUrl ?? null;
    if (!url || seen.has(url)) return;
    seen.add(url);
    out.push({
      url,
      small: img.smallUrl ?? null,
      medium: img.mediumUrl ?? null,
      large: img.largeUrl ?? img.xlargeUrl ?? null,
      alt,
      background: false,
    });
  };
  for (const key of [
    "storeImage",
    "angledView",
    "angledViewColored",
    "frontView",
    "sideView",
    "topView",
    "backView",
    "bottomView",
  ]) {
    push(media[key] ?? null, key);
  }
  return out;
}

function pickView(m: FyModel, key: string): string | null {
  const img = (m.media ?? {})[key];
  return img?.largeUrl ?? img?.xlargeUrl ?? img?.url ?? null;
}

async function buildFyUpsert(m: FyModel) {
  const [hps, paints] = await Promise.all([
    fyFetchHardpoints(m.slug),
    m.hasPaints !== false ? fyFetchPaints(m.slug) : Promise.resolve([] as ShipPaint[]),
  ]);
  const { loadout, hardpoints } = mapFyLoadout(hps);
  const hero = pickHero(m);
  return {
    slug: m.slug,
    name: m.name,
    manufacturer: m.manufacturer?.name ?? null,
    manufacturer_code: m.manufacturer?.code ?? null,
    classification: m.classification ?? null,
    classification_label: m.classificationLabel ?? m.classification ?? null,
    focus: m.focus ?? null,
    size: m.size ?? null,
    size_label: m.sizeLabel ?? m.size ?? null,
    production_status: m.productionStatusLabel ?? m.productionStatus ?? null,
    description: m.description ?? null,
    description_de: null,
    length_m: m.metrics?.length ?? null,
    beam_m: m.metrics?.beam ?? null,
    height_m: m.metrics?.height ?? null,
    mass_kg: m.metrics?.mass ?? null,
    cargo_scu: m.metrics?.cargo ?? null,
    crew_min: m.crew?.min ?? null,
    crew_max: m.crew?.max ?? null,
    scm_speed: m.speeds?.scmSpeed ?? null,
    max_speed: m.speeds?.scmSpeedBoosted ?? null,
    pitch_rate: m.speeds?.pitchBoosted ?? null,
    yaw_rate: m.speeds?.yawBoosted ?? null,
    roll_rate: m.speeds?.rollBoosted ?? null,
    hydrogen_fuel:
      m.metrics?.hydrogenFuelTankSize ?? sumTanks(m.hydrogenFuelTanks),
    quantum_fuel:
      m.metrics?.quantumFuelTankSize ?? sumTanks(m.quantumFuelTanks),
    price_uec: m.price ?? null,
    pledge_price_usd: m.pledgePrice ?? null,
    store_url: m.links?.storeUrl ?? null,
    fleetyards_url: m.links?.frontend ?? `https://fleetyards.net/ships/${m.slug}`,
    hero_image: hero,
    store_image:
      pickView(m, "storeImage") ?? m.storeImageLarge ?? m.storeImage ?? hero,
    front_view: pickView(m, "frontView"),
    side_view: pickView(m, "sideView"),
    top_view: pickView(m, "topView"),
    angled_view: pickView(m, "angledView") ?? pickView(m, "angledViewColored"),
    images: pickGallery(m),
    hardpoints,
    default_loadout: loadout,
    holo_url: m.holo ?? null,
    paints,
    raw: m as unknown as Record<string, unknown>,
    synced_at: new Date().toISOString(),
  };
}

async function pMap<T, R>(
  arr: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(arr.length);
  let i = 0;
  async function worker() {
    while (true) {
      const idx = i++;
      if (idx >= arr.length) return;
      out[idx] = await fn(arr[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, arr.length) }, worker));
  return out;
}

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

/**
 * Admin: Synchronisiert eine Seite des Fleetyards-Katalogs. Klient ruft
 * die Funktion wiederholt mit der nächsten Seite, bis `done` true ist.
 * Lädt Stammdaten + Hardpoints parallel und schreibt sie in `ship_catalog`.
 */
export const syncShipCatalogFleetyards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        page: z.number().int().min(1).max(50).optional(),
        perPage: z.number().int().min(1).max(100).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const page = data.page ?? 1;
    const perPage = data.perPage ?? 50;

    const { items, lastPage } = await fyFetchModels(page, perPage);
    if (items.length === 0 && page === 1) {
      throw new Error("Konnte Fleetyards API nicht erreichen.");
    }

    // Existierende Slugs vorab laden, um ok vs. added zu unterscheiden.
    const slugs = items.map((m) => m.slug);
    const { data: existing } = await supabaseAdmin
      .from("ship_catalog")
      .select("slug,price_source,price_uec")
      .in("slug", slugs);
    const existingSet = new Set((existing ?? []).map((r) => r.slug as string));
    const wikiPriced = new Set(
      (existing ?? [])
        .filter((r) => {
          const rr = r as { price_source?: string; price_uec?: number | null };
          return rr.price_source === "star-citizen.wiki" && rr.price_uec != null;
        })
        .map((r) => r.slug as string),
    );

    let ok = 0;
    let added = 0;
    const failed: Array<{ slug: string; error: string }> = [];

    const upserts = await pMap(items, 6, async (m) => {
      try {
        return { slug: m.slug, row: await buildFyUpsert(m) };
      } catch (e) {
        return {
          slug: m.slug,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });

    for (const u of upserts) {
      if ("error" in u && u.error) {
        failed.push({ slug: u.slug, error: u.error });
        continue;
      }
      if (!("row" in u) || !u.row) continue;
      // Wiki-Preise (aUEC) sind aktueller als Fleetyards – nicht überschreiben.
      if (wikiPriced.has(u.slug)) delete (u.row as Record<string, unknown>).price_uec;
      const { error } = await supabaseAdmin
        .from("ship_catalog")
        .upsert(u.row as never, { onConflict: "slug" });
      if (error) {
        failed.push({ slug: u.slug, error: error.message });
      } else if (existingSet.has(u.slug)) {
        ok++;
      } else {
        added++;
      }
    }

    const done = page >= lastPage;
    return {
      page,
      lastPage,
      processed: items.length,
      ok,
      added,
      failed,
      done,
      nextPage: done ? null : page + 1,
    };
  });

/**
 * Server-only Komplett-Sync über alle Fleetyards-Seiten. Ohne Auth-Middleware,
 * damit ihn Cron-Hooks (mit Bearer-HOOK_SECRET) direkt aufrufen können.
 */
export async function runShipCatalogSyncAll(perPage = 50): Promise<{
  pages: number;
  processed: number;
  ok: number;
  added: number;
  failed: Array<{ slug: string; error: string }>;
}> {
  let page = 1;
  let lastPage = 1;
  let processed = 0;
  let ok = 0;
  let added = 0;
  const failed: Array<{ slug: string; error: string }> = [];

  do {
    const { items, lastPage: lp } = await fyFetchModels(page, perPage);
    lastPage = lp;
    if (items.length === 0) break;

    const slugs = items.map((m) => m.slug);
    const { data: existing } = await supabaseAdmin
      .from("ship_catalog")
      .select("slug,price_source,price_uec")
      .in("slug", slugs);
    const existingSet = new Set((existing ?? []).map((r) => r.slug as string));
    const wikiPriced = new Set(
      (existing ?? [])
        .filter((r) => {
          const rr = r as { price_source?: string; price_uec?: number | null };
          return rr.price_source === "star-citizen.wiki" && rr.price_uec != null;
        })
        .map((r) => r.slug as string),
    );

    const upserts = await pMap(items, 6, async (m) => {
      try {
        return { slug: m.slug, row: await buildFyUpsert(m) };
      } catch (e) {
        return {
          slug: m.slug,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    });

    for (const u of upserts) {
      processed++;
      if ("error" in u && u.error) {
        failed.push({ slug: u.slug, error: u.error });
        continue;
      }
      if (!("row" in u) || !u.row) continue;
      if (wikiPriced.has(u.slug)) delete (u.row as Record<string, unknown>).price_uec;
      const { error } = await supabaseAdmin
        .from("ship_catalog")
        .upsert(u.row as never, { onConflict: "slug" });
      if (error) failed.push({ slug: u.slug, error: error.message });
      else if (existingSet.has(u.slug)) ok++;
      else added++;
    }

    page++;
  } while (page <= lastPage);

  return { pages: lastPage, processed, ok, added, failed };
}

/** Admin: gleicht die aUEC-Preise mit der Star-Citizen-Wiki-API (UEX) ab. */
export const syncShipPricesWiki = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const r = await runShipPriceSync();
    return {
      vehicles: r.vehicles,
      matched: r.matched,
      updated: r.updated,
      changed: r.changed.length,
      unmatched: r.unmatched.length,
    };
  });
