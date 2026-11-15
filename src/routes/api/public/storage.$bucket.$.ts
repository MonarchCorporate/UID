import { createFileRoute } from "@tanstack/react-router";
import { readObject, verifyStorageSignature } from "@/lib/db/storage.server";

// Serves stored files: signed URLs (createSignedUrl) or public-read buckets.
const PUBLIC_READ = new Set(["org-branding"]);

export const Route = createFileRoute("/api/public/storage/$bucket/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const bucket = params.bucket;
        const path = (params as { _splat?: string })._splat ?? "";
        const url = new URL(request.url);
        const exp = Number(url.searchParams.get("exp"));
        const sig = url.searchParams.get("sig") ?? "";
        const signed = !!sig && verifyStorageSignature(bucket, path, exp, sig);
        if (!signed && !PUBLIC_READ.has(bucket)) return new Response("Not found", { status: 404 });
        const obj = await readObject(bucket, path);
        if (!obj) return new Response("Not found", { status: 404 });
        // Files are served from the app's own origin now (Supabase used a
        // separate domain), so never let uploaded content run scripts here.
        const type = obj.content_type ?? "application/octet-stream";
        const safeInline = /^image\/(png|jpe?g|gif|webp|avif)$/i.test(type);
        return new Response(new Uint8Array(obj.content), {
          headers: {
            "content-type": safeInline ? type : "application/octet-stream",
            "content-security-policy": "default-src 'none'; sandbox",
            ...(safeInline ? {} : { "content-disposition": "attachment" }),
            "cache-control": signed ? "private, max-age=3600" : "public, max-age=3600",
            "x-content-type-options": "nosniff",
          },
        });
      },
    },
  },
});
