import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Gift, Ticket, Trophy, Settings2 } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  listGiveaways,
  createGiveaway,
  updateGiveaway,
  startGiveaway,
  drawGiveaway,
  cancelGiveaway,
  deleteGiveaway,
  getGiveawayStandings,
  listAnnounceChannels,
  listOrgOptions,
} from "@/lib/giveaways.functions";

export const Route = createFileRoute("/_authenticated/admin/gewinnspiele")({
  component: AdminGiveawaysPage,
  head: () => ({
    meta: [
      { title: "Gewinnspiele · Backoffice" },
      {
        name: "description",
        content:
          "Gewinnspiele anlegen, Aktivitäts-Lose verwalten und Gewinner über Discord auslosen.",
      },
    ],
  }),
});

type FormState = {
  id?: string;
  title: string;
  description: string;
  prize: string;
  org_id: string;
  starts_at: string;
  ends_at: string;
  points_per_voice_minute: number;
  points_per_message: number;
  points_per_reaction: number;
  points_per_ticket: number;
  max_tickets: number;
  min_points: number;
  winner_count: number;
  announce_channel_id: string;
};

const toLocal = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** datetime-local inputs are briefly empty/incomplete while typing – never throw. */
const safeIso = (value: string) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
};

const emptyForm = (): FormState => {
  const now = new Date();
  const end = new Date(now.getTime() + 7 * 86_400_000);
  return {
    title: "",
    description: "",
    prize: "",
    org_id: "",
    starts_at: toLocal(now.toISOString()),
    ends_at: toLocal(end.toISOString()),
    points_per_voice_minute: 1,
    points_per_message: 2,
    points_per_reaction: 1,
    points_per_ticket: 60,
    max_tickets: 50,
    min_points: 0,
    winner_count: 1,
    announce_channel_id: "",
  };
};

