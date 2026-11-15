/**
 * Flight modes + power-triangle model.
 *
 * A "mode" is a preset assignment of pips (0..2) across the three power
 * consumers (weapons, shields, engines). Each pip translates into a
 * multiplier applied by the aggregate helpers that accept a
 * `ModeContext`. The math is deliberately simple:
 *
 *   pips 0 → 0.6 ×
 *   pips 1 → 1.0 × (nominal)
 *   pips 2 → 1.4 ×
 *
 * That's the same shape Erkul uses for its coarse pip preview and keeps
 * the model stable until we have verified in-game formulas.
 */

export type FlightModeKind = "scm" | "nav" | "stealth" | "custom";

export interface PowerTriangle {
  weapons: 0 | 1 | 2;
  shields: 0 | 1 | 2;
  engines: 0 | 1 | 2;
}

export interface FlightMode {
  kind: FlightModeKind;
  label: string;
  triangle: PowerTriangle;
  /** Adds to signature (higher = louder). */
  emMultiplier: number;
  irMultiplier: number;
}

export const FLIGHT_MODES: Record<Exclude<FlightModeKind, "custom">, FlightMode> = {
  scm: {
    kind: "scm",
    label: "Combat (SCM)",
    triangle: { weapons: 2, shields: 2, engines: 1 },
    emMultiplier: 1.2,
    irMultiplier: 1.1,
  },
  nav: {
    kind: "nav",
    label: "Navigation",
    triangle: { weapons: 0, shields: 1, engines: 2 },
    emMultiplier: 0.8,
    irMultiplier: 1.15,
  },
  stealth: {
    kind: "stealth",
    label: "Stealth",
    triangle: { weapons: 0, shields: 0, engines: 1 },
    emMultiplier: 0.5,
    irMultiplier: 0.7,
  },
};

export function customMode(triangle: PowerTriangle): FlightMode {
  return {
    kind: "custom",
    label: "Custom",
    triangle,
    emMultiplier: 1,
    irMultiplier: 1,
  };
}

export function pipMultiplier(p: 0 | 1 | 2): number {
  return p === 0 ? 0.6 : p === 1 ? 1.0 : 1.4;
}

export interface ModeContext {
  mode: FlightMode;
}

export const DEFAULT_MODE: FlightMode = FLIGHT_MODES.scm;