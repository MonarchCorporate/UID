import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type MissionBlueprintRef = {
  id: string;
  name: string;
  source: "wiki" | "manual";
};

export type MissionSummary = {
  mission_uuid: string;
  title: string;
  giver: string | null;
  faction: string | null;
  reward_min: number | null;
  reward_max: number | null;
  reward_scope: string | null;
  min_standing_name: string | null;
  min_reputation: number | null;
  max_standing_name: string | null;
  max_reputation: number | null;
  legality_label: string | null;
  star_systems: string[] | null;
  web_url: string | null;
  blueprint_count: number;
};

export type MissionDetail = MissionSummary & {
  blueprints: MissionBlueprintRef[];
  description: string | null;
  mission_type: string | null;
  rank_index: number | null;
  time_to_complete_minutes: number | null;
  reputation_amount: number | null;
  availability_locations: Array<{
    name: string;
    system: string | null;
    type: string | null;
    web_url: string | null;
  }>;
  reward_items: Array<{ name: string; quantity: number | null }>;
};

type Row = {
  blueprint_id: string;
  mission_uuid: string;
  mission_title: string;
  mission_giver: string | null;
  faction: string | null;
  reward_min: number | null;
  reward_max: number | null;
  reward_scope: string | null;
  min_standing_name: string | null;
  min_reputation: number | null;
  max_standing_name: string | null;
  max_reputation: number | null;
  legality_label: string | null;
  star_systems: string[] | null;
  web_url: string | null;
};

const SELECT_COLS =
  "blueprint_id, mission_uuid, mission_title, mission_giver, faction, reward_min, reward_max, reward_scope, min_standing_name, min_reputation, max_standing_name, max_reputation, legality_label, star_systems, web_url";

/**
 * Some wiki missions ship with raw localization keys instead of a real title,
 * e.g. "[Contractor|RecoverItemTitle]". Convert those to a readable label.
 */
export function humanizeMissionTitle(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return "—";
  const m = s.match(/^\[([^|\]]+)\|([^\]]+)\]$/);
  if (!m) return s;
  const key = m[2].replace(/(Title|Name)$/i, "");
  const spaced = key
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim();
  return spaced || s;
}

async function pageAllMissionRows(
  supabaseAdmin: typeof import("@/integrations/supabase/client.server")["supabaseAdmin"],
  filter?: { mission_uuid?: string },
): Promise<Row[]> {
  const rows: Row[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    let req = supabaseAdmin
      .from("blueprint_missions")
      .select(SELECT_COLS)
      .range(from, from + pageSize - 1);
    if (filter?.mission_uuid) req = req.eq("mission_uuid", filter.mission_uuid);
    const { data, error } = await req;
    if (error) throw new Error(`blueprint_missions: ${error.message}`);
    rows.push(...((data ?? []) as Row[]));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

function toSummary(rows: Row[]): MissionSummary {
  const r = rows[0];
  return {
    mission_uuid: r.mission_uuid,
    title: humanizeMissionTitle(r.mission_title),
    giver: r.mission_giver,
    faction: r.faction,
    reward_min: r.reward_min,
    reward_max: r.reward_max,
    reward_scope: r.reward_scope,
    min_standing_name: r.min_standing_name,
    min_reputation: r.min_reputation,
    max_standing_name: r.max_standing_name,
    max_reputation: r.max_reputation,
    legality_label: r.legality_label,
    star_systems: r.star_systems,
    web_url: r.web_url,
    blueprint_count: rows.length,
  };
}

export const listMissionsCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const rows = await pageAllMissionRows(supabaseAdmin);
    const byMission = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = byMission.get(r.mission_uuid) ?? [];
      arr.push(r);
      byMission.set(r.mission_uuid, arr);
    }
    const missions: MissionSummary[] = Array.from(byMission.values())
      .map(toSummary)
      .sort((a, b) => a.title.localeCompare(b.title, "de"));
    return { missions };
  });

