import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        search: z.string().trim().max(120).optional(),
        action: z.string().trim().max(80).optional(),
        orgId: z.string().uuid().optional(),
        days: z.number().int().min(1).max(365).optional(),
        limit: z.number().int().min(1).max(500).optional(),
      })
      .default({})
      .parse(input ?? {}),
  )
  .handler(async ({ context, data }) => {
    const { fetchAuditLog } = await import("@/lib/audit-admin.server");
    return fetchAuditLog(context.userId, data);
  });

export const getAccessOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { fetchAccessOverview } = await import("@/lib/audit-admin.server");
    return fetchAccessOverview(context.userId);
  });
