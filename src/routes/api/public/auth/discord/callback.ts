import { createFileRoute } from "@tanstack/react-router";
import {
  discordRedirectUri,
  exchangeCodeForProfile,
  requestOrigin,
  safeRedirectOrigin,
  syncMembershipsForUser,
} from "@/lib/discord.server";
import { resolveDiscordLogin } from "@/lib/discord-login.server";

export const Route = createFileRoute("/api/public/auth/discord/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const currentOrigin = requestOrigin(request);
        let origin = currentOrigin;
        let redirectUri: string | null = null;
        const state = url.searchParams.get("state");
        if (state) {
          try {
            const decoded = atob(state);
            if (/^https?:\/\/[^\s]+$/.test(decoded)) {
              origin = safeRedirectOrigin(decoded, currentOrigin);
            } else {
              const parsed = JSON.parse(decoded) as {
                origin?: string;
                redirectUri?: string;
              };
              if (parsed.origin) origin = safeRedirectOrigin(parsed.origin, currentOrigin);
              if (
                parsed.redirectUri &&
                safeRedirectOrigin(parsed.redirectUri, currentOrigin) ===
                  new URL(parsed.redirectUri).origin
              ) {
                redirectUri = parsed.redirectUri;
              }
            }
          } catch {
            /* ungültiger state – aktueller Origin bleibt */
          }
        }
        const fail = (message: string) =>
          Response.redirect(
            `${origin}/auth/discord?error=${encodeURIComponent(message)}`,
            302,
          );
        const code = url.searchParams.get("code");
        if (!code) return fail("Discord hat keinen Anmeldecode geliefert.");

        try {
          const profile = await exchangeCodeForProfile(
            code,
            redirectUri ?? discordRedirectUri(currentOrigin),
          );
          const { userId, tokenHash } = await resolveDiscordLogin(profile);
          try {
            await syncMembershipsForUser(userId, profile.id);
          } catch (syncErr) {
            console.error("[discord] Sync nach Login fehlgeschlagen:", syncErr);
          }
          return Response.redirect(
            `${origin}/auth/discord?token_hash=${encodeURIComponent(tokenHash)}`,
            302,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.error("[discord] callback error", message);
          return fail(message);
        }
      },
    },
  },
});
