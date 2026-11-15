import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import fleet from "@/data/fleet.json";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type FleetSeed = {
  ships: Array<{
    slug: string;
    name: string;
    manufacturer: string | null;
    manufacturerCode: string | null;
    classification: string | null;
    focus: string | null;
    size: string | null;
    length: string | null;
    crew: string | null;
    cargo: string | null;
    image: string | null;
    storeUrl: string | null;
  }>;
};

export type ShipDetails = {
  slug: string;
  name: string;
  manufacturer: string | null;
  manufacturerCode: string | null;
  classification: string | null;
  focus: string | null;
  size: string | null;
  length: string | null;
  crew: string | null;
  cargo: string | null;
  image: string | null;
  storeUrl: string | null;
  turrets: number | null;
  mannedTurrets: number | null;
  missileRacks: number | null;
  weaponHardpoints: number | null;
  /** Count of fixed weapon mounts per size (S1..S10), from ship_matrix. */
  weaponsBySize: Record<number, number> | null;
  /** Count of turret mounts per size (S1..S10), from ship_matrix. */
  turretsBySize: Record<number, number> | null;
  /** Count of missile rack mounts per size (S1..S10), from ship_matrix. */
  missileRacksBySize: Record<number, number> | null;
};

// Simple per-worker cache. Fleetyards data is stable for hours.
const cache = new Map<string, { at: number; data: ShipDetails }>();
const TTL_MS = 1000 * 60 * 60 * 6;

