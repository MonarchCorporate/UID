import { createFileRoute } from "@tanstack/react-router";
import { bearerFrom, verifyAccessToken } from "@/lib/db/auth.server";
import { QueryBuilder } from "@/lib/db/query.server";

// PostgREST replacement for the few queries the browser runs directly.
// The query runs with the caller's identity, so the row-level security
// policies apply exactly as they did on Supabase.
const ALLOWED = new Set([
  "select", "insert", "upsert", "update", "delete",
  "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike", "is", "in", "contains", "overlaps",
  "match", "not", "filter", "or", "order", "limit", "range", "single", "maybeSingle",
]);

export const Route = createFileRoute("/api/public/rest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = bearerFrom(request);
        const claims = token ? verifyAccessToken(token) : null;
        if (token && !claims) {
          return Response.json({ data: null, error: { message: "JWT expired", code: "PGRST301", details: null, hint: null } }, { status: 401 });
        }
        const body = (await request.json().catch(() => null)) as { table?: string; calls?: { m: string; a: unknown[] }[] } | null;
        if (!body?.table || !Array.isArray(body.calls)) return Response.json({ error: { message: "bad request" } }, { status: 400 });
        let qb: unknown = new QueryBuilder(body.table, claims ? { kind: "user", userId: claims.sub } : { kind: "anon" });
        for (const c of body.calls) {
          if (!ALLOWED.has(c.m) || !Array.isArray(c.a)) {
            return Response.json({ error: { message: `method ${c.m} not allowed` } }, { status: 400 });
          }
          qb = (qb as Record<string, (...a: unknown[]) => unknown>)[c.m](...c.a);
        }
        const result = await (qb as QueryBuilder);
        return Response.json(result, { status: result.error ? result.status : 200 });
      },
    },
  },
});
