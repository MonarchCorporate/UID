import { createFileRoute } from "@tanstack/react-router";
import { syncAllShipComponents } from "@/lib/ship-components-sync.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-ship-components")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger ship components sync" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const result = await syncAllShipComponents();
          return Response.json({ ...result, ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-ship-components error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});