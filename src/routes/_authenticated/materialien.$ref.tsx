import { createFileRoute, Link } from "@tanstack/react-router";
import { AcquisitionCard } from "@/components/catalog/AcquisitionCard";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMaterialDetail } from "@/lib/materials.functions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft,
  Pickaxe,
  Sprout,
  Recycle,
  ShoppingCart,
  ExternalLink,
  Package,
  Ship,
  Truck,
  User,
  Radio,
} from "lucide-react";
import {
  getFrequencyInfo,
  RARITY_COLOR,
  formatFreq,
} from "@/lib/scanner-frequencies";

function pickLocalizedDescription(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const v =
      obj.de_DE ?? obj.de ?? obj.en_EN ?? obj.en ?? Object.values(obj)[0];
    return typeof v === "string" ? v : null;
  }
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return pickLocalizedDescription(JSON.parse(trimmed));
    } catch {
      return value;
    }
  }
  return value;
}

export const Route = createFileRoute("/_authenticated/materialien/$ref")({
  component: MaterialDetailPage,
});

function MaterialDetailPage() {
  const { ref } = Route.useParams();
  const decoded = decodeURIComponent(ref);
  const detailFn = useServerFn(getMaterialDetail);
  const { data, isLoading, error } = useQuery({
    queryKey: ["material", decoded],
    queryFn: () => detailFn({ data: { item_ref: decoded } }),
  });

  return (
    <div className="container max-w-5xl py-6 space-y-6">
      <div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/materialien">
            <ArrowLeft className="mr-1 h-4 w-4" /> zurück zur Übersicht
          </Link>
        </Button>
      </div>

      {isLoading && (
        <div className="text-sm text-muted-foreground">Lade Material…</div>
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
                {data.kind && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {data.kind}
                  </Badge>
                )}
                {data.unit && (
                  <Badge variant="outline" className="text-[9px] uppercase">
                    {data.unit}
                  </Badge>
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
              {data.wiki_uuid && (
                <a
                  href={`https://starcitizen.tools/${encodeURIComponent(data.name)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-brand hover:underline"
                >
                  Star-Citizen-Wiki <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </header>

          {/* BESCHAFFUNG */}
          <AcquisitionCard itemRef={decoded} name={data.name} />

          {/* ACQUISITION */}
          <section className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // wo bekomme ich das?
            </h2>
            <AcquisitionPanel acq={data.acquisition} />
          </section>

          {/* SCANNER-FREQUENZ */}
          <ScannerFrequencySection name={data.name} />


          {/* FARMING LOCATIONS */}
          {data.acquisition?.locations &&
            data.acquisition.locations.length > 0 && (
              <section className="space-y-3">
                <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                  // farming-orte ({data.acquisition.locations.length})
                </h2>
                <div className="border border-brand/10 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/30 font-mono uppercase tracking-wider text-[9px] text-muted-foreground">
                      <tr>
                        <th className="p-2 text-left">Ort</th>
                        <th className="p-2 text-left">Typ</th>
                        <th className="p-2 text-left">Übergeordnet</th>
                        <th className="p-2 text-left">System</th>
                        <th className="p-2 text-right">Wahrscheinlichkeit</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.acquisition.locations]
                        .sort(
                          (a, b) =>
                            (b.group_probability_percent ?? 0) -
                            (a.group_probability_percent ?? 0),
                        )
                        .map((l, i) => (
                          <tr
                            key={`${l.name}-${i}`}
                            className="border-t border-brand/10 hover:bg-muted/10"
                          >
                            <td className="p-2 font-display">
                              {l.display_name ?? l.name}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {l.type ?? "—"}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {l.parent_name ?? "—"}
                            </td>
                            <td className="p-2 text-muted-foreground">
                              {l.system ?? "—"}
                            </td>
                            <td className="p-2 text-right font-mono">
                              {l.group_probability_percent != null
                                ? `${l.group_probability_percent.toFixed(1)} %`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

          {/* SHOPS */}
          <section className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // shops & terminals ({data.shops.length})
            </h2>
            {data.shops.length === 0 ? (
              <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
                Keine Shops bekannt – möglicherweise nur durch Mining, Salvage
                oder Missionen erhältlich.
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
                          key={i}
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
                {data.sources_fetched_at && (
                  <div className="bg-muted/10 px-2 py-1 font-mono text-[9px] text-muted-foreground">
                    Preise zuletzt synchronisiert:{" "}
                    {new Date(data.sources_fetched_at).toLocaleString("de-DE")}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* USED IN */}
          <section className="space-y-3">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // wird verwendet in ({data.used_in.length})
            </h2>
            {data.used_in.length === 0 ? (
              <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
                Wird aktuell in keiner Blaupause verwendet.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {data.used_in.map((u) => (
                  <Link
                    key={u.blueprint_id}
                    to="/blueprints/$id"
                    params={{ id: u.blueprint_id }}
                    className="flex items-center justify-between border border-brand/10 bg-background/60 p-2 text-sm hover:border-brand/40 hover:bg-background"
                  >
                    <span>{u.item_name}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {u.qty} {u.unit ?? ""}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function AcquisitionPanel({
  acq,
}: {
  acq: import("@/lib/materials.functions").Acquisition | null;
}) {
  if (!acq)
    return (
      <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
        Keine Bezugsinformationen verfügbar.
      </p>
    );
  const rows: Array<{
    on: boolean;
    icon: React.ReactNode;
    label: string;
    hint: string;
  }> = [
    {
      on: acq.mineable_ship,
      icon: <Ship className="h-4 w-4" />,
      label: "Schiffs-Mining",
      hint: "Mit Prospector, Mole oder ROC.",
    },
    {
      on: acq.mineable_ground,
      icon: <Truck className="h-4 w-4" />,
      label: "Boden-Mining",
      hint: "ROC / ROC-DS auf Asteroiden & Monden.",
    },
    {
      on: acq.mineable_fps,
      icon: <User className="h-4 w-4" />,
      label: "FPS-Mining",
      hint: "Mit Multi-Tool (Greycat OreBit).",
    },
    {
      on: acq.harvestable,
      icon: <Sprout className="h-4 w-4" />,
      label: "Harvesting",
      hint: "Pflücken/Sammeln an natürlichen Vorkommen.",
    },
    {
      on: acq.salvage,
      icon: <Recycle className="h-4 w-4" />,
      label: "Salvage",
      hint: "Vulture / Reclaimer aus Wracks bergen.",
    },
    {
      on: !!acq.mineable && !acq.mineable_ship && !acq.mineable_ground && !acq.mineable_fps,
      icon: <Pickaxe className="h-4 w-4" />,
      label: "Mineable",
      hint: "Per Mining gewinnbar (Methode laut Wiki).",
    },
    {
      on: acq.shop,
      icon: <ShoppingCart className="h-4 w-4" />,
      label: "Shop-Kauf",
      hint: "Siehe Tabelle unten.",
    },
  ].filter((r) => r.on);

  if (rows.length === 0) {
    return (
      <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
        Keine Beschaffungsmethode bekannt – möglicherweise nur als
        Missionsbelohnung oder durch Crafting erhältlich.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
      {rows.map((r, i) => (
        <div
          key={i}
          className="flex items-start gap-3 border border-emerald-500/20 bg-emerald-500/5 p-3"
        >
          <div className="mt-0.5 text-emerald-300">{r.icon}</div>
          <div>
            <div className="font-display text-sm">{r.label}</div>
            <div className="text-[11px] text-muted-foreground">{r.hint}</div>
          </div>
        </div>
      ))}
      {acq.methods.length > 0 && (
        <div className="md:col-span-2 border border-brand/10 bg-background/60 p-3 text-xs text-muted-foreground">
          <span className="font-mono uppercase tracking-wider text-[9px]">
            // wiki-methoden:
          </span>{" "}
          {acq.methods.join(", ")}
        </div>
      )}
    </div>
  );
}

function ScannerFrequencySection({ name }: { name: string }) {
  const info = getFrequencyInfo(name);
  if (!info) return null;
  const colorClass = RARITY_COLOR[info.rarity];
  return (
    <section className="space-y-3">
      <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
        // scanner-frequenzen
      </h2>
      <div className="border border-brand/10 bg-background/60 p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Radio className="h-4 w-4 text-brand" />
            <span className="font-display text-sm">Resistance-Harmonics</span>
          </div>
          <Badge variant="outline" className={`text-[10px] uppercase ${colorClass}`}>
            {info.rarityLabel} · Max {info.max}×
          </Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Basisfrequenz {formatFreq(info.harmonics[0])} – Vielfache erscheinen im Mining-Scanner
          als resonante Peaks. Wähle den nächstliegenden Peak, um dieses Material zu
          identifizieren.
        </p>
        <div className="flex flex-wrap gap-2">
          {info.harmonics.map((f, i) => (
            <div
              key={i}
              className={`flex items-center gap-2 border px-3 py-1.5 font-mono text-xs ${colorClass}`}
            >
              <span className="text-[9px] uppercase opacity-70">{i + 1}×</span>
              <span className="tabular-nums">{formatFreq(f)}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}