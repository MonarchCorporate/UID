/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentPick } from "../types";

function n(v: any): number {
  const x = typeof v === "number" ? v : Number(v);
  return Number.isFinite(x) ? x : 0;
}

export interface QuantumStats {
  quantumSpeed: number;
  stage1Accel: number;
  stage2Accel: number;
  fuelPerKm: number;
  maxRange: number;
  calibrationTime: number;
  spoolTime: number;
}

export function quantumStats(raw: any): QuantumStats {
  const q = raw?.quantum_drive ?? {};
  const speed = n(q.speed ?? q.quantum_speed);
  return {
    quantumSpeed: speed,
    stage1Accel: n(q.stage_1_accel ?? q.acceleration_stage1),
    stage2Accel: n(q.stage_2_accel ?? q.acceleration_stage2),
    fuelPerKm: n(q.fuel_requirement ?? q.fuel_per_km),
    maxRange: n(q.max_range),
    calibrationTime: n(q.calibration_time),
    spoolTime: n(q.spool_time),
  };
}

export interface QuantumTrip {
  distanceKm: number;
  calibration: number;
  spool: number;
  accelPhase: number;
  cruisePhase: number;
  decelPhase: number;
  totalTime: number;
  fuelUsed: number;
  fuelLeft: number | null;
}

/**
 * Two-stage acceleration model. When accel data is missing we fall back to a
 * simple `distance / speed` cruise-only estimate.
 */
export function simulateQuantumTrip(q: QuantumStats, distanceKm: number, fuelAvailable?: number): QuantumTrip {
  const empty: QuantumTrip = {
    distanceKm,
    calibration: q.calibrationTime,
    spool: q.spoolTime,
    accelPhase: 0,
    cruisePhase: 0,
    decelPhase: 0,
    totalTime: 0,
    fuelUsed: 0,
    fuelLeft: fuelAvailable ?? null,
  };
  if (q.quantumSpeed <= 0 || distanceKm <= 0) return empty;
  const distM = distanceKm * 1000;
  const accel = q.stage2Accel > 0 ? q.stage2Accel : q.stage1Accel;
  let accelTime = 0;
  let accelDist = 0;
  if (accel > 0) {
    accelTime = q.quantumSpeed / accel;
    accelDist = 0.5 * accel * accelTime * accelTime;
  }
  const cruiseDist = Math.max(0, distM - 2 * accelDist);
  const cruiseTime = cruiseDist / q.quantumSpeed;
  const fuelUsed = q.fuelPerKm * distanceKm;
  return {
    distanceKm,
    calibration: q.calibrationTime,
    spool: q.spoolTime,
    accelPhase: accelTime,
    cruisePhase: cruiseTime,
    decelPhase: accelTime,
    totalTime: q.calibrationTime + q.spoolTime + accelTime + cruiseTime + accelTime,
    fuelUsed,
    fuelLeft: fuelAvailable != null ? fuelAvailable - fuelUsed : null,
  };
}

export function aggregateQuantum(picks: ComponentPick[]): QuantumStats | null {
  for (const p of picks) {
    if (!p.raw) continue;
    const q = quantumStats(p.raw);
    if (q.quantumSpeed > 0) return q;
  }
  return null;
}