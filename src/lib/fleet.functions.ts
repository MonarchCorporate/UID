import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type FleetShip = {
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
  count: number;
};

export type FleetResponse = {
  ships: FleetShip[];
  manufacturers: string[];
  classifications: string[];
  sizes: string[];
  updatedAt: string | null;
  source: 'db' | 'seed';
};

export const getFleetShips = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FleetResponse> => {
    // Read source setting (fleetyards | users)
    const { data: setting } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'fleet_source')
      .maybeSingle();
    const source = setting?.value === 'users' ? 'users' : 'fleetyards';

    // === USERS SOURCE: aggregate from user_ships, metadata from ship_catalog ===
    if (source === 'users') {
      const { data: profileRows } = await supabaseAdmin
        .from('profiles')
        .select('id');
      const profileIds = (profileRows ?? []).map((p) => p.id);

      let userShips: { ship_slug: string | null; ship_name: string; manufacturer: string | null }[] = [];
      if (profileIds.length > 0) {
        const { data: us } = await supabaseAdmin
          .from('user_ships')
          .select('ship_slug, ship_name, manufacturer, user_id')
          .in('user_id', profileIds);
        userShips = us ?? [];
      }

      const counts = new Map<string, { count: number; name: string; manufacturer: string | null }>();
      for (const us of userShips) {
        const slug = us.ship_slug;
        if (!slug) continue;
        const existing = counts.get(slug);
        if (existing) existing.count += 1;
        else counts.set(slug, { count: 1, name: us.ship_name, manufacturer: us.manufacturer });
      }

      const slugs = Array.from(counts.keys());
      let catalog: Record<string, {
        slug: string; name: string; manufacturer: string | null; manufacturer_code: string | null;
        classification: string | null; focus: string | null; size: string | null;
        length_m: number | null; crew_max: number | null; cargo_scu: number | null;
        hero_image: string | null; store_image: string | null; angled_view: string | null; store_url: string | null;
      }> = {};
      if (slugs.length > 0) {
        const { data: cat } = await supabaseAdmin
          .from('ship_catalog')
          .select('slug,name,manufacturer,manufacturer_code,classification,focus,size,length_m,crew_max,cargo_scu,hero_image,store_image,angled_view,store_url')
          .in('slug', slugs);
        for (const row of cat ?? []) catalog[row.slug] = row as never;
      }

      const merged: FleetShip[] = [];
      for (const [slug, info] of counts) {
        const meta = catalog[slug];
        if (meta) {
          merged.push({
            slug: meta.slug,
            name: meta.name,
            manufacturer: meta.manufacturer,
            manufacturerCode: meta.manufacturer_code,
            classification: meta.classification,
            focus: meta.focus,
            size: meta.size,
            length: meta.length_m != null ? String(meta.length_m) : null,
            crew: meta.crew_max != null ? String(meta.crew_max) : null,
            cargo: meta.cargo_scu != null ? String(meta.cargo_scu) : null,
            image: meta.hero_image ?? meta.store_image ?? meta.angled_view ?? null,
            storeUrl: meta.store_url,
            count: info.count,
          });
        } else {
          merged.push({
            slug,
            name: info.name,
            manufacturer: info.manufacturer,
            manufacturerCode: null,
            classification: null,
            focus: null,
            size: null,
            length: null,
            crew: null,
            cargo: null,
            image: null,
            storeUrl: null,
            count: info.count,
          });
        }
      }

      const uniq = (arr: (string | null)[]) =>
        Array.from(new Set(arr.filter((v): v is string => !!v))).sort();
      return {
        ships: merged,
        manufacturers: uniq(merged.map((s) => s.manufacturer)),
        classifications: uniq(merged.map((s) => s.classification)),
        sizes: uniq(merged.map((s) => s.size)),
        updatedAt: null,
        source: 'db',
      };
    }

    // === FLEETYARDS SOURCE ===
    const { data, error } = await supabaseAdmin
      .from('fleet_ships')
      .select(
        'slug,name,manufacturer,manufacturer_code,classification,focus,size,length,crew,cargo,image,store_url,count,updated_at',
      );

    if (error || !data || data.length === 0) {
      const seed = (await import('@/data/fleet.json')).default as {
        ships: FleetShip[];
        manufacturers: string[];
        classifications: string[];
        sizes: string[];
      };
      return {
        ships: seed.ships,
        manufacturers: seed.manufacturers,
        classifications: seed.classifications,
        sizes: seed.sizes,
        updatedAt: null,
        source: 'seed',
      };
    }

    const ships: FleetShip[] = data.map((r) => ({
      slug: r.slug,
      name: r.name,
      manufacturer: r.manufacturer,
      manufacturerCode: r.manufacturer_code,
      classification: r.classification,
      focus: r.focus,
      size: r.size,
      length: r.length,
      crew: r.crew,
      cargo: r.cargo,
      image: r.image,
      storeUrl: r.store_url,
      count: r.count ?? 1,
    }));

    const uniq = (arr: (string | null)[]) =>
      Array.from(new Set(arr.filter((v): v is string => !!v))).sort();

    const latestUpdate = data.reduce<string | null>((acc, r) => {
      if (!r.updated_at) return acc;
      return !acc || r.updated_at > acc ? r.updated_at : acc;
    }, null);

    return {
      ships,
      manufacturers: uniq(ships.map((s) => s.manufacturer)),
      classifications: uniq(ships.map((s) => s.classification)),
      sizes: uniq(ships.map((s) => s.size)),
      updatedAt: latestUpdate,
      source: 'db',
    };
  },
);

