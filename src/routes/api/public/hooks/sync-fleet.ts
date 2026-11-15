import { createFileRoute } from '@tanstack/react-router';
import { runOrgFleetSyncWithLog } from '@/lib/fleet-sync.server';
import { checkHookSecret } from '@/lib/hook-auth.server';

export const Route = createFileRoute('/api/public/hooks/sync-fleet')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const { count } = await runOrgFleetSyncWithLog();
          return Response.json({ ok: true, count });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error('sync-fleet error', message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: 'POST to trigger sync' }),
    },
  },
});
