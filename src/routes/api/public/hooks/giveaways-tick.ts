import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";

/**
 * Draws every giveaway whose end date has passed. Called hourly by a schedule
 * (pg_cron) with `Authorization: Bearer <HOOK_SECRET>`.
 */
export const Route = createFileRoute("/api/public/hooks/giveaways-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkHookSecret(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { performDraw } = await import("@/lib/giveaways.server");
        const nowIso = new Date().toISOString();
        const { data } = await supabaseAdmin
          .from("giveaways")
          .select("*")
          .eq("status", "running")
          .lte("ends_at", nowIso)
          .limit(20);

        const results: { id: string; ok: boolean; error?: string }[] = [];
        for (const g of data ?? []) {
          try {
            await performDraw(supabaseAdmin, g);
            results.push({ id: g.id, ok: true });
          } catch (e) {
            results.push({
              id: g.id,
              ok: false,
              error: e instanceof Error ? e.message : "unknown",
            });
          }
        }
        return Response.json({ ok: true, drawn: results.length, results });
      },
      GET: async () => Response.json({ ok: true, hint: "POST to draw due giveaways" }),
    },
  },
});
