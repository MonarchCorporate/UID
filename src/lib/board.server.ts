import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function randomCode(len = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyBoardMember(sessionId: string, token: string) {
  const { data, error } = await supabaseAdmin
    .from("board_members")
    .select("id, session_id, user_id, display_name, is_commander")
    .eq("session_id", sessionId)
    .eq("token", token)
    .maybeSingle();
  if (error || !data) throw new Error("Nicht autorisiert für diesen Boardcomputer");
  return data;
}

type HardpointEntry = {
  group?: string;
  category?: string;
  name?: string;
  details?: string;
  source?: string;
  minSize?: number;
  maxSize?: number;
};

export type SeedStation = {
  slot_key: string;
  label: string;
  hardpoint_name: string | null;
  category: string;
  sort_order: number;
};

export type ShipMeta = {
  sourceOk: boolean;
  mannedTurretCount: number;
  turretSizes: string[];
  positions: string[];
  positionsPaired: boolean;
};

export type SeedResult = { stations: SeedStation[]; meta: ShipMeta };

/**
 * Resolve the seed stations for a (commander, ship) pair, with priority:
 *   1. User-template (scope='user', user_id=commander)
 *   2. Admin-template (scope='admin')
 *   3. Fleetyards auto-seed
 * Returns the seed list plus ship meta from Fleetyards (always fetched for
 * UI hints; cheap and cached upstream).
 */
export async function resolveSeedForCommander(
  commanderId: string,
  shipSlug: string | null,
): Promise<SeedResult> {
  if (shipSlug) {
    // 1. User template
    const { data: userTpl } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id")
      .eq("scope", "user")
      .eq("user_id", commanderId)
      .eq("ship_slug", shipSlug)
      .maybeSingle();
    if (userTpl) {
      const rows = await loadTemplateStations(userTpl.id);
      if (rows.length > 0) {
        const meta = await fetchShipMeta(shipSlug);
        return { stations: rows, meta };
      }
    }
    // 2. Admin template
    const { data: adminTpl } = await supabaseAdmin
      .from("ship_loadout_templates")
      .select("id")
      .eq("scope", "admin")
      .is("user_id", null)
      .eq("ship_slug", shipSlug)
      .maybeSingle();
    if (adminTpl) {
      const rows = await loadTemplateStations(adminTpl.id);
      if (rows.length > 0) {
        const meta = await fetchShipMeta(shipSlug);
        return { stations: rows, meta };
      }
    }
  }
  // 3. Fleetyards auto-seed
  return buildSeedStations(shipSlug);
}

async function loadTemplateStations(templateId: string): Promise<SeedStation[]> {
  const { data } = await supabaseAdmin
    .from("ship_loadout_stations")
    .select("slot_key, label, hardpoint_name, category, sort_order")
    .eq("template_id", templateId)
    .order("sort_order");
  return (data ?? []).map((r, i) => ({
    slot_key: r.slot_key,
    label: r.label,
    hardpoint_name: r.hardpoint_name,
    category: r.category ?? "seat",
    sort_order: r.sort_order ?? i,
  }));
}

async function fetchShipMeta(shipSlug: string): Promise<ShipMeta> {
  try {
    const r = await buildSeedStations(shipSlug);
    return r.meta;
  } catch {
    return emptyMeta(false);
  }
}

// Map game-file hardpoint name tokens to German positional words.
const POSITION_TOKENS: Record<string, string> = {
  top: "oben",
  upper: "oben",
  bottom: "unten",
  lower: "unten",
  left: "links",
  right: "rechts",
  front: "vorn",
  rear: "hinten",
  back: "hinten",
  nose: "Bug",
  tail: "Heck",
  dorsal: "Rücken",
  ventral: "Bauch",
  base: "Basis",
  arm: "Ausleger",
  body: "Rumpf",
  port: "backbord",
  starboard: "steuerbord",
  center: "Mitte",
  centre: "Mitte",
  middle: "Mitte",
  main: "Haupt",
};

// Only reject by NAME when it clearly says "automated"/"auto"/"unmanned".
// We do NOT reject by "remote" here, because Fleetyards sometimes marks a
// "Remote Missile Turret" entry as `details: "Manned"` (e.g. Polaris) — that
// IS a player-operated station, just remotely controlled from inside the ship.
const NAME_AUTO_RE = /\b(automated|automatic|unmanned)\b|\bauto(?![a-z])/i;

// Seats whose NAME marks them as a turret/gunner/torpedo operator station.
// These are duplicates of ship_matrix manned-turret entries and must be skipped
// to avoid listing the same physical crew slot twice (e.g. Polaris
// `hardpoint_seat_turretseatleft` + "S4 Manned Turret", Redeemer
// `hardpoint_turret_remote_front_seat` + "S4 Manned Turret").
const SEAT_IS_TURRET_OP_RE = /(turret|gunner|torpedo|missile)/i;

function humanizePosition(raw: string): { slug: string; label: string } {
  // Strip prefix like "hardpoint_turret_" or "hardpoint_seat_" so only the positional tail remains.
  const cleaned = raw
    .replace(/^hardpoint[_-]?/i, "")
    .replace(/^(turret|seat|gun|weapon|missilerack|missile|gunner)[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!cleaned) return { slug: "", label: "" };
  const parts = cleaned.split(/\s+/);
  const labelParts: string[] = [];
  for (const p of parts) {
    const lp = p.toLowerCase();
    labelParts.push(POSITION_TOKENS[lp] ?? p.charAt(0).toUpperCase() + p.slice(1));
  }
  return { slug: parts.map((p) => p.toLowerCase()).join("_"), label: labelParts.join(" ") };
}

function seatLabel(raw: string): { key: string; label: string } {
  const name = raw.toLowerCase();
  if (name.includes("engineer")) {
    const pos = humanizePosition(raw.replace(/engineer(ing)?(screen|console)?/gi, ""));
    return {
      key: pos.slug ? `engineer_${pos.slug}` : "engineer",
      label: pos.label ? `Engineer (${pos.label})` : "Engineer",
    };
  }
  if (name.includes("captain")) {
    const pos = humanizePosition(raw.replace(/captains?/gi, ""));
    return {
      key: pos.slug ? `captain_${pos.slug}` : "captain",
      label: pos.label ? `Captain (${pos.label})` : "Captain",
    };
  }
  if (name.includes("torpedo")) return { key: "torpedo", label: "Torpedo-Operator" };
  if (name.includes("turretseatleft") || /turret.*seat.*left/.test(name))
    return { key: "turretseat_left", label: "Turret-Sitz (links)" };
  if (name.includes("turretseatright") || /turret.*seat.*right/.test(name))
    return { key: "turretseat_right", label: "Turret-Sitz (rechts)" };
  if (name.includes("pilot") && !name.includes("copilot") && !name.includes("co_pilot")) {
    return { key: "pilot", label: "Pilot" };
  }
  if (name.includes("copilot") || name.includes("co_pilot")) {
    const pos = humanizePosition(raw.replace(/copilot|co_pilot/gi, ""));
    return {
      key: pos.slug ? `copilot_${pos.slug}` : "copilot",
      label: pos.label ? `Co-Pilot (${pos.label})` : "Co-Pilot",
    };
  }
  if (name.includes("gunner")) {
    const pos = humanizePosition(raw);
    return {
      key: pos.slug ? `gunner_${pos.slug}` : "gunner",
      label: pos.label ? `Gunner (${pos.label})` : "Gunner",
    };
  }
  if (name.includes("commander")) return { key: "commander", label: "Commander" };
  if (name.includes("operator") || name.includes("scanner")) {
    return { key: "operator", label: "Operator" };
  }
  const pos = humanizePosition(raw);
  return {
    key: pos.slug ? `seat_${pos.slug}` : "seat",
    label: pos.label || "Sitz",
  };
}

function turretSize(h: HardpointEntry): string | null {
  const m = /\bS(\d+)\b/i.exec(h.name ?? "");
  if (m) return `S${m[1]}`;
  if (h.maxSize) return `S${h.maxSize}`;
  return null;
}

function turretLabelBase(h: HardpointEntry): string {
  const size = turretSize(h);
  if (/remote\s*missile/i.test(h.name ?? "")) {
    return size ? `${size} Remote Missile Turret` : "Remote Missile Turret";
  }
  if (/missile/i.test(h.name ?? "")) {
    return size ? `${size} Missile Turret` : "Missile Turret";
  }
  return size ? `${size} Manned Turret` : "Manned Turret";
}

function isPositionalTurretName(name: string | undefined): boolean {
  if (!name) return false;
  // Real positional hardpoints from game files we want to keep.
  // Excludes hardpoint_pdc_*, hardpoint_pds_*, hardpoint_turret_remote_*, etc.
  if (/remote/i.test(name)) return false;
  if (/\b(pdc|pds)\b/i.test(name)) return false;
  // Accept both `hardpoint_turret_*` and bare `turret_*` (e.g. Hammerhead).
  return (
    /^hardpoint_turret_/i.test(name) ||
    /^hardpoint_copilot_turret_/i.test(name) ||
    /^turret_/i.test(name)
  );
}

export async function buildSeedStations(shipSlug: string | null): Promise<SeedResult> {
  if (!shipSlug) return { stations: defaultStations(), meta: emptyMeta(false) };
  try {
    const res = await fetch(`https://api.fleetyards.net/v1/models/${shipSlug}/hardpoints`, {
      headers: { accept: "application/json" },
      redirect: "follow",
    });
    if (!res.ok) return { stations: defaultStations(), meta: emptyMeta(false) };
    const data = (await res.json()) as HardpointEntry[];
    if (!Array.isArray(data)) return { stations: defaultStations(), meta: emptyMeta(false) };

    const stations: SeedStation[] = [];
    let order = 0;
    const slotCount = new Map<string, number>();
    const addStation = (s: Omit<SeedStation, "sort_order">) => {
      const n = (slotCount.get(s.slot_key) ?? 0) + 1;
      slotCount.set(s.slot_key, n);
      const slot_key = n === 1 ? s.slot_key : `${s.slot_key}_${n}`;
      stations.push({ ...s, slot_key, sort_order: order++ });
    };

    // ---------- Seats (game_files: positional names) ----------
    for (const h of data) {
      if (h.group !== "seat") continue;
      const raw = (h.name ?? "").toString();
      if (!raw) continue;
      // Skip turret-operator seats — ship_matrix turret entries already
      // represent these crew slots; listing both would double the slot.
      if (SEAT_IS_TURRET_OP_RE.test(raw)) continue;
      const { key, label } = seatLabel(raw);
      addStation({ slot_key: key, label, hardpoint_name: raw, category: "seat" });
    }

    // ---------- Turrets ----------
    // Authoritative count from ship_matrix turret entries that are NOT
    // automated. Some ships (e.g. Hammerhead) leave `details` empty while
    // every turret is manned, so we don't require "Manned"/"Remote" there —
    // we only reject entries clearly marked automated by name or details.
    const mannedMatrix = data.filter(
      (h) =>
        h.source === "ship_matrix" &&
        h.group === "weapon" &&
        h.category === "turret" &&
        !NAME_AUTO_RE.test(h.name ?? "") &&
        !NAME_AUTO_RE.test(h.details ?? "") &&
        !/\b(pds|pdc)\b/i.test(h.name ?? "") &&
        !/\b(pds|pdc)\b/i.test(h.details ?? ""),
    );

    // Positional turret hardpoints from game files (skip PDC/PDS/Auto/Remote).
    const positionalTurrets = data.filter(
      (h) =>
        h.group === "weapon" &&
        h.category === "turret" &&
        isPositionalTurretName(h.name) &&
        !NAME_AUTO_RE.test(h.name ?? ""),
    );

    // Decide if positional names can be safely paired to manned-matrix entries.
    // Only when counts match AND each manned slot has a distinct size (so we
    // can't make up false position info for sister turrets like 4×S4).
    const matrixSizes = mannedMatrix.map(turretSize);
    const allDistinctSizes = new Set(matrixSizes).size === matrixSizes.length;
    const positionsPaired =
      mannedMatrix.length > 0 &&
      positionalTurrets.length === mannedMatrix.length &&
      allDistinctSizes;

    if (mannedMatrix.length > 0) {
      // Stable secondary sort: largest size first so the main gun shows on top.
      const ordered = [...mannedMatrix].sort((a, b) => {
        const sa = parseInt((turretSize(a) ?? "S0").slice(1), 10) || 0;
        const sb = parseInt((turretSize(b) ?? "S0").slice(1), 10) || 0;
        return sb - sa;
      });
      ordered.forEach((h, idx) => {
        const base = turretLabelBase(h);
        const pos = positionsPaired
          ? humanizePosition(positionalTurrets[idx].name ?? "")
          : null;
        const label = pos && pos.label ? `${base} · ${pos.label}` : `${base} ${idx + 1}`;
        const slot = pos && pos.slug ? `turret_${pos.slug}` : `turret_${idx + 1}`;
        addStation({
          slot_key: slot,
          label,
          hardpoint_name: positionsPaired ? positionalTurrets[idx].name ?? null : h.name ?? null,
          category: "turret",
        });
      });
    } else if (positionalTurrets.length > 0) {
      // No ship_matrix manned info — trust positional names.
      positionalTurrets.forEach((h, idx) => {
        const pos = humanizePosition(h.name ?? "");
        addStation({
          slot_key: pos.slug ? `turret_${pos.slug}` : `turret_${idx + 1}`,
          label: pos.label ? `Turret · ${pos.label}` : `Turret ${idx + 1}`,
          hardpoint_name: h.name ?? null,
          category: "turret",
        });
      });
    }

    const meta: ShipMeta = {
      sourceOk: true,
      mannedTurretCount: mannedMatrix.length,
      turretSizes: matrixSizes.filter((s): s is string => !!s),
      positions: positionalTurrets
        .map((h) => humanizePosition(h.name ?? "").label)
        .filter((s) => !!s),
      positionsPaired,
    };

    if (stations.length === 0) {
      return { stations: defaultStations(), meta };
    }
    return { stations, meta };
  } catch {
    return { stations: defaultStations(), meta: emptyMeta(false) };
  }
}

function defaultStations(): SeedStation[] {
  return [
    { slot_key: "pilot", label: "Pilot", hardpoint_name: null, category: "seat", sort_order: 0 },
  ];
}

function emptyMeta(sourceOk: boolean): ShipMeta {
  return {
    sourceOk,
    mannedTurretCount: 0,
    turretSizes: [],
    positions: [],
    positionsPaired: false,
  };
}