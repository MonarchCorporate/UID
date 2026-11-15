import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Gift, Ticket, Trophy, Mic, MessageSquare, Smile } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";
import { PageHint } from "@/components/orga/PageHint";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { listGiveaways, getGiveawayStandings } from "@/lib/giveaways.functions";

export const Route = createFileRoute("/_authenticated/gewinnspiele")({
  component: GiveawaysPage,
  head: () => ({
    meta: [
      { title: "Gewinnspiele · Backoffice" },
      {
        name: "description",
        content:
          "Sammle durch Aktivität auf Discord Lose und sichere dir Chancen auf die laufenden Gewinnspiele.",
      },
    ],
  }),
});

const statusLabel: Record<string, string> = {
  running: "Läuft",
  drawn: "Ausgelost",
  cancelled: "Abgebrochen",
  draft: "Entwurf",
};

function fmtDur(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function GiveawayCard({ id }: { id: string }) {
  const standingsFn = useServerFn(getGiveawayStandings);
  const { data, isLoading } = useQuery({
    queryKey: ["giveaway-standings", id],
    queryFn: () => standingsFn({ data: { id } }),
    refetchInterval: 120_000,
  });

  if (isLoading || !data) {
    return <p className="font-mono text-xs text-muted-foreground">// lade Losstand…</p>;
  }
  const g = data.giveaway;
  const mine = data.mine;
  const nextTicket = mine
    ? Number(g.points_per_ticket) - (mine.points % Number(g.points_per_ticket))
    : Number(g.points_per_ticket);
  const progress = mine
    ? ((mine.points % Number(g.points_per_ticket)) / Number(g.points_per_ticket)) * 100
    : 0;

  return (
    <div className="mt-4 space-y-4 border-t border-brand/10 pt-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat icon={Mic} label="Voice-Zeit" value={fmtDur(mine?.voice_seconds ?? 0)} />
        <Stat icon={MessageSquare} label="Nachrichten" value={String(mine?.messages ?? 0)} />
        <Stat icon={Smile} label="Reaktionen" value={String(mine?.reactions ?? 0)} />
      </div>
      <div className="rounded-xl border border-brand/15 bg-card/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2 text-sm">
            <Ticket className="h-4 w-4 text-brand" />
            <strong>{mine?.tickets ?? 0}</strong> Lose von insgesamt {data.total}
          </span>
          <span className="text-sm text-muted-foreground">
            Gewinnchance:{" "}
            {mine && data.total
              ? `${Math.round((mine.tickets / data.total) * 1000) / 10} %`
              : "—"}
          </span>
        </div>
        {g.status === "running" && (
          <>
            <Progress value={progress} className="mt-3" />
            <p className="mt-2 text-xs text-muted-foreground">
              Noch {Math.ceil(nextTicket)} Punkte bis zum nächsten Los · {g.points_per_voice_minute}{" "}
              P/Voice-Minute, {g.points_per_message} P/Nachricht, {g.points_per_reaction} P/Reaktion
              · max. {g.max_tickets} Lose
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mic;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-brand/15 bg-card/40 p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1 font-display text-xl">{value}</div>
    </div>
  );
}

function GiveawaysPage() {
  const listFn = useServerFn(listGiveaways);
  const { data, isLoading } = useQuery({ queryKey: ["giveaways"], queryFn: () => listFn() });
  const [openId, setOpenId] = useState<string | null>(null);

  const items = data?.giveaways ?? [];

  return (
    <PageShell
      eyebrow="Community"
      title="Gewinnspiele"
      description="Aktivität auf unserem Discord bringt dir Lose – je mehr Lose, desto höher deine Gewinnchance."
    >
      <PageHint>
        Zum Teilnehmen musst du auf die Gewinnspiel-Ankündigung im Discord mit ✅ reagieren – ohne
        diese Anmeldung landest du nicht im Lostopf. Sprachzeit, Nachrichten und Reaktionen auf
        dem Discord werden im Zeitraum eines
        Gewinnspiels zu Punkten verrechnet. Aus den Punkten entstehen Lose, die bei der Ziehung im
        Lostopf liegen. Teilnehmen kann jeder, dessen Discord-Konto verknüpft und dessen
        RSI-Account verifiziert ist.
      </PageHint>

      <SectionHeader icon={Gift} title="Aktuelle Gewinnspiele" />
      {isLoading && <p className="font-mono text-xs text-muted-foreground">// lade…</p>}
      {!isLoading && !items.length && (
        <p className="text-sm text-muted-foreground">Aktuell läuft kein Gewinnspiel.</p>
      )}

      <div className="space-y-3">
        {items.map((g) => (
          <div key={g.id} className="rounded-2xl border border-brand/15 bg-card/40 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-base">{g.title}</h3>
                  <Badge variant={g.status === "running" ? "default" : "outline"}>
                    {statusLabel[g.status] ?? g.status}
                  </Badge>
                </div>
                {g.prize && <p className="mt-1 text-sm text-brand">Preis: {g.prize}</p>}
                {g.description && (
                  <p className="mt-1 text-sm text-muted-foreground">{g.description}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(g.starts_at).toLocaleString("de-DE")} –{" "}
                  {new Date(g.ends_at).toLocaleString("de-DE")}
                </p>
                {g.winners.length > 0 && (
                  <p className="mt-2 flex items-center gap-2 text-sm">
                    <Trophy className="h-4 w-4 text-brand" />
                    {g.winners.map((w) => `${w.place}. ${w.name}`).join(" · ")}
                  </p>
                )}
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setOpenId(openId === g.id ? null : g.id)}
              >
                <Ticket className="mr-1 h-4 w-4" />
                {openId === g.id ? "Schließen" : "Meine Lose"}
              </Button>
            </div>
            {openId === g.id && <GiveawayCard id={g.id} />}
          </div>
        ))}
      </div>
    </PageShell>
  );
}
