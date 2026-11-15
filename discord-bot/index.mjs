/**
 * UID Discord Gateway Bot
 * -----------------------
 * Hält eine dauerhafte Gateway-Verbindung (der Bot ist damit "online"),
 * meldet Sprachkanal- und Nachrichten-Ereignisse ans Backoffice und führt
 * die dort in die Warteschlange gelegten Befehle aus.
 *
 * Benötigte Umgebungsvariablen (Railway → Variables):
 *   DISCORD_BOT_TOKEN   Bot-Token aus dem Discord Developer Portal
 *   DISCORD_GUILD_ID    ID des Discord-Servers
 *   BACKOFFICE_URL      z. B. https://uid.sc
 *   HOOK_SECRET         derselbe Wert wie im Backoffice
 * Optional:
 *   TRACK_MESSAGES=true      Nachrichten-Ereignisse mitzählen (nur Metadaten, kein Inhalt)
 *   PRESENCE_TEXT="..."      Startstatus des Bots
 *   HEARTBEAT_SECONDS=30
 */
import {
  Client,
  GatewayIntentBits,
  Partials,
  ActivityType,
  ChannelType,
} from "discord.js";

const VERSION = "1.0.0";
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD_ID = process.env.DISCORD_GUILD_ID;
const BASE = (process.env.BACKOFFICE_URL || "").replace(/\/+$/, "");
const SECRET = process.env.HOOK_SECRET;
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_SECONDS || 30) * 1000;
// Nachrichten- und Reaktions-Tracking ist standardmäßig aktiv (nur Metadaten,
// keine Inhalte). Mit TRACK_MESSAGES=false abschaltbar.
const TRACK_MESSAGES = String(process.env.TRACK_MESSAGES ?? "true").toLowerCase() !== "false";
// Spam-Schutz: Mindestlänge und Cooldown pro Nutzer (in Sekunden).
const MESSAGE_MIN_CHARS = Number(process.env.MESSAGE_MIN_CHARS ?? 10);
const MESSAGE_COOLDOWN_MS = Number(process.env.MESSAGE_COOLDOWN_SECONDS ?? 10) * 1000;

for (const [name, value] of Object.entries({
  DISCORD_BOT_TOKEN: TOKEN,
  DISCORD_GUILD_ID: GUILD_ID,
  BACKOFFICE_URL: BASE,
  HOOK_SECRET: SECRET,
})) {
  if (!value) {
    console.error(`Missing env var: ${name}`);
    process.exit(1);
  }
}

const ENDPOINT = `${BASE}/api/public/hooks/discord-bot`;

console.log(
  `[uid-bot] Nachrichten-/Reaktions-Tracking: ${TRACK_MESSAGES ? "aktiv" : "AUS (TRACK_MESSAGES=false)"}`,
);

