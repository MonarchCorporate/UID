import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueries } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { ShipCatalogSummary } from "@/lib/ship-catalog.functions";
import { getShipDetails, type ShipDetails } from "@/lib/ship-details.functions";
import { proxyImage } from "@/lib/proxy-image";
import { lookupShops } from "@/lib/in-game-shops";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ships: ShipCatalogSummary[];
};

const fmtUec = (n: number | null) =>
  n === null ? null : `${new Intl.NumberFormat("de-DE").format(n)} aUEC`;
const fmtUsd = (n: number | null) =>
  n === null ? null : `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n)}`;

function formatSizes(buckets: Record<number, number> | null | undefined): string | null {
  if (!buckets) return null;
  const keys = Object.keys(buckets)
    .map((k) => Number(k))
    .filter((k) => buckets[k] > 0)
    .sort((a, b) => a - b);
  if (keys.length === 0) return null;
  return keys.map((sz) => `${buckets[sz]}× S${sz}`).join(" · ");
}

function sumBuckets(buckets: Record<number, number> | null | undefined): number | null {
  if (!buckets) return null;
  return Object.values(buckets).reduce((a, b) => a + b, 0);
}

function maxSize(buckets: Record<number, number> | null | undefined): number | null {
  if (!buckets) return null;
  const sizes = Object.keys(buckets)
    .map((k) => Number(k))
    .filter((k) => buckets[k] > 0);
  return sizes.length ? Math.max(...sizes) : null;
}

