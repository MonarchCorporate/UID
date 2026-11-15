import { getRequest } from "@tanstack/react-start/server";
import { bearerFrom, verifyAccessToken } from "@/lib/db/auth.server";

/**
 * Resolves the calling user's id from the request bearer token, if any.
 * Returns null for anonymous callers. Never trusts a client-supplied user id.
 */
export async function getOptionalUserId(): Promise<string | null> {
  try {
    return verifyAccessToken(bearerFrom(getRequest()))?.sub ?? null;
  } catch {
    return null;
  }
}
