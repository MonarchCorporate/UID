import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { queryOptions, useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UidPage } from "@/components/uid/UidPage";
import { getShipCatalogEntry, type ShipCatalogEntry, type HardpointEntry } from "@/lib/ship-catalog.functions";
import { getShipOwners } from "@/lib/fleet.functions";
import { proxyImage } from "@/lib/proxy-image";
import { getMyRoles } from "@/lib/loadouts.functions";
import { TemplateEditor, type EditorTarget } from "@/components/loadouts/LoadoutAdmin";
import { ShipHoloViewer } from "@/components/ship/ShipHoloViewer";
import { lookupShops } from "@/lib/in-game-shops";
import {
  buildWeaponBuckets,
  buildRsiWeaponSections,
} from "@/lib/weapon-summary";

export const shipDetailsQuery = (slug: string) =>
  queryOptions({
    queryKey: ["ship-catalog", slug],
    queryFn: () => getShipCatalogEntry({ data: { slug } }),
    staleTime: 60 * 60 * 1000,
  });

export const Route = createFileRoute("/flotte/$slug")({
  loader: ({ params, context }) =>
    context.queryClient.ensureQueryData(shipDetailsQuery(params.slug)),
  head: ({ params, loaderData }) => {
    const s = loaderData;
    const title = s
      ? `${s.manufacturer ? s.manufacturer + " " : ""}${s.name} — MRC Hangar`
      : `${params.slug} — MRC Hangar`;
    const description = s
      ? (s.description?.split(/(?<=\.)\s/)[0] ??
          `${s.name}${s.focus ? " · " + s.focus : ""}${s.sizeLabel ? " · " + s.sizeLabel : ""}. Specs, Bewaffnung und Orga-Bestand der Monarch Royal Command.`)
      : `Specs, Bewaffnung und Orga-Bestand des ${params.slug}.`;
    const url = `https://idcp.monarchdigital.xyz/flotte/${params.slug}`;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: url },
      { property: "og:type", content: "article" },
    ];
    const og = s?.heroImage ?? s?.storeImage ?? s?.angledView ?? null;
    if (og) {
      meta.push({ property: "og:image", content: og });
      meta.push({ name: "twitter:image", content: og });
    }
    return {
      meta,
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ShipDetailPage,
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-3xl px-6 py-32 text-sm text-destructive">
      Fehler: {error.message}
    </div>
  ),
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-32 text-sm text-muted-foreground">
      Schiff nicht gefunden.
    </div>
  ),
});

function ShipDetailPage() {
  const { slug } = Route.useParams();
  const fetchOwners = useServerFn(getShipOwners);

  const detailsQ = useSuspenseQuery(shipDetailsQuery(slug));
  const ownersQ = useQuery({
    queryKey: ["ship-owners", slug],
    queryFn: () => fetchOwners({ data: { slug } }),
    staleTime: 60 * 1000,
  });

  const s = detailsQ.data;
  const owners = ownersQ.data ?? [];

  return (
    <UidPage backdrop="aurora" seed={3303}>
      <div className="pt-16">
        <section className="mx-auto max-w-6xl px-6">
          <Link
            to="/flotte"
            className="mb-6 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
          >
            ← Zurück zur Flotte
          </Link>

          {!s ? (
            <div className="py-32 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              // lade Daten…
            </div>
          ) : (
            <ShipDetailBody ship={s} owners={owners} />
          )}
        </section>
        <div className="h-32" />
      </div>
    </UidPage>
  );
}

function Cell({ label, value }: { label: string; value: string | number | null | undefined }) {
  return (
    <div className="bg-background p-4">
      <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">{label}</div>
      <div className="mt-1 font-display text-lg text-foreground">
        {value === null || value === undefined || value === "" ? "—" : String(value)}
      </div>
    </div>
  );
}

function fmtNum(n: number | null | undefined, unit = "", digits = 0): string {
  if (n === null || n === undefined) return "—";
  const v = digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString("de-DE");
  return unit ? `${v} ${unit}` : v;
}

function fmtCrew(min: number | null, max: number | null): string {
  if (min === null && max === null) return "—";
  if (min === max || max === null) return String(min);
  if (min === null) return String(max);
  return min === max ? String(min) : `${min}–${max}`;
}

