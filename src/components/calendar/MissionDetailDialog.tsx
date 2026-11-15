import { Link } from "@tanstack/react-router";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarDays, Users } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { RichText } from "@/components/ui/rich-text";

export type MissionDetail = {
  id: string;
  slug: string;
  title: string;
  description?: string | null;
  starts_at: string | null;
  status?: string;
  category?: { id: string; name: string; color: string } | null;
  org?: { slug: string; name: string; tag: string | null } | null;
  joined?: boolean;
  internal?: boolean;
  participant_count?: number | null;
};

const statusLabel: Record<string, string> = {
  draft: "Lobby",
  active: "Aktiv",
  completed: "Abgeschlossen",
  cancelled: "Abgebrochen",
};

/** Zeigt Details eines Einsatzes an, bevor man beitritt (und ggf. das Passwort eingibt). */
export function MissionDetailDialog({
  mission,
  open,
  onOpenChange,
}: {
  mission: MissionDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  if (!mission) return null;
  const color = mission.category?.color ?? "#888888";
  const d = mission.starts_at ? new Date(mission.starts_at) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <div className="flex flex-wrap items-center gap-2">
            {mission.category && (
              <span
                className="rounded-md border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em]"
                style={{ color, borderColor: `${color}66`, backgroundColor: `${color}1a` }}
              >
                {mission.category.name}
              </span>
            )}
            {mission.internal && (
              <span className="rounded-md border border-brand/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand">
                Intern
              </span>
            )}
            {mission.joined && (
              <span className="rounded-md border border-emerald-500/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-emerald-400">
                Angemeldet
              </span>
            )}
            {mission.status && (
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                {statusLabel[mission.status] ?? mission.status}
              </span>
            )}
          </div>
          <DialogTitle className="text-left font-display text-2xl">{mission.title}</DialogTitle>
          <DialogDescription className="text-left font-mono text-[10px] uppercase tracking-[0.2em]">
            {mission.org ? `${mission.org.tag ? `[${mission.org.tag}] ` : ""}${mission.org.name}` : "Einsatz"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5" />
              {d ? format(d, "EEEE, d. MMMM yyyy · HH:mm 'Uhr'", { locale: de }) : "Termin offen"}
            </span>
            {typeof mission.participant_count === "number" && (
              <span className="inline-flex items-center gap-1.5">
                <Users className="h-3.5 w-3.5" />
                {mission.participant_count} dabei
              </span>
            )}
          </div>

          <div className="max-h-[45vh] overflow-y-auto rounded-xl border border-white/8 bg-card/40 p-4">
            {mission.description ? (
              <RichText content={mission.description} />
            ) : (
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                // keine Beschreibung hinterlegt
              </p>
            )}
          </div>

          <Link
            to="/ops/$slug"
            params={{ slug: mission.slug }}
            className="block w-full rounded-xl border border-brand bg-brand py-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-primary-foreground transition hover:bg-brand/80"
          >
            Zum Einsatz →
          </Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}