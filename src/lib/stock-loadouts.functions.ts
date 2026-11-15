import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Ein einzelner Standardausrüstungs-Slot laut scunpacked.
 * `category` ist bereits auf unsere UI-Buckets normalisiert.
 */
export type StockLoadoutEntry = {
  category: string;
  port_name: string | null;
  class_name: string;
  size: number | null;
  item_ref: string | null;
  item_name: string | null;
  manufacturer: string | null;
};

export type StockLoadout = {
  ship_slug: string;
  class_name: string;
  loadout: StockLoadoutEntry[];
  fetched_at: string;
};

// Nur diese 7 Buckets werden im Loadout-Editor angezeigt (Erkul-Parität).
export const ALLOWED_STOCK_CATEGORIES = [
  "Weapons",
  "Missile & Bomb Racks",
  "Shield Generators",
  "Radar",
  "Quantum Drives",
  "Power Plants",
  "Coolers",
] as const;

const SCUN_BASE =
  "https://raw.githubusercontent.com/StarCitizenWiki/scunpacked-data/master/ships";

type ScunPort = { ClassName?: string | null; PortName?: string | null };
type ScunLoadoutEntry = {
  ClassName?: string | null;
  HardpointName?: string | null;
  Type?: string | null;
  Editable?: boolean | null;
  EditableChildren?: boolean | null;
  Loadout?: ScunLoadoutEntry[] | null;
};
type ScunShip = {
  ClassName?: string | null;
  PortTags?: string[] | null;
  Systems?: Record<string, { Ports?: ScunPort[] | null } | null> | null;
  Loadout?: ScunLoadoutEntry[] | null;
};

const SYSTEM_TO_CATEGORY: Record<string, string> = {
  Weapons: "Weapons",
  MissileRacks: "Missile & Bomb Racks",
  Shields: "Shield Generators",
  Radars: "Radar",
  QuantumDrives: "Quantum Drives",
  PowerPlants: "Power Plants",
  Coolers: "Coolers",
};

/**
 * Rekursiv `ship.Loadout` durchlaufen und alle ClassNames zurückgeben, deren
 * konkreter Slot laut scunpacked nicht editierbar ist.
 *
 * Wichtig: Ein gesperrter Parent-Port (z.B. ein Idris-Turret-Rahmen) darf nicht
 * automatisch alle darunterliegenden Komponenten als bespoke markieren. Kinder
 * mit `Editable: true` gelten als austauschbar und überschreiben den geerbten
 * Lock. Außerdem zählen interne Bauteile eines selbst austauschbaren PDC/PDS-
 * Turrets nicht als bespoke: scunpacked markiert dort die interne Waffe zwar als
 * `Editable: false`, der spielbare/tauschbare Slot ist aber der Parent-Turret.
 * Dadurch bleiben reguläre Turret-Waffen und PDS wie M2C „Swarm“ frei tauschbar,
 * während echte feste Hersteller-Komponenten weiter erkannt werden.
 */
function isEditablePointDefenseTurret(e: ScunLoadoutEntry): boolean {
  if (e?.Editable !== true) return false;
  const type = String(e?.Type ?? "").toLowerCase();
  const cn = String(e?.ClassName ?? "").toLowerCase();
  return type.includes("pdcturret") || cn.includes("_pdc") || cn.includes("_pds");
}

function collectNonEditableClassNames(
  entries: ScunLoadoutEntry[] | null | undefined,
  inheritedChildrenLocked = false,
  out: Set<string> = new Set(),
  insideEditablePointDefenseTurret = false,
): Set<string> {
  if (!Array.isArray(entries)) return out;
  for (const e of entries) {
    const explicitlyEditable = e?.Editable === true;
    const internalPdsPart = insideEditablePointDefenseTurret;
    const slotLocked =
      !internalPdsPart && (e?.Editable === false || (inheritedChildrenLocked && !explicitlyEditable));
    const cn = typeof e?.ClassName === "string" ? e.ClassName.toLowerCase() : "";
    if (slotLocked && cn) out.add(cn);

    const nextInsideEditablePointDefenseTurret =
      insideEditablePointDefenseTurret || isEditablePointDefenseTurret(e);
    const childrenLocked = nextInsideEditablePointDefenseTurret
      ? false
      : e?.EditableChildren === false || (slotLocked && e?.EditableChildren !== true);
    if (Array.isArray(e?.Loadout) && e!.Loadout!.length > 0) {
      collectNonEditableClassNames(
        e!.Loadout!,
        childrenLocked,
        out,
        nextInsideEditablePointDefenseTurret,
      );
    }
  }
  return out;
}

