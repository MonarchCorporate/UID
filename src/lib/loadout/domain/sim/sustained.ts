/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Time-stepped sustained-DPS simulation.
 *
 * For each weapon we model:
 *  - Firing at RPM until the magazine (ammoCapacity) is empty.
 *  - Reload delay (reloadTime) before the next magazine.
 *  - Heat accumulation (heat per shot), passive cooling drain, and a soft
 *    overheat gate that blocks firing while temperature > overheatThreshold
 *    until it cools below cooldownResumeThreshold.
 *  - Power draw during firing. If the loadout's aggregate power reserve is
 *    negative, weapons only fire (power_efficiency = available / required)
 *    of the time — a coarse but consistent starvation model.
 *
 * The result is a per-time-slice damage series plus aggregate metrics.
 *
 * Deliberately simple: no beam charge-up curves, no per-weapon capacitors,
 * no missile logic. Extend when we have verified formulas.
 */

import type { ComponentPick } from "../types";
import { aggregateWeapons, weaponStats, isWeaponPick, type WeaponStats } from "../stats/weapons";
import { aggregatePower } from "../stats/power";
import { aggregateCooling } from "../stats/cooling";

export interface SustainedSimOptions {
  /** Total simulated duration in seconds. */
  durationSeconds?: number;
  /** Simulation step in seconds. */
  stepSeconds?: number;
  /** Fraction (0..1) of max temperature at which the gun locks out. */
  overheatThreshold?: number;
  /** Fraction (0..1) at which the gun re-enables after overheat. */
  cooldownResumeThreshold?: number;
  /** Nominal max temperature bucket per weapon (arbitrary units). */
  maxTempPerWeapon?: number;
}

export interface SustainedSample {
  /** Time bucket end, in seconds. */
  t: number;
  /** Damage dealt within the bucket ending at t. */
  damage: number;
  /** Rolling DPS (Σ damage / t). */
  dps: number;
}

export interface SustainedSimResult {
  duration: number;
  step: number;
  totalDamage: number;
  sustainedDps: number;
  peakDps: number;
  timeToFirstEmpty: number;
  powerLimited: boolean;
  powerEfficiency: number;
  samples: SustainedSample[];
  perWeapon: Array<{
    slotKey: string;
    name: string;
    totalDamage: number;
    sustainedDps: number;
    overheatEvents: number;
    reloadEvents: number;
  }>;
}

interface WeaponRuntime {
  slotKey: string;
  name: string;
  stats: WeaponStats;
  ammoRemaining: number;
  reloadUntil: number;
  temp: number;
  overheated: boolean;
  overheatEvents: number;
  reloadEvents: number;
  totalDamage: number;
  shotAccumulator: number;
}

const DEFAULTS: Required<SustainedSimOptions> = {
  durationSeconds: 60,
  stepSeconds: 0.1,
  overheatThreshold: 1.0,
  cooldownResumeThreshold: 0.5,
  maxTempPerWeapon: 100,
};

