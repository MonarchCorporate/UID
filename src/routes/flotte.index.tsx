import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { UidPage } from "@/components/uid/UidPage";
import logo from "@/assets/idcp-logo.png.asset.json";
import {
  listPublicFleetsByOrg,
  type PublicFleetOrg,
  type PublicOrgFleetShip,
} from "@/lib/public-org.functions";

export const Route = createFileRoute("/flotte/")({
  head: () => ({
    meta: [
      { title: "Flotte — UID Vereinigte Interstellare Dienste" },
      {
        name: "description",
        content:
          "Live-Übersicht der UID-Flotte: die Hangars aller Orgas der UID, sauber nach Organisation geclustert — von Solo-Jägern bis Capital-Ships.",
      },
      { property: "og:title", content: "UID Flotte — Fleet Registry" },
      {
        property: "og:description",
        content:
          "Die Flotten aller Orgas der UID auf einen Blick — pro Organisation geclustert.",
      },
      { property: "og:image", content: logo.url },
      { name: "twitter:image", content: logo.url },
    ],
    links: [{ rel: "canonical", href: "/flotte" }],
  }),
  component: FleetPage,
});

function FleetPage() {
  const fetchFleets = useServerFn(listPublicFleetsByOrg);
  const { data } = useQuery({
    queryKey: ["public-fleets-by-org"],
    queryFn: () => fetchFleets(),
    staleTime: 5 * 60 * 1000,
  });

  const orgs = (data?.orgs ?? []).filter((o) => o.ships.length > 0);
  const totalHulls = orgs.reduce((a, o) => a + o.totalHulls, 0);
  const uniqueModels = new Set(orgs.flatMap((o) => o.ships.map((s) => s.slug))).size;
  const manufacturersCount = new Set(
    orgs.flatMap((o) => o.ships.map((s) => s.manufacturer).filter(Boolean)),
  ).size;
  const orgCount = orgs.length;

  return (
    <UidPage backdrop="grid" seed={3301}>
      <div className="pt-16">
        <section className="mx-auto max-w-7xl px-6 pb-12">
          <div className="mb-8 inline-block p-1 border border-brand/30">
            <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              Fleet Registry // Live Sync
            </div>
          </div>
          <h1 className="mb-6 font-display text-4xl leading-tight tracking-tight text-foreground md:text-6xl">
            Die <span className="text-brand">UID</span>-Flotten
          </h1>
          <p className="max-w-3xl text-base text-muted-foreground md:text-lg">
            Jede Orga der UID führt ihren eigenen Hangar. Hier siehst du die Flotten nach
            Organisation geclustert — jedes Schiff gehört einem Mitglied der jeweiligen Orga.
          </p>

          <div className="mt-12 grid grid-cols-2 gap-px border border-brand/10 bg-brand/10 md:grid-cols-4">
            <div className="bg-background p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // hulls
              </div>
              <div className="mt-2 font-display text-3xl text-foreground">{totalHulls}</div>
              <div className="mt-1 text-xs text-muted-foreground">Schiffe gesamt</div>
            </div>
            <div className="bg-background p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // models
              </div>
              <div className="mt-2 font-display text-3xl text-foreground">{uniqueModels}</div>
              <div className="mt-1 text-xs text-muted-foreground">Einzigartige Modelle</div>
            </div>
            <div className="bg-background p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // brands
              </div>
              <div className="mt-2 font-display text-3xl text-foreground">{manufacturersCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Hersteller vertreten</div>
            </div>
            <div className="bg-background p-6">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // orgs
              </div>
              <div className="mt-2 font-display text-3xl text-foreground">{orgCount}</div>
              <div className="mt-1 text-xs text-muted-foreground">Orgas mit Hangar</div>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl space-y-16 px-6 pb-32">
          {orgs.length === 0 ? (
            <div className="border border-brand/10 p-12 text-center font-mono text-xs uppercase tracking-[0.2em] text-muted-foreground">
              // keine flottendaten
            </div>
          ) : (
            orgs.map((o) => <OrgFleetCluster key={o.slug} org={o} />)
          )}
          <p className="border-t border-brand/10 pt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
            Daten: Hangar-Registrierungen der Mitglieder & Fleetyards-Sync der Orgas.
          </p>
        </section>
      </div>
    </UidPage>
  );
}

function OrgFleetCluster({ org }: { org: PublicFleetOrg }) {
  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-brand/10 pb-4">
        <div className="flex items-center gap-4">
          {org.logoUrl ? (
            <img
              src={org.logoUrl}
              alt={org.name}
              loading="lazy"
              className="size-12 shrink-0 border border-brand/20 object-contain"
            />
          ) : null}
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              {org.tag ? `// ${org.tag}` : "// org"}
            </div>
            <h2 className="font-display text-2xl leading-tight text-foreground md:text-3xl">
              {org.name}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/80">
          <span>{org.ships.length} Modelle</span>
          <span className="text-brand">{org.totalHulls} Schiffe</span>
          <Link
            to="/o/$slug/flotte"
            params={{ slug: org.slug }}
            className="border border-brand/40 px-4 py-2 font-bold text-brand transition-colors hover:bg-brand hover:text-primary-foreground"
          >
            Hangar ↗
          </Link>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {org.ships.slice(0, 8).map((s) => (
          <ShipCard key={`${org.slug}-${s.slug}`} s={s} />
        ))}
      </div>
      {org.ships.length > 8 ? (
        <div className="mt-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/60">
          + {org.ships.length - 8} weitere Modelle im Hangar
        </div>
      ) : null}
    </div>
  );
}

function ShipCard({ s }: { s: PublicOrgFleetShip }) {
  return (
    <Link
      to="/flotte/$slug"
      params={{ slug: s.slug }}
      className="group relative flex flex-col border border-brand/10 bg-gradient-to-br from-background via-background to-black/40 transition-all hover:border-brand/50"
    >
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
        {s.count > 1 ? (
          <div className="absolute right-2 top-2 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.2em] text-brand backdrop-blur">
            ×{s.count}
          </div>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display text-base leading-tight text-foreground transition-colors group-hover:text-brand">
          {s.name}
        </h3>
        <div className="text-[11px] uppercase tracking-[0.15em] text-muted-foreground/80">
          {s.manufacturer}
        </div>
        <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.2em] text-brand/60">
          {s.classification ?? "—"}
        </div>
      </div>
    </Link>
  );
}