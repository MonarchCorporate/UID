import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Store,
  Tag,
  History,
  StickyNote,
  Bookmark,
  Wrench,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { listMyOrgs } from "@/lib/orgs.functions";
import {
  listShopManageableItems,
  listShopReservations,
  setWarehouseItemForSale,
  updateShopReservationStatus,
  setShopReservationInternalNote,
  listShopReservationHistory,
  listShopReservationAllocations,
  SHOP_STATUS_LABELS,
  type ShopReservationStatus,
  type ShopReservationRow,
} from "@/lib/shop.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRealtimeInvalidate } from "@/hooks/useRealtimeInvalidate";
import { PageHint } from "@/components/orga/PageHint";
import { OrgPermGate } from "./orga";

export const Route = createFileRoute("/_authenticated/orga/shop")({
  component: () => (
    <OrgPermGate perm="warehouse.manage">
      <OrgaShopPage />
    </OrgPermGate>
  ),
});

function OrgaShopPage() {
  const orgsFn = useServerFn(listMyOrgs);
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const org = orgsQ.data?.orgs?.[0] ?? null;

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Button asChild size="sm" variant="ghost">
          <Link to="/orga">
            <ArrowLeft className="mr-1 h-3 w-3" /> Zurück
          </Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/shop">Öffentlichen Shop öffnen</Link>
        </Button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Store className="h-5 w-5 text-brand" /> Shop
          </CardTitle>
        </CardHeader>
        <CardContent>
          <PageHint className="mb-4">
            Verwalte öffentliche Verkaufsangebote deiner Orga und bearbeite
            eingehende Bestellungen. Reservierungen werden automatisch aus dem
            Lagerbestand abgezogen, sobald du sie bestätigst.
          </PageHint>
          {!org ? (
            <p className="text-sm text-muted-foreground">Lade Orga…</p>
          ) : (
            <Tabs defaultValue="orders">
              <TabsList>
                <TabsTrigger value="orders">Bestellungen</TabsTrigger>
                <TabsTrigger value="items">Verkaufs-Items</TabsTrigger>
              </TabsList>
              <TabsContent value="orders" className="pt-4">
                <ReservationsList orgId={org.id} />
              </TabsContent>
              <TabsContent value="items" className="pt-4">
                <SaleItemsList orgId={org.id} />
              </TabsContent>
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReservationsList({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listShopReservations);
  const [status, setStatus] =
    useState<"pending" | "reserved" | "in_progress" | "all">("pending");
  const [detail, setDetail] = useState<ShopReservationRow | null>(null);
  const q = useQuery({
    queryKey: ["shop-reservations", orgId, status],
    queryFn: () => listFn({ data: { orgId, status } }),
  });
  useRealtimeInvalidate(
    [
      {
        table: "shop_reservations",
        filter: `org_id=eq.${orgId}`,
        invalidate: [
          ["shop-reservations", orgId],
          ["shop-manage-items", orgId],
        ],
      },
      {
        table: "shop_reservation_history",
        invalidate: [["shop-reservation-history"]],
      },
      {
        table: "shop_reservation_allocations",
        invalidate: [
          ["shop-reservation-allocations"],
          ["shop-manage-items", orgId],
        ],
      },
      {
        table: "org_warehouse",
        filter: `org_id=eq.${orgId}`,
        invalidate: [["shop-manage-items", orgId]],
      },
    ],
    `orga-shop-${orgId}`,
  );
  const rows = q.data?.reservations ?? [];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["pending", "Eingegangen"],
            ["reserved", "Reserviert"],
            ["in_progress", "In Bearbeitung"],
            ["all", "Alle"],
          ] as const
        ).map(([k, label]) => (
          <Button
            key={k}
            size="sm"
            variant={status === k ? "default" : "outline"}
            onClick={() => setStatus(k)}
          >
            {label}
          </Button>
        ))}
      </div>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : rows.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          // keine bestellungen
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div
              key={r.id}
              className="cursor-pointer rounded-lg border border-white/5 bg-white/[0.02] p-3 transition hover:border-brand/30"
              onClick={() => setDetail(r)}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{r.item_name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {r.qty} {r.unit}
                    </Badge>
                    <Badge className="text-[10px]" variant="secondary">
                      {r.total_price.toLocaleString("de-DE")} aUEC
                    </Badge>
                    <StatusBadge status={r.status} />
                    {r.internal_notes && (
                      <Badge variant="outline" className="text-[10px]">
                        <StickyNote className="mr-1 h-3 w-3" /> Notiz
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Ingame: <span className="text-foreground">{r.buyer_ingame_name}</span>
                    {" · "}Discord: <span className="text-foreground">{r.buyer_discord_name}</span>
                  </div>
                  {r.buyer_note && (
                    <p className="text-xs text-muted-foreground italic">
                      „{r.buyer_note}"
                    </p>
                  )}
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    {new Date(r.created_at).toLocaleString("de-DE")}
                  </div>
                </div>
                <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setDetail(r); }}>
                  Öffnen
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ReservationDetailDialog
        orgId={orgId}
        reservation={detail}
        onClose={() => setDetail(null)}
        onChanged={() => {
          qc.invalidateQueries({ queryKey: ["shop-reservations", orgId] });
          qc.invalidateQueries({ queryKey: ["shop-manage-items", orgId] });
        }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: ShopReservationStatus }) {
  const label = SHOP_STATUS_LABELS[status] ?? status;
  const cls: Record<ShopReservationStatus, string> = {
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    reserved: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    in_progress: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    fulfilled: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    cancelled: "bg-white/5 text-muted-foreground border-white/10",
  };
  return (
    <Badge variant="outline" className={`text-[10px] ${cls[status] ?? ""}`}>
      {label}
    </Badge>
  );
}

const ALL_STATUSES: ShopReservationStatus[] = [
  "pending",
  "reserved",
  "in_progress",
  "fulfilled",
  "cancelled",
];
void ALL_STATUSES;

type WorkflowAction = {
  status: ShopReservationStatus;
  label: string;
  icon: React.ReactNode;
  variant: "default" | "outline" | "ghost" | "secondary" | "destructive";
  className?: string;
};

function nextStatusOptions(current: ShopReservationStatus): WorkflowAction[] {
  const reserve: WorkflowAction = {
    status: "reserved",
    label: "Reservieren",
    icon: <Bookmark className="mr-1 h-3 w-3" />,
    variant: "outline",
  };
  const progress: WorkflowAction = {
    status: "in_progress",
    label: "In Bearbeitung",
    icon: <Wrench className="mr-1 h-3 w-3" />,
    variant: "outline",
  };
  const fulfill: WorkflowAction = {
    status: "fulfilled",
    label: "Erfüllen",
    icon: <CheckCircle2 className="mr-1 h-3 w-3" />,
    variant: "default",
  };
  const cancel: WorkflowAction = {
    status: "cancelled",
    label: "Stornieren",
    icon: <XCircle className="mr-1 h-3 w-3" />,
    variant: "ghost",
    className: "text-red-300 hover:text-red-200",
  };
  switch (current) {
    case "pending":
      return [reserve, progress, fulfill, cancel];
    case "reserved":
      return [progress, fulfill, cancel];
    case "in_progress":
      return [fulfill, cancel];
    default:
      return [];
  }
}

function ReservationDetailDialog({
  orgId: _orgId,
  reservation,
  onClose,
  onChanged,
}: {
  orgId: string;
  reservation: ShopReservationRow | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateShopReservationStatus);
  const noteFn = useServerFn(setShopReservationInternalNote);
  const historyFn = useServerFn(listShopReservationHistory);
  const allocFn = useServerFn(listShopReservationAllocations);

  const [changeNote, setChangeNote] = useState("");
  const [internalNote, setInternalNote] = useState("");

  const rid = reservation?.id ?? null;

  const history = useQuery({
    queryKey: ["shop-reservation-history", rid],
    queryFn: () => historyFn({ data: { reservation_id: rid! } }),
    enabled: !!rid,
  });
  const alloc = useQuery({
    queryKey: ["shop-reservation-allocations", rid],
    queryFn: () => allocFn({ data: { reservation_id: rid! } }),
    enabled: !!rid,
  });

  // Sync fields when reservation changes
  useMemo(() => {
    if (reservation) {
      setInternalNote(reservation.internal_notes ?? "");
      setChangeNote("");
    }
  }, [reservation]);

  const statusMut = useMutation({
    mutationFn: (to: ShopReservationStatus) =>
      updateFn({
        data: {
          reservation_id: rid!,
          to_status: to,
          note: changeNote.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Status aktualisiert");
      setChangeNote("");
      qc.invalidateQueries({ queryKey: ["shop-reservation-history", rid] });
      onChanged();
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const noteMut = useMutation({
    mutationFn: () =>
      noteFn({ data: { reservation_id: rid!, note: internalNote } }),
    onSuccess: () => {
      toast.success("Notiz gespeichert");
      onChanged();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const terminal =
    reservation?.status === "fulfilled" ||
    reservation?.status === "cancelled";

  return (
    <Dialog open={!!reservation} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Bestellung · {reservation?.item_name}
          </DialogTitle>
        </DialogHeader>
        {reservation && (
          <div className="space-y-4">
            <div className="grid gap-2 rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs">
              <div className="flex items-center gap-2">
                <StatusBadge status={reservation.status} />
                <span className="text-muted-foreground">·</span>
                <span>
                  {reservation.qty} {reservation.unit} ·{" "}
                  <span className="font-mono text-brand">
                    {reservation.total_price.toLocaleString("de-DE")} aUEC
                  </span>
                </span>
              </div>
              <div className="text-muted-foreground">
                Ingame:{" "}
                <span className="text-foreground">
                  {reservation.buyer_ingame_name}
                </span>{" "}
                · Discord:{" "}
                <span className="text-foreground">
                  {reservation.buyer_discord_name}
                </span>
              </div>
              {reservation.buyer_note && (
                <div className="italic text-muted-foreground">
                  „{reservation.buyer_note}"
                </div>
              )}
            </div>

            {!terminal && (
              <div className="space-y-2 rounded-md border border-white/5 p-3">
                <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  // workflow
                </div>
                <Textarea
                  value={changeNote}
                  onChange={(e) => setChangeNote(e.target.value)}
                  maxLength={1000}
                  rows={2}
                  placeholder="Notiz zum Statuswechsel (optional)"
                />
                <div className="flex flex-wrap gap-2 pt-1">
                  {nextStatusOptions(reservation.status).map((opt) => (
                    <Button
                      key={opt.status}
                      size="sm"
                      variant={opt.variant}
                      disabled={statusMut.isPending}
                      onClick={() => statusMut.mutate(opt.status)}
                      className={opt.className}
                    >
                      {opt.icon}
                      {opt.label}
                    </Button>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-md border border-white/5 p-3">
              <div className="flex items-center justify-between">
                <Label htmlFor="ins" className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                  // interne notiz
                </Label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={
                    noteMut.isPending ||
                    (internalNote ?? "") === (reservation.internal_notes ?? "")
                  }
                  onClick={() => noteMut.mutate()}
                >
                  Speichern
                </Button>
              </div>
              <Textarea
                id="ins"
                value={internalNote}
                onChange={(e) => setInternalNote(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Nur für die Lagerverwaltung sichtbar"
              />
            </div>

            <div className="space-y-2 rounded-md border border-white/5 p-3">
              <div className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                // lagerpositionen ({(alloc.data?.allocations ?? []).length})
              </div>
              {alloc.isLoading ? (
                <p className="text-xs text-muted-foreground">Lade…</p>
              ) : (alloc.data?.allocations ?? []).length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Keine Lagerpositionen zugeordnet.
                </p>
              ) : (
                <ul className="space-y-1">
                  {alloc.data!.allocations.map((a) => (
                    <li
                      key={a.id}
                      className="flex flex-wrap items-center gap-2 rounded border border-white/5 bg-white/[0.02] px-2 py-1.5 text-xs"
                    >
                      <Badge variant="outline" className="text-[10px]">
                        {a.qty} {a.unit}
                      </Badge>
                      {a.quality != null && (
                        <Badge variant="outline" className="text-[10px]">
                          Q{a.quality}
                        </Badge>
                      )}
                      {a.held_by_callsign && (
                        <span className="text-[11px]">
                          Halter:{" "}
                          <span className="text-foreground">
                            {a.held_by_callsign}
                          </span>
                        </span>
                      )}
                      {a.location_name && (
                        <span className="text-[11px] text-muted-foreground">
                          · {a.location_name}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="space-y-2 rounded-md border border-white/5 p-3">
              <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
                <History className="h-3 w-3" /> // verlauf
              </div>
              {history.isLoading ? (
                <p className="text-xs text-muted-foreground">Lade Verlauf…</p>
              ) : (history.data?.history?.length ?? 0) === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Noch keine Statusänderungen.
                </p>
              ) : (
                <ol className="space-y-2">
                  {history.data!.history.map((h) => (
                    <li
                      key={h.id}
                      className="rounded border border-white/5 bg-white/[0.02] p-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        {h.from_status && (
                          <>
                            <StatusBadge status={h.from_status} />
                            <span className="text-muted-foreground">→</span>
                          </>
                        )}
                        <StatusBadge status={h.to_status} />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          {new Date(h.created_at).toLocaleString("de-DE")}
                        </span>
                        {h.actor_name && (
                          <span className="text-[10px] text-muted-foreground">
                            · {h.actor_name}
                          </span>
                        )}
                      </div>
                      {h.note && (
                        <p className="mt-1 italic text-muted-foreground">
                          „{h.note}"
                        </p>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SaleItemsList({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listShopManageableItems);
  const setFn = useServerFn(setWarehouseItemForSale);
  const q = useQuery({
    queryKey: ["shop-manage-items", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });
  const [filter, setFilter] = useState("");
  const [only, setOnly] = useState<"all" | "sale">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");
  const [priceOpen, setPriceOpen] = useState<{
    id: string;
    name: string;
    qty: number;
    reserved: number;
    unit: string;
  } | null>(null);
  const [price, setPrice] = useState<string>("");
  const [saleQtyInput, setSaleQtyInput] = useState<string>("");
  const [note, setNote] = useState("");

  const items = useMemo(() => {
    let list = q.data?.items ?? [];
    if (only === "sale") list = list.filter((i) => i.for_sale);
    if (categoryFilter === "__none") list = list.filter((i) => !i.category);
    else if (categoryFilter !== "__all")
      list = list.filter((i) => i.category === categoryFilter);
    if (filter.trim()) {
      const f = filter.toLowerCase();
      list = list.filter((i) => (i.item_name ?? "").toLowerCase().includes(f));
    }
    return list;
  }, [q.data, filter, only, categoryFilter]);

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    for (const i of q.data?.items ?? []) if (i.category) s.add(i.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "de"));
  }, [q.data]);

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof items>();
    for (const i of items) {
      const key = i.category ?? "Ohne Kategorie";
      if (!groups.has(key)) groups.set(key, [] as typeof items);
      groups.get(key)!.push(i);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Ohne Kategorie") return 1;
      if (b === "Ohne Kategorie") return -1;
      return a.localeCompare(b, "de");
    });
  }, [items]);

  const saveMut = useMutation({
    mutationFn: (v: {
      warehouse_id: string;
      for_sale: boolean;
      unit_price?: number;
      sale_qty?: number;
      sale_note?: string;
    }) => setFn({ data: v }),
    onSuccess: () => {
      toast.success("Gespeichert");
      setPriceOpen(null);
      setPrice("");
      setSaleQtyInput("");
      setNote("");
      qc.invalidateQueries({ queryKey: ["shop-manage-items", orgId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Suchen…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="max-w-xs"
        />
        <Button
          size="sm"
          variant={only === "all" ? "default" : "outline"}
          onClick={() => setOnly("all")}
        >
          Alle
        </Button>
        <Button
          size="sm"
          variant={only === "sale" ? "default" : "outline"}
          onClick={() => setOnly("sale")}
        >
          Nur Verkauf
        </Button>
        {(allCategories.length > 0 ||
          (q.data?.items ?? []).some((i) => !i.category)) && (
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="h-9 w-[200px]">
              <SelectValue placeholder="Kategorie filtern" />
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
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : items.length === 0 ? (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          // keine items
        </p>
      ) : (
        <div className="space-y-5">
          {grouped.map(([cat, list]) => (
            <div key={cat} className="space-y-2">
              <div className="flex items-center gap-2 border-b border-white/5 pb-1">
                <span className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                  // {cat}
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {list.length}
                </Badge>
              </div>
              <div className="space-y-1">
          {list.map((i) => {
            const qty = Number(i.qty ?? 0);
            const reserved = Number(i.reserved_qty ?? 0);
            const available = qty - reserved;
            return (
              <div
                key={i.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {i.item_name}
                    </span>
                    {i.quality != null && (
                      <Badge variant="outline" className="text-[10px]">
                        Q{i.quality}
                      </Badge>
                    )}
                    {i.locked && (
                      <Badge variant="destructive" className="text-[10px]">
                        gesperrt
                      </Badge>
                    )}
                    {i.for_sale && (
                      <Badge className="text-[10px]">
                        <Tag className="mr-1 h-3 w-3" />
                        {Number(i.sale_price ?? 0).toLocaleString("de-DE")} aUEC
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {available} verfügbar / {qty} {i.unit}
                    {reserved > 0 && ` · ${reserved} reserviert`}
                    {i.for_sale && (
                      <> · <span className="text-emerald-300">{Math.min(Number((i as { sale_qty?: number }).sale_qty ?? 0), qty)}/{qty} zum Verkauf</span></>
                    )}
                  </div>
                  {(i.held_by_callsign || i.location_name) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
                      {i.held_by_callsign && (
                        <span>
                          Halter:{" "}
                          <span className="text-foreground">
                            {i.held_by_callsign}
                          </span>
                        </span>
                      )}
                      {i.location_name && (
                        <span>Standort: {i.location_name}</span>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  {i.for_sale ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setPriceOpen({ id: i.id, name: i.item_name, qty, reserved, unit: i.unit });
                          setPrice(String(i.sale_price ?? ""));
                          setSaleQtyInput(
                            String(Math.min(Number((i as { sale_qty?: number }).sale_qty ?? 0), qty) || qty),
                          );
                          setNote(i.sale_note ?? "");
                        }}
                      >
                        Bearbeiten
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saveMut.isPending || reserved > 0}
                        onClick={() =>
                          saveMut.mutate({
                            warehouse_id: i.id,
                            for_sale: false,
                          })
                        }
                        title={
                          reserved > 0
                            ? "Erst offene Reservierungen schließen"
                            : undefined
                        }
                      >
                        Aus Verkauf
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      disabled={i.locked || available <= 0}
                      onClick={() => {
                        setPriceOpen({ id: i.id, name: i.item_name, qty, reserved, unit: i.unit });
                        setPrice("");
                        setSaleQtyInput(String(available));
                        setNote("");
                      }}
                    >
                      Zum Verkauf
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!priceOpen} onOpenChange={(o) => !o && setPriceOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Verkauf · {priceOpen?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="sq">
                Verkaufsmenge{" "}
                {priceOpen && (
                  <span className="text-[11px] text-muted-foreground">
                    (max {priceOpen.qty} {priceOpen.unit}
                    {priceOpen.reserved > 0 && `, ${priceOpen.reserved} bereits reserviert`})
                  </span>
                )}
              </Label>
              <Input
                id="sq"
                inputMode="numeric"
                value={saleQtyInput}
                onChange={(e) => setSaleQtyInput(e.target.value)}
                placeholder="z. B. 5"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sp">Preis pro Einheit (aUEC)</Label>
              <Input
                id="sp"
                inputMode="decimal"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="z. B. 1500"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="sn">Notiz (optional)</Label>
              <Textarea
                id="sn"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPriceOpen(null)}>
              Abbrechen
            </Button>
            <Button
              disabled={
                saveMut.isPending ||
                !priceOpen ||
                !(Number(price) >= 0 && price.trim() !== "") ||
                !(Number(saleQtyInput) > 0 && saleQtyInput.trim() !== "")
              }
              onClick={() =>
                priceOpen &&
                saveMut.mutate({
                  warehouse_id: priceOpen.id,
                  for_sale: true,
                  unit_price: Number(price),
                  sale_qty: Number(saleQtyInput),
                  sale_note: note.trim() || undefined,
                })
              }
            >
              Speichern
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}