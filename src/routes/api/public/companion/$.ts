import { createFileRoute } from "@tanstack/react-router";
import { handleCompanion } from "@/lib/companion/api.server";

// Desktop companion API (pairing, Game.log ingest, overlay data).
const handle = ({ request, params }: { request: Request; params: Record<string, string | undefined> }) =>
  handleCompanion(request, String((params as { _splat?: string })._splat ?? "").replace(/^\/+|\/+$/g, ""));

export const Route = createFileRoute("/api/public/companion/$")({
  server: { handlers: { GET: handle, POST: handle } },
});
