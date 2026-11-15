/**
 * Domain types for the loadout editor.
 *
 * All calculation and compatibility modules under `src/lib/loadout/domain`
 * consume these plain-data shapes. React components must not import raw
 * catalog JSON directly; they read via these types + the exported helpers.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

export type DamageType = "physical" | "energy" | "distortion" | "thermal";

export type RawJson = Record<string, unknown> | null | undefined;

export interface ComponentPick {
  slot_key: string;
  item_ref: string | null;
  name: string | null;
  category: string | null;
  size: number | null;
  raw?: any;
}

export interface Hardpoint {
  id?: string;
  name: string;
  category: string; // weapons | missiles | systems | propulsion | ...
  allowedTypes?: string[] | null;
  minSize?: number | null;
  maxSize?: number | null;
  requiredTags?: string[] | null;
  excludedTags?: string[] | null;
  editable?: boolean;
  required?: boolean;
  kind?: "weapon" | "rack" | "ammo" | "system" | "propulsion" | null;
}

export interface CatalogComponent {
  item_ref: string;
  name: string;
  category: string | null;
  size: number | null;
  classification_label?: string | null;
  manufacturer_name?: string | null;
  grade?: string | null;
  version?: string | null;
  raw?: any;
}

export interface ShipInfo {
  slug: string;
  name: string;
  size?: string | null;
  restrictedTags?: string[] | null;
}

export type PowerAmpel = "ok" | "warn" | "high" | "critical";
export type CoolingAmpel = "ok" | "warn" | "critical";