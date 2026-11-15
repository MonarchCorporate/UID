import { createFileRoute } from "@tanstack/react-router";
import { discordConfig, discordRedirectUri, requestOrigin } from "@/lib/discord.server";

export const Route = createFileRoute("/api/public/auth/discord/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const { clientId } = discordConfig();
          const origin = requestOrigin(request);
          const redirectUri = discordRedirectUri(origin);
          const url = new URL("https://discord.com/oauth2/authorize");
          url.searchParams.set("client_id", clientId);
          url.searchParams.set("response_type", "code");
          url.searchParams.set("redirect_uri", redirectUri);
          url.searchParams.set("scope", "identify email");
          url.searchParams.set("prompt", "consent");
          // Origin mitgeben, damit der Callback auch bei fester
          // Redirect-URI wieder auf die Ausgangsdomain zurückführt.
          // Origin + exakte Redirect-URI mitgeben, damit der Callback
          // denselben Wert beim Token-Tausch verwendet.
          url.searchParams.set("state", btoa(JSON.stringify({ origin, redirectUri })));
          return Response.redirect(url.toString(), 302);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          const origin = requestOrigin(request);
          return Response.redirect(
            `${origin}/auth/discord?error=${encodeURIComponent(message)}`,
            302,
          );
        }
      },
    },
  },
});