async function send(body) {
  try {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${SECRET}`,
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.error("hook error", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    return await res.json();
  } catch (err) {
    console.error("hook request failed", err?.message ?? err);
    return null;
  }
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    // Reaktionen werden immer benötigt (Gewinnspiel-Anmeldung per ✅).
    GatewayIntentBits.GuildMessageReactions,
    ...(TRACK_MESSAGES
      ? [
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.MessageContent,
        ]
      : []),
  ],
  partials: [Partials.GuildMember, Partials.Channel, Partials.Message, Partials.Reaction, Partials.User],
});

/** Nachrichten-IDs laufender Gewinnspiele (vom Backoffice per Heartbeat gemeldet). */
const giveawayMessages = new Set();
const OPT_IN_EMOJI = "✅";
/** message_id -> Set erlaubter Emojis für Reaktions-Rollen. */
const reactionRolePanels = new Map();

/** Einheitlicher Emoji-Schlüssel: Unicode-Zeichen oder "name:id". */
function emojiKey(emoji) {
  return emoji?.id ? `${emoji.name}:${emoji.id}` : (emoji?.name ?? "");
}

function collectActiveVoice(guild) {
  const active = [];
  for (const channel of guild.channels.cache.values()) {
    if (channel.type !== ChannelType.GuildVoice && channel.type !== ChannelType.GuildStageVoice) continue;
    for (const member of channel.members.values()) {
      if (member.user.bot) continue;
      active.push({
        discord_user_id: member.id,
        discord_username: member.user.username,
        channel_id: channel.id,
        channel_name: channel.name,
      });
    }
  }
  return active;
}

async function runCommand(cmd, guild) {
  switch (cmd.command) {
    case "ping":
      return `pong · ${Math.round(client.ws.ping)} ms`;
    case "resync_voice": {
      const active = collectActiveVoice(guild);
      await send({
        action: "heartbeat",
        guild_id: guild.id,
        guild_name: guild.name,
        bot_username: client.user.username,
        version: VERSION,
        member_count: guild.memberCount,
        active_voice: active,
      });
      return `${active.length} aktive Voice-Nutzer abgeglichen`;
    }
    case "set_presence": {
      const text = String(cmd.payload?.text ?? "").slice(0, 100);
      client.user.setPresence({
        status: "online",
        activities: text ? [{ name: text, type: ActivityType.Custom }] : [],
      });
      return `Status gesetzt: ${text || "(leer)"}`;
    }
    case "post_message": {
      const channel = await client.channels.fetch(String(cmd.payload?.channel_id ?? ""));
      if (!channel?.isTextBased()) throw new Error("Kein Textkanal");
      await channel.send(String(cmd.payload?.content ?? "").slice(0, 1900));
      return "Nachricht gesendet";
    }
    case "restart":
      setTimeout(() => process.exit(0), 1500);
      return "Neustart eingeleitet";
    default:
      throw new Error(`Unbekannter Befehl: ${cmd.command}`);
  }
}

client.once("clientReady", async () => {
  console.log(`Logged in as ${client.user.tag}`);
  const presence = process.env.PRESENCE_TEXT;
  client.user.setPresence({
    status: "online",
    activities: presence ? [{ name: presence, type: ActivityType.Custom }] : [],
  });

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.members.fetch().catch(() => {});

  const beat = async () => {
    const g = client.guilds.cache.get(GUILD_ID);
    if (!g) return;
    const res = await send({
      action: "heartbeat",
      guild_id: g.id,
      guild_name: g.name,
      bot_username: client.user.username,
      version: VERSION,
      member_count: g.memberCount,
      active_voice: collectActiveVoice(g),
    });
    for (const cmd of res?.commands ?? []) {
      try {
        const result = await runCommand(cmd, g);
        await send({ action: "command_result", id: cmd.id, status: "done", result });
      } catch (err) {
        await send({
          action: "command_result",
          id: cmd.id,
          status: "error",
          result: String(err?.message ?? err).slice(0, 500),
        });
      }
    }
    if (Array.isArray(res?.giveaway_messages)) {
      giveawayMessages.clear();
      for (const id of res.giveaway_messages) giveawayMessages.add(String(id));
    }
    if (Array.isArray(res?.reaction_role_panels)) {
      reactionRolePanels.clear();
      for (const panel of res.reaction_role_panels) {
        reactionRolePanels.set(
          String(panel.message_id),
          new Set((panel.emojis ?? []).map(String)),
        );
      }
    }
  };

  await beat();
  setInterval(beat, HEARTBEAT_MS);
});

client.on("voiceStateUpdate", async (oldState, newState) => {
  const member = newState.member ?? oldState.member;
  if (!member || member.user.bot) return;
  const guildId = (newState.guild ?? oldState.guild).id;
  const at = new Date().toISOString();

  if (newState.channelId && newState.channelId !== oldState.channelId) {
    await send({
      action: "voice_join",
      guild_id: guildId,
      at,
      entry: {
        discord_user_id: member.id,
        discord_username: member.user.username,
        channel_id: newState.channelId,
        channel_name: newState.channel?.name ?? null,
      },
    });
  } else if (!newState.channelId && oldState.channelId) {
    await send({
      action: "voice_leave",
      guild_id: guildId,
      at,
      discord_user_id: member.id,
    });
  }
});

if (TRACK_MESSAGES) {
  /** discord_user_id -> Zeitstempel der letzten gezählten Nachricht */
  const messageCooldown = new Map();
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;
    const text = (message.content ?? "").trim();
    // Spam-Schutz 1: Mindestanzahl Zeichen
    if (text.length < MESSAGE_MIN_CHARS) return;
    // Spam-Schutz 2: Cooldown pro Nutzer
    const last = messageCooldown.get(message.author.id) ?? 0;
    const now = Date.now();
    if (now - last < MESSAGE_COOLDOWN_MS) return;
    messageCooldown.set(message.author.id, now);
    await send({
      action: "event",
      guild_id: message.guild.id,
      event_type: "message",
      discord_user_id: message.author.id,
      discord_username: message.author.username,
      channel_id: message.channelId,
      channel_name: message.channel?.name ?? null,
      meta: { length: String(text.length), message_id: message.id },
    });
  });

  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (user.bot) return;
      if (reaction.partial) await reaction.fetch();
      const guild = reaction.message.guild;
      if (!guild) return;
      // Reaktionen auf Gewinnspiel-Nachrichten sind Anmeldungen, keine Punkte.
      if (giveawayMessages.has(reaction.message.id)) return;
      // Reaktions-Rollen zählen ebenfalls nicht als Aktivität.
      if (reactionRolePanels.has(reaction.message.id)) return;
      await send({
        action: "event",
        guild_id: guild.id,
        event_type: "reaction",
        discord_user_id: user.id,
        discord_username: user.username ?? null,
        channel_id: reaction.message.channelId,
        channel_name: reaction.message.channel?.name ?? null,
        meta: {
          message_id: reaction.message.id,
          emoji: reaction.emoji?.name ?? reaction.emoji?.id ?? "?",
        },
      });
    } catch (err) {
      console.error("reaction tracking failed", err?.message ?? err);
    }
  });
}

/**
 * Gewinnspiel-Anmeldung: Nur das ✅ zählt. Andere Reaktionen auf der
 * Ankündigung werden sofort wieder entfernt.
 */
client.on("messageReactionAdd", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const messageId = reaction.message.id;
    if (!giveawayMessages.has(messageId)) return;
    const emoji = reaction.emoji?.name ?? "";
    if (emoji !== OPT_IN_EMOJI) {
      await reaction.users.remove(user.id).catch(() => {});
      return;
    }
    await send({
      action: "giveaway_optin",
      guild_id: reaction.message.guild?.id ?? GUILD_ID,
      message_id: messageId,
      discord_user_id: user.id,
      join: true,
    });
  } catch (err) {
    console.error("giveaway opt-in failed", err?.message ?? err);
  }
});

client.on("messageReactionRemove", async (reaction, user) => {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const messageId = reaction.message.id;
    if (!giveawayMessages.has(messageId)) return;
    if ((reaction.emoji?.name ?? "") !== OPT_IN_EMOJI) return;
    await send({
      action: "giveaway_optin",
      guild_id: reaction.message.guild?.id ?? GUILD_ID,
      message_id: messageId,
      discord_user_id: user.id,
      join: false,
    });
  } catch (err) {
    console.error("giveaway opt-out failed", err?.message ?? err);
  }
});

/**
 * Reaktions-Rollen: Reaktion auf einer Admin-Nachricht vergibt bzw. entzieht
 * die hinterlegte Rolle. Nicht konfigurierte Emojis werden entfernt.
 */
async function handleReactionRole(reaction, user, add) {
  try {
    if (user.bot) return;
    if (reaction.partial) await reaction.fetch();
    const messageId = reaction.message.id;
    const allowed = reactionRolePanels.get(messageId);
    if (!allowed) return;
    const key = emojiKey(reaction.emoji);
    if (!allowed.has(key)) {
      if (add) await reaction.users.remove(user.id).catch(() => {});
      return;
    }
    await send({
      action: "reaction_role",
      guild_id: reaction.message.guild?.id ?? GUILD_ID,
      message_id: messageId,
      discord_user_id: user.id,
      emoji: key,
      add,
    });
  } catch (err) {
    console.error("reaction role failed", err?.message ?? err);
  }
}

client.on("messageReactionAdd", (reaction, user) => handleReactionRole(reaction, user, true));
client.on("messageReactionRemove", (reaction, user) => handleReactionRole(reaction, user, false));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await send({ action: "offline" });
    client.destroy();
    process.exit(0);
  });
}

client.login(TOKEN);
/* --------------------------------------------------------------------------
 * RSI-Proxy
 * RSI blockt Anfragen aus Cloudflare-Workern (HTTP 403). Der Bot läuft auf
 * einer normalen Server-IP und kann RSI-Seiten deshalb zuverlässig abrufen.
 * Das Backoffice nutzt diesen Endpunkt (RSI_PROXY_URL + HOOK_SECRET).
 *   GET /rsi?url=https://robertsspaceindustries.com/...   (Bearer HOOK_SECRET)
 * ------------------------------------------------------------------------ */
import http from "node:http";

const PORT = Number(process.env.PORT || 8080);

http
  .createServer(async (req, res) => {
    const reqUrl = new URL(req.url ?? "/", "http://localhost");
    if (reqUrl.pathname === "/health") {
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
      return;
    }
    if (reqUrl.pathname !== "/rsi") {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    const auth = req.headers["authorization"];
    if (auth !== `Bearer ${SECRET}`) {
      res.writeHead(401);
      res.end("unauthorized");
      return;
    }
    const target = reqUrl.searchParams.get("url") ?? "";
    if (!/^https:\/\/robertsspaceindustries\.com\//i.test(target)) {
      res.writeHead(400);
      res.end("bad url");
      return;
    }
    try {
      const upstream = await fetch(target, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      const body = await upstream.text();
      res.writeHead(upstream.status, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    } catch (err) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(err?.message ?? err));
    }
  })
  .listen(PORT, () => console.log(`[uid-bot] RSI-Proxy hört auf Port ${PORT}`));
