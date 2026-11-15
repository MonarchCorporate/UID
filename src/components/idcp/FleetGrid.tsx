import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getFleetShips, type FleetShip as Ship } from "@/lib/fleet.functions";

const ALL = "Alle";

const SIZE_ORDER: Record<string, number> = {
  capital: 0,
  large: 1,
  medium: 2,
  small: 3,
  snub: 4,
  vehicle: 5,
};

function modelName(name: string | null | undefined, mfr?: string | null) {
  const n = (name ?? "").trim();
  if (!mfr) return n;
  const m = mfr.trim();
  if (m && n.toLowerCase().startsWith(m.toLowerCase() + " ")) {
    return n.slice(m.length + 1).trim();
  }
  return n;
}

export function FleetGrid() {
  const [q, setQ] = useState("");
  const [mfr, setMfr] = useState<string>(ALL);
  const [cls, setCls] = useState<string>(ALL);
  const [size, setSize] = useState<string>(ALL);
  const [sortMode, setSortMode] = useState<"default" | "alpha">("default");

  const fetchFleet = useServerFn(getFleetShips);
  const { data: fleet } = useQuery({
    queryKey: ["fleet-ships"],
    queryFn: () => fetchFleet(),
    staleTime: 5 * 60 * 1000,
  });

  const ships: Ship[] = fleet?.ships ?? [];
  const manufacturers = fleet?.manufacturers ?? [];
  const classifications = fleet?.classifications ?? [];
  const sizes = fleet?.sizes ?? [];

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = ships.filter((s) => {
      if (mfr !== ALL && s.manufacturer !== mfr) return false;
      if (cls !== ALL && s.classification !== cls) return false;
      if (size !== ALL && s.size !== size) return false;
      if (needle && !(`${s.name} ${s.manufacturer ?? ""}`.toLowerCase().includes(needle))) return false;
      return true;
    });
    if (sortMode === "alpha") {
      return list.sort((a, b) =>
        modelName(a.name, a.manufacturer).localeCompare(
          modelName(b.name, b.manufacturer),
          "de",
          { sensitivity: "base" },
        ),
      );
    }
    return list.sort((a, b) => {
      const ma = (a.manufacturer ?? "zzz").toLowerCase();
      const mb = (b.manufacturer ?? "zzz").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb, "de");
      const sa = SIZE_ORDER[(a.size ?? "").toLowerCase()] ?? 99;
      const sb = SIZE_ORDER[(b.size ?? "").toLowerCase()] ?? 99;
      if (sa !== sb) return sa - sb;
      if (b.count !== a.count) return b.count - a.count;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [ships, q, mfr, cls, size, sortMode]);

  const visibleCount = filtered.reduce((sum, s) => sum + s.count, 0);

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

      <div className="mb-6 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
        <span>
          {filtered.length} Modelle / {visibleCount} Hangar-Einheiten
        </span>
        <div className="flex items-center gap-3">
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
          <span className="text-brand/70">// fleetyards.net/fleets/idcp</span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="border border-brand/10 bg-background/40 p-12 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          // no signal — keine treffer
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <ShipCard key={s.slug} s={s} />
          ))}
        </div>
      )}
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

function ShipCard({ s }: { s: Ship }) {
  return (
    <Link
      to="/flotte/$slug"
      params={{ slug: s.slug }}
      className="group relative flex flex-col border border-brand/10 bg-gradient-to-br from-background via-background to-black/40 transition-all hover:border-brand/50 hover:shadow-[0_0_30px_rgba(255,191,0,0.15)]"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
        {s.image ? (
          <img
            src={s.image}
            alt={`${s.manufacturer ?? ""} ${s.name}`}
            loading="lazy"
            className="h-full w-full object-cover opacity-90 transition-all duration-500 group-hover:scale-105 group-hover:opacity-100"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
            // no image
          </div>
        )}
        {s.count > 1 && (
          <div className="absolute right-2 top-2 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.2em] text-brand backdrop-blur">
            ×{s.count}
          </div>
        )}
        <div className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/80">
          {s.manufacturerCode ?? ""}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-display text-base leading-tight text-foreground transition-colors group-hover:text-brand">
            {s.name}
          </h3>
        </div>
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/80">
          {s.manufacturer}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-brand/10 pt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <Stat label="Klasse" value={s.classification} />
          <Stat label="Größe" value={s.size} />
          <Stat label="Crew" value={s.crew} />
        </div>
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