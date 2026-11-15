import { createFileRoute } from "@tanstack/react-router";

const FILENAME_RE = /^[A-Za-z0-9._-]+$/;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

export const Route = createFileRoute(
  "/api/public/org-logo/$orgId/$filename",
)({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { orgId, filename } = params;
        if (!UUID_RE.test(orgId) || !FILENAME_RE.test(filename)) {
          return new Response("Bad request", { status: 400 });
        }
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data, error } = await supabaseAdmin.storage
          .from("org-branding")
          .download(`${orgId}/${filename}`);
        if (error || !data) {
          return new Response("Not found", { status: 404 });
        }
        const ext = (filename.split(".").pop() || "").toLowerCase();
        const contentType =
          (data as Blob).type || MIME_BY_EXT[ext] || "application/octet-stream";
        const buf = await (data as Blob).arrayBuffer();
        return new Response(buf, {
          status: 200,
          headers: {
            "content-type": contentType,
            "cache-control":
              "public, max-age=3600, s-maxage=86400, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});