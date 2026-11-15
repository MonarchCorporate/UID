import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  TemplateEditor,
  type EditorTarget,
} from "@/components/loadouts/LoadoutAdmin";
import {
  getEffectiveDefaultStations,
  listAllShipsWithAdminTemplates,
  updateEffectiveStationLabel,
} from "@/lib/loadouts.functions";

export const Route = createFileRoute("/_authenticated/admin/global-loadouts")({
  component: GlobalLoadoutsAdminPage,
});

function GlobalLoadoutsAdminPage() {
  const [target, setTarget] = useState<EditorTarget | null>(null);
  const qc = useQueryClient();
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
          <Link
            to="/admin"
            className="mb-6 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
          >
            ← Admin-Übersicht
          </Link>
          <h1 className="font-display text-4xl">Global Loadouts</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-2xl">
            Default-Loadouts pro Schiff verwalten — die hier aufgelisteten Stationen
            werden vom Boardcomputer beim Start einer Session geladen. Lade-Reihenfolge:{" "}
            <strong>Eigenes User-Loadout</strong> &rsaquo;{" "}
            <strong>Admin-Default</strong> &rsaquo; <strong>Fleetyards</strong>.
            Eigene Loadouts der Spieler werden nie durch Defaults überschrieben.
          </p>
          <div className="mt-8">
            <AdminShipsAccordion onEdit={setTarget} />
          </div>
          {target && (
            <TemplateEditor
              target={target}
              onClose={() => {
                qc.invalidateQueries({ queryKey: ["effective-stations", target.ship_slug] });
                qc.invalidateQueries({ queryKey: ["loadouts-admin"] });
                setTarget(null);
              }}
            />
          )}
    </div>
  );
}

function AdminShipsAccordion({ onEdit }: { onEdit: (t: EditorTarget) => void }) {
  const fn = useServerFn(listAllShipsWithAdminTemplates);
  const { data, isLoading, error } = useQuery({
    queryKey: ["loadouts-admin"],
    queryFn: () => fn(),
  });
  const [filter, setFilter] = useState("");
  const [openSlug, setOpenSlug] = useState<string | null>(null);

  if (isLoading) return <p className="text-muted-foreground">Lade…</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;

  const ships = (data?.ships ?? []) as Array<{
    slug: string;
    name: string;
    manufacturer: string | null;
    classification: string | null;
    focus: string | null;
  }>;
  const tpls = new Set(
    ((data?.templates ?? []) as Array<{ ship_slug: string }>).map((t) => t.ship_slug),
  );
  const q = filter.trim().toLowerCase();
  const filtered = q
    ? ships.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          (s.manufacturer ?? "").toLowerCase().includes(q),
      )
    : ships;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Suchen…"
          className="w-full max-w-sm border border-white/10 bg-background/60 px-3 py-2 text-sm"
        />
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          {filtered.length} / {ships.length}
        </div>
      </div>
      <div className="divide-y divide-white/5 border border-white/10">
        {filtered.map((s) => (
          <ShipRow
            key={s.slug}
            ship={s}
            hasAdminTpl={tpls.has(s.slug)}
            isOpen={openSlug === s.slug}
            onToggle={() => setOpenSlug(openSlug === s.slug ? null : s.slug)}
            onEdit={() => onEdit({ scope: "admin", ship_slug: s.slug, ship_name: s.name })}
          />
        ))}
      </div>
    </div>
  );
}

