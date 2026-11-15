import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Ship as ShipIcon,
  MapPin,
  Trash2,
  Wrench,
  LayoutGrid,
  List as ListIcon,
  Search,
  Plus,
  Pencil,
  RefreshCw,
  Link2,
  ChevronRight,
} from "lucide-react";
import { getFleetShips, listAllCatalogShips, type FleetShip } from "@/lib/fleet.functions";
import {
  addMyShip,
  getMyProfile,
  removeMyShip,
  updateMyShip,
  setFleetyardsUsername,
  syncMyFleetyards,
} from "@/lib/profile.functions";
import { PageShell, StickyToolbar, StatGrid, StatCard, StatusBadge } from "@/components/layout/PageShell";
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
import { LoadingScreen } from "@/components/ui/loading-screen";
import { cn } from "@/lib/utils";
import { proxyImage } from "@/lib/proxy-image";

export const Route = createFileRoute("/_authenticated/meine-flotte")({
  component: MyFleetPage,
});

type ShipRow = {
  id: string;
  ship_slug: string | null;
  ship_name: string;
  manufacturer: string | null;
  custom_name: string | null;
  location: string | null;
  notes: string | null;
  source: string;
  created_at: string;
};

function MyFleetPage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchFleet = useServerFn(getFleetShips);
  const fetchCatalog = useServerFn(listAllCatalogShips);
  const addFn = useServerFn(addMyShip);
  const removeFn = useServerFn(removeMyShip);
  const updateFn = useServerFn(updateMyShip);
  const setFyFn = useServerFn(setFleetyardsUsername);
  const syncFyFn = useServerFn(syncMyFleetyards);

  const profileQ = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });
  const fleetQ = useQuery({
    queryKey: ["fleet-ships"],
    queryFn: () => fetchFleet(),
    staleTime: 5 * 60 * 1000,
  });
  const catalogQ = useQuery({
    queryKey: ["ship-catalog-all"],
    queryFn: () => fetchCatalog(),
    staleTime: 10 * 60 * 1000,
  });

  const ships = (profileQ.data?.ships ?? []) as ShipRow[];
  const fyProfile = profileQ.data?.profile as
    | {
        fleetyards_username?: string | null;
        fleetyards_last_sync?: string | null;
        fleetyards_last_error?: string | null;
      }
    | undefined;
  const fyShipCount = ships.filter((s) => s.source === "fleetyards").length;
  const fleetCatalog = fleetQ.data?.ships ?? [];
  const catalog: FleetShip[] = useMemo(() => {
    const full = catalogQ.data ?? [];
    if (full.length === 0) return fleetCatalog;
    const bySlug = new Map<string, FleetShip>();
    for (const s of full) bySlug.set(s.slug, s);
    for (const s of fleetCatalog) {
      const existing = bySlug.get(s.slug);
      if (existing) existing.count = s.count;
      else bySlug.set(s.slug, s);
    }
    return Array.from(bySlug.values()).sort((a, b) => {
      const ma = (a.manufacturer ?? "zzz").toLowerCase();
      const mb = (b.manufacturer ?? "zzz").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb, "de");
      return a.name.localeCompare(b.name, "de");
    });
  }, [catalogQ.data, fleetCatalog]);
  const catalogBySlug = useMemo(() => {
    const m = new Map<string, FleetShip>();
    for (const c of catalog) m.set(c.slug, c);
    return m;
  }, [catalog]);

  const [query, setQuery] = useState("");
  const [pickSlug, setPickSlug] = useState<string>("");
  const [customName, setCustomName] = useState("");
  const [location, setLocation] = useState("");
  const [manualName, setManualName] = useState("");
  const [manualMfr, setManualMfr] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState("");
  const [sortMode, setSortMode] = useState<"default" | "alpha">("default");
  const [fyInput, setFyInput] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [fyOpen, setFyOpen] = useState(false);
  const [editShip, setEditShip] = useState<ShipRow | null>(null);

  useEffect(() => {
    if (fyProfile) setFyInput((prev) => prev || (fyProfile.fleetyards_username ?? ""));
  }, [fyProfile]);

  const filteredShips = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const base = q
      ? ships.filter((s) =>
          `${s.ship_name} ${s.manufacturer ?? ""} ${s.custom_name ?? ""} ${s.location ?? ""}`
            .toLowerCase()
            .includes(q),
        )
      : ships.slice();

    const sizeOf = (s: ShipRow) =>
      (s.ship_slug ? catalogBySlug.get(s.ship_slug)?.size : null) ?? null;
    const SIZE_ORDER: Record<string, number> = {
      capital: 0, large: 1, medium: 2, small: 3, snub: 4, vehicle: 5,
    };
    const stripMfr = (name: string, mfr: string | null) => {
      const n = name.trim();
      if (!mfr) return n;
      const m = mfr.trim();
      if (m && n.toLowerCase().startsWith(m.toLowerCase() + " ")) return n.slice(m.length + 1).trim();
      return n;
    };

    if (sortMode === "alpha") {
      return base.sort((a, b) =>
        stripMfr(a.ship_name, a.manufacturer).localeCompare(
          stripMfr(b.ship_name, b.manufacturer),
          "de",
          { sensitivity: "base" },
        ),
      );
    }
    return base.sort((a, b) => {
      const ma = (a.manufacturer ?? "zzz").toLowerCase();
      const mb = (b.manufacturer ?? "zzz").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb, "de");
      const sa = SIZE_ORDER[(sizeOf(a) ?? "").toLowerCase()] ?? 99;
      const sb = SIZE_ORDER[(sizeOf(b) ?? "").toLowerCase()] ?? 99;
      if (sa !== sb) return sa - sb;
      return a.ship_name.localeCompare(b.ship_name, "de");
    });
  }, [ships, filter, sortMode, catalogBySlug]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalog.slice(0, 8);
    return catalog
      .filter((s) => `${s.manufacturer ?? ""} ${s.name}`.toLowerCase().includes(q))
      .slice(0, 8);
  }, [catalog, query]);

  const picked = useMemo(() => catalog.find((s) => s.slug === pickSlug) ?? null, [catalog, pickSlug]);

  const withLocation = ships.filter((s) => (s.location ?? "").trim().length > 0).length;
  const manualCount = ships.length - fyShipCount;

  const addCatalogShip = useMutation({
    mutationFn: () => {
      if (!picked) throw new Error("Kein Schiff gewählt");
      return addFn({
        data: {
          ship_slug: picked.slug,
          ship_name: picked.name,
          manufacturer: picked.manufacturer,
          custom_name: customName || null,
          location: location || null,
        },
      });
    },
    onSuccess: () => {
      setPickSlug("");
      setQuery("");
      setCustomName("");
      setLocation("");
      setAddOpen(false);
      toast.success("Schiff hinzugefügt");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addManualShip = useMutation({
    mutationFn: () => {
      if (!manualName.trim()) throw new Error("Schiffname fehlt");
      return addFn({
        data: {
          ship_slug: null,
          ship_name: manualName.trim(),
          manufacturer: manualMfr.trim() || null,
          custom_name: null,
          location: null,
        },
      });
    },
    onSuccess: () => {
      setManualName("");
      setManualMfr("");
      setAddOpen(false);
      toast.success("Schiff hinzugefügt");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeShip = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Schiff entfernt");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const updateShip = useMutation({
    mutationFn: (vars: { id: string; custom_name: string | null; location: string | null; notes: string | null }) =>
      updateFn({ data: vars }),
    onSuccess: () => {
      setEditShip(null);
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const saveFleetyards = useMutation({
    mutationFn: () => setFyFn({ data: { input: fyInput } }),
    onSuccess: () => {
      toast.success("Fleetyards verbunden");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const syncFleetyards = useMutation({
    mutationFn: () => syncFyFn(),
    onSuccess: () => {
      toast.success("Sync abgeschlossen");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (profileQ.isLoading) return <LoadingScreen label="Hangar wird geladen" />;

  return (
    <PageShell
      eyebrow="Persönlich"
      title={<>Meine <span className="text-brand">Flotte</span></>}
      description="Deine registrierten Schiffe. Klicke auf ein Schiff, um die Detailansicht zu öffnen — Standort und Notizen bearbeitest du über das Stift-Symbol."
      actions={
        <>
          <Button variant="outline" onClick={() => setFyOpen(true)}>
            <Link2 className="mr-1.5 h-4 w-4" /> Fleetyards
          </Button>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" /> Schiff hinzufügen
          </Button>
        </>
      }
    >
      <StatGrid cols={4}>
        <StatCard label="Schiffe gesamt" value={ships.length} icon={ShipIcon} tone="brand" />
        <StatCard label="Aus Fleetyards" value={fyShipCount} icon={RefreshCw} tone="violet" />
        <StatCard label="Manuell erfasst" value={manualCount} icon={Pencil} />
        <StatCard label="Mit Standort" value={withLocation} icon={MapPin} tone="emerald" />
      </StatGrid>

      <StickyToolbar>
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Schiff, Hersteller oder Standort suchen…"
            className="pl-9"
          />
        </div>
        <div className="inline-flex items-center gap-1 rounded-2xl border border-white/8 bg-card/50 p-1">
          {(["default", "alpha"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSortMode(m)}
              aria-pressed={sortMode === m}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-medium transition",
                sortMode === m ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "default" ? "Hersteller" : "A → Z"}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 rounded-2xl border border-white/8 bg-card/50 p-1">
          {([
            ["grid", LayoutGrid, "Kacheln"],
            ["list", ListIcon, "Liste"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              aria-label={label}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition",
                view === v ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </StickyToolbar>

      {filteredShips.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-card/40 p-12 text-center text-sm text-muted-foreground backdrop-blur-sm">
          {ships.length === 0
            ? "Noch keine Schiffe registriert. Füge dein erstes Schiff hinzu oder verbinde Fleetyards."
            : "Keine Treffer für deine Suche."}
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filteredShips.map((s) => (
            <ShipCard
              key={s.id}
              ship={s}
              catalog={s.ship_slug ? catalogBySlug.get(s.ship_slug) : undefined}
              onEdit={() => setEditShip(s)}
              onRemove={() => removeShip.mutate(s.id)}
            />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/8 bg-card/40 backdrop-blur-sm">
          <ul className="divide-y divide-white/5">
            {filteredShips.map((s) => (
              <ShipListRow
                key={s.id}
                ship={s}
                catalog={s.ship_slug ? catalogBySlug.get(s.ship_slug) : undefined}
                onEdit={() => setEditShip(s)}
                onRemove={() => removeShip.mutate(s.id)}
              />
            ))}
          </ul>
        </div>
      )}

      {/* Schiff hinzufügen */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Schiff hinzufügen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Aus dem Katalog</Label>
              <div className="relative">
                <Input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setPickSlug("");
                  }}
                  placeholder="Modell oder Hersteller suchen…"
                />
                {query && !pickSlug && matches.length > 0 && (
                  <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-auto rounded-xl border border-white/10 bg-popover shadow-xl">
                    {matches.map((s) => (
                      <li key={s.slug}>
                        <button
                          type="button"
                          onClick={() => {
                            setPickSlug(s.slug);
                            setQuery(`${s.manufacturer ?? ""} ${s.name}`.trim());
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-white/5"
                        >
                          <span>
                            {s.name}{" "}
                            <span className="text-muted-foreground">· {s.manufacturer}</span>
                          </span>
                          <span className="text-xs text-brand/70">{s.classification ?? ""}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Eigener Name</Label>
                <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="optional" />
              </div>
              <div className="space-y-1.5">
                <Label>Standort</Label>
                <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z. B. Area18" />
              </div>
            </div>
            <Button
              className="w-full"
              onClick={() => addCatalogShip.mutate()}
              disabled={!picked || addCatalogShip.isPending}
            >
              <Plus className="mr-1.5 h-4 w-4" /> Aus Katalog hinzufügen
            </Button>

            <div className="rounded-2xl border border-white/8 bg-background/40 p-4">
              <div className="mb-3 text-xs text-muted-foreground">
                Schiff nicht im Katalog? Manuell eintragen:
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Schiffname" />
                <Input value={manualMfr} onChange={(e) => setManualMfr(e.target.value)} placeholder="Hersteller" />
              </div>
              <Button
                variant="outline"
                className="mt-3 w-full"
                onClick={() => addManualShip.mutate()}
                disabled={!manualName.trim() || addManualShip.isPending}
              >
                Manuell hinzufügen
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fleetyards */}
      <Dialog open={fyOpen} onOpenChange={setFyOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Fleetyards-Import</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Gib deinen Fleetyards-Benutzernamen oder den Link zu deinem öffentlichen Hangar an. Manuelle
              Einträge bleiben beim Sync erhalten.
            </p>
            <Input
              value={fyInput}
              onChange={(e) => setFyInput(e.target.value)}
              placeholder="Fleetyards-User oder Hangar-Link"
            />
            {fyProfile?.fleetyards_last_sync && (
              <p className="text-xs text-muted-foreground">
                Letzter Sync: {new Date(fyProfile.fleetyards_last_sync).toLocaleString("de-DE")} ·{" "}
                {fyShipCount} {fyShipCount === 1 ? "Schiff" : "Schiffe"}
              </p>
            )}
            {fyProfile?.fleetyards_last_error && (
              <p className="text-xs text-destructive">Letzter Sync-Fehler: {fyProfile.fleetyards_last_error}</p>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => syncFleetyards.mutate()}
              disabled={!fyProfile?.fleetyards_username || syncFleetyards.isPending}
            >
              <RefreshCw className={cn("mr-1.5 h-4 w-4", syncFleetyards.isPending && "animate-spin")} /> Jetzt syncen
            </Button>
            <Button onClick={() => saveFleetyards.mutate()} disabled={saveFleetyards.isPending}>
              Speichern & Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bearbeiten */}
      <EditShipDialog
        ship={editShip}
        onClose={() => setEditShip(null)}
        onSave={(patch) => editShip && updateShip.mutate({ id: editShip.id, ...patch })}
        pending={updateShip.isPending}
      />
    </PageShell>
  );
}

function EditShipDialog({
  ship,
  onClose,
  onSave,
  pending,
}: {
  ship: ShipRow | null;
  onClose: () => void;
  onSave: (patch: { custom_name: string | null; location: string | null; notes: string | null }) => void;
  pending: boolean;
}) {
  const [customName, setCustomName] = useState("");
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  useEffect(() => {
    setCustomName(ship?.custom_name ?? "");
    setLocation(ship?.location ?? "");
    setNotes(ship?.notes ?? "");
  }, [ship]);

  return (
    <Dialog open={!!ship} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{ship?.ship_name ?? "Schiff"} bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {ship?.source !== "fleetyards" && (
            <div className="space-y-1.5">
              <Label>Eigener Name</Label>
              <Input value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="z. B. Nightshade" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Standort</Label>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="z. B. Area18" />
          </div>
          <div className="space-y-1.5">
            <Label>Notizen</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Loadout, Status, Schäden…"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button
            disabled={pending}
            onClick={() =>
              onSave({
                custom_name: customName.trim() || null,
                location: location.trim() || null,
                notes: notes.trim() || null,
              })
            }
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShipThumb({ catalog, alt, className }: { catalog?: FleetShip; alt: string; className?: string }) {
  const img = proxyImage(catalog?.image);
  if (img) {
    return (
      <img
        src={img}
        alt={alt}
        loading="lazy"
        className={cn("h-full w-full object-cover transition-transform duration-500 group-hover:scale-105", className)}
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-white/[0.03]">
      <ShipIcon className="h-5 w-5 text-muted-foreground/50" />
    </div>
  );
}

function SpecStat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-[0.18em] text-brand/60">{label}</div>
      <div className="mt-0.5 truncate text-xs text-foreground/90">{value ?? "—"}</div>
    </div>
  );
}

function ShipCard({
  ship,
  catalog,
  onEdit,
  onRemove,
}: {
  ship: ShipRow;
  catalog?: FleetShip;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const clickable = !!ship.ship_slug;
  const open = () => {
    if (ship.ship_slug) navigate({ to: "/schiff/$slug", params: { slug: ship.ship_slug } });
  };
  const isFleetyards = ship.source === "fleetyards";

  return (
    <div
      onClick={open}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      role={clickable ? "link" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${ship.ship_name} — Details öffnen` : undefined}
      className={cn(
        "group flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-card/50 backdrop-blur-sm transition",
        clickable && "cursor-pointer hover:border-brand/40 hover:bg-card/70",
      )}
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/40">
        <ShipThumb catalog={catalog} alt={ship.ship_name} />
        {isFleetyards && (
          <div className="absolute right-2 top-2">
            <StatusBadge tone="violet">Fleetyards</StatusBadge>
          </div>
        )}
        {catalog?.manufacturerCode && (
          <div className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/80">
            {catalog.manufacturerCode}
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="truncate font-display text-base leading-tight group-hover:text-brand">
              {ship.custom_name || ship.ship_name}
            </h3>
            {clickable && (
              <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
            )}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {ship.custom_name ? `${ship.ship_name} · ` : ""}
            {ship.manufacturer ?? "—"}
          </div>
        </div>

        {catalog && (
          <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
            <SpecStat label="Klasse" value={catalog.classification} />
            <SpecStat label="Größe" value={catalog.size} />
            <SpecStat label="Crew" value={catalog.crew} />
          </div>
        )}
        {catalog && (
          <div className="grid grid-cols-2 gap-2">
            <SpecStat label="Länge" value={catalog.length} />
            <SpecStat label="Cargo" value={catalog.cargo} />
          </div>
        )}

        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <MapPin className="h-3.5 w-3.5 shrink-0 text-brand/70" />
            <span className="truncate">{ship.location || "Kein Standort hinterlegt"}</span>
          </div>
          {ship.notes && <p className="line-clamp-2 text-muted-foreground/80">{ship.notes}</p>}
        </div>

        <div className="mt-auto flex items-center gap-2 border-t border-white/5 pt-3" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`${ship.ship_name} bearbeiten`}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="sm" asChild>
            <Link to="/loadouts" hash={ship.ship_slug ?? undefined} aria-label={`${ship.ship_name} Loadout`}>
              <Wrench className="h-3.5 w-3.5" />
            </Link>
          </Button>
          {!isFleetyards && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              onClick={onRemove}
              aria-label={`${ship.ship_name} entfernen`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ShipListRow({
  ship,
  catalog,
  onEdit,
  onRemove,
}: {
  ship: ShipRow;
  catalog?: FleetShip;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const navigate = useNavigate();
  const clickable = !!ship.ship_slug;
  const open = () => {
    if (ship.ship_slug) navigate({ to: "/schiff/$slug", params: { slug: ship.ship_slug } });
  };
  const isFleetyards = ship.source === "fleetyards";

  return (
    <li
      onClick={open}
      role={clickable ? "link" : undefined}
      tabIndex={clickable ? 0 : undefined}
      aria-label={clickable ? `${ship.ship_name} — Details öffnen` : undefined}
      onKeyDown={(e) => {
        if (clickable && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          open();
        }
      }}
      className={cn(
        "group flex items-center gap-4 px-4 py-3 transition",
        clickable && "cursor-pointer hover:bg-white/[0.04]",
      )}
    >
      <div className="h-12 w-20 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black/40">
        <ShipThumb catalog={catalog} alt={ship.ship_name} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium group-hover:text-brand">
            {ship.custom_name || ship.ship_name}
          </span>
          {isFleetyards && <StatusBadge tone="violet">Fleetyards</StatusBadge>}
        </div>
        <div className="truncate text-xs text-muted-foreground">
          {ship.custom_name ? `${ship.ship_name} · ` : ""}
          {ship.manufacturer ?? "—"}
          {catalog?.classification ? ` · ${catalog.classification}` : ""}
          {catalog?.size ? ` · ${catalog.size}` : ""}
        </div>
      </div>
      <div className="hidden min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground md:flex">
        <MapPin className="h-3.5 w-3.5 shrink-0 text-brand/70" />
        <span className="truncate">{ship.location || "—"}</span>
      </div>
      <div className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block">
        {ship.notes || "—"}
      </div>
      <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
        <Button variant="ghost" size="sm" onClick={onEdit} aria-label={`${ship.ship_name} bearbeiten`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/loadouts" hash={ship.ship_slug ?? undefined} aria-label={`${ship.ship_name} Loadout`}>
            <Wrench className="h-3.5 w-3.5" />
          </Link>
        </Button>
        {!isFleetyards && (
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={onRemove}
            aria-label={`${ship.ship_name} entfernen`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      {clickable && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand" />}
    </li>
  );
}
