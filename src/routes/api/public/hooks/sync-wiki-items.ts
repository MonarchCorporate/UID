import { createFileRoute } from "@tanstack/react-router";
import { syncWikiItemsAll } from "@/lib/items-wiki-sync.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-wiki-items")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger wiki item sync" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const result = await syncWikiItemsAll();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-wiki-items error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});
