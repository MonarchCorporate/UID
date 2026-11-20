import { createFileRoute, Link } from "@tanstack/react-router";
import { AcquisitionCard } from "@/components/catalog/AcquisitionCard";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getShipComponent,
  refreshShipComponent,
} from "@/lib/ship-components.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  ExternalLink,
  Hammer,
  Package,
  RefreshCw,
  ShoppingCart,
  Boxes,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";

function pickLocalizedDescription(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const v =
      obj.de_DE ?? obj.de ?? obj.en_EN ?? obj.en ?? Object.values(obj)[0];
    return typeof v === "string" ? v : null;
  }
  if (typeof value !== "string") return null;
  return value;
}

export const Route = createFileRoute("/_authenticated/schiffskomponenten/$ref")({
  component: ComponentDetailPage,
});

function MappingChip({
  ok,
  label,
  detail,
}: {
  ok: boolean;
  label: string;
  detail: string;
}) {
  return (
    <div
      className={
        "flex items-center gap-2 border p-2 text-xs " +
        (ok
          ? "border-emerald-500/30 bg-emerald-500/5"
          : "border-amber-500/30 bg-amber-500/5")
      }
    >
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
      ) : (
        <AlertTriangle className="h-4 w-4 text-amber-400" />
      )}
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="truncate">{detail}</div>
      </div>
    </div>
  );
}