export function CompareDialog({ open, onOpenChange, ships }: Props) {
  const fetchDetails = useServerFn(getShipDetails);
  const detailQueries = useQueries({
    queries: ships.map((s) => ({
      queryKey: ["ship-details", s.slug],
      queryFn: () => fetchDetails({ data: { slug: s.slug } }),
      enabled: open,
      staleTime: 10 * 60 * 1000,
    })),
  });
  const details: Array<ShipDetails | null> = detailQueries.map((q) => q.data ?? null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto border-brand/30 bg-background">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">
            Schiffe vergleichen
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-40 border-b border-brand/20 p-2 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-brand/60" />
                {ships.map((s) => (
                  <ShipHeaderCell key={s.slug} s={s} />
                ))}
              </tr>
            </thead>
            <tbody>
              <SectionHeader colSpan={ships.length} title="Basisspecs" />
              <Row label="Hersteller" values={ships.map((s) => s.manufacturer)} />
              <Row
                label="Klasse"
                values={ships.map((s) => s.classificationLabel ?? s.classification)}
              />
              <Row label="Größe" values={ships.map((s) => s.sizeLabel ?? s.size)} />
              <Row
                label="Länge"
                values={ships.map((s) => (s.lengthM !== null ? `${s.lengthM} m` : null))}
                numericValues={ships.map((s) => s.lengthM)}
                highlight="max"
              />
              <Row
                label="Crew (max)"
                values={ships.map((s) => (s.crewMax !== null ? String(s.crewMax) : null))}
                numericValues={ships.map((s) => s.crewMax)}
                highlight="max"
              />
              <Row
                label="Cargo"
                values={ships.map((s) => (s.cargoScu !== null ? `${s.cargoScu} SCU` : null))}
                numericValues={ships.map((s) => s.cargoScu)}
                highlight="max"
              />

              <SectionHeader colSpan={ships.length} title="Bewaffnung" />
              <Row
                label="Fixe Waffen"
                values={details.map((d) => formatSizes(d?.weaponsBySize))}
                numericValues={details.map((d) => sumBuckets(d?.weaponsBySize))}
                highlight="max"
                loading={detailQueries.map((q) => q.isLoading)}
              />
              <Row
                label="Max. Waffengröße"
                values={details.map((d) => {
                  const m = maxSize(d?.weaponsBySize);
                  return m !== null ? `S${m}` : null;
                })}
                numericValues={details.map((d) => maxSize(d?.weaponsBySize))}
                highlight="max"
                loading={detailQueries.map((q) => q.isLoading)}
              />
              <Row
                label="Turrets"
                values={details.map((d) => {
                  const sized = formatSizes(d?.turretsBySize);
                  if (sized) return sized;
                  return d?.turrets != null ? String(d.turrets) : null;
                })}
                numericValues={details.map(
                  (d) => sumBuckets(d?.turretsBySize) ?? d?.turrets ?? null,
                )}
                highlight="max"
                loading={detailQueries.map((q) => q.isLoading)}
              />
              <Row
                label="davon bemannt"
                values={details.map((d) =>
                  d?.mannedTurrets != null ? String(d.mannedTurrets) : null,
                )}
                numericValues={details.map((d) => d?.mannedTurrets ?? null)}
                highlight="max"
                loading={detailQueries.map((q) => q.isLoading)}
              />
              <Row
                label="Missile Racks"
                values={details.map((d) => {
                  const sized = formatSizes(d?.missileRacksBySize);
                  if (sized) return sized;
                  return d?.missileRacks != null ? String(d.missileRacks) : null;
                })}
                numericValues={details.map(
                  (d) => sumBuckets(d?.missileRacksBySize) ?? d?.missileRacks ?? null,
                )}
                highlight="max"
                loading={detailQueries.map((q) => q.isLoading)}
              />

              <SectionHeader colSpan={ships.length} title="Preise" />
              <Row
                label="In-Game"
                values={ships.map((s) =>
                  fmtUec(s.priceUec ?? lookupShops(s.name)?.basePrice ?? null),
                )}
                numericValues={ships.map(
                  (s) => s.priceUec ?? lookupShops(s.name)?.basePrice ?? null,
                )}
                highlight="min"
              />
              <Row
                label="Pledge"
                values={ships.map((s) => fmtUsd(s.pledgePriceUsd))}
                numericValues={ships.map((s) => s.pledgePriceUsd)}
                highlight="min"
              />

              <SectionHeader colSpan={ships.length} title="Verfügbarkeit" />
              <tr>
                <td className="border-b border-brand/10 p-2 align-top font-mono text-[10px] uppercase tracking-[0.2em] text-brand/60">
                  In-Game-Shops
                </td>
                {ships.map((s) => {
                  const info = lookupShops(s.name);
                  return (
                    <td
                      key={s.slug}
                      className="border-b border-brand/10 p-2 align-top text-xs text-foreground/90"
                    >
                      {info && info.shops.length > 0 ? (
                        <ul className="space-y-0.5">
                          {info.shops.map((sh) => (
                            <li key={sh.name}>
                              {sh.name}
                              <span className="text-muted-foreground/70"> · {sh.location}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-muted-foreground/50">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>

              <tr>
                <td />
                {ships.map((s) => (
                  <td key={s.slug} className="p-2 pt-4">
                    <Link
                      to="/flotte/$slug"
                      params={{ slug: s.slug }}
                      className="inline-block border border-brand/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand/10"
                    >
                      Detailseite →
                    </Link>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ShipHeaderCell({ s }: { s: ShipCatalogSummary }) {
  const img = proxyImage(s.image);
  return (
    <th className="border-b border-brand/20 p-2 align-bottom text-left">
      <div className="aspect-[16/10] w-full overflow-hidden bg-black">
        {img ? (
          <img src={img} alt="" className="h-full w-full object-cover" />
        ) : null}
      </div>
      <div className="mt-2 font-display text-base leading-tight text-foreground">
        {s.name}
      </div>
      <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/80">
        {s.manufacturer ?? "—"}
      </div>
    </th>
  );
}

function SectionHeader({ colSpan, title }: { colSpan: number; title: string }) {
  return (
    <tr>
      <td
        colSpan={colSpan + 1}
        className="border-b border-brand/30 bg-brand/5 px-2 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand"
      >
        // {title}
      </td>
    </tr>
  );
}

function Row({
  label,
  values,
  numericValues,
  highlight,
  loading,
}: {
  label: string;
  values: Array<string | null>;
  numericValues?: Array<number | null>;
  highlight?: "min" | "max";
  loading?: boolean[];
}) {
  let bestIdx = -1;
  if (highlight && numericValues) {
    const present = numericValues
      .map((v, i) => ({ v, i }))
      .filter((x) => x.v !== null && x.v !== undefined) as Array<{ v: number; i: number }>;
    if (present.length > 1) {
      const best = present.reduce((acc, cur) =>
        highlight === "max" ? (cur.v > acc.v ? cur : acc) : cur.v < acc.v ? cur : acc,
      );
      // only highlight if there's actual variance
      if (present.some((p) => p.v !== best.v)) bestIdx = best.i;
    }
  }
  return (
    <tr>
      <td className="border-b border-brand/10 p-2 align-top font-mono text-[10px] uppercase tracking-[0.2em] text-brand/60">
        {label}
      </td>
      {values.map((v, i) => {
        const isLoading = loading?.[i];
        const isBest = i === bestIdx;
        return (
          <td
            key={i}
            className={`border-b border-brand/10 p-2 align-top text-sm ${
              isBest ? "font-medium text-brand" : "text-foreground/90"
            }`}
          >
            {isLoading ? (
              <span className="inline-block h-3 w-12 animate-pulse bg-brand/20" />
            ) : v !== null ? (
              <>
                {v}
                {isBest ? <span className="ml-1 text-[9px]">▲</span> : null}
              </>
            ) : (
              <span className="text-muted-foreground/50">—</span>
            )}
          </td>
        );
      })}
    </tr>
  );
}