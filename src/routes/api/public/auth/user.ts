import { createFileRoute } from "@tanstack/react-router";
import { bearerFrom, getUserById, verifyAccessToken } from "@/lib/db/auth.server";

export const Route = createFileRoute("/api/public/auth/user")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const claims = verifyAccessToken(bearerFrom(request));
        if (!claims) return new Response(JSON.stringify({ error: "invalid token" }), { status: 401 });
        const user = await getUserById(claims.sub);
        if (!user) return new Response(JSON.stringify({ error: "user not found" }), { status: 404 });
        return new Response(JSON.stringify({ user }), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
