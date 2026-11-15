import { createFileRoute } from "@tanstack/react-router";
import { syncAllFleetyards } from "@/lib/fleetyards-sync.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-user-fleetyards")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const result = await syncAllFleetyards();
          return Response.json({ ...result, ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-user-fleetyards error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
      GET: async () => Response.json({ ok: true, hint: "POST to trigger sync" }),
    },
  },
});