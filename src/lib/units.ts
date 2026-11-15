export type Unit = "pcs" | "scu";

/**
 * Format a quantity for display.
 * - pcs: "7 Stk."
 * - scu, value < 1: "36 cSCU" (1 SCU = 100 cSCU)
 * - scu, value >= 1: "1,16 SCU"
 */
export function formatQty(value: number, unit: Unit | string | null | undefined): string {
  const v = Number(value ?? 0);
  const u = (unit ?? "pcs") as Unit;
  if (u === "scu") {
    if (Math.abs(v) > 0 && Math.abs(v) < 1) {
      const c = Math.round(v * 100);
      return `${c.toLocaleString("de-DE")} cSCU`;
    }
    return `${v.toLocaleString("de-DE", { maximumFractionDigits: 2 })} SCU`;
  }
  // pcs: ganze Stück
  const n = Number.isInteger(v) ? v : Math.round(v * 100) / 100;
  return `${n.toLocaleString("de-DE")} Stk.`;
}

export const UNIT_LABEL: Record<Unit, string> = {
  pcs: "Stück",
  scu: "SCU",
};