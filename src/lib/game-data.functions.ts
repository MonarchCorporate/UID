import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { GameVersion, PatchEvent, SourceHealth } from "./game-data.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins dürfen das.");
}

export type DataStatus = {
  version: GameVersion | null;
  sources: SourceHealth[];
  latestPatch: PatchEvent | null;
  history: Pick<PatchEvent, "version" | "detected_at" | "status" | "added" | "before" | "after">[];
  alertChannelId: string | null;
};

/** Datenstand für alle angemeldeten Nutzer: Patch, Quellen, letzter Abgleich. */
export const getDataStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<DataStatus> => {
    const { getSetting, sourceHealth } = await import("./game-data.server");
    const [version, sources, history, alertChannelId] = await Promise.all([
      getSetting<GameVersion>("game_version"),
      sourceHealth(),
      getSetting<PatchEvent[]>("game_patch_history"),
      getSetting<string>("data_alert_channel_id"),
    ]);
    const list = history ?? [];
    return {
      version,
      sources,
      latestPatch: list[0] ?? null,
      history: list.map((e) => ({
        version: e.version,
        detected_at: e.detected_at,
        status: e.status,
        added: e.added,
        before: e.before,
        after: e.after,
      })),
      alertChannelId: alertChannelId ? String(alertChannelId) : null,
    };
  });

/** Admin: Spielversion jetzt prüfen und alle Kataloge sofort abgleichen. */
export const runFullDataSync = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { fetchGameVersion, runPatchSync, setSetting } = await import("./game-data.server");
    const version = await fetchGameVersion();
    await setSetting("game_version", version);
    // Läuft im Hintergrund weiter; der Fortschritt erscheint im Patch-Verlauf.
    void runPatchSync(version).catch((e) => console.error("[game-data] manueller Abgleich", e));
    return { started: true, version };
  });

/** Admin: Text-Channels für Datenwächter-Meldungen. */
export const listDataAlertChannels = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { fetchGuildChannels } = await import("./discord.server");
    const channels = await fetchGuildChannels();
    return channels
      .filter((c) => (c as { type?: number }).type === 0)
      .sort((a, b) => (a.parentName ?? "").localeCompare(b.parentName ?? "") || a.position - b.position)
      .map((c) => ({ id: c.id, name: c.parentName ? `${c.parentName} › #${c.name}` : `#${c.name}` }));
  });

export const setDataAlertChannel = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ channelId: z.string().regex(/^\d{5,25}$/).nullable() }).parse(i))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { setSetting } = await import("./game-data.server");
    await setSetting("data_alert_channel_id", data.channelId ?? "");
    return { ok: true };
  });
