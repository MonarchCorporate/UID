import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPublicMissions } from "@/lib/missions.functions";
import { MissionCalendarView } from "@/components/calendar/MissionCalendarView";

export function PublicCalendarSection() {
  const fn = useServerFn(listPublicMissions);
  const q = useQuery({ queryKey: ["public-missions"], queryFn: () => fn() });

  return (
    <section id="kalender" className="relative border-t border-white/5 py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 inline-block p-1 border border-brand/30">
              <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
                // Calendar
              </div>
            </div>
            <h2 className="font-display text-4xl tracking-tight md:text-5xl">Einsatzkalender</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Alle öffentlichen Einsätze unserer Community.
            </p>
          </div>
          <Link
            to="/kalender"
            className="px-4 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.2em] font-bold hover:bg-brand hover:text-primary-foreground"
          >
            Vollansicht
          </Link>
        </div>
        {q.isLoading ? (
          <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
        ) : (
          <MissionCalendarView
            events={q.data?.missions ?? []}
            defaultView="list"
            signup={{
              signedIn: !!q.data?.viewer_signed_in,
              queryKey: ["public-missions"],
            }}
          />
        )}
      </div>
    </section>
  );
}