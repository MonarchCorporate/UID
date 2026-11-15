import { supabaseAdmin } from "@/integrations/supabase/client.server";

const API = "https://discord.com/api/v10";

export function discordConfig() {
  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const botToken = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!clientId || !clientSecret || !botToken || !guildId) {
    throw new Error("Discord ist nicht vollständig konfiguriert.");
  }
  return { clientId, clientSecret, botToken, guildId };
}

export type DiscordRole = {
  id: string;
  name: string;
  color: number;
  position: number;
  managed: boolean;
  permissions?: string;
};

/**
 * Ermittelt den echten Origin der Anfrage – inklusive Proxy-Header, damit
 * hinter CDN/Reverse-Proxy nicht die interne Adresse verwendet wird.
 */
export function requestOrigin(request: Request): string {
  const h = request.headers;
  const forwardedHost = h.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || h.get("host")?.trim();
  const proto =
    h.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    new URL(request.url).protocol.replace(":", "");
  if (host) return `${proto || "https"}://${host}`;
  return new URL(request.url).origin;
}

/**
 * Callback-URL für den OAuth-Flow.
 *
 * Reihenfolge:
 * 1. DISCORD_REDIRECT_URIS (Komma-Liste): passender Eintrag zum aktuellen Origin
 * 2. DISCORD_REDIRECT_URI (feste Vorgabe)
 * 3. automatisch erkannter Origin der Anfrage
 */