function ShipRow({
  ship,
  hasAdminTpl,
  isOpen,
  onToggle,
  onEdit,
}: {
  ship: { slug: string; name: string; manufacturer: string | null; classification: string | null };
  hasAdminTpl: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onEdit: () => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3 p-3 hover:bg-white/[0.02]">
        <button onClick={onToggle} className="flex-1 min-w-0 text-left flex items-center gap-3">
          <span className="font-mono text-brand text-xs w-4 shrink-0">{isOpen ? "▾" : "▸"}</span>
          <span className="min-w-0">
            <span className="block font-display text-base truncate">{ship.name}</span>
            <span className="block font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
              {ship.manufacturer ?? "—"} · {ship.classification ?? "—"}
            </span>
          </span>
        </button>
        <span
          className={`shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border ${
            hasAdminTpl
              ? "border-emerald-400/50 text-emerald-300 bg-emerald-400/10"
              : "border-white/10 text-muted-foreground"
          }`}
        >
          {hasAdminTpl ? "Admin-Tpl" : "Fleetyards"}
        </span>
        <button
          onClick={onEdit}
          className="shrink-0 px-3 py-1.5 border border-brand text-brand text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand hover:text-primary-foreground"
        >
          Bearbeiten
        </button>
      </div>
      {isOpen && <StationsPanel shipSlug={ship.slug} />}
    </div>
  );
}

function StationsPanel({ shipSlug }: { shipSlug: string }) {
  const fn = useServerFn(getEffectiveDefaultStations);
  const updateLabel = useServerFn(updateEffectiveStationLabel);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["effective-stations", shipSlug],
    queryFn: () => fn({ data: { ship_slug: shipSlug } }),
  });
  const mut = useMutation({
    mutationFn: (input: { slot_key: string; label: string }) =>
      updateLabel({ data: { ship_slug: shipSlug, ...input } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["effective-stations", shipSlug] });
      qc.invalidateQueries({ queryKey: ["loadouts-admin"] });
    },
  });

  return (
    <div className="border-t border-white/5 bg-background/40 p-4">
      {isLoading && <p className="text-xs text-muted-foreground">Lade Stationen…</p>}
      {error && <p className="text-xs text-destructive">{(error as Error).message}</p>}
      {data && (
        <>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Quelle: {data.source === "admin" ? "Admin-Template" : "Fleetyards"} · {data.stations.length} Station{data.stations.length === 1 ? "" : "en"}
            {data.source === "fleetyards" && data.stations.length > 0 && (
              <span className="ml-2 normal-case tracking-normal text-muted-foreground/70">
                — beim ersten Speichern wird automatisch ein Admin-Template angelegt.
              </span>
            )}
          </div>
          {data.stations.length === 0 ? (
            <p className="text-xs text-muted-foreground">Keine Stationen.</p>
          ) : (
            <div className="border border-white/5">
              <div className="grid grid-cols-[40px_1fr_140px_1fr_90px] gap-2 px-3 py-2 border-b border-white/5 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                <span>#</span>
                <span>Bezeichnung</span>
                <span>Kategorie</span>
                <span>Hardpoint</span>
                <span></span>
              </div>
              {data.stations.map((s, i) => (
                <EditableStationRow
                  key={s.slot_key + i}
                  index={i}
                  station={s}
                  pending={mut.isPending}
                  onSave={(label) => mut.mutate({ slot_key: s.slot_key, label })}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function EditableStationRow({
  index,
  station,
  pending,
  onSave,
}: {
  index: number;
  station: { slot_key: string; label: string; category: string | null; hardpoint_name: string | null };
  pending: boolean;
  onSave: (label: string) => void;
}) {
  const [value, setValue] = useState(station.label);
  useEffect(() => setValue(station.label), [station.label]);
  const dirty = value.trim().length > 0 && value !== station.label;
  return (
    <div className="grid grid-cols-[40px_1fr_140px_1fr_90px] gap-2 px-3 py-1.5 text-sm border-b border-white/5 last:border-0 items-center">
      <span className="font-mono text-[10px] text-brand">{index + 1}</span>
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="w-full border border-white/10 bg-background/60 px-2 py-1 text-sm focus:border-brand outline-none"
      />
      <span className="font-mono text-[10px] text-muted-foreground truncate">{station.category ?? "—"}</span>
      <span className="font-mono text-[10px] text-muted-foreground truncate">{station.hardpoint_name ?? "—"}</span>
      <button
        disabled={!dirty || pending}
        onClick={() => onSave(value.trim())}
        className="px-2 py-1 border border-brand text-brand text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-primary-foreground disabled:opacity-40"
      >
        {pending ? "…" : "Speichern"}
      </button>
    </div>
  );
}