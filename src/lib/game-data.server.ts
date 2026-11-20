// Patch-Wächter und Daten-Gesundheit.
//
// - Prüft stündlich die aktuelle Spielversion (Star-Citizen-Wiki + UEX).
// - Sobald das Wiki Daten für einen neuen Patch liefert, laufen alle
//   Katalog-Syncs sofort nacheinander im Server (nicht über HTTP, damit
//   kein Gateway-Timeout dazwischenfunkt). Was neu dazugekommen ist, wird
//   als Patch-Eintrag gespeichert und im Backoffice angezeigt.
// - Prüft stündlich, ob jede Quelle frisch ist, und meldet Ausfälle per
//   Discord-Bot in den eingestellten Admin-Channel.
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "@/lib/db/pool.server";

const WIKI_VERSION_URL = "https://api.star-citizen.wiki/api/game-versions/default";
const UEX_VERSION_URL = "https://api.uexcorp.space/2.0/game_versions";

export type GameVersion = {
  live: string | null;
  ptu: string | null;
  wiki_code: string | null;
  wiki_released_at: string | null;
  checked_at: string;
};

export type PatchEvent = {
  version: string;
  wiki_code: string | null;
  detected_at: string;
  finished_at: string | null;
  status: "running" | "done" | "failed";
  steps: { key: string; label: string; ok: boolean; note?: string; ms: number }[];
  before: Record<string, number>;
  after: Record<string, number>;
  added: { ships: string[]; components: string[]; blueprints: string[] };
};

export type SourceHealth = {
  key: string;
  label: string;
  count: number;
  last: string | null;
  stale: boolean;
};

const STALE_HOURS = 36;

// ------------------------------------------------------------ settings ---

export async function getSetting<T>(key: string): Promise<T | null> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT value FROM app_settings WHERE `key` = ?", [key]);
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].value as string) as T;
  } catch {
    return rows[0].value as unknown as T;
  }
}

export async function setSetting(key: string, value: unknown) {
  const v = typeof value === "string" ? value : JSON.stringify(value);
  await getPool().query(
    "INSERT INTO app_settings (`key`, value, updated_at) VALUES (?, ?, UTC_TIMESTAMP(6)) ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)",
    [key, v],
  );
}

// ------------------------------------------------------------- health ---

const SOURCES: { key: string; label: string; sql: string }[] = [
  { key: "ships", label: "Schiffe", sql: "SELECT COUNT(*) n, MAX(synced_at) last FROM ship_catalog" },
  { key: "prices", label: "Schiffspreise", sql: "SELECT COUNT(*) n, MAX(price_synced_at) last FROM ship_catalog" },
  { key: "components", label: "Komponenten", sql: "SELECT COUNT(*) n, MAX(last_synced_at) last FROM ship_components_catalog" },
  { key: "items", label: "Items", sql: "SELECT COUNT(*) n, MAX(last_synced_at) last FROM inventory_item_catalog WHERE source = 'wiki'" },
  { key: "blueprints", label: "Blueprints", sql: "SELECT COUNT(*) n, MAX(updated_at) last FROM blueprints WHERE source = 'wiki'" },
  { key: "loadouts", label: "Standard-Loadouts", sql: "SELECT COUNT(*) n, MAX(updated_at) last FROM ship_stock_loadouts" },
];

const toIso = (v: unknown) => (v ? String(v).replace(" ", "T") + (String(v).includes("+") ? "" : "Z") : null);

export async function sourceHealth(): Promise<SourceHealth[]> {
  const out: SourceHealth[] = [];
  for (const s of SOURCES) {
    const [rows] = await getPool().query<RowDataPacket[]>(s.sql);
    const last = toIso(rows[0]?.last);
    const age = last ? (Date.now() - new Date(last).getTime()) / 3_600_000 : Infinity;
    out.push({ key: s.key, label: s.label, count: Number(rows[0]?.n ?? 0), last, stale: age > STALE_HOURS });
  }
  return out;
}