const STATUS_LABEL: Record<string, string> = {
  "flight-ready": "Flugbereit",
  "in-concept": "Konzept",
  "in-production": "In Produktion",
  "not-available": "Nicht verfügbar",
};

const AUTO_RE = /\b(automated|automatic|unmanned|pdc|pds)\b|\bauto(?![a-z])/i;
const SEAT_SKIP_RE = /(turret|gunner|torpedo|missile)/i;
// Fleetyards ship_matrix entries use names like "S4 Weapon", "S3 Missiles".
// game_files entries use raw hardpoint names like "turret_rear" — those
// duplicate the ship_matrix counts, so when both exist we trust ship_matrix.
const SHIP_MATRIX_NAME_RE = /^\s*S\d+\b/i;

function extractSize(h: HardpointEntry): number | null {
  const m = /\bS(\d+)\b/i.exec(h.name ?? "");
  if (m) return parseInt(m[1], 10);
  return h.size ?? null;
}

function fmtSizes(sizes: number[]): string {
  if (sizes.length === 0) return "";
  const counts = new Map<number, number>();
  for (const s of sizes) counts.set(s, (counts.get(s) ?? 0) + 1);
  return Array.from(counts.entries())
    .sort((a, b) => b[0] - a[0])
    .map(([s, c]) => `${c}× S${s}`)
    .join(" · ");
}

type WeaponGroup = { label: string; sizes: number[] };

/** Pick the authoritative weapon list: ship_matrix entries when any exist
 *  (they carry the manufacturer-confirmed count), otherwise fall back to
 *  game_files. Always drop automated/PDC entries. */
function pickAuthoritative(hp: HardpointEntry[], category: "turret" | "fixed"): HardpointEntry[] {
  const all = hp.filter((h) => {
    if (h.group !== "weapon") return false;
    const isTurret = h.category === "turret";
    if (category === "turret" ? !isTurret : isTurret) return false;
    return !AUTO_RE.test(`${h.name ?? ""} ${h.details ?? ""}`);
  });
  const matrix = all.filter((h) => SHIP_MATRIX_NAME_RE.test(h.name ?? ""));
  return matrix.length > 0 ? matrix : all;
}

function summarizeFixedWeapons(hp: HardpointEntry[]): WeaponGroup[] {
  const fixed = pickAuthoritative(hp, "fixed");
  const groups = new Map<string, WeaponGroup>();
  for (const h of fixed) {
    const size = extractSize(h);
    if (size === null) continue;
    const isMissile =
      h.category === "missile_racks" ||
      h.category === "missile" ||
      /missile/i.test(h.name ?? "");
    const label = isMissile ? "Raketen" : "Pilotgesteuerte Waffen";
    const g = groups.get(label) ?? { label, sizes: [] };
    g.sizes.push(size);
    groups.set(label, g);
  }
  return Array.from(groups.values());
}

type TurretRow = { label: string; sizeLabel: string; count: number; seats: number };

function summarizeTurrets(hp: HardpointEntry[]): TurretRow[] {
  const turrets = pickAuthoritative(hp, "turret");
  // Group by size — every ship_matrix turret entry = 1 physical turret = 1 crew slot.
  const groups = new Map<string, TurretRow>();
  for (const t of turrets) {
    const size = extractSize(t);
    const sizeLabel = size !== null ? `S${size}` : "—";
    const key = sizeLabel;
    const existing = groups.get(key);
    if (existing) existing.count += 1;
    else groups.set(key, { label: "Manned Turret", sizeLabel, count: 1, seats: 1 });
  }
  return Array.from(groups.values()).sort((a, b) => b.sizeLabel.localeCompare(a.sizeLabel));
}

type SeatRow = { label: string };

function summarizeSeats(hp: HardpointEntry[]): SeatRow[] {
  const seats = hp.filter(
    (h) =>
      h.group === "seat" &&
      h.name &&
      !SEAT_SKIP_RE.test(h.name),
  );
  return seats.map((s) => ({ label: prettifySeatName(s.name) }));
}

/** Comprehensive weapon overview: groups every weapon hardpoint by
 *  category + size so the user sees the full standard armament at a glance. */
type WeaponSummaryRow = { label: string; sizes: number[]; total: number };

