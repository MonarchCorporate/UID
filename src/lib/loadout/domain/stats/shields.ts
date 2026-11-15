/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentPick } from "../types";

function n(v: any): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export interface ShieldStats {
  hp: number;
  regen: number;
  damagedDelay: number;
  downedDelay: number;
  resistPhysical: number;
  resistEnergy: number;
  resistDistortion: number;
}

export function shieldStats(raw: any): ShieldStats {
  const s = raw?.shield ?? {};
  return {
    hp: n(s.max_health),
    regen: n(s.regen_rate),
    damagedDelay: n(s.damaged_regen_delay ?? s.regen_delay),
    downedDelay: n(s.downed_regen_delay),
    resistPhysical: n(s.resistance?.physical),
    resistEnergy: n(s.resistance?.energy),
    resistDistortion: n(s.resistance?.distortion),
  };
}

export interface ShieldAggregate {
  totalCapacity: number;
  totalRegen: number;
  timeToFullRecharge: number;
  damagedDelay: number;
  downedDelay: number;
  /**
   * Aggregated resistance per damage type (fraction 0..1).
   * We take the *max* across mounted shields — a hit gets absorbed by any
   * facing that covers it. When no shield reports a value for that type
   * the entry is 0 (no reduction).
   */
  resistance: {
    physical: number;
    energy: number;
    distortion: number;
  };
  /**
   * Effective HP against a specific damage type = capacity / (1 - resist).
   * Handy for comparing loadouts that trade raw HP for resistance.
   */
  effectiveHp: {
    physical: number;
    energy: number;
    distortion: number;
  };
}

function isShield(p: ComponentPick): boolean {
  const cat = (p.category ?? "").toLowerCase();
  return cat === "systems" || cat === "shields";
}

export function aggregateShields(picks: ComponentPick[]): ShieldAggregate {
  const out: ShieldAggregate = {
    totalCapacity: 0,
    totalRegen: 0,
    timeToFullRecharge: 0,
    damagedDelay: 0,
    downedDelay: 0,
    resistance: { physical: 0, energy: 0, distortion: 0 },
    effectiveHp: { physical: 0, energy: 0, distortion: 0 },
  };
  for (const p of picks) {
    if (!isShield(p) || !p.raw) continue;
    const s = shieldStats(p.raw);
    if (s.hp <= 0 && s.regen <= 0) continue;
    out.totalCapacity += s.hp;
    out.totalRegen += s.regen;
    out.damagedDelay = Math.max(out.damagedDelay, s.damagedDelay);
    out.downedDelay = Math.max(out.downedDelay, s.downedDelay);
    out.resistance.physical = Math.max(out.resistance.physical, clamp01(s.resistPhysical));
    out.resistance.energy = Math.max(out.resistance.energy, clamp01(s.resistEnergy));
    out.resistance.distortion = Math.max(out.resistance.distortion, clamp01(s.resistDistortion));
  }
  out.timeToFullRecharge = out.totalRegen > 0 ? out.totalCapacity / out.totalRegen : 0;
  out.effectiveHp.physical = ehp(out.totalCapacity, out.resistance.physical);
  out.effectiveHp.energy = ehp(out.totalCapacity, out.resistance.energy);
  out.effectiveHp.distortion = ehp(out.totalCapacity, out.resistance.distortion);
  return out;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v < 0) return 0;
  if (v > 0.95) return 0.95;
  return v;
}

function ehp(hp: number, resist: number): number {
  const r = clamp01(resist);
  if (hp <= 0) return 0;
  return hp / (1 - r);
}