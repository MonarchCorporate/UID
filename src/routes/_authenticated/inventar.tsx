import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  listInventory,
  listMyLocations,
  upsertInventoryStack,
  deleteInventoryStack,
  setReservation,
  upsertLocation,
  deleteLocation,
  importInventoryJson,
  searchItemCatalog,
  listItemCatalogKinds,
  type InventoryItem,
  type InventoryLocation,
} from "@/lib/inventory.functions";
import { listMyOrgs } from "@/lib/orgs.functions";
import { offerInventoryItem, depositInventoryDirect, listMyHeldOrgWarehouse } from "@/lib/org-warehouse.functions";
import { hasPerm } from "@/lib/org-perms";
import { formatQty, type Unit } from "@/lib/units";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
  PopoverAnchor,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  Plus,
  Trash2,
  Pencil,
  Download,
  Upload,
  Package,
  Lock,
  Users,
  MapPin,
  RefreshCw,
  Send,
  FileText,
} from "lucide-react";
import { PageShell, StickyToolbar, StatGrid, StatCard } from "@/components/layout/PageShell";
import { ItemLink } from "@/components/catalog/ItemLink";
import { autoCategorize } from "@/lib/warehouse-categories";
import { LocationPicker } from "@/components/inventory/LocationPicker";
import { BlueprintCollection } from "@/components/inventory/BlueprintCollection";
import {
  TransfersPanel,
  SendItemDialog,
} from "@/components/inventory/TransferPanel";

export const Route = createFileRoute("/_authenticated/inventar")({
  component: InventoryPage,
});

function InventoryPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listInventory);
  const locFn = useServerFn(listMyLocations);
  const upsertFn = useServerFn(upsertInventoryStack);
  const deleteFn = useServerFn(deleteInventoryStack);
  const reserveFn = useServerFn(setReservation);
  const importFn = useServerFn(importInventoryJson);

  const [scope, setScope] = useState<"all" | "mine" | "org">("all");
  const [source, setSource] = useState<"private" | "org" | "blueprints">(
    "private",
  );
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [locOpen, setLocOpen] = useState(false);

  const itemsQ = useQuery({
    queryKey: ["inventory", scope, search],
    queryFn: () => listFn({ data: { scope, search: search || undefined } }),
    enabled: source === "private",
  });
  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
  });

  const heldFn = useServerFn(listMyHeldOrgWarehouse);
  const heldQ = useQuery({
    queryKey: ["my-held-org-warehouse"],
    queryFn: () => heldFn(),
    enabled: source === "org",
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["inventory"] });
    qc.invalidateQueries({ queryKey: ["inventory-locations"] });
  };

  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gelöscht");
      invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const reserveM = useMutation({
    mutationFn: (p: { id: string; qty_reserved: number }) => reserveFn({ data: p }),
    onSuccess: () => invalidate(),
    onError: (e) => toast.error(e.message),
  });

  const importM = useMutation({
    mutationFn: (p: { text: string; replace: boolean }) => {
      const parsed = JSON.parse(p.text);
      const arr = Array.isArray(parsed) ? parsed : parsed.stacks ?? [];
      return importFn({ data: { stacks: arr, replace: p.replace } });
    },
    onSuccess: (r) => {
      toast.success(`Import: ${r.inserted} Stacks angelegt`);
      invalidate();
    },
    onError: (e) =>
      toast.error("Import fehlgeschlagen: " + (e as Error).message),
  });

  const items = itemsQ.data?.items ?? [];
  const locations = locsQ.data ?? [];

  const categorized = useMemo(
    () =>
      items.map((i) => ({
        item: i,
        category:
          (i.item_ref && i.item_ref.startsWith("commodity:")
            ? "Handelswaren"
            : autoCategorize(i.item_kind, i.item_name)) ?? "Sonstiges",
      })),
    [items],
  );

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const { category: c } of categorized) m.set(c, (m.get(c) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [categorized]);

  const filtered = useMemo(
    () =>
      category === "all"
        ? categorized
        : categorized.filter((c) => c.category === category),
    [categorized, category],
  );

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      if (!m.has(entry.category)) m.set(entry.category, [] as typeof filtered);
      m.get(entry.category)!.push(entry);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totals = useMemo(
    () => ({
      stacks: items.length,
      qty: items.reduce((s, i) => s + i.qty, 0),
      reserved: items.reduce((s, i) => s + i.qty_reserved, 0),
      mine: items.filter((i) => i.is_owner).length,
      org: items.filter((i) => i.visibility === "org").length,
      offered: items.filter((i) => i.offered_qty > 0).length,
    }),
    [items],
  );

  const onExport = () => {
    const payload = items
      .filter((i) => i.is_owner)
      .map((i) => ({
        item_ref: i.item_ref,
        item_name: i.item_name,
        item_kind: i.item_kind,
        qty: i.qty,
        qty_reserved: i.qty_reserved,
        quality: i.quality,
        location_id: i.location_id,
        visibility: i.visibility,
        notes: i.notes,
      }));
    const blob = new Blob([JSON.stringify({ stacks: payload }, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mrc-inventar-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImportClick = async () => {
    const text = window.prompt(
      "JSON einfügen (Format: { stacks: [...] } oder Array). Vorhandenes überschreiben? Halte Shift beim OK.",
    );
    if (!text) return;
    importM.mutate({ text, replace: false });
  };

  return (
    <PageShell
      eyebrow="Produktion"
      title="Inventar"
      description="Persönliches und mit der Orga geteiltes Material – inkl. Reservierungen und offener Angebote."
      actions={
        <>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="mr-2 h-4 w-4" /> Export
          </Button>
          <Button variant="outline" size="sm" onClick={onImportClick}>
            <Upload className="mr-2 h-4 w-4" /> Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => setLocOpen(true)}>
            <MapPin className="mr-2 h-4 w-4" /> Lager
          </Button>
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setNewOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Item hinzufügen
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/blueprints">Blueprints →</Link>
          </Button>
        </>
      }
    >
      <div className="flex flex-wrap gap-1">
        {(["private", "org", "blueprints"] as const).map((k) => (
          <Button
            key={k}
            size="sm"
            variant={source === k ? "default" : "outline"}
            onClick={() => setSource(k)}
          >
            {k === "private" ? (
              <>
                <Lock className="mr-1 h-3 w-3" /> Privater Bestand
              </>
            ) : k === "org" ? (
              <>
                <Users className="mr-1 h-3 w-3" /> Orgabestand ({heldQ.data?.items.length ?? 0})
              </>
            ) : (
              <>
                <FileText className="mr-1 h-3 w-3" /> Blueprints
              </>
            )}
          </Button>
        ))}
      </div>
      {source === "blueprints" ? (
        <BlueprintCollection />
      ) : source === "org" ? (
        <HeldOrgWarehouseView
          items={heldQ.data?.items ?? []}
          isLoading={heldQ.isLoading}
        />
      ) : (
      <>
      <TransfersPanel />
      <StatGrid cols={4}>
        <StatCard
          label="Stacks gesamt"
          value={totals.stacks}
          hint={`${totals.qty.toLocaleString("de-DE")} Einheiten`}
          icon={Package}
          tone="brand"
        />
        <StatCard label="Eigene" value={totals.mine} icon={Lock} />
        <StatCard
          label="Org-geteilt"
          value={totals.org}
          icon={Users}
          tone="emerald"
        />
        <StatCard
          label="Angeboten"
          value={totals.offered}
          hint={`${totals.reserved.toLocaleString("de-DE")} reserviert`}
          icon={Send}
          tone="amber"
        />
      </StatGrid>

      <StickyToolbar>
        <div className="flex flex-wrap gap-1">
          {(["all", "mine", "org"] as const).map((k) => (
            <Button
              key={k}
              size="sm"
              variant={scope === k ? "default" : "outline"}
              onClick={() => setScope(k)}
            >
              {k === "all" ? "Alle" : k === "mine" ? "Privat" : "Orga"}
            </Button>
          ))}
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Alle Kategorien ({categorized.length})
            </SelectItem>
            {categoryCounts.map(([c, n]) => (
              <SelectItem key={c} value={c}>
                {c} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Suche…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </StickyToolbar>

      {filtered.length === 0 ? (
        itemsQ.isLoading ? (
          <LoadingScreen
            label="Lade Inventar"
            hint="// rufe lager-bestände ab"
            cards={8}
          />
        ) : (
          <div className="border border-dashed border-brand/15 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            // kein eintrag
          </div>
        )
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, entries]) => (
            <section key={cat} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-brand/80">
                  {cat}
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {entries.length} Stack{entries.length === 1 ? "" : "s"}
                </span>
                <div className="h-px flex-1 bg-brand/10" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {entries.map(({ item: i }) => (
                  <StackCard
                    key={i.id}
                    item={i}
                    onEdit={() => {
                      setEditing(i);
                      setNewOpen(true);
                    }}
                    onDelete={() => delM.mutate(i.id)}
                    onReserve={(qty) =>
                      reserveM.mutate({ id: i.id, qty_reserved: qty })
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <StackDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        item={editing}
        locations={locations}
        onSave={async (payload) => {
          try {
            await upsertFn({ data: payload });
            toast.success(editing ? "Aktualisiert" : "Angelegt");
            setNewOpen(false);
            invalidate();
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <LocationsDialog open={locOpen} onOpenChange={setLocOpen} />
      </>
      )}
    </PageShell>
  );
}

function StackCard({
  item,
  onEdit,
  onDelete,
  onReserve,
}: {
  item: InventoryItem;
  onEdit: () => void;
  onDelete: () => void;
  onReserve: (qty: number) => void;
}) {
  const [resOpen, setResOpen] = useState(false);
  const [res, setRes] = useState<number>(item.qty_reserved);
  const [offerOpen, setOfferOpen] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2 border border-brand/10 bg-background/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-base">
            <ItemLink item_ref={item.item_ref} name={item.item_name} />
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            {item.item_kind ?? "—"}
            {item.location_name ? ` · ${item.location_name}` : ""}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          {item.visibility === "org" ? (
            <>
              <Users className="mr-1 h-3 w-3" /> orga
            </>
          ) : (
            <>
              <Lock className="mr-1 h-3 w-3" /> privat
            </>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-px bg-brand/10">
        <div className="bg-background p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
            Verfügbar
          </div>
          <div className="font-display text-lg">{formatQty(item.qty_available, item.unit)}</div>
        </div>
        <div className="bg-background p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
            Reserv.
          </div>
          <div className="font-display text-lg">{formatQty(item.qty_reserved, item.unit)}</div>
        </div>
        <div className="bg-background p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
            Qualität
          </div>
          <div className="font-display text-lg">{item.quality ?? "—"}</div>
        </div>
      </div>

      {item.offered_qty > 0 && (
        <div className="flex items-center gap-2 border border-amber-500/40 bg-amber-500/10 px-2 py-1 text-[10px]">
          <Send className="h-3 w-3 text-amber-400" />
          <span className="font-mono uppercase tracking-[0.2em] text-amber-300">
            an Orga {item.offered_to_org_name ?? ""} ·{" "}
            {formatQty(item.offered_qty, item.unit)} · wartet auf Annahme
          </span>
        </div>
      )}

      {item.is_owner && (
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-2"
            onClick={onEdit}
          >
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-2"
            onClick={() => setResOpen(!resOpen)}
          >
            <Package className="mr-1 h-3 w-3" /> Reserv.
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-2"
            onClick={() => setOfferOpen(true)}
            title="An Orga übertragen"
          >
            <Send className="mr-1 h-3 w-3" /> Orga
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="flex-1 min-w-0 px-2"
            onClick={() => setSendOpen(true)}
            title="An Spieler senden"
          >
            <Send className="mr-1 h-3 w-3" /> Senden
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={onDelete}
            className="shrink-0 px-2 text-destructive"
            title="Löschen"
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      )}

      {resOpen && item.is_owner && (
        <div className="flex items-center gap-2 border-t border-brand/10 pt-2">
          <Input
            type="number"
            min={0}
            max={item.qty}
            value={res}
            onChange={(e) => setRes(Number(e.target.value))}
            className="h-8"
          />
          <Button
            size="sm"
            onClick={() => {
              onReserve(res);
              setResOpen(false);
            }}
          >
            Setzen
          </Button>
        </div>
      )}
      <OfferToOrgDialog open={offerOpen} onOpenChange={setOfferOpen} item={item} />
      {sendOpen && (
        <SendItemDialog open={sendOpen} onOpenChange={setSendOpen} item={item} />
      )}
    </div>
  );
}

type LocGroup = {
  label: string;
  order: number;
  items: Array<{ id: string; name: string; sub: string | null }>;
};

function groupLocations(locations: InventoryLocation[]): LocGroup[] {
  return groupLocationsImpl(locations);
}

const MATERIAL_KINDS = new Set([
  "Mineral",
  "Metal",
  "Non-Metal",
  "Gas",
  "Alloy",
  "Halogen",
  "Natural",
  "Organic",
  "Organics",
  "Harvestables",
  "Raw Materials",
  "Scrap",
  "Agricultural",
  "Chemical",
  "Commodity",
  "Commodities",
  "Liquid",
  "Seed",
  "Minteral",
]);

function qualityMaxForKind(_kind: string | null | undefined): number {
  return 1000;
}

function groupLocationsImpl(locations: InventoryLocation[]): LocGroup[] {
  const systemOrder: Record<string, number> = { Stanton: 0, Pyro: 1, Nyx: 2 };
  const kindOrder: Record<string, number> = {
    Planet: 0,
    Raumstation: 1,
    "Rest Stop (Lagrange)": 2,
    "Jump Gate Station": 3,
    Outpost: 4,
  };
  const groups = new Map<string, LocGroup>();
  for (const l of locations) {
    const parts = (l.notes ?? "").split("·").map((s) => s.trim());
    const system = parts[0] || "Eigene Lager";
    const kind = parts[1] || "";
    const label = kind ? `${system} · ${kind}` : system;
    const sysIdx = systemOrder[system] ?? 90;
    const kindIdx = kindOrder[kind] ?? 50;
    const order = sysIdx * 100 + kindIdx;
    if (!groups.has(label)) groups.set(label, { label, order, items: [] });
    groups.get(label)!.items.push({
      id: l.id,
      name: l.name,
      sub: l.visibility === "private" ? "privat" : null,
    });
  }
  return Array.from(groups.values())
    .map((g) => ({
      ...g,
      items: g.items.sort((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

function LocationCombobox({
  value,
  locations,
  onChange,
}: {
  value: string;
  locations: InventoryLocation[];
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const groups = groupLocations(locations);
  const selected = locations.find((l) => l.id === value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn(
            "w-full justify-between font-normal",
            !selected && "text-muted-foreground",
          )}
        >
          {selected ? selected.name : "— kein —"}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) =>
            val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Lagerort suchen…" />
          <CommandList className="max-h-72">
            <CommandEmpty>Kein Treffer.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="kein keiner none"
                onSelect={() => {
                  onChange("");
                  setOpen(false);
                }}
              >
                — kein —
              </CommandItem>
            </CommandGroup>
            {groups.map((g) => (
              <CommandGroup key={g.label} heading={g.label}>
                {g.items.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`${l.name} ${g.label}`}
                    onSelect={() => {
                      onChange(l.id);
                      setOpen(false);
                    }}
                  >
                    <span>{l.name}</span>
                    {l.sub ? (
                      <span className="ml-2 text-[10px] text-muted-foreground">
                        {l.sub}
                      </span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function StackDialog({
  open,
  onOpenChange,
  item,
  locations,
  onSave,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  item: InventoryItem | null;
  locations: InventoryLocation[];
  onSave: (p: {
    id?: string;
    item_ref?: string | null;
    item_name: string;
    item_kind?: string | null;
    qty: number;
    qty_reserved?: number;
    unit: Unit;
    quality?: number | null;
    location_id?: string | null;
    visibility: "private" | "org";
    notes?: string | null;
  }) => void;
}) {
  // UI-Unit erlaubt zusätzlich "cscu" — beim Speichern wird in SCU konvertiert.
  type FormUnit = Unit | "cscu";
  const [form, setForm] = useState(() => ({
    item_ref: item?.item_ref ?? "",
    item_name: item?.item_name ?? "",
    item_kind: item?.item_kind ?? "",
    qty: item?.qty ?? 1,
    qty_reserved: item?.qty_reserved ?? 0,
    unit: (item?.unit ?? "pcs") as FormUnit,
    quality: (item?.quality ?? null) as number | null,
    location_id: item?.location_id ?? "",
    visibility: (item?.visibility ?? "private") as "private" | "org",
    notes: item?.notes ?? "",
  }));

  // reset when opened
  useMemo(() => {
    if (open) {
      setForm({
        item_ref: item?.item_ref ?? "",
        item_name: item?.item_name ?? "",
        item_kind: item?.item_kind ?? "",
        qty: item?.qty ?? 1,
        qty_reserved: item?.qty_reserved ?? 0,
        unit: (item?.unit ?? "pcs") as FormUnit,
        quality: (item?.quality ?? null) as number | null,
        location_id: item?.location_id ?? "",
        visibility: (item?.visibility ?? "private") as "private" | "org",
        notes: item?.notes ?? "",
      });
    }
  }, [open, item]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{item ? "Stack bearbeiten" : "Neuer Stack"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-1">
            <Label>Item-Name</Label>
            <ItemAutocomplete
              value={form.item_name}
              onChange={(v) =>
                setForm((f) => ({ ...f, item_name: v, item_ref: "" }))
              }
              onPick={(hit) =>
                setForm((f) => ({
                  ...f,
                  item_name: hit.name,
                  item_ref: hit.item_ref ?? "",
                  item_kind: hit.kind ?? f.item_kind,
                  unit: (hit.unit ?? f.unit) as Unit,
                }))
              }
            />
            {form.item_ref && (
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                // ref {form.item_ref}
              </p>
            )}
            {!form.item_ref && form.item_name.trim().length > 0 && (
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-amber-500">
                ⚠ nicht mit katalog verknüpft — beim tippen einen vorschlag wählen, damit lager &amp; bestellungen zusammenpassen
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Kategorie</Label>
              <Input
                value={form.item_kind ?? ""}
                placeholder="z. B. Erz, Komponente"
                onChange={(e) =>
                  setForm((f) => ({ ...f, item_kind: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>Lagerort</Label>
              <LocationPicker
                value={{ id: form.location_id || null, label: null }}
                locations={locations}
                visibility={form.visibility}
                onChange={(loc) =>
                  setForm((f) => ({ ...f, location_id: loc.id ?? "" }))
                }
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1">
              <Label>
                Menge (
                {form.unit === "scu"
                  ? "SCU"
                  : form.unit === "cscu"
                    ? "cSCU"
                    : "Stk."}
                )
              </Label>
              <Input
                type="number"
                step={form.unit === "scu" ? "0.01" : "1"}
                value={form.qty}
                onChange={(e) =>
                  setForm((f) => ({ ...f, qty: Number(e.target.value) }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>Reserviert</Label>
              <Input
                type="number"
                step={form.unit === "scu" ? "0.01" : "1"}
                value={form.qty_reserved}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    qty_reserved: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label>Einheit</Label>
              <Select
                value={form.unit}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, unit: v as FormUnit }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pcs">Stück</SelectItem>
                  <SelectItem value="scu">SCU (Cargo)</SelectItem>
                  <SelectItem value="cscu">cSCU (Centi-SCU)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {(form.unit === "scu" || form.unit === "cscu") && (
            <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
              // hinweis: 1 SCU = 100 cSCU
              {form.unit === "cscu" && form.qty > 0
                ? ` · ${form.qty} cSCU = ${(form.qty / 100).toLocaleString("de-DE", { maximumFractionDigits: 4 })} SCU`
                : ""}
            </p>
          )}
          <div className="grid gap-1">
            {(() => {
              const max = qualityMaxForKind(form.item_kind);
              return (
                <>
                  <Label>Qualität (0–{max}, optional)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={max}
                    value={form.quality ?? ""}
                    placeholder="0"
                    onFocus={(e) => e.currentTarget.select()}
                    onChange={(e) => {
                      const v = e.target.value;
                      setForm((f) => ({
                        ...f,
                        quality: v === "" ? null : Math.min(max, Number(v)),
                      }));
                    }}
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {max === 1000
                      ? "Mining-/Refining-Materialien rollen in SC mit Qualität 0–1000 (≥700 ist hochwertig)."
                      : "Item-Zustand in Prozent (0–100)."}
                  </p>
                </>
              );
            })()}
          </div>
          <div className="grid gap-1">
            <Label>Sichtbarkeit</Label>
            <Select
              value={form.visibility}
              onValueChange={(v) =>
                setForm((f) => ({
                  ...f,
                  visibility: v as "private" | "org",
                }))
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Privat</SelectItem>
                <SelectItem value="org">Orga (alle MRC)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Notiz</Label>
            <Textarea
              value={form.notes ?? ""}
              onChange={(e) =>
                setForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => {
              const isCscu = form.unit === "cscu";
              const storedUnit: Unit = isCscu ? "scu" : (form.unit as Unit);
              const factor = isCscu ? 1 / 100 : 1;
              onSave({
                id: item?.id,
                item_ref: form.item_ref || null,
                item_name: form.item_name.trim(),
                item_kind: form.item_kind || null,
                qty: form.qty * factor,
                qty_reserved: form.qty_reserved * factor,
                unit: storedUnit,
                quality: form.quality || null,
                location_id: form.location_id || null,
                visibility: form.visibility,
                notes: form.notes || null,
              });
            }}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function LocationsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const qc = useQueryClient();
  const locFn = useServerFn(listMyLocations);
  const upFn = useServerFn(upsertLocation);
  const delFn = useServerFn(deleteLocation);
  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
    enabled: open,
  });
  const [name, setName] = useState("");
  const [visibility, setVisibility] = useState<"private" | "org">("private");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lager verwalten</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          {(locsQ.data ?? []).map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between border border-brand/10 p-2"
            >
              <div>
                <div className="text-sm">{l.name}</div>
                <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                  {l.visibility}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await delFn({ data: { id: l.id } });
                  qc.invalidateQueries({ queryKey: ["inventory-locations"] });
                  qc.invalidateQueries({ queryKey: ["inventory"] });
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
          <div className="flex items-end gap-2 border-t border-brand/10 pt-3">
            <div className="flex-1">
              <Label>Neues Lager</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="z. B. Lorville Hangar"
              />
            </div>
            <Select
              value={visibility}
              onValueChange={(v) => setVisibility(v as "private" | "org")}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="private">Privat</SelectItem>
                <SelectItem value="org">Orga</SelectItem>
              </SelectContent>
            </Select>
            <Button
              onClick={async () => {
                if (!name.trim()) return;
                await upFn({ data: { name: name.trim(), visibility } });
                setName("");
                qc.invalidateQueries({ queryKey: ["inventory-locations"] });
              }}
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type CatalogHit = {
  item_ref: string | null;
  name: string;
  kind: string | null;
  weight: number | null;
  image_url: string | null;
  unit?: string | null;
  source?: "item" | "component" | "ship" | "blueprint" | null;
};

const KIND_GROUPS: Record<string, string[]> = {
  "Rohstoffe & Materialien": [
    "Raw Materials",
    "Metal",
    "Non-Metal",
    "Mineral",
    "Minteral",
    "Alloy",
    "Gas",
    "Liquid",
    "Halogen",
    "Chemical",
    "Organic",
    "Organics",
    "Natural",
    "Man-made",
    "Man-Made",
    "Surface",
    "Harvestables",
    "Agricultural",
    "Seed",
    "Animal",
    "Scrap",
    "Waste",
    "Commodity",
    "Commodities",
    "Crafting",
    "mineable",
    "harvestable",
    "salvage",
    "resource",
    "item",
    "remains",
    "Ore",
    "Ores",
  ],
  "Waffen & Munition": [
    "Guns",
    "Personal Weapons",
    "Arms",
    "Ammunition",
    "Attachments",
    "Missiles",
    "Missile Racks",
    "Bombs",
    "Bomb Racks",
    "Torpedo Tubes",
    "Explosive",
    "Turrets",
    "Point Defense Cannon",
    "Mining Laser Heads",
    "Salvage Beams",
    "Scraper Beams",
    "Tractor Beams",
    "Flight Blade",
  ],
  "Schiffsmodule": [
    "Quantum Drives",
    "Shield Generators",
    "Power Plants",
    "Coolers",
    "Radar",
    "Jump Modules",
    "Mining Modules",
    "External Fuel Tanks",
    "Life Support Generator",
    "Docking Collars",
    "Fuel",
    "Module",
    "Liveries",
  ],
  "Kleidung & Ausrüstung": [
    "Full Set",
    "Helmets",
    "Hats",
    "Eyeware",
    "Gloves",
    "Jackets",
    "Shirts",
    "Torso",
    "Undersuits",
    "Legs",
    "Legwear",
    "Footwear",
    "Backpacks",
    "Container",
  ],
  "Verbrauch & Medizin": [
    "Food",
    "Foods",
    "Drinks",
    "Consumables",
    "Medical",
    "Medicine",
    "Drug",
    "Vice",
  ],
  "Elektronik & Gadgets": [
    "Electronics",
    "Gadgets",
    "Mobiglas",
    "Decorations",
  ],
  "Sonstiges": ["Miscellaneous", "Other", "Temporary"],
};

function groupKinds(kinds: string[]) {
  const lookup = new Map<string, string>();
  for (const [group, list] of Object.entries(KIND_GROUPS)) {
    for (const k of list) lookup.set(k.toLowerCase(), group);
  }
  const groups = new Map<string, string[]>();
  for (const k of kinds) {
    const g = lookup.get(k.toLowerCase()) ?? "Sonstiges";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(k);
  }
  const order = [
    "Rohstoffe & Materialien",
    "Waffen & Munition",
    "Schiffsmodule",
    "Kleidung & Ausrüstung",
    "Verbrauch & Medizin",
    "Elektronik & Gadgets",
    "Sonstiges",
  ];
  return order
    .filter((g) => groups.has(g))
    .map((g) => [g, groups.get(g)!.sort((a, b) => a.localeCompare(b))] as const);
}

function ItemAutocomplete({
  value,
  onChange,
  onPick,
}: {
  value: string;
  onChange: (v: string) => void;
  onPick: (hit: CatalogHit) => void;
}) {
  const [q, setQ] = useState(value);
  const [kind, setKind] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const searchFn = useServerFn(searchItemCatalog);
  const kindsFn = useServerFn(listItemCatalogKinds);

  useEffect(() => {
    setQ(value);
  }, [value]);

  const kindsQ = useQuery({
    queryKey: ["item-catalog-kinds"],
    queryFn: () => kindsFn(),
    staleTime: 5 * 60_000,
  });
  const kinds = (kindsQ.data?.kinds ?? []) as string[];
  const groupedKinds = useMemo(() => groupKinds(kinds), [kinds]);

  const hitsQ = useQuery({
    queryKey: ["item-catalog", q, kind],
    queryFn: () =>
      searchFn({ data: { q, kind: kind ?? undefined } }),
    enabled: q.trim().length >= 2 || !!kind,
    staleTime: 60_000,
  });
  const hits = (hitsQ.data?.items ?? []) as CatalogHit[];

  return (
    <Popover open={open && hits.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <div className="flex gap-2">
          <Select
            value={kind ?? "__all"}
            onValueChange={(v) => {
              setKind(v === "__all" ? null : v);
              setOpen(true);
            }}
          >
            <SelectTrigger className="w-40 shrink-0">
              <SelectValue placeholder="Kategorie" />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              <SelectItem value="__all">Alle Kategorien</SelectItem>
              {groupedKinds.map(([group, list]) => (
                <SelectGroup key={group}>
                  <SelectLabel>{group}</SelectLabel>
                  {list.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={q}
            placeholder="z. B. Iron, Quantanium, Tactical Suit…"
            onChange={(e) => {
              setQ(e.target.value);
              onChange(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
        </div>
      </PopoverAnchor>
      <PopoverContent
        className="w-[min(28rem,90vw)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          // Allow continued typing in the input
          const target = e.target as HTMLElement;
          if (target?.tagName === "INPUT") e.preventDefault();
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
                {h.source && (
                  <span className="ml-2 shrink-0 rounded border border-brand/20 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand">
                    {h.source === "item"
                      ? "Item"
                      : h.source === "component"
                        ? "Komp."
                        : h.source === "ship"
                          ? "Schiff"
                          : "BP"}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

function OfferToOrgDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  item: InventoryItem;
}) {
  const qc = useQueryClient();
  const orgsFn = useServerFn(listMyOrgs);
  const offerFn = useServerFn(offerInventoryItem);
  const depositFn = useServerFn(depositInventoryDirect);
  const orgsQ = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => orgsFn(),
    enabled: open,
  });
  const orgs = orgsQ.data?.orgs ?? [];
  const [orgId, setOrgId] = useState<string>("");
  const free = Math.max(0, item.qty - item.qty_reserved);
  const [qty, setQty] = useState<number>(free);
  const [notes, setNotes] = useState("");
  const selectedOrg = orgs.find((o) => o.id === orgId);
  const canDirect = selectedOrg
    ? hasPerm(selectedOrg.my_role, selectedOrg.my_permissions, "warehouse.manage")
    : false;
  const [direct, setDirect] = useState(false);
  useEffect(() => {
    // default to direct deposit when allowed
    setDirect(canDirect);
  }, [canDirect]);

  useEffect(() => {
    if (open) {
      setQty(free);
      setNotes("");
      if (!orgId && orgs.length > 0) setOrgId(orgs[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orgs.length]);

  const m = useMutation({
    mutationFn: async () => {
      const payload = {
        data: {
          inventory_item_id: item.id,
          org_id: orgId,
          qty,
          notes: notes || undefined,
        },
      };
      if (direct && canDirect) {
        await depositFn(payload);
      } else {
        await offerFn(payload);
      }
    },
    onSuccess: () => {
      toast.success(
        direct && canDirect
          ? "Direkt ins Orgalager übertragen."
          : "An Orga angeboten – wartet auf Annahme im Orgalager.",
      );
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["org-offers"] });
      qc.invalidateQueries({ queryKey: ["org-warehouse"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>An Orga übertragen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            // {item.item_name} · verfügbar: {formatQty(free, item.unit)}
          </div>
          {orgs.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Du bist in keiner Orga. Erstelle oder tritt zuerst einer Orga bei.
            </p>
          ) : (
            <>
              <div className="grid gap-1">
                <Label>Orga</Label>
                <Select value={orgId} onValueChange={setOrgId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Orga wählen" />
                  </SelectTrigger>
                  <SelectContent>
                    {orgs.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.name}
                        {o.tag ? ` [${o.tag}]` : ""}
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
                  rows={2}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="z. B. für Schiffskauf, Übergabeort"
                />
              </div>
              {canDirect && (
                <label className="flex items-start gap-2 rounded border border-brand/20 bg-brand/5 p-2 text-xs">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={direct}
                    onChange={(e) => setDirect(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Direkt einlagern</span> — als
                    Lagerverwalter ohne Freigabe sofort ins Orgalager buchen.
                  </span>
                </label>
              )}
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                //{" "}
                {direct && canDirect
                  ? "wird sofort ins Orgalager gebucht"
                  : "bleibt sichtbar als „reserviert für Orga\", bis Quartermaster annimmt"}
              </p>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => m.mutate()}
            disabled={!orgId || qty <= 0 || qty > free || m.isPending}
          >
            {direct && canDirect ? "Direkt einlagern" : "Anbieten"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HeldOrgWarehouseView({
  items,
  isLoading,
}: {
  items: Array<{
    id: string;
    org_id: string;
    org_name: string;
    item_ref?: string | null;
    item_name: string;
    item_kind: string | null;
    qty: number;
    unit: string;
    quality: number | null;
    notes: string | null;
    category: string | null;
    held_at: string | null;
    locked: boolean;
  }>;
  isLoading: boolean;
}) {
  const [category, setCategory] = useState<string>("all");
  const [search, setSearch] = useState("");

  const categorized = useMemo(
    () =>
      items.map((i) => ({
        item: i,
        category:
          i.category ??
          (i.item_ref && i.item_ref.startsWith("commodity:")
            ? "Handelswaren"
            : autoCategorize(i.item_kind, i.item_name)) ??
          "Sonstiges",
      })),
    [items],
  );

  const categoryCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const { category: c } of categorized) m.set(c, (m.get(c) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [categorized]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return categorized.filter(({ item, category: c }) => {
      if (category !== "all" && c !== category) return false;
      if (!q) return true;
      return (
        item.item_name.toLowerCase().includes(q) ||
        (item.item_kind ?? "").toLowerCase().includes(q) ||
        item.org_name.toLowerCase().includes(q)
      );
    });
  }, [categorized, category, search]);

  const grouped = useMemo(() => {
    const m = new Map<string, typeof filtered>();
    for (const entry of filtered) {
      if (!m.has(entry.category)) m.set(entry.category, [] as typeof filtered);
      m.get(entry.category)!.push(entry);
    }
    return Array.from(m.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  const totals = useMemo(
    () => ({
      stacks: items.length,
      qty: items.reduce((s, i) => s + i.qty, 0),
      orgs: new Set(items.map((i) => i.org_id)).size,
      locked: items.filter((i) => i.locked).length,
    }),
    [items],
  );

  if (isLoading) {
    return (
      <LoadingScreen
        label="Lade Orgabestand"
        hint="// prüfe wo du orga-items hältst"
        cards={8}
      />
    );
  }

  return (
    <>
      <StatGrid cols={4}>
        <StatCard
          label="Stacks gesamt"
          value={totals.stacks}
          hint={`${totals.qty.toLocaleString("de-DE")} Einheiten`}
          icon={Package}
          tone="brand"
        />
        <StatCard label="Kategorien" value={categoryCounts.length} icon={Package} />
        <StatCard label="Orgas" value={totals.orgs} icon={Users} tone="emerald" />
        <StatCard label="Gesperrt" value={totals.locked} icon={Lock} tone="amber" />
      </StatGrid>

      <StickyToolbar>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Kategorie" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">
              Alle Kategorien ({categorized.length})
            </SelectItem>
            {categoryCounts.map(([c, n]) => (
              <SelectItem key={c} value={c}>
                {c} ({n})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="Suche…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </StickyToolbar>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-brand/15 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          // du hältst aktuell keinen orgabestand
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([cat, entries]) => (
            <section key={cat} className="space-y-3">
              <div className="flex items-center gap-3">
                <h3 className="font-display text-sm uppercase tracking-[0.25em] text-brand/80">
                  {cat}
                </h3>
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {entries.length} Stack{entries.length === 1 ? "" : "s"}
                </span>
                <div className="h-px flex-1 bg-brand/10" />
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {entries.map(({ item: i }) => (
                  <HeldOrgStackCard key={i.id} item={i} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function HeldOrgStackCard({
  item,
}: {
  item: {
    id: string;
    org_name: string;
    item_ref?: string | null;
    item_name: string;
    item_kind: string | null;
    qty: number;
    unit: string;
    quality: number | null;
    notes: string | null;
    held_at: string | null;
    locked: boolean;
  };
}) {
  return (
    <div className="flex flex-col gap-2 border border-brand/10 bg-background/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-display text-base">
            <ItemLink item_ref={item.item_ref ?? null} name={item.item_name} />
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            {item.item_kind ?? "—"} · {item.org_name}
          </div>
        </div>
        <Badge variant="outline" className="shrink-0">
          <Users className="mr-1 h-3 w-3" /> orga
        </Badge>
      </div>

      <div className="grid grid-cols-3 gap-px bg-brand/10">
        <div className="bg-background p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
            Menge
          </div>
          <div className="font-display text-lg">
            {formatQty(item.qty, item.unit as Unit)}
          </div>
        </div>
        <div className="bg-background p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
            Qualität
          </div>
          <div className="font-display text-lg">{item.quality ?? "—"}</div>
        </div>
        <div className="bg-background p-2 text-center">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
            Status
          </div>
          <div className="font-display text-lg">
            {item.locked ? (
              <span className="text-amber-400">Lock</span>
            ) : (
              <span className="text-emerald-400">frei</span>
            )}
          </div>
        </div>
      </div>

      {item.held_at && (
        <div className="text-[10px] text-muted-foreground">
          hält seit {new Date(item.held_at).toLocaleDateString("de-DE")}
        </div>
      )}
      {item.notes && (
        <div className="text-[10px] text-muted-foreground italic">
          {item.notes}
        </div>
      )}
    </div>
  );
}