export function discordRedirectUri(origin: string): string {
  const list = (process.env.DISCORD_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const match = list.find((uri) => {
    try {
      return new URL(uri).origin === origin;
    } catch {
      return false;
    }
  });
  if (match) return match;
  const override = process.env.DISCORD_REDIRECT_URI?.trim();
  if (override) return override;
  return `${origin}/api/public/auth/discord/callback`;
}

/**
 * Allow-list of origins the OAuth flow may redirect back to.
 * Built from the configured redirect URIs plus the origin of the current
 * request (the app's own domain). Anything else is rejected.
 */
export function allowedOrigins(currentOrigin: string): string[] {
  const out = new Set<string>([currentOrigin]);
  for (const raw of [
    ...(process.env.DISCORD_REDIRECT_URIS ?? "").split(","),
    process.env.DISCORD_REDIRECT_URI ?? "",
  ]) {
    const value = raw.trim();
    if (!value) continue;
    try {
      out.add(new URL(value).origin);
    } catch {
      /* ignore invalid entries */
    }
  }
  return [...out];
}

/** Returns the origin only if it is on the allow-list, otherwise the fallback. */
export function safeRedirectOrigin(candidate: string, currentOrigin: string): string {
  try {
    const origin = new URL(candidate).origin;
    return allowedOrigins(currentOrigin).includes(origin) ? origin : currentOrigin;
  } catch {
    return currentOrigin;
  }
}

async function botFetch(path: string, init?: RequestInit): Promise<Response> {
  const { botToken } = discordConfig();
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${botToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
}

export type BotProfile = {
  id: string;
  username: string;
  avatarUrl: string | null;
  nickname: string | null;
};

/** Current identity of the bot application user plus its server nickname. */
export async function fetchBotProfile(): Promise<BotProfile> {
  const { guildId } = discordConfig();
  const me = await botFetch("/users/@me");
  if (!me.ok) throw new Error(`Bot-Profil konnte nicht gelesen werden (${me.status}).`);
  const body = (await me.json()) as { id: string; username: string; avatar?: string | null };

  let nickname: string | null = null;
  const member = await botFetch(`/guilds/${guildId}/members/@me`);
  if (member.ok) {
    const m = (await member.json()) as { nick?: string | null };
    nickname = m.nick ?? null;
  }

  return {
    id: body.id,
    username: body.username,
    avatarUrl: body.avatar
      ? `https://cdn.discordapp.com/avatars/${body.id}/${body.avatar}.png?size=128`
      : null,
    nickname,
  };
}

/**
 * Updates the bot's global name/avatar and its nickname on the configured guild.
 * `avatarDataUri` must be a data URI (png/jpeg/gif); null leaves the avatar untouched.
 */
export async function updateBotProfile(input: {
  username?: string;
  avatarDataUri?: string | null;
  nickname?: string | null;
}): Promise<BotProfile> {
  const { guildId } = discordConfig();

  const payload: Record<string, unknown> = {};
  if (input.username) payload.username = input.username;
  if (input.avatarDataUri) payload.avatar = input.avatarDataUri;

  if (Object.keys(payload).length > 0) {
    const res = await botFetch("/users/@me", {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(
        res.status === 429
          ? "Discord bremst Namensänderungen aus (max. 2 pro Stunde). Bitte später erneut versuchen."
          : `Bot-Profil konnte nicht gespeichert werden (${res.status}). ${text.slice(0, 200)}`,
      );
    }
  }

  if (input.nickname !== undefined) {
    const res = await botFetch(`/guilds/${guildId}/members/@me`, {
      method: "PATCH",
      body: JSON.stringify({ nick: input.nickname || null }),
    });
    if (!res.ok) {
      throw new Error(
        `Server-Nickname konnte nicht gesetzt werden (${res.status}). Der Bot braucht das Recht „Nickname ändern".`,
      );
    }
  }

  return fetchBotProfile();
}

/** All roles of the central guild, sorted top-down. */
export async function fetchGuildRoles(): Promise<DiscordRole[]> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/roles`);
  if (!res.ok) {
    throw new Error(`Discord-Rollen konnten nicht geladen werden (${res.status}).`);
  }
  const rows = (await res.json()) as DiscordRole[];
  return rows
    .filter((r) => r.name !== "@everyone")
    .sort((a, b) => b.position - a.position)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color ?? 0,
      position: r.position ?? 0,
      managed: !!r.managed,
      permissions: r.permissions ?? "0",
    }));
}

/** Role ids of one member; null when the user is not on the server. */
// Rollen verwalten, Kanäle sehen, Nachrichten senden, Links einbetten,
// Verlauf lesen, @everyone/@here/Rollen erwähnen, Kanäle verwalten
export const BOT_PERMISSIONS = "268666961";

export type DiscordChannel = {
  id: string;
  name: string;
  type: number;
  parentName: string | null;
  parentId: string | null;
  position: number;
};

/** All text-ish channels of the guild (text + announcement), grouped by category. */
export async function fetchGuildChannels(): Promise<DiscordChannel[]> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/channels`);
  if (!res.ok) {
    throw new Error(`Discord-Channels konnten nicht geladen werden (${res.status}).`);
  }
  const rows = (await res.json()) as {
    id: string;
    name: string;
    type: number;
    parent_id?: string | null;
    position?: number;
  }[];
  const categories = new Map(rows.filter((r) => r.type === 4).map((r) => [r.id, r.name]));
  return rows
    .filter((r) => r.type === 0 || r.type === 5)
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      parentName: r.parent_id ? (categories.get(r.parent_id) ?? null) : null,
      parentId: r.parent_id ?? null,
      position: r.position ?? 0,
    }))
    .sort(
      (a, b) =>
        (a.parentName ?? "").localeCompare(b.parentName ?? "") || a.position - b.position,
    );
}

export type DiscordEmbed = {
  title?: string;
  description?: string;
  color?: number;
  url?: string;
  image?: { url: string };
  thumbnail?: { url: string };
  footer?: { text: string };
  timestamp?: string;
  fields?: { name: string; value: string; inline?: boolean }[];
};

