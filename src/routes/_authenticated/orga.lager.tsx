import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ItemLink } from "@/components/catalog/ItemLink";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  listOrgWarehouse,
  listOrgOffers,
  claimOffer,
  cancelOffer,
  adjustWarehouseStock,
  issueWarehouseToMember,
  type WarehouseItem,
  releaseWarehouseStock,
  listOrgReleases,
  cancelRelease,
  requestRelease,
  listReleaseRequests,
  cancelReleaseRequest,
  decideReleaseRequest,
  setWarehouseLock,
  requestWarehouseItem,
  addWarehouseItem,
  setWarehouseItemCategory,
  setWarehouseItemHolder,
  setWarehouseItemLocation,
  addWarehouseItemsBulk,
  type ReleaseRow,
  type OfferRow,
} from "@/lib/org-warehouse.functions";
import { searchItemCatalog, listMyLocations } from "@/lib/inventory.functions";
import { LocationPicker, type PickedLocation } from "@/components/inventory/LocationPicker";
import { listMyOrgs, listOrgMembers } from "@/lib/orgs.functions";
import { hasPerm } from "@/lib/org-perms";
import { useCurrentOrgId } from "./orga";
import { PageHint } from "@/components/orga/PageHint";
import { useRealtimeInvalidate } from "@/hooks/useRealtimeInvalidate";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Package,
  Check,
  X,
  Edit,
  Send,
  Share2,
  HandCoins,
  Lock,
  Unlock,
  Plus,
  Tag,
  User as UserIcon,
  MapPin,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { formatQty, type Unit } from "@/lib/units";
import { resolveSuggestedCategory } from "@/lib/category-suggest";

export const Route = createFileRoute("/_authenticated/orga/lager")({
  component: WarehousePage,
});

const QM = ["owner", "officer", "quartermaster"];

