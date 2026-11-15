import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assignOrgsFromSids, scanAndAssignRsiOrgs } from "./rsi-orgs.server";

export type OnboardingOrg = { id: string; name: string; slug: string | null };

export type OnboardingStatus = {
  discordLinked: boolean;
  discordOnServer: boolean;
  discordError: string | null;
  rsiVerified: boolean;
  rsiHandle: string | null;
  sids: string[];
  orgs: OnboardingOrg[];
  isAdmin: boolean;
  complete: boolean;
};

export async function loadOnboardingStatus(userId: string): Promise<OnboardingStatus> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("discord_user_id, rsi_handle, rsi_verified_at, rsi_org_sids")
    .eq("id", userId)
    .maybeSingle();

  const discordUserId = (profile?.discord_user_id as string | null) ?? null;
  let onServer = false;
  let discordError: string | null = null;
  if (discordUserId) {
    try {
      const { fetchMemberRoles } = await import("./discord.server");
      const roles = await fetchMemberRoles(discordUserId);
      onServer = roles !== null;
    } catch (err) {
      discordError = (err as Error).message;
      // Bot nicht erreichbar: Mitgliedschaft ist damit nicht bestätigt.
      onServer = false;
    }
  }

  const { data: memberships } = await supabaseAdmin
    .from("org_members")
    .select("org_id, orgs(id, name, slug, is_active)")
    .eq("user_id", userId);
  const orgs: OnboardingOrg[] = (memberships ?? [])
    .map((m) => (m as { orgs: { id: string; name: string; slug: string | null; is_active: boolean } | null }).orgs)
    .filter((o): o is { id: string; name: string; slug: string | null; is_active: boolean } => !!o && o.is_active !== false)
    .map((o) => ({ id: o.id, name: o.name, slug: o.slug }));

  const { data: adminRow } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  const isAdmin = !!adminRow;

  const rsiVerified = !!profile?.rsi_verified_at;
  const discordLinked = !!discordUserId;

  return {
    discordLinked,
    discordOnServer: discordLinked && onServer,
    discordError,
    rsiVerified,
    rsiHandle: (profile?.rsi_handle as string | null) ?? null,
    sids: ((profile?.rsi_org_sids as string[] | null) ?? []).map((s) => s.toUpperCase()),
    orgs,
    isAdmin,
    complete:
      isAdmin ||
      (discordLinked && onServer && rsiVerified && orgs.length > 0),
  };
}

export async function runOrgAssignment(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("rsi_org_sids, rsi_handle, rsi_verified_at")
    .eq("id", userId)
    .maybeSingle();
  const sids = ((profile?.rsi_org_sids as string[] | null) ?? []).map((s) =>
    s.toUpperCase(),
  );

  // Nach bestätigter RSI-Verifizierung: Umbenennen + „Verifiziert"-Rolle erneut anwenden.
  if (profile?.rsi_verified_at && profile?.rsi_handle) {
    try {
      const { applyRsiVerifiedDiscord } = await import("./rsi-discord.server");
      await applyRsiVerifiedDiscord(userId, profile.rsi_handle as string);
    } catch {
      /* Discord-Aktionen dürfen die Zuordnung nicht blockieren. */
    }
  }

  // Live-Scan der RSI-Orga-Seite, sofern ein verifizierter Handle vorliegt.
  if (profile?.rsi_verified_at && profile?.rsi_handle) {
    const scan = await scanAndAssignRsiOrgs(userId, profile.rsi_handle as string);
    const status = await loadOnboardingStatus(userId);
    return {
      assigned: scan.assigned,
      unavailable: scan.unavailable,
      found: scan.found,
      status,
    };
  }

  const assigned = await assignOrgsFromSids(userId, sids);
  const status = await loadOnboardingStatus(userId);
  return { assigned, unavailable: [], found: [], status };
}