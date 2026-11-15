import { createFileRoute } from "@tanstack/react-router";

const FILENAME_RE = /^[A-Za-z0-9._-]+$/;
const UUID_RE = /^[0-9a-fA-F-]{36}$/;

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
};

export const Route = createFileRoute("/api/public/avatar/$userId/$filename")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { userId, filename } = params;
        if (!UUID_RE.test(userId) || !FILENAME_RE.test(filename)) {
          return new Response("Bad request", { status: 400 });
        }
        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { data, error } = await supabaseAdmin.storage
          .from("avatars")
          .download(`${userId}/${filename}`);
        if (error || !data) return new Response("Not found", { status: 404 });
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
