import { createFileRoute } from "@tanstack/react-router";
import { runWikiBlueprintSync } from "@/lib/blueprints-sync.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-wiki-blueprints")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger blueprint sync" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const result = await runWikiBlueprintSync();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-wiki-blueprints error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});