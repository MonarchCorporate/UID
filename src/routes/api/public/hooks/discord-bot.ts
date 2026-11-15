import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { checkHookSecret } from "@/lib/hook-auth.server";

const voiceEntry = z.object({
  discord_user_id: z.string().min(1).max(32),
  discord_username: z.string().max(120).nullish(),
  channel_id: z.string().min(1).max(32),
  channel_name: z.string().max(120).nullish(),
});

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("heartbeat"),
    guild_id: z.string().min(1).max(32),
    guild_name: z.string().max(120).nullish(),
    bot_username: z.string().max(120).nullish(),
    version: z.string().max(40).nullish(),
    member_count: z.number().int().min(0).max(1_000_000).nullish(),
    active_voice: z.array(voiceEntry).max(500).default([]),
  }),
  z.object({
    action: z.literal("voice_join"),
    guild_id: z.string().min(1).max(32),
    at: z.string().datetime().optional(),
    entry: voiceEntry,
  }),
  z.object({
    action: z.literal("voice_leave"),
    guild_id: z.string().min(1).max(32),
    at: z.string().datetime().optional(),
    discord_user_id: z.string().min(1).max(32),
  }),
  z.object({
    action: z.literal("event"),
    guild_id: z.string().min(1).max(32),
    event_type: z.string().min(1).max(40),
    discord_user_id: z.string().min(1).max(32),
    discord_username: z.string().max(120).nullish(),
    channel_id: z.string().max(32).nullish(),
    channel_name: z.string().max(120).nullish(),
    meta: z.record(z.string(), z.unknown()).default({}),
  }),
  z.object({
    action: z.literal("command_result"),
    id: z.string().uuid(),
    status: z.enum(["done", "error"]),
    result: z.string().max(2000).nullish(),
  }),
  z.object({
    action: z.literal("giveaway_optin"),
    guild_id: z.string().min(1).max(32),
    message_id: z.string().min(1).max(32),
    discord_user_id: z.string().min(1).max(32),
    join: z.boolean(),
  }),
  z.object({
    action: z.literal("reaction_role"),
    guild_id: z.string().min(1).max(32),
    message_id: z.string().min(1).max(32),
    discord_user_id: z.string().min(1).max(32),
    emoji: z.string().min(1).max(80),
    add: z.boolean(),
  }),
  z.object({ action: z.literal("offline") }),
]);

export const Route = createFileRoute("/api/public/hooks/discord-bot")({
  server: {
    handlers: {
      GET: async () =>
        Response.json({ ok: true, hint: "POST from the Discord gateway bot" }),
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;

        let parsed;
        try {
          parsed = bodySchema.parse(await request.json());
        } catch (err) {
          return Response.json(
            { ok: false, error: err instanceof Error ? err.message : "Invalid body" },
            { status: 400 },
          );
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const {
          voiceJoin,
          voiceLeave,
          reconcileVoice,
          logActivityEvent,
          claimCommands,
          runningGiveawayMessages,
          setGiveawayOptIn,
        } = await import("@/lib/discord-activity.server");
        const now = new Date().toISOString();

        try {
          switch (parsed.action) {
            case "heartbeat": {
              await reconcileVoice(supabaseAdmin, parsed.guild_id, parsed.active_voice, now);
              await supabaseAdmin.from("discord_bot_status").upsert({
                id: "default",
                online: true,
                bot_username: parsed.bot_username ?? null,
                guild_id: parsed.guild_id,
                guild_name: parsed.guild_name ?? null,
                version: parsed.version ?? null,
                member_count: parsed.member_count ?? null,
                voice_active: parsed.active_voice.length,
                last_heartbeat_at: now,
                updated_at: now,
              });
              const commands = await claimCommands(supabaseAdmin);
              const giveawayMessages = await runningGiveawayMessages(supabaseAdmin);
              const { reactionRolePanelsForBot } = await import(
                "@/lib/discord-reaction-roles.server"
              );
              const reactionRolePanels = await reactionRolePanelsForBot(supabaseAdmin);
              return Response.json({
                ok: true,
                commands,
                giveaway_messages: giveawayMessages,
                reaction_role_panels: reactionRolePanels,
              });
            }
            case "voice_join":
              await voiceJoin(supabaseAdmin, parsed.guild_id, parsed.entry, parsed.at ?? now);
              return Response.json({ ok: true });
            case "voice_leave":
              await voiceLeave(supabaseAdmin, parsed.discord_user_id, parsed.at ?? now);
              return Response.json({ ok: true });
            case "event":
              await logActivityEvent(supabaseAdmin, parsed.guild_id, parsed);
              return Response.json({ ok: true });
            case "giveaway_optin":
              await setGiveawayOptIn(
                supabaseAdmin,
                parsed.message_id,
                parsed.discord_user_id,
                parsed.join,
              );
              return Response.json({ ok: true });
            case "reaction_role": {
              const { applyReactionRole } = await import(
                "@/lib/discord-reaction-roles.server"
              );
              const result = await applyReactionRole(
                supabaseAdmin,
                parsed.message_id,
                parsed.emoji,
                parsed.discord_user_id,
                parsed.add,
              );
              return Response.json({ ...result, ok: true });
            }
            case "command_result":
              await supabaseAdmin
                .from("discord_bot_commands")
                .update({
                  status: parsed.status,
                  result: parsed.result ?? null,
                  done_at: now,
                })
                .eq("id", parsed.id);
              return Response.json({ ok: true });
            case "offline":
              await supabaseAdmin
                .from("discord_bot_status")
                .update({ online: false, updated_at: now })
                .eq("id", "default");
              return Response.json({ ok: true });
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("discord-bot hook error", message);
          return Response.json({ ok: false, error: message }, { status: 500 });
        }
      },
    },
  },
});