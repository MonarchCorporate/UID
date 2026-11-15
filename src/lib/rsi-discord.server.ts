import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SETTINGS_KEY = "rsi_verify_discord";

export type RsiVerifyDiscordSettings = {
  /** Discord-Nickname auf den RSI-Handle setzen. */
  renameEnabled: boolean;
  /** Rolle vergeben, wenn RSI verifiziert wurde. */
  roleEnabled: boolean;
  /** Discord-Rollen-ID für "Verifiziert". */
  roleId: string | null;
};

const DEFAULTS: RsiVerifyDiscordSettings = {
  renameEnabled: true,
  roleEnabled: true,
  roleId: null,
};

export async function loadRsiVerifySettings(): Promise<RsiVerifyDiscordSettings> {
  const { data } = await supabaseAdmin
    .from("app_settings")
    .select("value")
    .eq("key", SETTINGS_KEY)
    .maybeSingle();
  if (!data?.value) return DEFAULTS;
  try {
    const parsed = JSON.parse(data.value) as Partial<RsiVerifyDiscordSettings>;
    return {
      renameEnabled: parsed.renameEnabled ?? DEFAULTS.renameEnabled,
      roleEnabled: parsed.roleEnabled ?? DEFAULTS.roleEnabled,
      roleId: parsed.roleId ?? null,
    };
  } catch {
    return DEFAULTS;
  }
}

export async function saveRsiVerifySettings(
  input: RsiVerifyDiscordSettings,
): Promise<RsiVerifyDiscordSettings> {
  const { error } = await supabaseAdmin.from("app_settings").upsert({
    key: SETTINGS_KEY,
    value: JSON.stringify(input),
    updated_at: new Date().toISOString(),
  });
  if (error) throw new Error(error.message);
  return input;
}

/**
 * Wendet die konfigurierten Discord-Aktionen nach erfolgreicher
 * RSI-Verifizierung an: Umbenennen auf den Handle + "Verifiziert"-Rolle.
 */
export async function applyRsiVerifiedDiscord(
  userId: string,
  handle: string,
): Promise<{ renamed: boolean; roleGranted: boolean; error: string | null }> {
  const settings = await loadRsiVerifySettings();
  if (!settings.renameEnabled && !settings.roleEnabled) {
    return { renamed: false, roleGranted: false, error: null };
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("discord_user_id")
    .eq("id", userId)
    .maybeSingle();
  const discordUserId = (profile?.discord_user_id as string | null) ?? null;
  if (!discordUserId) return { renamed: false, roleGranted: false, error: null };

  const { setMemberNickname, setMemberRole } = await import("./discord.server");
  let renamed = false;
  let roleGranted = false;
  let error: string | null = null;

  if (settings.renameEnabled) {
    try {
      await setMemberNickname(discordUserId, handle.slice(0, 32));
      renamed = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  if (settings.roleEnabled && settings.roleId) {
    try {
      await setMemberRole(discordUserId, settings.roleId, true);
      roleGranted = true;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
  }
  return { renamed, roleGranted, error };
}
