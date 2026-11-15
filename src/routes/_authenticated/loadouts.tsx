import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  getMyRoles,
  listMyShipsWithTemplates,
} from "@/lib/loadouts.functions";
import {
  AdminShipsList,
  TemplateEditor,
  type EditorTarget,
} from "@/components/loadouts/LoadoutAdmin";

export const Route = createFileRoute("/_authenticated/loadouts")({
  component: LoadoutsPage,
});

function LoadoutsPage() {
  const rolesFn = useServerFn(getMyRoles);
  const { data: roles } = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isAdmin = !!roles?.isAdmin;

  const [tab, setTab] = useState<"mine" | "admin">("mine");
  const [target, setTarget] = useState<EditorTarget | null>(null);

  return (
    <section className="mx-auto max-w-7xl px-6">
      <div className="mb-8">
        <div className="mb-3 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // Loadouts
          </div>
        </div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tight">Schiff-Loadouts</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Stationen, Bezeichnungen und Reihenfolge pro Schiff verwalten. Reihenfolge der Wirksamkeit pro Boardcomputer-Session: <strong>Eigene Vorlage</strong> &rsaquo; <strong>Admin-Default</strong> &rsaquo; <strong>Fleetyards</strong>.
        </p>
      </div>

      <div className="mb-6 flex gap-2 border-b border-white/10">
        <TabButton active={tab === "mine"} onClick={() => setTab("mine")}>Eigene Schiffe</TabButton>
        {isAdmin && (
          <TabButton active={tab === "admin"} onClick={() => setTab("admin")}>Admin-Defaults</TabButton>
        )}
      </div>

      {tab === "mine" && <MyShipsList onEdit={setTarget} />}
      {tab === "admin" && isAdmin && <AdminShipsList onEdit={setTarget} />}

      {target && <TemplateEditor target={target} onClose={() => setTarget(null)} />}
    </section>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-mono text-[10px] uppercase tracking-[0.3em] border-b-2 -mb-px transition ${
        active ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-brand"
      }`}
    >
      {children}
    </button>
  );
}

function MyShipsList({ onEdit }: { onEdit: (t: EditorTarget) => void }) {
  const fn = useServerFn(listMyShipsWithTemplates);
  const { data, isLoading, error } = useQuery({ queryKey: ["loadouts-mine"], queryFn: () => fn() });

  if (isLoading) return <p className="text-muted-foreground">Lade…</p>;
  if (error) return <p className="text-destructive">{(error as Error).message}</p>;
  const ships = (data?.ships ?? []) as Array<{ id: string; ship_slug: string | null; ship_name: string; manufacturer: string | null; custom_name: string | null }>;
  const tpls = (data?.templates ?? []) as Array<{ id: string; scope: string; user_id: string | null; ship_slug: string }>;
  if (ships.length === 0) {
    return <p className="text-sm text-muted-foreground">Keine Schiffe in deiner Flotte. Lege sie zuerst unter „Flotte" an.</p>;
  }

  const grouped = new Map<string, { ship: typeof ships[number]; count: number }>();
  for (const s of ships) {
    if (!s.ship_slug) continue;
    const ex = grouped.get(s.ship_slug);
    if (ex) ex.count += 1;
    else grouped.set(s.ship_slug, { ship: s, count: 1 });
  }

  return (
    <div className="grid gap-3 md:grid-cols-2">
      {Array.from(grouped.values()).map(({ ship, count }) => {
        const slug = ship.ship_slug!;
        const userTpl = tpls.find((t) => t.scope === "user" && t.ship_slug === slug);
        const adminTpl = tpls.find((t) => t.scope === "admin" && t.ship_slug === slug);
        const activeLayer = userTpl ? "user" : adminTpl ? "admin" : "fleetyards";
        return (
          <div key={slug} className="border border-brand/20 hover:border-brand p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-display text-lg leading-tight truncate">{ship.ship_name}</div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {ship.manufacturer ?? ""} · {count}× in Flotte
                </div>
              </div>
              <LayerBadge layer={activeLayer} />
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onEdit({ scope: "user", ship_slug: slug, ship_name: ship.ship_name })}
                className="px-3 py-2 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] font-bold hover:bg-brand/80"
              >
                Eigenes Loadout bearbeiten
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}


function LayerBadge({ layer }: { layer: "user" | "admin" | "fleetyards" }) {
  const meta =
    layer === "user"
      ? { label: "Eigene Vorlage", cls: "border-emerald-400/50 text-emerald-300 bg-emerald-400/10" }
      : layer === "admin"
      ? { label: "Admin-Default", cls: "border-amber-400/50 text-amber-300 bg-amber-400/10" }
      : { label: "Fleetyards", cls: "border-white/20 text-muted-foreground" };
  return (
    <span className={`shrink-0 px-2 py-0.5 text-[10px] uppercase tracking-[0.2em] border ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