async function fetchHardpoints(slug: string) {
  try {
    const res = await fetch(`https://api.fleetyards.net/v1/models/${slug}/hardpoints`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{
      group: string;
      category: string;
      name?: string;
      source?: string;
      maxSize?: number | null;
    }>;
    if (!Array.isArray(data)) return null;
    let turrets = 0;
    let mannedTurrets = 0;
    let missileRacks = 0;
    let weaponHardpoints = 0;
    const weaponsBySize: Record<number, number> = {};
    const turretsBySize: Record<number, number> = {};
    const missileRacksBySize: Record<number, number> = {};
    const autoRe = /pds|pdc|pdt|automated|remote/i;
    for (const h of data) {
      if (h.group === "weapon") weaponHardpoints++;
      if (h.category === "turret") {
        turrets++;
        if (!autoRe.test(h.name ?? "")) mannedTurrets++;
      }
      if (h.category === "missile_racks") missileRacks++;
      // Size-bucketed totals: trust the canonical ship_matrix source only to
      // avoid double-counting game-files duplicates.
      if (h.source === "ship_matrix" && typeof h.maxSize === "number" && h.maxSize > 0) {
        if (h.category === "weapons") {
          weaponsBySize[h.maxSize] = (weaponsBySize[h.maxSize] ?? 0) + 1;
        } else if (h.category === "turret") {
          turretsBySize[h.maxSize] = (turretsBySize[h.maxSize] ?? 0) + 1;
        } else if (h.category === "missile_racks") {
          missileRacksBySize[h.maxSize] = (missileRacksBySize[h.maxSize] ?? 0) + 1;
        }
      }
    }
    return {
      turrets,
      mannedTurrets,
      missileRacks,
      weaponHardpoints,
      weaponsBySize,
      turretsBySize,
      missileRacksBySize,
    };
  } catch {
    return null;
  }
}

export const getShipDetails = createServerFn({ method: "POST" })
  .inputValidator((input) => z.object({ slug: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data }): Promise<ShipDetails> => {
    const slug = data.slug;
    const cached = cache.get(slug);
    if (cached && Date.now() - cached.at < TTL_MS) return cached.data;

    let base = (fleet as FleetSeed).ships.find((s) => s.slug === slug) ?? null;

    // Fallback to DB if not in static seed (covers ships only known via Fleetyards sync)
    if (!base) {
      const { data: row } = await supabaseAdmin
        .from("fleet_ships")
        .select(
          "slug,name,manufacturer,manufacturer_code,classification,focus,size,length,crew,cargo,image,store_url",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (row) {
        base = {
          slug: row.slug,
          name: row.name,
          manufacturer: row.manufacturer,
          manufacturerCode: row.manufacturer_code,
          classification: row.classification,
          focus: row.focus,
          size: row.size,
          length: row.length,
          crew: row.crew,
          cargo: row.cargo,
          image: row.image,
          storeUrl: row.store_url,
        };
      }
    }

    const hp = await fetchHardpoints(slug);

    // Fall back to the synced ship catalog (has images for every known ship)
    if (!base) {
      const { data: c } = await supabaseAdmin
        .from("ship_catalog")
        .select(
          "slug,name,manufacturer,manufacturer_code,classification_label,classification,focus,size_label,size,length_m,crew_max,crew_min,cargo_scu,hero_image,store_image,store_url",
        )
        .eq("slug", slug)
        .maybeSingle();
      if (c) {
        base = {
          slug,
          name: (c.name as string) ?? slug,
          manufacturer: (c.manufacturer as string) ?? null,
          manufacturerCode: (c.manufacturer_code as string) ?? null,
          classification:
            (c.classification_label as string) ?? (c.classification as string) ?? null,
          focus: (c.focus as string) ?? null,
          size: (c.size_label as string) ?? (c.size as string) ?? null,
          length: c.length_m != null ? `${c.length_m} m` : null,
          crew:
            c.crew_max != null
              ? String(c.crew_max)
              : c.crew_min != null
                ? String(c.crew_min)
                : null,
          cargo: c.cargo_scu != null ? `${c.cargo_scu} SCU` : null,
          image: (c.hero_image as string) ?? (c.store_image as string) ?? null,
          storeUrl: (c.store_url as string) ?? null,
        };
      }
    }

    // Fall back to Fleetyards model endpoint for image/specs when we still have nothing
    if (!base) {
      try {
        const res = await fetch(`https://api.fleetyards.net/v1/models/${slug}`, {
          headers: { accept: "application/json" },
        });
        if (res.ok) {
          const m = (await res.json()) as {
            name?: string;
            slug?: string;
            manufacturer?: { name?: string; code?: string } | null;
            classification?: string | null;
            focus?: string | null;
            size?: string | null;
            length?: number | null;
            crew?: number | null;
            cargo?: number | null;
            storeImage?: string | null;
            storeImageLarge?: string | null;
            fleetchartImage?: string | null;
            storeUrl?: string | null;
          };
          base = {
            slug,
            name: m.name ?? slug,
            manufacturer: m.manufacturer?.name ?? null,
            manufacturerCode: m.manufacturer?.code ?? null,
            classification: m.classification ?? null,
            focus: m.focus ?? null,
            size: m.size ?? null,
            length: m.length != null ? `${m.length} m` : null,
            crew: m.crew != null ? String(m.crew) : null,
            cargo: m.cargo != null ? `${m.cargo} SCU` : null,
            image: m.storeImageLarge ?? m.storeImage ?? m.fleetchartImage ?? null,
            storeUrl: m.storeUrl ?? null,
          };
        }
      } catch {
        /* ignore */
      }
    }

    const result: ShipDetails = {
      slug,
      name: base?.name ?? slug,
      manufacturer: base?.manufacturer ?? null,
      manufacturerCode: base?.manufacturerCode ?? null,
      classification: base?.classification ?? null,
      focus: base?.focus ?? null,
      size: base?.size ?? null,
      length: base?.length ?? null,
      crew: base?.crew ?? null,
      cargo: base?.cargo ?? null,
      image: base?.image ?? null,
      storeUrl: base?.storeUrl ?? null,
      turrets: hp?.turrets ?? null,
      mannedTurrets: hp?.mannedTurrets ?? null,
      missileRacks: hp?.missileRacks ?? null,
      weaponHardpoints: hp?.weaponHardpoints ?? null,
      weaponsBySize: hp?.weaponsBySize ?? null,
      turretsBySize: hp?.turretsBySize ?? null,
      missileRacksBySize: hp?.missileRacksBySize ?? null,
    };
    cache.set(slug, { at: Date.now(), data: result });
    return result;
  });