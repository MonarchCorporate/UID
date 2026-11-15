/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentPick, CoolingAmpel } from "../types";

function n(v: any): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function coolingRate(raw: any): number {
  return n(raw?.cooler?.cooling_rate);
}

export function heatGeneration(raw: any): number {
  // Sum of steady-state heat produced by all sub-components at max load.
  const usage = raw?.resource_network?.usage?.heat;
  if (usage) return n(usage.max ?? usage.avg);
  return n(raw?.heat?.per_second);
}

export interface CoolingAggregate {
  available: number;
  generated: number;
  reserve: number;
  usagePercent: number;
  ampel: CoolingAmpel;
}

export function coolingAmpelOf(pct: number, available: number, generated: number): CoolingAmpel {
  if (generated > available && available > 0) return "critical";
  if (pct > 90) return "critical";
  if (pct > 70) return "warn";
  return "ok";
}

export function aggregateCooling(picks: ComponentPick[]): CoolingAggregate {
  let available = 0;
  let generated = 0;
  for (const p of picks) {
    if (!p.raw) continue;
    available += coolingRate(p.raw);
    generated += heatGeneration(p.raw);
  }
  const usagePercent = available > 0 ? (generated / available) * 100 : generated > 0 ? Infinity : 0;
  return {
    available,
    generated,
    reserve: available - generated,
    usagePercent,
    ampel: coolingAmpelOf(usagePercent, available, generated),
  };
}