/** Posts an embed (plus optional plain content for pings) into a channel. */
export async function postEmbed(
  channelId: string,
  embed: DiscordEmbed,
  content?: string,
): Promise<{ id: string }> {
  const res = await botFetch(`/channels/${channelId}/messages`, {
    method: "POST",
    body: JSON.stringify({
      ...(content ? { content } : {}),
      embeds: [embed],
      allowed_mentions: content
        ? { parse: ["users", "roles", "everyone"] }
        : { parse: [] },
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      res.status === 403
        ? "Der Bot darf in diesem Channel nicht posten. Gib der Bot-Rolle in den Channel-Einstellungen " +
          "die Rechte „Kanal ansehen“, „Nachrichten senden“ und „Links einbetten“ — für Pings zusätzlich " +
          "„@everyone, @here und alle Rollen erwähnen“." +
          (text ? ` (Discord: ${text.slice(0, 160)})` : "")
        : `Nachricht konnte nicht gesendet werden (${res.status}). ${text.slice(0, 200)}`,
    );
  }
  return (await res.json()) as { id: string };
}

/** Replaces an existing bot message. */
export async function editEmbed(
  channelId: string,
  messageId: string,
  embed: DiscordEmbed,
): Promise<void> {
  const res = await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ embeds: [embed] }),
  });
  if (!res.ok) {
    throw new Error(`Nachricht konnte nicht bearbeitet werden (${res.status}).`);
  }
}

/** Deletes a bot message; a missing message counts as success. */
export async function addOwnReaction(
  channelId: string,
  messageId: string,
  emoji: string,
): Promise<void> {
  const res = await botFetch(
    `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(emoji)}/@me`,
    { method: "PUT" },
  );
  if (!res.ok) {
    throw new Error(`Reaktion konnte nicht gesetzt werden (${res.status}).`);
  }
}

export async function deleteMessage(channelId: string, messageId: string): Promise<void> {
  const res = await botFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Nachricht konnte nicht gelöscht werden (${res.status}).`);
  }
}

/** OAuth2 install link that adds the bot to a Discord server. */
export type DiscordCategory = { id: string; name: string; position: number };

/** All category channels (type 4) of the guild. */
export async function fetchGuildCategories(): Promise<DiscordCategory[]> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/channels`);
  if (!res.ok) {
    throw new Error(`Discord-Kategorien konnten nicht geladen werden (${res.status}).`);
  }
  const rows = (await res.json()) as { id: string; name: string; type: number; position?: number }[];
  return rows
    .filter((r) => r.type === 4)
    .map((r) => ({ id: r.id, name: r.name, position: r.position ?? 0 }))
    .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));
}

