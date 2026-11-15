import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { bearerFrom, verifyAccessToken } from "@/lib/db/auth.server";
import { createDbClient } from "@/lib/db/client.server";

// Verifies the session token sent by attachSupabaseAuth and provides a
// data client that enforces row-level security for this user.
export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const request = getRequest();
  if (!request?.headers) throw new Error("Unauthorized: No request headers available");
  const token = bearerFrom(request);
  if (!token) throw new Error("Unauthorized: No authorization header provided");
  const claims = verifyAccessToken(token);
  if (!claims) throw new Error("Unauthorized: Invalid token");
  if (!claims.sub) throw new Error("Unauthorized: No user ID found in token");
  return next({
    context: {
      supabase: createDbClient({ kind: "user", userId: claims.sub }),
      userId: claims.sub,
      claims,
    },
  });
});
