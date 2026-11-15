import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { signupForPublicMission, withdrawFromPublicMission } from "@/lib/missions.functions";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { MissionCalendar, type CalendarEvent } from "./MissionCalendar";
import { MissionDetailDialog } from "./MissionDetailDialog";

export function MissionCalendarView({
  events,
  defaultView = "calendar",
  signup,
}: {
  events: CalendarEvent[];
  defaultView?: "calendar" | "list";
  /** Enables the "Einschreiben" controls in the list view. */
  signup?: { signedIn: boolean; queryKey: unknown[] };
}) {
  const [view, setView] = useState<"calendar" | "list">(defaultView);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="inline-flex border border-brand/30 p-0.5">
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
              view === "calendar"
                ? "bg-brand text-primary-foreground"
                : "text-muted-foreground hover:text-brand"
            }`}
          >
            Kalender
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors ${
              view === "list"
                ? "bg-brand text-primary-foreground"
                : "text-muted-foreground hover:text-brand"
            }`}
          >
            Liste
          </button>
        </div>
      </div>
      {view === "calendar" ? (
        <MissionCalendar events={events} />
      ) : (
        <MissionList events={events} signup={signup} />
      )}
    </div>
  );
}

function MissionList({
  events,
  signup,
}: {
  events: CalendarEvent[];
  signup?: { signedIn: boolean; queryKey: unknown[] };
}) {
  const [detail, setDetail] = useState<CalendarEvent | null>(null);
  const sorted = [...events]
    .filter((e) => e.starts_at)
    .sort(
      (a, b) => new Date(a.starts_at!).getTime() - new Date(b.starts_at!).getTime(),
    );

  if (sorted.length === 0) {
    return (
      <div className="border border-brand/10 p-12 text-center font-mono text-xs text-muted-foreground">
        // keine öffentlichen Einsätze
      </div>
    );
  }

  return (
    <>
    <ul className="divide-y divide-brand/10 border border-brand/10">
      {sorted.map((ev) => {
        const color = ev.category?.color ?? "#888888";
        const d = new Date(ev.starts_at!);
        return (
          <li key={ev.id} className="flex items-center gap-2 pr-3">
            <button
              type="button"
              onClick={() => setDetail(ev)}
              className="flex min-w-0 flex-1 items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-brand/5"
            >
              <div className="w-20 shrink-0 text-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {format(d, "EEE", { locale: de })}
                </div>
                <div className="font-display text-2xl leading-none">{format(d, "d")}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {format(d, "MMM yyyy", { locale: de })}
                </div>
              </div>
              <div
                className="h-10 w-1 shrink-0"
                style={{ backgroundColor: color }}
                aria-hidden
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm text-foreground">{ev.title}</span>
                  {ev.internal && (
                    <span className="shrink-0 border border-brand/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand">
                      Intern
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <span>{format(d, "HH:mm", { locale: de })}</span>
                  {ev.org && (
                    <>
                      <span>·</span>
                      <span className="truncate text-foreground/70">
                        {ev.org.tag ? `[${ev.org.tag}] ` : ""}
                        {ev.org.name}
                      </span>
                    </>
                  )}
                  {ev.category && (
                    <>
                      <span>·</span>
                      <span style={{ color }}>{ev.category.name}</span>
                    </>
                  )}
                  {typeof ev.participant_count === "number" && (
                    <>
                      <span>·</span>
                      <span>{ev.participant_count} dabei</span>
                    </>
                  )}
                </div>
              </div>
            </button>
            {signup && <SignupButton ev={ev} signup={signup} />}
          </li>
        );
      })}
    </ul>
    <MissionDetailDialog mission={detail} open={!!detail} onOpenChange={(o) => !o && setDetail(null)} />
    </>
  );
}

function SignupButton({
  ev,
  signup,
}: {
  ev: CalendarEvent;
  signup: { signedIn: boolean; queryKey: unknown[] };
}) {
  const qc = useQueryClient();
  const join = useServerFn(signupForPublicMission);
  const leave = useServerFn(withdrawFromPublicMission);
  const [err, setErr] = useState<string | null>(null);

  const m = useMutation({
    mutationFn: async () =>
      ev.joined ? leave({ data: { slug: ev.slug } }) : join({ data: { slug: ev.slug } }),
    onSuccess: () => {
      setErr(null);
      qc.invalidateQueries({ queryKey: signup.queryKey });
    },
    onError: (e: unknown) => setErr(e instanceof Error ? e.message : String(e)),
  });

  if (!signup.signedIn) {
    return (
      <Link
        to="/login"
        className="shrink-0 border border-brand/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
      >
        Login zum Einschreiben
      </Link>
    );
  }

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate()}
        className={`border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] transition-colors disabled:opacity-50 ${
          ev.joined
            ? "border-brand/30 text-muted-foreground hover:border-destructive/50 hover:text-destructive"
            : "border-brand/40 text-brand hover:bg-brand hover:text-primary-foreground"
        }`}
      >
        {m.isPending ? "…" : ev.joined ? "Austragen" : "Einschreiben"}
      </button>
      {err && <div className="mt-1 font-mono text-[9px] text-destructive">{err}</div>}
    </div>
  );
}