const WEAPON_CATEGORY_LABEL: Record<string, string> = {
  fixed: "Pilotgesteuerte Waffen",
  turret: "Turrets",
  turret_manned: "Bemannte Turrets",
  turret_remote: "Remote-Turrets",
  pdc: "PDC-Turrets",
  missile_racks: "Raketen / Bomben",
  countermeasures: "Konter­maßnahmen",
};
const WEAPON_CATEGORY_ORDER = [
  "fixed",
  "turret",
  "turret_manned",
  "turret_remote",
  "missile_racks",
  "pdc",
  "countermeasures",
];

function summarizeAllWeapons(hp: HardpointEntry[]): WeaponSummaryRow[] {
  const groups = new Map<string, WeaponSummaryRow>();
  for (const h of hp) {
    if (h.group !== "weapon") continue;
    const cat = h.category ?? "";
    const label = WEAPON_CATEGORY_LABEL[cat];
    if (!label) continue;
    const size = extractSize(h);
    const row = groups.get(cat) ?? { label, sizes: [], total: 0 };
    if (size !== null) row.sizes.push(size);
    row.total += 1;
    groups.set(cat, row);
  }
  return WEAPON_CATEGORY_ORDER
    .map((k) => groups.get(k))
    .filter((r): r is WeaponSummaryRow => !!r);
}

// Map SC-Wiki `category_label` (stored verbatim on default_loadout entries)
// to our internal weapon-summary buckets. Keeps the summary cell in lock-step
// with the accordion below — no resync required when the mapping rules change.
const LOADOUT_WEAPON_CAT: Record<string, string> = {
  "Weapons": "fixed",
  "Turrets": "turret",
  "Manned Turrets": "turret_manned",
  "Remote Turrets": "turret_remote",
  "PDC Turrets": "pdc",
  "Missile & Bomb Racks": "missile_racks",
  "Counter Measures": "countermeasures",
};

// Deutsche Anzeige-Labels für Wiki-Waffenkategorien (Karten-Header).
const WEAPON_CAT_DE: Record<string, string> = {
  "Weapons": "Pilotgesteuerte Waffen",
  "Turrets": "Turrets",
  "Manned Turrets": "Bemannte Turrets",
  "Remote Turrets": "Remote-Turrets",
  "PDC Turrets": "PDC-Turrets",
  "Missile & Bomb Racks": "Raketen & Bomben",
  "Counter Measures": "Gegenmaßnahmen",
};
const WEAPON_CAT_ORDER_DE = [
  "Weapons",
  "Manned Turrets",
  "Remote Turrets",
  "Turrets",
  "PDC Turrets",
  "Missile & Bomb Racks",
  "Counter Measures",
];
const WEAPON_CATS_SET = new Set(WEAPON_CAT_ORDER_DE);

// Deutsche Anzeige-Labels für Werks-Komponenten-Kategorien (Technik-Tab).
const COMPONENT_CAT_DE: Record<string, string> = {
  "Power Plants": "Kraftwerke",
  "Shield Generators": "Schildgeneratoren",
  "Coolers": "Kühler",
  "Quantum Drives": "Quantum-Antriebe",
  "Jump Modules": "Sprungmodule",
  "Main Thrusters": "Haupttriebwerke",
  "Retro Thrusters": "Bremstriebwerke",
  "VTOL Thrusters": "VTOL-Triebwerke",
  "Maneuvering Thrusters": "Manövriertriebwerke",
  "Fuel Tanks": "Wasserstofftanks",
  "Fuel Intakes": "Wasserstoff-Einlässe",
  "Quantum Fuel Tanks": "Quantum-Tanks",
  "Radar": "Radar",
  "Computers": "Computer",
  "EMP Generators": "EMP-Generatoren",
  "Mining Lasers": "Bergbaulaser",
  "Mining Modifiers": "Bergbau-Module",
  "Tractor Beams": "Traktorstrahlen",
  "Salvage Modifiers": "Salvage-Module",
  "Scrapers": "Schaber",
  "Tools": "Werkzeuge",
  "Cargo Grid": "Cargo-Grid",
};
const componentLabel = (cat: string) => COMPONENT_CAT_DE[cat] ?? cat;

