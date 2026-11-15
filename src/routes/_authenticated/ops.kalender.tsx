import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPublicMissions } from "@/lib/missions.functions";
import { MissionCalendarView } from "@/components/calendar/MissionCalendarView";

export const Route = createFileRoute("/_authenticated/ops/kalender")({
  component: KalenderPage,
});

function KalenderPage() {
  const fn = useServerFn(listPublicMissions);
  const q = useQuery({
    queryKey: ["public-missions", "internal"],
    queryFn: () => fn({ data: { include_internal: true } }),
  });

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <div className="mb-2 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // Calendar
          </div>
        </div>
        <h1 className="font-display text-4xl tracking-tight">Einsatzkalender</h1>
        <p className="mt-1 text-sm text-muted-foreground">Alle öffentlichen Einsätze auf einen Blick.</p>
      </div>
      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : (
        <MissionCalendarView
          events={q.data?.missions ?? []}
          signup={{ signedIn: true, queryKey: ["public-missions"] }}
        />
      )}
    </section>
  );
}