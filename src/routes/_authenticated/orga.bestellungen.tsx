import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listOrders,
  updateOrderStatus,
  cancelOrder,
  type OrderRow,
} from "@/lib/orga-orders.functions";
import { listMyOrgs } from "@/lib/orgs.functions";
import { useCurrentOrgId, OrgPermGate } from "./orga";
import { ItemLink } from "@/components/catalog/ItemLink";
import { PageHint } from "@/components/orga/PageHint";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ShoppingCart, Check, X, PlayCircle, Ban } from "lucide-react";
import { useRealtimeInvalidate } from "@/hooks/useRealtimeInvalidate";

const QM = ["owner", "officer", "quartermaster"];

export const Route = createFileRoute("/_authenticated/orga/bestellungen")({
  component: () => (
    <OrgPermGate perm="orders.view">
      <OrdersPage />
    </OrgPermGate>
  ),
});

const STATUS_LABEL: Record<OrderRow["status"], string> = {
  pending: "Offen",
  in_progress: "In Arbeit",
  fulfilled: "Erfüllt",
  rejected: "Abgelehnt",
  cancelled: "Storniert",
};
const STATUS_CLASS: Record<OrderRow["status"], string> = {
  pending: "bg-amber-500/20 text-amber-300",
  in_progress: "bg-blue-500/20 text-blue-300",
  fulfilled: "bg-emerald-500/20 text-emerald-300",
  rejected: "bg-red-500/20 text-red-300",
  cancelled: "bg-muted text-muted-foreground",
};

