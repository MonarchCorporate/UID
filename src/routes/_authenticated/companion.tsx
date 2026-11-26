import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Gamepad2, ListChecks, MapPin, Monitor, Pickaxe, Rocket, ScrollText, Trash2, ArrowUp, ArrowDown, Check } from "lucide-react";
import { PageShell, SectionHeader, StatCard, StatGrid, StatusBadge } from "@/components/layout/PageShell";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LoadingScreen } from "@/components/ui/loading-screen";
import {
  addMiningSpot,
  companionPlanOp,
  deleteMiningSpot,
  getCompanionDashboard,
  getCompanionPlan,
  listMiningSpots,
  revokeCompanionDevice,
} from "@/lib/companion.functions";

export const Route = createFileRoute("/_authenticated/companion")({
  component: CompanionPage,
});

const STATUS_TONE: Record<string, "emerald" | "amber" | "violet" | "brand" | "slate"> = {
  aktiv: "emerald", abgeschlossen: "brand", fehlgeschlagen: "amber", abgebrochen: "slate", offen: "violet",
};

function ago(v: string | null): string {
  if (!v) return "nie";
  const ms = Date.now() - new Date(v.replace(" ", "T") + "Z").getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "gerade eben";
  if (m < 60) return `vor ${m} Min.`;
  if (m < 1440) return `vor ${Math.round(m / 60)} Std.`;
  return `vor ${Math.round(m / 1440)} Tagen`;
}

function CompanionPage() {
  const dashFn = useServerFn(getCompanionDashboard);
  const { data, isLoading } = useQuery({ queryKey: ["companion-dashboard"], queryFn: () => dashFn(), refetchInterval: 15_000 });
  if (isLoading || !data) return <LoadingScreen />;
  const live = data.live;
  const active = data.contracts.filter((c) => c.status === "aktiv");

  return (
    <PageShell
      eyebrow="Desktop-Overlay"
      title="UID Companion"
      description="Der Companion liest die Game.log von Star Citizen, zeigt Standort, Schiff, Inventar, Handel und Mining als Overlay im Spiel und trägt Ein-/Auslagerungen, Käufe, Schiffe und Blueprints automatisch hier ein."
      actions={
        <Button asChild>
          <a href="/downloads/uid-companion.exe"><Download className="mr-2 h-4 w-4" />Companion herunterladen</a>
        </Button>
      }
    >
      <StatGrid>
        <StatCard label="Standort" value={live?.location ?? "–"} hint={live?.online ? "im Spiel" : "nicht im Spiel"} icon={MapPin} tone={live?.online ? "emerald" : "default"} />
        <StatCard label="Schiff" value={live?.ship ?? "–"} hint={live?.in_ship ? "an Bord" : live?.ship ? "zuletzt genutzt" : undefined} icon={Rocket} tone="brand" />
        <StatCard label="Aktive Aufträge" value={active.length} icon={ScrollText} tone="amber" />
        <StatCard label="Geräte verbunden" value={data.devices.filter((d) => d.connected).length} hint={`${data.devices.filter((d) => !d.revoked).length} insgesamt`} icon={Monitor} tone="violet" />
      </StatGrid>

      <Tabs defaultValue="feed" className="space-y-4">
        <TabsList>
          <TabsTrigger value="feed">Ereignisse</TabsTrigger>
          <TabsTrigger value="plan">Session-Plan</TabsTrigger>
          <TabsTrigger value="contracts">Aufträge</TabsTrigger>
          <TabsTrigger value="mining">Mining-Orte</TabsTrigger>
          <TabsTrigger value="devices">Geräte</TabsTrigger>
        </TabsList>

        <TabsContent value="feed" className="space-y-3">
          <SectionHeader icon={Gamepad2} title="Letzte Ereignisse" subtitle="Direkt aus deiner Game.log" />
          <div className="rounded-2xl border border-white/10 bg-card/40 divide-y divide-white/5">
            {data.events.length ? data.events.map((e) => (
              <div key={e.id} className="flex items-baseline gap-3 px-4 py-2 text-sm">
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{ago(e.at)}</span>
                <span className="min-w-0 break-words">{e.summary}</span>
              </div>
            )) : <div className="p-6 text-center text-sm text-muted-foreground">Noch keine Ereignisse. Companion herunterladen, starten und im Browser auf „Verbinden“ klicken.</div>}
          </div>
          <p className="text-xs text-muted-foreground">
            Inventar-Bewegungen landen in <Link to="/inventar" className="text-brand hover:underline">Inventar</Link>, genutzte Schiffe unter <Link to="/meine-flotte" className="text-brand hover:underline">Meine Flotte</Link>, erhaltene Blueprints in der <Link to="/blueprints" className="text-brand hover:underline">Blueprint-Sammlung</Link>.
          </p>
        </TabsContent>

        <TabsContent value="plan"><PlanTab /></TabsContent>

        <TabsContent value="contracts" className="space-y-3">
          <SectionHeader icon={ScrollText} title="Aufträge" subtitle="Contracts aus dem Spiel – angenommen, abgeschlossen, fehlgeschlagen" />
          <div className="rounded-2xl border border-white/10 bg-card/40 divide-y divide-white/5">
            {data.contracts.length ? data.contracts.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                <StatusBadge tone={STATUS_TONE[c.status] ?? "slate"}>{c.status}</StatusBadge>
                <span className="min-w-0 flex-1 break-words font-medium">{c.title}</span>
                <span className="text-xs text-muted-foreground">{ago(c.accepted_at)}</span>
              </div>
            )) : <div className="p-6 text-center text-sm text-muted-foreground">Noch keine Aufträge erfasst.</div>}
          </div>
        </TabsContent>

        <TabsContent value="mining"><MiningTab /></TabsContent>

        <TabsContent value="devices"><DevicesTab devices={data.devices} sessions={data.sessions} /></TabsContent>
      </Tabs>
    </PageShell>
  );
}

function PlanTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(getCompanionPlan);
  const opFn = useServerFn(companionPlanOp);
  const { data: plan = [] } = useQuery({ queryKey: ["companion-plan"], queryFn: () => listFn(), refetchInterval: 15_000 });
  const op = useMutation({
    mutationFn: (d: Parameters<typeof opFn>[0]["data"]) => opFn({ data: d }),
    onSuccess: (items) => qc.setQueryData(["companion-plan"], items),
    onError: (e: Error) => toast.error(e.message),
  });
  const [title, setTitle] = useState("");
  const [qty, setQty] = useState("1");
  const open = plan.filter((p) => !p.done);
  const done = plan.filter((p) => p.done);
  const Row = ({ p, next }: { p: (typeof plan)[number]; next: boolean }) => (
    <div className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${next ? "border-brand/60 bg-brand/5" : "border-white/10 bg-card/40"} ${p.done ? "opacity-60" : ""}`}>
      <button onClick={() => op.mutate({ op: "toggle", id: p.id })} className={`flex h-6 w-6 items-center justify-center rounded-md border ${p.done ? "border-emerald-500 bg-emerald-500 text-black" : "border-white/20"}`} aria-label="Abhaken">
        {p.done && <Check className="h-4 w-4" />}
      </button>
      <div className="min-w-0 flex-1">
        <div className={`font-medium ${p.done ? "line-through" : ""}`}>{p.title} {next && <StatusBadge tone="brand" className="ml-1">als Nächstes</StatusBadge>}</div>
        <div className="text-xs text-muted-foreground">{p.location ?? ""}{p.quantity > 1 ? ` · ${p.got}/${p.quantity}` : ""}</div>
      </div>
      {!p.done && <>
        <Button size="icon" variant="ghost" onClick={() => op.mutate({ op: "up", id: p.id })} aria-label="Nach oben"><ArrowUp className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => op.mutate({ op: "down", id: p.id })} aria-label="Nach unten"><ArrowDown className="h-4 w-4" /></Button>
      </>}
      <Button size="icon" variant="ghost" onClick={() => op.mutate({ op: "delete", id: p.id })} aria-label="Entfernen"><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
  return (
    <div className="space-y-3">
      <SectionHeader icon={ListChecks} title="Session-Plan" subtitle="Was du in dieser Sitzung holen willst – synchron mit dem Overlay. Käufe und aufgehobene Items haken Einträge automatisch ab." />
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (!title.trim()) return; op.mutate({ op: "add", title: title.trim(), quantity: Math.max(1, Number(qty) || 1) }); setTitle(""); setQty("1"); }}>
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="z. B. Medpen, Quantanium, Helm" className="min-w-[220px] flex-1" />
        <Input value={qty} onChange={(e) => setQty(e.target.value)} type="number" min={1} className="w-24" />
        <Button type="submit">Hinzufügen</Button>
      </form>
      <div className="space-y-2">{open.map((p, i) => <Row key={p.id} p={p} next={i === 0} />)}{!open.length && <div className="p-4 text-sm text-muted-foreground">Nichts geplant.</div>}</div>
      {done.length > 0 && <div className="space-y-2">
        <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Erledigt ({done.length})</span><Button size="sm" variant="ghost" onClick={() => op.mutate({ op: "clear_done" })}>Erledigte entfernen</Button></div>
        {done.map((p) => <Row key={p.id} p={p} next={false} />)}
      </div>}
    </div>
  );
}

function MiningTab() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMiningSpots);
  const addFn = useServerFn(addMiningSpot);
  const delFn = useServerFn(deleteMiningSpot);
  const { data: spots = [] } = useQuery({ queryKey: ["mining-spots"], queryFn: () => listFn() });
  const [f, setF] = useState({ mineral: "", location: "", star_system: "Stanton", method: "ship", notes: "" });
  const add = useMutation({
    mutationFn: () => addFn({ data: { ...f, method: f.method as "ship" | "roc" | "hand" } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["mining-spots"] }); setF({ ...f, mineral: "", location: "", notes: "" }); toast.success("Mining-Ort gespeichert"); },
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({ mutationFn: (id: number) => delFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["mining-spots"] }) });
  return (
    <div className="space-y-3">
      <SectionHeader icon={Pickaxe} title="Mining-Orte" subtitle="Wo welches Erz zu finden ist – von der Organisation gepflegt und im Overlay unter „Mining“ zusammen mit den besten Verkaufspreisen (UEX) sichtbar." />
      <form className="grid gap-2 sm:grid-cols-6" onSubmit={(e) => { e.preventDefault(); add.mutate(); }}>
        <Input className="sm:col-span-1" required placeholder="Erz, z. B. Quantanium" value={f.mineral} onChange={(e) => setF({ ...f, mineral: e.target.value })} />
        <Input className="sm:col-span-2" required placeholder="Ort, z. B. Lyria / Aaron Halo" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} />
        <Input placeholder="System" value={f.star_system} onChange={(e) => setF({ ...f, star_system: e.target.value })} />
        <select className="rounded-md border border-input bg-background px-3 text-sm" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>
          <option value="ship">Schiff</option><option value="roc">ROC/Fahrzeug</option><option value="hand">Handmining</option>
        </select>
        <Button type="submit" disabled={add.isPending}>Hinzufügen</Button>
        <Input className="sm:col-span-6" placeholder="Notiz (optional), z. B. viele Vorkommen im Süden" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </form>
      <div className="rounded-2xl border border-white/10 bg-card/40 divide-y divide-white/5">
        {spots.length ? spots.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
            <span className="font-medium">{s.mineral}</span>
            <span className="text-muted-foreground">{s.location}{s.star_system ? ` · ${s.star_system}` : ""}</span>
            <StatusBadge tone="slate">{s.method === "roc" ? "ROC" : s.method === "hand" ? "Hand" : "Schiff"}</StatusBadge>
            {s.notes && <span className="text-xs text-muted-foreground">{s.notes}</span>}
            <span className="ml-auto text-xs text-muted-foreground">{s.by ?? ""}</span>
            <Button size="icon" variant="ghost" onClick={() => del.mutate(s.id)} aria-label="Löschen"><Trash2 className="h-4 w-4" /></Button>
          </div>
        )) : <div className="p-6 text-center text-sm text-muted-foreground">Noch keine Mining-Orte eingetragen.</div>}
      </div>
    </div>
  );
}

function DevicesTab({ devices, sessions }: { devices: Awaited<ReturnType<typeof getCompanionDashboard>>["devices"]; sessions: Awaited<ReturnType<typeof getCompanionDashboard>>["sessions"] }) {
  const qc = useQueryClient();
  const revokeFn = useServerFn(revokeCompanionDevice);
  const revoke = useMutation({ mutationFn: (id: number) => revokeFn({ data: { id } }), onSuccess: () => qc.invalidateQueries({ queryKey: ["companion-dashboard"] }) });
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <SectionHeader icon={Monitor} title="Verbundene Geräte" subtitle="Companion herunterladen, starten, im Browser auf „Verbinden“ klicken – fertig." />
        <div className="rounded-2xl border border-white/10 bg-card/40 divide-y divide-white/5">
          {devices.length ? devices.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium">{d.name}</span>
              <span className="font-mono text-xs text-muted-foreground">{d.prefix}…</span>
              {d.revoked ? <StatusBadge tone="slate">getrennt</StatusBadge> : d.connected ? <StatusBadge tone={d.in_game ? "emerald" : "brand"}>{d.in_game ? "im Spiel" : "verbunden"}</StatusBadge> : <StatusBadge tone="slate">offline</StatusBadge>}
              <span className="text-xs text-muted-foreground">{d.player ?? ""} {d.version ? `· v${d.version}` : ""} · {d.events} Events · {ago(d.last_seen)}</span>
              {!d.revoked && <Button size="sm" variant="ghost" className="ml-auto text-red-300" onClick={() => revoke.mutate(d.id)}>Trennen</Button>}
            </div>
          )) : <div className="p-6 text-center text-sm text-muted-foreground">Noch kein Gerät verbunden.</div>}
        </div>
      </div>
      <div className="space-y-3">
        <SectionHeader icon={Gamepad2} title="Spielsitzungen" />
        <div className="rounded-2xl border border-white/10 bg-card/40 divide-y divide-white/5">
          {sessions.map((s) => (
            <div key={s.session} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="w-28 text-xs text-muted-foreground">{ago(s.started_at)}</span>
              <span>{s.player ?? "–"}</span>
              <span className="text-xs text-muted-foreground">{s.channel ?? ""} {s.branch ?? ""}</span>
              <span className="ml-auto font-mono text-xs">K {s.kills + s.npc_kills} · T {s.deaths} · {s.events} Events</span>
              {!s.ended_at && <StatusBadge tone="emerald">läuft</StatusBadge>}
            </div>
          ))}
          {!sessions.length && <div className="p-6 text-center text-sm text-muted-foreground">Noch keine Sitzungen.</div>}
        </div>
      </div>
    </div>
  );
}
