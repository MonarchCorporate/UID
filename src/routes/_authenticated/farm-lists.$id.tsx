import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { toast } from "sonner";
import {
  ArrowLeft,
  Crown,
  Plus,
  Trash2,
  UserPlus,
  Sprout,
  CheckCircle2,
  Archive,
  Search,
  Package,
  Boxes,
  Hammer,
  Users,
  Pencil,
  X,
  Link2,
  Copy,
  RefreshCw,
  RotateCcw,
} from "lucide-react";
import {
  getFarmList,
  updateFarmList,
  deleteFarmList,
  addBlueprintToList,
  addBlueprintsToList,
  updateBlueprintQty,
  removeBlueprintFromList,
  searchBlueprintsForList,
  addContribution,
  deleteContribution,
  resetMaterialProgress,
  inviteFarmListMember,
  updateMemberRole,
  removeFarmListMember,
  rotateFarmListInvite,
  disableFarmListInvite,
  setFarmListInviteRole,
} from "@/lib/farm-lists.functions";
import { PageShell, StatusBadge, StatGrid, StatCard } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
import { formatQty } from "@/lib/units";

export const Route = createFileRoute("/_authenticated/farm-lists/$id")({
  component: FarmListDetailPage,
});

function FarmListDetailPage() {
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const nav = useNavigate();
  const getFn = useServerFn(getFarmList);
  const q = useQuery({ queryKey: ["farm-list", id], queryFn: () => getFn({ data: { id } }) });

  const updateFn = useServerFn(updateFarmList);
  const deleteFn = useServerFn(deleteFarmList);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["farm-list", id] });
    qc.invalidateQueries({ queryKey: ["farm-lists"] });
  };

  const setStatus = useMutation({
    mutationFn: (status: "active" | "completed" | "archived") =>
      updateFn({ data: { id, status } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleInv = useMutation({
    mutationFn: (v: boolean) => updateFn({ data: { id, include_personal_inventory: v } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleWh = useMutation({
    mutationFn: (v: boolean) => updateFn({ data: { id, include_org_warehouse: v } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Liste gelöscht");
      nav({ to: "/farm-lists" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (q.isLoading) {
    return (
      <PageShell title="Lade…">
        <LoadingScreen cards={3} />
      </PageShell>
    );
  }

  if (q.isError || !q.data) {
    return (
      <PageShell title="Liste nicht gefunden" description={(q.error as Error)?.message}>
        <Button asChild variant="outline">
          <Link to="/farm-lists"><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Link>
        </Button>
      </PageShell>
    );
  }

  const { list, blueprints, members, contributions, materials, can_edit } = q.data;

  const totalNeeded = materials.reduce((s, m) => s + m.needed, 0);
  const totalRemaining = materials.reduce((s, m) => s + m.remaining, 0);
  const totalFromInventory = materials.reduce((s, m) => s + m.inventory_qty + m.warehouse_qty, 0);
  const totalContributed = materials.reduce((s, m) => s + m.contributed_qty, 0);

  const statusBadge =
    list.status === "active" ? (
      <StatusBadge tone="emerald" icon={Sprout}>Aktiv</StatusBadge>
    ) : list.status === "completed" ? (
      <StatusBadge tone="brand" icon={CheckCircle2}>Fertig</StatusBadge>
    ) : (
      <StatusBadge tone="slate" icon={Archive}>Archiv</StatusBadge>
    );

  return (
    <PageShell
      eyebrow={list.is_owner ? "Eigene Liste" : `Geteilt von ${list.owner_callsign ?? "—"}`}
      title={
        <span className="flex items-center gap-3">
          {list.name}
          {statusBadge}
        </span>
      }
      description={list.description ?? undefined}
      actions={
        <>
          <Button asChild variant="outline" size="sm">
            <Link to="/farm-lists"><ArrowLeft className="mr-1 h-4 w-4" /> Zurück</Link>
          </Button>
          {list.can_manage && (
            <>
              {list.status !== "completed" && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate("completed")}>
                  <CheckCircle2 className="mr-1 h-4 w-4" /> Abschließen
                </Button>
              )}
              {list.status !== "active" && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate("active")}>
                  <Sprout className="mr-1 h-4 w-4" /> Reaktivieren
                </Button>
              )}
              {list.status !== "archived" && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate("archived")}>
                  <Archive className="mr-1 h-4 w-4" /> Archivieren
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                className="text-rose-300 hover:text-rose-200"
                disabled={del.isPending}
                onClick={() => (confirmDelete ? del.mutate() : setConfirmDelete(true))}
                onBlur={() => setConfirmDelete(false)}
              >
                <Trash2 className="mr-1 h-4 w-4" />{" "}
                {confirmDelete ? "Wirklich löschen?" : "Löschen"}
              </Button>
            </>
          )}
        </>
      }
    >
      <StatGrid cols={4}>
        <StatCard label="Materialien" value={materials.length} icon={Boxes} tone="brand" />
        <StatCard label="Benötigt gesamt" value={formatQty(totalNeeded, "pcs")} icon={Hammer} />
        <StatCard label="Verfügbar (Inv+Lager)" value={formatQty(totalFromInventory, "pcs")} tone="emerald" icon={Package} />
        <StatCard label="Noch zu farmen" value={formatQty(totalRemaining, "pcs")} tone={totalRemaining > 0 ? "amber" : "emerald"} icon={Sprout} hint={`${totalContributed > 0 ? `${formatQty(totalContributed, "pcs")} gefarmt` : ""}`} />
      </StatGrid>

      <div className="flex items-center justify-between gap-3 border border-brand/10 p-4">
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">Gesamtfortschritt</div>
          <Progress value={list.progress_pct} className="mt-2 h-2" />
        </div>
        <div className="font-display text-2xl tabular-nums text-brand">{list.progress_pct}%</div>
      </div>

      <Tabs defaultValue="materials" className="space-y-4">
        <TabsList>
          <TabsTrigger value="materials">Materialien</TabsTrigger>
          <TabsTrigger value="blueprints">Blueprints ({blueprints.length})</TabsTrigger>
          <TabsTrigger value="contributions">Beiträge ({contributions.length})</TabsTrigger>
          <TabsTrigger value="members">Mitglieder ({members.length + 1})</TabsTrigger>
          {list.is_owner && <TabsTrigger value="settings">Einstellungen</TabsTrigger>}
        </TabsList>

        <TabsContent value="materials">
          <MaterialsTab listId={id} materials={materials} canEdit={can_edit} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="blueprints">
          <BlueprintsTab listId={id} blueprints={blueprints} canEdit={can_edit} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="contributions">
          <ContributionsTab listId={id} contributions={contributions} canEdit={can_edit} onChanged={invalidate} />
        </TabsContent>
        <TabsContent value="members">
          <MembersTab
            listId={id}
            list={list}
            members={members}
            inviteToken={q.data.invite_token}
            inviteRole={q.data.invite_role}
            onChanged={invalidate}
          />
        </TabsContent>
        {list.is_owner && (
          <TabsContent value="settings">
            <div className="space-y-3 border border-brand/10 p-4">
              <SettingRow label="Privates Inventar berücksichtigen" hint="Eigene Bestände werden vom Bedarf abgezogen.">
                <Switch checked={list.include_personal_inventory} onCheckedChange={(v) => toggleInv.mutate(v)} />
              </SettingRow>
              <SettingRow label="Orgalager berücksichtigen" hint="Nicht-gesperrte Bestände werden vom Bedarf abgezogen.">
                <Switch checked={list.include_org_warehouse} onCheckedChange={(v) => toggleWh.mutate(v)} />
              </SettingRow>
            </div>
          </TabsContent>
        )}
      </Tabs>
    </PageShell>
  );
}

function SettingRow({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-brand/5 pb-3 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

/* ============================================================ */
/* Materials                                                    */
/* ============================================================ */

type Detail = Awaited<ReturnType<typeof getFarmList>>;
type Material = Detail["materials"][number];
type Contribution = Detail["contributions"][number];
type Member = Detail["members"][number];
type FarmListBlueprint = Detail["blueprints"][number];

function MaterialsTab({
  listId,
  materials,
  canEdit,
  onChanged,
}: {
  listId: string;
  materials: Material[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [contribFor, setContribFor] = useState<Material | null>(null);
  const resetFn = useServerFn(resetMaterialProgress);
  const reset = useMutation({
    mutationFn: (material_ref: string) =>
      resetFn({ data: { list_id: listId, material_ref, scope: "all" } }),
    onSuccess: () => {
      toast.success("Material wieder freigeschaltet");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (materials.length === 0) {
    return <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">// Noch keine Blueprints in der Liste — füge welche hinzu.</div>;
  }
  return (
    <>
      <div className="overflow-x-auto border border-brand/10">
        <table className="w-full text-sm">
          <thead className="border-b border-brand/10 bg-background/40 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Material</th>
              <th className="px-3 py-2 text-right">Benötigt</th>
              <th className="px-3 py-2 text-right">Inv.</th>
              <th className="px-3 py-2 text-right">Lager</th>
              <th className="px-3 py-2 text-right">Gefarmt</th>
              <th className="px-3 py-2 text-right">Rest</th>
              <th className="px-3 py-2 w-40">Fortschritt</th>
              {canEdit && <th className="px-3 py-2 w-1"></th>}
            </tr>
          </thead>
          <tbody>
            {materials.map((m) => {
              const done = m.remaining === 0;
              return (
                <tr key={m.material_ref} className="border-b border-brand/5 last:border-b-0">
                  <td className="px-3 py-2">
                    <Link
                      to="/materialien/$ref"
                      params={{ ref: m.item_ref ?? `name:${m.material_name}` }}
                      className="font-medium hover:text-brand"
                    >
                      {m.material_name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatQty(m.needed, m.unit)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.inventory_qty > 0 ? formatQty(m.inventory_qty, m.unit) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{m.warehouse_qty > 0 ? formatQty(m.warehouse_qty, m.unit) : "—"}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-emerald-300">{m.contributed_qty > 0 ? formatQty(m.contributed_qty, m.unit) : "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums font-semibold ${done ? "text-emerald-300" : "text-amber-300"}`}>{done ? "✓" : formatQty(m.remaining, m.unit)}</td>
                  <td className="px-3 py-2">
                    <Progress value={m.progress_pct} className="h-1.5" />
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setContribFor(m)} title="Beitrag eintragen">
                          <Plus className="h-3.5 w-3.5" />
                        </Button>
                        {m.contributed_qty > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={reset.isPending}
                            onClick={() => reset.mutate(m.material_ref)}
                            title="Abhaken rückgängig machen (eingetragene Beiträge löschen)"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-amber-300" />
                          </Button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {contribFor && (
        <ContributionDialog
          listId={listId}
          material={contribFor}
          onClose={() => setContribFor(null)}
          onDone={() => {
            setContribFor(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function ContributionDialog({
  listId,
  material,
  onClose,
  onDone,
}: {
  listId: string;
  material: Material;
  onClose: () => void;
  onDone: () => void;
}) {
  const fn = useServerFn(addContribution);
  const [qty, setQty] = useState<string>(String(material.remaining));
  const [quality, setQuality] = useState<string>("");
  const [note, setNote] = useState("");
  const m = useMutation({
    mutationFn: () =>
      fn({
        data: {
          list_id: listId,
          material_ref: material.material_ref,
          material_name: material.material_name,
          qty: Number(qty),
          quality: quality ? Number(quality) : null,
          note: note.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Beitrag eingetragen");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{material.material_name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Noch fehlt: <span className="text-foreground tabular-nums">{formatQty(material.remaining, material.unit)}</span> {material.unit}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Menge</Label>
              <Input type="number" min="0" step="any" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Qualität (optional)</Label>
              <Input type="number" min="0" max="1000" value={quality} onChange={(e) => setQuality(e.target.value)} placeholder="—" />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Notiz (optional)</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending || !qty || Number(qty) <= 0}>
            {m.isPending ? "…" : "Eintragen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/* Blueprints                                                   */
/* ============================================================ */

function BlueprintsTab({
  listId,
  blueprints,
  canEdit,
  onChanged,
}: {
  listId: string;
  blueprints: FarmListBlueprint[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const updateFn = useServerFn(updateBlueprintQty);
  const removeFn = useServerFn(removeBlueprintFromList);

  const update = useMutation({
    mutationFn: ({ id, quantity }: { id: string; quantity: number }) =>
      updateFn({ data: { id, quantity } }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Blueprint entfernt");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> Blueprint hinzufügen
          </Button>
        </div>
      )}
      {blueprints.length === 0 ? (
        <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">// Noch keine Blueprints in der Liste.</div>
      ) : (
        <ul className="divide-y divide-brand/10 border border-brand/10">
          {blueprints.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <Link to="/blueprints/$id" params={{ id: b.blueprint_id }} className="font-medium hover:text-brand">{b.blueprint_name}</Link>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Output: {b.output_qty} pro Craft</div>
              </div>
              {canEdit ? (
                <Input
                  type="number"
                  min="1"
                  step="1"
                  className="w-20 text-right"
                  defaultValue={b.quantity}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v > 0 && v !== b.quantity) update.mutate({ id: b.id, quantity: v });
                  }}
                />
              ) : (
                <span className="w-20 text-right tabular-nums">×{b.quantity}</span>
              )}
              {canEdit && (
                <Button size="sm" variant="ghost" onClick={() => remove.mutate(b.id)}>
                  <Trash2 className="h-4 w-4 text-rose-300" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      {addOpen && (
        <AddBlueprintDialog
          listId={listId}
          existingIds={blueprints.map((b) => b.blueprint_id)}
          onClose={() => setAddOpen(false)}
          onAdded={() => {
            setAddOpen(false);
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function AddBlueprintDialog({
  listId,
  existingIds,
  onClose,
  onAdded,
}: {
  listId: string;
  existingIds: string[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [search, setSearch] = useState("");
  const searchFn = useServerFn(searchBlueprintsForList);
  const addFn = useServerFn(addBlueprintToList);
  const addManyFn = useServerFn(addBlueprintsToList);
  const q = useQuery({
    queryKey: ["farm-list-bp-search", search],
    queryFn: () => searchFn({ data: { search } }),
  });
  const [qty, setQty] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Record<string, boolean>>({});

  const add = useMutation({
    mutationFn: (args: { blueprint_id: string; quantity: number }) =>
      addFn({ data: { list_id: listId, ...args } }),
    onSuccess: () => {
      toast.success("Blueprint hinzugefügt");
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const selectedIds = Object.keys(selected).filter((k) => selected[k]);
  const addMany = useMutation({
    mutationFn: () =>
      addManyFn({
        data: {
          list_id: listId,
          items: selectedIds.map((id) => ({
            blueprint_id: id,
            quantity: Math.max(1, Number(qty[id] ?? "1") || 1),
          })),
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.count} Blueprints hinzugefügt`);
      onAdded();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const existing = new Set(existingIds);
  const visible = q.data?.blueprints ?? [];
  const allSelected = visible.length > 0 && visible.every((b) => selected[b.id]);

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Blueprints hinzufügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input autoFocus placeholder="Blueprint suchen…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div className="flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={allSelected}
                onCheckedChange={(v) => {
                  const on = v === true;
                  setSelected((p) => {
                    const next = { ...p };
                    for (const b of visible) next[b.id] = on;
                    return next;
                  });
                }}
              />
              Alle sichtbaren auswählen
            </label>
            <span>{selectedIds.length} ausgewählt</span>
          </div>
          <div className="max-h-[50vh] overflow-y-auto border border-brand/10">
            {q.isLoading ? (
              <div className="p-6 text-center font-mono text-xs text-muted-foreground">// lade…</div>
            ) : visible.length === 0 ? (
              <div className="p-6 text-center font-mono text-xs text-muted-foreground">// keine Treffer</div>
            ) : (
              <ul className="divide-y divide-brand/10">
                {visible.map((b) => {
                  const inList = existing.has(b.id);
                  const v = qty[b.id] ?? "1";
                  return (
                    <li key={b.id} className="flex items-center gap-2 px-3 py-2">
                      <Checkbox
                        checked={!!selected[b.id]}
                        onCheckedChange={(c) =>
                          setSelected((p) => ({ ...p, [b.id]: c === true }))
                        }
                      />
                      <div className="min-w-0 flex-1 truncate text-sm">{b.name}</div>
                      {inList && (
                        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand/70">
                          in Liste
                        </span>
                      )}
                      <Input
                        type="number"
                        min="1"
                        className="w-16 text-right"
                        value={v}
                        onChange={(e) => setQty((p) => ({ ...p, [b.id]: e.target.value }))}
                      />
                      <Button
                        size="sm"
                        disabled={add.isPending || Number(v) <= 0}
                        variant={inList ? "outline" : "default"}
                        onClick={() => add.mutate({ blueprint_id: b.id, quantity: Number(v) })}
                      >
                        {inList ? "Update" : <><Plus className="mr-1 h-3 w-3" /> Add</>}
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Schließen</Button>
          <Button
            disabled={selectedIds.length === 0 || addMany.isPending}
            onClick={() => addMany.mutate()}
          >
            <Plus className="mr-1 h-4 w-4" />
            {selectedIds.length > 0 ? `${selectedIds.length} hinzufügen` : "Hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/* Contributions                                                */
/* ============================================================ */

function ContributionsTab({
  listId: _listId,
  contributions,
  canEdit,
  onChanged,
}: {
  listId: string;
  contributions: Contribution[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const delFn = useServerFn(deleteContribution);
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Eintrag gelöscht");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (contributions.length === 0) {
    return <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">// Noch keine Beiträge eingetragen.</div>;
  }
  return (
    <ul className="divide-y divide-brand/10 border border-brand/10">
      {contributions.map((c) => (
        <li key={c.id} className="flex items-center gap-3 px-4 py-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-sm">{c.material_name}</span>
              {c.quality !== null && (
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Q{c.quality}</span>
              )}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {c.user_callsign ?? "—"} · {format(new Date(c.created_at), "dd.MM. HH:mm", { locale: de })}
              {c.note && <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">„{c.note}"</span>}
            </div>
          </div>
          <div className="tabular-nums text-emerald-300">+{formatQty(c.qty, "pcs")}</div>
          {canEdit && (
            <Button size="sm" variant="ghost" onClick={() => del.mutate(c.id)}>
              <X className="h-4 w-4 text-rose-300" />
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}

/* ============================================================ */
/* Members                                                      */
/* ============================================================ */

function MembersTab({
  listId,
  list,
  members,
  inviteToken,
  inviteRole,
  onChanged,
}: {
  listId: string;
  list: Detail["list"];
  members: Member[];
  inviteToken: string | null;
  inviteRole: "viewer" | "editor";
  onChanged: () => void;
}) {
  const inviteFn = useServerFn(inviteFarmListMember);
  const roleFn = useServerFn(updateMemberRole);
  const removeFn = useServerFn(removeFarmListMember);
  const rotateFn = useServerFn(rotateFarmListInvite);
  const disableFn = useServerFn(disableFarmListInvite);
  const setRoleFn = useServerFn(setFarmListInviteRole);

  const [callsign, setCallsign] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");

  const invite = useMutation({
    mutationFn: () => inviteFn({ data: { list_id: listId, callsign: callsign.trim(), role } }),
    onSuccess: (r) => {
      toast.success(`${r.callsign} eingeladen`);
      setCallsign("");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const changeRole = useMutation({
    mutationFn: (args: { user_id: string; role: "viewer" | "editor" }) =>
      roleFn({ data: { list_id: listId, ...args } }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (user_id: string) => removeFn({ data: { list_id: listId, user_id } }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  const rotate = useMutation({
    mutationFn: () => rotateFn({ data: { list_id: listId } }),
    onSuccess: () => {
      toast.success("Neuer Einladungslink erstellt");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const disable = useMutation({
    mutationFn: () => disableFn({ data: { list_id: listId } }),
    onSuccess: () => {
      toast.success("Einladungslink deaktiviert");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const changeInviteRole = useMutation({
    mutationFn: (r: "viewer" | "editor") => setRoleFn({ data: { list_id: listId, role: r } }),
    onSuccess: () => onChanged(),
    onError: (e: Error) => toast.error(e.message),
  });

  const inviteUrl =
    inviteToken && typeof window !== "undefined"
      ? `${window.location.origin}/farm-lists/join/${inviteToken}`
      : null;

  const copyLink = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      toast.success("Link kopiert");
    } catch {
      toast.error("Konnte nicht kopieren");
    }
  };

  return (
    <div className="space-y-4">
      {list.is_owner && (
        <div className="space-y-3 border border-brand/10 p-4">
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-brand" />
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Einladungslink
            </div>
          </div>
          {inviteUrl ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={inviteUrl} className="flex-1 min-w-[240px] font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
                <Button size="sm" onClick={copyLink}>
                  <Copy className="mr-1 h-4 w-4" /> Kopieren
                </Button>
                <Button size="sm" variant="outline" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
                  <RefreshCw className="mr-1 h-4 w-4" /> Neu
                </Button>
                <Button size="sm" variant="ghost" className="text-rose-300" onClick={() => disable.mutate()} disabled={disable.isPending}>
                  Deaktivieren
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Rolle für Beitretende</Label>
                <Select value={inviteRole} onValueChange={(v) => changeInviteRole.mutate(v as "viewer" | "editor")}>
                  <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="editor">Editor</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <p className="font-mono text-[10px] text-muted-foreground">
                // Jeder mit diesem Link kann beitreten. „Neu" macht alte Links ungültig.
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm text-muted-foreground">Kein aktiver Einladungslink.</p>
              <Button size="sm" onClick={() => rotate.mutate()} disabled={rotate.isPending}>
                <Link2 className="mr-1 h-4 w-4" /> Link erzeugen
              </Button>
            </div>
          )}
        </div>
      )}

      {list.is_owner && (
        <form
          className="flex flex-wrap items-end gap-2 border border-brand/10 p-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (callsign.trim()) invite.mutate();
          }}
        >
          <div className="flex-1 min-w-[200px] space-y-1">
            <Label>Callsign (nur eigene Orga)</Label>
            <Input value={callsign} onChange={(e) => setCallsign(e.target.value)} placeholder="z.B. PILOT01" />
          </div>
          <div className="space-y-1">
            <Label>Rolle</Label>
            <Select value={role} onValueChange={(v) => setRole(v as "viewer" | "editor")}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Editor</SelectItem>
                <SelectItem value="viewer">Viewer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" disabled={invite.isPending || !callsign.trim()}>
            <UserPlus className="mr-1 h-4 w-4" /> Einladen
          </Button>
        </form>
      )}

      <ul className="divide-y divide-brand/10 border border-brand/10">
        <li className="flex items-center gap-3 px-4 py-2">
          <Crown className="h-4 w-4 text-brand" />
          <div className="min-w-0 flex-1">
            <div className="text-sm">{list.owner_callsign ?? "—"}</div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Ersteller</div>
          </div>
        </li>
        {members.map((m) => (
          <li key={m.user_id} className="flex items-center gap-3 px-4 py-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">{m.callsign ?? m.display_name ?? "—"}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">seit {format(new Date(m.created_at), "dd.MM.yyyy", { locale: de })}</div>
            </div>
            {m.status === "pending" && <StatusBadge tone="amber">Pending</StatusBadge>}
            {list.is_owner ? (
              <Select value={m.role} onValueChange={(v) => changeRole.mutate({ user_id: m.user_id, role: v as "viewer" | "editor" })}>
                <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            ) : (
              <StatusBadge tone={m.role === "editor" ? "brand" : "slate"}>{m.role}</StatusBadge>
            )}
            {list.is_owner && (
              <Button size="sm" variant="ghost" onClick={() => remove.mutate(m.user_id)}>
                <Trash2 className="h-4 w-4 text-rose-300" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}