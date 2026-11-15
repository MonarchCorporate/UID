import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { de } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MissionDetailDialog } from "./MissionDetailDialog";

export type CalendarEvent = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  starts_at: string | null;
  category: { id: string; name: string; color: string } | null;
  participant_count?: number | null;
  org?: { slug: string; name: string; tag: string | null } | null;
  joined?: boolean;
  internal?: boolean;
  status?: string;
};

export function MissionCalendar({ events }: { events: CalendarEvent[] }) {
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()));
  const [detail, setDetail] = useState<CalendarEvent | null>(null);

  const days = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 1 });
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 1 });
    return eachDayOfInterval({ start, end });
  }, [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      if (!ev.starts_at) continue;
      const key = format(new Date(ev.starts_at), "yyyy-MM-dd");
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return map;
  }, [events]);

  const today = new Date();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="font-display text-2xl tracking-tight capitalize">
          {format(cursor, "LLLL yyyy", { locale: de })}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setCursor(startOfMonth(new Date()))}>
            Heute
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(subMonths(cursor, 1))}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="icon" onClick={() => setCursor(addMonths(cursor, 1))}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px border border-brand/10 bg-brand/10 text-xs">
        {["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((d) => (
          <div
            key={d}
            className="bg-background px-2 py-2 text-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground"
          >
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayEvents = eventsByDay.get(key) ?? [];
          const muted = !isSameMonth(day, cursor);
          const isToday = isSameDay(day, today);
          return (
            <div
              key={key}
              className={`min-h-[110px] bg-background p-2 ${muted ? "opacity-40" : ""}`}
            >
              <div
                className={`mb-1 text-right font-mono text-[10px] ${
                  isToday ? "text-brand font-bold" : "text-muted-foreground"
                }`}
              >
                {format(day, "d")}
              </div>
              <div className="space-y-1">
                {dayEvents.map((ev) => {
                  const color = ev.category?.color ?? "#888888";
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setDetail(ev)}
                      className="block w-full truncate rounded-sm border px-1.5 py-1 text-left text-[11px] leading-tight hover:opacity-80"
                      style={{
                        backgroundColor: `${color}26`,
                        borderColor: `${color}66`,
                        color: color,
                      }}
                      title={ev.title}
                    >
                      <span className="font-mono text-[9px] opacity-70">
                        {ev.starts_at ? format(new Date(ev.starts_at), "HH:mm") : ""}
                      </span>{" "}
                      <span className="text-foreground">{ev.title}</span>
                      {ev.joined && (
                        <span className="ml-1 font-mono text-[9px] text-brand">✓</span>
                      )}
                      {typeof ev.participant_count === "number" && (
                        <span className="ml-1 font-mono text-[9px] opacity-70">
                          · {ev.participant_count}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <MissionDetailDialog
        mission={detail}
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
      />
    </div>
  );
}