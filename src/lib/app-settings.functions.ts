import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export type FleetSource = 'fleetyards' | 'users';

export const getFleetSource = createServerFn({ method: 'GET' }).handler(
  async (): Promise<FleetSource> => {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'fleet_source')
      .maybeSingle();
    return data?.value === 'users' ? 'users' : 'fleetyards';
  },
);

export const setFleetSource = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ source: z.enum(['fleetyards', 'users']) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: role } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) throw new Error('Nur Admins dürfen die Flotten-Quelle ändern.');
    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({ key: 'fleet_source', value: data.source, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, source: data.source };
  });

const DEFAULT_FLEETYARDS_SLUG = 'idcp';

function parseFleetyardsSlug(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const parts = url.pathname.split('/').filter(Boolean);
      const idx = parts.findIndex((p) => p === 'fleets');
      candidate = idx >= 0 ? parts[idx + 1] ?? '' : parts[parts.length - 1] ?? '';
    }
  } catch {
    // fall through
  }
  candidate = candidate.split(/[?#/]/)[0];
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

export const getFleetyardsSlug = createServerFn({ method: 'GET' }).handler(
  async (): Promise<string> => {
    const { data } = await supabaseAdmin
      .from('app_settings')
      .select('value')
      .eq('key', 'fleetyards_slug')
      .maybeSingle();
    return data?.value && data.value.trim() ? data.value : DEFAULT_FLEETYARDS_SLUG;
  },
);

export const setFleetyardsSlug = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ slug: z.string().min(1).max(120) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: role } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) throw new Error('Nur Admins dürfen die Fleetyards-Quelle ändern.');
    const slug = parseFleetyardsSlug(data.slug);
    if (!slug) throw new Error('Ungültiger Fleetyards-Slug oder URL.');
    const { error } = await supabaseAdmin
      .from('app_settings')
      .upsert({ key: 'fleetyards_slug', value: slug, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true, slug };
  });