function OrdersPage() {
  const [orgId] = useCurrentOrgId();
  const orgsFn = useServerFn(listMyOrgs);
  const listFn = useServerFn(listOrders);
  const decideFn = useServerFn(updateOrderStatus);
  const cancelFn = useServerFn(cancelOrder);
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const me = orgsQ.data?.orgs.find((o) => o.id === orgId);
  const canManage = me ? QM.includes(me.my_role) : false;

  const allQ = useQuery({
    queryKey: ["orga-orders", orgId, "all"],
    queryFn: () => listFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });
  const mineQ = useQuery({
    queryKey: ["orga-orders", orgId, "mine"],
    queryFn: () => listFn({ data: { org_id: orgId!, mine: true } }),
    enabled: !!orgId,
  });

  useRealtimeInvalidate(
    orgId
      ? [
          {
            table: "orga_orders",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["orga-orders", orgId]],
          },
          {
            table: "orga_order_reservations",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["orga-orders", orgId]],
          },
          {
            table: "org_warehouse",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["orga-orders", orgId]],
          },
        ]
      : [],
    `orga-orders-${orgId ?? "none"}`,
  );

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["orga-orders"] });
  };

  const [decision, setDecision] = useState<{
    order: OrderRow;
    status: "in_progress" | "fulfilled" | "rejected";
  } | null>(null);
  const [note, setNote] = useState("");

  const decideM = useMutation({
    mutationFn: () =>
      decideFn({
        data: {
          order_id: decision!.order.id,
          status: decision!.status,
          note: note.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Status aktualisiert");
      setDecision(null);
      setNote("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { order_id: id } }),
    onSuccess: () => {
      toast.success("Bestellung storniert");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!orgId)
    return (
      <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>
    );

  const all = allQ.data?.orders ?? [];
  const mine = mineQ.data?.orders ?? [];
  const pending = all.filter((o) => o.status === "pending");
  const inProgress = all.filter((o) => o.status === "in_progress");
  const done = all.filter(
    (o) =>
      o.status === "fulfilled" ||
      o.status === "rejected" ||
      o.status === "cancelled",
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          // orgalager · bestellungen
        </div>
        <Button asChild size="sm">
          <Link to="/orga/bestellen">
            <ShoppingCart className="mr-2 h-3 w-3" /> Neue Bestellung
          </Link>
        </Button>
      </div>

      <PageHint>
        Hier siehst du alle eingegangenen Bestellungen aus dem Orgalager. Als
        Orgateam kannst du Anfragen annehmen, ablehnen oder als erfüllt
        markieren – offene Vorgänge werden automatisch reserviert.
      </PageHint>

      <Tabs defaultValue={canManage ? "queue" : "mine"}>
        <TabsList>
          {canManage && (
            <>
              <TabsTrigger value="queue">
                Warteschlange
                <Badge variant="outline" className="ml-2">
                  {pending.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="active">
                In Arbeit
                <Badge variant="outline" className="ml-2">
                  {inProgress.length}
                </Badge>
              </TabsTrigger>
            </>
          )}
          <TabsTrigger value="mine">
            Meine Bestellungen
            <Badge variant="outline" className="ml-2">
              {mine.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="archive">
            Archiv
            <Badge variant="outline" className="ml-2">
              {done.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        {canManage && (
          <TabsContent value="queue" className="mt-4">
            <OrderList
              orders={pending}
              canManage
              onDecision={(o, s) => {
                setDecision({ order: o, status: s });
                setNote("");
              }}
              onCancel={(id) => cancelM.mutate(id)}
            />
          </TabsContent>
        )}
        {canManage && (
          <TabsContent value="active" className="mt-4">
            <OrderList
              orders={inProgress}
              canManage
              onDecision={(o, s) => {
                setDecision({ order: o, status: s });
                setNote("");
              }}
              onCancel={(id) => cancelM.mutate(id)}
            />
          </TabsContent>
        )}
        <TabsContent value="mine" className="mt-4">
          <OrderList
            orders={mine}
            canManage={canManage}
            onDecision={(o, s) => {
              setDecision({ order: o, status: s });
              setNote("");
            }}
            onCancel={(id) => cancelM.mutate(id)}
          />
        </TabsContent>
        <TabsContent value="archive" className="mt-4">
          <OrderList
            orders={done}
            canManage={false}
            onDecision={() => {}}
            onCancel={() => {}}
          />
        </TabsContent>
      </Tabs>

      <Dialog
        open={!!decision}
        onOpenChange={(o) => (o ? null : setDecision(null))}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {decision
                ? decision.status === "in_progress"
                  ? "Bestellung annehmen"
                  : decision.status === "fulfilled"
                    ? "Als erfüllt markieren"
                    : "Bestellung ablehnen"
                : ""}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              Notiz an den Besteller (optional)
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDecision(null)}>
              Abbrechen
            </Button>
            <Button
              onClick={() => decideM.mutate()}
              disabled={decideM.isPending}
            >
              Bestätigen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OrderList({
  orders,
  canManage,
  onDecision,
  onCancel,
}: {
  orders: OrderRow[];
  canManage: boolean;
  onDecision: (
    o: OrderRow,
    status: "in_progress" | "fulfilled" | "rejected",
  ) => void;
  onCancel: (id: string) => void;
}) {
  if (orders.length === 0)
    return (
      <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
        Keine Einträge.
      </div>
    );
  return (
    <div className="space-y-2">
      {orders.map((o) => (
        <details
          key={o.id}
          className="border border-brand/10 bg-background/50 open:bg-background/70"
        >
          <summary className="flex cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 sm:gap-3">
            <ShoppingCart className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1 basis-[calc(100%-4rem)] sm:basis-auto">
              <div className="truncate text-sm font-medium">
                <ItemLink item_ref={o.item_ref} name={o.item_name} />{" "}
                <span className="font-mono text-xs text-muted-foreground">
                  × {o.qty}
                </span>
              </div>
              <div className="break-words text-[10px] text-muted-foreground">
                {o.requested_by_callsign ?? "—"} ·{" "}
                {new Date(o.created_at).toLocaleString("de-DE")}
                {o.decided_by_callsign && (
                  <> · Entscheidung: {o.decided_by_callsign}</>
                )}
              </div>
            </div>
            <Badge className={STATUS_CLASS[o.status]}>
              {STATUS_LABEL[o.status]}
            </Badge>
            {canManage && o.status === "pending" && (
              <>
                <Button
                  size="sm"
                  onClick={(e) => {
                    e.preventDefault();
                    onDecision(o, "in_progress");
                  }}
                >
                  <PlayCircle className="mr-1 h-3 w-3" /> Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    e.preventDefault();
                    onDecision(o, "rejected");
                  }}
                >
                  <Ban className="h-3 w-3" />
                </Button>
              </>
            )}
            {canManage && o.status === "in_progress" && (
              <Button
                size="sm"
                onClick={(e) => {
                  e.preventDefault();
                  onDecision(o, "fulfilled");
                }}
              >
                <Check className="mr-1 h-3 w-3" /> Erfüllt
              </Button>
            )}
            {o.status === "pending" && (
              <Button
                size="sm"
                variant="ghost"
                onClick={(e) => {
                  e.preventDefault();
                  onCancel(o.id);
                }}
                title="Stornieren (nur Besteller)"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </summary>
          <div className="border-t border-brand/10 p-3 text-xs">
            {o.notes && (
              <div className="mb-2 rounded border border-brand/10 bg-background/50 p-2 text-[11px]">
                „{o.notes}"
              </div>
            )}
            {o.decision_note && (
              <div className="mb-2 rounded border border-brand/10 bg-background/50 p-2 text-[11px] text-muted-foreground">
                Antwort: {o.decision_note}
              </div>
            )}
            <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Analyse-Snapshot ({o.resolve_deep ? "rekursiv" : "1 Ebene"})
              {o.computed_min_quality != null && (
                <> · Q ≥ {o.computed_min_quality}</>
              )}
            </div>
            {o.analysis_snapshot.length === 0 ? (
              <div className="text-muted-foreground">
                Kein Blueprint hinterlegt.
              </div>
            ) : (
              <div className="space-y-1">
                {o.analysis_snapshot.map((r, i) => (
                  <div
                    key={`${o.id}-${i}`}
                    className={
                      "flex items-center gap-2 border px-2 py-1 " +
                      (r.missing > 0
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
                    <div className="min-w-0 flex-1 truncate">
                      <ItemLink item_ref={r.item_ref} name={r.item_name} />
                    </div>
                    <div className="font-mono text-[10px]">
                      {r.available} / {r.required}
                    </div>
                    {r.missing > 0 && (
                      <Badge
                        variant="outline"
                        className={
                          "text-[9px] " +
                          (r.requester_will_supply
                            ? "border-emerald-500/40 text-emerald-300"
                            : "border-amber-500/40 text-amber-300")
                        }
                      >
                        {r.requester_will_supply
                          ? "Liefert Besteller"
                          : `fehlt ${r.missing}`}
                      </Badge>
                    )}
                  </div>
                ))}
              </div>
            )}
            {canManage && o.allocations.length > 0 && (
              <div className="mt-3">
                <div className="mb-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  Reservierte Positionen ({o.allocations.length})
                </div>
                <div className="space-y-1">
                  {o.allocations.map((a) => (
                    <div
                      key={a.reservation_id}
                      className="flex flex-wrap items-center gap-2 border border-brand/10 bg-background/40 px-2 py-1 text-[11px]"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <ItemLink item_ref={a.item_ref} name={a.item_name} />
                      </div>
                      <span className="font-mono text-[10px]">× {a.qty}</span>
                      {a.quality != null && (
                        <Badge variant="outline" className="text-[9px]">
                          Q {a.quality}
                        </Badge>
                      )}
                      {a.held_by_callsign && (
                        <Badge variant="outline" className="text-[9px]">
                          Halter: {a.held_by_callsign}
                        </Badge>
                      )}
                      {a.location_name && (
                        <Badge variant="outline" className="text-[9px]">
                          {a.location_name}
                        </Badge>
                      )}
                      {!a.warehouse_id && (
                        <Badge
                          variant="outline"
                          className="border-amber-500/40 text-[9px] text-amber-300"
                        >
                          ohne Position
                        </Badge>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </details>
      ))}
    </div>
  );
}