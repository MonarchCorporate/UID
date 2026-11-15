import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  Package,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Warehouse,
  Boxes,
  Wrench,
  Hammer,
  ShoppingCart,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getItemDetail } from "@/lib/item-catalog.functions";
import { getWikiItemDetail, type WikiItemDetail } from "@/lib/items-wiki-sync.functions";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const Route = createFileRoute("/_authenticated/items/$ref")({
  component: ItemDetailPage,
});

function ItemDetailPage() {
  const { ref } = Route.useParams();
  const decoded = decodeURIComponent(ref);
  const fn = useServerFn(getItemDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["item-detail", decoded],
    queryFn: () => fn({ data: { item_ref: decoded } }),
  });
  const wikiFn = useServerFn(getWikiItemDetail);
  const { data: wiki, isLoading: wikiLoading } = useQuery({
    queryKey: ["item-wiki-detail", decoded],
    queryFn: () => wikiFn({ data: { item_ref: decoded } }),
    staleTime: 30 * 60 * 1000,
  });

  return (
    <div className="container max-w-6xl space-y-6 py-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/items">
            <ArrowLeft className="mr-1 h-4 w-4" /> zurück zum Item-Katalog
          </Link>
        </Button>
      </div>

      {isLoading && <LoadingScreen label="Item wird geladen" />}
      {error && (
        <div className="border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {(error as Error).message}
        </div>
      )}

      {data && !data.catalog && !data.component && (
        <div className="border border-brand/15 p-6 text-sm text-muted-foreground">
          <p className="mb-2 font-display text-base">
            Kein Katalogeintrag für <span className="font-mono">{decoded}</span>
          </p>
          <p>
            Dieses Item-Ref ist nirgends im Katalog registriert. Möglicherweise
            wurde es entfernt oder es fehlt ein Sync.
          </p>
        </div>
      )}

      {data && (data.catalog || data.component) && (
        <>
          {/* HEADER */}
          <Header data={data} wiki={wiki ?? null} />

          {/* MAPPING STATUS */}
          <MappingSection data={data} decoded={decoded} />

          {/* WIKI DETAILS */}
          <WikiSection wiki={wiki ?? null} loading={wikiLoading} />

          {/* SHOPS (Bezugsquellen aus UEX via Wiki) */}
          <Section
            icon={<ShoppingCart className="h-3.5 w-3.5" />}
            title={`bezugsquellen (${data.catalog?.shops?.length ?? 0})`}
          >
            {!data.catalog?.shops || data.catalog.shops.length === 0 ? (
              <Empty text="Keine bekannten Verkaufsstellen. Preise/Terminals werden über den Wiki-Sync gepflegt." />
            ) : (
              <div className="border border-brand/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Terminal</th>
                      <th className="p-2 text-left">Ort</th>
                      <th className="p-2 text-left">System</th>
                      <th className="p-2 text-right">Kauf</th>
                      <th className="p-2 text-right">Verkauf</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.catalog.shops.map((s, i) => (
                      <tr key={i} className="border-t border-brand/10">
                        <td className="p-2">{s.terminal_name ?? s.terminal_code ?? "—"}</td>
                        <td className="p-2 text-muted-foreground">
                          {[s.location, s.parent].filter(Boolean).join(" · ") || "—"}
                        </td>
                        <td className="p-2 text-muted-foreground">{s.system ?? "—"}</td>
                        <td className="p-2 text-right font-mono">
                          {s.price_buy != null
                            ? `${Math.round(s.price_buy).toLocaleString("de-DE")}`
                            : "—"}
                        </td>
                        <td className="p-2 text-right font-mono text-muted-foreground">
                          {s.price_sell != null
                            ? `${Math.round(s.price_sell).toLocaleString("de-DE")}`
                            : "—"}
                        </td>
                        <td className="p-2 text-right">
                          {s.uex_link && (
                            <a
                              href={s.uex_link}
                              target="_blank"
                              rel="noreferrer"
                              className="text-brand hover:underline"
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
          </Section>

          {/* PRODUCED BY */}
          <Section
            icon={<Hammer className="h-3.5 w-3.5" />}
            title={`hergestellt via blueprint (${data.produced_by.length})`}
          >
            {data.produced_by.length === 0 ? (
              <Empty text="Keine Blaupause erzeugt dieses Item als Output." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {data.produced_by.map((b) => (
                  <Link
                    key={b.id}
                    to="/blueprints/$id"
                    params={{ id: b.id }}
                    className="flex items-center justify-between border border-brand/10 bg-background/60 p-3 text-sm hover:border-brand/40 hover:bg-background"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-display">{b.item_name}</span>
                      {b.is_default && (
                        <Badge variant="outline" className="text-[9px] uppercase">
                          default
                        </Badge>
                      )}
                      {b.source && (
                        <Badge variant="outline" className="text-[9px] uppercase">
                          {b.source}
                        </Badge>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      × {b.output_qty}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* USED IN */}
          <Section
            icon={<Wrench className="h-3.5 w-3.5" />}
            title={`wird als komponente verwendet (${data.used_in.length})`}
          >
            {data.used_in.length === 0 ? (
              <Empty text="Wird in keiner Blaupause als Zutat benötigt." />
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {data.used_in.map((u) => (
                  <Link
                    key={u.blueprint_id}
                    to="/blueprints/$id"
                    params={{ id: u.blueprint_id }}
                    className="flex items-center justify-between border border-brand/10 bg-background/60 p-3 text-sm hover:border-brand/40 hover:bg-background"
                  >
                    <span className="font-display">{u.item_name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {u.qty}
                      {u.unit ? ` ${u.unit}` : ""}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          {/* MY INVENTORY */}
          <Section
            icon={<Boxes className="h-3.5 w-3.5" />}
            title={`mein inventar (${data.my_inventory.length})`}
          >
            {data.my_inventory.length === 0 ? (
              <Empty text="Du hast dieses Item aktuell nicht im Inventar." />
            ) : (
              <div className="border border-brand/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Lagerort</th>
                      <th className="p-2 text-left">Qualität</th>
                      <th className="p-2 text-left">Sichtbar</th>
                      <th className="p-2 text-right">Menge</th>
                      <th className="p-2 text-right">Reserviert</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.my_inventory.map((r) => (
                      <tr key={r.id} className="border-t border-brand/10">
                        <td className="p-2">{r.location_name ?? "—"}</td>
                        <td className="p-2 font-mono text-muted-foreground">
                          {r.quality ?? "—"}
                        </td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[9px] uppercase">
                            {r.visibility}
                          </Badge>
                        </td>
                        <td className="p-2 text-right font-mono">
                          {r.qty} {r.unit}
                        </td>
                        <td className="p-2 text-right font-mono text-muted-foreground">
                          {r.qty_reserved}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* ORG WAREHOUSE */}
          <Section
            icon={<Warehouse className="h-3.5 w-3.5" />}
            title={`orga-lager (${data.org_stock.length})`}
          >
            {data.org_stock.length === 0 ? (
              <Empty text="Kein Bestand in deinen Orga-Lagern." />
            ) : (
              <div className="border border-brand/10 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/30 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="p-2 text-left">Orga</th>
                      <th className="p-2 text-left">Qualität</th>
                      <th className="p-2 text-left">Status</th>
                      <th className="p-2 text-right">Menge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.org_stock.map((r) => (
                      <tr key={r.id} className="border-t border-brand/10">
                        <td className="p-2 font-display">
                          {r.org_name ?? r.org_id.slice(0, 8)}
                        </td>
                        <td className="p-2 font-mono text-muted-foreground">
                          {r.quality ?? "—"}
                        </td>
                        <td className="p-2">
                          {r.locked ? (
                            <Badge variant="outline" className="border-amber-500/40 text-amber-300 text-[9px] uppercase">
                              gesperrt
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[9px] uppercase">
                              frei
                            </Badge>
                          )}
                        </td>
                        <td className="p-2 text-right font-mono">
                          {r.qty} {r.unit}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}

type Detail = NonNullable<Awaited<ReturnType<typeof getItemDetail>>>;

function Header({ data, wiki }: { data: Detail; wiki: WikiItemDetail | null }) {
  const c = data.catalog;
  const comp = data.component;
  const name = c?.name ?? comp?.name ?? "Unbenanntes Item";
  const image =
    c?.image_url ??
    comp?.image_url ??
    wiki?.images?.[0]?.thumbnail_url ??
    wiki?.images?.[0]?.original_url ??
    null;
  const kind = c?.kind ?? comp?.type_label ?? comp?.category ?? null;
  return (
    <header className="flex flex-col gap-4 border border-brand/15 bg-background/60 p-4 md:flex-row md:items-start">
      <div className="flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden border border-brand/10 bg-muted/20">
        {image ? (
          <img src={image} alt="" className="h-full w-full object-cover" />
        ) : (
          <Package className="h-10 w-10 text-muted-foreground" />
        )}
      </div>
      <div className="flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-3xl">{name}</h1>
          {kind && (
            <Badge variant="outline" className="text-[9px] uppercase">
              {kind}
            </Badge>
          )}
          {c?.unit && (
            <Badge variant="outline" className="text-[9px] uppercase">
              {c.unit}
            </Badge>
          )}
          {c?.source && (
            <Badge variant="outline" className="text-[9px] uppercase">
              {c.source}
            </Badge>
          )}
          {comp?.manufacturer && (
            <Badge variant="outline" className="text-[9px] uppercase">
              {comp.manufacturer}
            </Badge>
          )}
          {!comp?.manufacturer && c?.manufacturer && (
            <Badge variant="outline" className="text-[9px] uppercase">
              {c.manufacturer}
            </Badge>
          )}
          {comp?.size != null && (
            <Badge variant="outline" className="text-[9px] uppercase">
              Size {comp.size}
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-4 font-mono text-[11px] text-muted-foreground">
          <span>item_ref: {c?.item_ref ?? comp?.item_ref}</span>
          {c?.weight != null && <span>weight: {c.weight}</span>}
          {c?.price_buy != null && (
            <span>K: {Math.round(c.price_buy).toLocaleString("de-DE")} aUEC</span>
          )}
          {c?.price_sell != null && (
            <span>V: {Math.round(c.price_sell).toLocaleString("de-DE")} aUEC</span>
          )}
          {c?.shops_count ? <span>{c.shops_count} shops</span> : null}
        </div>
        {c?.description && (
          <p className="whitespace-pre-line text-sm text-muted-foreground">
            {c.description}
          </p>
        )}
        <div className="flex flex-wrap gap-3 pt-1 text-xs">
          {c?.name && (
            <a
              href={`https://starcitizen.tools/${encodeURIComponent(c.name)}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              Wiki <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {comp?.web_url && (
            <a
              href={comp.web_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              Komponente <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {!comp?.web_url && c?.web_url && (
            <a
              href={c.web_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              Wiki-Detail <ExternalLink className="h-3 w-3" />
            </a>
          )}
          {c && (
            <Link
              to="/materialien/$ref"
              params={{ ref: c.item_ref }}
              className="inline-flex items-center gap-1 text-brand hover:underline"
            >
              Farming/Shops-Details →
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}

function MappingSection({ data, decoded }: { data: Detail; decoded: string }) {
  const m = data.mapping;
  const rows: Array<{ ok: boolean; label: string; hint: string }> = [
    {
      ok: m.has_catalog,
      label: "Item-Katalog",
      hint: m.has_catalog
        ? "Eintrag in inventory_item_catalog vorhanden."
        : "Kein Katalogeintrag – Item wurde ggf. nur als Blueprint-Komponente gesehen.",
    },
    {
      ok: m.has_wiki_uuid,
      label: "Wiki-UUID",
      hint: m.has_wiki_uuid
        ? "Wiki-Referenz verknüpft — Blueprints/Wiki werden sicher gematcht."
        : "Keine Wiki-UUID — Verknüpfung mit Blueprint-Komponenten läuft nur über den Namen.",
    },
    {
      ok: m.has_component,
      label: "Schiffskomponente",
      hint: m.has_component
        ? "Zusätzlich als Schiffskomponente registriert."
        : "Nicht in ship_components_catalog (nur normales Inventar-Item).",
    },
    {
      ok: m.produced_by_count > 0,
      label: "Blueprint-Output",
      hint:
        m.produced_by_count > 0
          ? `${m.produced_by_count} Blueprint(s) erzeugen dieses Item.`
          : "Keine Blueprint produziert dieses Item direkt.",
    },
    {
      ok: m.used_in_count > 0,
      label: "Blueprint-Zutat",
      hint:
        m.used_in_count > 0
          ? `In ${m.used_in_count} Blueprint(s) als Zutat verbaut.`
          : "Wird in keiner Blueprint als Zutat verbaut.",
    },
  ];
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
        // inventar-mapping status
      </h2>
      <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div
            key={r.label}
            className={
              "flex items-start gap-2 border p-3 text-xs " +
              (r.ok
                ? "border-emerald-500/20 bg-emerald-500/5"
                : "border-brand/10 bg-background/60")
            }
          >
            {r.ok ? (
              <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-300" />
            ) : (
              <AlertCircle className="mt-0.5 h-4 w-4 text-muted-foreground" />
            )}
            <div>
              <div className="font-display text-sm">{r.label}</div>
              <div className="text-[11px] text-muted-foreground">{r.hint}</div>
            </div>
          </div>
        ))}
        {m.unmapped_same_name > 0 && (
          <div className="flex items-start gap-2 border border-amber-500/30 bg-amber-500/5 p-3 text-xs md:col-span-2 lg:col-span-3">
            <AlertCircle className="mt-0.5 h-4 w-4 text-amber-300" />
            <div>
              <div className="font-display text-sm">
                {m.unmapped_same_name} unverknüpfte Inventar-Stack(s) mit
                gleichem Namen
              </div>
              <div className="text-[11px] text-muted-foreground">
                Diese Einträge in deinem Inventar heißen wie „{data.catalog?.name}
                " haben aber kein item_ref gesetzt. Öffne{" "}
                <Link to="/inventar" className="text-brand hover:underline">
                  Inventar
                </Link>{" "}
                und wähle dort das Katalog-Item, um sie zu verknüpfen. Ref:{" "}
                <span className="font-mono">{decoded}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      {(data.catalog?.last_synced_at || data.catalog?.sources_fetched_at) && (
        <div className="font-mono text-[10px] text-muted-foreground">
          {data.catalog?.last_synced_at && (
            <>
              Katalog:{" "}
              {new Date(data.catalog.last_synced_at).toLocaleString("de-DE")}
            </>
          )}
          {data.catalog?.last_synced_at && data.catalog?.sources_fetched_at && " · "}
          {data.catalog?.sources_fetched_at && (
            <>
              Shops/Acquisition:{" "}
              {new Date(data.catalog.sources_fetched_at).toLocaleString("de-DE")}
            </>
          )}
        </div>
      )}
    </section>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
        {icon} // {title}
      </h2>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
      {text}
    </p>
  );
}

function WikiSection({
  wiki,
  loading,
}: {
  wiki: WikiItemDetail | null;
  loading: boolean;
}) {
  return (
    <Section
      icon={<Package className="h-3.5 w-3.5" />}
      title="wiki-details (star citizen wiki)"
    >
      {loading && !wiki ? (
        <div className="border border-brand/10 bg-background/60 p-4 text-xs text-muted-foreground">
          Wiki-Daten werden geladen…
        </div>
      ) : !wiki ? (
        <div className="border border-dashed border-brand/15 bg-background/60 p-4 text-xs text-muted-foreground">
          <p>
            Keine Wiki-Details gefunden — das Item ist entweder nicht im SC-Wiki gelistet
            oder der Wiki-Katalog wurde noch nicht synchronisiert.
          </p>
          <p className="mt-2">
            Admins können unter{" "}
            <Link to="/admin/sync" className="text-brand hover:underline">
              Admin → Datenquellen → Wiki Items
            </Link>{" "}
            einen Sync auslösen.
          </p>
        </div>
      ) : (
        <div className="space-y-4 border border-brand/10 bg-background/60 p-4">
          {/* Chip row */}
          <div className="flex flex-wrap gap-2">
            {wiki.classification_label && (
              <Badge variant="outline" className="text-[9px] uppercase">
                {wiki.classification_label}
              </Badge>
            )}
            {wiki.sub_type_label && (
              <Badge variant="outline" className="text-[9px] uppercase">
                {wiki.sub_type_label}
              </Badge>
            )}
            {wiki.size != null && (
              <Badge variant="outline" className="text-[9px] uppercase">
                Size {wiki.size}
              </Badge>
            )}
            {wiki.mass != null && (
              <Badge variant="outline" className="text-[9px] uppercase">
                {wiki.mass} kg
              </Badge>
            )}
            {wiki.rarity && (
              <Badge variant="outline" className="text-[9px] uppercase">
                {wiki.rarity}
              </Badge>
            )}
            {wiki.is_craftable && (
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-300 text-[9px] uppercase">
                craftable
              </Badge>
            )}
            {wiki.is_lootable && (
              <Badge variant="outline" className="text-[9px] uppercase">
                lootable
              </Badge>
            )}
            {wiki.manufacturer?.name && wiki.manufacturer.name !== "<= PLACEHOLDER =>" && (
              <Badge variant="outline" className="text-[9px] uppercase">
                {wiki.manufacturer.name}
              </Badge>
            )}
          </div>

          {/* Description */}
          {(wiki.description_de || wiki.description_en) && (
            <p className="whitespace-pre-line text-sm text-muted-foreground">
              {wiki.description_de || wiki.description_en}
            </p>
          )}

          {/* description_data */}
          {wiki.description_data.length > 0 && (
            <div className="grid gap-2 md:grid-cols-2">
              {wiki.description_data.map((r, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-3 border border-brand/10 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {r.name}
                  </span>
                  <span className="text-right">{r.value}</span>
                </div>
              ))}
            </div>
          )}

          {/* Personal weapon stats */}
          {wiki.personal_weapon && <WeaponStats pw={wiki.personal_weapon} />}

          {/* Attachments / ports */}
          {wiki.ports.length > 0 && (
            <div className="space-y-2">
              <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                anschlüsse / attachments
              </div>
              <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                {wiki.ports.map((p, i) => (
                  <div
                    key={i}
                    className="border border-brand/10 px-3 py-2 text-xs"
                  >
                    <div className="font-display text-sm">
                      {p.display_name || p.name || "—"}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {[p.sub_type || p.type, p.size != null ? `Size ${p.size}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Meta / links */}
          <div className="flex flex-wrap items-center gap-3 pt-1 font-mono text-[10px] text-muted-foreground">
            {wiki.version && <span>v{wiki.version}</span>}
            {wiki.updated_at && (
              <span>aktualisiert: {new Date(wiki.updated_at).toLocaleDateString("de-DE")}</span>
            )}
            {wiki.web_url && (
              <a
                href={wiki.web_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-brand hover:underline"
              >
                Auf Star Citizen Wiki ansehen <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      )}
    </Section>
  );
}

function WeaponStats({ pw }: { pw: any }) {
  const rows: Array<{ label: string; value: string | number | null | undefined }> = [
    { label: "Klasse", value: pw.class },
    { label: "Typ", value: pw.type },
    { label: "Magazin", value: pw.magazine_size },
    { label: "Kapazität", value: pw.capacity },
    { label: "Effektive Reichweite", value: pw.effective_range ? `${pw.effective_range} m` : null },
    { label: "Reichweite", value: pw.range ? `${pw.range} m` : null },
    { label: "RPM", value: pw.rpm ?? pw.rof },
    { label: "Dmg / Shot", value: pw.damage_per_shot },
  ].filter((r) => r.value != null && r.value !== "");

  const damages: Array<{ name: string; damage: number }> = Array.isArray(pw.damages)
    ? pw.damages.map((d: any) => ({ name: String(d.name ?? d.type ?? ""), damage: Number(d.damage ?? 0) }))
    : [];

  if (rows.length === 0 && damages.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        waffen-stats
      </div>
      {rows.length > 0 && (
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((r) => (
            <div key={r.label} className="border border-brand/10 px-3 py-2 text-xs">
              <div className="text-[10px] uppercase text-muted-foreground">{r.label}</div>
              <div className="font-mono">{String(r.value)}</div>
            </div>
          ))}
        </div>
      )}
      {damages.length > 0 && (
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-6">
          {damages.map((d, i) => (
            <div key={i} className="border border-brand/10 px-3 py-2 text-xs">
              <div className="text-[10px] uppercase text-muted-foreground">{d.name}</div>
              <div className="font-mono">{d.damage}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}