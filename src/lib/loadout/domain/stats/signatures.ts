/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentPick } from "../types";

function n(v: any): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export interface SignatureAggregate {
  em: number;
  ir: number;
  /** Cross section (from ship raw, unchanged by components). */
  cs: number;
  /** True when values are computed from a partial model rather than verified game formulas. */
  isModel: boolean;
}

export function componentEm(raw: any): number {
  return n(raw?.signature?.electromagnetic ?? raw?.em);
}

export function componentIr(raw: any): number {
  return n(raw?.signature?.infrared ?? raw?.ir);
}

export function shipBaseSignatures(shipRaw: any): { em: number; ir: number; cs: number } {
  const s = shipRaw?.signature ?? shipRaw?.signatures ?? {};
  return {
    em: n(s.electromagnetic ?? s.em ?? shipRaw?.em),
    ir: n(s.infrared ?? s.ir ?? shipRaw?.ir),
    cs: n(s.cross_section ?? s.cs ?? shipRaw?.cross_section),
  };
}

export function aggregateSignatures(
  picks: ComponentPick[],
  baseEm = 0,
  baseIr = 0,
  baseCs = 0,
): SignatureAggregate {
  let em = baseEm;
  let ir = baseIr;
  for (const p of picks) {
    if (!p.raw) continue;
    em += componentEm(p.raw);
    ir += componentIr(p.raw);
  }
  return { em, ir, cs: baseCs, isModel: true };
}