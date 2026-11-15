import { supabaseAdmin } from "@/integrations/supabase/client.server";

/** Alle freigegebenen Discord-Rollen, die an diese Orga gekoppelt sind. */
async function mappedRolesForOrg(orgId: string) {
  const { data } = await supabaseAdmin
    .from("discord_role_mappings")
    .select("discord_role_id, discord_role_name, is_lead, enabled")
    .eq("org_id", orgId)
    .eq("enabled", true);
  return data ?? [];
}

async function discordIdOf(userId: string): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("discord_user_id")
    .eq("id", userId)
    .maybeSingle();
  return (data?.discord_user_id as string | null) ?? null;
}

/**
 * Entfernt alle Discord-Rollen, die mit dieser Orga verknüpft sind
 * (inkl. Leitungsrolle). Wird beim Entfernen aus der Orga im Backoffice
 * aufgerufen. Rollen, die zusätzlich zu einer anderen Orga gehören, in der
 * der User weiterhin Mitglied ist, bleiben erhalten.
 */
export async function removeOrgDiscordRoles(
  userId: string,
  orgId: string,
): Promise<{ removed: string[]; error: string | null }> {
  const discordUserId = await discordIdOf(userId);
  const mappings = await mappedRolesForOrg(orgId);
  if (!discordUserId || mappings.length === 0) return { removed: [], error: null };

  // Rollen, die der User über eine andere (noch bestehende) Mitgliedschaft behält
  const { data: otherOrgs } = await supabaseAdmin
    .from("org_members")
    .select("org_id")
    .eq("user_id", userId)
    .neq("org_id", orgId);
  const keep = new Set<string>();
  for (const o of otherOrgs ?? []) {
    for (const m of await mappedRolesForOrg(o.org_id as string)) {
      keep.add(m.discord_role_id as string);
    }
  }

  const { setMemberRole } = await import("@/lib/discord.server");
  const removed: string[] = [];
  let error: string | null = null;
  for (const m of mappings) {
    const roleId = m.discord_role_id as string;
    if (keep.has(roleId)) continue;
    try {
      await setMemberRole(discordUserId, roleId, false);
      removed.push((m.discord_role_name as string) ?? roleId);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return { removed, error };
}

/**
 * Vergibt die Standard-Discord-Rollen einer Orga (alle freigegebenen ohne
 * Leitungsflag). Wird beim manuellen Hinzufügen im Backoffice genutzt, damit
 * der Login-Check die Mitgliedschaft nicht wieder entfernt.
 */
export async function grantOrgDiscordRoles(
  userId: string,
  orgId: string,
): Promise<{ granted: string[]; error: string | null }> {
  const discordUserId = await discordIdOf(userId);
  const mappings = (await mappedRolesForOrg(orgId)).filter((m) => !m.is_lead);
  if (!discordUserId || mappings.length === 0) return { granted: [], error: null };

  const { setMemberRole } = await import("@/lib/discord.server");
  const granted: string[] = [];
  let error: string | null = null;
  for (const m of mappings) {
    try {
      await setMemberRole(discordUserId, m.discord_role_id as string, true);
      granted.push((m.discord_role_name as string) ?? (m.discord_role_id as string));
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return { granted, error };
}
