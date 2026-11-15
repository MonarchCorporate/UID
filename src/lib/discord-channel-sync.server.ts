/**
 * Keeps `discord_org_channels` (the per-org allowlist) in sync with the
 * channels that actually exist on the Discord guild.
 *
 * Rules:
 *  - Channels that no longer exist on Discord are removed from the allowlist.
 *  - Renamed channels get their stored name refreshed.
 *  - Text channels inside a category that is assigned to the org are added
 *    automatically (with all mention flags off), so new Discord channels show
 *    up in the org's selectors without a manual admin step.
 */
export async function syncOrgDiscordChannels(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabaseAdmin: any,
  orgId: string,
): Promise<{ synced: boolean; error: string | null }> {
  try {
    const { fetchGuildChannels } = await import("@/lib/discord.server");
    const guild = await fetchGuildChannels();
    const byId = new Map(guild.map((c) => [c.id, c]));

    const [{ data: rows }, { data: cats }] = await Promise.all([
      supabaseAdmin
        .from("discord_org_channels")
        .select("id, channel_id, channel_name")
        .eq("org_id", orgId),
      supabaseAdmin
        .from("discord_org_categories")
        .select("category_id")
        .eq("org_id", orgId),
    ]);

    const existing = (rows ?? []) as { id: string; channel_id: string; channel_name: string }[];

    // 1) drop gone channels
    const gone = existing.filter((r) => !byId.has(r.channel_id)).map((r) => r.id);
    if (gone.length) {
      await supabaseAdmin.from("discord_org_channels").delete().in("id", gone);
    }

    // 2) refresh renamed channels
    for (const r of existing) {
      const live = byId.get(r.channel_id);
      if (live && live.name !== r.channel_name) {
        await supabaseAdmin
          .from("discord_org_channels")
          .update({ channel_name: live.name })
          .eq("id", r.id);
      }
    }

    // 3) add new channels from the org's own categories
    const catIds = new Set(((cats ?? []) as { category_id: string }[]).map((c) => c.category_id));
    if (catIds.size) {
      const known = new Set(existing.map((r) => r.channel_id));
      const additions = guild
        .filter((c) => c.parentId && catIds.has(c.parentId) && !known.has(c.id))
        .map((c) => ({
          org_id: orgId,
          channel_id: c.id,
          channel_name: c.name,
          allow_mentions: false,
          allow_here: false,
          allow_role_mentions: false,
        }));
      if (additions.length) {
        await supabaseAdmin
          .from("discord_org_channels")
          .upsert(additions, { onConflict: "org_id,channel_id" });
      }
    }

    return { synced: true, error: null };
  } catch (err) {
    return { synced: false, error: err instanceof Error ? err.message : String(err) };
  }
}
