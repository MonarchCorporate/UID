import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { supabaseAdmin } from '@/integrations/supabase/client.server';

export const syncOrgFleetNow = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: role } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .eq('role', 'admin')
      .maybeSingle();
    if (!role) throw new Error('Nur Admins dürfen die Orga-Flotte synchronisieren.');
    const { runOrgFleetSyncWithLog } = await import('@/lib/fleet-sync.server');
    return runOrgFleetSyncWithLog();
  });
