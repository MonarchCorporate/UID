import { createFileRoute } from "@tanstack/react-router";
import { runSCCrafterSync } from "@/lib/sccrafter-sync.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

export const Route = createFileRoute("/api/public/hooks/sync-sccrafter")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST to trigger SCCrafter sync" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const result = await runSCCrafterSync();
          return Response.json({ ok: true, ...result });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("sync-sccrafter error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});