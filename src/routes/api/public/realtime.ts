import { createFileRoute } from "@tanstack/react-router";
import { tableVersions } from "@/lib/db/changes.server";
import { TABLES } from "@/lib/db/schema.gen";

// Change counters per table; polled by the browser client (see
// src/integrations/supabase/client.ts) to refresh data after writes.
export const Route = createFileRoute("/api/public/realtime")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const tables = (url.searchParams.get("tables") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter((t) => t && TABLES[t])
          .slice(0, 30);
        return new Response(JSON.stringify(tableVersions(tables)), {
          headers: { "content-type": "application/json", "cache-control": "no-store" },
        });
      },
    },
  },
});
