import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Plus, User, Target, FileText, List } from "lucide-react";
import { listMyMissions } from "@/lib/missions.functions";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";

export const Route = createFileRoute("/_authenticated/ops/")({
  head: () => ({ meta: [{ title: "Einsätze – United Imperial Dominion" }] }),
  component: OpsIndex,
});

function OpsIndex() {
  const fn = useServerFn(listMyMissions);
  const q = useQuery({ queryKey: ["ops", "my-missions"], queryFn: () => fn() });
  const missions = (q.data as { asLeader?: unknown[]; joined?: unknown[] } | undefined);
  const active = [
    ...(missions?.asLeader as Array<{ id: string; slug: string; title: string; status: string }> | undefined ?? []),
    ...(missions?.joined as Array<{ id: string; slug: string; title: string; status: string }> | undefined ?? []),
  ];

  const tiles: Array<{ to: string; search?: Record<string, string>; label: string; desc: string; icon: React.ComponentType<{ className?: string }> }> = [
    { to: "/ops/new", search: { mode: "instant" }, label: "Einsatz jetzt starten", desc: "Sofort losfliegen — inkl. Boardcomputer", icon: Plus },
    { to: "/ops/new", search: { mode: "planned" }, label: "Event planen", desc: "Mit Termin, Lobby und Kalender", icon: Calendar },
    { to: "/ops/liste", label: "Bevorstehende Einsätze", desc: "Alle verfügbaren Events", icon: List },
    { to: "/ops/mine", label: "Meine Einsätze", desc: "Als Leader oder Teilnehmer", icon: User },
    { to: "/ops/kalender", label: "Kalender", desc: "Öffentliche & interne Einsätze", icon: Calendar },
    { to: "/missions", label: "Missions-Katalog", desc: "Katalog der Ingame-Missionen", icon: FileText },
  ];

  return (
    <PageShell
      eyebrow="Operations"
      title="Einsätze"
      description="Plane, starte und tritt Einsätzen bei."
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link
            key={t.label}
            to={t.to}
            search={t.search as never}
            className="group flex flex-col gap-2 rounded-2xl border border-white/8 bg-card/40 p-4 transition hover:border-brand/40 hover:bg-card/70"
          >
            <t.icon className="h-5 w-5 text-brand" />
            <div className="text-sm font-semibold tracking-tight">{t.label}</div>
            <div className="text-xs text-muted-foreground">{t.desc}</div>
          </Link>
        ))}
      </div>

      <div className="mt-8 space-y-3">
        <SectionHeader title="Deine Einsätze" subtitle="Aktuell" icon={Target} />
        {q.isLoading ? (
          <div className="text-xs text-muted-foreground">Lade…</div>
        ) : active.length === 0 ? (
          <div className="rounded-2xl border border-white/8 bg-card/30 p-6 text-sm text-muted-foreground">
            Noch keine Einsätze. Lege einen neuen an oder tritt einem öffentlichen Einsatz im Kalender bei.
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {active.slice(0, 6).map((m) => (
              <Link
                key={m.id}
                to="/ops/$slug"
                params={{ slug: m.slug }}
                className="flex items-center gap-3 rounded-xl border border-white/8 bg-card/40 p-3 hover:border-brand/40"
              >
                <Target className="h-4 w-4 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{m.title}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{m.status}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </PageShell>
  );
}