/** Channels that currently live inside a given category. */
export async function fetchCategoryChannels(categoryId: string): Promise<DiscordChannel[]> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/channels`);
  if (!res.ok) {
    throw new Error(`Discord-Channels konnten nicht geladen werden (${res.status}).`);
  }
  const rows = (await res.json()) as {
    id: string;
    name: string;
    type: number;
    parent_id?: string | null;
    position?: number;
  }[];
  return rows
    .filter((r) => r.parent_id === categoryId && (r.type === 0 || r.type === 2 || r.type === 5))
    .map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      parentName: null,
      parentId: r.parent_id ?? null,
      position: r.position ?? 0,
    }))
    .sort((a, b) => a.type - b.type || a.position - b.position);
}

function channelError(status: number, text: string, action: string): Error {
  if (status === 403) {
    return new Error(
      `Der Bot darf hier keine Kanäle ${action}. Gib der Bot-Rolle das Recht „Kanäle verwalten“ ` +
        "— server- oder kategorieweit." +
        (text ? ` (Discord: ${text.slice(0, 160)})` : ""),
    );
  }
  return new Error(`Kanal konnte nicht ${action} werden (${status}). ${text.slice(0, 200)}`);
}

/**
 * Vollzugriff einer Orga-Leitungsrolle auf Kategorie/Kanal:
 * Kanäle & Rechte verwalten, sehen, schreiben, Threads, Voice inkl. Moderation.
 */
export const LEAD_CHANNEL_ALLOW = (
  1n | // Einladung erstellen
  16n | // Kanäle verwalten
  1024n | // Kanal ansehen
  2048n | // Nachrichten senden
  8192n | // Nachrichten verwalten
  16384n | // Links einbetten
  32768n | // Dateien anhängen
  65536n | // Verlauf lesen
  131072n | // @everyone/@here erwähnen
  1048576n | // Verbinden
  2097152n | // Sprechen
  4194304n | // Mitglieder stummschalten
  8388608n | // Mitglieder taub schalten
  16777216n | // Mitglieder verschieben
  268435456n | // Rollen verwalten
  536870912n | // Webhooks verwalten
  17179869184n | // Threads verwalten
  34359738368n | // Öffentliche Threads erstellen
  68719476736n | // Private Threads erstellen
  274877906944n // In Threads senden
).toString();

type Overwrite = { id: string; type: number; allow: string; deny: string };

/** Ergänzt die Overwrites um Vollrechte der Leitungsrollen (idempotent). */
function mergeLeadOverwrites(base: Overwrite[], leadRoleIds: string[]): Overwrite[] {
  if (!leadRoleIds.length) return base;
  const out = base.filter((o) => !leadRoleIds.includes(o.id));
  for (const id of [...new Set(leadRoleIds)]) {
    out.push({ id, type: 0, allow: LEAD_CHANNEL_ALLOW, deny: "0" });
  }
  return out;
}

/**
 * Creates a category (type 4) in the guild, optionally private for given roles.
 */
export async function createGuildCategory(input: {
  name: string;
  visibility: "public" | "private";
  roleIds: string[];
  leadRoleIds?: string[];
}): Promise<{ id: string; name: string }> {
  const { guildId } = discordConfig();
  const VIEW_CHANNEL = "1024";
  const overwrites =
    input.visibility === "private"
      ? [
          { id: guildId, type: 0, allow: "0", deny: VIEW_CHANNEL },
          ...input.roleIds.map((id) => ({ id, type: 0, allow: VIEW_CHANNEL, deny: "0" })),
        ]
      : [];
  const all = mergeLeadOverwrites(overwrites, input.leadRoleIds ?? []);
  const res = await botFetch(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      type: 4,
      ...(all.length ? { permission_overwrites: all } : {}),
    }),
  });
  if (!res.ok) {
    throw channelError(res.status, await res.text().catch(() => ""), "anlegen");
  }
  return (await res.json()) as { id: string; name: string };
}

/** Creates a text or voice channel inside a category. */
export async function createGuildChannel(input: {
  name: string;
  parentId: string;
  kind: "text" | "voice";
  topic?: string | null;
  leadRoleIds?: string[];
}): Promise<{ id: string; name: string }> {
  const { guildId } = discordConfig();
  const lead = mergeLeadOverwrites([], input.leadRoleIds ?? []);
  const res = await botFetch(`/guilds/${guildId}/channels`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      type: input.kind === "voice" ? 2 : 0,
      parent_id: input.parentId,
      ...(lead.length ? { permission_overwrites: lead } : {}),
      ...(input.kind === "text" && input.topic ? { topic: input.topic } : {}),
    }),
  });
  if (!res.ok) {
    throw channelError(res.status, await res.text().catch(() => ""), "anlegen");
  }
  return (await res.json()) as { id: string; name: string };
}

/** Renames an existing channel. */
/**
 * Sets the channel visibility: "public" removes the @everyone deny,
 * "private" hides the channel from @everyone and allows the given roles.
 */
export async function applyChannelVisibility(
  channelId: string,
  visibility: "public" | "private",
  roleIds: string[],
  leadRoleIds: string[] = [],
): Promise<void> {
  const { guildId } = discordConfig();
  const VIEW_CHANNEL = "1024";
  const overwrites =
    visibility === "private"
      ? [
          { id: guildId, type: 0, allow: "0", deny: VIEW_CHANNEL },
          ...roleIds.map((id) => ({ id, type: 0, allow: VIEW_CHANNEL, deny: "0" })),
        ]
      : [];
  const res = await botFetch(`/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify({
      permission_overwrites: mergeLeadOverwrites(overwrites, leadRoleIds),
    }),
  });
  if (!res.ok) {
    throw channelError(
      res.status,
      await res.text().catch(() => ""),
      "in ihren Rechten ändern",
    );
  }
}

