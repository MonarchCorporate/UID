import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { ShipCatalogSummary } from "@/lib/ship-catalog.functions";
import { proxyImage } from "@/lib/proxy-image";
import { lookupShops } from "@/lib/in-game-shops";
import { CompareBar } from "@/components/ship-catalog/CompareBar";
import { CompareDialog } from "@/components/ship-catalog/CompareDialog";
import { toast } from "sonner";

const ALL = "Alle";
const MAX_COMPARE = 3;

const SIZE_ORDER: Record<string, number> = {
  capital: 0,
  large: 1,
  medium: 2,
  small: 3,
  snub: 4,
  vehicle: 5,
};

export function ShipCatalogGrid({ ships }: { ships: ShipCatalogSummary[] }) {
  const [q, setQ] = useState("");
  const [mfr, setMfr] = useState(ALL);
  const [cls, setCls] = useState(ALL);
  const [size, setSize] = useState(ALL);
  const [sortMode, setSortMode] = useState<"default" | "alpha">("default");
  const [compareSlugs, setCompareSlugs] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);

  const toggleCompare = (slug: string) => {
    setCompareSlugs((prev) => {
      if (prev.includes(slug)) return prev.filter((s) => s !== slug);
      if (prev.length >= MAX_COMPARE) {
        toast.error(`Maximal ${MAX_COMPARE} Schiffe vergleichbar`);
        return prev;
      }
      return [...prev, slug];
    });
  };
  const selectedShips = useMemo(
    () =>
      compareSlugs
        .map((slug) => ships.find((s) => s.slug === slug))
        .filter((s): s is ShipCatalogSummary => Boolean(s)),
    [compareSlugs, ships],
  );

  const manufacturers = useMemo(
    () =>
      Array.from(new Set(ships.map((s) => s.manufacturer).filter(Boolean) as string[])).sort(
        (a, b) => a.localeCompare(b, "de"),
      ),
    [ships],
  );
  const classifications = useMemo(
    () =>
      Array.from(
        new Set(
          ships
            .map((s) => s.classificationLabel ?? s.classification)
            .filter(Boolean) as string[],
        ),
      ).sort((a, b) => a.localeCompare(b, "de")),
    [ships],
  );
  const sizes = useMemo(
    () =>
      Array.from(new Set(ships.map((s) => s.sizeLabel ?? s.size).filter(Boolean) as string[])).sort(
        (a, b) => (SIZE_ORDER[a.toLowerCase()] ?? 99) - (SIZE_ORDER[b.toLowerCase()] ?? 99),
      ),
    [ships],
  );

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = ships.filter((s) => {
      if (mfr !== ALL && s.manufacturer !== mfr) return false;
      if (cls !== ALL && (s.classificationLabel ?? s.classification) !== cls) return false;
      if (size !== ALL && (s.sizeLabel ?? s.size) !== size) return false;
      if (
        needle &&
        !`${s.name} ${s.manufacturer ?? ""}`.toLowerCase().includes(needle)
      )
        return false;
      return true;
    });
    if (sortMode === "alpha") {
      return list.sort((a, b) => a.name.localeCompare(b.name, "de"));
    }
    return list.sort((a, b) => {
      const ma = (a.manufacturer ?? "zzz").toLowerCase();
      const mb = (b.manufacturer ?? "zzz").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb, "de");
      const sa = SIZE_ORDER[(a.size ?? "").toLowerCase()] ?? 99;
      const sb = SIZE_ORDER[(b.size ?? "").toLowerCase()] ?? 99;
      if (sa !== sb) return sa - sb;
      const la = a.lengthM ?? 0;
      const lb = b.lengthM ?? 0;
      if (la !== lb) return lb - la;
      return a.name.localeCompare(b.name, "de");
    });
  }, [ships, q, mfr, cls, size, sortMode]);

  return (
    <div>
      <div className="mb-8 grid gap-3 md:grid-cols-[1.4fr_repeat(3,1fr)_auto]">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Schiff oder Hersteller suchen…"
          className="w-full border border-brand/20 bg-background px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-brand focus:outline-none"
        />
        <Select label="Hersteller" value={mfr} onChange={setMfr} options={manufacturers} />
        <Select label="Klasse" value={cls} onChange={setCls} options={classifications} />
        <Select label="Größe" value={size} onChange={setSize} options={sizes} />
        <button
          type="button"
          onClick={() => {
            setQ("");
            setMfr(ALL);
            setCls(ALL);
            setSize(ALL);
          }}
          className="border border-brand/20 px-4 py-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:border-brand/60 hover:text-brand"
        >
          Reset
        </button>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
        <span>
          {filtered.length} / {ships.length} Schiffe
        </span>
        <div className="inline-flex border border-brand/30">
          <button
            type="button"
            onClick={() => setSortMode("default")}
            aria-pressed={sortMode === "default"}
            className={`px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
              sortMode === "default"
                ? "bg-brand text-primary-foreground"
                : "text-brand hover:bg-brand/10"
            }`}
          >
            Hersteller / Größe
          </button>
          <button
            type="button"
            onClick={() => setSortMode("alpha")}
            aria-pressed={sortMode === "alpha"}
            className={`border-l border-brand/30 px-3 py-1.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
              sortMode === "alpha"
                ? "bg-brand text-primary-foreground"
                : "text-brand hover:bg-brand/10"
            }`}
          >
            A → Z
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-brand/10 bg-background/40 p-12 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          // no signal — keine treffer
        </div>
      ) : (
        <div className="grid gap-4 pb-24 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <CatalogCard
              key={s.slug}
              s={s}
              selected={compareSlugs.includes(s.slug)}
              disabled={
                !compareSlugs.includes(s.slug) && compareSlugs.length >= MAX_COMPARE
              }
              onToggleCompare={() => toggleCompare(s.slug)}
            />
          ))}
        </div>
      )}
      <CompareBar
        ships={selectedShips}
        max={MAX_COMPARE}
        onRemove={(slug) => toggleCompare(slug)}
        onClear={() => setCompareSlugs([])}
        onOpen={() => setCompareOpen(true)}
      />
      <CompareDialog
        open={compareOpen}
        onOpenChange={setCompareOpen}
        ships={selectedShips}
      />
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <label className="relative block">
      <span className="pointer-events-none absolute left-3 top-1 font-mono text-[8px] uppercase tracking-[0.3em] text-brand/60">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full w-full appearance-none border border-brand/20 bg-background px-3 pb-2 pt-5 text-sm text-foreground focus:border-brand focus:outline-none"
      >
        <option value={ALL}>{ALL}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function CatalogCard({
  s,
  selected,
  disabled,
  onToggleCompare,
}: {
  s: ShipCatalogSummary;
  selected: boolean;
  disabled: boolean;
  onToggleCompare: () => void;
}) {
  const img = proxyImage(s.image);
  const fmtUec = (n: number) => `${new Intl.NumberFormat("de-DE").format(n)} aUEC`;
  const fmtUsd = (n: number) =>
    `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;
  const staticShops = lookupShops(s.name);
  // Live-Terminals aus dem täglichen Preis-Abgleich; die alte Liste nur als Rückfall
  const shops = s.buyAt?.length
    ? s.buyAt.map((t) => ({ name: t.name, location: t.location }))
    : (staticShops?.shops ?? []);
  const priceUec = s.priceUec ?? staticShops?.basePrice ?? null;
  return (
    <Link
      to="/flotte/$slug"
      params={{ slug: s.slug }}
      className="group relative flex flex-col border border-brand/10 bg-gradient-to-br from-background via-background to-black/40 transition-all hover:border-brand/50 hover:shadow-[0_0_30px_rgba(255,191,0,0.15)]"
    >
      <label
        onClick={(e) => {
          e.stopPropagation();
        }}
        className={`absolute right-2 top-2 z-10 inline-flex cursor-pointer items-center gap-1.5 border px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] backdrop-blur ${
          selected
            ? "border-brand bg-brand/20 text-brand"
            : "border-brand/30 bg-background/70 text-muted-foreground hover:border-brand/60 hover:text-brand"
        } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
      >
        <input
          type="checkbox"
          checked={selected}
          disabled={disabled}
          onChange={(e) => {
            e.stopPropagation();
            onToggleCompare();
          }}
          onClick={(e) => e.stopPropagation()}
          className="h-3 w-3 accent-brand"
        />
        Vergleichen
      </label>
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
        {img ? (
          <img
            src={img}
            alt={`${s.manufacturer ?? ""} ${s.name}`}
            loading="lazy"
            className="h-full w-full object-cover opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
            // no image
          </div>
        )}
        <div className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/80">
          {s.manufacturerCode ?? ""}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-base leading-tight text-foreground transition-colors group-hover:text-brand">
          {s.name}
        </h3>
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/80">
          {s.manufacturer ?? "—"}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-brand/10 pt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <Stat label="Klasse" value={s.classificationLabel ?? s.classification} />
          <Stat label="Größe" value={s.sizeLabel ?? s.size} />
          <Stat
            label="Crew"
            value={s.crewMax !== null ? String(s.crewMax) : null}
          />
        </div>
        <div className="grid grid-cols-2 gap-2 border-t border-brand/10 pt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <Stat label="Im Spiel" value={priceUec !== null ? fmtUec(priceUec) : null} />
          <Stat label="Pledge" value={s.pledgePriceUsd !== null ? fmtUsd(s.pledgePriceUsd) : null} />
        </div>
        {shops.length > 0 && (
          <div className="border-t border-brand/10 pt-3">
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-brand/50">
              Erhältlich bei
            </div>
            <ul className="mt-1 space-y-0.5 text-[11px] text-foreground/85">
              {shops.map((sh) => (
                <li key={sh.name}>
                  <span className="text-foreground">{sh.name}</span>
                  <span className="text-muted-foreground/70"> · {sh.location}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {s.storeUrl && (
          <a
            href={s.storeUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-block w-fit border border-brand/30 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.2em] text-brand hover:bg-brand/10"
          >
            RSI Store ↗
          </a>
        )}
      </div>
    </Link>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-brand/50">{label}</div>
      <div className="mt-0.5 text-foreground/90">{value ?? "—"}</div>
    </div>
  );
}