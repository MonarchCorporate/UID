/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentPick, PowerAmpel } from "../types";

function n(v: any): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function powerGeneration(raw: any): number {
  const states = raw?.resource_network?.states ?? [];
  for (const st of states) {
    for (const d of st.deltas ?? []) {
      if (d.type === "Generation" && d.resource === "Power") return n(d.rate);
    }
  }
  return 0;
}

export function powerDraw(raw: any): number {
  const usage = raw?.resource_network?.usage?.power;
  return n(usage?.max ?? usage?.avg);
}

export interface PowerAggregate {
  available: number;
  required: number;
  reserve: number;
  usagePercent: number;
  ampel: PowerAmpel;
}

export function powerAmpel(pct: number, available: number, required: number): PowerAmpel {
  if (required > available && available > 0) return "critical";
  if (pct > 95) return "critical";
  if (pct > 75) return "high";
  if (pct > 60) return "warn";
  return "ok";
}

export function aggregatePower(picks: ComponentPick[]): PowerAggregate {
  let available = 0;
  let required = 0;
  for (const p of picks) {
    if (!p.raw) continue;
    available += powerGeneration(p.raw);
    required += powerDraw(p.raw);
  }
  const usagePercent = available > 0 ? (required / available) * 100 : required > 0 ? Infinity : 0;
  return {
    available,
    required,
    reserve: available - required,
    usagePercent,
    ampel: powerAmpel(usagePercent, available, required),
  };
}