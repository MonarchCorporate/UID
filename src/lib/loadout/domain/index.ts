/**
 * Domain barrel for loadout stats + compatibility.
 *
 * React components import from here (or from the shim `@/lib/loadout-calc`).
 * Never let a component reach into `raw` catalog JSON directly.
 */
import type { ComponentPick, DamageType } from "./types";
import { aggregateWeapons, aggregateMissiles, type WeaponsAggregate, type MissilesAggregate } from "./stats/weapons";
import { aggregateShields, type ShieldAggregate } from "./stats/shields";
import { aggregatePower, type PowerAggregate } from "./stats/power";
import { aggregateCooling, type CoolingAggregate } from "./stats/cooling";
import { aggregateSignatures, shipBaseSignatures, type SignatureAggregate } from "./stats/signatures";
import { aggregateQuantum, type QuantumStats } from "./stats/quantum";
import { DEFAULT_MODE, pipMultiplier, type FlightMode } from "./modes";

export * from "./types";
export * from "./compatibility";
export * from "./stats/weapons";
export * from "./stats/shields";
export * from "./stats/power";
export * from "./stats/cooling";
export * from "./stats/signatures";
export * from "./stats/quantum";
export * from "./stats/costs";
export * from "./sim/sustained";
export * from "./modes";

export interface LoadoutSummary {
  weapons: WeaponsAggregate;
  missiles: MissilesAggregate;
  shields: ShieldAggregate;
  power: PowerAggregate;
  cooling: CoolingAggregate;
  signatures: SignatureAggregate;
  quantum: QuantumStats | null;
  mode: FlightMode;
}

export function summarizeLoadout(
  picks: ComponentPick[],
  opts: { mode?: FlightMode; shipRaw?: unknown } = {},
): LoadoutSummary {
  const mode = opts.mode ?? DEFAULT_MODE;
  const wMul = pipMultiplier(mode.triangle.weapons);
  const sMul = pipMultiplier(mode.triangle.shields);

  const weapons = aggregateWeapons(picks);
  const shields = aggregateShields(picks);
  const base = opts.shipRaw ? shipBaseSignatures(opts.shipRaw) : { em: 0, ir: 0, cs: 0 };
  const sig = aggregateSignatures(picks, base.em, base.ir, base.cs);

  // Apply pip multipliers as a post-aggregation adjustment so per-weapon
  // detail stays inspectable in `weapons.perWeapon`.
  const scaledWeapons: WeaponsAggregate = {
    ...weapons,
    totalAlpha: weapons.totalAlpha * wMul,
    totalBurstDps: weapons.totalBurstDps * wMul,
    alphaByType: scaleRecord(weapons.alphaByType, wMul),
    burstDpsByType: scaleRecord(weapons.burstDpsByType, wMul),
  };
  const scaledShields: ShieldAggregate = {
    ...shields,
    totalCapacity: shields.totalCapacity * sMul,
    totalRegen: shields.totalRegen * sMul,
    timeToFullRecharge: shields.totalRegen > 0
      ? (shields.totalCapacity * sMul) / (shields.totalRegen * sMul)
      : 0,
    effectiveHp: {
      physical: shields.effectiveHp.physical * sMul,
      energy: shields.effectiveHp.energy * sMul,
      distortion: shields.effectiveHp.distortion * sMul,
    },
  };

  return {
    weapons: scaledWeapons,
    missiles: aggregateMissiles(picks),
    shields: scaledShields,
    power: aggregatePower(picks),
    cooling: aggregateCooling(picks),
    signatures: {
      ...sig,
      em: sig.em * mode.emMultiplier,
      ir: sig.ir * mode.irMultiplier,
    },
    quantum: aggregateQuantum(picks),
    mode,
  };
}

function scaleRecord<K extends string>(
  rec: Record<K, number>,
  m: number,
): Record<K, number> {
  const out = { ...rec };
  (Object.keys(out) as K[]).forEach((k) => (out[k] = out[k] * m));
  return out;
}

export type { DamageType };