export const getMissionDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ mission_uuid: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import(
      "@/integrations/supabase/client.server"
    );
    const rows = await pageAllMissionRows(supabaseAdmin, {
      mission_uuid: data.mission_uuid,
    });
    if (rows.length === 0) {
      return { mission: null as MissionDetail | null };
    }
    const bpIds = Array.from(new Set(rows.map((r) => r.blueprint_id)));
    const { data: bps, error: bpErr } = await supabaseAdmin
      .from("blueprints")
      .select("id, item_name, source")
      .in("id", bpIds);
    if (bpErr) throw new Error(bpErr.message);
    const blueprints: MissionBlueprintRef[] = (bps ?? [])
      .map((b) => ({
        id: b.id as string,
        name: (b.item_name as string) ?? "—",
        source: ((b.source as string) ?? "manual") as "wiki" | "manual",
      }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const mission: MissionDetail = {
      ...toSummary(rows),
      blueprints,
      description: null,
      mission_type: null,
      rank_index: null,
      time_to_complete_minutes: null,
      reputation_amount: null,
      availability_locations: [],
      reward_items: [],
    };

    // Enrich from Star Citizen Wiki API (best-effort, optional)
    try {
      const res = await fetch(
        `https://api.star-citizen.wiki/api/missions/${encodeURIComponent(data.mission_uuid)}`,
        {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(8000),
        },
      );
      if (res.ok) {
        const json = (await res.json()) as { data?: Record<string, unknown> };
        const d = json.data ?? {};
        const rawDesc = (d.description as string | null) ?? null;
        const isPlaceholder = (s: string | null) =>
          !!s && /^\[[^|\]]+\|[^\]]+\]$/.test(s.trim());
        let desc = rawDesc;
        if (isPlaceholder(desc)) {
          const variants = d.description_variants as
            | string[]
            | null
            | undefined;
          if (Array.isArray(variants) && variants.length > 0) {
            // strip HTML tags and decode a couple of common entities
            desc = variants[0]
              .replace(/<[^>]+>/g, "")
              .replace(/&#039;/g, "'")
              .replace(/&amp;/g, "&")
              .replace(/&quot;/g, '"')
              .replace(/&nbsp;/g, " ")
              .trim();
          }
        }
        mission.description = desc;
        // Also override the title if the DB only has a localization placeholder
        const rawTitle = (d.title as string | null) ?? null;
        if (isPlaceholder(mission.title) && rawTitle && !isPlaceholder(rawTitle)) {
          mission.title = rawTitle;
        }
        mission.mission_type = (d.mission_type as string | null) ?? null;
        mission.rank_index =
          typeof d.rank_index === "number" ? d.rank_index : null;
        mission.time_to_complete_minutes =
          typeof d.time_to_complete_minutes === "number"
            ? d.time_to_complete_minutes
            : null;
        mission.reputation_amount =
          typeof d.reputation_amount === "number"
            ? d.reputation_amount
            : null;
        // Backfill fields that may be missing in the DB
        const facName =
          (d.faction as { name?: string } | null | undefined)?.name ?? null;
        if (!mission.faction && facName) mission.faction = facName;
        const minSt = d.min_standing as
          | { name?: string | null; min_reputation?: number | null }
          | null
          | undefined;
        if (!mission.min_standing_name && minSt?.name) {
          mission.min_standing_name = minSt.name;
          mission.min_reputation =
            typeof minSt.min_reputation === "number"
              ? minSt.min_reputation
              : null;
        }
        const maxSt = d.max_standing as
          | { name?: string | null; min_reputation?: number | null }
          | null
          | undefined;
        if (!mission.max_standing_name && maxSt?.name) {
          mission.max_standing_name = maxSt.name;
          mission.max_reputation =
            typeof maxSt.min_reputation === "number"
              ? maxSt.min_reputation
              : null;
        }
        if (
          mission.reward_min == null &&
          typeof d.reward_min === "number"
        ) {
          mission.reward_min = d.reward_min as number;
        }
        if (
          mission.reward_max == null &&
          typeof d.reward_max === "number"
        ) {
          mission.reward_max = d.reward_max as number;
        }
        if (!mission.reward_scope && typeof d.reward_scope === "string") {
          mission.reward_scope = d.reward_scope;
        }
        if (!mission.legality_label && typeof d.legality_label === "string") {
          mission.legality_label = d.legality_label;
        }
        const sm = d.starmap_locations as
          | Array<{
              purpose?: string;
              locations?: Array<{
                name?: string;
                system?: string | null;
                type?: string | null;
                web_url?: string | null;
              }>;
            }>
          | undefined;
        if (Array.isArray(sm)) {
          const seen = new Set<string>();
          for (const group of sm) {
            if ((group.purpose ?? "").toLowerCase() !== "availability") continue;
            for (const loc of group.locations ?? []) {
              const key = `${loc.name}|${loc.system ?? ""}`;
              if (!loc.name || seen.has(key)) continue;
              seen.add(key);
              mission.availability_locations.push({
                name: loc.name,
                system: loc.system ?? null,
                type: loc.type ?? null,
                web_url: loc.web_url ?? null,
              });
            }
          }
        }
        const ri = d.reward_items as
          | Array<{ name?: string; quantity?: number | null }>
          | null
          | undefined;
        if (Array.isArray(ri)) {
          mission.reward_items = ri
            .filter((x) => !!x?.name)
            .map((x) => ({
              name: x.name as string,
              quantity: typeof x.quantity === "number" ? x.quantity : null,
            }));
        }
      }
    } catch {
      // ignore enrichment failures
    }

    return { mission };
  });