/**
 * Ausrüstungs-Ports rekursiv aus dem scunpacked-Schiff ziehen.
 *
 * scunpacked liefert sowohl `Systems.<Bucket>.Ports[]` (nur Top-Level-Ports
 * pro Kategorie) als auch `ship.Loadout` (kompletter Baum inkl. Turret-
 * Sub-Waffen und Rack-Munition). Erkul zeigt alle Ebenen — wir walken deshalb
 * den Loadout-Baum und vererben die Kategorie vom Top-Level-Port an dessen
 * Kinder (Turret → Weapons, Rack → Missile & Bomb Racks/Munition).
 */
function extractStockPorts(
  ship: ScunShip,
): Array<{ category: string; class_name: string; port_name: string | null }> {
  const systems = ship.Systems ?? {};
  // 1) Map: PortName (case-insensitive) → Kategorie.
  const portToCategory = new Map<string, string>();
  for (const [sys, category] of Object.entries(SYSTEM_TO_CATEGORY)) {
    const ports = systems[sys]?.Ports ?? [];
    for (const p of ports) {
      const pn = typeof p?.PortName === "string" ? p.PortName.toLowerCase() : "";
      if (pn) portToCategory.set(pn, category);
    }
  }
  const out: Array<{ category: string; class_name: string; port_name: string | null }> = [];
  const seenPorts = new Set<string>();
  function walk(entries: ScunLoadoutEntry[] | null | undefined, parentCategory: string | null) {
    if (!Array.isArray(entries)) return;
    for (const e of entries) {
      const pn = typeof e?.HardpointName === "string" ? e.HardpointName : "";
      const pnKey = pn.toLowerCase();
      // Kategorie: Top-Level via Systems-Map, sonst vom Parent geerbt.
      const cat = (pnKey && portToCategory.get(pnKey)) ?? parentCategory ?? null;
      const cn = typeof e?.ClassName === "string" ? e.ClassName : "";
      if (cat && cn) {
        out.push({ category: cat, class_name: cn, port_name: pn || null });
        if (pnKey) seenPorts.add(pnKey);
      }
      if (Array.isArray(e?.Loadout) && e!.Loadout!.length > 0) {
        walk(e!.Loadout!, cat);
      }
    }
  }
  walk(ship.Loadout ?? [], null);
  // 2) Fallback: Top-Level-Ports aus Systems, die im Loadout-Baum fehlen
  //    (z.B. Schiffe ohne separaten `Loadout`-Block).
  for (const [sys, category] of Object.entries(SYSTEM_TO_CATEGORY)) {
    const ports = systems[sys]?.Ports ?? [];
    for (const p of ports) {
      const cn = p?.ClassName;
      const pn = typeof p?.PortName === "string" ? p.PortName : null;
      if (typeof cn === "string" && cn.length > 0) {
        const key = (pn ?? "").toLowerCase();
        if (!key || !seenPorts.has(key)) {
          out.push({ category, class_name: cn, port_name: pn });
        }
      }
    }
  }
  return out;
}

/**
 * Lädt ein scunpacked-Ship-JSON. `className` sollte dem Dateinamen entsprechen
 * (in scunpacked lowercase, z.B. `aegs_hammerhead`).
 */
async function fetchScunShip(fileName: string): Promise<ScunShip | null> {
  const url = `${SCUN_BASE}/${fileName}.json`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return null;
  return (await res.json()) as ScunShip;
}

