/**
 * Legacy shim. The real implementation now lives in
 * `src/lib/loadout/domain/*`. Kept for backwards compatibility so existing
 * imports (`@/lib/loadout-calc`) keep working during Phase 1.
 */

import type { ComponentPick } from "./loadout/domain/types";
import {
  weaponStats as _weaponStats,
  missileStats as _missileStats,
  aggregateWeapons,
  aggregateMissiles,
} from "./loadout/domain/stats/weapons";
import { shieldStats as _shieldStats, aggregateShields } from "./loadout/domain/stats/shields";
import { powerGeneration, aggregatePower } from "./loadout/domain/stats/power";
import { coolingRate, aggregateCooling } from "./loadout/domain/stats/cooling";

export type { ComponentPick } from "./loadout/domain/types";
export { summarizeLoadout } from "./loadout/domain";

/* Back-compat wrappers that keep the pre-refactor shapes ------------------- */

/* eslint-disable @typescript-eslint/no-explicit-any */
export function weaponStats(raw: any): {
  dps: number;
  alpha: number;
  range: number;
  rpm: number;
  power: number;
  heat: number;
} {
  const s = _weaponStats(raw);
  return {
    dps: s.burstDps,
    alpha: s.alpha,
    range: s.range,
    rpm: s.rpm,
    power: s.power,
    heat: s.heat,
  };
}

export function missileStats(raw: any) {
  return _missileStats(raw);
}

export function powerGen(raw: any): number {
  return powerGeneration(raw);
}

export function coolerRate(raw: any): number {
  return coolingRate(raw);
}

export function shieldStats(raw: any): { hp: number; regen: number } {
  const s = _shieldStats(raw);
  return { hp: s.hp, regen: s.regen };
}

export type LoadoutTotals = {
  weaponCount: number;
  totalDps: number;
  totalAlpha: number;
  minRange: number;
  missileCount: number;
  missileDamage: number;
  shieldHp: number;
  shieldRegen: number;
  powerGen: number;
  powerDraw: number;
  coolerRate: number;
  heatPerVolley: number;
};

export function computeTotals(picks: ComponentPick[]): LoadoutTotals {
  const w = aggregateWeapons(picks);
  const m = aggregateMissiles(picks);
  const s = aggregateShields(picks);
  const p = aggregatePower(picks);
  const c = aggregateCooling(picks);
  return {
    weaponCount: w.weaponCount,
    totalDps: w.totalBurstDps,
    totalAlpha: w.totalAlpha,
    minRange: w.minRange,
    missileCount: m.missileCount,
    missileDamage: m.missileDamage,
    shieldHp: s.totalCapacity,
    shieldRegen: s.totalRegen,
    powerGen: p.available,
    powerDraw: p.required,
    coolerRate: c.available,
    heatPerVolley: w.totalHeatPerVolley,
  };
}

export function fmt(n: number, unit = ""): string {
  if (!Number.isFinite(n) || n === 0) return "—";
  const str = n.toLocaleString("de-DE", { maximumFractionDigits: 1 });
  return unit ? `${str} ${unit}` : str;
}