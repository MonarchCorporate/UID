import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listPublicOrgFleet, type PublicOrgFleetShip } from "@/lib/public-org.functions";
import { Route as OrgRoute } from "./$slug";

export const Route = createFileRoute("/o/$slug/flotte")({
  head: ({ params }) => ({
    meta: [
      { title: `Flotte · ${params.slug}` },
      { property: "og:title", content: `Flotte · ${params.slug}` },
    ],
  }),
  component: OrgFleetPage,
});

function OrgFleetPage() {
  const { org } = OrgRoute.useLoaderData();
  const fn = useServerFn(listPublicOrgFleet);
  const q = useQuery({
    queryKey: ["public-org-fleet", org.slug],
    queryFn: () => fn({ data: { slug: org.slug } }),
  });
  const [search, setSearch] = useState("");
  const ships = q.data?.ships ?? [];
  const filtered = useMemo(() => {
    const n = search.trim().toLowerCase();
    if (!n) return ships;
    return ships.filter((s) =>
      `${s.name} ${s.manufacturer ?? ""}`.toLowerCase().includes(n),
    );
  }, [ships, search]);
  const totalUnits = filtered.reduce((a, s) => a + s.count, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 pt-16">
      <div className="mb-8">
        <div className="mb-2 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // Fleet
          </div>
        </div>
        <h1 className="font-display text-5xl tracking-tight">Orgaflotte</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Alle registrierten Schiffe der Mitglieder von {org.name}.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Schiff oder Hersteller suchen…"
          className="w-full max-w-md border border-brand/20 bg-background px-4 py-3 text-sm focus:border-brand focus:outline-none"
        />
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/70">
          {filtered.length} Modelle · {totalUnits} Einheiten
        </div>
      </div>

      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : filtered.length === 0 ? (
        <div className="border border-brand/10 p-12 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
          // keine schiffe
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <ShipCard key={s.slug} s={s} />
          ))}
        </div>
      )}
    </main>
  );
}

function ShipCard({ s }: { s: PublicOrgFleetShip }) {
  return (
    <div className="group relative flex flex-col border border-brand/10 bg-gradient-to-br from-background via-background to-black/40 transition-all hover:border-brand/50">
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
        {s.image ? (
          <img
            src={s.image}
            alt={`${s.manufacturer ?? ""} ${s.name}`}
            loading="lazy"
            className="h-full w-full object-cover opacity-90 transition-all duration-500 group-hover:scale-105"
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
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="font-display text-base leading-tight">{s.name}</h3>
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/80">
          {s.manufacturer}
        </div>
        <div className="mt-auto grid grid-cols-3 gap-2 border-t border-brand/10 pt-3 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground/70">
          <Stat label="Klasse" value={s.classification} />
          <Stat label="Größe" value={s.size} />
          <Stat label="Crew" value={s.crew} />
        </div>
      </div>
    </div>
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