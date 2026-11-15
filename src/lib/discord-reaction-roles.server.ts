/**
 * Reaktions-Rollen: Der Bot postet eine Admin-Nachricht, Mitglieder reagieren
 * mit einem konfigurierten Emoji und erhalten damit automatisch eine Rolle.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

export type ReactionRoleOption = {
  emoji: string;
  role_id: string;
  role_name: string;
  description?: string | null;
};

export function parseOptions(raw: unknown): ReactionRoleOption[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((o) => o as ReactionRoleOption)
    .filter((o) => o && typeof o.emoji === "string" && typeof o.role_id === "string");
}

/** Nachrichten-IDs + erlaubte Emojis, damit der Bot Fremdreaktionen entfernt. */
export async function reactionRolePanelsForBot(admin: Admin) {
  const { data } = await admin
    .from("discord_reaction_role_panels")
    .select("message_id, options")
    .not("message_id", "is", null)
    .limit(100);
  return (data ?? []).map((p) => ({
    message_id: p.message_id as string,
    emojis: parseOptions(p.options).map((o) => o.emoji),
  }));
}

/** Vergibt bzw. entzieht die zum Emoji hinterlegte Rolle. */
export async function applyReactionRole(
  admin: Admin,
  messageId: string,
  emoji: string,
  discordUserId: string,
  add: boolean,
): Promise<{ ok: boolean; unknown?: boolean }> {
  const { data: panel } = await admin
    .from("discord_reaction_role_panels")
    .select("id, options")
    .eq("message_id", messageId)
    .maybeSingle();
  if (!panel) return { ok: false };
  const option = parseOptions(panel.options).find((o) => o.emoji === emoji);
  if (!option) return { ok: false, unknown: true };
  const { setMemberRole } = await import("@/lib/discord.server");
  await setMemberRole(discordUserId, option.role_id, add);
  return { ok: true };
}
