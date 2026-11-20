import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, CircleAlert, Loader2, Radar, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { ago, useDataStatus } from "@/components/dashboard/DataStatusBadge";
import { listDataAlertChannels, runFullDataSync, setDataAlertChannel } from "@/lib/game-data.functions";

/** Patch-Wächter: Version, Komplettabgleich, Alarm-Channel, Verlauf. */
export function PatchWatchPanel() {
  const qc = useQueryClient();
  const { data } = useDataStatus();
  const runFn = useServerFn(runFullDataSync);
  const channelsFn = useServerFn(listDataAlertChannels);
  const setChannelFn = useServerFn(setDataAlertChannel);
  const [showChannels, setShowChannels] = useState(false);

  const channels = useQuery({
    queryKey: ["data-alert-channels"],
    queryFn: () => channelsFn(),
    enabled: showChannels,
    staleTime: 5 * 60_000,
  });

  const run = useMutation({
    mutationFn: () => runFn(),
    onSuccess: () => {
      toast.success("Abgleich gestartet – der Fortschritt erscheint unten.");
      qc.invalidateQueries({ queryKey: ["data-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const setChannel = useMutation({
    mutationFn: (channelId: string | null) => setChannelFn({ data: { channelId } }),
    onSuccess: () => {
      toast.success("Meldungs-Channel gespeichert.");
      qc.invalidateQueries({ queryKey: ["data-status"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const v = data?.version;
  const latest = data?.latestPatch;
  const running = latest?.status === "running";
  const staleCount = data?.sources.filter((s) => s.stale).length ?? 0;

  return (
    <section className="uid-card rounded-xl p-5 md:p-6">
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-brand/30 bg-brand/10">
          <Radar className="h-5 w-5 text-brand" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-base text-foreground">Patch-Wächter</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Prüft stündlich die Spielversion. Sobald das Star-Citizen-Wiki Daten für einen neuen Patch liefert,
            werden alle Kataloge automatisch abgeglichen. Zusätzlich laufen alle Quellen jede Nacht.
          </p>
        </div>
        <button
          type="button"
          onClick={() => run.mutate()}
          disabled={run.isPending || running}
          className="focus-ring inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
        >
          {running || run.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {running ? "Abgleich läuft…" : "Jetzt alles abgleichen"}
        </button>
      </div>

      <dl className="mt-5 grid gap-3 sm:grid-cols-4">
        <Stat label="Live" value={v?.live ?? "–"} />
        <Stat label="PTU" value={v?.ptu ?? "–"} />
        <Stat label="Wiki-Datenstand" value={v?.wiki_code?.split("-")[0] ?? "–"} hint={`geprüft ${ago(v?.checked_at)}`} />
        <Stat
          label="Quellen"
          value={staleCount ? `${staleCount} veraltet` : "alle aktuell"}
          tone={staleCount ? "warn" : "ok"}
        />
      </dl>

      {latest && (
        <div className="mt-5 rounded-lg border border-brand/15 bg-background/40 p-4">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-display text-foreground">Patch {latest.version}</span>
            <span className="text-xs text-muted-foreground">gestartet {ago(latest.detected_at)}</span>
          </div>
          <ol className="mt-3 grid gap-1.5 sm:grid-cols-2">
            {(data?.latestPatch?.steps ?? []).map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-xs">
                {s.ok ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                ) : (
                  <CircleAlert className="h-3.5 w-3.5 text-amber-400" />
                )}
                <span className="text-foreground/90">{s.label}</span>
                <span className="text-muted-foreground">{Math.round(s.ms / 1000)} s</span>
                {s.note && <span className="truncate text-amber-400">{s.note}</span>}
              </li>
            ))}
            {running && (
              <li className="flex items-center gap-2 text-xs text-brand">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> läuft …
              </li>
            )}
          </ol>
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-brand/10 pt-4 text-sm">
        <span className="text-muted-foreground">Meldungen bei neuen Patches und Ausfällen an:</span>
        {showChannels ? (
          <select
            className="focus-ring rounded-lg border border-brand/25 bg-background px-3 py-1.5 text-sm"
            value={data?.alertChannelId ?? ""}
            onChange={(e) => setChannel.mutate(e.target.value || null)}
            disabled={channels.isLoading || setChannel.isPending}
          >
            <option value="">Keine Discord-Meldungen</option>
            {(channels.data ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            onClick={() => setShowChannels(true)}
            className="focus-ring rounded-lg border border-brand/25 px-3 py-1.5 text-xs text-brand hover:bg-brand/10"
          >
            {data?.alertChannelId ? "Discord-Channel ändern" : "Discord-Channel wählen"}
          </button>
        )}
        {channels.isError && <span className="text-xs text-amber-400">Channels konnten nicht geladen werden.</span>}
      </div>
    </section>
  );
}

function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "ok" | "warn" }) {
  return (
    <div className="rounded-lg border border-brand/10 bg-background/30 px-3 py-2.5">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd
        className={`mt-0.5 font-display text-lg ${
          tone === "warn" ? "text-amber-400" : tone === "ok" ? "text-emerald-400" : "text-foreground"
        }`}
      >
        {value}
      </dd>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
