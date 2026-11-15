import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";

/**
 * Posts the monthly treasury report for every org whose configured day/hour
 * has arrived. Called hourly by a schedule (pg_cron) with
 * `Authorization: Bearer <HOOK_SECRET>`.
 */
export const Route = createFileRoute("/api/public/hooks/treasury-monthly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = checkHookSecret(request);
        if (denied) return denied;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { postTreasuryMonthly, monthKey } = await import(
          "@/lib/treasury-discord.server"
        );

        const now = new Date();
        const day = now.getUTCDate();
        const hour = now.getUTCHours();
        // report covers the month before the posting date
        const target = monthKey(
          new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
        );
        const baseUrl = new URL(request.url).origin;

        const { data: rows } = await supabaseAdmin
          .from("org_treasury_discord_settings")
          .select("*")
          .eq("post_monthly", true)
          .not("channel_id", "is", null);

        const results: { org_id: string; ok: boolean; error?: string }[] = [];
        for (const s of rows ?? []) {
          const due =
            Number(s.monthly_day ?? 1) === day && Number(s.monthly_hour ?? 10) === hour;
          const already =
            s.last_monthly_posted_at &&
            monthKey(new Date(s.last_monthly_posted_at as string)) === monthKey(now);
          if (!due || already) continue;
          try {
            await postTreasuryMonthly(
              supabaseAdmin,
              s.org_id as string,
              target,
              baseUrl,
            );
            await supabaseAdmin
              .from("org_treasury_discord_settings")
              .update({ last_monthly_posted_at: new Date().toISOString() })
              .eq("org_id", s.org_id as string);
            results.push({ org_id: s.org_id as string, ok: true });
          } catch (e) {
            results.push({
              org_id: s.org_id as string,
              ok: false,
              error: e instanceof Error ? e.message : "unknown",
            });
          }
        }
        return Response.json({ ok: true, month: target, results });
      },
    },
  },
});