function candidateFileNames(shipSlug: string, className: string | null): string[] {
  const s = shipSlug.toLowerCase();
  const set = new Set<string>();
  set.add(s.replace(/-/g, "_"));
  if (className) set.add(className.toLowerCase());
  // Manche Slugs bei uns kürzen "aegis" auf "aegs" — scunpacked auch,
  // dennoch beide Formen probieren.
  set.add(s.replace(/-/g, "_").replace(/^aegis_/, "aegs_"));
  set.add(s.replace(/-/g, "_").replace(/^rsi_/, "rsi_"));
  // Zusatzheuristiken für scunpacked-Dateinamen:
  //   – `mk_ii` / `mk_iii` → `mkii` / `mkiii`
  //   – `_pu_ai_uee_*`-Suffixe (Bengal-Namenskonvention) abschneiden
  //   – Klasse ohne trailing `_*`-Variante testen
  const base = s.replace(/-/g, "_");
  set.add(base.replace(/_mk_ii/g, "_mkii").replace(/_mk_iii/g, "_mkiii"));
  set.add(base.replace(/_mkii/g, "_mk_ii").replace(/_mkiii/g, "_mk_iii"));
  if (className) {
    const lc = className.toLowerCase();
    set.add(lc.replace(/_pu_ai_uee_.*$/i, ""));
    // trailing Variante entfernen (z.B. drak_kraken_privateer → drak_kraken)
    const parts = lc.split("_");
    if (parts.length > 2) set.add(parts.slice(0, -1).join("_"));
  }
  return Array.from(set);
}

// Cache der scunpacked-`ships/`-Dateiliste, damit wir bei Slug-Miss noch
// einen Fuzzy-Match versuchen können, ohne die GitHub-API pro Aufruf zu
// hämmern. Wird nach 30 min automatisch verworfen.
let scunFileIndex: { at: number; files: string[] } | null = null;
async function loadScunFileIndex(): Promise<string[]> {
  const now = Date.now();
  if (scunFileIndex && now - scunFileIndex.at < 30 * 60 * 1000) return scunFileIndex.files;
  try {
    const res = await fetch(
      "https://api.github.com/repos/StarCitizenWiki/scunpacked-data/contents/ships",
      { headers: { accept: "application/vnd.github+json" } },
    );
    if (!res.ok) return scunFileIndex?.files ?? [];
    const list = (await res.json()) as Array<{ name?: string }>;
    const files = list
      .map((e) => (typeof e.name === "string" ? e.name.replace(/\.json$/i, "") : ""))
      .filter((n) => n.length > 0);
    scunFileIndex = { at: now, files };
    return files;
  } catch {
    return scunFileIndex?.files ?? [];
  }
}

/** Fuzzy-Score: Anzahl gemeinsamer aufeinanderfolgender Tokens (`_`-getrennt). */
function fuzzyScore(a: string, b: string): number {
  const at = a.split("_").filter(Boolean);
  const bt = b.split("_").filter(Boolean);
  let hits = 0;
  for (const t of at) if (bt.includes(t)) hits++;
  return hits;
}

/** Beste scunpacked-Datei für einen Slug/Class-Namen finden (oder null). */
async function findScunFileFuzzy(
  shipSlug: string,
  className: string | null,
): Promise<string | null> {
  const files = await loadScunFileIndex();
  if (files.length === 0) return null;
  const needle = (className ?? shipSlug.replace(/-/g, "_")).toLowerCase();
  let best: { name: string; score: number } | null = null;
  for (const f of files) {
    const s = fuzzyScore(needle, f);
    if (s > 0 && (!best || s > best.score)) best = { name: f, score: s };
  }
  // Mindestens 2 gemeinsame Tokens verlangen (z.B. `aegs`+`gladius`).
  return best && best.score >= 2 ? best.name : null;
}

/** Public: Standard-Loadout für ein Schiff lesen. */
export const getStockLoadout = createServerFn({ method: "GET" })
  .inputValidator((input) =>
    z.object({ shipSlug: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data }): Promise<StockLoadout | null> => {
    const { data: row } = await supabaseAdmin
      .from("ship_stock_loadouts")
      .select("ship_slug, class_name, loadout, fetched_at")
      .eq("ship_slug", data.shipSlug)
      .maybeSingle();
    if (!row) return null;
    return {
      ship_slug: row.ship_slug as string,
      class_name: row.class_name as string,
      loadout: (row.loadout ?? []) as StockLoadoutEntry[],
      fetched_at: row.fetched_at as string,
    };
  });

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

