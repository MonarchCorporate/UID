import { createFileRoute } from "@tanstack/react-router";
import { runShipPriceSync } from "@/lib/ship-prices-sync.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-ship-prices")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger ship aUEC price sync" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const r = await runShipPriceSync();
          return Response.json({
            ok: true,
            vehicles: r.vehicles,
            matched: r.matched,
            updated: r.updated,
            changed: r.changed.length,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-ship-prices error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
