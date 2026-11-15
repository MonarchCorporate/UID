/**
 * Shared-secret authentication for /api/public/hooks/* endpoints.
 * Expects `Authorization: Bearer <HOOK_SECRET>` matching the env var.
 * Returns a Response on failure (call site should early-return it), or null on success.
 */
export function checkHookSecret(request: Request): Response | null {
  const expected = process.env.HOOK_SECRET;
  if (!expected) {
    return Response.json(
      { ok: false, error: "HOOK_SECRET is not configured on the server." },
      { status: 503 },
    );
  }
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  if (!token || token.length !== expected.length) {
    return new Response("Unauthorized", { status: 401 });
  }
  // constant-time compare
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  if (diff !== 0) return new Response("Unauthorized", { status: 401 });
  return null;
}