function ComponentDetailPage() {
  const { ref } = Route.useParams();
  const decoded = decodeURIComponent(ref);
  const fn = useServerFn(getShipComponent);
  const refreshFn = useServerFn(refreshShipComponent);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["ship-component", decoded],
    queryFn: () => fn({ data: { ref: decoded } }),
  });

  const refreshMut = useMutation({
    mutationFn: (uuid: string) => refreshFn({ data: { wiki_uuid: uuid } }),
    onSuccess: () => {
      toast.success("Wiki-Daten aktualisiert");
      qc.invalidateQueries({ queryKey: ["ship-component", decoded] });
      qc.invalidateQueries({ queryKey: ["ship-components"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/schiffskomponenten">
            <ArrowLeft className="mr-1 h-4 w-4" /> zurück zur Übersicht
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Lade Komponente…</div>
      )}
      {error && (
        <div className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {data && (
        <>
          {/* HEADER */}
          <header className="flex flex-col gap-4 border border-brand/15 bg-background/60 p-4 md:flex-row md:items-start">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden border border-brand/10 bg-muted/20">
              {data.image_url ? (
                <img
                  src={data.image_url}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <Package className="h-10 w-10 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-3xl">{data.name}</h1>
                {data.size != null && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    Size {data.size}
                  </Badge>
                )}
                {data.grade && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    Grade {data.grade}
                  </Badge>
                )}
                {data.item_class && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {data.item_class}
                  </Badge>
                )}
                {data.blueprint && (
                  <Badge
                    variant="outline"
                    className="border-amber-400/40 text-[9px] uppercase text-amber-300"
                  >
                    <Hammer className="mr-0.5 h-2.5 w-2.5" /> Blueprint verfügbar
                  </Badge>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {data.manufacturer_name && <span>{data.manufacturer_name}</span>}
                {data.classification_label && (
                  <span className="ml-2 font-mono">
                    · {data.classification_label}
                  </span>
                )}
              </div>
              {(() => {
                const desc = pickLocalizedDescription(data.description);
                return desc ? (
                  <p className="text-sm text-muted-foreground whitespace-pre-line">
                    {desc}
                  </p>
                ) : (
                  <p className="text-sm italic text-muted-foreground/70">
                    Keine Beschreibung verfügbar.
                  </p>
                );
              })()}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                {data.web_url && (
                  <a
                    href={data.web_url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                  >
                    Star-Citizen-Wiki <ExternalLink className="h-3 w-3" />
                  </a>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => refreshMut.mutate(data.wiki_uuid)}
                  disabled={refreshMut.isPending}
                >
                  <RefreshCw
                    className={
                      refreshMut.isPending
                        ? "mr-1 h-3 w-3 animate-spin"
                        : "mr-1 h-3 w-3"
                    }
                  />
                  Daten aktualisieren
                </Button>
              </div>
            </div>
          </header>

          {/* BESCHAFFUNG */}
          <AcquisitionCard itemRef={decoded} name={data.name ?? null} />

          {/* BLUEPRINT */}
          {data.blueprint && (
            <section className="border border-amber-400/30 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300/80">
                    // blueprint vorhanden
                  </div>
                  <div className="font-display text-lg">
                    {data.blueprint.item_name}
                  </div>
                </div>
                <Button asChild size="sm">
                  <Link
                    to="/blueprints/$id"
                    params={{ id: data.blueprint.id }}
                  >
                    <Hammer className="mr-1 h-4 w-4" /> Blueprint öffnen
                  </Link>
                </Button>
              </div>
            </section>
          )}

          {/* MAPPING STATUS */}
          <section className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <MappingChip
              ok={data.mapping.has_wiki_uuid}
              label="Wiki-UUID"
              detail={data.wiki_uuid ? "verknüpft" : "fehlt"}
            />
            <MappingChip
              ok={data.mapping.has_catalog}
              label="Item-Katalog"
              detail={data.mapping.has_catalog ? "eingetragen" : "nicht im Katalog"}
            />
            <MappingChip
              ok={data.mapping.has_blueprint}
              label="Blueprint"
              detail={data.mapping.has_blueprint ? "vorhanden" : "keine"}
            />
            <MappingChip
              ok={data.mapping.unmapped_same_name === 0}
              label="Inventar-Mapping"
              detail={
                data.mapping.unmapped_same_name === 0
                  ? "sauber"
                  : `${data.mapping.unmapped_same_name} ohne Ref`
              }
            />
          </section>

          {/* USED IN */}
          <section className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // verwendet in blueprints ({data.used_in.length})
            </h2>
            {data.used_in.length === 0 ? (
              <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
                Diese Komponente wird aktuell in keinem Blueprint als Material geführt.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {data.used_in.map((u) => (
                  <Link
                    key={u.blueprint_id}
                    to="/blueprints/$id"
                    params={{ id: u.blueprint_id }}
                    className="flex items-center justify-between gap-3 border border-brand/10 bg-background/60 p-3 text-xs hover:border-brand/40"
                  >
                    <span className="min-w-0 flex-1 truncate">{u.item_name}</span>
                    <span className="font-mono text-[11px] text-muted-foreground">
                      × {u.qty}
                      {u.unit ? ` ${u.unit}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>

          {/* INVENTORY / WAREHOUSE */}
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="border border-brand/10 bg-background/60 p-3">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                <Boxes className="h-3 w-3" /> mein inventar (
                {data.my_inventory.length})
              </div>
              {data.my_inventory.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine Stacks im persönlichen Inventar.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.my_inventory.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 border-b border-brand/5 py-1 last:border-b-0"
                    >
                      <span className="truncate text-muted-foreground">
                        {s.location_name ?? "ohne Ort"}
                        {s.quality != null ? ` · Q${s.quality}` : ""}
                      </span>
                      <span className="font-mono">
                        {s.qty}
                        {s.qty_reserved > 0 ? (
                          <span className="ml-1 text-amber-300">
                            ({s.qty_reserved} res.)
                          </span>
                        ) : null}{" "}
                        {s.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border border-brand/10 bg-background/60 p-3">
              <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                <Package className="h-3 w-3" /> orga-lager ({data.org_stock.length})
              </div>
              {data.org_stock.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nicht im Orga-Lager geführt.
                </p>
              ) : (
                <ul className="space-y-1 text-xs">
                  {data.org_stock.map((s) => (
                    <li
                      key={s.id}
                      className="flex items-center justify-between gap-2 border-b border-brand/5 py-1 last:border-b-0"
                    >
                      <span className="truncate text-muted-foreground">
                        {s.org_name ?? "Orga"}
                        {s.quality != null ? ` · Q${s.quality}` : ""}
                        {s.locked ? " · gesperrt" : ""}
                      </span>
                      <span className="font-mono">
                        {s.qty} {s.unit}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* PRICE SUMMARY */}
          <section className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <div className="border border-brand/10 bg-background/60 p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Günstigster Preis
              </div>
              <div className="font-display text-xl">
                {data.min_price_buy && data.min_price_buy > 0
                  ? `${data.min_price_buy.toLocaleString("de-DE")} aUEC`
                  : "—"}
              </div>
            </div>
            <div className="border border-brand/10 bg-background/60 p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Shops
              </div>
              <div className="font-display text-xl">{data.shops.length}</div>
            </div>
            <div className="border border-brand/10 bg-background/60 p-3">
              <div className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                Zuletzt synchronisiert
              </div>
              <div className="text-sm">
                {data.last_synced_at
                  ? new Date(data.last_synced_at).toLocaleString("de-DE")
                  : "—"}
              </div>
            </div>
          </section>

          {/* BASE STATS */}
          {data.stats.length > 0 && (
            <section className="space-y-3">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // basiswerte
              </h2>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                {data.stats.map((g) => (
                  <div
                    key={g.label}
                    className="border border-brand/10 bg-background/60 p-3"
                  >
                    <div className="mb-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                      {g.label}
                    </div>
                    <dl className="space-y-1 text-xs">
                      {g.items.map((it) => (
                        <div
                          key={it.label}
                          className="flex items-baseline justify-between gap-3 border-b border-brand/5 py-0.5 last:border-b-0"
                        >
                          <dt className="text-muted-foreground">{it.label}</dt>
                          <dd className="font-mono text-foreground">
                            {it.value}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* SHOPS */}
          <section className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // shops &amp; terminals ({data.shops.length})
            </h2>
            {data.shops.length === 0 ? (
              <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
                Keine Shops bekannt – evtl. nur als Schiffs-Standardausstattung
                oder Belohnung erhältlich.
              </p>
            ) : (
              <div className="border border-brand/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 font-mono uppercase tracking-wider text-[9px] text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Terminal</th>
                      <th className="p-2 text-left">Standort</th>
                      <th className="p-2 text-left">System</th>
                      <th className="p-2 text-right">Kauf</th>
                      <th className="p-2 text-right">Verkauf</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...data.shops]
                      .sort((a, b) => {
                        const av = a.price_buy ?? Infinity;
                        const bv = b.price_buy ?? Infinity;
                        return av - bv;
                      })
                      .map((s, i) => (
                        <tr
                          key={`${s.terminal_code}-${i}`}
                          className="border-t border-brand/10 hover:bg-muted/10"
                        >
                          <td className="p-2 font-display">
                            {s.terminal_name ?? "—"}
                          </td>
                          <td className="p-2">
                            {s.location ?? "—"}
                            {s.parent && (
                              <span className="text-muted-foreground">
                                {" "}
                                · {s.parent}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground">
                            {s.system ?? "—"}
                          </td>
                          <td className="p-2 text-right font-mono">
                            {s.price_buy != null && s.price_buy > 0
                              ? `${s.price_buy.toLocaleString("de-DE")} aUEC`
                              : "—"}
                          </td>
                          <td className="p-2 text-right font-mono text-muted-foreground">
                            {s.price_sell != null && s.price_sell > 0
                              ? `${s.price_sell.toLocaleString("de-DE")} aUEC`
                              : "—"}
                          </td>
                          <td className="p-2 text-right">
                            {s.uex_link && (
                              <a
                                href={s.uex_link}
                                target="_blank"
                                rel="noreferrer"
                                className="text-brand hover:underline"
                                title="UEX öffnen"
                              >
                                <ExternalLink className="inline h-3 w-3" />
                              </a>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            <ShoppingCart className="mr-1 inline h-3 w-3" />
            Preise via UEX · Stand laut Wiki.
          </p>
        </>
      )}
    </div>
  );
}