/**
 * Trägt die Leitungsrollen mit Vollrechten in eine bestehende Kategorie ein,
 * ohne andere Overwrites zu verlieren. Entfernt Rollen, die keine Leitung
 * mehr sind, aus den vom Bot gesetzten Vollrechten.
 */
export async function applyLeadPermissions(
  channelId: string,
  leadRoleIds: string[],
): Promise<void> {
  const res = await botFetch(`/channels/${channelId}`);
  if (!res.ok) {
    throw channelError(await Promise.resolve(res.status), "", "auslesen");
  }
  const ch = (await res.json()) as { permission_overwrites?: Overwrite[] };
  const existing = (ch.permission_overwrites ?? []).filter(
    (o) => !(o.type === 0 && o.allow === LEAD_CHANNEL_ALLOW),
  );
  const patch = await botFetch(`/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify({
      permission_overwrites: mergeLeadOverwrites(existing, leadRoleIds),
    }),
  });
  if (!patch.ok) {
    throw channelError(
      patch.status,
      await patch.text().catch(() => ""),
      "in ihren Rechten ändern",
    );
  }
}

export async function renameGuildChannel(channelId: string, name: string): Promise<void> {
  const res = await botFetch(`/channels/${channelId}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    throw channelError(res.status, await res.text().catch(() => ""), "umbenennen");
  }
}

/** Deletes a channel; a missing channel counts as success. */
export async function deleteGuildChannel(channelId: string): Promise<void> {
  const res = await botFetch(`/channels/${channelId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw channelError(res.status, await res.text().catch(() => ""), "löschen");
  }
}

export function botInviteUrl(guildId?: string) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) throw new Error("DISCORD_CLIENT_ID fehlt.");
  const params = new URLSearchParams({
    client_id: clientId,
    scope: "bot applications.commands",
    permissions: BOT_PERMISSIONS,
  });
  if (guildId) {
    params.set("guild_id", guildId);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export type BotStatus = {
  botName: string | null;
  onGuild: boolean;
  guildName: string | null;
  canManageRoles: boolean;
  message: string | null;
};

/** Checks whether the bot is on the configured guild and has the needed rights. */
export async function fetchBotStatus(): Promise<BotStatus> {
  const { guildId } = discordConfig();
  const status: BotStatus = {
    botName: null,
    onGuild: false,
    guildName: null,
    canManageRoles: false,
    message: null,
  };

  const me = await botFetch("/users/@me");
  if (!me.ok) {
    status.message = `Bot-Token ungültig (${me.status}).`;
    return status;
  }
  const meBody = (await me.json()) as { username?: string };
  status.botName = meBody.username ?? null;

  const guild = await botFetch(`/guilds/${guildId}`);
  if (guild.status === 404 || guild.status === 403) {
    status.message = "Der Bot ist noch nicht auf diesem Server.";
    return status;
  }
  if (!guild.ok) {
    status.message = `Server konnte nicht gelesen werden (${guild.status}).`;
    return status;
  }
  const guildBody = (await guild.json()) as { name?: string };
  status.onGuild = true;
  status.guildName = guildBody.name ?? null;

  const member = await botFetch(`/guilds/${guildId}/members/@me`);
  if (member.ok) {
    const roles = await fetchGuildRoles().catch(() => []);
    const body = (await member.json()) as { roles?: string[] };
    const mine = new Set(body.roles ?? []);
    status.canManageRoles = roles.some(
      (r) => mine.has(r.id) && (BigInt(r.permissions ?? "0") & 268435456n) !== 0n,
    );
    if (!status.canManageRoles) {
      status.message = "Der Bot hat keine Berechtigung „Rollen verwalten“.";
    }
  }
  return status;
}

export async function fetchMemberRoles(discordUserId: string): Promise<string[] | null> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/members/${discordUserId}`);
  if (res.status === 404) return null;
  if (!res.ok) {
    throw new Error(`Discord-Mitglied konnte nicht gelesen werden (${res.status}).`);
  }
  const body = (await res.json()) as { roles?: string[] };
  return body.roles ?? [];
}

