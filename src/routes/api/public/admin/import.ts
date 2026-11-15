import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import process from "node:process";
import { importTables } from "@/lib/db/import.server";

// One-time migration endpoint. Only active while IMPORT_TOKEN is set in the
// server environment; remove the variable after the migration.
export const Route = createFileRoute("/api/public/admin/import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const expected = process.env.IMPORT_TOKEN;
        if (!expected || expected.length < 32) return new Response("Not found", { status: 404 });
        const given = (request.headers.get("authorization") ?? "").replace(/^Bearer /, "");
        if (given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))) {
          return new Response("Unauthorized", { status: 401 });
        }
        const raw = Buffer.from(await request.arrayBuffer());
        const body = request.headers.get("content-encoding") === "gzip" || raw[0] === 0x1f ? gunzipSync(raw) : raw;
        const data = JSON.parse(body.toString("utf8")) as Record<string, Record<string, unknown>[]>;
        const truncate = new URL(request.url).searchParams.get("truncate") === "1";
        try {
          return Response.json({ ok: true, imported: await importTables(data, { truncate }) });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
        }
      },
    },
  },
});
