import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listCraftHistory } from "@/lib/crafting.functions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { History, Hammer, Clock } from "lucide-react";
import { PageShell, StatGrid, StatCard } from "@/components/layout/PageShell";

const fmtQty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const Route = createFileRoute("/_authenticated/crafting/historie")({
  component: HistoryPage,
});

function HistoryPage() {
  const fn = useServerFn(listCraftHistory);
  const q = useQuery({ queryKey: ["craft-history"], queryFn: () => fn() });
  const rows = q.data?.history ?? [];

  const lastAt = rows[0] ? new Date(rows[0].created_at as string) : null;

  return (
    <PageShell
      eyebrow="Produktion"
      title="Crafting-Verlauf"
      description="Alle abgeschlossenen Herstellungen mit verwendeten Materialien und Modifikatoren."
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/crafting" search={{ bp: undefined }}>
              Crafting
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/inventar">Inventar</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/blueprints">Blueprints</Link>
          </Button>
        </>
      }
    >
      <StatGrid cols={3}>
        <StatCard label="Herstellungen" value={rows.length} icon={History} tone="brand" />
        <StatCard
          label="Letzter Lauf"
          value={lastAt ? lastAt.toLocaleDateString("de-DE") : "—"}
          hint={lastAt ? lastAt.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) : undefined}
          icon={Clock}
        />
        <StatCard
          label="Unterschiedliche Blueprints"
          value={new Set(rows.map((r) => r.blueprint_name as string)).size}
          icon={Hammer}
        />
      </StatGrid>

      {rows.length === 0 ? (
        <div className="border border-dashed border-brand/15 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          // noch nichts hergestellt
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id as string}
              className="border border-brand/10 bg-background/60 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="font-display text-lg">{r.blueprint_name as string}</div>
                  <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                    {new Date(r.created_at as string).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                       <Badge variant="outline">Output: {fmtQty(Number(r.output_qty))}×</Badge>
                  {r.output_quality !== null && (
                    <Badge>Q {String(r.output_quality)}</Badge>
                  )}
                </div>
              </div>
              {Array.isArray(r.components_snapshot) && (
                <div className="mt-3 grid gap-1 text-xs text-muted-foreground">
                  {(r.components_snapshot as Array<Record<string, unknown>>).map((c, i) => {
                    const picks = (Array.isArray(c.picks) ? c.picks : []) as Array<Record<string, unknown>>;
                    const qtyUsed =
                      c.qty_used != null
                        ? Number(c.qty_used)
                        : picks.reduce((s, p) => s + Number(p.qty_use ?? 0), 0);
                    const quality =
                      c.quality_used ?? c.eff_quality ?? picks[0]?.stack_quality ?? null;
                    const weight = c.weight ?? 1;
                    const slot = c.slot_label ?? i + 1;
                    return (
                      <div key={i} className="flex justify-between gap-2">
                        <span className="truncate">
                          {String(slot)} · {String(c.item_name ?? "—")}
                        </span>
                        <span className="font-mono">
                          {fmtQty(qtyUsed)}× · Q {quality === null ? "—" : String(Math.round(Number(quality)))} · w{String(weight)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {r.consumed_snapshot &&
                typeof r.consumed_snapshot === "object" &&
                Array.isArray(
                  (r.consumed_snapshot as Record<string, unknown>).final_modifiers,
                ) &&
                ((r.consumed_snapshot as Record<string, unknown>).final_modifiers as Array<
                  Record<string, unknown>
                >).length > 0 && (
                  <div className="mt-3 border-t border-brand/10 pt-2">
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground mb-1">
                      // final modifiers
                    </div>
                    <div className="grid gap-1 text-xs">
                      {(
                        (r.consumed_snapshot as Record<string, unknown>)
                          .final_modifiers as Array<Record<string, unknown>>
                      ).map((fm, i) => {
                        const p = Number(fm.total_pct ?? 0);
                        return (
                          <div key={i} className="flex justify-between gap-2">
                            <span className="truncate">{String(fm.label ?? fm.key ?? "—")}</span>
                            <span
                              className={
                                "font-mono " +
                                (p > 0 ? "text-emerald-300" : p < 0 ? "text-rose-300" : "text-zinc-300")
                              }
                            >
                              {p >= 0 ? "+" : ""}
                              {p.toFixed(Math.abs(p) < 0.05 ? 0 : 2)}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}