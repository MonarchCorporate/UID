import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { Crown, UserCheck, Trash2, Pencil, Radio } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { listMyMissions, deleteMission } from "@/lib/missions.functions";
import { listMyBoardSessions } from "@/lib/board.functions";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/_authenticated/ops/mine")({
  component: MyMissionsPage,
});

type LedRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  starts_at: string | null;
  created_at: string;
};

type JoinedRow = {
  mission_id: string;
  joined_at: string;
  missions: {
    id: string;
    slug: string;
    title: string;
    status: string;
    starts_at: string | null;
    leader_id: string;
  } | null;
};

const statusLabel: Record<string, string> = {
  draft: "Lobby",
  active: "Aktiv",
  completed: "Abgeschlossen",
  cancelled: "Abgebrochen",
};

const statusClass: Record<string, string> = {
  draft: "text-amber-400 border-amber-400/40",
  active: "text-emerald-400 border-emerald-400/40",
  completed: "text-muted-foreground border-white/10",
  cancelled: "text-red-400 border-red-400/40",
};

function MyMissionsPage() {
  const fn = useServerFn(listMyMissions);
  const q = useQuery({ queryKey: ["my-missions"], queryFn: () => fn() });
  const boardFn = useServerFn(listMyBoardSessions);
  const boardsQ = useQuery({ queryKey: ["board-sessions", "legacy"], queryFn: () => boardFn() });
  const qc = useQueryClient();
  const delFn = useServerFn(deleteMission);
  const [confirm, setConfirm] = useState<{ id: string; title: string } | null>(null);
  const delMut = useMutation({
    mutationFn: (mission_id: string) => delFn({ data: { mission_id } }),
    onSuccess: () => {
      toast.success("Einsatz gelöscht");
      setConfirm(null);
      qc.invalidateQueries({ queryKey: ["my-missions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler beim Löschen"),
  });

  const led = (q.data?.led ?? []) as LedRow[];
  const joinedRaw = (q.data?.joined ?? []) as JoinedRow[];
  const ledIds = new Set(led.map((m) => m.id));
  const joined = joinedRaw.filter((j) => j.missions && !ledIds.has(j.missions.id));

  return (
    <section className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <div className="mb-2 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // My Ops
          </div>
        </div>
        <h1 className="font-display text-4xl tracking-tight">Meine Einsätze</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Einsätze, die du leitest oder denen du beigetreten bist.
        </p>
      </div>

      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : (
        <>
          <Section title="Als Leader" icon={<Crown className="h-4 w-4 text-brand" />}>
            {led.length === 0 ? (
              <Empty>Du leitest aktuell keinen Einsatz.</Empty>
            ) : (
              <ul className="divide-y divide-brand/10 border border-brand/10">
                {led.map((m) => (
                  <Row
                    key={m.id}
                    slug={m.slug}
                    title={m.title}
                    status={m.status}
                    starts_at={m.starts_at}
                    leader
                    onDelete={() => setConfirm({ id: m.id, title: m.title })}
                  />
                ))}
              </ul>
            )}
          </Section>

          <Section title="Beigetreten" icon={<UserCheck className="h-4 w-4 text-muted-foreground" />}>
            {joined.length === 0 ? (
              <Empty>Du bist aktuell keinem fremden Einsatz beigetreten.</Empty>
            ) : (
              <ul className="divide-y divide-brand/10 border border-brand/10">
                {joined.map((j) => (
                  <Row
                    key={j.mission_id}
                    slug={j.missions!.slug}
                    title={j.missions!.title}
                    status={j.missions!.status}
                    starts_at={j.missions!.starts_at}
                  />
                ))}
              </ul>
            )}
          </Section>

          {(boardsQ.data ?? []).length > 0 && (
            <Section title="Sofort-Einsätze (Boardcomputer)" icon={<Radio className="h-4 w-4 text-brand" />}>
              <ul className="divide-y divide-brand/10 border border-brand/10">
                {(boardsQ.data ?? []).map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-base">{b.custom_name || b.ship_name}</div>
                      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Code · {b.code}
                      </div>
                    </div>
                    <Link
                      to="/board/$code"
                      params={{ code: b.code }}
                      className="border border-brand/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
                    >
                      Öffnen →
                    </Link>
                  </li>
                ))}
              </ul>
            </Section>
          )}
        </>
      )}

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einsatz löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{confirm?.title}" wird endgültig entfernt – inklusive Schiffe, Stationen,
              Teilnehmer und Funk-Kanäle. Diese Aktion kann nicht rückgängig gemacht werden.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirm && delMut.mutate(confirm.id)}
              disabled={delMut.isPending}
              className="bg-red-500/90 text-white hover:bg-red-500"
            >
              {delMut.isPending ? "Lösche…" : "Löschen"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">
      // {children}
    </div>
  );
}

function Row({
  slug,
  title,
  status,
  starts_at,
  leader,
  onDelete,
}: {
  slug: string;
  title: string;
  status: string;
  starts_at: string | null;
  leader?: boolean;
  onDelete?: () => void;
}) {
  return (
    <li className="relative flex items-stretch">
      <Link
        to="/ops/$slug"
        params={{ slug }}
        className="flex flex-1 items-center gap-4 px-4 py-3 transition-colors hover:bg-brand/5"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {leader && (
              <span className="inline-flex items-center gap-1 border border-brand/40 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand">
                <Crown className="h-3 w-3" /> Leader
              </span>
            )}
            <span className="truncate text-sm text-foreground">{title}</span>
          </div>
          {starts_at && (
            <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {format(new Date(starts_at), "EEE dd.MM.yyyy · HH:mm", { locale: de })}
            </div>
          )}
        </div>
        <span
          className={`shrink-0 border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] ${
            statusClass[status] ?? "text-muted-foreground border-white/10"
          }`}
        >
          {statusLabel[status] ?? status}
        </span>
      </Link>
      {leader && (
        <Link
          to="/ops/$slug/edit"
          params={{ slug }}
          className="flex items-center gap-1 border-l border-brand/10 px-3 text-muted-foreground transition-colors hover:bg-brand/10 hover:text-brand"
          aria-label="Einsatz bearbeiten"
          title="Einsatz bearbeiten"
        >
          <Pencil className="h-4 w-4" />
        </Link>
      )}
      {onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete();
          }}
          className="flex items-center gap-1 border-l border-brand/10 px-3 text-muted-foreground transition-colors hover:bg-red-500/10 hover:text-red-400"
          aria-label="Einsatz löschen"
          title="Einsatz löschen"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </li>
  );
}