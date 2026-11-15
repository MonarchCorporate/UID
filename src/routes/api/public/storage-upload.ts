import { createFileRoute } from "@tanstack/react-router";
import { bearerFrom, verifyAccessToken } from "@/lib/db/auth.server";
import { storageBucket } from "@/lib/db/storage.server";

const MAX_BYTES = 10 * 1024 * 1024;

// Browser uploads (e.g. marketplace images). Access is checked against the
// bucket rules for the signed-in user.
export const Route = createFileRoute("/api/public/storage-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const claims = verifyAccessToken(bearerFrom(request));
        if (!claims) return Response.json({ error: { message: "Nicht angemeldet" } }, { status: 401 });
        const form = await request.formData().catch(() => null);
        const file = form?.get("file");
        const bucket = String(form?.get("bucket") ?? "");
        const path = String(form?.get("path") ?? "");
        if (!form || !(file instanceof Blob) || !bucket || !path || path.includes("..")) {
          return Response.json({ error: { message: "Ungültige Anfrage" } }, { status: 400 });
        }
        if (file.size > MAX_BYTES) return Response.json({ error: { message: "Datei zu groß" } }, { status: 413 });
        const result = await storageBucket({ kind: "user", userId: claims.sub }, bucket).upload(path, file, {
          upsert: form.get("upsert") === "true",
          contentType: String(form.get("contentType") || file.type || "application/octet-stream"),
        });
        if (result.error) {
          return Response.json({ error: result.error }, { status: Number(result.error.statusCode) || 400 });
        }
        return Response.json({ data: result.data });
      },
    },
  },
});