export type DiscordProfile = {
  id: string;
  username: string;
  email: string | null;
  avatarUrl: string | null;
};

/** OAuth code -> Discord user profile. */
export async function exchangeCodeForProfile(
  code: string,
  redirectUri: string,
): Promise<DiscordProfile> {
  const { clientId, clientSecret } = discordConfig();
  const tokenRes = await fetch(`${API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });
  if (!tokenRes.ok) {
    const detail = await tokenRes.text().catch(() => "");
    console.error("[discord] token exchange failed", tokenRes.status, detail, redirectUri);
    throw new Error(
      `Discord-Anmeldung fehlgeschlagen (Token ${tokenRes.status}): ${detail.slice(0, 200)}`,
    );
  }
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error("Discord-Anmeldung fehlgeschlagen (kein Token).");

  const meRes = await fetch(`${API}/users/@me`, {
    headers: { Authorization: `Bearer ${token.access_token}` },
  });
  if (!meRes.ok) throw new Error("Discord-Profil konnte nicht gelesen werden.");
  const me = (await meRes.json()) as {
    id: string;
    username: string;
    global_name?: string | null;
    email?: string | null;
    avatar?: string | null;
  };
  return {
    id: me.id,
    username: me.global_name || me.username,
    email: me.email ?? null,
    avatarUrl: me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=128`
      : null,
  };
}

export type SyncResult = {
  added: string[];
  removed: string[];
  onServer: boolean;
  /** true, wenn mindestens eine gemappte Discord-Rolle vorhanden ist */
  hasMappedRole: boolean;
};

/** Einladungslink zum zentralen Discord-Server. */
export const DISCORD_INVITE_URL =
  process.env.DISCORD_INVITE_URL?.trim() || "https://discord.gg/QMvCtbjyqe";

/**
 * Applies the configured Discord-role -> org mappings to one user.
 * Only membership is touched; roles and permissions granted inside the
 * backoffice are never overwritten.
 */
export async function syncMembershipsForUser(
  userId: string,
  discordUserId: string,
): Promise<SyncResult> {
  const roles = await fetchMemberRoles(discordUserId);
  if (roles === null) {
    await supabaseAdmin
      .from("profiles")
      .update({ discord_synced_at: new Date().toISOString() })
      .eq("id", userId);
    return { added: [], removed: [], onServer: false, hasMappedRole: false };
  }

  const { data: mappings } = await supabaseAdmin
    .from("discord_role_mappings")
    .select("discord_role_id, org_id, enabled")
    .eq("enabled", true);
  const active = mappings ?? [];

  const targetOrgIds = new Set(
    active.filter((m) => roles.includes(m.discord_role_id)).map((m) => m.org_id),
  );
  const mappedOrgIds = new Set(active.map((m) => m.org_id));

  const { data: existing } = await supabaseAdmin
    .from("org_members")
    .select("org_id, role")
    .eq("user_id", userId);
  const current = existing ?? [];
  const currentIds = new Set(current.map((m) => m.org_id));

  const toAdd = [...targetOrgIds].filter((id) => !currentIds.has(id));
  if (toAdd.length) {
    await supabaseAdmin
      .from("org_members")
      .upsert(
        toAdd.map((org_id) => ({ org_id, user_id: userId, role: "member" as const })),
        { onConflict: "org_id,user_id" },
      );
  }

  // Die Zuordnung bleibt bestehen, solange die verknüpfte Discord-Rolle da ist.
  // Fällt die Rolle weg, wird die Mitgliedschaft beim Login entfernt.
  // Eigentümer/Officer & Orgas ohne Rollen-Mapping bleiben unangetastet.
  const toRemove = current
    .filter(
      (m) => m.role === "member" && mappedOrgIds.has(m.org_id) && !targetOrgIds.has(m.org_id),
    )
    .map((m) => m.org_id);
  for (const orgId of toRemove) {
    await supabaseAdmin
      .from("org_members")
      .delete()
      .eq("user_id", userId)
      .eq("org_id", orgId);
  }

  await supabaseAdmin
    .from("profiles")
    .update({ discord_synced_at: new Date().toISOString() })
    .eq("id", userId);

  return {
    added: toAdd,
    removed: toRemove,
    onServer: true,
    hasMappedRole: targetOrgIds.size > 0,
  };
}

