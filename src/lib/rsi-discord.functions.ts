import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur App-Admins dürfen diese Einstellung ändern.");
}

export const getRsiVerifyDiscordSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { loadRsiVerifySettings } = await import("./rsi-discord.server");
    return loadRsiVerifySettings();
  });

export const setRsiVerifyDiscordSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        renameEnabled: z.boolean(),
        roleEnabled: z.boolean(),
        roleId: z.string().nullable(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.supabase, context.userId);
    const { saveRsiVerifySettings } = await import("./rsi-discord.server");
    return saveRsiVerifySettings(data);
  });
