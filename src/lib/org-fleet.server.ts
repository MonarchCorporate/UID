import { supabaseAdmin } from "@/integrations/supabase/client.server";

const FLEETYARDS_BASE = "https://api.fleetyards.net/v1/public/fleets";

type ApiItem = {
  model?: {
    name?: string;
    slug?: string;
    classificationLabel?: string | null;
    focus?: string | null;
    sizeLabel?: string | null;
    lengthLabel?: string | null;
    cargo?: number | string | null;
    crew?: { maxLabel?: string | null } | null;
    storeImageMedium?: string | null;
    storeImage?: string | null;
    fleetchartImage?: string | null;
    media?: { storeImage?: { mediumUrl?: string } | null } | null;
    links?: { storeUrl?: string | null } | null;
    manufacturer?: { name?: string | null; code?: string | null } | null;
  };
};

function sizeFromLabel(label: string | null | undefined): string | null {
  if (!label) return null;
  const v = label.toLowerCase();
  if (v.includes("capital")) return "Capital";
  if (v.includes("large")) return "Large";
  if (v.includes("medium")) return "Medium";
  if (v.includes("small")) return "Small";
  if (v.includes("snub")) return "Snub";
  if (v.includes("vehicle") || v.includes("ground")) return "Vehicle";
  return label;
}

function pickImage(m: ApiItem["model"]): string | null {
  return (
    m?.storeImageMedium ??
    m?.storeImage ??
    m?.media?.storeImage?.mediumUrl ??
    m?.fleetchartImage ??
    null
  );
}

type OrgShipRow = {
  org_id: string;
  slug: string;
  name: string;
  manufacturer: string | null;
  manufacturer_code: string | null;
  classification: string | null;
  focus: string | null;
  size: string | null;
  length: string | null;
  crew: string | null;
  cargo: string | null;
  image: string | null;
  store_url: string | null;
  count: number;
  updated_at: string;
};

/**
 * Syncs a single org's Fleetyards hangar into `org_fleet_ships`.
 * Strictly scoped: only rows of this org are touched.
 */
export async function syncOrgFleetyards(
  orgId: string,
  fleetSlug: string,
): Promise<number> {
  const perPage = 100;
  const aggregated = new Map<string, OrgShipRow>();
  const fleetUrl = `${FLEETYARDS_BASE}/${encodeURIComponent(fleetSlug)}/vehicles`;

  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${fleetUrl}?perPage=${perPage}&page=${page}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error(`Fleetyards ${res.status}: ${await res.text()}`);
    const items = (await res.json()) as ApiItem[];
    if (!Array.isArray(items) || items.length === 0) break;

    for (const it of items) {
      const m = it.model;
      const s = m?.slug;
      const name = m?.name;
      if (!s || !name) continue;
      const existing = aggregated.get(s);
      if (existing) {
        existing.count += 1;
        continue;
      }
      aggregated.set(s, {
        org_id: orgId,
        slug: s,
        name,
        manufacturer: m?.manufacturer?.name ?? null,
        manufacturer_code: m?.manufacturer?.code ?? null,
        classification: m?.classificationLabel ?? null,
        focus: m?.focus ?? null,
        size: sizeFromLabel(m?.sizeLabel),
        length: m?.lengthLabel ?? null,
        crew: m?.crew?.maxLabel ?? null,
        cargo: m?.cargo != null ? `${m.cargo} SCU` : null,
        image: pickImage(m),
        store_url: m?.links?.storeUrl ?? null,
        count: 1,
        updated_at: new Date().toISOString(),
      });
    }

    if (items.length < perPage) break;
  }

  const rows = Array.from(aggregated.values());
  if (rows.length === 0) {
    throw new Error(
      `Keine Schiffe für Fleetyards-Flotte "${fleetSlug}" gefunden. Slug prüfen.`,
    );
  }

  const { error: upErr } = await supabaseAdmin
    .from("org_fleet_ships")
    .upsert(rows as never, { onConflict: "org_id,slug" });
  if (upErr) throw new Error(upErr.message);

  const keep = rows.map((r) => r.slug);
  const { error: delErr } = await supabaseAdmin
    .from("org_fleet_ships")
    .delete()
    .eq("org_id", orgId)
    .not("slug", "in", `(${keep.map((s) => `"${s.replace(/"/g, "")}"`).join(",")})`);
  if (delErr) throw new Error(delErr.message);

  return rows.length;
}