/**
 * Ein einzelnes Schiff synchronisieren. Liest scunpacked-JSON, filtert auf die
 * 7 erlaubten Kategorien und resolved jede `ClassName` gegen
 * `ship_components_catalog` (raw->>'class_name') zu `item_ref`/`item_name`.
 */
async function syncOne(
  shipSlug: string,
  className: string | null,
  catalogByClass: Map<string, { item_ref: string; name: string; manufacturer: string | null; size: number | null }>,
): Promise<{ ok: boolean; note: string; unresolved: Array<{ slug: string; class_name: string }> }> {
  const fileNames = candidateFileNames(shipSlug, className);
  let ship: ScunShip | null = null;
  let usedName = "";
  for (const fn of fileNames) {
    ship = await fetchScunShip(fn);
    if (ship) {
      usedName = fn;
      break;
    }
  }
  if (!ship) {
    // Fallback: Fuzzy-Match gegen das gecachte scunpacked-Dateilisting.
    const fuzzy = await findScunFileFuzzy(shipSlug, className);
    if (fuzzy) {
      ship = await fetchScunShip(fuzzy);
      if (ship) usedName = fuzzy;
    }
  }
  if (!ship) return { ok: false, note: "nicht in scunpacked", unresolved: [] };

  const rawEntries = extractStockPorts(ship);
  if (rawEntries.length === 0) return { ok: false, note: "keine Systems.Ports", unresolved: [] };

  const unresolved: Array<{ slug: string; class_name: string }> = [];
  const loadout: StockLoadoutEntry[] = rawEntries.map((e, idx) => {
    // Case-insensitiver Lookup + Suffix-Normalisierung (`_SCItem`).
    const lc = e.class_name.toLowerCase();
    const stripped = lc.replace(/_scitem$/i, "");
    const hit = catalogByClass.get(lc) ?? catalogByClass.get(stripped) ?? null;
    if (!hit) unresolved.push({ slug: shipSlug, class_name: e.class_name });
    return {
      category: e.category,
      port_name: e.port_name ?? `${e.category} ${idx + 1}`,
      class_name: e.class_name,
      size: hit?.size ?? null,
      item_ref: hit?.item_ref ?? null,
      item_name: hit?.name ?? null,
      manufacturer: hit?.manufacturer ?? null,
    };
  });

  const shipClassName = (ship.ClassName as string) ?? usedName;
  const { error } = await supabaseAdmin
    .from("ship_stock_loadouts")
    .upsert(
      {
        ship_slug: shipSlug,
        class_name: shipClassName,
        loadout: loadout as unknown as never,
        source: "scunpacked",
        fetched_at: new Date().toISOString(),
      },
      { onConflict: "ship_slug" },
    );
  if (error) return { ok: false, note: error.message, unresolved };
  const matched = loadout.filter((l) => l.item_ref).length;
  return { ok: true, note: `${loadout.length} Slots (${matched} gematcht)`, unresolved };
}

/**
 * Admin: Standard-Loadouts für alle (oder ausgewählte) Schiffe im Katalog
 * über scunpacked synchronisieren.
 */
