import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Plus, ListChecks, Search, Newspaper } from "lucide-react";
import { listListings, type MarketplaceListing } from "@/lib/marketplace.functions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const Route = createFileRoute("/_authenticated/marketplace/")({
  head: () => ({ meta: [{ title: "Schwarzes Brett – United Imperial Dominion" }] }),
  component: MarketplaceIndex,
});

const TYPE_LABEL: Record<string, string> = {
  auftrag: "Auftrag",
  suche: "Suche",
  verkauf: "Verkauf",
  tausch: "Tausch",
};
const TYPE_COLOR: Record<string, string> = {
  auftrag: "border-amber-400/50 text-amber-400",
  suche: "border-sky-400/50 text-sky-400",
  verkauf: "border-emerald-400/50 text-emerald-400",
  tausch: "border-fuchsia-400/50 text-fuchsia-400",
};
const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  angenommen: "Angenommen",
  in_lieferung: "In Lieferung",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
  abgelaufen: "Abgelaufen",
};
const STATUS_COLOR: Record<string, string> = {
  offen: "border-emerald-400/40 text-emerald-400",
  angenommen: "border-amber-400/40 text-amber-400",
  in_lieferung: "border-sky-400/40 text-sky-400",
  abgeschlossen: "border-white/10 text-muted-foreground",
  storniert: "border-red-400/40 text-red-400",
  abgelaufen: "border-white/10 text-muted-foreground",
};

function MarketplaceIndex() {
  const fn = useServerFn(listListings);
  const [type, setType] = useState<string>("");
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [scope, setScope] = useState<string>("");
  const [search, setSearch] = useState("");

  const q = useQuery({
    queryKey: ["marketplace", { type, scope, onlyOpen, search }],
    queryFn: () =>
      fn({
        data: {
          type: (type || undefined) as "auftrag" | "suche" | "verkauf" | "tausch" | undefined,
          scope: (scope || undefined) as "intern" | "allianz" | undefined,
          onlyOpen,
          search,
        },
      }),
  });

  const listings = q.data?.listings ?? [];

  return (
    <PageShell
      eyebrow="Community"
      title="Schwarzes Brett"
      description="Aufträge, Suchanfragen, Verkäufe & Tauschangebote der gesamten Community."
      actions={
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/marketplace/mine">
              <ListChecks className="mr-1 h-4 w-4" /> Meine
            </Link>
          </Button>
          <Button asChild>
            <Link to="/marketplace/new">
              <Plus className="mr-1 h-4 w-4" /> Neuer Eintrag
            </Link>
          </Button>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-3 border border-brand/15 bg-background/40 p-3">
        <div className="relative w-full sm:w-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="w-full pl-8 sm:w-64"
            placeholder="Titel durchsuchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Typ:
          </span>
          {[
            { v: "", l: "Alle" },
            { v: "auftrag", l: "Auftrag" },
            { v: "suche", l: "Suche" },
            { v: "verkauf", l: "Verkauf" },
            { v: "tausch", l: "Tausch" },
          ].map((t) => (
            <button
              key={t.v}
              type="button"
              onClick={() => setType(t.v)}
              className={cn(
                "px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
                type === t.v ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            Sicht:
          </span>
          {[
            { v: "", l: "Alle" },
            { v: "intern", l: "Nur intern" },
            { v: "allianz", l: "Übergreifend" },
          ].map((s) => (
            <button
              key={s.v}
              type="button"
              onClick={() => setScope(s.v)}
              className={cn(
                "px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
                scope === s.v ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.l}
            </button>
          ))}
        </div>
        <label className="ml-auto flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={onlyOpen}
            onChange={(e) => setOnlyOpen(e.target.checked)}
          />
          nur offene
        </label>
      </div>

      {q.isLoading ? (
        <LoadingScreen label="Lade Einträge" hint="// schwarzes brett" cards={6} />
      ) : listings.length === 0 ? (
        <div className="border border-brand/10 p-12 text-center font-mono text-xs text-muted-foreground">
          <Newspaper className="mx-auto mb-2 h-6 w-6" />
          // Noch keine Einträge
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {listings.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </div>
      )}
    </PageShell>
  );
}

function ListingCard({ l }: { l: MarketplaceListing }) {
  return (
    <Link
      to="/marketplace/$id"
      params={{ id: l.id }}
      className="group flex flex-col gap-2 border border-brand/15 bg-background/60 p-3 hover:border-brand/60"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1">
            <span
              className={cn(
                "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]",
                TYPE_COLOR[l.type],
              )}
            >
              {TYPE_LABEL[l.type]}
            </span>
            <span
              className={cn(
                "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]",
                STATUS_COLOR[l.status],
              )}
            >
              {STATUS_LABEL[l.status]}
            </span>
            <span
              className={cn(
                "border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]",
                l.scope === "intern"
                  ? "border-brand/50 text-brand"
                  : "border-white/20 text-muted-foreground",
              )}
            >
              {l.scope === "intern" ? (l.org_name ?? "Intern") : "Übergreifend"}
            </span>
            {l.category && (
              <span className="border border-white/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                {l.category}
              </span>
            )}
          </div>
          <div className="mt-1 truncate font-display text-sm">{l.title}</div>
        </div>
        {l.price_auec != null && (
          <div className="shrink-0 text-right">
            <div className="font-display text-sm text-brand">
              {l.price_auec.toLocaleString("de-DE")}
            </div>
            <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
              aUEC
            </div>
          </div>
        )}
      </div>
      {l.description && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{l.description}</p>
      )}
      <div className="mt-auto flex items-center justify-between gap-2 pt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{l.creator_name}</span>
        <span>
          {l.expires_at
            ? `bis ${format(new Date(l.expires_at), "dd.MM.yy", { locale: de })}`
            : format(new Date(l.created_at), "dd.MM.yy", { locale: de })}
        </span>
      </div>
    </Link>
  );
}
