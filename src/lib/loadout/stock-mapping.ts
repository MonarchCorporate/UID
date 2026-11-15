/**
 * Strukturierte Zuordnung eines Werks-Loadouts (Star-Citizen-Wiki-Portbaum,
 * flach gespeichert in `ship_stock_loadouts.loadout`) auf die Slots des
 * Loadout-Editors.
 *
 * Der Wiki-Export ist eine *geordnete* Liste: ein Parent-Port (Turret, Rack,
 * Gimbal-Mount) wird direkt von seinen Kindern gefolgt. Daraus rekonstruieren
 * wir die Hierarchie und legen die Komponenten am richtigen Platz ab
 * (Turret 1 · Mount 1, Rack 2 · Launcher, …) statt sie nur nach Kategorie und
 * Größe zu verteilen.
 */

export interface StockEntryLike {
  category: string;
  port_name: string | null;
  class_name: string;
  size: number | null;
  item_ref: string | null;
  item_name: string | null;
  manufacturer?: string | null;
}

export interface SlotLike {
  key: string;
  name: string;
  category: string;
  size: number | null;
}

export interface TurretGroup {
  parent: StockEntryLike;
  mounts: StockEntryLike[];
}

export interface RackGroup {
  parent: StockEntryLike;
  ammo: StockEntryLike[];
}

export interface StructuredStock {
  turrets: TurretGroup[];
  racks: RackGroup[];
  /** Waffen an direkten Rumpf-Hardpoints (kein Turret). */
  weapons: StockEntryLike[];
  /** Alle übrigen Kategorien in Portreihenfolge. */
  others: Map<string, StockEntryLike[]>;
}

const RE_TURRET = /^turret|turret_/i;
const RE_RACK = /missilerack|bombrack|missile_rack/i;
const RE_AMMO = /^(missile|bomb)_\d+_attach/i;
const RE_GUN_MOUNT = /^hardpoint_(gun|weapon)/i;
const RE_CLASS_CHILD = /^hardpoint_class_/i;
const RE_GIMBAL = /gimbal|mount_/i;

function isGimbal(e: StockEntryLike): boolean {
  return RE_GIMBAL.test(e.class_name ?? "") || /gimbal mount/i.test(e.item_name ?? "");
}

/** Flache Wiki-Portliste in Turret-/Rack-Gruppen zerlegen. */
export function structureStockLoadout(entries: StockEntryLike[]): StructuredStock {
  const turrets: TurretGroup[] = [];
  const racks: RackGroup[] = [];
  const weapons: StockEntryLike[] = [];
  const others = new Map<string, StockEntryLike[]>();

  let turret: TurretGroup | null = null;
  let rack: RackGroup | null = null;
  /** Zuletzt gesehener Waffen-Mount (Gimbal) — nimmt `hardpoint_class_*` auf. */
  let lastMountRef: { list: StockEntryLike[]; index: number } | null = null;

  for (const e of entries) {
    const port = e.port_name ?? "";

    if (RE_CLASS_CHILD.test(port)) {
      // Die echte Waffe unter einem Gimbal-/Fixed-Mount: ersetzt den Mount.
      if (lastMountRef) {
        const prev = lastMountRef.list[lastMountRef.index];
        lastMountRef.list[lastMountRef.index] = isGimbal(prev) ? e : prev;
      } else {
        weapons.push(e);
      }
      continue;
    }

    if (RE_AMMO.test(port)) {
      if (rack) rack.ammo.push(e);
      continue;
    }

    if (RE_TURRET.test(port)) {
      turret = { parent: e, mounts: [] };
      turrets.push(turret);
      rack = null;
      lastMountRef = null;
      continue;
    }

    if (RE_RACK.test(port)) {
      rack = { parent: e, ammo: [] };
      racks.push(rack);
      turret = null;
      lastMountRef = null;
      continue;
    }

    if (e.category === "Weapons" || RE_GUN_MOUNT.test(port)) {
      const list = turret ? turret.mounts : weapons;
      list.push(e);
      lastMountRef = { list, index: list.length - 1 };
      continue;
    }

    // Systeme / Antriebe: einfach nach Kategorie sammeln.
    turret = null;
    rack = null;
    lastMountRef = null;
    const arr = others.get(e.category) ?? [];
    arr.push(e);
    others.set(e.category, arr);
  }

  return { turrets, racks, weapons, others };
}

