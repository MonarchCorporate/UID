import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { logAudit } from "./audit.server";
import { fetchRsiOrganizations, type RsiOrg } from "./rsi-verify.server";

export type OrgAssignment = {
  org_id: string;
  org_name: string;
  sid: string;
  joined: boolean;
  discord_roles: string[];
  discord_error: string | null;
};

/**
 * Ordnet den User anhand der auf RSI gefundenen Orga-SIDs einer Orga im System zu
 * und vergibt die Standard-Discord-Rollen dieser Orga.
 */
export async function assignOrgsFromSids(
  userId: string,
  sids: string[],
): Promise<OrgAssignment[]> {
  if (sids.length === 0) return [];
  const upper = sids.map((s) => String(s).toUpperCase());
  const { data: orgs } = await supabaseAdmin
    .from("orgs")
    .select("id, name, rsi_sid")
    .not("rsi_sid", "is", null)
    .eq("is_active", true);
  const matches = (orgs ?? []).filter((o) =>
    upper.includes(String(o.rsi_sid).toUpperCase()),
  );
  if (matches.length === 0) return [];

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("discord_user_id")
    .eq("id", userId)
    .maybeSingle();
  const discordUserId = (profile?.discord_user_id as string | null) ?? null;

  const out: OrgAssignment[] = [];
  for (const org of matches) {
    const orgId = org.id as string;
    const { data: existing } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();
    let joined = false;
    if (!existing) {
      const { error } = await supabaseAdmin
        .from("org_members")
        .insert({ org_id: orgId, user_id: userId, role: "member" });
      if (!error) joined = true;
    }

    // Standard-Rollen der Orga im Discord vergeben (alle freigegebenen Rollen ohne Leitungsflag)
    const roles: string[] = [];
    let discordError: string | null = null;
    const { data: mappings } = await supabaseAdmin
      .from("discord_role_mappings")
      .select("discord_role_id, discord_role_name, is_lead, enabled")
      .eq("org_id", orgId)
      .eq("enabled", true);
    const defaults = (mappings ?? []).filter((m) => !m.is_lead);
    if (defaults.length > 0) {
      if (!discordUserId) {
        discordError = "Kein Discord-Konto verknüpft.";
      } else {
        const { setMemberRole } = await import("@/lib/discord.server");
        for (const m of defaults) {
          try {
            await setMemberRole(discordUserId, m.discord_role_id as string, true);
            roles.push(
              (m.discord_role_name as string) ?? (m.discord_role_id as string),
            );
          } catch (err) {
            discordError = (err as Error).message;
          }
        }
      }
    }

    await logAudit({
      actorUserId: userId,
      orgId,
      action: "rsi.org_assigned",
      entityType: "org",
      entityId: orgId,
      summary: `Automatische Orga-Zuordnung über RSI-SID ${org.rsi_sid}`,
      metadata: { sid: org.rsi_sid, joined, roles },
    });

    out.push({
      org_id: orgId,
      org_name: org.name as string,
      sid: String(org.rsi_sid).toUpperCase(),
      joined,
      discord_roles: roles,
      discord_error: discordError,
    });
  }
  return out;
}

export type RsiOrgScan = {
  /** Alle auf RSI gefundenen Orgas. */
  found: RsiOrg[];
  /** Orgas, die im Backoffice existieren – inkl. Zuordnungsergebnis. */
  assigned: OrgAssignment[];
  /** Orgas des Spielers, die (noch) nicht Teil der UID sind. */
  unavailable: RsiOrg[];
  sids: string[];
};

/**
 * Liest die RSI-Orga-Seite des Spielers, ordnet ihn allen dort gefundenen
 * UID-Orgas zu (inkl. Discord-Rollen) und meldet die nicht verfügbaren Orgas.
 */
export async function scanAndAssignRsiOrgs(
  userId: string,
  handle: string,
): Promise<RsiOrgScan> {
  let found: RsiOrg[] = [];
  try {
    found = await fetchRsiOrganizations(handle);
  } catch {
    found = [];
  }
  const sids = found.map((o) => o.sid);

  if (sids.length > 0) {
    // Gefundene SIDs am Profil festhalten (für spätere Prüfungen).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("rsi_org_sids")
      .eq("id", userId)
      .maybeSingle();
    const merged = [
      ...new Set([
        ...sids,
        ...(((profile?.rsi_org_sids as string[] | null) ?? []).map((s) =>
          s.toUpperCase(),
        )),
      ]),
    ];
    await supabaseAdmin.from("profiles").update({ rsi_org_sids: merged }).eq("id", userId);
  }

  const assigned = await assignOrgsFromSids(userId, sids);
  const matched = new Set(assigned.map((a) => a.sid));
  const unavailable = found.filter((o) => !matched.has(o.sid));
  return { found, assigned, unavailable, sids };
}