export function simulateSustained(
  picks: ComponentPick[],
  opts: SustainedSimOptions = {},
): SustainedSimResult {
  const o = { ...DEFAULTS, ...opts };
  const { durationSeconds: dur, stepSeconds: dt, overheatThreshold, cooldownResumeThreshold, maxTempPerWeapon } = o;

  // Power / cooling context (whole-loadout, not per-weapon).
  const powerAgg = aggregatePower(picks);
  const powerEfficiency = powerAgg.required > 0
    ? Math.min(1, powerAgg.available / powerAgg.required)
    : 1;
  const powerLimited = powerEfficiency < 1;

  // Cooling drain per weapon (very rough): share the ship's total cooling
  // capacity across all firing weapons.
  const coolingAgg = aggregateCooling(picks);

  const weapons: WeaponRuntime[] = [];
  for (const p of picks) {
    if (!isWeaponPick(p) || !p.raw) continue;
    const s = weaponStats(p.raw);
    if (s.shotsPerSecond <= 0 || s.alpha <= 0) continue;
    weapons.push({
      slotKey: p.slot_key,
      name: p.name ?? "Waffe",
      stats: s,
      ammoRemaining: s.ammoCapacity > 0 ? s.ammoCapacity : Infinity,
      reloadUntil: 0,
      temp: 0,
      overheated: false,
      overheatEvents: 0,
      reloadEvents: 0,
      totalDamage: 0,
      shotAccumulator: 0,
    });
  }

  const perWeaponCooling = weapons.length > 0 ? coolingAgg.available / weapons.length : 0;
  const samples: SustainedSample[] = [];
  let running = 0;
  let peakDps = 0;
  let timeToFirstEmpty = 0;

  const steps = Math.max(1, Math.round(dur / dt));
  for (let i = 1; i <= steps; i++) {
    const t = i * dt;
    let bucketDamage = 0;

    for (const w of weapons) {
      // Passive cooling first (always applies).
      const cool = perWeaponCooling * dt;
      w.temp = Math.max(0, w.temp - cool);
      if (w.overheated && w.temp / maxTempPerWeapon <= cooldownResumeThreshold) {
        w.overheated = false;
      }

      if (w.overheated) continue;
      if (t < w.reloadUntil) continue;

      // Fire — accumulator model so RPMs slower than 1/dt still work.
      const desiredShots = w.stats.shotsPerSecond * dt * powerEfficiency;
      w.shotAccumulator += desiredShots;
      let shots = Math.floor(w.shotAccumulator);
      if (shots <= 0) continue;

      // Respect ammo.
      if (Number.isFinite(w.ammoRemaining)) {
        shots = Math.min(shots, w.ammoRemaining);
      }
      if (shots <= 0) continue;
      w.shotAccumulator -= shots;

      const dmg = shots * w.stats.alpha;
      w.totalDamage += dmg;
      bucketDamage += dmg;
      w.temp += shots * w.stats.heat;
      if (Number.isFinite(w.ammoRemaining)) {
        w.ammoRemaining -= shots;
        if (w.ammoRemaining <= 0) {
          w.reloadEvents += 1;
          if (timeToFirstEmpty === 0) timeToFirstEmpty = t;
          w.reloadUntil = t + (w.stats.reloadTime > 0 ? w.stats.reloadTime : 0);
          w.ammoRemaining = w.stats.ammoCapacity;
          w.shotAccumulator = 0;
        }
      }

      if (w.temp >= overheatThreshold * maxTempPerWeapon) {
        w.overheated = true;
        w.overheatEvents += 1;
      }
    }

    running += bucketDamage;
    const bucketDps = bucketDamage / dt;
    if (bucketDps > peakDps) peakDps = bucketDps;
    samples.push({ t, damage: bucketDamage, dps: running / t });
  }

  return {
    duration: dur,
    step: dt,
    totalDamage: running,
    sustainedDps: running / dur,
    peakDps,
    timeToFirstEmpty,
    powerLimited,
    powerEfficiency,
    samples,
    perWeapon: weapons.map((w) => ({
      slotKey: w.slotKey,
      name: w.name,
      totalDamage: w.totalDamage,
      sustainedDps: w.totalDamage / dur,
      overheatEvents: w.overheatEvents,
      reloadEvents: w.reloadEvents,
    })),
  };
}

/** Quick top-line numbers without keeping the sample series around. */
export function sustainedSummary(picks: ComponentPick[], opts?: SustainedSimOptions) {
  const burst = aggregateWeapons(picks).totalBurstDps;
  const sim = simulateSustained(picks, opts);
  return {
    burstDps: burst,
    sustainedDps: sim.sustainedDps,
    peakDps: sim.peakDps,
    timeToFirstEmpty: sim.timeToFirstEmpty,
    powerLimited: sim.powerLimited,
    powerEfficiency: sim.powerEfficiency,
    perWeapon: sim.perWeapon,
  };
}