import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Coins, FileText, Megaphone, Package } from "lucide-react";
import type { ReactNode } from "react";
import { getAcquisition } from "@/lib/acquisition.functions";
import { ago } from "@/components/dashboard/DataStatusBadge";

const fmt = (n: number) => new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(n);

/**
 * „So kommst du dran“: kaufen, craften, Orga-Lager, Schwarzes Brett – auf
 * einen Blick für Items, Materialien und Schiffskomponenten.
 */
export function AcquisitionCard({ itemRef, name }: { itemRef: string | null; name?: string | null }) {
  const fn = useServerFn(getAcquisition);
  const { data, isLoading } = useQuery({
    queryKey: ["acquisition", itemRef, name ?? null],
    queryFn: () => fn({ data: { ref: itemRef, name: name ?? null } }),
    staleTime: 5 * 60_000,
  });

  if (isLoading) {
    return (
      <section aria-label="So kommst du dran" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="uid-card h-36 animate-pulse rounded-xl" />
        ))}
      </section>
    );
  }
  if (!data) return null;

  const bp = data.craft.blueprints[0];
  const missionCount = data.craft.blueprints.reduce((s, b) => s + b.missions, 0);

  return (
    <section aria-labelledby="acq-title">
      <h2 id="acq-title" className="mb-3 font-display text-sm text-muted-foreground">
        So kommst du dran
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Tile icon={<Coins className="h-4 w-4" />} title="Kaufen" active={!!data.buy}>
          {data.buy ? (
            <>
              <Big>
                ab {fmt(data.buy.price)} <span className="text-sm text-muted-foreground">aUEC</span>
              </Big>
              <p className="mt-1 text-sm text-foreground/90">{data.buy.terminal}</p>
              <p className="text-xs text-muted-foreground">{data.buy.location}</p>
              <p className="mt-2 text-xs text-muted-foreground">
                {data.buy.count > 1 ? `an ${data.buy.count} Terminals · ` : ""}Preis {ago(data.buy.updated)}
              </p>
            </>
          ) : (
            <Empty>Bei keinem Händler gelistet.</Empty>
          )}
          {data.sell && (
            <p className="mt-2 border-t border-brand/10 pt-2 text-xs text-muted-foreground">
              Verkauf bis <span className="text-foreground">{fmt(data.sell.price)} aUEC</span> · {data.sell.terminal}
            </p>
          )}
        </Tile>

        <Tile icon={<FileText className="h-4 w-4" />} title="Craften" active={!!bp}>
          {bp ? (
            <>
              <Link
                to="/blueprints/$id"
                params={{ id: bp.id }}
                className="focus-ring block truncate text-sm text-foreground hover:text-brand"
              >
                {bp.name}
                {bp.outputQty > 1 ? ` ×${bp.outputQty}` : ""}
              </Link>
              <p className="mt-1 text-xs text-muted-foreground">
                {missionCount > 0
                  ? `Blueprint aus ${missionCount} Mission${missionCount === 1 ? "" : "en"}:`
                  : bp.isDefault
                    ? "Standard-Blueprint, von Anfang an verfügbar."
                    : "Freischaltung unbekannt."}
              </p>
              <ul className="mt-1.5 space-y-1">
                {data.craft.missions.slice(0, 3).map((m) => (
                  <li key={m.uuid}>
                    <Link
                      to="/missions/$uuid"
                      params={{ uuid: m.uuid }}
                      className="focus-ring block truncate text-xs text-brand/90 hover:text-brand"
                    >
                      {m.title}
                      {m.giver ? <span className="text-muted-foreground"> · {m.giver}</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty>Kein Blueprint bekannt.</Empty>
          )}
        </Tile>

        <Tile icon={<Package className="h-4 w-4" />} title="In der Orga" active={!!data.org?.available || data.members.holders > 0}>
          {data.org && data.org.available > 0 ? (
            <Big>
              {fmt(data.org.available)} <span className="text-sm text-muted-foreground">{data.org.unit ?? "Stk."} im Lager</span>
            </Big>
          ) : (
            <Empty>Nicht im Orga-Lager.</Empty>
          )}
          {data.members.holders > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Bei {data.members.holders} Mitglied{data.members.holders === 1 ? "" : "ern"} im Inventar ({fmt(data.members.qty)})
            </p>
          )}
          <Link
            to={data.org && data.org.available > 0 ? "/orga/lager" : "/orga/bestellen"}
            className="focus-ring mt-3 inline-block rounded-md border border-brand/30 px-2.5 py-1 text-xs text-brand hover:bg-brand/10"
          >
            {data.org && data.org.available > 0 ? "Zum Orga-Lager" : "Bei der Orga anfragen"}
          </Link>
        </Tile>

        <Tile icon={<Megaphone className="h-4 w-4" />} title="Schwarzes Brett" active={data.market.length > 0}>
          {data.market.length ? (
            <ul className="space-y-1.5">
              {data.market.map((m) => (
                <li key={m.id}>
                  <Link
                    to="/marketplace/$id"
                    params={{ id: m.id }}
                    className="focus-ring block truncate text-sm text-foreground hover:text-brand"
                  >
                    {m.title}
                  </Link>
                  <span className="text-xs text-muted-foreground">
                    {m.type}
                    {m.price != null ? ` · ${fmt(m.price)} aUEC` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Keine offenen Angebote.</Empty>
          )}
          <Link
            to="/marketplace/new"
            className="focus-ring mt-3 inline-block rounded-md border border-brand/30 px-2.5 py-1 text-xs text-brand hover:bg-brand/10"
          >
            Gesuch aufgeben
          </Link>
        </Tile>
      </div>
    </section>
  );
}

function Tile({ icon, title, active, children }: { icon: ReactNode; title: string; active: boolean; children: ReactNode }) {
  return (
    <div className={`uid-card flex flex-col rounded-xl p-4 ${active ? "" : "opacity-80"}`}>
      <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-md border ${
            active ? "border-brand/40 bg-brand/10 text-brand" : "border-border text-muted-foreground"
          }`}
        >
          {icon}
        </span>
        {title}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

const Big = ({ children }: { children: ReactNode }) => (
  <div className="font-display text-xl leading-tight text-foreground">{children}</div>
);
const Empty = ({ children }: { children: ReactNode }) => <p className="text-sm text-muted-foreground">{children}</p>;