const RE_SLOT_TURRET_MOUNT = /^Turret\s+(\d+)\s*·\s*Mount\s+(\d+)/i;
const RE_SLOT_RACK_LAUNCHER = /^Rack\s+(\d+)\s*·\s*Launcher/i;
const RE_SLOT_RACK_MOUNT = /^Rack\s+(\d+)\s*·\s*Mount\s+(\d+)/i;

/**
 * Slots → Stock-Einträge. Turret-/Rack-Slots werden strukturell zugeordnet,
 * alle übrigen nach Kategorie in Portreihenfolge (Größe bevorzugt).
 */
export function assignStockToSlots(
  slots: SlotLike[],
  entries: StockEntryLike[],
): Map<string, StockEntryLike> {
  const s = structureStockLoadout(entries);
  const out = new Map<string, StockEntryLike>();
  const used = new Set<StockEntryLike>();

  // 1) Turret-Mounts
  for (const slot of slots) {
    const m = RE_SLOT_TURRET_MOUNT.exec(slot.name);
    if (!m) continue;
    const group = s.turrets[Number(m[1]) - 1];
    const entry = group?.mounts[Number(m[2]) - 1];
    if (entry && !used.has(entry)) {
      out.set(slot.key, entry);
      used.add(entry);
    }
  }

  // 2) Racks + deren Munition
  for (const slot of slots) {
    const l = RE_SLOT_RACK_LAUNCHER.exec(slot.name);
    if (l) {
      const g = s.racks[Number(l[1]) - 1];
      if (g && !used.has(g.parent)) {
        out.set(slot.key, g.parent);
        used.add(g.parent);
      }
      continue;
    }
    const mm = RE_SLOT_RACK_MOUNT.exec(slot.name);
    if (mm) {
      const entry = s.racks[Number(mm[1]) - 1]?.ammo[Number(mm[2]) - 1];
      if (entry && !used.has(entry)) {
        out.set(slot.key, entry);
        used.add(entry);
      }
    }
  }

  // 3) Rumpf-Waffen (kein Turret-/Rack-Slot)
  const hullWeapons = s.weapons.filter((e) => !used.has(e));
  for (const slot of slots) {
    if (out.has(slot.key)) continue;
    if (slot.category !== "Weapons") continue;
    if (RE_SLOT_TURRET_MOUNT.test(slot.name)) continue;
    const idx = pickIndex(hullWeapons, slot.size);
    if (idx < 0) continue;
    const [e] = hullWeapons.splice(idx, 1);
    out.set(slot.key, e);
    used.add(e);
  }

  // 4) Systeme / Antriebe / Rest nach Kategorie
  const pools = new Map<string, StockEntryLike[]>();
  for (const [cat, list] of s.others) pools.set(cat, list.filter((e) => !used.has(e)));
  // Übrig gebliebene Waffen/Racks als Kategorie-Pool nachreichen.
  if (hullWeapons.length > 0) {
    pools.set("Weapons", [...(pools.get("Weapons") ?? []), ...hullWeapons]);
  }
  const leftoverRacks = s.racks.map((r) => r.parent).filter((e) => !used.has(e));
  if (leftoverRacks.length > 0) {
    pools.set("Missile & Bomb Racks", [
      ...(pools.get("Missile & Bomb Racks") ?? []),
      ...leftoverRacks,
    ]);
  }

  for (const relaxed of [false, true]) {
    for (const slot of slots) {
      if (out.has(slot.key)) continue;
      const pool = pools.get(slot.category);
      if (!pool || pool.length === 0) continue;
      const idx = relaxed ? pickIndexRelaxed(pool, slot.size) : pickIndex(pool, slot.size);
      if (idx < 0) continue;
      const [e] = pool.splice(idx, 1);
      out.set(slot.key, e);
      used.add(e);
    }
  }

  return out;
}

function pickIndex(pool: StockEntryLike[], size: number | null): number {
  if (pool.length === 0) return -1;
  if (size == null) return 0;
  return pool.findIndex((e) => e.size === size);
}

function pickIndexRelaxed(pool: StockEntryLike[], size: number | null): number {
  if (pool.length === 0) return -1;
  if (size == null) return 0;
  const le = pool.findIndex((e) => (e.size ?? 0) <= size);
  return le >= 0 ? le : 0;
}
