import { createFileRoute } from "@tanstack/react-router";
import { runStockLoadoutWikiSync } from "@/lib/stock-loadouts-wiki.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-stock-loadouts-wiki")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to sync default ship loadouts from the wiki" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const url = new URL(request.url);
          const r = await runStockLoadoutWikiSync({
            onlyMissing: url.searchParams.get("onlyMissing") === "1",
          });
          return Response.json({ ok: true, ...r });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-stock-loadouts-wiki error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