function fmtDur(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

const statusLabel: Record<string, string> = {
  draft: "Entwurf",
  running: "Läuft",
  drawn: "Ausgelost",
  cancelled: "Abgebrochen",
};

function AdminGiveawaysPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(listGiveaways);
  const createFn = useServerFn(createGiveaway);
  const updateFn = useServerFn(updateGiveaway);
  const startFn = useServerFn(startGiveaway);
  const drawFn = useServerFn(drawGiveaway);
  const cancelFn = useServerFn(cancelGiveaway);
  const deleteFn = useServerFn(deleteGiveaway);
  const channelsFn = useServerFn(listAnnounceChannels);
  const orgsFn = useServerFn(listOrgOptions);
  const standingsFn = useServerFn(getGiveawayStandings);

  const [form, setForm] = useState<FormState>(emptyForm);
  const [openId, setOpenId] = useState<string | null>(null);
  const [confirmDraw, setConfirmDraw] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["giveaways"],
    queryFn: () => listFn(),
  });
  const { data: channels } = useQuery({
    queryKey: ["giveaway-channels"],
    queryFn: () => channelsFn(),
    staleTime: 300_000,
  });
  const { data: orgs } = useQuery({
    queryKey: ["giveaway-orgs"],
    queryFn: () => orgsFn(),
    staleTime: 300_000,
  });
  const { data: standing } = useQuery({
    queryKey: ["giveaway-standings", openId],
    queryFn: () => standingsFn({ data: { id: openId! } }),
    enabled: Boolean(openId),
    refetchInterval: 60_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["giveaways"] });
    qc.invalidateQueries({ queryKey: ["giveaway-standings"] });
  };

  const payload = useMemo(
    () => ({
      title: form.title,
      description: form.description || null,
      prize: form.prize,
      org_id: form.org_id || null,
      starts_at: safeIso(form.starts_at),
      ends_at: safeIso(form.ends_at),
      points_per_voice_minute: Number(form.points_per_voice_minute),
      points_per_message: Number(form.points_per_message),
      points_per_reaction: Number(form.points_per_reaction),
      points_per_ticket: Number(form.points_per_ticket),
      max_tickets: Number(form.max_tickets),
      min_points: Number(form.min_points),
      winner_count: Number(form.winner_count),
      announce_channel_id: form.announce_channel_id || null,
    }),
    [form],
  );

  const saveM = useMutation({
    mutationFn: async () =>
      form.id
        ? updateFn({ data: { id: form.id, ...payload } })
        : createFn({ data: payload }),
    onSuccess: () => {
      toast.success(form.id ? "Gewinnspiel gespeichert." : "Gewinnspiel als Entwurf angelegt.");
      setForm(emptyForm());
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startM = useMutation({
    mutationFn: (id: string) => startFn({ data: { id } }),
    onSuccess: (res) => {
      toast.success("Gewinnspiel gestartet.");
      if (res?.warning) toast.warning(res.warning);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const drawM = useMutation({
    mutationFn: (id: string) => drawFn({ data: { id } }),
    onSuccess: (res) => {
      const names = res?.winners?.map((w) => w.name).join(", ");
      toast.success(names ? `Gewinner: ${names}` : "Ausgelost – keine Teilnehmer.");
      setConfirmDraw(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gewinnspiel abgebrochen.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gewinnspiel gelöscht.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const num = (key: keyof FormState) => ({
    type: "number" as const,
    value: String(form[key] as number),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((f) => ({ ...f, [key]: Number(e.target.value) })),
  });

  return (
    <PageShell
      eyebrow="Administration"
      title="Gewinnspiele"
      description="Mitglieder sammeln durch Discord-Aktivität Lose. Wer mehr Lose hat, gewinnt mit höherer Wahrscheinlichkeit."
    >
      <section className="space-y-4">
        <SectionHeader
          icon={Settings2}
          title={form.id ? "Gewinnspiel bearbeiten" : "Neues Gewinnspiel"}
          subtitle="Zeitraum, Preis und Gewichtung der Aktivitäten festlegen."
          actions={
            form.id ? (
              <Button variant="outline" size="sm" onClick={() => setForm(emptyForm())}>
                Abbrechen
              </Button>
            ) : undefined
          }
        />
        <div className="grid gap-4 rounded-2xl border border-brand/15 bg-card/40 p-5 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Titel</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              placeholder="Monats-Gewinnspiel"
            />
          </div>
          <div className="space-y-2">
            <Label>Preis</Label>
            <Input
              value={form.prize}
              onChange={(e) => setForm((f) => ({ ...f, prize: e.target.value }))}
              placeholder="z. B. Drake Cutlass Black"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Beschreibung</Label>
            <Textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="Worum geht es? Wird auch im Discord-Embed angezeigt."
            />
          </div>
          <div className="space-y-2">
            <Label>Start</Label>
            <Input
              type="datetime-local"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Ende</Label>
            <Input
              type="datetime-local"
              value={form.ends_at}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label>Nur für Orga (optional)</Label>
            <Select
              value={form.org_id || "all"}
              onValueChange={(v) => setForm((f) => ({ ...f, org_id: v === "all" ? "" : v }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Alle verifizierten Mitglieder" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle verifizierten Mitglieder</SelectItem>
                {(orgs ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Discord-Kanal für Ankündigung</Label>
            <Select
              value={form.announce_channel_id || "none"}
              onValueChange={(v) =>
                setForm((f) => ({ ...f, announce_channel_id: v === "none" ? "" : v }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Kein Discord-Post" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Kein Discord-Post</SelectItem>
                {(channels ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    #{c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Punkte je Voice-Minute</Label>
            <Input {...num("points_per_voice_minute")} />
          </div>
          <div className="space-y-2">
            <Label>Punkte je Nachricht</Label>
            <Input {...num("points_per_message")} />
          </div>
          <div className="space-y-2">
            <Label>Punkte je Reaktion</Label>
            <Input {...num("points_per_reaction")} />
          </div>
          <div className="space-y-2">
            <Label>Punkte pro Los</Label>
            <Input {...num("points_per_ticket")} />
          </div>
          <div className="space-y-2">
            <Label>Maximale Lose pro Person</Label>
            <Input {...num("max_tickets")} />
          </div>
          <div className="space-y-2">
            <Label>Mindestpunkte für Teilnahme</Label>
            <Input {...num("min_points")} />
          </div>
          <div className="space-y-2">
            <Label>Anzahl Gewinner</Label>
            <Input {...num("winner_count")} />
          </div>
          <div className="flex items-end md:col-span-2">
            <Button
              onClick={() => saveM.mutate()}
              disabled={
                saveM.isPending ||
                form.title.trim().length < 2 ||
                !payload.starts_at ||
                !payload.ends_at
              }
            >
              {form.id ? "Änderungen speichern" : "Als Entwurf anlegen"}
            </Button>
          </div>
        </div>
      </section>

      <section className="space-y-4">
        <SectionHeader
          icon={Gift}
          title="Gewinnspiele"
          subtitle="Entwürfe starten, Ticketstand prüfen und Gewinner ziehen."
        />
        {isLoading && <p className="font-mono text-xs text-muted-foreground">// lade…</p>}
        {!isLoading && !(data?.giveaways ?? []).length && (
          <p className="text-sm text-muted-foreground">Noch keine Gewinnspiele angelegt.</p>
        )}
        <div className="space-y-3">
          {(data?.giveaways ?? []).map((g) => (
            <div key={g.id} className="rounded-2xl border border-brand/15 bg-card/40 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-display text-base">{g.title}</h3>
                    <Badge variant={g.status === "running" ? "default" : "outline"}>
                      {statusLabel[g.status] ?? g.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {g.prize || "Kein Preis angegeben"} ·{" "}
                    {new Date(g.starts_at).toLocaleString("de-DE")} –{" "}
                    {new Date(g.ends_at).toLocaleString("de-DE")} · {g.winner_count} Gewinner
                  </p>
                  {g.winners.length > 0 && (
                    <p className="mt-2 flex items-center gap-2 text-sm">
                      <Trophy className="h-4 w-4 text-brand" />
                      {g.winners
                        .map((w) => `${w.place}. ${w.name} (${w.tickets}/${w.total_tickets} Lose)`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setOpenId(openId === g.id ? null : g.id)}
                  >
                    <Ticket className="mr-1 h-4 w-4" />
                    Lose
                  </Button>
                  {g.status === "draft" && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => startM.mutate(g.id)}
                        disabled={startM.isPending}
                      >
                        Starten
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          setForm({
                            id: g.id,
                            title: g.title,
                            description: g.description ?? "",
                            prize: g.prize ?? "",
                            org_id: g.org_id ?? "",
                            starts_at: toLocal(g.starts_at),
                            ends_at: toLocal(g.ends_at),
                            points_per_voice_minute: Number(g.points_per_voice_minute),
                            points_per_message: Number(g.points_per_message),
                            points_per_reaction: Number(g.points_per_reaction),
                            points_per_ticket: Number(g.points_per_ticket),
                            max_tickets: g.max_tickets,
                            min_points: Number(g.min_points),
                            winner_count: g.winner_count,
                            announce_channel_id: g.announce_channel_id ?? "",
                          })
                        }
                      >
                        Bearbeiten
                      </Button>
                    </>
                  )}
                  {g.status === "running" && (
                    <>
                      <Button
                        size="sm"
                        variant={confirmDraw === g.id ? "destructive" : "default"}
                        onClick={() =>
                          confirmDraw === g.id ? drawM.mutate(g.id) : setConfirmDraw(g.id)
                        }
                        disabled={drawM.isPending}
                      >
                        {confirmDraw === g.id ? "Wirklich ziehen?" : "Jetzt ziehen"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => cancelM.mutate(g.id)}>
                        Abbrechen
                      </Button>
                    </>
                  )}
                  {(g.status === "draft" || g.status === "cancelled") && (
                    <Button size="sm" variant="ghost" onClick={() => deleteM.mutate(g.id)}>
                      Löschen
                    </Button>
                  )}
                </div>
              </div>

              {openId === g.id && (
                <div className="mt-4 border-t border-brand/10 pt-4">
                  <p className="mb-3 text-xs text-muted-foreground">
                    {standing?.total ?? 0} Lose im Topf ·{" "}
                    {standing?.standings.length ?? 0} Teilnehmer
                    {g.status !== "drawn" && " (Live-Stand)"}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-muted-foreground">
                        <tr>
                          <th className="py-1 pr-3">Mitglied</th>
                          <th className="py-1 pr-3">Voice</th>
                          <th className="py-1 pr-3">Nachrichten</th>
                          <th className="py-1 pr-3">Reaktionen</th>
                          <th className="py-1 pr-3">Punkte</th>
                          <th className="py-1 pr-3">Lose</th>
                          <th className="py-1">Chance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(standing?.standings ?? []).map((s) => (
                          <tr key={s.user_id} className="border-t border-brand/10">
                            <td className="py-1 pr-3">
                              <span className="font-medium">
                                {s.rsi_handle ?? s.name}
                              </span>
                              {s.callsign && s.callsign !== (s.rsi_handle ?? s.name) && (
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {s.callsign}
                                </span>
                              )}
                            </td>
                            <td className="py-1 pr-3">{fmtDur(s.voice_seconds)}</td>
                            <td className="py-1 pr-3">{s.messages}</td>
                            <td className="py-1 pr-3">{s.reactions}</td>
                            <td className="py-1 pr-3">{s.points}</td>
                            <td className="py-1 pr-3 font-medium">{s.tickets}</td>
                            <td className="py-1">
                              {standing?.total
                                ? `${Math.round((s.tickets / standing.total) * 1000) / 10} %`
                                : "—"}
                            </td>
                          </tr>
                        ))}
                        {!(standing?.standings ?? []).length && (
                          <tr>
                            <td colSpan={7} className="py-2 text-muted-foreground">
                              Noch keine Lose vergeben.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
