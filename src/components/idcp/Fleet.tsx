import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import hangarBg from "@/assets/hangar-bg.jpg";
import { useReveal } from "@/hooks/use-reveal";
import { getFleetShips, type FleetShip } from "@/lib/fleet.functions";
import { getFleetyardsSlug } from "@/lib/app-settings.functions";

const PRIORITY_SLUGS = [
  "anvl-odin",
  "aegs-javelin",
  "aegs-idris-p",
  "rsi-perseus",
  "rsi-polaris",
  "drak-ironclad-assault",
];

export function Fleet() {
  const fetchFleet = useServerFn(getFleetShips);
  const fetchSlug = useServerFn(getFleetyardsSlug);
  const { data: fleet } = useQuery({
    queryKey: ["fleet-ships"],
    queryFn: () => fetchFleet(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: fleetyardsSlug } = useQuery({
    queryKey: ["fleetyards-slug"],
    queryFn: () => fetchSlug(),
    staleTime: 5 * 60 * 1000,
  });

  const ships: FleetShip[] = fleet?.ships ?? [];
  const totalHulls = useMemo(() => ships.reduce((s, x) => s + (x.count ?? 1), 0), [ships]);
  const uniqueModels = ships.length;
  const manufacturers = fleet?.manufacturers.length ?? 0;

  const top = useMemo<FleetShip[]>(() => {
    if (ships.length === 0) return [];
    const bySlug = new Map(ships.map((s) => [s.slug, s] as const));
    const featured = PRIORITY_SLUGS.map((slug) => bySlug.get(slug)).filter(
      (s): s is FleetShip => !!s,
    );
    const rest = ships.filter((s) => !PRIORITY_SLUGS.includes(s.slug));
    return [...featured, ...rest].slice(0, 6);
  }, [ships]);

  const fleetyardsUrl = `https://fleetyards.net/fleets/${fleetyardsSlug ?? "idcp"}/ships`;

  const head = useReveal<HTMLDivElement>();
  const slider = useReveal<HTMLDivElement>();
  return (
    <section id="fleet" className="relative overflow-hidden bg-background py-32">
      {/* Hangar parallax backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">
        <img
          src={hangarBg}
          alt=""
          loading="lazy"
          width={1920}
          height={1088}
          className="h-full w-full object-cover opacity-20"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background via-background/70 to-background" />
      </div>

      <div className="relative z-10 mx-auto max-w-7xl px-6">
        <div ref={head} className="reveal mb-12 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-end">
          <div>
            <div className="mb-8 inline-block p-1 border border-brand/30">
              <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
                05 // Flottenregister · Live
              </div>
            </div>
            <h2 className="mb-6 font-display text-3xl leading-tight tracking-tight text-foreground md:text-5xl">
              Hangar <span className="text-brand">// Aktiv.</span>
            </h2>
            <p className="mb-6 text-base text-muted-foreground md:text-lg">
              Von schnellen Solo-Jägern bis zu schweren Capital-Ships — die kollektive Hangar-Power
              der MRC wächst mit jedem neuen Piloten. Jede Hülle ein Werkzeug, jede Crew ein Team.
            </p>
          </div>

          <div>
            <div className="grid grid-cols-3 gap-px border border-brand/10 bg-brand/10">
              <Stat n={totalHulls} label="Schiffe" />
              <Stat n={uniqueModels} label="Modelle" />
              <Stat n={manufacturers} label="Hersteller" />
            </div>
            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                to="/flotte"
                className="hud-corners group inline-flex items-center gap-2 bg-brand px-6 py-3 text-[11px] uppercase tracking-[0.25em] font-bold text-primary-foreground transition-all hover:shadow-[0_0_30px_rgba(255,191,0,0.5)]"
              >
                <span className="size-1.5 bg-primary-foreground group-hover:animate-ping" /> Komplette Flotte
              </Link>
              <a
                href={fleetyardsUrl}
                target="_blank"
                rel="noreferrer"
                className="hud-corners inline-block px-6 py-3 border border-brand/40 text-brand text-[11px] uppercase tracking-[0.25em] font-bold transition-all hover:bg-brand/10"
              >
                Fleetyards ↗
              </a>
            </div>
          </div>
        </div>

        {/* Horizontal hangar slider */}
        <div ref={slider} className="reveal relative -mx-6 px-6">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-background to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-background to-transparent" />
          <div className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-6 [scrollbar-color:var(--brand)_transparent]">
            {top.map((s, i) => (
              <Link
                key={s.slug}
                to="/flotte/$slug"
                params={{ slug: s.slug }}
                className="hud-corners group relative aspect-[16/10] w-[85%] flex-none snap-start overflow-hidden border border-brand/15 bg-black transition-all hover:border-brand/60 hover:shadow-[0_0_30px_rgba(255,191,0,0.2)] sm:w-[420px] md:w-[480px]"
                style={{ transitionDelay: `${i * 80}ms` }}
              >
                {s.image ? (
                  <img
                    src={s.image}
                    alt={`${s.manufacturer ?? ""} ${s.name}`}
                    loading="lazy"
                    className="h-full w-full object-cover opacity-80 transition-all duration-700 group-hover:scale-110 group-hover:opacity-100"
                  />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
                <div className="absolute left-4 top-4 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/80">
                  HÜLLE · 0{i + 1}
                </div>
                <div className="absolute right-4 top-4 border border-brand/40 bg-background/70 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand backdrop-blur">
                  ×{s.count}
                </div>
                <div className="absolute inset-x-4 bottom-4">
                  <div className="mb-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">
                    {s.manufacturer}
                  </div>
                  <div className="font-display text-lg leading-tight text-foreground md:text-xl">
                    {s.name}
                  </div>
                  <div className="mt-2 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                    <span className="h-px w-6 bg-brand" />
                    {s.classification}
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-end gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/50">
            <span>← scroll →</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="bg-background px-4 py-5">
      <div className="font-display text-2xl text-foreground md:text-3xl">{n}</div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">{label}</div>
    </div>
  );
}