function summarizeWeaponsFromLoadout(
  loadout: Array<{ category: string; size: number | null }>,
): WeaponSummaryRow[] {
  const groups = new Map<string, WeaponSummaryRow>();
  for (const e of loadout) {
    const cat = LOADOUT_WEAPON_CAT[e.category];
    if (!cat) continue;
    const label = WEAPON_CATEGORY_LABEL[cat];
    if (!label) continue;
    const row = groups.get(cat) ?? { label, sizes: [], total: 0 };
    if (e.size !== null) row.sizes.push(e.size);
    row.total += 1;
    groups.set(cat, row);
  }
  return WEAPON_CATEGORY_ORDER
    .map((k) => groups.get(k))
    .filter((r): r is WeaponSummaryRow => !!r);
}

function prettifySeatName(raw: string): string {
  const cleaned = raw
    .replace(/^hardpoint[_-]?/i, "")
    .replace(/^seat[_-]?/i, "")
    .replace(/[_-]+/g, " ")
    .trim();
  if (!cleaned) return "Sitz";
  return cleaned
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export function ShipDetailBody({
  ship: s,
  owners,
}: {
  ship: ShipCatalogEntry;
  owners: Array<{
    user_id: string;
    callsign: string;
    display_name: string | null;
    custom_name: string | null;
    location: string | null;
    source: string;
  }>;
}) {
  const [tab, setTab] = useState<
    "overview" | "specs" | "loadout" | "gallery" | "paints" | "holo"
  >("overview");
  const [activePaint, setActivePaint] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<EditorTarget | null>(null);
  const rolesFn = useServerFn(getMyRoles);
  const [hasSession, setHasSession] = useState(false);
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setHasSession(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setHasSession(!!session);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  const { data: roles } = useQuery({
    queryKey: ["my-roles"],
    queryFn: async () => {
      try {
        return await rolesFn();
      } catch {
        return { isAdmin: false };
      }
    },
    enabled: hasSession,
    retry: false,
  });
  const isAdmin = !!roles?.isAdmin;
  const hero = s.heroImage ?? s.storeImage ?? s.angledView ?? s.images[0]?.large ?? s.images[0]?.url ?? null;
  const heroSrc = proxyImage(hero);
  const turretRows = summarizeTurrets(s.hardpoints);
  const seatRows = summarizeSeats(s.hardpoints);
  const mannedSeatCount =
    seatRows.length + turretRows.reduce((sum, t) => sum + t.count * t.seats, 0);
  const statusLabel = s.productionStatus ? STATUS_LABEL[s.productionStatus] ?? s.productionStatus : null;
  const gallery = s.images.filter((i) => i.url).slice(0, 24);

  return (
    <>
      {/* HERO */}
      <div className="grid gap-8 lg:grid-cols-[1.4fr_1fr]">
        <div className="relative aspect-[16/10] w-full overflow-hidden border border-brand/10 bg-black">
          {heroSrc ? (
            <img
              src={heroSrc}
              alt={`${s.manufacturer ?? ""} ${s.name}`}
              className="h-full w-full object-cover"
              loading="eager"
            />
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-[0.3em] text-muted-foreground/50">
              // kein Bild
            </div>
          )}
          <div className="absolute left-3 top-3 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand backdrop-blur">
            {s.manufacturerCode ?? s.manufacturer ?? "MRC"}
          </div>
          {statusLabel && (
            <div className="absolute right-3 top-3 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand backdrop-blur">
              {statusLabel}
            </div>
          )}
        </div>

        <div>
          <div className="mb-3 inline-block p-1 border border-brand/30">
            <div className="border border-brand/10 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand">
              // {s.classificationLabel ?? s.classification ?? "Ship"}
            </div>
          </div>
          <h1 className="font-display text-4xl tracking-tight md:text-5xl">{s.name}</h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {s.manufacturer ?? ""}
            {s.focus ? ` · ${s.focus}` : ""}
          </p>

          <div className="mt-6 grid grid-cols-2 gap-px border border-brand/10 bg-brand/10">
            <Cell label="Größe" value={s.sizeLabel ?? s.size} />
            <Cell label="Länge" value={s.lengthM !== null ? `${s.lengthM} m` : null} />
            <Cell label="Besatzung" value={fmtCrew(s.crewMin, s.crewMax)} />
            <Cell label="Fracht" value={s.cargoScu !== null ? `${s.cargoScu} SCU` : null} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-px border border-brand/10 bg-brand/10">
            <Cell label="Pledge (USD)" value={s.pledgePriceUsd !== null ? `$${s.pledgePriceUsd}` : null} />
            <Cell
              label="In-Game (aUEC)"
              value={
                s.priceUec !== null
                  ? fmtNum(s.priceUec)
                  : lookupShops(s.name)?.basePrice != null
                    ? fmtNum(lookupShops(s.name)!.basePrice as number)
                    : null
              }
            />
          </div>

          {s.priceUecTerminals.length > 0 && (
            <div className="mt-4 border border-brand/10 p-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
                Kaufterminals
              </div>
              <ul className="mt-3 space-y-1.5 text-xs">
                {s.priceUecTerminals.map((t) => (
                  <li key={`${t.terminal}-${t.price}`} className="flex items-baseline justify-between gap-3">
                    <span className="text-muted-foreground">
                      {t.terminal}
                      {t.system ? ` · ${t.system}` : ""}
                    </span>
                    <span className="font-mono">{fmtNum(t.price)} aUEC</span>
                  </li>
                ))}
                {s.priceRentUec !== null && (
                  <li className="flex items-baseline justify-between gap-3 border-t border-brand/10 pt-1.5">
                    <span className="text-muted-foreground">Miete (günstigste)</span>
                    <span className="font-mono">{fmtNum(s.priceRentUec)} aUEC</span>
                  </li>
                )}
              </ul>
            </div>
          )}

          {(() => {
            const info = lookupShops(s.name);
            if (!info || info.shops.length === 0) return null;
            return (
              <div className="mt-4 border border-brand/10 p-4">
                <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/60">
                  Erhältlich im Spiel
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {info.shops.map((sh) => (
                    <li key={sh.name} className="flex justify-between gap-3">
                      <span className="text-foreground">{sh.name}</span>
                      <span className="text-muted-foreground">{sh.location}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })()}

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              to="/loadouts"
              hash={s.slug}
              className="border border-brand bg-brand px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-background hover:bg-brand/90"
            >
              Bewaffnung planen
            </Link>
            {s.storeUrl && (
              <a
                href={s.storeUrl}
                target="_blank"
                rel="noreferrer"
                className="border border-brand/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand/10"
              >
                RSI Store ↗
              </a>
            )}
            <a
              href={s.fleetyardsUrl ?? `https://fleetyards.net/ships/${s.slug}`}
              target="_blank"
              rel="noreferrer"
              className="border border-brand/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand/10"
            >
              Fleetyards ↗
            </a>
          </div>
        </div>
      </div>

      {/* TABS */}
      <div className="mt-12 flex flex-wrap gap-px border-b border-brand/10">
        {(
          [
            ["overview", "Übersicht"],
            ["specs", "Technik"],
            ["loadout", "Bewaffnung"],
            ["gallery", `Galerie (${gallery.length})`],
            ...(s.paints.length > 0
              ? ([["paints", `Lackierungen (${s.paints.length})`]] as const)
              : ([] as const)),
            ...(s.holoUrl ? ([["holo", "3D-Modell"]] as const) : ([] as const)),
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] transition-colors ${
              tab === k
                ? "border-b-2 border-brand text-brand"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "overview" && (
          <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
            <div>
              <h2 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // Beschreibung
              </h2>
              {s.descriptionDe || s.description ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/90">
                  {s.descriptionDe ?? s.description}
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Noch keine Beschreibung. Admins können den Katalog auf{" "}
                  <Link to="/flotte" className="text-brand underline">/flotte</Link> synchronisieren.
                </p>
              )}
            </div>
            <aside className="space-y-3">
              <div className="border border-brand/10 p-4">
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                  // Schnellfakten
                </div>
                <dl className="space-y-1.5 text-sm">
                  <Row k="Hersteller" v={s.manufacturer ?? "—"} />
                  <Row k="Klassifikation" v={s.classificationLabel ?? s.classification ?? "—"} />
                  <Row k="Fokus" v={s.focus ?? "—"} />
                  <Row k="Größe" v={s.sizeLabel ?? s.size ?? "—"} />
                  <Row k="Besatzung" v={fmtCrew(s.crewMin, s.crewMax)} />
                  <Row k="Fracht" v={s.cargoScu !== null ? `${s.cargoScu} SCU` : "—"} />
                  <Row k="Status" v={statusLabel ?? "—"} />
                </dl>
              </div>
            </aside>
          </div>
        )}

        {tab === "specs" && (
          <div className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <SpecBlock
                title="Abmessungen"
                rows={[
                  ["Länge", fmtNum(s.lengthM, "m", 1)],
                  ["Breite", fmtNum(s.beamM, "m", 1)],
                  ["Höhe", fmtNum(s.heightM, "m", 1)],
                  ["Masse", fmtNum(s.massKg, "kg")],
                ]}
              />
              <SpecBlock
                title="Geschwindigkeit"
                rows={[
                  ["SCM", fmtNum(s.scmSpeed, "m/s")],
                  ["Boost", fmtNum(s.maxSpeed, "m/s")],
                  ["Nicken", fmtNum(s.pitchRate, "°/s", 1)],
                  ["Gieren", fmtNum(s.yawRate, "°/s", 1)],
                  ["Rollen", fmtNum(s.rollRate, "°/s", 1)],
                ]}
              />
              <SpecBlock
                title="Treibstoff"
                rows={[
                  ["Wasserstoff", fmtNum(s.hydrogenFuel, "", 1)],
                  ["Quantum", fmtNum(s.quantumFuel, "", 1)],
                ]}
              />
              <SpecBlock
                title="Preis"
                rows={[
                  ["Pledge", s.pledgePriceUsd !== null ? `$${s.pledgePriceUsd}` : "—"],
                  ["Im Spiel", s.priceUec !== null ? `${fmtNum(s.priceUec)} aUEC` : "—"],
                ]}
              />
            </div>

            {(() => {
              const rest = s.defaultLoadout.filter((e) => !WEAPON_CATS_SET.has(e.category));
              if (rest.length === 0) return null;
              const groups = new Map<string, typeof s.defaultLoadout>();
              for (const e of rest) {
                const list = groups.get(e.category) ?? [];
                list.push(e);
                groups.set(e.category, list);
              }
              const sorted = Array.from(groups.entries()).sort((a, b) =>
                componentLabel(a[0]).localeCompare(componentLabel(b[0]), "de"),
              );
              return (
                <div className="border border-brand/10 p-4">
                  <div className="mb-3 flex items-baseline justify-between gap-3">
                    <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                      // Werks-Komponenten (SC-Wiki)
                    </div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                      {rest.length} Komponenten
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    {sorted.map(([cat, entries]) => (
                      <div key={cat} className="border border-brand/5 bg-background/40 p-3">
                        <div className="mb-2 flex items-baseline justify-between gap-3">
                          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/80">
                            {componentLabel(cat)}
                          </div>
                          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                            {entries.length}
                          </div>
                        </div>
                        <ul className="space-y-1">
                          {entries.map((e, i) => (
                            <li
                              key={`${cat}-${i}`}
                              className="flex items-center justify-between gap-3 border-b border-brand/5 pb-1 last:border-0"
                            >
                              <span className="truncate text-sm text-foreground">
                                {e.itemName ?? <span className="text-muted-foreground">— leer —</span>}
                                {e.manufacturer && (
                                  <span className="ml-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                                    {e.manufacturer}
                                  </span>
                                )}
                              </span>
                              <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                                {e.size !== null ? `S${e.size}` : (e.subType ?? e.type ?? "")}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}

        {tab === "loadout" && (
          <div className="grid gap-4 md:grid-cols-2">
            {isAdmin && (
              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 border border-amber-400/30 bg-amber-400/5 p-3">
                <div className="text-xs text-muted-foreground">
                  <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300">// Admin</span>{" "}
                  Boardcomputer-Stationen für dieses Schiff anpassen (Admin-Default-Loadout). Überschreibt Fleetyards, wird von eigenen Spieler-Loadouts überschrieben.
                </div>
                <button
                  onClick={() => setEditorTarget({ scope: "admin", ship_slug: s.slug, ship_name: s.name })}
                  className="px-4 py-2 border border-brand bg-brand text-primary-foreground font-mono text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand/80 shrink-0"
                >
                  Boardcomputer-Loadout bearbeiten
                </button>
              </div>
            )}
          <div className="md:col-span-2 grid gap-px border border-brand/10 bg-brand/10">
              <Cell label="Besetzbare Plätze" value={mannedSeatCount || "—"} />
            </div>

            <div className="md:col-span-2">
              <WeaponLoadoutPanel loadout={s.defaultLoadout} />
            </div>

            {(seatRows.length > 0 || turretRows.length > 0) && (
              <div className="border border-brand/10 p-4">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                  // Besetzbare Stationen
                </div>
                <ul className="space-y-1.5">
                  {seatRows.map((r, i) => (
                    <li
                      key={`seat-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-brand/5 pb-1.5 last:border-0"
                    >
                      <span className="text-sm text-foreground">{r.label}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                        1 Platz
                      </span>
                    </li>
                  ))}
                  {turretRows.map((t, i) => (
                    <li
                      key={`turret-${i}`}
                      className="flex items-center justify-between gap-3 border-b border-brand/5 pb-1.5 last:border-0"
                    >
                      <span className="text-sm text-foreground">
                        {t.count > 1 ? `${t.count}× ` : ""}
                        {t.label}
                        <span className="ml-2 text-muted-foreground">· {t.sizeLabel}</span>
                      </span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                        {t.count * t.seats} {t.count * t.seats === 1 ? "Platz" : "Plätze"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {seatRows.length === 0 && turretRows.length === 0 && s.defaultLoadout.length === 0 && (
              <p className="md:col-span-2 text-sm text-muted-foreground">
                Keine zuverlässig auslesbaren Bewaffnungs-/Stationsdaten — siehe{" "}
                <a
                  href={s.fleetyardsUrl ?? `https://fleetyards.net/ships/${s.slug}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-brand underline"
                >
                  Fleetyards ↗
                </a>
                .
              </p>
            )}
          </div>
        )}

        {tab === "gallery" && (
          <div>
            {gallery.length === 0 ? (
              <p className="text-sm text-muted-foreground">Keine Galeriebilder verfügbar.</p>
            ) : (
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {gallery.map((img, i) => (
                  <a
                    key={i}
                    href={proxyImage(img.large ?? img.url) ?? "#"}
                    target="_blank"
                    rel="noreferrer"
                    className="block aspect-video overflow-hidden border border-brand/10 bg-black hover:border-brand/40"
                  >
                    <img
                      src={proxyImage(img.medium ?? img.small ?? img.url) ?? ""}
                      alt={img.alt ?? s.name}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform hover:scale-105"
                    />
                  </a>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === "paints" && (
          <div>
            {s.paints.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Keine Lackierungen verfügbar.
              </p>
            ) : (
              (() => {
                const current =
                  s.paints.find((p) => p.slug === activePaint) ?? s.paints[0];
                const big = proxyImage(current.large ?? current.image);
                return (
                  <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
                    <div className="relative aspect-[16/10] w-full overflow-hidden border border-brand/10 bg-black">
                      {big ? (
                        <img
                          src={big}
                          alt={`${s.name} – ${current.name}`}
                          className="h-full w-full object-cover"
                          loading="eager"
                        />
                      ) : null}
                      <div className="absolute left-3 bottom-3 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand backdrop-blur">
                        {current.name}
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                        // Varianten ({s.paints.length})
                      </h3>
                      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-3">
                        {s.paints.map((p) => {
                          const thumb = proxyImage(p.thumb ?? p.image);
                          const active = p.slug === current.slug;
                          return (
                            <button
                              key={p.slug}
                              type="button"
                              onClick={() => setActivePaint(p.slug)}
                              className={`group block aspect-square overflow-hidden border bg-black text-left transition-colors ${
                                active
                                  ? "border-brand"
                                  : "border-brand/10 hover:border-brand/40"
                              }`}
                              title={p.name}
                            >
                              {thumb ? (
                                <img
                                  src={thumb}
                                  alt={p.name}
                                  loading="lazy"
                                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/50">
                                  —
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        )}

        {tab === "holo" && s.holoUrl && (
          <div className="grid gap-3">
            <ShipHoloViewer
              src={s.holoUrl}
              poster={heroSrc}
              alt={`${s.manufacturer ?? ""} ${s.name} – 3D Holo`}
            />
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              // ziehen zum drehen · scrollen zum zoomen · quelle: fleetyards holo
            </p>
          </div>
        )}
      </div>

      {/* ORGA-BLOCK */}
      <section className="mt-16 border border-brand/10 p-6">
        <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
          // Im Hangar der MRC ({owners.length})
        </h2>
        {owners.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Noch kein Mitglied hat dieses Schiff registriert.
          </p>
        ) : (
          <ul className="divide-y divide-brand/10">
            {owners.map((o, i) => (
              <li
                key={`${o.user_id}-${i}`}
                className="grid gap-2 py-3 md:grid-cols-[1fr_1fr_1fr_auto] md:items-center"
              >
                <span className="text-sm text-foreground">
                  {o.callsign}
                  {o.display_name && o.display_name !== o.callsign ? ` · ${o.display_name}` : ""}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {o.custom_name ? `„${o.custom_name}"` : "—"}
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand/80">
                  {o.location ?? "Standort unbekannt"}
                </span>
                <span className="text-right font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  {o.source}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {editorTarget && (
        <TemplateEditor target={editorTarget} onClose={() => setEditorTarget(null)} />
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-brand/5 pb-1.5 last:border-0">
      <dt className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{k}</dt>
      <dd className="text-foreground">{v}</dd>
    </div>
  );
}

function SpecBlock({ title, rows }: { title: string; rows: Array<[string, string]> }) {
  return (
    <div className="border border-brand/10 p-4">
      <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
        // {title}
      </div>
      <dl className="space-y-1.5 text-sm">
        {rows.map(([k, v]) => (
          <Row key={k} k={k} v={v} />
        ))}
      </dl>
    </div>
  );
}

function WeaponLoadoutPanel({
  loadout,
}: {
  loadout: ShipCatalogEntry["defaultLoadout"];
}) {
  const [showDetails, setShowDetails] = useState(false);
  const sections = buildRsiWeaponSections(loadout);
  const buckets = buildWeaponBuckets(loadout);
  if (buckets.length === 0) return null;
  const totalMounts = buckets.reduce((n, b) => n + b.total, 0);
  const bucketsByCat = new Map(buckets.map((b) => [b.category, b] as const));
  return (
    <div className="border border-brand/10 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
          // Waffen-Loadout (Werk)
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
            {totalMounts} Mounts
          </span>
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="border border-brand/30 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-brand hover:bg-brand/10"
          >
            {showDetails ? "Details ausblenden" : "Details anzeigen"}
          </button>
        </div>
      </div>
      <dl className="divide-y divide-brand/10 border-y border-brand/10">
        {sections.map((sec) => {
          const detailNames = showDetails
            ? dedupeWithCount(
                sec.sourceCategories.flatMap(
                  (c) =>
                    bucketsByCat.get(c)?.rows.flatMap((r) => r.itemNames) ?? [],
                ),
              )
            : [];
          return (
            <div
              key={sec.label}
              className="grid grid-cols-[10rem_1fr] gap-4 py-3 sm:grid-cols-[12rem_1fr]"
            >
              <dt className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                {sec.label}
              </dt>
              <dd className="font-mono text-sm text-foreground">
                {sec.rows.length === 0 ? (
                  <span className="text-muted-foreground/70">N/A</span>
                ) : (
                  <ul className="space-y-0.5">
                    {sec.rows.map((row, i) => (
                      <li key={i}>{row}</li>
                    ))}
                  </ul>
                )}
                {showDetails && detailNames.length > 0 && (
                  <ul className="mt-2 space-y-0.5 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/70">
                    {detailNames.map((n, j) => (
                      <li key={j}>
                        {n.count > 1 ? `${n.count}× ` : ""}
                        {n.name}
                      </li>
                    ))}
                  </ul>
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

function dedupeWithCount(names: string[]): Array<{ name: string; count: number }> {
  const m = new Map<string, number>();
  for (const n of names) m.set(n, (m.get(n) ?? 0) + 1);
  return Array.from(m, ([name, count]) => ({ name, count })).sort(
    (a, b) => b.count - a.count,
  );
}