async function counts(): Promise<Record<string, number>> {
  const h = await sourceHealth();
  return Object.fromEntries(h.filter((x) => x.key !== "prices").map((x) => [x.key, x.count]));
}

// ------------------------------------------------------------ discord ---

async function alert(title: string, description: string, color = 0x22d3ee) {
  const channelId = await getSetting<string>("data_alert_channel_id");
  if (!channelId || !process.env.DISCORD_BOT_TOKEN) return;
  try {
    const { postEmbed } = await import("@/lib/discord.server");
    await postEmbed(String(channelId), {
      title,
      description: description.slice(0, 3900),
      color,
      footer: { text: "UID Backoffice · Datenwächter" },
      timestamp: new Date().toISOString(),
    } as never);
  } catch (e) {
    console.error("[game-data] Discord-Meldung fehlgeschlagen:", e);
  }
}

// ------------------------------------------------------- version check ---

async function fetchJson(url: string) {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res.json();
}

export async function fetchGameVersion(): Promise<GameVersion> {
  const [wiki, uex] = await Promise.allSettled([fetchJson(WIKI_VERSION_URL), fetchJson(UEX_VERSION_URL)]);
  const w = wiki.status === "fulfilled" ? (wiki.value?.data ?? null) : null;
  const u = uex.status === "fulfilled" ? (uex.value?.data ?? null) : null;
  const wikiCode: string | null = w?.code ?? null;
  return {
    live: u?.live ?? (wikiCode ? wikiCode.split("-")[0] : null),
    ptu: u?.ptu ?? null,
    wiki_code: wikiCode,
    wiki_released_at: w?.released_at ?? null,
    checked_at: new Date().toISOString(),
  };
}

let patchRunning = false;

/** Stündlich: neue Spielversion erkennen und bei neuen Wiki-Daten alles synchronisieren. */
export async function checkForNewPatch(opts: { force?: boolean } = {}): Promise<{ changed: boolean; version: GameVersion }> {
  const current = await fetchGameVersion();
  const stored = await getSetting<GameVersion>("game_version");
  await setSetting("game_version", current);

  const wikiChanged = !!current.wiki_code && current.wiki_code !== stored?.wiki_code;
  const liveChanged = !!current.live && current.live !== stored?.live;
  if (!opts.force && (!stored || (!wikiChanged && !liveChanged))) {
    return { changed: false, version: current };
  }
  if (!opts.force && liveChanged && !wikiChanged) {
    // Neuer Patch live, aber das Wiki hat noch keine Daten dafür: nur melden.
    await alert(
      `Patch ${current.live} ist live`,
      `Die Wiki-Daten stehen noch auf ${current.wiki_code ?? "?"}. Sobald sie aktualisiert sind, gleicht das Backoffice alle Kataloge automatisch ab.`,
    );
    return { changed: true, version: current };
  }
  if (patchRunning) return { changed: true, version: current };
  void runPatchSync(current).catch((e) => console.error("[game-data] Patch-Sync fehlgeschlagen", e));
  return { changed: true, version: current };
}

async function newNames(sql: string, since: string): Promise<string[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(sql, [since.replace("T", " ").replace("Z", "")]);
  return rows.map((r) => String(r.name)).filter(Boolean);
}

