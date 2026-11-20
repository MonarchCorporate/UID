import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const amIAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();
    return { isAdmin: !!data };
  });

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

export const syncSccrafterBlueprints = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { runSCCrafterSync } = await import("./sccrafter-sync.server");
    return runSCCrafterSync();
  });

export const getSyncOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabaseAdmin as any;
    async function countAndLatest(
      table: string,
      timeCol: string,
      filter?: { col: string; val: string },
    ): Promise<{ count: number; last_synced_at: string | null }> {
      let cQ = sb.from(table).select("*", { count: "exact", head: true });
      let lQ = sb
        .from(table)
        .select(timeCol)
        .order(timeCol, { ascending: false, nullsFirst: false })
        .limit(1);
      if (filter) {
        cQ = cQ.eq(filter.col, filter.val);
        lQ = lQ.eq(filter.col, filter.val);
      }
      const [{ count }, latest] = await Promise.all([cQ, lQ.maybeSingle()]);
      const row = latest.data as Record<string, unknown> | null;
      return {
        count: (count as number | null) ?? 0,
        last_synced_at: (row?.[timeCol] as string | null) ?? null,
      };
    }

    const [
      blueprintsWiki,
      blueprintsScc,
      missionsAgg,
      components,
      ships,
      shipPrices,
      fleet,
      lastFleetRun,
      wikiItems,
    ] = await Promise.all([
      countAndLatest("blueprints", "updated_at", { col: "source", val: "wiki" }),
      countAndLatest("blueprints", "updated_at", { col: "source", val: "sccrafter" }),
      (async () => {
        const [{ count }, latest] = await Promise.all([
          supabaseAdmin
            .from("blueprint_missions")
            .select("mission_uuid", { count: "exact", head: true }),
          supabaseAdmin
            .from("blueprint_missions")
            .select("created_at")
            .order("created_at", { ascending: false, nullsFirst: false })
            .limit(1)
            .maybeSingle(),
        ]);
        return {
          count: count ?? 0,
          last_synced_at: (latest.data?.created_at as string | null) ?? null,
        };
      })(),
      countAndLatest("ship_components_catalog", "last_synced_at"),
      countAndLatest("ship_catalog", "synced_at"),
      countAndLatest("ship_catalog", "price_synced_at"),
      countAndLatest("fleet_ships", "updated_at"),
      supabaseAdmin
        .from("fleet_sync_runs")
        .select("*")
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      countAndLatest("inventory_item_catalog", "last_synced_at", { col: "source", val: "wiki" }),
    ]);

    return {
      blueprintsWiki,
      blueprintsScc,
      missions: missionsAgg,
      components,
      ships,
      shipPrices,
      fleet,
      wikiItems,
      lastFleetRun: lastFleetRun.data
        ? {
            started_at: (lastFleetRun.data.started_at as string | null) ?? null,
            finished_at: (lastFleetRun.data.finished_at as string | null) ?? null,
            status: (lastFleetRun.data.status as string | null) ?? null,
            ship_count: (lastFleetRun.data.ship_count as number | null) ?? null,
            error_message: (lastFleetRun.data.error_message as string | null) ?? null,
          }
        : null,
    };
  });