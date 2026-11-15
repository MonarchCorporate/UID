import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  addTemplateStation,
  deleteLoadoutTemplate,
  ensureTemplate,
  getTemplateWithStations,
  listAllShipsWithAdminTemplates,
  previewFleetyardsStations,
  removeTemplateStation,
  reorderTemplateStations,
  seedTemplateFromFleetyards,
  updateTemplateStation,
} from "@/lib/loadouts.functions";

export type Scope = "admin" | "user";
export type EditorTarget = { scope: Scope; ship_slug: string; ship_name: string };

export type StationRow = {
  id: string;
  slot_key: string;
  label: string;
  hardpoint_name: string | null;
  category: string | null;
  notes: string | null;
  sort_order: number;
};

export function AdminShipsList({ onEdit }: { onEdit: (t: EditorTarget) => void }) {
  const fn = useServerFn(listAllShipsWithAdminTemplates);
  const { data, isLoading, error } = useQuery({ queryKey: ["loadouts-admin"], queryFn: () => fn() });
  const [filter, setFilter] = useState("");

  if (isLoading) return <p className="text-muted-foreground">Lade…</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;

  const ships = (data?.ships ?? []) as Array<{ slug: string; name: string; manufacturer: string | null; classification: string | null; focus: string | null }>;
  const tpls = new Set(((data?.templates ?? []) as Array<{ ship_slug: string }>).map((t) => t.ship_slug));
  const q = filter.trim().toLowerCase();
  const filtered = q ? ships.filter((s) => s.name.toLowerCase().includes(q) || (s.manufacturer ?? "").toLowerCase().includes(q)) : ships;

  return (
    <div className="space-y-3">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Suchen…"
        className="w-full max-w-sm border border-white/10 bg-background/60 px-3 py-2 text-sm"
      />
      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map((s) => {
          const has = tpls.has(s.slug);
          return (
            <div key={s.slug} className="border border-white/10 hover:border-brand p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-base truncate">{s.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
                  {s.manufacturer ?? "—"} · {s.classification ?? "—"}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className={`px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border ${has ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10" : "border-white/10 text-muted-foreground"}`}>
                  {has ? "Admin-Tpl" : "Default"}
                </span>
                <button
                  onClick={() => onEdit({ scope: "admin", ship_slug: s.slug, ship_name: s.name })}
                  className="px-3 py-1.5 border border-brand text-brand text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand hover:text-primary-foreground"
                >
                  Bearbeiten
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function TemplateEditor({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const qc = useQueryClient();
  const get = useServerFn(getTemplateWithStations);
  const ensure = useServerFn(ensureTemplate);
  const seedFy = useServerFn(seedTemplateFromFleetyards);
  const previewFy = useServerFn(previewFleetyardsStations);
  const add = useServerFn(addTemplateStation);
  const upd = useServerFn(updateTemplateStation);
  const del = useServerFn(removeTemplateStation);
  const reorder = useServerFn(reorderTemplateStations);
  const drop = useServerFn(deleteLoadoutTemplate);

  const key = ["loadout-tpl", target.scope, target.ship_slug] as const;
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => get({ data: { scope: target.scope, ship_slug: target.ship_slug } }),
  });
  const previewQ = useQuery({
    queryKey: ["fy-preview", target.ship_slug],
    queryFn: () => previewFy({ data: { ship_slug: target.ship_slug } }),
    enabled: !data?.template,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["loadouts-mine"] });
    qc.invalidateQueries({ queryKey: ["loadouts-admin"] });
  };

  const ensureMut = useMutation({
    mutationFn: () => ensure({ data: { scope: target.scope, ship_slug: target.ship_slug } }),
    onSuccess: () => invalidate(),
  });
  const seedMut = useMutation({
    mutationFn: async () => {
      const tplId = data?.template?.id ?? (await ensureMut.mutateAsync()).template_id;
      return seedFy({ data: { template_id: tplId } });
    },
    onSuccess: () => invalidate(),
  });
  const addMut = useMutation({
    mutationFn: async (input: { label: string; category: string }) => {
      const tplId = data?.template?.id ?? (await ensureMut.mutateAsync()).template_id;
      return add({ data: { template_id: tplId, label: input.label, category: input.category } });
    },
    onSuccess: () => invalidate(),
  });
  const updMut = useMutation({
    mutationFn: (input: { station_id: string; label?: string; category?: string; notes?: string | null; slot_key?: string }) => upd({ data: input }),
    onSuccess: () => invalidate(),
  });
  const delMut = useMutation({
    mutationFn: (station_id: string) => del({ data: { station_id } }),
    onSuccess: () => invalidate(),
  });
  const reorderMut = useMutation({
    mutationFn: (input: { template_id: string; ordered_ids: string[] }) => reorder({ data: input }),
    onSuccess: () => invalidate(),
  });
  const dropMut = useMutation({
    mutationFn: (template_id: string) => drop({ data: { template_id } }),
    onSuccess: () => invalidate(),
  });

  const stations: StationRow[] = useMemo(() => {
    if (data?.template) return (data.stations ?? []) as StationRow[];
    return (previewQ.data?.stations ?? []).map((s, i) => ({
      id: `preview-${i}`,
      slot_key: s.slot_key,
      label: s.label,
      hardpoint_name: s.hardpoint_name,
      category: s.category,
      notes: null,
      sort_order: s.sort_order,
    }));
  }, [data, previewQ.data]);

  const hasTemplate = !!data?.template;
  const templateId = data?.template?.id;

  const move = (idx: number, dir: -1 | 1) => {
    if (!templateId) return;
    const next = [...stations];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    reorderMut.mutate({ template_id: templateId, ordered_ids: next.map((s) => s.id) });
  };

  return (
    <div className="fixed inset-0 z-[100] bg-background/80 backdrop-blur-sm flex items-start justify-center overflow-y-auto pt-28 pb-12 px-4">
      <div className="w-full max-w-4xl border border-brand/40 bg-background p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              {target.scope === "admin" ? "// Admin-Default" : "// Eigene Vorlage"}
            </div>
            <h2 className="font-display text-2xl mt-1">{target.ship_name}</h2>
            <div className="font-mono text-[10px] text-muted-foreground mt-1">{target.ship_slug}</div>
          </div>
          <button onClick={onClose} className="px-3 py-1.5 border border-white/20 text-xs uppercase tracking-[0.2em] hover:border-brand">Schließen</button>
        </div>

        {isLoading && <p className="text-muted-foreground">Lade…</p>}

        {!isLoading && (
          <>
            {!hasTemplate && (
              <div className="border border-amber-400/30 bg-amber-400/5 p-3 text-sm">
                Noch keine Vorlage vorhanden. Unten siehst du die <strong>Vorschau aus Fleetyards</strong> (schreibgeschützt). Klicke <strong>„Vorlage erstellen &amp; bearbeiten"</strong>, um sie zu übernehmen und Bezeichnungen, Stationen und Reihenfolge zu ändern.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!hasTemplate ? (
                <button
                  onClick={() => seedMut.mutate()}
                  disabled={seedMut.isPending || ensureMut.isPending}
                  className="px-4 py-2 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand/80 disabled:opacity-50"
                >
                  {seedMut.isPending ? "Erstelle…" : "Vorlage erstellen & bearbeiten"}
                </button>
              ) : (
                <button
                  onClick={() => { if (confirm("Vorlage komplett aus Fleetyards neu befüllen? Eigene Änderungen gehen verloren.")) seedMut.mutate(); }}
                  disabled={seedMut.isPending}
                  className="px-4 py-2 border border-brand text-brand text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand hover:text-primary-foreground disabled:opacity-50"
                >
                  Aus Fleetyards neu befüllen
                </button>
              )}
              {hasTemplate && (
                <button
                  onClick={() => { if (confirm("Vorlage löschen? Fällt auf nächste Ebene zurück.")) dropMut.mutate(templateId!); }}
                  className="px-4 py-2 border border-destructive text-destructive text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-destructive hover:text-destructive-foreground ml-auto"
                >
                  Vorlage löschen
                </button>
              )}
            </div>

            <div className="border border-white/10 divide-y divide-white/10">
              {stations.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">Keine Stationen.</div>
              )}
              {stations.map((s, idx) => (
                <StationEditorRow
                  key={s.id}
                  station={s}
                  readOnly={!hasTemplate}
                  isFirst={idx === 0}
                  isLast={idx === stations.length - 1}
                  onMoveUp={() => move(idx, -1)}
                  onMoveDown={() => move(idx, 1)}
                  onSave={(patch) => updMut.mutate({ station_id: s.id, ...patch })}
                  onDelete={() => delMut.mutate(s.id)}
                />
              ))}
            </div>

            {hasTemplate ? (
              <AddStationForm onAdd={(label, category) => addMut.mutate({ label, category })} pending={addMut.isPending} />
            ) : (
              <button
                onClick={() => ensureMut.mutate()}
                disabled={ensureMut.isPending}
                className="w-full border border-dashed border-white/15 p-3 text-xs text-muted-foreground hover:border-brand hover:text-brand disabled:opacity-50"
              >
                {ensureMut.isPending ? "…" : "Leere Vorlage anlegen (ohne Fleetyards-Stationen)"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function StationEditorRow({
  station,
  readOnly,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onSave,
  onDelete,
}: {
  station: StationRow;
  readOnly: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onSave: (patch: { label?: string; category?: string; notes?: string | null; slot_key?: string }) => void;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(station.label);
  const [category, setCategory] = useState(station.category ?? "seat");
  const [notes, setNotes] = useState(station.notes ?? "");
  const [slot, setSlot] = useState(station.slot_key);
  const dirty =
    label !== station.label ||
    category !== (station.category ?? "seat") ||
    notes !== (station.notes ?? "") ||
    slot !== station.slot_key;

  return (
    <div className="p-3 grid grid-cols-1 md:grid-cols-[auto_1fr_140px_140px_auto] gap-2 items-start">
      <div className="flex md:flex-col gap-1">
        <button disabled={readOnly || isFirst} onClick={onMoveUp} className="px-2 py-1 border border-white/10 text-xs disabled:opacity-30 hover:border-brand">↑</button>
        <button disabled={readOnly || isLast} onClick={onMoveDown} className="px-2 py-1 border border-white/10 text-xs disabled:opacity-30 hover:border-brand">↓</button>
      </div>
      <div className="space-y-2">
        <input disabled={readOnly} value={label} onChange={(e) => setLabel(e.target.value)} className="w-full border border-white/10 bg-background/60 px-2 py-1.5 text-sm" placeholder="Bezeichnung" />
        <input disabled={readOnly} value={slot} onChange={(e) => setSlot(e.target.value)} className="w-full border border-white/10 bg-background/60 px-2 py-1 font-mono text-[11px] text-muted-foreground" placeholder="slot_key" />
        <textarea disabled={readOnly} value={notes} onChange={(e) => setNotes(e.target.value)} rows={1} className="w-full border border-white/10 bg-background/60 px-2 py-1 text-xs" placeholder="Notizen" />
      </div>
      <input disabled={readOnly} value={category} onChange={(e) => setCategory(e.target.value)} className="border border-white/10 bg-background/60 px-2 py-1.5 text-sm" placeholder="Kategorie" />
      <div className="font-mono text-[10px] text-muted-foreground truncate">{station.hardpoint_name ?? "—"}</div>
      <div className="flex gap-1">
        <button
          disabled={readOnly || !dirty}
          onClick={() => onSave({ label, category, notes: notes || null, slot_key: slot })}
          className="px-2 py-1 border border-brand text-brand text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-primary-foreground disabled:opacity-40"
        >
          Speichern
        </button>
        <button
          disabled={readOnly}
          onClick={() => { if (confirm("Station entfernen?")) onDelete(); }}
          className="px-2 py-1 border border-destructive text-destructive text-[10px] uppercase tracking-[0.2em] hover:bg-destructive hover:text-destructive-foreground disabled:opacity-40"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

function AddStationForm({ onAdd, pending }: { onAdd: (label: string, category: string) => void; pending: boolean }) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("seat");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!label.trim()) return;
        onAdd(label.trim(), category.trim() || "seat");
        setLabel("");
      }}
      className="flex flex-wrap gap-2 items-center border border-dashed border-white/15 p-3"
    >
      <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Neue Bezeichnung" className="flex-1 min-w-[200px] border border-white/10 bg-background/60 px-2 py-1.5 text-sm" />
      <input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="Kategorie" className="w-32 border border-white/10 bg-background/60 px-2 py-1.5 text-sm" />
      <button type="submit" disabled={pending || !label.trim()} className="px-3 py-1.5 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand/80 disabled:opacity-50">
        + Hinzufügen
      </button>
    </form>
  );
}