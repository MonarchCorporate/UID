// Maps Game.log location codes to the UID inventory location presets
// (src/data/sc-locations.ts), so stations the companion detects end up in the
// same inventory location players pick by hand (preset_key, source 'preset').
import { SC_LOCATIONS, type SCLocationPreset } from "@/data/sc-locations";
import { placeName } from "./names";

const DIRECT: Record<string, string> = {
  Stanton1_Lorville: "stanton:lorville",
  Stanton2_Orison: "stanton:orison",
  Stanton3_Area18: "stanton:area18",
  Stanton4_NewBabbage: "stanton:new-babbage",
  RR_HUR_LEO: "stanton:everus-harbor",
  RR_CRU_LEO: "stanton:seraphim-station",
  RR_ARC_LEO: "stanton:baijini-point",
  RR_MIC_LEO: "stanton:port-tressler",
  GrimHEX: "stanton:grim-hex",
  GrimHex: "stanton:grim-hex",
  Nyx_Levski: "nyx:levski",
  AsteroidClusterBase_Nyx_Social_Keeger_001: "nyx:pss-alpha",
  RR_JP_StantonPyro: "stanton:pyro-gateway",
  RR_JP_StantonMagnus: "stanton:magnus-gateway",
  RR_JP_StantonTerra: "stanton:terra-gateway",
  // presets whose label differs from the game's name (checked against global.ini 4.10)
  Stanton1_DistributionCenter_Greycat_01: "stanton:dc-greycat",
  Stanton3a_Shubin_001: "stanton:shubin-sal2",
  Stanton3a_Shubin_002: "stanton:shubin-sal5",
  Stanton4a_Shubin_001: "stanton:shubin-sm-c6",
  Stanton4a_Shubin_002: "stanton:shubin-sm-c8",
  Stanton2c_Rayari_001: "stanton:deakins-research",
  Stanton2a_Rayari_001: "stanton:hickes-research",
  Stanton4a_Rayari_001: "stanton:rayari-kaltag",
  Stanton4a_Rayari_002: "stanton:rayari-anvik",
  Stanton4b_Rayari_001: "stanton:rayari-mcgrath",
  Stanton4b_Rayari_002: "stanton:rayari-cantwell",
  Stanton4_Rayari_001: "stanton:rayari-deltana",
};

const norm = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/g, "");

/** Preset for a game location code, or null when there is no matching preset. */
export function presetForCode(code: string): SCLocationPreset | null {
  const direct = DIRECT[code];
  if (direct) return SC_LOCATIONS.find((p) => p.key === direct) ?? null;
  const rr = /^RR_(ARC|CRU|HUR|MIC)_L(\d)$/.exec(code);
  if (rr) return SC_LOCATIONS.find((p) => p.key === `stanton:${rr[1].toLowerCase()}-l${rr[2]}`) ?? null;
  // fall back to the readable name: "Shubin Mining SAL5 (Aberdeen)" ~ "Shubin Mining SAL-5 (Lyria)" etc.
  const want = norm(placeName(code));
  if (want.length < 4) return null;
  return SC_LOCATIONS.find((p) => p.system !== "Sonstige" && norm(p.name) === want) ?? null;
}

export const BODY_PRESET = SC_LOCATIONS.find((p) => p.key === "sonstige:im-rucksack") ?? null;

/** inventory_locations key + display name for a companion container. */
export function locationKey(type: string, name: string): { key: string; label: string; source: string } {
  if (type === "location") {
    const p = presetForCode(name);
    if (p) return { key: p.key, label: p.name, source: "preset" };
    return { key: `sc:location:${name}`.slice(0, 255), label: placeName(name) || name, source: "companion" };
  }
  if (type === "body" && BODY_PRESET) return { key: BODY_PRESET.key, label: BODY_PRESET.name, source: "preset" };
  return { key: `sc:${type}:${name}`.slice(0, 255), label: name, source: "companion" };
}
