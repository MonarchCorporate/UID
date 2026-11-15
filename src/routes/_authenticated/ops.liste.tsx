import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format, isPast, isToday, isTomorrow } from "date-fns";
import { de } from "date-fns/locale";
import { Calendar, Target, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { listPublicMissions } from "@/lib/missions.functions";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";
import { useBranding } from "@/components/branding/BrandingProvider";
import { MissionDetailDialog } from "@/components/calendar/MissionDetailDialog";

export const Route = createFileRoute("/_authenticated/ops/liste")({
  head: () => ({ meta: [{ title: "Bevorstehende Einsätze – United Imperial Dominion" }] }),
  component: OpsListPage,
});

type Mission = {
  id: string;
  slug: string;
  title: string;
  description: string;
  starts_at: string | null;
  status: string;
  category: { id: string; name: string; color: string } | null;
  org: { slug: string; name: string; tag: string | null } | null;
  joined: boolean;
  internal: boolean;
  participant_count: number | null;
};

const statusLabel: Record<string, string> = {
  draft: "Lobby",
  active: "Aktiv",
  completed: "Abgeschlossen",
  cancelled: "Abgebrochen",
};

function OpsListPage() {
  const fn = useServerFn(listPublicMissions);
  const q = useQuery({
    queryKey: ["public-missions", "upcoming"],
    queryFn: () => fn({ data: { include_internal: true } }),
  });
  const { org: activeOrg } = useBranding();
  const [filter, setFilter] = useState<"all" | "my-org">("all");
  const [detail, setDetail] = useState<Mission | null>(null);

  const missions = (q.data?.missions ?? []) as Mission[];

  const filtered = useMemo(() => {
    let rows = missions;
    // upcoming = today or future; lobby/draft without date also counts
    const now = new Date();
    rows = rows.filter((m) => {
      if (!m.starts_at) return true;
      const d = new Date(m.starts_at);
      return isToday(d) || !isPast(d);
    });
    if (filter === "my-org" && activeOrg?.id) {
      rows = rows.filter((m) => m.org && m.org.slug === activeOrg.slug);
    }
    return rows.sort((a, b) => {
      if (!a.starts_at && !b.starts_at) return 0;
      if (!a.starts_at) return 1;
      if (!b.starts_at) return -1;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
  }, [missions, filter, activeOrg?.id, activeOrg?.slug]);

  const dateBadge = (startsAt: string | null) => {
    if (!startsAt) {
      return (
        <div className="w-16 shrink-0 text-center">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">TBA</div>
          <div className="font-display text-xl leading-none">—</div>
        </div>
      );
    }
    const d = new Date(startsAt);
    const soon = isToday(d) || isTomorrow(d);
    return (
      <div className="w-16 shrink-0 text-center">
        <div className={`font-mono text-[10px] uppercase tracking-[0.2em] ${soon ? "text-brand" : "text-muted-foreground"}`}>
          {isToday(d) ? "Heute" : isTomorrow(d) ? "Morgen" : format(d, "EEE", { locale: de })}
        </div>
        <div className="font-display text-xl leading-none">{format(d, "d")}</div>
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {format(d, "MMM", { locale: de })}
        </div>
      </div>
    );
  };

  return (
    <PageShell
      eyebrow="Operations"
      title="Bevorstehende Einsätze"
      description="Alle für dich verfügbaren Einsätze auf einen Blick."
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex rounded-xl border border-brand/20 bg-card/40 p-1">
          {(["all", "my-org"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={`rounded-lg px-4 py-2 text-xs font-medium transition-colors ${
                filter === key
                  ? "bg-brand/15 text-brand"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {key === "all" ? "Alle" : "Meine Orga"}
            </button>
          ))}
        </div>
        {activeOrg && (
          <div className="text-xs text-muted-foreground">
            Aktive Orga: <span className="text-foreground">{activeOrg.name}</span>
          </div>
        )}
      </div>

      <SectionHeader title="Einsätze" subtitle={filter === "my-org" ? "Nur deine Orga" : "Alle verfügbaren"} icon={Calendar} />

      {q.isLoading ? (
        <div className="rounded-2xl border border-white/8 bg-card/30 p-12 text-center font-mono text-xs text-muted-foreground">
          // lade einsätze…
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-card/30 p-8 text-center text-sm text-muted-foreground">
          Keine bevorstehenden Einsätze {filter === "my-org" ? "für deine Orga" : ""}.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((m) => {
            const color = m.category?.color ?? "#888888";
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setDetail(m)}
                className="group flex w-full items-center gap-4 rounded-2xl border border-white/8 bg-card/40 p-3 text-left transition hover:border-brand/40 hover:bg-card/70"
              >
                {dateBadge(m.starts_at)}
                <div
                  className="h-10 w-1 shrink-0 rounded-full"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-foreground">{m.title}</span>
                    {m.internal && (
                      <span className="shrink-0 rounded-md border border-brand/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-brand">
                        Intern
                      </span>
                    )}
                    {m.joined && (
                      <span className="shrink-0 rounded-md border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-emerald-400">
                        Angemeldet
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {m.starts_at && <span>{format(new Date(m.starts_at), "HH:mm", { locale: de })} Uhr</span>}
                    {m.org && (
                      <>
                        <span className="hidden sm:inline">·</span>
                        <span className="text-foreground/70">
                          {m.org.tag ? `[${m.org.tag}] ` : ""}
                          {m.org.name}
                        </span>
                      </>
                    )}
                    {m.category && (
                      <>
                        <span className="hidden sm:inline">·</span>
                        <span style={{ color }}>{m.category.name}</span>
                      </>
                    )}
                    <span className="hidden sm:inline">·</span>
                    <span>{statusLabel[m.status] ?? m.status}</span>
                    {typeof m.participant_count === "number" && (
                      <>
                        <span className="hidden sm:inline">·</span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {m.participant_count}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <Target className="h-4 w-4 shrink-0 text-brand opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            );
          })}
        </div>
      )}
      <MissionDetailDialog mission={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </PageShell>
  );
}