export const syncStockLoadouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        shipSlugs: z.array(z.string()).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);

    // Ship-Liste aus dem Katalog holen (plus optional Klassenname aus raw).
    let ships: Array<{ slug: string; className: string | null }>;
    if (data.shipSlugs && data.shipSlugs.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("ship_catalog")
        .select("slug, raw")
        .in("slug", data.shipSlugs);
      ships = (rows ?? []).map((r) => ({
        slug: r.slug as string,
        className: ((r.raw as Record<string, unknown> | null)?.scIdentifier as string) ?? null,
      }));
    } else {
      const { data: rows } = await supabaseAdmin
        .from("ship_catalog")
        .select("slug, raw");
      ships = (rows ?? []).map((r) => ({
        slug: r.slug as string,
        className: ((r.raw as Record<string, unknown> | null)?.scIdentifier as string) ?? null,
      }));
    }

    // Komponenten-Katalog einmal laden und nach class_name indizieren.
    // WICHTIG: PostgREST kappt Responses bei 1000 Rows. Der Katalog hat
    // >1300 Einträge — ohne Pagination fehlen ~30% der Komponenten im
    // Lookup und Stock-Slots bleiben leer, obwohl sie im Katalog existieren.
    const catalogByClass = new Map<
      string,
      { item_ref: string; name: string; manufacturer: string | null; size: number | null }
    >();
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
      const { data: comps } = await supabaseAdmin
        .from("ship_components_catalog")
        .select("item_ref, name, manufacturer_name, size, raw")
        .range(from, from + PAGE - 1);
      if (!comps || comps.length === 0) break;
      for (const c of comps) {
        const clsRaw = ((c.raw as Record<string, unknown> | null)?.class_name as string) ?? null;
        if (!clsRaw) continue;
        const cls = clsRaw.toLowerCase();
        const stripped = cls.replace(/_scitem$/i, "");
        const entry = {
          item_ref: c.item_ref as string,
          name: c.name as string,
          manufacturer: (c.manufacturer_name as string) ?? null,
          size: (c.size as number) ?? null,
        };
        if (!catalogByClass.has(cls)) catalogByClass.set(cls, entry);
        if (!catalogByClass.has(stripped)) catalogByClass.set(stripped, entry);
      }
      if (comps.length < PAGE) break;
    }

    let ok = 0;
    let fail = 0;
    const failed: Array<{ slug: string; error: string }> = [];
    const unresolvedAll: Array<{ slug: string; class_name: string }> = [];
    for (const s of ships) {
      // Sequenziell mit kleiner Pause gegen GitHub-Rate-Limits.
      const r = await syncOne(s.slug, s.className, catalogByClass);
      if (r.ok) ok++;
      else {
        fail++;
        failed.push({ slug: s.slug, error: r.note });
      }
      if (r.unresolved.length > 0) unresolvedAll.push(...r.unresolved);
      await new Promise((res) => setTimeout(res, 120));
    }
    return {
      total: ships.length,
      ok,
      fail,
      failed: failed.slice(0, 30),
      unresolved: unresolvedAll.slice(0, 50),
      unresolvedCount: unresolvedAll.length,
    };
  });

/** Admin-Kachel: Wie viele Schiffe sind bereits synchronisiert? */
/**
 * Admin: Standard-Loadouts aus der Star-Citizen-Wiki-API ziehen
 * (`/v3/vehicles/{slug}?include=ports` → `equipped_item` je Hardpoint).
 */
export const syncStockLoadoutsWiki = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        onlyMissing: z.boolean().optional(),
        shipSlugs: z.array(z.string()).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { runStockLoadoutWikiSync } = await import("@/lib/stock-loadouts-wiki.server");
    return runStockLoadoutWikiSync({
      onlyMissing: data.onlyMissing ?? false,
      shipSlugs: data.shipSlugs,
    });
  });

export const getStockLoadoutsOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    const { count } = await supabaseAdmin
      .from("ship_stock_loadouts")
      .select("ship_slug", { count: "exact", head: true });
    const { data: latest } = await supabaseAdmin
      .from("ship_stock_loadouts")
      .select("fetched_at")
      .order("fetched_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      count: count ?? 0,
      last_synced_at: (latest?.fetched_at as string) ?? null,
    };
  },
);

/**
 * Liefert die `item_ref`s aller *bespoke* Komponenten für ein Schiff.
 *
 * "Bespoke" = schiffs-spezifisch, im Spiel nicht austauschbar (z.B. der
 * `MRCK_S02_RSI_Apollo_Triage`-Rack der Apollo Triage, ship-eigene Thruster
 * usw.). Zuverlässige Quelle: die scunpacked-Ship-JSON und dort die konkrete
 * Editierbarkeit des jeweiligen Loadout-Slots.
 *
 * Ergebnis wird auf `ship_components_catalog.raw->>'class_name'` gemappt.
 */
