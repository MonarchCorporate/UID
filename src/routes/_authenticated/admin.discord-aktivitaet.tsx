import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Activity, Radio, Mic, Terminal, Users } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getDiscordActivityOverview,
  queueBotCommand,
} from "@/lib/discord-activity.functions";

export const Route = createFileRoute("/_authenticated/admin/discord-aktivitaet")({
  component: DiscordActivityPage,
  head: () => ({
    meta: [
      { title: "Discord-Aktivität · Backoffice" },
      {
        name: "description",
        content: "Sprachzeiten, aktive Kanäle und Bot-Steuerung für den Discord-Server.",
      },
    ],
  }),
});

function fmt(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

function DiscordActivityPage() {
  const qc = useQueryClient();
  const overviewFn = useServerFn(getDiscordActivityOverview);
  const commandFn = useServerFn(queueBotCommand);
  const [days, setDays] = useState(7);
  const [presence, setPresence] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["discord-activity", days],
    queryFn: () => overviewFn({ data: { days } }),
    refetchInterval: 30_000,
  });

  const cmdM = useMutation({
    mutationFn: (v: { command: "ping" | "resync_voice" | "set_presence" | "restart"; payload?: Record<string, string> }) =>
      commandFn({ data: { command: v.command, payload: v.payload ?? {} } }),
    onSuccess: () => {
      toast.success("Befehl in die Warteschlange gelegt – der Bot holt ihn beim nächsten Herzschlag ab.");
      qc.invalidateQueries({ queryKey: ["discord-activity"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const status = data?.status;

  return (
    <PageShell
      eyebrow="Administration"
      title="Discord-Aktivität"
      description="Sprachzeiten, aktive Kanäle und Steuerung des Dauer-Bots."
    >
      {isLoading && <p className="font-mono text-xs text-muted-foreground">// lade…</p>}

      <section className="space-y-4">
        <SectionHeader icon={Radio} title="Bot-Status" subtitle="Gateway-Verbindung des externen Bots (Railway)." />
        <div className="flex flex-wrap items-center gap-6 rounded-2xl border border-brand/15 bg-card/40 p-5">
          <div className="flex items-center gap-3">
            <span
              className={`h-3 w-3 rounded-full ${status?.online ? "bg-emerald-400" : "bg-muted-foreground/50"}`}
            />
            <div>
              <p className="font-display text-sm">
                {status?.online ? "Online" : "Offline"}
                {status?.bot_username ? ` · ${status.bot_username}` : ""}
              </p>
              <p className="text-xs text-muted-foreground">
                {status?.last_heartbeat_at
                  ? `Letzter Herzschlag ${new Date(status.last_heartbeat_at).toLocaleString("de-DE")}`
                  : "Noch kein Herzschlag empfangen – Bot noch nicht deployed."}
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">
            {status?.guild_name ?? "—"} · {status?.member_count ?? 0} Mitglieder ·{" "}
            {status?.voice_active ?? 0} aktiv im Voice
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Terminal} title="Bot steuern" subtitle="Befehle werden vom Bot beim nächsten Herzschlag (alle 30 s) ausgeführt." />
        <div className="space-y-4 rounded-2xl border border-brand/15 bg-card/40 p-5">
          <div className="flex flex-wrap gap-3">
            <Button size="sm" variant="outline" onClick={() => cmdM.mutate({ command: "ping" })}>
              Ping
            </Button>
            <Button size="sm" variant="outline" onClick={() => cmdM.mutate({ command: "resync_voice" })}>
              Sprachkanäle neu abgleichen
            </Button>
            <Button size="sm" variant="outline" onClick={() => cmdM.mutate({ command: "restart" })}>
              Bot neu starten
            </Button>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground" htmlFor="presence">
                Statustext des Bots
              </label>
              <Input
                id="presence"
                value={presence}
                maxLength={100}
                placeholder="z. B. Verse-Operationen"
                className="w-72"
                onChange={(e) => setPresence(e.target.value)}
              />
            </div>
            <Button
              size="sm"
              disabled={!presence.trim()}
              onClick={() => cmdM.mutate({ command: "set_presence", payload: { text: presence.trim() } })}
            >
              Setzen
            </Button>
          </div>
          {data?.commands?.length ? (
            <div className="space-y-1 font-mono text-[11px] text-muted-foreground">
              {data.commands.map((c) => (
                <p key={c.id}>
                  {new Date(c.created_at).toLocaleTimeString("de-DE")} · {c.command} ·{" "}
                  <span className={c.status === "error" ? "text-destructive" : ""}>{c.status}</span>
                  {c.result ? ` · ${c.result}` : ""}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Activity} title="Sprachzeiten" subtitle="Aggregiert aus den Gateway-Ereignissen." />
        <div className="flex gap-2">
          {[1, 7, 30].map((d) => (
            <Button key={d} size="sm" variant={days === d ? "default" : "outline"} onClick={() => setDays(d)}>
              {d === 1 ? "24 h" : `${d} Tage`}
            </Button>
          ))}
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Stat label="Gesamte Sprachzeit" value={fmt(data?.totalSeconds ?? 0)} />
          <Stat label="Aktive Mitglieder" value={String(data?.uniqueUsers ?? 0)} />
          <Stat label="Gerade im Voice" value={String(data?.live?.length ?? 0)} />
        </div>

        <div className="overflow-hidden rounded-2xl border border-brand/15">
          <table className="w-full text-sm">
            <thead className="bg-card/60 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <tr>
                <th className="p-3 text-left">Mitglied</th>
                <th className="p-3 text-left">Sprachzeit</th>
                <th className="p-3 text-left">Sitzungen</th>
              </tr>
            </thead>
            <tbody>
              {(data?.leaders ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="p-6 text-center text-muted-foreground">
                    Noch keine Daten – sobald der Bot läuft, erscheinen hier die Sprachzeiten.
                  </td>
                </tr>
              )}
              {(data?.leaders ?? []).map((l) => (
                <tr key={l.discord_user_id} className="border-t border-brand/10">
                  <td className="p-3">{l.callsign ?? l.name}</td>
                  <td className="p-3">{fmt(l.seconds)}</td>
                  <td className="p-3">{l.sessions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Mic} title="Kanäle" subtitle="Wo am meisten gesprochen wird." />
        <div className="grid gap-3 sm:grid-cols-2">
          {(data?.channels ?? []).map((c) => (
            <div
              key={c.channel_name}
              className="flex items-center justify-between rounded-xl border border-brand/10 bg-card/40 p-4 text-sm"
            >
              <span>{c.channel_name}</span>
              <span className="text-muted-foreground">
                {fmt(c.seconds)} · {c.sessions}×
              </span>
            </div>
          ))}
          {(data?.channels ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Noch keine Kanaldaten.</p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader icon={Users} title="Letzte Ereignisse" subtitle="Nachrichten und Kanalwechsel." />
        <div className="space-y-1 rounded-2xl border border-brand/15 bg-card/40 p-5 font-mono text-[11px] text-muted-foreground">
          {(data?.events ?? []).length === 0 && <p>Noch keine Ereignisse.</p>}
          {(data?.events ?? []).map((e) => (
            <p key={e.id}>
              {new Date(e.created_at).toLocaleString("de-DE")} · {e.event_type} · {e.name}
              {e.channel_name ? ` · #${e.channel_name}` : ""}
            </p>
          ))}
        </div>
      </section>
    </PageShell>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-brand/15 bg-card/40 p-5">
      <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-2 font-display text-2xl">{value}</p>
    </div>
  );
}