import { createFileRoute } from "@tanstack/react-router";
import { verifyMagicToken } from "@/lib/db/auth.server";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

// Exchanges the one-time token from the Discord login callback for a session.
export const Route = createFileRoute("/api/public/auth/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { token_hash?: string };
        if (!body.token_hash || typeof body.token_hash !== "string") return json({ error: "token_hash fehlt" }, 400);
        try {
          return json(await verifyMagicToken(body.token_hash));
        } catch (e) {
          const err = e as { message?: string; status?: number };
          return json({ error: err.message ?? "Anmeldung fehlgeschlagen" }, err.status ?? 400);
        }
      },
    },
  },
});
