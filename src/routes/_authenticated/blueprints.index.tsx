import { createFileRoute, Link } from "@tanstack/react-router";
import { BlueprintDetailView } from "./blueprints.$id";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { upsertBlueprint } from "@/lib/blueprints.functions";
import {
  listBlueprintCatalog,
  toggleBlueprintOwned,
  syncWikiBlueprints,
  getWikiBlueprintSyncStatus,
  rematchInventoryWikiUuids,
  importBlueprintCollection,
} from "@/lib/blueprints-catalog.functions";
import { amIAdmin } from "@/lib/catalog-sync.functions";
import { formatQty } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
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
  SelectGroup,
  SelectLabel,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Plus,
  FileText,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Target,
  Sparkles,
  Hammer,
  Upload,
} from "lucide-react";
import { PageShell, StickyToolbar, StatGrid, StatCard } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const Route = createFileRoute("/_authenticated/blueprints/")({
  component: BlueprintsPage,
});

function BlueprintsPage() {
  const qc = useQueryClient();
  const upFn = useServerFn(upsertBlueprint);
  const catFn = useServerFn(listBlueprintCatalog);
  const toggleFn = useServerFn(toggleBlueprintOwned);
  const syncFn = useServerFn(syncWikiBlueprints);
  const statusFn = useServerFn(getWikiBlueprintSyncStatus);
  const rematchFn = useServerFn(rematchInventoryWikiUuids);
  const adminFn = useServerFn(amIAdmin);
  const importFn = useServerFn(importBlueprintCollection);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [search, setSearch] = useState("");
  const [onlyOwned, setOnlyOwned] = useState(false);
  const [onlyCraftable, setOnlyCraftable] = useState(false);
  const [source, setSource] = useState<"all" | "wiki" | "manual">("all");
  const [category, setCategory] = useState<string>("all");
  const [groupByCategory, setGroupByCategory] = useState(false);
  const [open, setOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[] | null>(null);

  const catQ = useQuery({
    queryKey: ["blueprint-catalog", search, onlyOwned, onlyCraftable, source],
    queryFn: () =>
      catFn({
        data: {
          search: search || undefined,
          only_owned: onlyOwned || undefined,
          only_craftable: onlyCraftable || undefined,
          source,
        },
      }),
  });
  const statusQ = useQuery({
    queryKey: ["wiki-bp-sync-status"],
    queryFn: () => statusFn(),
    staleTime: 30_000,
  });
  const adminQ = useQuery({
    queryKey: ["me-admin"],
    queryFn: () => adminFn(),
    staleTime: 5 * 60_000,
  });
  const syncM = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(
        `Sync: ${r.blueprints_count} Blueprints · ${r.mission_links_count} Missions · ${r.catalog_matched_count ?? 0} Items verknüpft (${Math.round(r.duration_ms / 1000)}s)`,
      );
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] });
      qc.invalidateQueries({ queryKey: ["wiki-bp-sync-status"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const rematchM = useMutation({
    mutationFn: () => rematchFn(),
    onSuccess: (r) => {
      toast.success(
        `Item-Matching: ${r.updated} aktualisiert (${r.scanned} geprüft)`,
      );
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const toggleM = useMutation({
    mutationFn: (v: { id: string; owned: boolean }) =>
      toggleFn({ data: { blueprint_id: v.id, owned: v.owned } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  const importM = useMutation({
    mutationFn: (blueprints: Array<{ key: string; isDone: boolean }>) =>
      importFn({ data: { blueprints } }),
    onSuccess: (r) => {
      toast.success(
        `${r.added} neu hinzugefügt · ${r.already_owned} bereits gesammelt · ${r.unmatched.length} nicht zuordenbar`,
      );
      if (r.unmatched.length > 0) setUnmatched(r.unmatched);
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (!json || !Array.isArray(json.blueprints)) {
        toast.error("Ungültiges Format: 'blueprints' fehlt.");
        return;
      }
      const items = (json.blueprints as unknown[])
        .filter(
          (b): b is { key: string; isDone?: boolean } =>
            !!b && typeof (b as { key?: unknown }).key === "string",
        )
        .map((b) => ({ key: b.key, isDone: b.isDone === true }));
      importM.mutate(items);
    } catch (e) {
      toast.error("JSON konnte nicht gelesen werden: " + (e as Error).message);
    }
  }
  const bps = catQ.data?.blueprints ?? [];

  const categoryCounts = (() => {
    const m = new Map<string, number>();
    for (const b of bps) {
      const k = b.category ?? "Ohne Kategorie";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return Array.from(m.entries()).sort((a, b) =>
      b[1] - a[1] || a[0].localeCompare(b[0], "de"),
    );
  })();

  const GROUP_ORDER = [
    "Schiffskomponenten",
    "Waffen",
    "Rüstung",
    "Sonstiges",
  ] as const;
  const groupOf = (cat: string): (typeof GROUP_ORDER)[number] => {
    const c = cat.toLowerCase();
    if (
      c.includes("armor") ||
      c.includes("undersuit") ||
      c.includes("backpack") ||
      c.includes("helmet") ||
      c.includes("torso") ||
      c.includes("legs") ||
      c.includes("arms")
    )
      return "Rüstung";
    if (c.includes("weapon") || c.includes("fps")) return "Waffen";
    if (
      c.includes("power plant") ||
      c.includes("cooler") ||
      c.includes("shield") ||
      c.includes("quantum") ||
      c.includes("radar") ||
      c.includes("docking") ||
      c.includes("tractor") ||
      c.includes("salvage") ||
      c.includes("missile") ||
      c.includes("thruster")
    )
      return "Schiffskomponenten";
    return "Sonstiges";
  };
  const groupedCategories = (() => {
    const m = new Map<string, Array<[string, number]>>();
    for (const entry of categoryCounts) {
      const g = groupOf(entry[0]);
      const arr = m.get(g) ?? [];
      arr.push(entry);
      m.set(g, arr);
    }
    return GROUP_ORDER.filter((g) => m.has(g)).map((g) => ({
      group: g,
      total: (m.get(g) ?? []).reduce((s, [, n]) => s + n, 0),
      items: m.get(g) ?? [],
    }));
  })();

  const visibleBps =
    category === "all"
      ? bps
      : bps.filter((b) => (b.category ?? "Ohne Kategorie") === category);

  const activeFilterCount =
    (source !== "all" ? 1 : 0) +
    (category !== "all" ? 1 : 0) +
    (onlyOwned ? 1 : 0) +
    (onlyCraftable ? 1 : 0) +
    (search.trim() ? 1 : 0);

  const resetFilters = () => {
    setSource("all");
    setCategory("all");
    setOnlyOwned(false);
    setOnlyCraftable(false);
    setSearch("");
  };

  const grouped = (() => {
    if (!groupByCategory) return null;
    const m = new Map<string, typeof visibleBps>();
    for (const b of visibleBps) {
      const k = b.category ?? "Ohne Kategorie";
      const arr = m.get(k) ?? [];
      arr.push(b);
      m.set(k, arr);
    }
    return Array.from(m.entries()).sort((a, b) =>
      a[0].localeCompare(b[0], "de"),
    );
  })();

  const [form, setForm] = useState({
    item_name: "",
    output_qty: 1,
    visibility: "private" as "private" | "org",
    notes: "",
  });

  const last = statusQ.data?.last_synced_at
    ? new Date(statusQ.data.last_synced_at).toLocaleString("de-DE")
    : "nie";

  type CardBp = (typeof bps)[number];
  const renderCard = (b: CardBp) => (
    <div
      key={b.id}
      className={`flex flex-col gap-3 border bg-background/60 p-4 ${
        b.craftable ? "border-emerald-500/40" : "border-brand/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-brand" />
            <button
              type="button"
              onClick={() => setDetailId(b.id)}
              className="truncate text-left font-display text-base hover:text-brand"
            >
              {b.name}
            </button>
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            {b.category ?? "—"}
            {b.craft_time_seconds
              ? ` · ${Math.round(b.craft_time_seconds / 60)} min`
              : ""}
          </div>
        </div>
        {b.craftable ? (
          <Badge className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Herstellbar
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <XCircle className="mr-1 h-3 w-3" />{" "}
            {b.ingredients.length === 0 ? "leer" : "fehlt"}
          </Badge>
        )}
      </div>

      <div className="space-y-1">
        <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
          Materialien
        </div>
        {b.ingredients.length === 0 ? (
          <p className="text-xs text-muted-foreground">—</p>
        ) : (
          <ul className="space-y-0.5">
            {b.ingredients.slice(0, 6).map((i, idx) => {
              const ok = i.have >= i.need;
              return (
                <li
                  key={idx}
                  className="flex items-center justify-between gap-2 text-xs"
                >
                  <span className="truncate">{i.name}</span>
                  <span
                    className={`font-mono ${ok ? "text-emerald-400" : "text-rose-400"}`}
                  >
                    {formatQty(i.have, i.unit)} / {formatQty(i.need, i.unit)}
                  </span>
                </li>
              );
            })}
            {b.ingredients.length > 6 && (
              <li className="text-[10px] text-muted-foreground">
                +{b.ingredients.length - 6} weitere
              </li>
            )}
          </ul>
        )}
      </div>

      {b.missions.length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            <Target className="mr-1 inline h-3 w-3" /> Freischaltung
          </div>
          <ul className="space-y-0.5">
            {b.missions.slice(0, 3).map((m) => (
              <li key={m.mission_uuid} className="truncate text-xs">
                {m.title}
                {m.faction ? (
                  <span className="text-muted-foreground"> · {m.faction}</span>
                ) : null}
              </li>
            ))}
            {b.missions.length > 3 && (
              <li className="text-[10px] text-muted-foreground">
                +{b.missions.length - 3} weitere
              </li>
            )}
          </ul>
        </div>
      )}
      {b.is_default && (
        <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-emerald-400">
          // standard freigeschaltet
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-brand/10 pt-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs">
          <Checkbox
            checked={b.owned}
            onCheckedChange={(v) =>
              toggleM.mutate({ id: b.id, owned: !!v })
            }
          />
          Gesammelt
        </label>
        <Link
          to="/crafting"
          search={{ bp: b.id }}
          className="inline-flex items-center gap-1 border border-brand/30 bg-brand/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.2em] text-brand hover:bg-brand/20"
        >
          <Hammer className="h-3 w-3" /> Craften
        </Link>
      </div>
    </div>
  );

  return (
    <PageShell
      eyebrow="Produktion"
      title="Blueprints"
      description="Alle Blaupausen aus dem Wiki und eigene Einträge – mit Material-Status und Missions-Freischaltungen."
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/inventar">← Inventar</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/crafting/historie">Verlauf</Link>
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImportFile(f);
              e.target.value = "";
            }}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={importM.isPending}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {importM.isPending ? "Importiere…" : "Sammlung importieren"}
          </Button>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus className="mr-2 h-4 w-4" /> Manuell
          </Button>
        </>
      }
    >
      <StatGrid cols={4}>
        <StatCard
          label="Sichtbar"
          value={bps.length}
          icon={FileText}
          tone="brand"
        />
        <StatCard
          label="Gesammelt"
          value={bps.filter((b) => b.owned).length}
          icon={CheckCircle2}
          tone="emerald"
        />
        <StatCard
          label="Herstellbar"
          value={bps.filter((b) => b.craftable).length}
          icon={Hammer}
        />
        <StatCard
          label="Wiki-Katalog"
          value={(statusQ.data?.blueprints_count ?? 0).toLocaleString("de-DE")}
          hint={`Letzter Sync: ${last}`}
          icon={Sparkles}
        />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-3 border border-brand/10 bg-background/50 px-4 py-2 text-xs">
        <Sparkles className="h-4 w-4 text-brand" />
        <span className="font-mono uppercase tracking-[0.25em] text-muted-foreground">
          Wiki-Katalog:
        </span>
        <span className="font-mono">
          {(statusQ.data?.blueprints_count ?? 0).toLocaleString("de-DE")} Blueprints
        </span>
        <span className="font-mono text-muted-foreground">· letzter Sync: {last}</span>
        {adminQ.data?.isAdmin && (
          <>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={rematchM.isPending}
            onClick={() => rematchM.mutate()}
            title="Verknüpft Inventar-Items per Wiki-UUID mit Blueprint-Zutaten"
          >
            <RefreshCw
              className={`mr-2 h-3 w-3 ${rematchM.isPending ? "animate-spin" : ""}`}
            />
            {rematchM.isPending ? "Matching…" : "Items neu verknüpfen"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={syncM.isPending}
            onClick={() => syncM.mutate()}
          >
            <RefreshCw
              className={`mr-2 h-3 w-3 ${syncM.isPending ? "animate-spin" : ""}`}
            />
            {syncM.isPending ? "Sync läuft…" : "Jetzt syncen"}
          </Button>
          </>
        )}
      </div>

      <StickyToolbar>
        {/* Row 1: search + toggles */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <Input
            placeholder="Suche…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 flex-1 min-w-[220px]"
          />
          <Button
            size="sm"
            variant={onlyCraftable ? "default" : "outline"}
            onClick={() => setOnlyCraftable((v) => !v)}
          >
            Nur herstellbar
          </Button>
          <Button
            size="sm"
            variant={onlyOwned ? "default" : "outline"}
            onClick={() => setOnlyOwned((v) => !v)}
          >
            Nur gesammelt
          </Button>
          <Button
            size="sm"
            variant={groupByCategory ? "default" : "outline"}
            onClick={() => setGroupByCategory((v) => !v)}
          >
            Gruppieren
          </Button>
          {activeFilterCount > 0 && (
            <Button size="sm" variant="ghost" onClick={resetFilters}>
              Zurücksetzen ({activeFilterCount})
            </Button>
          )}
        </div>

        {/* Row 2: source */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Quelle
          </span>
          <div className="flex flex-wrap gap-1">
            {(["all", "wiki", "manual"] as const).map((k) => (
              <Button
                key={k}
                size="sm"
                variant={source === k ? "default" : "outline"}
                onClick={() => setSource(k)}
              >
                {k === "all" ? "Alle" : k === "wiki" ? "Wiki" : "Manuell"}
              </Button>
            ))}
          </div>
        </div>

        {/* Row 3: category */}
        <div className="flex w-full flex-wrap items-center gap-2">
          <span className="w-20 shrink-0 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
            Kategorie
          </span>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="h-9 w-[320px] text-xs">
              <SelectValue placeholder="Alle Kategorien" />
            </SelectTrigger>
            <SelectContent className="max-h-[420px]">
              <SelectItem value="all">
                Alle Kategorien ({bps.length})
              </SelectItem>
              {groupedCategories.map(({ group, total, items }) => (
                <SelectGroup key={group}>
                  <SelectLabel className="font-mono text-[9px] uppercase tracking-[0.25em] text-brand/80">
                    {group} · {total}
                  </SelectLabel>
                  {items.map(([c, n]) => (
                    <SelectItem key={c} value={c}>
                      {c} ({n})
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
        </div>
      </StickyToolbar>

      {catQ.isLoading ? (
        <LoadingScreen
          label="Lade Blueprints"
          hint="// scanne wiki-katalog & inventar"
          cards={6}
        />
      ) : visibleBps.length === 0 ? (
        <div className="border border-brand/10 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          // keine treffer{" "}
          {(statusQ.data?.blueprints_count ?? 0) === 0 &&
            "— führe oben einen Sync aus"}
        </div>
      ) : grouped ? (
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <section key={cat} className="space-y-3">
              <h2 className="flex items-baseline gap-3 border-b border-brand/10 pb-1 font-display text-lg">
                {cat}
                <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  // {items.length}
                </span>
              </h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((b) => renderCard(b))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visibleBps.map((b) => renderCard(b))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Neue Blueprint</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-1">
              <Label>Item</Label>
              <Input
                value={form.item_name}
                onChange={(e) =>
                  setForm((f) => ({ ...f, item_name: e.target.value }))
                }
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label>Output-Menge</Label>
                <Input
                  type="number"
                  value={form.output_qty}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      output_qty: Number(e.target.value),
                    }))
                  }
                />
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
                    <SelectItem value="org">Orga</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              // bestandteile pflegst du im detail
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
            <Button
              onClick={async () => {
                try {
                  const r = await upFn({
                    data: {
                      item_name: form.item_name.trim(),
                      output_qty: form.output_qty,
                      visibility: form.visibility,
                      components: [],
                    },
                  });
                  toast.success("Angelegt");
                  setOpen(false);
                  qc.invalidateQueries({ queryKey: ["blueprints"] });
                  // jump to detail
                  window.location.href = `/blueprints/${r.id}`;
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Anlegen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!detailId}
        onOpenChange={(o) => !o && setDetailId(null)}
      >
        <DialogContent className="max-h-[92vh] max-w-6xl overflow-y-auto p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Blueprint-Details</DialogTitle>
          </DialogHeader>
          {detailId && (
            <BlueprintDetailView
              id={detailId}
              onClose={() => setDetailId(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!unmatched}
        onOpenChange={(o) => !o && setUnmatched(null)}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Nicht zuordenbare Blueprints ({unmatched?.length ?? 0})
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Diese Namen aus der Import-Datei konnten keinem Blueprint im Katalog zugeordnet werden. Du kannst sie ggf. manuell abhaken.
          </p>
          <div className="max-h-[50vh] overflow-y-auto rounded border border-brand/10 bg-background/50 p-3">
            <ul className="space-y-1 font-mono text-xs">
              {(unmatched ?? []).map((n) => (
                <li key={n}>· {n}</li>
              ))}
            </ul>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText((unmatched ?? []).join("\n"));
                toast.success("In Zwischenablage kopiert");
              }}
            >
              Liste kopieren
            </Button>
            <Button size="sm" onClick={() => setUnmatched(null)}>
              Schließen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}