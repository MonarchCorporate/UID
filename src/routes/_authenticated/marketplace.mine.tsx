import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, Plus, Pencil } from "lucide-react";
import { listMyMarketplace } from "@/lib/marketplace.functions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/marketplace/mine")({
  head: () => ({ meta: [{ title: "Meine Einträge – Schwarzes Brett" }] }),
  component: MyMarketplace,
});

const TYPE_LABEL: Record<string, string> = {
  auftrag: "Auftrag",
  suche: "Suche",
  verkauf: "Verkauf",
  tausch: "Tausch",
};

function MyMarketplace() {
  const fn = useServerFn(listMyMarketplace);
  const q = useQuery({ queryKey: ["marketplace-mine"], queryFn: () => fn() });

  return (
    <PageShell
      eyebrow="Schwarzes Brett"
      title="Meine Einträge"
      actions={
        <Button asChild>
          <Link to="/marketplace/new">
            <Plus className="mr-1 h-4 w-4" /> Neu
          </Link>
        </Button>
      }
    >
      <Link
        to="/marketplace"
        className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-3 w-3" /> Zurück zum Schwarzen Brett
      </Link>

      <Tabs defaultValue="created">
        <TabsList>
          <TabsTrigger value="created">Erstellt ({q.data?.created.length ?? 0})</TabsTrigger>
          <TabsTrigger value="claimed">Angenommen ({q.data?.claimed.length ?? 0})</TabsTrigger>
        </TabsList>
        <TabsContent value="created" className="mt-4 space-y-2">
          {(q.data?.created ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center gap-3 border border-brand/15 bg-background/60 p-3 hover:border-brand/60"
            >
              <Link
                to="/marketplace/$id"
                params={{ id: l.id }}
                className="flex min-w-0 flex-1 items-center gap-3"
              >
                <span className="border border-brand/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                  {TYPE_LABEL[l.type] ?? l.type}
                </span>
                <span className="flex-1 truncate font-display text-sm">{l.title}</span>
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {l.status}
                </span>
                <span className="hidden font-mono text-[10px] text-muted-foreground sm:inline">
                  {format(new Date(l.created_at), "dd.MM.yy", { locale: de })}
                </span>
              </Link>
              <Button asChild size="sm" variant="outline">
                <Link to="/marketplace/$id/edit" params={{ id: l.id }}>
                  <Pencil className="mr-1 h-3 w-3" /> Bearbeiten
                </Link>
              </Button>
            </div>
          ))}
          {(q.data?.created ?? []).length === 0 && (
            <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">
              // noch keine einträge
            </div>
          )}
        </TabsContent>
        <TabsContent value="claimed" className="mt-4 space-y-2">
          {(q.data?.claimed ?? []).map((c) => (
            <Link
              key={c.claim_id}
              to="/marketplace/$id"
              params={{ id: c.listing_id }}
              className="flex items-center gap-3 border border-brand/15 bg-background/60 p-3 hover:border-brand/60"
            >
              <span className="border border-brand/40 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                {TYPE_LABEL[c.type] ?? c.type}
              </span>
              <span className="flex-1 truncate font-display text-sm">{c.title}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {c.claim_status}
              </span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {format(new Date(c.created_at), "dd.MM.yy", { locale: de })}
              </span>
            </Link>
          ))}
          {(q.data?.claimed ?? []).length === 0 && (
            <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">
              // noch keine annahmen
            </div>
          )}
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