/* ------------------------------------------------------------------ *
 * Rollenverwaltung (anlegen / bearbeiten / löschen / vergeben)
 * ------------------------------------------------------------------ */

/** Höchste Position der Bot-Rollen – der Bot kann nur darunter verwalten. */
export async function botHighestRolePosition(): Promise<number> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/members/@me`);
  if (!res.ok) return 0;
  const body = (await res.json()) as { roles?: string[] };
  const mine = new Set(body.roles ?? []);
  const roles = await fetchGuildRoles().catch(() => [] as DiscordRole[]);
  return roles.reduce((max, r) => (mine.has(r.id) ? Math.max(max, r.position) : max), 0);
}

function roleError(status: number, text: string, action: string): Error {
  if (status === 403) {
    return new Error(
      `${action} nicht möglich: Dem Bot fehlt das Recht „Rollen verwalten“, oder die Rolle steht über der Bot-Rolle. Schiebe die Bot-Rolle in Discord weiter nach oben.`,
    );
  }
  return new Error(`${action} fehlgeschlagen (${status}). ${text.slice(0, 200)}`);
}

export async function createGuildRole(input: {
  name: string;
  color: number;
  hoist: boolean;
  mentionable: boolean;
}): Promise<DiscordRole> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/roles`, {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      color: input.color,
      hoist: input.hoist,
      mentionable: input.mentionable,
      permissions: "0",
    }),
  });
  if (!res.ok) {
    throw roleError(res.status, await res.text().catch(() => ""), "Rolle anlegen");
  }
  return (await res.json()) as DiscordRole;
}

export async function updateGuildRole(
  roleId: string,
  patch: { name?: string; color?: number; hoist?: boolean; mentionable?: boolean },
): Promise<DiscordRole> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/roles/${roleId}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw roleError(res.status, await res.text().catch(() => ""), "Rolle bearbeiten");
  }
  return (await res.json()) as DiscordRole;
}

export async function deleteGuildRole(roleId: string): Promise<void> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/roles/${roleId}`, { method: "DELETE" });
  if (!res.ok && res.status !== 404) {
    throw roleError(res.status, await res.text().catch(() => ""), "Rolle löschen");
  }
}

/** Setzt den Server-Nicknamen eines Mitglieds. */
export async function setMemberNickname(
  discordUserId: string,
  nickname: string | null,
): Promise<void> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/members/${discordUserId}`, {
    method: "PATCH",
    body: JSON.stringify({ nick: nickname || null }),
  });
  if (res.status === 404) {
    throw new Error("Dieses Mitglied ist nicht auf dem Discord-Server.");
  }
  if (!res.ok) {
    throw roleError(res.status, await res.text().catch(() => ""), "Nickname setzen");
  }
}

/** Weist einem Discord-Mitglied eine Rolle zu oder entzieht sie. */
export async function setMemberRole(
  discordUserId: string,
  roleId: string,
  add: boolean,
): Promise<void> {
  const { guildId } = discordConfig();
  const res = await botFetch(`/guilds/${guildId}/members/${discordUserId}/roles/${roleId}`, {
    method: add ? "PUT" : "DELETE",
  });
  if (res.status === 404) {
    throw new Error("Dieses Mitglied ist nicht auf dem Discord-Server.");
  }
  if (!res.ok) {
    throw roleError(
      res.status,
      await res.text().catch(() => ""),
      add ? "Rolle vergeben" : "Rolle entziehen",
    );
  }
}
