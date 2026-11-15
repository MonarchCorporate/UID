import { createFileRoute } from "@tanstack/react-router";
import { refreshSession } from "@/lib/db/auth.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const Route = createFileRoute("/api/public/auth/refresh")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { refresh_token?: string };
        if (!body.refresh_token) return json({ error: "refresh_token fehlt" }, 400);
        try {
          return json(await refreshSession(body.refresh_token));
        } catch (e) {
          const err = e as { message?: string; status?: number };
          return json({ error: err.message ?? "Sitzung abgelaufen" }, err.status ?? 400);
        }
      },
    },
  },
});
