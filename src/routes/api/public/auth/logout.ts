import { createFileRoute } from "@tanstack/react-router";
import { revokeRefreshToken } from "@/lib/db/auth.server";

export const Route = createFileRoute("/api/public/auth/logout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { refresh_token?: string };
        if (body.refresh_token) await revokeRefreshToken(body.refresh_token).catch(() => undefined);
        return new Response("{}", { headers: { "content-type": "application/json" } });
      },
    },
  },
});
