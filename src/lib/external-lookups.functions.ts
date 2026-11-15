import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UexItem = {
  item_ref: string;
  name: string;
  kind: string | null;
  weight: number | null;
  image_url: string | null;
  price_buy?: number | null;
  price_sell?: number | null;
};

/**
 * Look up items via uexcorp.space and cache hits into `inventory_item_catalog`.
 * Returns `{ items, error }` so the UI can still render on outage.
 */
export const searchUexItems = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ q: z.string().trim().min(2).max(80) }).parse(input),
  )
  .handler(async ({ data }) => {
    try {
      const url = `https://api.uexcorp.space/2.0/items?name=${encodeURIComponent(data.q)}`;
      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`UEX ${res.status}`);
      const json = (await res.json()) as { data?: Array<Record<string, unknown>> };
      const raw = Array.isArray(json?.data) ? json.data : [];
      const items: UexItem[] = raw.slice(0, 25).map((r) => ({
        item_ref: String(r.uuid ?? r.id ?? r.code ?? r.slug ?? r.name),
        name: String(r.name ?? "Unbenannt"),
        kind: (r.kind as string) ?? (r.section as string) ?? null,
        weight: r.weight !== undefined ? Number(r.weight) : null,
        image_url: (r.screenshot as string) ?? (r.thumbnail as string) ?? null,
      }));

      // Cache best-effort
      if (items.length > 0) {
        await supabaseAdmin
          .from("inventory_item_catalog")
          .upsert(
            items.map((i) => ({
              item_ref: i.item_ref,
              name: i.name,
              kind: i.kind,
              weight: i.weight,
              image_url: i.image_url,
              source: "uex",
            })),
            { onConflict: "item_ref" },
          );
      }

      return { items, error: null as string | null };
    } catch (e) {
      return { items: [] as UexItem[], error: (e as Error).message };
    }
  });

export type MissionLookup = {
  mission_ref: string;
  name: string;
  faction: string | null;
  rank: string | null;
  payout: number | null;
  reputation: string | null;
  location: string | null;
  url: string | null;
};

/**
 * Look up a mission via scmdb.net. SCMDB's public surface is limited; we try
 * a slug-style URL and fall back to returning just a link.
 */
export const lookupMission = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ slug: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const url = `https://scmdb.net/mission/${encodeURIComponent(data.slug)}`;
    try {
      const res = await fetch(`https://scmdb.net/api/mission/${encodeURIComponent(data.slug)}`, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`SCMDB ${res.status}`);
      const j = (await res.json()) as Record<string, unknown>;
      const mission: MissionLookup = {
        mission_ref: data.slug,
        name: String(j.name ?? data.slug),
        faction: (j.faction as string) ?? null,
        rank: (j.rank as string) ?? null,
        payout: j.payout !== undefined ? Number(j.payout) : null,
        reputation: (j.reputation as string) ?? null,
        location: (j.location as string) ?? null,
        url,
      };
      await supabaseAdmin
        .from("missions_catalog")
        .upsert(mission, { onConflict: "mission_ref" });
      return { mission, error: null as string | null };
    } catch (e) {
      return {
        mission: {
          mission_ref: data.slug,
          name: data.slug,
          faction: null,
          rank: null,
          payout: null,
          reputation: null,
          location: null,
          url,
        } as MissionLookup,
        error: (e as Error).message,
      };
    }
  });