export async function runPatchSync(version: GameVersion): Promise<PatchEvent> {
  patchRunning = true;
  const detectedAt = new Date().toISOString();
  const event: PatchEvent = {
    version: version.live ?? version.wiki_code ?? "unbekannt",
    wiki_code: version.wiki_code,
    detected_at: detectedAt,
    finished_at: null,
    status: "running",
    steps: [],
    before: await counts(),
    after: {},
    added: { ships: [], components: [], blueprints: [] },
  };
  const history = (await getSetting<PatchEvent[]>("game_patch_history")) ?? [];
  const save = () => setSetting("game_patch_history", [event, ...history].slice(0, 12));
  await save();

  const steps: { key: string; label: string; run: () => Promise<unknown> }[] = [
    { key: "ships", label: "Schiffskatalog", run: async () => (await import("@/lib/ship-catalog.functions")).runShipCatalogSyncAll() },
    { key: "components", label: "Schiffskomponenten", run: async () => (await import("@/lib/ship-components-sync.server")).syncAllShipComponents() },
    { key: "items", label: "Items", run: async () => (await import("@/lib/items-wiki-sync.server")).syncWikiItemsAll() },
    { key: "blueprints", label: "Blueprints & Missionen", run: async () => (await import("@/lib/blueprints-sync.server")).runWikiBlueprintSync() },
    { key: "sccrafter", label: "SCCrafter-Rezepte", run: async () => (await import("@/lib/sccrafter-sync.server")).runSCCrafterSync() },
    { key: "prices", label: "Schiffspreise", run: async () => (await import("@/lib/ship-prices-sync.server")).runShipPriceSync() },
    { key: "loadouts", label: "Standard-Loadouts", run: async () => (await import("@/lib/stock-loadouts-wiki.server")).runStockLoadoutWikiSync({ onlyMissing: false }) },
  ];

  try {
    for (const s of steps) {
      const t0 = Date.now();
      try {
        await s.run();
        event.steps.push({ key: s.key, label: s.label, ok: true, ms: Date.now() - t0 });
      } catch (e) {
        event.steps.push({ key: s.key, label: s.label, ok: false, note: e instanceof Error ? e.message.slice(0, 200) : String(e), ms: Date.now() - t0 });
      }
      await save();
    }
    event.after = await counts();
    event.added = {
      ships: await newNames("SELECT name FROM ship_catalog WHERE created_at >= ? ORDER BY name LIMIT 40", detectedAt),
      components: await newNames("SELECT name FROM ship_components_catalog WHERE created_at >= ? ORDER BY name LIMIT 40", detectedAt),
      blueprints: await newNames("SELECT item_name AS name FROM blueprints WHERE created_at >= ? ORDER BY item_name LIMIT 40", detectedAt),
    };
    event.status = event.steps.every((s) => s.ok) ? "done" : "failed";
  } finally {
    event.finished_at = new Date().toISOString();
    await save();
    patchRunning = false;
  }

  const diff = Object.keys(event.after)
    .map((k) => ({ k, d: (event.after[k] ?? 0) - (event.before[k] ?? 0) }))
    .filter((x) => x.d !== 0)
    .map((x) => `• ${labelFor(x.k)}: ${x.d > 0 ? "+" : ""}${x.d}`)
    .join("\n");
  const failed = event.steps.filter((s) => !s.ok).map((s) => `• ${s.label}: ${s.note}`).join("\n");
  await alert(
    `Daten für Patch ${event.version} übernommen`,
    `${diff || "Keine neuen Einträge."}${event.added.ships.length ? `\n\nNeue Schiffe: ${event.added.ships.slice(0, 12).join(", ")}` : ""}${failed ? `\n\nFehlgeschlagen:\n${failed}` : ""}`,
    failed ? 0xf59e0b : 0x22d3ee,
  );
  return event;
}

function labelFor(key: string) {
  return SOURCES.find((s) => s.key === key)?.label ?? key;
}

/** Stündlich: veraltete Quellen einmal pro Tag melden. */
export async function checkDataHealth() {
  const h = await sourceHealth();
  const stale = h.filter((s) => s.stale);
  if (!stale.length) return { ok: true, stale: [] };
  const lastAlert = await getSetting<string>("data_health_alerted_at");
  if (lastAlert && Date.now() - new Date(lastAlert).getTime() < 20 * 3_600_000) return { ok: false, stale };
  await setSetting("data_health_alerted_at", new Date().toISOString());
  await alert(
    "Datenquellen veraltet",
    stale
      .map((s) => `• ${s.label}: ${s.last ? `zuletzt ${new Date(s.last).toLocaleString("de-DE", { timeZone: "Europe/Berlin" })}` : "noch nie"} aktualisiert`)
      .join("\n") + "\n\nBitte unter Admin → Datenquellen prüfen.",
    0xef4444,
  );
  return { ok: false, stale };
}