export type ShipOwner = {
  user_id: string;
  callsign: string;
  display_name: string | null;
  custom_name: string | null;
  location: string | null;
  source: string;
};

// Full ship_catalog listing for pickers (independent of Fleetyards ownership).
export const listAllCatalogShips = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FleetShip[]> => {
    const { data } = await supabaseAdmin
      .from('ship_catalog')
      .select(
        'slug,name,manufacturer,manufacturer_code,classification,focus,size,length_m,crew_max,cargo_scu,hero_image,store_image,angled_view,store_url',
      )
      .order('manufacturer', { ascending: true })
      .order('name', { ascending: true });
    return (data ?? []).map((r) => ({
      slug: r.slug as string,
      name: r.name as string,
      manufacturer: (r.manufacturer as string) ?? null,
      manufacturerCode: (r.manufacturer_code as string) ?? null,
      classification: (r.classification as string) ?? null,
      focus: (r.focus as string) ?? null,
      size: (r.size as string) ?? null,
      length: r.length_m != null ? String(r.length_m) : null,
      crew: r.crew_max != null ? String(r.crew_max) : null,
      cargo: r.cargo_scu != null ? String(r.cargo_scu) : null,
      image:
        (r.hero_image as string) ??
        (r.store_image as string) ??
        (r.angled_view as string) ??
        null,
      storeUrl: (r.store_url as string) ?? null,
      count: 0,
    }));
  },
);


export const getShipOwners = createServerFn({ method: 'POST' })
  .inputValidator((i) => z.object({ slug: z.string().min(1).max(120) }).parse(i))
  .handler(async ({ data }): Promise<ShipOwner[]> => {
    const { data: rows, error } = await supabaseAdmin
      .from('user_ships')
      .select('user_id, custom_name, location, source')
      .eq('ship_slug', data.slug);
    if (error || !rows) return [];
    const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
    if (userIds.length === 0) return [];
    const { data: profs } = await supabaseAdmin
      .from('profiles')
      .select('id, callsign, display_name')
      .in('id', userIds);
    const byId = new Map((profs ?? []).map((p) => [p.id, p]));
    return rows.map((r) => {
      const p = byId.get(r.user_id);
      return {
        user_id: r.user_id,
        callsign: p?.callsign ?? 'unbekannt',
        display_name: p?.display_name ?? null,
        custom_name: r.custom_name,
        location: r.location,
        source: r.source,
      };
    });
  });