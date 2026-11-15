import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  analyzeOrder,
  createOrder,
  searchOrderableItems,
  type OrderAnalysis,
  type OrderAnalysisRow,
} from "@/lib/orga-orders.functions";
import { useCurrentOrgId } from "./orga";
import { ItemLink } from "@/components/catalog/ItemLink";
import { PageHint } from "@/components/orga/PageHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  CheckCircle2,
  Package,
  Search,
  ShoppingCart,
  Wrench,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/orga/bestellen")({
  component: OrderPage,
});

const keyOf = (r: OrderAnalysisRow) =>
  r.item_ref ?? `n:${r.item_name.trim().toLowerCase()}`;

function OrderPage() {
  const [orgId] = useCurrentOrgId();
  const navigate = useNavigate();
  const searchFn = useServerFn(searchOrderableItems);
  const analyzeFn = useServerFn(analyzeOrder);
  const createFn = useServerFn(createOrder);

  const [q, setQ] = useState("");
  const [onlyBlueprint, setOnlyBlueprint] = useState(false);
  const [onlyWarehouse, setOnlyWarehouse] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [picked, setPicked] = useState<{
    item_ref: string | null;
    item_name: string;
    item_kind: string | null;
  } | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [deep, setDeep] = useState(false);
  const [notes, setNotes] = useState("");
  const [supply, setSupply] = useState<Set<string>>(new Set());

  const suggestQ = useQuery({
    queryKey: ["orga-orderables", orgId, q],
    queryFn: () => searchFn({ data: { org_id: orgId!, search: q } }),
    enabled: !!orgId,
  });

  const analyzeQ = useQuery({
    queryKey: [
      "orga-order-analysis",
      orgId,
      picked?.item_ref ?? picked?.item_name,
      qty,
      deep,
    ],
    queryFn: () =>
      analyzeFn({
        data: {
          org_id: orgId!,
          item_ref: picked!.item_ref,
          item_name: picked!.item_name,
          qty,
          resolve_deep: deep,
        },
      }),
    enabled: !!orgId && !!picked && qty > 0,
  });

  const createM = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          org_id: orgId!,
          item_ref: picked!.item_ref,
          item_name: picked!.item_name,
          item_kind: picked!.item_kind,
          qty,
          notes: notes.trim() || null,
          resolve_deep: deep,
          will_supply_keys: Array.from(supply),
        },
      }),
    onSuccess: () => {
      toast.success("Bestellung eingereicht");
      navigate({ to: "/orga/bestellungen" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const items = suggestQ.data?.items ?? [];
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (onlyBlueprint && !it.has_blueprint) return false;
      if (onlyWarehouse && !it.in_warehouse) return false;
      if (categoryFilter === "__none" && it.category) return false;
      if (
        categoryFilter !== "__all" &&
        categoryFilter !== "__none" &&
        it.category !== categoryFilter
      )
        return false;
      return true;
    });
  }, [items, onlyBlueprint, onlyWarehouse, categoryFilter]);
  const allCategories = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.category) s.add(i.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "de"));
  }, [items]);
  const analysis: OrderAnalysis | undefined = analyzeQ.data;

  if (!orgId)
    return (
      <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>
    );

  return (
    <div className="space-y-4">
      <PageHint>
        Hier kannst du eine Bestellung aus dem Orgalager aufgeben. Wähle ein
        Item aus dem Lager oder Katalog aus. Das System prüft automatisch, ob
        genügend Materialien vorhanden sind oder ob eine Produktion nötig ist
        – bevor die Bestellung eingereicht wird. Angezeigte Blueprints hängen
        von der Freigabe deiner Orga ab (Orga-Einstellungen →
        Blueprint-Quelle).
      </PageHint>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <Card className="border-brand/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
            <ShoppingCart className="h-4 w-4" /> Neue Bestellung
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Item suchen</Label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name eingeben (Blueprint oder Lager)…"
                className="pl-7"
              />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                type="button"
                size="sm"
                variant={onlyBlueprint ? "default" : "outline"}
                onClick={() => setOnlyBlueprint((v) => !v)}
                className="h-7 text-[10px]"
              >
                Blueprint vorhanden
              </Button>
              <Button
                type="button"
                size="sm"
                variant={onlyWarehouse ? "default" : "outline"}
                onClick={() => setOnlyWarehouse((v) => !v)}
                className="h-7 text-[10px]"
              >
                Auf Lager verfügbar
              </Button>
              {(allCategories.length > 0 ||
                items.some((i) => !i.category)) && (
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-7 w-[180px] text-[10px]">
                    <SelectValue placeholder="Kategorie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">Alle Kategorien</SelectItem>
                    <SelectItem value="__none">Ohne Kategorie</SelectItem>
                    {allCategories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="max-h-64 overflow-auto rounded border border-brand/10">
              {filteredItems.length === 0 ? (
                <div className="p-3 text-center text-[11px] text-muted-foreground">
                  {q || onlyBlueprint || onlyWarehouse
                    ? "Keine Treffer."
                    : "Tippe zum Suchen…"}
                </div>
              ) : (
                filteredItems.map((it) => {
                  const key = it.item_ref ?? `n:${it.item_name.toLowerCase()}`;
                  const isPicked =
                    picked &&
                    (picked.item_ref
                      ? picked.item_ref === it.item_ref
                      : picked.item_name.toLowerCase() ===
                        it.item_name.toLowerCase());
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() =>
                        setPicked({
                          item_ref: it.item_ref,
                          item_name: it.item_name,
                          item_kind: it.item_kind,
                        })
                      }
                      className={
                        "flex w-full items-center gap-2 border-b border-brand/5 px-2 py-1.5 text-left text-xs last:border-b-0 hover:bg-brand/5 " +
                        (isPicked ? "bg-brand/10" : "")
                      }
                    >
                      <Package className="h-3 w-3 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">
                        {it.item_name}
                      </span>
                      {it.category && (
                        <Badge variant="outline" className="text-[9px] text-muted-foreground">
                          {it.category}
                        </Badge>
                      )}
                      {it.has_blueprint && (
                        <Badge variant="outline" className="text-[9px]">
                          BP
                        </Badge>
                      )}
                      {it.in_warehouse && (
                        <Badge variant="outline" className="text-[9px]">
                          Lager
                        </Badge>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Menge</Label>
              <Input
                type="number"
                min={1}
                value={qty}
                onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))}
              />
            </div>
            <div className="flex items-end gap-2">
              <Checkbox
                id="deep"
                checked={deep}
                onCheckedChange={(v) => setDeep(!!v)}
              />
              <Label htmlFor="deep" className="text-xs">
                Rekursiv auflösen (Komponenten → Rohstoffe)
              </Label>
            </div>
          </div>

          <div className="space-y-1">
            <Label>Notiz (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Zweck, Deadline, Zielort…"
            />
          </div>

          <Button
            className="w-full"
            disabled={!picked || createM.isPending || qty < 1}
            onClick={() => createM.mutate()}
          >
            <ShoppingCart className="mr-2 h-3 w-3" /> Bestellung einreichen
          </Button>
          {analysis?.existing_open_order && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-300">
              Bereits offene Bestellung
              {analysis.existing_open_order.requested_by_callsign
                ? ` von ${analysis.existing_open_order.requested_by_callsign}`
                : ""}{" "}
              (× {analysis.existing_open_order.qty},{" "}
              {analysis.existing_open_order.status === "pending"
                ? "Offen"
                : "In Arbeit"}
              ) — eine zusätzliche Bestellung ist trotzdem möglich.
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-brand/10">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest">
            <Wrench className="h-4 w-4" /> Verfügbarkeitsanalyse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!picked ? (
            <p className="text-sm text-muted-foreground">
              Wähle ein Item, um die Analyse zu starten.
            </p>
          ) : analyzeQ.isLoading ? (
            <p className="text-xs text-muted-foreground">// analysiere…</p>
          ) : analyzeQ.isError ? (
            <p className="text-xs text-red-400">
              {(analyzeQ.error as Error).message}
            </p>
          ) : analysis ? (
            <AnalysisView
              analysis={analysis}
              supply={supply}
              onToggleSupply={(k) => {
                setSupply((prev) => {
                  const next = new Set(prev);
                  if (next.has(k)) next.delete(k);
                  else next.add(k);
                  return next;
                });
              }}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  </div>
);
}

function AnalysisView({
  analysis,
  supply,
  onToggleSupply,
}: {
  analysis: OrderAnalysis;
  supply: Set<string>;
  onToggleSupply: (k: string) => void;
}) {
  const t = analysis.target;
  const missing = analysis.rows.filter((r) => r.missing > 0);
  const covered = analysis.rows.filter((r) => r.missing === 0);
  const supplyMissingAll = useMemo(
    () => missing.every((r) => supply.has(keyOf(r))),
    [missing, supply],
  );

  return (
    <div className="space-y-3">
      <div className="rounded border border-brand/10 bg-background/50 p-3">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">
              <ItemLink item_ref={t.item_ref} name={t.item_name} />
            </div>
          <Badge variant="outline" className="font-mono text-[10px]">
            Menge {t.qty}
          </Badge>
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          Im Lager verfügbar:{" "}
          <span className="font-mono">{t.on_hand_available}</span>
          {t.on_hand_locked > 0 && (
            <>
              {" "}· gesperrt:{" "}
              <span className="font-mono">{t.on_hand_locked}</span>
            </>
          )}
          {t.blueprint_id ? (
            <>
              {" "}· Blueprint vorhanden ({t.blueprint_output_qty}/Lauf ·{" "}
              {t.craft_runs_needed ?? 0} Läufe nötig)
            </>
          ) : (
            <> · <span className="text-amber-400">Kein Blueprint gefunden</span></>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {analysis.can_be_crafted ? (
            <Badge className="bg-emerald-500/20 text-emerald-300">
              <CheckCircle2 className="mr-1 h-3 w-3" /> Herstellbar
            </Badge>
          ) : (
            <Badge className="bg-amber-500/20 text-amber-300">
              <AlertCircle className="mr-1 h-3 w-3" /> Materialien fehlen
            </Badge>
          )}
          {analysis.computed_min_quality != null && (
            <Badge variant="outline" className="font-mono text-[10px]">
              Qualität ≥ {analysis.computed_min_quality}
            </Badge>
          )}
          {analysis.can_be_crafted &&
            supplyMissingAll &&
            missing.length === 0 && (
              <span className="text-[11px] text-emerald-300">
                Alles im Lager – kann direkt gecraftet werden.
              </span>
            )}
        </div>
      </div>

      {analysis.rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Keine Materialien aufgelistet
          {t.on_hand_available >= t.qty
            ? " – Wunschmenge liegt bereits im Lager."
            : "."}
        </p>
      ) : (
        <>
          {missing.length > 0 && (
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-amber-400">
                Fehlende Materialien ({missing.length})
              </div>
              <RowList
                rows={missing}
                supply={supply}
                onToggleSupply={onToggleSupply}
                highlight
              />
            </div>
          )}
          {covered.length > 0 && (
            <div>
              <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-emerald-400">
                Im Lager gedeckt ({covered.length})
              </div>
              <RowList
                rows={covered}
                supply={supply}
                onToggleSupply={onToggleSupply}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

function RowList({
  rows,
  supply,
  onToggleSupply,
  highlight,
}: {
  rows: OrderAnalysisRow[];
  supply: Set<string>;
  onToggleSupply: (k: string) => void;
  highlight?: boolean;
}) {
  return (
    <div className="space-y-1">
      {rows.map((r) => {
        const k = keyOf(r);
        return (
          <div
            key={k}
            className={
              "flex items-center gap-2 border px-2 py-1.5 text-xs " +
              (highlight
                ? "border-amber-500/30 bg-amber-500/5"
                : "border-brand/10 bg-background/40")
            }
          >
            <Badge variant="outline" className="text-[9px]">
              {r.kind === "component"
                ? "Komp"
                : r.kind === "material"
                  ? "Mat"
                  : "?"}
            </Badge>
            <div className="min-w-0 flex-1">
              <div className="truncate">
                <ItemLink item_ref={r.item_ref} name={r.item_name} />
              </div>
              {r.from_blueprint_name && (
                <div className="text-[10px] text-muted-foreground">
                  ← {r.from_blueprint_name}
                </div>
              )}
            </div>
            <div className="text-right font-mono text-[11px]">
              <div>
                <span className={r.missing > 0 ? "text-amber-300" : ""}>
                  {r.available}
                </span>{" "}
                / {r.required}
              </div>
              {r.best_available_quality != null && (
                <div className="text-[10px] text-muted-foreground">
                  Q{r.best_available_quality}
                </div>
              )}
            </div>
            {r.missing > 0 && (
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Checkbox
                  checked={supply.has(k)}
                  onCheckedChange={() => onToggleSupply(k)}
                />
                liefere ich
              </label>
            )}
          </div>
        );
      })}
    </div>
  );
}