export const getBespokeItemRefs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        shipSlug: z.string().min(1).max(120),
        shipClassName: z.string().min(1).max(200).nullable().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }): Promise<{ itemRefs: string[]; classNames: string[] }> => {
    // Stabile Quelle: pro-Schiff-Mapping aus `ship_bespoke_components`
    // (befüllt durch syncBespokeFlags oder Self-Heal weiter unten).
    const { data: mapped } = await supabaseAdmin
      .from("ship_bespoke_components")
      .select("item_ref, class_name")
      .eq("ship_slug", data.shipSlug);
    if (mapped && mapped.length > 0) {
      return {
        itemRefs: mapped.map((r) => r.item_ref as string),
        classNames: mapped.map((r) => (r.class_name as string).toLowerCase()),
      };
    }

    // Self-Heal: keine Zeilen für dieses Schiff -> jetzt aus scunpacked ableiten
    // und persistieren, damit kein manueller Admin-Sync nötig ist.
    const fileNames = candidateFileNames(data.shipSlug, data.shipClassName ?? null);
    let ship: ScunShip | null = null;
    for (const fn of fileNames) {
      ship = await fetchScunShip(fn);
      if (ship) break;
    }
    if (!ship) return { itemRefs: [], classNames: [] };

    const bespokeClassNames = collectNonEditableClassNames(ship.Loadout);
    if (bespokeClassNames.size === 0) return { itemRefs: [], classNames: [] };

    const { data: rows } = await supabaseAdmin
      .from("ship_components_catalog")
      .select("item_ref, raw");
    const refs: string[] = [];
    const inserts: Array<{ ship_slug: string; class_name: string; item_ref: string; source: string }> = [];
    for (const r of rows ?? []) {
      const cls = String(
        ((r.raw as Record<string, unknown> | null)?.class_name as string) ?? "",
      ).toLowerCase();
      const stripped = cls.replace(/_scitem$/i, "");
      const matchedCn = bespokeClassNames.has(cls)
        ? cls
        : bespokeClassNames.has(stripped)
          ? stripped
          : null;
      if (matchedCn) {
        const ref = r.item_ref as string;
        refs.push(ref);
        inserts.push({
          ship_slug: data.shipSlug,
          class_name: matchedCn,
          item_ref: ref,
          source: "scunpacked_non_editable",
        });
      }
    }
    if (inserts.length > 0) {
      await supabaseAdmin
        .from("ship_bespoke_components")
        .upsert(inserts, { onConflict: "ship_slug,item_ref" });
    }
    return { itemRefs: refs, classNames: Array.from(bespokeClassNames) };
  });

/**
 * Admin: Bespoke-Flags projektweit im `ship_components_catalog` aktualisieren.
 *
 * Zuverlässige Datenlage: scunpacked ist die Ground-Truth. Bespoke ist eine
 * pro-Schiff-Eigenschaft und wird ausschließlich aus der konkreten
 * Slot-Editierbarkeit im `Loadout` abgeleitet. Alles andere wird explizit auf
 * `false` zurückgesetzt.
 */
