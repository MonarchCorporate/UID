import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { editEmbed } from "@/lib/discord.server";

type EmbedField = { name: string; value: string; inline?: boolean };
type StoredEmbed = { fields?: EmbedField[] } & Record<string, unknown>;

/**
 * Rewrites the "Angemeldet" field of every Discord announcement that belongs to
 * a mission so the participant count stays in sync. Never throws — a failing
 * Discord call must not break the signup itself.
 */
export async function syncMissionAnnouncements(missionId: string): Promise<void> {
  try {
    const { data: mission } = await supabaseAdmin
      .from("missions")
      .select("id, show_participant_count")
      .eq("id", missionId)
      .maybeSingle();
    if (!mission?.show_participant_count) return;

    const { data: posts } = await supabaseAdmin
      .from("discord_posts")
      .select("id, channel_id, message_id, embed")
      .eq("mission_id", missionId)
      .eq("kind", "event");
    if (!posts?.length) return;

    const { count } = await supabaseAdmin
      .from("mission_participants")
      .select("id", { count: "exact", head: true })
      .eq("mission_id", missionId);
    const value = String(count ?? 0);

    for (const post of posts) {
      const embed = post.embed as StoredEmbed | null;
      if (!embed || !post.message_id) continue;
      const fields = [...(embed.fields ?? [])];
      const idx = fields.findIndex((f) => f.name === "Angemeldet");
      if (idx >= 0) {
        if (fields[idx]!.value === value) continue;
        fields[idx] = { ...fields[idx]!, value };
      } else {
        fields.push({ name: "Angemeldet", value, inline: true });
      }
      const next = { ...embed, fields };
      await editEmbed(post.channel_id, post.message_id, next as never);
      await supabaseAdmin.from("discord_posts").update({ embed: next }).eq("id", post.id);
    }
  } catch (e) {
    console.error("syncMissionAnnouncements failed", e);
  }
}
