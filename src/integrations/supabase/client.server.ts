// Server-side data client with service role — bypasses row-level security.
// Backed by the MySQL database (see src/lib/db). The name is kept so the
// existing imports keep working.
// SECURITY: only use in trusted server code, never expose to the client.
import { getServiceClient, type DbClient } from "@/lib/db/client.server";

export const supabaseAdmin = new Proxy({} as DbClient, {
  get(_, prop) {
    const c = getServiceClient();
    const v = Reflect.get(c, prop, c);
    return typeof v === "function" ? v.bind(c) : v;
  },
});
