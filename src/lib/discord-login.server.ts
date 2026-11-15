import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DiscordProfile } from "./discord.server";

export type LoginLink = { userId: string; tokenHash: string };

/**
 * Maps a Discord profile onto a backoffice account and returns a one-time
 * token hash the browser can exchange for a session.
 */
export async function resolveDiscordLogin(profile: DiscordProfile): Promise<LoginLink> {
  if (!profile.email) {
    throw new Error(
      "Dein Discord-Konto hat keine bestätigte E-Mail-Adresse – Anmeldung nicht möglich.",
    );
  }
  const email = profile.email.toLowerCase();

  // 1) known Discord identity?
  const { data: byDiscord } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("discord_user_id", profile.id)
    .maybeSingle();

  let userId = byDiscord?.id ?? null;

  // 2) otherwise: existing account with that email, else create one
  let link = await generateMagicLink(email);
  if (!link) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        callsign: profile.username,
        display_name: profile.username,
        avatar_url: profile.avatarUrl,
      },
    });
    if (error || !created?.user) {
      throw new Error(error?.message ?? "Konto konnte nicht angelegt werden.");
    }
    userId = created.user.id;
    link = await generateMagicLink(email);
    if (!link) throw new Error("Anmeldelink konnte nicht erstellt werden.");
  }
  userId = userId ?? link.userId;

  await supabaseAdmin
    .from("profiles")
    .update({
      discord_user_id: profile.id,
      discord_username: profile.username,
    })
    .eq("id", userId);

  return { userId, tokenHash: link.tokenHash };
}

async function generateMagicLink(
  email: string,
): Promise<{ userId: string; tokenHash: string } | null> {
  const { data, error } = await supabaseAdmin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data?.properties?.hashed_token) return null;
  return {
    userId: data.user?.id ?? "",
    tokenHash: data.properties.hashed_token,
  };
}
