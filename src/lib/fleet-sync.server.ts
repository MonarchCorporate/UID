import { supabaseAdmin } from '@/integrations/supabase/client.server';

const FLEETYARDS_BASE = 'https://api.fleetyards.net/v1/public/fleets';
const DEFAULT_FLEETYARDS_SLUG = 'idcp';

async function getConfiguredSlug(): Promise<string> {
  const { data } = await supabaseAdmin
    .from('app_settings')
    .select('value')
    .eq('key', 'fleetyards_slug')
    .maybeSingle();
  const v = data?.value?.trim();
  return v && v.length > 0 ? v : DEFAULT_FLEETYARDS_SLUG;
}

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
  if (v.includes('capital')) return 'Capital';
  if (v.includes('large')) return 'Large';
  if (v.includes('medium')) return 'Medium';
  if (v.includes('small')) return 'Small';
  if (v.includes('snub')) return 'Snub';
  if (v.includes('vehicle') || v.includes('ground')) return 'Vehicle';
  return label;
}

function pickImage(m: ApiItem['model']): string | null {
  return (
    m?.storeImageMedium ??
    m?.storeImage ??
    m?.media?.storeImage?.mediumUrl ??
    m?.fleetchartImage ??
    null
  );
}

type ShipRow = {
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
  raw: unknown;
  count: number;
  updated_at: string;
};

export async function syncOrgFleet(): Promise<number> {
  const perPage = 100;
  const aggregated = new Map<string, ShipRow>();
  const slug = await getConfiguredSlug();
  const fleetUrl = `${FLEETYARDS_BASE}/${encodeURIComponent(slug)}/vehicles`;

  for (let page = 1; page <= 20; page++) {
    const res = await fetch(`${fleetUrl}?perPage=${perPage}&page=${page}`, {
      headers: { accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`fleetyards ${res.status}: ${await res.text()}`);
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
        raw: m as unknown as Record<string, unknown>,
        count: 1,
        updated_at: new Date().toISOString(),
      });
    }

    if (items.length < perPage) break;
  }

  const rows: ShipRow[] = Array.from(aggregated.values());
  if (rows.length === 0) {
    console.warn(`[fleet-sync] No ships received from fleetyards for slug "${slug}". Skipping upsert/prune.`);
    return 0;
  }

  const slugs = rows.map((r) => r.slug);

  const { error: upErr } = await supabaseAdmin
    .from('fleet_ships')
    .upsert(rows as never, { onConflict: 'slug' });
  if (upErr) throw new Error(`upsert: ${upErr.message}`);

  const { error: delErr } = await supabaseAdmin
    .from('fleet_ships')
    .delete()
    .not('slug', 'in', `(${slugs.map((s) => `"${s.replace(/"/g, '')}"`).join(',')})`);
  if (delErr) throw new Error(`prune: ${delErr.message}`);

  return rows.length;
}

export async function runOrgFleetSyncWithLog(): Promise<{ count: number; slug: string }> {
  const { data: run } = await supabaseAdmin
    .from('fleet_sync_runs')
    .insert({ status: 'running' })
    .select('id')
    .single();
  try {
    const slug = await getConfiguredSlug();
    const count = await syncOrgFleet();
    if (run?.id) {
      await supabaseAdmin
        .from('fleet_sync_runs')
        .update({
          status: 'ok',
          ship_count: count,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id);
    }
    return { count, slug };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (run?.id) {
      await supabaseAdmin
        .from('fleet_sync_runs')
        .update({
          status: 'error',
          error_message: message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', run.id);
    }
    throw new Error(message);
  }
}
