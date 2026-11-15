import { createFileRoute } from "@tanstack/react-router";

/**
 * Renders the monthly treasury chart as a PNG for Discord embeds.
 * Only aggregated sums are used — no player names, no booking details.
 * The URL carries a signature so it cannot be guessed for arbitrary orgs.
 */
export const Route = createFileRoute("/api/public/treasury-chart")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const orgId = url.searchParams.get("org") ?? "";
        const month = url.searchParams.get("m") ?? "";
        const token = url.searchParams.get("t") ?? "";
        if (!/^[0-9a-f-]{36}$/i.test(orgId) || !/^\d{4}-\d{2}$/.test(month)) {
          return new Response("Bad request", { status: 400 });
        }
        const {
          verifyChartToken,
          computeTreasuryStats,
          monthlyChartConfig,
        } = await import("@/lib/treasury-discord.server");
        if (!verifyChartToken(orgId, month, token)) {
          return new Response("Unauthorized", { status: 401 });
        }
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const stats = await computeTreasuryStats(supabaseAdmin, orgId, month);

        const res = await fetch("https://quickchart.io/chart", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            width: 900,
            height: 420,
            backgroundColor: "#0b1220",
            format: "png",
            chart: monthlyChartConfig(stats),
          }),
        });
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error(`[treasury-chart] render failed ${res.status}: ${text.slice(0, 200)}`);
          return new Response("Chart unavailable", { status: 502 });
        }
        return new Response(res.body, {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
