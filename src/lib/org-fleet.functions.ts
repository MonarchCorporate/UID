import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type OrgFleetSettings = {
  fleet_source: "members" | "fleetyards";
  fleetyards_slug: string | null;
  synced_count: number;
  last_synced_at: string | null;
};

/** Reads the fleet configuration of one org (members only). */
export const getOrgFleetSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ org_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }): Promise<OrgFleetSettings> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!me && !isAdmin) throw new Error("Kein Mitglied dieser Orga.");

    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("fleet_source, fleetyards_slug")
      .eq("id", data.org_id)
      .maybeSingle();
    const { data: ships } = await supabaseAdmin
      .from("org_fleet_ships")
      .select("count, updated_at")
      .eq("org_id", data.org_id);
    const rows = ships ?? [];
    const last = rows
      .map((r) => r.updated_at as string)
      .sort()
      .pop();
    return {
      fleet_source:
        ((org?.fleet_source as string | null) ?? "members") === "fleetyards"
          ? "fleetyards"
          : "members",
      fleetyards_slug: (org?.fleetyards_slug as string | null) ?? null,
      synced_count: rows.reduce((a, r) => a + ((r.count as number) ?? 0), 0),
      last_synced_at: last ?? null,
    };
  });

/** Updates the fleet configuration of one org (`fleet.manage`). */
export const setOrgFleetSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        org_id: z.string().uuid(),
        fleet_source: z.enum(["members", "fleetyards"]),
        fleetyards_slug: z
          .string()
          .trim()
          .max(80)
          .regex(/^[a-z0-9-]*$/i, "Nur Buchstaben, Zahlen und -")
          .optional()
          .nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userHasOrgPerm } = await import("@/lib/org-perms.server");
    const ok = await userHasOrgPerm(supabaseAdmin, context.userId, data.org_id, "fleet.manage");
    if (!ok) throw new Error("Keine Berechtigung, die Orgaflotte zu verwalten.");
    const { error } = await supabaseAdmin
      .from("orgs")
      .update({
        fleet_source: data.fleet_source,
        fleetyards_slug: data.fleetyards_slug?.trim() || null,
      })
      .eq("id", data.org_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Triggers a Fleetyards sync for one org (`fleet.manage`). */
export const syncOrgFleetyardsNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ org_id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userHasOrgPerm } = await import("@/lib/org-perms.server");
    const ok = await userHasOrgPerm(supabaseAdmin, context.userId, data.org_id, "fleet.manage");
    if (!ok) throw new Error("Keine Berechtigung, die Orgaflotte zu synchronisieren.");
    const { data: org } = await supabaseAdmin
      .from("orgs")
      .select("fleetyards_slug")
      .eq("id", data.org_id)
      .maybeSingle();
    const slug = (org?.fleetyards_slug as string | null)?.trim();
    if (!slug) throw new Error("Kein Fleetyards-Slug hinterlegt.");
    const { syncOrgFleetyards } = await import("@/lib/org-fleet.server");
    const count = await syncOrgFleetyards(data.org_id, slug);
    return { count, slug };
  });