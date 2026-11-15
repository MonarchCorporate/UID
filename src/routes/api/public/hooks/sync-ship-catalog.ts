import { createFileRoute } from "@tanstack/react-router";
import { runShipCatalogSyncAll } from "@/lib/ship-catalog.functions";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-ship-catalog")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger ship catalog sync" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const result = await runShipCatalogSyncAll();
          return Response.json({ ...result, ok: true });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-ship-catalog error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});