function WarehousePage() {
  const [orgId] = useCurrentOrgId();
  const orgsFn = useServerFn(listMyOrgs);
  const wFn = useServerFn(listOrgWarehouse);
  const oFn = useServerFn(listOrgOffers);
  const claimFn = useServerFn(claimOffer);
  const cancelFn = useServerFn(cancelOffer);
  const adjFn = useServerFn(adjustWarehouseStock);
  const releasesFn = useServerFn(listOrgReleases);
  const requestsFn = useServerFn(listReleaseRequests);
  const cancelRelFn = useServerFn(cancelRelease);
  const cancelReqFn = useServerFn(cancelReleaseRequest);
  const decideFn = useServerFn(decideReleaseRequest);
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const me = orgsQ.data?.orgs.find((o) => o.id === orgId);
  const canManage = me ? QM.includes(me.my_role) : false;

  const warehouseQ = useQuery({
    queryKey: ["org-warehouse", orgId],
    queryFn: () => wFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });
  const offersQ = useQuery({
    queryKey: ["org-offers", orgId],
    queryFn: () => oFn({ data: { org_id: orgId!, status: "pending" } }),
    enabled: !!orgId,
  });
  const releasesQ = useQuery({
    queryKey: ["org-releases", orgId],
    queryFn: () => releasesFn({ data: { org_id: orgId!, status: "open" } }),
    enabled: !!orgId,
  });
  const requestsQ = useQuery({
    queryKey: ["org-release-requests", orgId],
    queryFn: () => requestsFn({ data: { org_id: orgId!, status: "pending" } }),
    enabled: !!orgId,
  });

  // Live-Updates: sofortige „verfügbar/gesamt"-Aktualisierung wenn Bestand,
  // Freigabe-Anfragen, Spenden oder Shop-Reservierungen sich ändern.
  useRealtimeInvalidate(
    orgId
      ? [
          {
            table: "org_warehouse",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["org-warehouse", orgId]],
          },
          {
            table: "org_warehouse_release_requests",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["org-release-requests", orgId], ["org-warehouse", orgId]],
          },
          {
            table: "org_warehouse_claims",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["org-offers", orgId], ["org-releases", orgId]],
          },
          {
            table: "shop_reservations",
            filter: `org_id=eq.${orgId}`,
            invalidate: [["org-warehouse", orgId]],
          },
        ]
      : [],
    `orga-lager-${orgId ?? "none"}`,
  );

  const claimM = useMutation({
    mutationFn: (id: string) => claimFn({ data: { claim_id: id } }),
    onSuccess: () => {
      toast.success("Angebot beansprucht");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      qc.invalidateQueries({ queryKey: ["org-offers"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { claim_id: id } }),
    onSuccess: () => {
      toast.success("Angebot zurückgezogen");
      qc.invalidateQueries({ queryKey: ["org-offers"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const adjM = useMutation({
    mutationFn: (v: { warehouse_id: string; new_qty: number }) =>
      adjFn({ data: v }),
    onSuccess: () => {
      toast.success("Bestand aktualisiert");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [editing, setEditing] = useState<string | null>(null);
  const [editQty, setEditQty] = useState<string>("");
  const [issuing, setIssuing] = useState<WarehouseItem | null>(null);
  const [releasing, setReleasing] = useState<WarehouseItem | null>(null);
  const [requesting, setRequesting] = useState<ReleaseRow | null>(null);
  const [requestingStock, setRequestingStock] = useState<WarehouseItem | null>(null);
  const [locking, setLocking] = useState<WarehouseItem | null>(null);
  const [adding, setAdding] = useState(false);
  const [editingCat, setEditingCat] = useState<WarehouseItem | null>(null);
  const [editingHolder, setEditingHolder] = useState<WarehouseItem | null>(null);
  const [editingLoc, setEditingLoc] = useState<WarehouseItem | null>(null);
  const [claimingOffer, setClaimingOffer] = useState<OfferRow | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("__all");

  const lockFn = useServerFn(setWarehouseLock);
  const lockM = useMutation({
    mutationFn: (v: { warehouse_id: string; locked: boolean; reason?: string }) =>
      lockFn({ data: v }),
    onSuccess: (_d, v) => {
      toast.success(v.locked ? "Item gesperrt" : "Sperre aufgehoben");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["org-warehouse"] });
    qc.invalidateQueries({ queryKey: ["org-releases"] });
    qc.invalidateQueries({ queryKey: ["org-release-requests"] });
    qc.invalidateQueries({ queryKey: ["inventory"] });
  };

  const cancelRelM = useMutation({
    mutationFn: (id: string) => cancelRelFn({ data: { release_id: id } }),
    onSuccess: () => {
      toast.success("Freigabe zurückgenommen");
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const cancelReqM = useMutation({
    mutationFn: (id: string) => cancelReqFn({ data: { request_id: id } }),
    onSuccess: () => {
      toast.success("Anfrage zurückgezogen");
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const decideM = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      decideFn({ data: { request_id: v.id, approve: v.approve } }),
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Anfrage genehmigt" : "Anfrage abgelehnt");
      invalidateAll();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!orgId) return <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>;

  const items = warehouseQ.data?.items ?? [];
  const offers = offersQ.data?.offers ?? [];
  const releases = releasesQ.data?.releases ?? [];
  const requests = requestsQ.data?.requests ?? [];

  const allCategories = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.category) s.add(i.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [items]);
  const filteredItems = useMemo(() => {
    if (categoryFilter === "__all") return items;
    if (categoryFilter === "__none") return items.filter((i) => !i.category);
    return items.filter((i) => i.category === categoryFilter);
  }, [items, categoryFilter]);
  const groupedItems = useMemo(() => {
    const groups = new Map<string, WarehouseItem[]>();
    for (const i of filteredItems) {
      const key = i.category ?? "Ohne Kategorie";
      const arr = groups.get(key) ?? [];
      arr.push(i);
      groups.set(key, arr);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => {
      if (a === "Ohne Kategorie") return 1;
      if (b === "Ohne Kategorie") return -1;
      return a.localeCompare(b);
    });
  }, [filteredItems]);

  return (
    <>
      <PageHint>
        Übersicht über den gesamten Orgalagerbestand. Gesperrte Items sind nur
        für das Orgateam verfügbar; offene Angebote und Freigaben kannst du hier
        direkt annehmen oder verwalten.
      </PageHint>

      <Tabs defaultValue={requests.length > 0 ? "requests" : offers.length > 0 ? "offers" : "stock"}>
      <TabsList>
        <TabsTrigger value="stock">
          Bestand <Badge variant="outline" className="ml-2">{items.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="offers">
          Offene Angebote{" "}
          <Badge variant="outline" className="ml-2">{offers.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="releases">
          Freigaben{" "}
          <Badge variant="outline" className="ml-2">{releases.length}</Badge>
        </TabsTrigger>
        <TabsTrigger value="requests">
          Anfragen{" "}
          <Badge variant="outline" className="ml-2">{requests.length}</Badge>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="stock" className="mt-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {(allCategories.length > 0 || items.some((i) => !i.category)) && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-8 w-56 text-xs">
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
          <div className="flex-1" />
          {canManage && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1 h-3 w-3" /> Item hinzufügen
            </Button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
            Lager ist leer.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
            Keine Items in dieser Kategorie.
          </div>
        ) : (
          <div className="space-y-4">
            {groupedItems.map(([group, list]) => (
              <div key={group} className="space-y-1">
                <div className="flex items-center gap-2 border-b border-brand/10 pb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <Tag className="h-3 w-3" /> {group}
                  <Badge variant="outline" className="text-[10px]">
                    {list.length}
                  </Badge>
                </div>
                {list.map((i) => (
              <div
                key={i.id}
                className={
                  "flex items-center gap-3 border px-3 py-2 " +
                  (i.locked
                    ? "border-red-500/40 bg-red-500/5"
                    : "border-brand/10 bg-background/50")
                }
              >
                {i.locked ? (
                  <Lock className="h-4 w-4 text-red-400" />
                ) : (
                  <Package className="h-4 w-4 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate text-sm font-medium">
                    <ItemLink
                      item_ref={i.item_ref}
                      name={i.item_name}
                      className="truncate"
                    />
                    {i.category && (
                      <Badge
                        variant="outline"
                        className="border-brand/30 text-[10px] text-brand"
                      >
                        {i.category}
                      </Badge>
                    )}
                    {i.locked && (
                      <Badge
                        variant="outline"
                        className="border-red-500/40 text-[10px] text-red-300"
                      >
                        Gesperrt
                      </Badge>
                    )}
                    {i.pending_qty > 0 && (
                      <Badge variant="outline" className="text-[10px]">
                        {formatQty(i.pending_qty, i.unit as Unit)} angefragt
                      </Badge>
                    )}
                    {i.reserved_qty > 0 && (
                      <Badge
                        variant="outline"
                        className="border-amber-500/40 text-[10px] text-amber-300"
                        title="Für offene Bestellungen reserviert"
                      >
                        {formatQty(i.reserved_qty, i.unit as Unit)} reserviert
                      </Badge>
                    )}
                    {i.for_sale && i.sale_qty > 0 && (
                      <Badge
                        variant="outline"
                        className="border-emerald-500/40 text-[10px] text-emerald-300"
                        title={
                          i.sale_price != null
                            ? `${i.sale_price.toLocaleString("de-DE")} aUEC / ${i.unit}`
                            : "Im Shop verfügbar"
                        }
                      >
                        {formatQty(Math.min(i.sale_qty, i.qty), i.unit as Unit)}/
                        {formatQty(i.qty, i.unit as Unit)} zum Verkauf
                      </Badge>
                    )}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    {i.item_kind ?? "—"} · eingelegt von{" "}
                    {i.deposited_by_callsign ?? "—"} ·{" "}
                    {new Date(i.deposited_at).toLocaleDateString("de-DE")}
                    {i.held_by_callsign ? (
                      <>
                        {" "}· <span className="text-brand">bei {i.held_by_callsign}</span>
                        {i.location_label ? (
                          <>
                            {" "}in{" "}
                            <span className="font-medium text-foreground">
                              {i.location_label}
                            </span>
                          </>
                        ) : null}
                        {i.location_since || i.held_at ? (
                          <>
                            {" "}seit{" "}
                            {new Date(
                              (i.location_since ?? i.held_at) as string,
                            ).toLocaleDateString("de-DE")}
                          </>
                        ) : null}
                      </>
                    ) : (
                      <>
                        {" "}·{" "}
                        {i.location_label ? (
                          <>
                            in{" "}
                            <span className="font-medium text-foreground">
                              {i.location_label}
                            </span>
                            {i.location_since && (
                              <>
                                {" "}seit{" "}
                                {new Date(i.location_since).toLocaleDateString(
                                  "de-DE",
                                )}
                              </>
                            )}
                          </>
                        ) : (
                          <span className="italic">kein Halter</span>
                        )}
                      </>
                    )}
                    {i.locked && (
                      <>
                        {" "}· gesperrt von {i.locked_by_callsign ?? "—"}
                        {i.lock_reason ? <> · „{i.lock_reason}"</> : null}
                      </>
                    )}
                  </div>
                </div>
                {editing === i.id ? (
                  <div className="flex items-center gap-1">
                    <Input
                      type="number"
                      value={editQty}
                      onChange={(e) => setEditQty(e.target.value)}
                      className="h-7 w-20 text-xs"
                    />
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        adjM.mutate({
                          warehouse_id: i.id,
                          new_qty: Number(editQty) || 0,
                        });
                        setEditing(null);
                      }}
                    >
                      <Check className="h-3 w-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setEditing(null)}
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <>
                    {(() => {
                      const held = i.pending_qty + i.reserved_qty;
                      const available = Math.max(0, i.qty - held);
                      const hasHold = held > 0;
                      return (
                        <div className="flex flex-col items-end leading-tight">
                          <span
                            className={
                              "font-mono text-sm " +
                              (hasHold
                                ? available <= 0
                                  ? "text-red-300"
                                  : "text-amber-200"
                                : "")
                            }
                            title={
                              hasHold
                                ? `${formatQty(available, i.unit as Unit)} verfügbar von ${formatQty(i.qty, i.unit as Unit)}${
                                    i.reserved_qty > 0
                                      ? ` · ${formatQty(i.reserved_qty, i.unit as Unit)} reserviert`
                                      : ""
                                  }${
                                    i.pending_qty > 0
                                      ? ` · ${formatQty(i.pending_qty, i.unit as Unit)} angefragt`
                                      : ""
                                  }`
                                : `${formatQty(i.qty, i.unit as Unit)} verfügbar`
                            }
                          >
                            {hasHold
                              ? `${formatQty(available, i.unit as Unit)} / ${formatQty(i.qty, i.unit as Unit)}`
                              : formatQty(i.qty, i.unit as Unit)}
                          </span>
                          {hasHold && (
                            <span className="font-mono text-[9px] uppercase tracking-widest text-muted-foreground">
                              verfügbar
                            </span>
                          )}
                        </div>
                      );
                    })()}
                    {!i.locked && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setRequestingStock(i)}
                        disabled={i.qty - i.pending_qty - i.reserved_qty <= 0}
                        title="Aus dem Lager anfragen"
                      >
                        <HandCoins className="mr-1 h-3 w-3" /> Anfragen
                      </Button>
                    )}
                    {canManage && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant="outline"
                            title="Aktionen"
                          >
                            <MoreHorizontal className="mr-1 h-3 w-3" />
                            Aktionen
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                          <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                            Bestand
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(i.id);
                              setEditQty(String(i.qty));
                            }}
                          >
                            <Edit className="mr-2 h-3 w-3" /> Menge korrigieren
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setReleasing(i)}>
                            <Share2 className="mr-2 h-3 w-3" /> Für Mitglieder freigeben
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setIssuing(i)}>
                            <Send className="mr-2 h-3 w-3" /> An Mitglied ausgeben
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                            Zuordnung
                          </DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => setEditingCat(i)}>
                            <Tag className="mr-2 h-3 w-3" /> Kategorie ändern
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingHolder(i)}>
                            <UserIcon className="mr-2 h-3 w-3" /> Halter setzen
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setEditingLoc(i)}>
                            <MapPin className="mr-2 h-3 w-3" /> Lagerort setzen
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() =>
                              i.locked
                                ? lockM.mutate({ warehouse_id: i.id, locked: false })
                                : setLocking(i)
                            }
                            className={i.locked ? "" : "text-red-300 focus:text-red-200"}
                          >
                            {i.locked ? (
                              <>
                                <Unlock className="mr-2 h-3 w-3" /> Sperre aufheben
                              </>
                            ) : (
                              <>
                                <Lock className="mr-2 h-3 w-3" /> Sperren
                              </>
                            )}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </>
                )}
              </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="offers" className="mt-4">
        {offers.length === 0 ? (
          <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
            Keine offenen Angebote.
          </div>
        ) : (
          <div className="space-y-1">
            {offers.map((o) => (
              <div
                key={o.id}
                className="flex items-center gap-3 border border-amber-500/30 bg-amber-500/5 px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    <ItemLink item_ref={o.item_ref} name={o.item_name} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    angeboten von {o.offered_by_callsign ?? "—"} ·{" "}
                    {new Date(o.offered_at).toLocaleString("de-DE")}
                    {o.notes && <> · „{o.notes}"</>}
                  </div>
                </div>
                <span className="font-mono text-sm">
                  {formatQty(o.qty, o.unit as Unit)}
                </span>
                {o.offered_by === orgsQ.data?.orgs.find((x) => x.id === orgId)?.owner_id ? null : null}
                {canManage && (
                  <Button
                    size="sm"
                    onClick={() => setClaimingOffer(o)}
                  >
                    <Check className="mr-1 h-3 w-3" /> Annehmen
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => cancelM.mutate(o.id)}
                  disabled={cancelM.isPending}
                  title="Eigene Angebote zurückziehen"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="releases" className="mt-4">
        {releases.length === 0 ? (
          <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
            Keine offenen Freigaben.
          </div>
        ) : (
          <div className="space-y-1">
            {releases.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border border-emerald-500/30 bg-emerald-500/5 px-3 py-2"
              >
                <Share2 className="h-4 w-4 text-emerald-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    <ItemLink item_ref={r.item_ref} name={r.item_name} />
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    freigegeben von {r.released_by_callsign ?? "—"} ·{" "}
                    {new Date(r.released_at).toLocaleString("de-DE")}
                    {r.notes && <> · „{r.notes}"</>}
                  </div>
                </div>
                <span className="font-mono text-sm">
                  {formatQty(r.qty_remaining, r.unit as Unit)} / {formatQty(r.qty_initial, r.unit as Unit)}
                </span>
                <Button
                  size="sm"
                  onClick={() => setRequesting(r)}
                  disabled={r.qty_remaining <= 0}
                >
                  <HandCoins className="mr-1 h-3 w-3" /> Beanspruchen
                </Button>
                {canManage && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelRelM.mutate(r.id)}
                    title="Freigabe zurücknehmen"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="requests" className="mt-4">
        {requests.length === 0 ? (
          <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
            Keine offenen Anfragen.
          </div>
        ) : (
          <div className="space-y-1">
            {requests.map((r) => (
              <div
                key={r.id}
                className="flex items-center gap-3 border border-sky-500/30 bg-sky-500/5 px-3 py-2"
              >
                <HandCoins className="h-4 w-4 text-sky-400" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.item_name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    angefragt von {r.requested_by_callsign ?? "—"} ·{" "}
                    {new Date(r.created_at).toLocaleString("de-DE")}
                    {r.notes && <> · „{r.notes}"</>}
                  </div>
                </div>
                <span className="font-mono text-sm">
                  {formatQty(r.qty, r.unit as Unit)}
                </span>
                {canManage ? (
                  <>
                    <Button
                      size="sm"
                      onClick={() => decideM.mutate({ id: r.id, approve: true })}
                      disabled={decideM.isPending}
                    >
                      <Check className="mr-1 h-3 w-3" /> Genehmigen
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => decideM.mutate({ id: r.id, approve: false })}
                      disabled={decideM.isPending}
                      title="Ablehnen"
                    >
                      <X className="h-3 w-3" />
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => cancelReqM.mutate(r.id)}
                    disabled={cancelReqM.isPending}
                    title="Eigene Anfrage zurückziehen"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </TabsContent>
    </Tabs>
      {issuing && (
        <IssueDialog
          item={issuing}
          orgId={orgId}
          onClose={() => setIssuing(null)}
        />
      )}
      {releasing && (
        <ReleaseDialog
          item={releasing}
          onClose={() => setReleasing(null)}
        />
      )}
      {requesting && (
        <RequestDialog
          release={requesting}
          onClose={() => setRequesting(null)}
        />
      )}
      {requestingStock && (
        <RequestStockDialog
          item={requestingStock}
          onClose={() => setRequestingStock(null)}
        />
      )}
      {locking && (
        <LockDialog
          item={locking}
          onConfirm={(reason) => {
            lockM.mutate({
              warehouse_id: locking.id,
              locked: true,
              reason: reason || undefined,
            });
            setLocking(null);
          }}
          onClose={() => setLocking(null)}
        />
      )}
      {adding && (
        <AddItemDialog
          orgId={orgId}
          categories={allCategories}
          onClose={() => setAdding(false)}
        />
      )}
      {editingCat && (
        <EditCategoryDialog
          item={editingCat}
          categories={allCategories}
          onClose={() => setEditingCat(null)}
        />
      )}
      {editingHolder && (
        <HolderDialog
          item={editingHolder}
          orgId={orgId}
          onClose={() => setEditingHolder(null)}
        />
      )}
      {editingLoc && (
        <LocationDialog
          item={editingLoc}
          onClose={() => setEditingLoc(null)}
        />
      )}
      {claimingOffer && orgId && (
        <ClaimOfferDialog
          offer={claimingOffer}
          orgId={orgId}
          onClose={() => setClaimingOffer(null)}
        />
      )}
    </>
  );
}

function IssueDialog({
  item,
  orgId,
  onClose,
}: {
  item: WarehouseItem;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const membersFn = useServerFn(listOrgMembers);
  const issueFn = useServerFn(issueWarehouseToMember);
  const membersQ = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => membersFn({ data: { org_id: orgId } }),
  });
  const [recipient, setRecipient] = useState("");
  const [qty, setQty] = useState<number>(item.qty);
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: () =>
      issueFn({
        data: {
          warehouse_id: item.id,
          recipient_user_id: recipient,
          qty,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Ausgegeben – Item ist im Inventar des Empfängers.");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const members = membersQ.data?.members ?? [];

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>An Mitglied ausgeben</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {item.item_name} · Lager: {formatQty(item.qty, item.unit as Unit)}
          </div>
          <div className="grid gap-1">
            <Label>Empfänger</Label>
            <Select value={recipient} onValueChange={setRecipient}>
              <SelectTrigger>
                <SelectValue placeholder="Mitglied wählen" />
              </SelectTrigger>
              <SelectContent>
                {members.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.callsign ?? m.display_name ?? m.user_id} · {m.role}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Menge ({item.unit === "scu" ? "SCU" : "Stk."})</Label>
            <Input
              type="number"
              min={0}
              max={item.qty}
              step={item.unit === "scu" ? "0.01" : "1"}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1">
            <Label>Notiz (optional)</Label>
            <Textarea
              value={notes}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!recipient || qty <= 0 || qty > item.qty || m.isPending}
          >
            Ausgeben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationDialog({
  item,
  onClose,
}: {
  item: WarehouseItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const locFn = useServerFn(listMyLocations);
  const setFn = useServerFn(setWarehouseItemLocation);
  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
  });
  const [loc, setLoc] = useState<PickedLocation>({
    id: item.location_id,
    label: item.location_label,
  });
  const saveM = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          warehouse_id: item.id,
          location_id: loc.id,
          location_label: loc.label,
        },
      }),
    onSuccess: () => {
      toast.success("Lagerort aktualisiert");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lagerort — {item.item_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Wähle einen Preset-Standort (Städte, Stationen) oder lege unter
            „Sonstiges" einen eigenen Ort per Freitext an. Änderungen setzen
            das „seit"-Datum zurück.
          </p>
          <Label>Aktueller Lagerort</Label>
          <LocationPicker
            value={loc}
            locations={locsQ.data ?? []}
            visibility="org"
            onChange={setLoc}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function ReleaseDialog({
  item,
  onClose,
}: {
  item: WarehouseItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(releaseWarehouseStock);
  const [qty, setQty] = useState<number>(item.qty);
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          warehouse_id: item.id,
          qty,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Freigegeben – Mitglieder können beanspruchen.");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      qc.invalidateQueries({ queryKey: ["org-releases"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Für Mitglieder freigeben</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {item.item_name} · Lager: {formatQty(item.qty, item.unit as Unit)}
          </div>
          <div className="grid gap-1">
            <Label>Menge ({item.unit === "scu" ? "SCU" : "Stk."})</Label>
            <Input
              type="number"
              min={0}
              max={item.qty}
              step={item.unit === "scu" ? "0.01" : "1"}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1">
            <Label>Notiz (optional)</Label>
            <Textarea
              value={notes}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={qty <= 0 || qty > item.qty || m.isPending}
          >
            Freigeben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestDialog({
  release,
  onClose,
}: {
  release: ReleaseRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(requestRelease);
  const [qty, setQty] = useState<number>(release.qty_remaining);
  const [notes, setNotes] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          release_id: release.id,
          qty,
          notes: notes || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Anfrage gesendet – wartet auf Freigabe.");
      qc.invalidateQueries({ queryKey: ["org-release-requests"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Beanspruchen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {release.item_name} · verfügbar: {formatQty(release.qty_remaining, release.unit as Unit)}
          </div>
          <div className="grid gap-1">
            <Label>Menge ({release.unit === "scu" ? "SCU" : "Stk."})</Label>
            <Input
              type="number"
              min={0}
              max={release.qty_remaining}
              step={release.unit === "scu" ? "0.01" : "1"}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1">
            <Label>Begründung (optional)</Label>
            <Textarea
              value={notes}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={qty <= 0 || qty > release.qty_remaining || m.isPending}
          >
            Anfrage senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestStockDialog({
  item,
  onClose,
}: {
  item: WarehouseItem;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const reqFn = useServerFn(requestWarehouseItem);
  const free = Math.max(0, item.qty - item.pending_qty - item.reserved_qty);
  const [qty, setQty] = useState<number>(free);
  const [notes, setNotes] = useState("");

  const m = useMutation({
    mutationFn: () =>
      reqFn({
        data: { warehouse_id: item.id, qty, notes: notes || undefined },
      }),
    onSuccess: () => {
      toast.success("Anfrage gesendet");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      qc.invalidateQueries({ queryKey: ["org-release-requests"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Aus dem Lager anfragen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {item.item_name} · Verfügbar: {formatQty(free, item.unit as Unit)}
            {item.pending_qty > 0 && (
              <> · ({formatQty(item.pending_qty, item.unit as Unit)} bereits angefragt)</>
            )}
            {item.reserved_qty > 0 && (
              <> · ({formatQty(item.reserved_qty, item.unit as Unit)} für Bestellungen reserviert)</>
            )}
          </div>
          <div className="grid gap-1">
            <Label>Menge ({item.unit === "scu" ? "SCU" : "Stk."})</Label>
            <Input
              type="number"
              min={0}
              max={free}
              step={item.unit === "scu" ? "0.01" : "1"}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="grid gap-1">
            <Label>Notiz (optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Wofür?"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || qty <= 0 || qty > free}
          >
            Anfragen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LockDialog({
  item,
  onConfirm,
  onClose,
}: {
  item: WarehouseItem;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Item sperren</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {item.item_name}
          </div>
          <p className="text-xs text-muted-foreground">
            Gesperrte Items können von Mitgliedern nicht angefragt werden.
          </p>
          <div className="grid gap-1">
            <Label>Grund (optional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder="z. B. reserviert für Operation XY"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => onConfirm(reason)}>
            <Lock className="mr-1 h-3 w-3" /> Sperren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CatalogHit = {
  item_ref: string | null;
  name: string;
  kind: string | null;
  image_url: string | null;
  unit?: string | null;
};

function CatalogPicker({
  onPick,
}: {
  onPick: (hit: CatalogHit) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const searchFn = useServerFn(searchItemCatalog);
  const hitsQ = useQuery({
    queryKey: ["org-warehouse-catalog", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
  const hits = (hitsQ.data?.items ?? []) as CatalogHit[];
  return (
    <Popover open={open && hits.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={q}
          placeholder="Suche im Katalog (z. B. Iron, Tactical Suit…)"
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[min(28rem,90vw)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement;
          if (t?.tagName === "INPUT") e.preventDefault();
        }}
      >
        <ul className="max-h-72 overflow-auto">
          {hits.map((h) => (
            <li key={`${h.item_ref ?? h.name}`}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onPick(h);
                  setQ(h.name);
                  setOpen(false);
                }}
              >
                {h.image_url ? (
                  <img
                    src={h.image_url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded border border-brand/10" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{h.name}</div>
                  {h.kind && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                      {h.kind}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function CategorySelect({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (v: string) => void;
  categories: string[];
}) {
  const [mode, setMode] = useState<"pick" | "new">(
    value && !categories.includes(value) ? "new" : "pick",
  );
  return (
    <div className="flex gap-2">
      <Select
        value={mode === "new" ? "__new" : value || "__none"}
        onValueChange={(v) => {
          if (v === "__new") {
            setMode("new");
            onChange("");
          } else if (v === "__none") {
            setMode("pick");
            onChange("");
          } else {
            setMode("pick");
            onChange(v);
          }
        }}
      >
        <SelectTrigger className="w-48">
          <SelectValue placeholder="Kategorie wählen" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">Ohne Kategorie</SelectItem>
          {categories.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
          <SelectItem value="__new">+ Neue Kategorie…</SelectItem>
        </SelectContent>
      </Select>
      {mode === "new" && (
        <Input
          value={value}
          placeholder="Neue Kategorie"
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function AddItemDialog({
  orgId,
  categories,
  onClose,
}: {
  orgId: string;
  categories: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const addFn = useServerFn(addWarehouseItem);
  const bulkFn = useServerFn(addWarehouseItemsBulk);
  const locFn = useServerFn(listMyLocations);
  const membersFn = useServerFn(listOrgMembers);
  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
  });
  const membersQ = useQuery({
    queryKey: ["org-members-holders", orgId],
    queryFn: () => membersFn({ data: { org_id: orgId } }),
  });
  const eligibleHolders = useMemo(() => {
    const list = membersQ.data?.members ?? [];
    return list.filter(
      (m) =>
        m.role === "owner" ||
        m.role === "officer" ||
        hasPerm(m.role, m.permissions, "warehouse.hold"),
    );
  }, [membersQ.data]);

  const [bulk, setBulk] = useState(false);
  const [holder, setHolder] = useState<string>("__none");
  const [loc, setLoc] = useState<PickedLocation>({ id: null, label: null });

  // Single-item state
  const [picked, setPicked] = useState<CatalogHit | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("");
  const [itemRef, setItemRef] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(1);
  const [unit, setUnit] = useState<"pcs" | "scu">("pcs");
  const [quality, setQuality] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [notes, setNotes] = useState("");

  // Bulk state
  type BulkRow = {
    key: string;
    picked: CatalogHit | null;
    name: string;
    kind: string;
    itemRef: string | null;
    qty: number;
    unit: "pcs" | "scu";
    quality: string;
    category: string;
    notes: string;
  };
  const makeRow = (): BulkRow => ({
    key: Math.random().toString(36).slice(2),
    picked: null,
    name: "",
    kind: "",
    itemRef: null,
    qty: 1,
    unit: "pcs",
    quality: "",
    category: "",
    notes: "",
  });
  const [rows, setRows] = useState<BulkRow[]>(() => [makeRow()]);
  const patchRow = (key: string, patch: Partial<BulkRow>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const m = useMutation({
    mutationFn: () =>
      addFn({
        data: {
          org_id: orgId,
          item_ref: itemRef,
          item_name: name.trim(),
          item_kind: kind.trim() || null,
          qty,
          unit,
          quality: quality.trim() ? Number(quality) : null,
          notes: notes.trim() || null,
          category: category.trim() || null,
          location_id: loc.id,
          location_label: loc.label,
          held_by: holder === "__none" ? null : holder,
        },
      }),
    onSuccess: () => {
      toast.success("Item eingelagert");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const bulkM = useMutation({
    mutationFn: () =>
      bulkFn({
        data: {
          org_id: orgId,
          held_by: holder === "__none" ? null : holder,
          location_id: loc.id,
          location_label: loc.label,
          items: rows
            .filter((r) => r.name.trim() && r.qty > 0)
            .map((r) => ({
              item_ref: r.itemRef,
              item_name: r.name.trim(),
              item_kind: r.kind.trim() || null,
              qty: r.qty,
              unit: r.unit,
              quality: r.quality.trim() ? Number(r.quality) : null,
              notes: r.notes.trim() || null,
              category: r.category.trim() || null,
            })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.count} Items eingelagert`);
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const validBulkCount = rows.filter((r) => r.name.trim() && r.qty > 0).length;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={bulk ? "max-w-3xl" : "max-w-lg"}>
        <DialogHeader>
          <DialogTitle>Item ins Orgalager legen</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[70vh] gap-3 overflow-y-auto pr-1">
          <label className="flex cursor-pointer items-center gap-2 rounded border border-brand/10 bg-brand/5 px-3 py-2">
            <Checkbox
              checked={bulk}
              onCheckedChange={(v) => setBulk(v === true)}
            />
            <span className="text-sm">Mehrere Items hinzufügen</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              // gemeinsamer Halter &amp; Ort
            </span>
          </label>

          <div className="grid gap-3 rounded border border-brand/10 p-3 sm:grid-cols-2">
            <div className="grid gap-1">
              <Label>Halter (optional)</Label>
              <Select value={holder} onValueChange={setHolder}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">— kein Halter —</SelectItem>
                  {eligibleHolders.map((mm) => (
                    <SelectItem key={mm.user_id} value={mm.user_id}>
                      {mm.callsign ??
                        mm.display_name ??
                        mm.user_id.slice(0, 8)}
                      {mm.role !== "member" ? ` · ${mm.role}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Lagerort (optional)</Label>
              <LocationPicker
                value={loc}
                locations={locsQ.data ?? []}
                visibility="org"
                onChange={setLoc}
              />
            </div>
          </div>

          {!bulk ? (
            <SingleItemFields
              picked={picked}
              setPicked={setPicked}
              name={name}
              setName={setName}
              kind={kind}
              setKind={setKind}
              itemRef={itemRef}
              setItemRef={setItemRef}
              qty={qty}
              setQty={setQty}
              unit={unit}
              setUnit={setUnit}
              quality={quality}
              setQuality={setQuality}
              category={category}
              setCategory={setCategory}
              categories={categories}
              notes={notes}
              setNotes={setNotes}
            />
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  // items ({validBulkCount} gültig)
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setRows((rs) => [...rs, makeRow()])}
                >
                  <Plus className="mr-1 h-3 w-3" /> Zeile hinzufügen
                </Button>
              </div>
              <div className="space-y-2">
                {rows.map((r, i) => (
                  <div
                    key={r.key}
                    className="space-y-2 rounded border border-brand/10 p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                        // #{i + 1}
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={rows.length === 1}
                        onClick={() =>
                          setRows((rs) => rs.filter((x) => x.key !== r.key))
                        }
                        title="Zeile entfernen"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                    <SingleItemFields
                      compact
                      picked={r.picked}
                      setPicked={(v) => patchRow(r.key, { picked: v })}
                      name={r.name}
                      setName={(v) => patchRow(r.key, { name: v })}
                      kind={r.kind}
                      setKind={(v) => patchRow(r.key, { kind: v })}
                      itemRef={r.itemRef}
                      setItemRef={(v) => patchRow(r.key, { itemRef: v })}
                      qty={r.qty}
                      setQty={(v) => patchRow(r.key, { qty: v })}
                      unit={r.unit}
                      setUnit={(v) => patchRow(r.key, { unit: v })}
                      quality={r.quality}
                      setQuality={(v) => patchRow(r.key, { quality: v })}
                      category={r.category}
                      setCategory={(v) => patchRow(r.key, { category: v })}
                      categories={categories}
                      notes={r.notes}
                      setNotes={(v) => patchRow(r.key, { notes: v })}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          {!bulk ? (
            <Button
              onClick={() => m.mutate()}
              disabled={m.isPending || !name.trim() || qty <= 0}
            >
              Einlagern
            </Button>
          ) : (
            <Button
              onClick={() => bulkM.mutate()}
              disabled={bulkM.isPending || validBulkCount === 0}
            >
              {validBulkCount} Items einlagern
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SingleItemFields(props: {
  compact?: boolean;
  picked: CatalogHit | null;
  setPicked: (v: CatalogHit | null) => void;
  name: string;
  setName: (v: string) => void;
  kind: string;
  setKind: (v: string) => void;
  itemRef: string | null;
  setItemRef: (v: string | null) => void;
  qty: number;
  setQty: (v: number) => void;
  unit: "pcs" | "scu";
  setUnit: (v: "pcs" | "scu") => void;
  quality: string;
  setQuality: (v: string) => void;
  category: string;
  setCategory: (v: string) => void;
  categories: string[];
  notes: string;
  setNotes: (v: string) => void;
}) {
  const {
    picked,
    setPicked,
    name,
    setName,
    kind,
    setKind,
    setItemRef,
    qty,
    setQty,
    unit,
    setUnit,
    quality,
    setQuality,
    category,
    setCategory,
    categories,
    notes,
    setNotes,
  } = props;
  // Merken, ob der Nutzer die Kategorie explizit gesetzt hat. Nur dann wird
  // der automatische Vorschlag nicht mehr überschrieben.
  const [autoTouched, setAutoTouched] = useState(!!category);
  const autoSuggest = (
    input: { name?: string | null; kind?: string | null; source?: string | null },
  ) => {
    if (autoTouched) return;
    const s = resolveSuggestedCategory(input, categories);
    if (s) {
      setCategory(s);
      // Zeile hat jetzt eine (vorgeschlagene) Kategorie – nicht mehr
      // automatisch überschreiben, wenn der Nutzer weiter tippt.
      setAutoTouched(true);
    }
  };
  return (
    <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Aus Katalog wählen (optional)</Label>
            <CatalogPicker
              onPick={(h) => {
                setPicked(h);
                setName(h.name);
                setKind(h.kind ?? "");
                setItemRef(h.item_ref);
                if (h.unit === "scu" || h.unit === "pcs")
                  setUnit(h.unit as "pcs" | "scu");
                autoSuggest({
                  name: h.name,
                  kind: h.kind,
                  source: (h as unknown as { source?: string }).source,
                });
              }}
            />
          </div>
          <div className="grid gap-1">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                if (picked && e.target.value !== picked.name) {
                  setPicked(null);
                  setItemRef(null);
                }
                autoSuggest({ name: e.target.value, kind });
              }}
              placeholder="z. B. Iron"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Menge</Label>
              <Input
                type="number"
                min={0}
                step={unit === "scu" ? "0.01" : "1"}
                value={qty}
                onChange={(e) => setQty(Number(e.target.value))}
              />
            </div>
            <div className="grid gap-1">
              <Label>Einheit</Label>
              <Select value={unit} onValueChange={(v) => setUnit(v as "pcs" | "scu")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Stk.</SelectItem>
                  <SelectItem value="scu">SCU</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Typ (optional)</Label>
              <Input
                value={kind}
                onChange={(e) => {
                  setKind(e.target.value);
                  autoSuggest({ name, kind: e.target.value });
                }}
                placeholder="z. B. Metal, Armor…"
              />
            </div>
            <div className="grid gap-1">
              <Label>Qualität (optional)</Label>
              <Input
                type="number"
                value={quality}
                onChange={(e) => setQuality(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label className="flex items-center gap-2">
              Kategorie
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                // auto erkannt
              </span>
            </Label>
            <CategorySelect
              value={category}
              onChange={(v) => {
                setCategory(v);
                setAutoTouched(true);
              }}
              categories={categories}
            />
            {!autoTouched && category && (
              <p className="font-mono text-[9px] text-muted-foreground">
                // Vorschlag: {category} · änderbar
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label>Notiz (optional)</Label>
            <Textarea
              value={notes}
              rows={2}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
    </div>
  );
}

function EditCategoryDialog({
  item,
  categories,
  onClose,
}: {
  item: WarehouseItem;
  categories: string[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fn = useServerFn(setWarehouseItemCategory);
  const [category, setCategory] = useState<string>(item.category ?? "");
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          warehouse_id: item.id,
          category: category.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Kategorie aktualisiert");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Kategorie zuweisen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {item.item_name}
          </div>
          <div className="grid gap-1">
            <Label>Kategorie</Label>
            <CategorySelect
              value={category}
              onChange={setCategory}
              categories={categories}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HolderDialog({
  item,
  orgId,
  onClose,
}: {
  item: WarehouseItem;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const membersFn = useServerFn(listOrgMembers);
  const setFn = useServerFn(setWarehouseItemHolder);
  const membersQ = useQuery({
    queryKey: ["org-members-holders", orgId],
    queryFn: () => membersFn({ data: { org_id: orgId } }),
  });
  const eligible = useMemo(() => {
    const list = membersQ.data?.members ?? [];
    return list.filter(
      (m) =>
        m.role === "owner" ||
        m.role === "officer" ||
        hasPerm(m.role, m.permissions, "warehouse.hold"),
    );
  }, [membersQ.data]);
  const [selected, setSelected] = useState<string>(item.held_by ?? "__none");
  const saveM = useMutation({
    mutationFn: (uid: string | null) =>
      setFn({ data: { warehouse_id: item.id, holder_user_id: uid } }),
    onSuccess: () => {
      toast.success("Halter aktualisiert");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      qc.invalidateQueries({ queryKey: ["my-held-org-warehouse"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Halter setzen — {item.item_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Wähle das Mitglied aus, das diesen Bestand aktuell physisch hat.
            Es werden nur Mitglieder mit der Berechtigung „Orgabestand halten"
            (Owner / Officer / Quartermaster automatisch) angezeigt.
          </p>
          <Label>Aktueller Halter</Label>
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">— kein Halter —</SelectItem>
              {eligible.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.callsign ?? m.display_name ?? m.user_id.slice(0, 8)}
                  {m.role !== "member" ? ` · ${m.role}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {eligible.length === 0 && (
            <p className="text-[11px] text-amber-400">
              Kein Mitglied besitzt aktuell die Berechtigung „Orgabestand
              halten". Vergib sie unter Orga → Rollen.
            </p>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            onClick={() =>
              saveM.mutate(selected === "__none" ? null : selected)
            }
            disabled={saveM.isPending}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClaimOfferDialog({
  offer,
  orgId,
  onClose,
}: {
  offer: OfferRow;
  orgId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const membersFn = useServerFn(listOrgMembers);
  const locFn = useServerFn(listMyLocations);
  const claimFn = useServerFn(claimOffer);
  const membersQ = useQuery({
    queryKey: ["org-members-holders", orgId],
    queryFn: () => membersFn({ data: { org_id: orgId } }),
  });
  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
  });
  const eligible = useMemo(() => {
    const list = membersQ.data?.members ?? [];
    return list.filter(
      (m) =>
        m.role === "owner" ||
        m.role === "officer" ||
        hasPerm(m.role, m.permissions, "warehouse.hold"),
    );
  }, [membersQ.data]);
  const [holder, setHolder] = useState<string>(offer.offered_by);
  const [loc, setLoc] = useState<PickedLocation>({ id: null, label: null });
  const acceptM = useMutation({
    mutationFn: () =>
      claimFn({
        data: {
          claim_id: offer.id,
          held_by: holder === "__none" ? null : holder,
          location_id: loc.id,
          location_label: loc.label,
        },
      }),
    onSuccess: () => {
      toast.success("Angebot angenommen");
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      qc.invalidateQueries({ queryKey: ["org-offers"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["my-held-org-warehouse"] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Spende annehmen — {offer.item_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {formatQty(offer.qty, offer.unit as Unit)} von{" "}
            <strong>{offer.offered_by_callsign ?? "—"}</strong>. Da der
            Gegenstand physisch übergeben wird, wähle jetzt den neuen Halter
            und den Lagerort.
          </p>

          <div className="space-y-2">
            <Label>Neuer Halter</Label>
            <Select value={holder} onValueChange={setHolder}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">— kein Halter —</SelectItem>
                {eligible.map((m) => (
                  <SelectItem key={m.user_id} value={m.user_id}>
                    {m.callsign ?? m.display_name ?? m.user_id.slice(0, 8)}
                    {m.role !== "member" ? ` · ${m.role}` : ""}
                    {m.user_id === offer.offered_by ? " · Spender" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">
              Nur Mitglieder mit der Berechtigung „Orgabestand halten" (Owner
              / Officer / Quartermaster automatisch) sind auswählbar.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Neuer Lagerort</Label>
            <LocationPicker
              value={loc}
              locations={locsQ.data ?? []}
              visibility="org"
              onChange={setLoc}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button onClick={() => acceptM.mutate()} disabled={acceptM.isPending}>
            <Check className="mr-1 h-3 w-3" /> Annehmen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