export const syncBespokeFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const { data: ships } = await supabaseAdmin
      .from("ship_catalog")
      .select("slug, raw");
    const shipList = (ships ?? []).map((r) => ({
      slug: r.slug as string,
      className:
        ((r.raw as Record<string, unknown> | null)?.scIdentifier as string) ??
        null,
    }));

    // Pro Schiff: Set der class_names, die dort *nicht* austauschbar sind.
    // Das ist die einzige Quelle für "bespoke" — bewusst pro-Schiff, damit
    // eine Klasse, die auf Schiff A fest und auf Schiff B tauschbar ist,
    // auf B nicht fälschlich als bespoke gilt.
    const perShipNonEditable = new Map<string, Set<string>>();
    let fetched = 0;
    let missing = 0;

    for (const s of shipList) {
      const fileNames = candidateFileNames(s.slug, s.className);
      let ship: ScunShip | null = null;
      for (const fn of fileNames) {
        ship = await fetchScunShip(fn);
        if (ship) break;
      }
      if (!ship) {
        missing++;
        await new Promise((r) => setTimeout(r, 60));
        continue;
      }
      fetched++;
      // Ground-Truth: alle nicht-editierbaren Slots direkt aus `ship.Loadout`.
      const nonEditable = collectNonEditableClassNames(ship.Loadout);
      if (nonEditable.size > 0) perShipNonEditable.set(s.slug, nonEditable);
      await new Promise((r) => setTimeout(r, 80));
    }

    // Klassennamen → item_refs auflösen (paginiert, damit große Kataloge nicht abgeschnitten werden).
    const allClassNames = new Set<string>();
    for (const set of perShipNonEditable.values()) {
      for (const cn of set) allClassNames.add(cn);
    }
    const classToRefs = new Map<string, string[]>();
    const PAGE = 1000;
    for (let from = 0; from < 20000; from += PAGE) {
      const { data: chunk } = await supabaseAdmin
        .from("ship_components_catalog")
        .select("item_ref, raw")
        .range(from, from + PAGE - 1);
      if (!chunk || chunk.length === 0) break;
      for (const c of chunk) {
        const cls = String(
          ((c.raw as Record<string, unknown> | null)?.class_name as string) ?? "",
        ).toLowerCase();
        if (!cls) continue;
        const stripped = cls.replace(/_scitem$/i, "");
        for (const key of [cls, stripped]) {
          if (!allClassNames.has(key)) continue;
          const list = classToRefs.get(key) ?? [];
          list.push(c.item_ref as string);
          classToRefs.set(key, list);
        }
      }
      if (chunk.length < PAGE) break;
    }

    // Neue Mapping-Zeilen bauen.
    const rows: Array<{ ship_slug: string; class_name: string; item_ref: string; source: string }> = [];
    const bespokeRefs = new Set<string>();
    for (const [slug, classes] of perShipNonEditable) {
      for (const cn of classes) {
        const refs = classToRefs.get(cn) ?? classToRefs.get(cn.replace(/_scitem$/i, "")) ?? [];
        for (const ref of refs) {
          rows.push({ ship_slug: slug, class_name: cn, item_ref: ref, source: "scunpacked_non_editable" });
          bespokeRefs.add(ref);
        }
      }
    }

    // Pro-Schiff-Tabelle neu aufbauen (nur Schiffe, die wir tatsächlich gescannt haben).
    const touchedSlugs = Array.from(perShipNonEditable.keys());
    for (let i = 0; i < touchedSlugs.length; i += 200) {
      const chunk = touchedSlugs.slice(i, i + 200);
      await supabaseAdmin
        .from("ship_bespoke_components")
        .delete()
        .in("ship_slug", chunk);
    }
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await supabaseAdmin
        .from("ship_bespoke_components")
        .upsert(chunk, { onConflict: "ship_slug,item_ref" });
    }

    // Hinweis: `ship_components_catalog.is_bespoke` wird nicht mehr gepflegt.
    // Bespoke ist pro-Schiff-Eigenschaft und lebt ausschließlich in
    // `ship_bespoke_components`. Der Picker (listCompatibleComponents) filtert
    // ausschließlich darüber, das globale Flag ist deprecated.

    return {
      shipsFetched: fetched,
      shipsMissing: missing,
      shipsWithBespoke: perShipNonEditable.size,
      mappingRows: rows.length,
      catalogBespoke: bespokeRefs.size,
      cleared: 0,
    };
  });

/** Admin-Kachel: Wie viele Komponenten sind aktuell als bespoke markiert? */
export const getBespokeOverview = createServerFn({ method: "GET" }).handler(
  async () => {
    // Zähle *distinct* item_refs in der pro-Schiff-Mapping-Tabelle.
    const { data } = await supabaseAdmin
      .from("ship_bespoke_components")
      .select("item_ref");
    const unique = new Set((data ?? []).map((r) => r.item_ref as string));
    return { count: unique.size };
  },
);