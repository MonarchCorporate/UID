import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditEntryInput = {
  actorUserId?: string | null;
  orgId?: string | null;
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  summary?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Schreibt einen Audit-Eintrag. Bewusst "best effort": ein Fehler beim
 * Protokollieren darf die eigentliche Aktion nie abbrechen.
 */
export async function logAudit(entry: AuditEntryInput): Promise<void> {
  try {
    let actorLabel: string | null = null;
    if (entry.actorUserId) {
      const { data } = await supabaseAdmin
        .from("profiles")
        .select("callsign, display_name")
        .eq("id", entry.actorUserId)
        .maybeSingle();
      actorLabel = data?.display_name || data?.callsign || null;
    }

    await supabaseAdmin.from("audit_log").insert({
      actor_user_id: entry.actorUserId ?? null,
      actor_label: actorLabel,
      org_id: entry.orgId ?? null,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      summary: entry.summary ?? null,
      metadata: (entry.metadata ?? {}) as never,
    });
  } catch (err) {
    console.error("[audit] konnte Eintrag nicht schreiben:", err);
  }
}
