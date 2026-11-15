/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentPick, DamageType } from "../types";

function n(v: any): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export interface WeaponStats {
  alpha: number;
  rpm: number;
  shotsPerSecond: number;
  burstDps: number;
  range: number;
  power: number;
  heat: number;
  ammoCapacity: number;
  reloadTime: number;
  chargeTime: number;
  cooldownTime: number;
  firingDuration: number;
  damageByType: Record<DamageType, number>;
}

const TYPE_KEYS: Array<[string, DamageType]> = [
  ["physical", "physical"],
  ["energy", "energy"],
  ["distortion", "distortion"],
  ["thermal", "thermal"],
];

function damageByType(w: any, fallbackAlpha: number): Record<DamageType, number> {
  const src = w?.damage?.per_shot ?? w?.damage ?? w?.damage_per_shot ?? {};
  const out: Record<DamageType, number> = {
    physical: 0,
    energy: 0,
    distortion: 0,
    thermal: 0,
  };
  let any = false;
  for (const [key, kind] of TYPE_KEYS) {
    const v = n((src as any)?.[key]);
    if (v > 0) any = true;
    out[kind] += v;
  }
  if (!any && fallbackAlpha > 0) {
    // Unknown type breakdown → attribute to physical as a neutral default.
    out.physical = fallbackAlpha;
  }
  return out;
}

export function weaponStats(raw: any): WeaponStats {
  const empty: WeaponStats = {
    alpha: 0,
    rpm: 0,
    shotsPerSecond: 0,
    burstDps: 0,
    range: 0,
    power: 0,
    heat: 0,
    ammoCapacity: 0,
    reloadTime: 0,
    chargeTime: 0,
    cooldownTime: 0,
    firingDuration: 0,
    damageByType: { physical: 0, energy: 0, distortion: 0, thermal: 0 },
  };
  if (!raw || typeof raw !== "object") return empty;
  const w = raw.vehicle_weapon ?? {};
  const mode = Array.isArray(w.modes) ? w.modes[0] ?? {} : {};
  const alpha = n(w.damage_per_shot ?? w.damage?.alpha_total);
  const rpm = n(w.rpm ?? mode.rounds_per_minute);
  const shotsPerSecond = rpm / 60;
  const burstDps = alpha * shotsPerSecond;
  const ammoCapacity = n(w.ammo?.capacity ?? w.magazine_capacity);
  const reloadTime = n(w.ammo?.reload_time ?? w.reload_time);
  const chargeTime = n(mode.charge_time ?? w.charge_time);
  const cooldownTime = n(w.heat?.cooldown_time ?? mode.cooldown_time);
  const firingDuration = shotsPerSecond > 0 && ammoCapacity > 0
    ? ammoCapacity / shotsPerSecond
    : Infinity;
  return {
    alpha,
    rpm,
    shotsPerSecond,
    burstDps,
    range: n(w.range),
    power: n(raw.resource_network?.usage?.power?.max),
    heat: n(w.heat?.per_shot),
    ammoCapacity,
    reloadTime,
    chargeTime,
    cooldownTime,
    firingDuration,
    damageByType: damageByType(w, alpha),
  };
}

export function isWeaponPick(p: ComponentPick): boolean {
  return (p.category ?? "").toLowerCase() === "weapons";
}

export interface WeaponsAggregate {
  weaponCount: number;
  totalAlpha: number;
  totalBurstDps: number;
  minRange: number;
  totalPowerDraw: number;
  totalHeatPerVolley: number;
  alphaByType: Record<DamageType, number>;
  burstDpsByType: Record<DamageType, number>;
  perWeapon: Array<{ pick: ComponentPick; stats: WeaponStats }>;
}

export function aggregateWeapons(picks: ComponentPick[]): WeaponsAggregate {
  const zero: WeaponsAggregate = {
    weaponCount: 0,
    totalAlpha: 0,
    totalBurstDps: 0,
    minRange: 0,
    totalPowerDraw: 0,
    totalHeatPerVolley: 0,
    alphaByType: { physical: 0, energy: 0, distortion: 0, thermal: 0 },
    burstDpsByType: { physical: 0, energy: 0, distortion: 0, thermal: 0 },
    perWeapon: [],
  };
  let minRange = Infinity;
  for (const p of picks) {
    if (!isWeaponPick(p) || !p.raw) continue;
    const s = weaponStats(p.raw);
    if (s.alpha <= 0 && s.burstDps <= 0) continue;
    zero.weaponCount += 1;
    zero.totalAlpha += s.alpha;
    zero.totalBurstDps += s.burstDps;
    zero.totalPowerDraw += s.power;
    zero.totalHeatPerVolley += s.heat;
    if (s.range > 0 && s.range < minRange) minRange = s.range;
    for (const k of ["physical", "energy", "distortion", "thermal"] as DamageType[]) {
      zero.alphaByType[k] += s.damageByType[k];
      zero.burstDpsByType[k] += s.damageByType[k] * s.shotsPerSecond;
    }
    zero.perWeapon.push({ pick: p, stats: s });
  }
  zero.minRange = minRange === Infinity ? 0 : minRange;
  return zero;
}

export interface MissileStats {
  count: number;
  damage: number;
}

export function missileStats(raw: any): MissileStats {
  const rack = raw?.missile_rack ?? {};
  const m = raw?.missile ?? {};
  const dmg = Array.isArray(m.damages) ? m.damages[0] : null;
  return { count: n(rack.missile_count), damage: n(dmg?.damage) };
}

export interface MissilesAggregate {
  missileCount: number;
  missileDamage: number;
}

export function aggregateMissiles(picks: ComponentPick[]): MissilesAggregate {
  const out: MissilesAggregate = { missileCount: 0, missileDamage: 0 };
  for (const p of picks) {
    if ((p.category ?? "").toLowerCase() !== "missiles" || !p.raw) continue;
    const m = missileStats(p.raw);
    const count = m.count || 1;
    out.missileCount += count;
    out.missileDamage += m.damage * count;
  }
  return out;
}