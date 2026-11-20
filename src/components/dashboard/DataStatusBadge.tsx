import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { formatDistanceToNowStrict } from "date-fns";
import { de } from "date-fns/locale";
import { Database, Loader2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getDataStatus, type DataStatus } from "@/lib/game-data.functions";

export function ago(iso: string | null | undefined) {
  if (!iso) return "noch nie";
  try {
    return `vor ${formatDistanceToNowStrict(new Date(iso), { locale: de })}`;
  } catch {
    return "–";
  }
}

export function useDataStatus() {
  const fn = useServerFn(getDataStatus);
  return useQuery({
    queryKey: ["data-status"],
    queryFn: () => fn() as Promise<DataStatus>,
    staleTime: 60_000,
    refetchInterval: (q) => (q.state.data?.latestPatch?.status === "running" ? 10_000 : 5 * 60_000),
  });
}

/** Kopfzeilen-Anzeige: aktueller Patch und Frische der Spieldaten. */
export function DataStatusBadge({ isAdmin }: { isAdmin: boolean }) {
  const { data } = useDataStatus();
  if (!data) return null;
  const running = data.latestPatch?.status === "running";
  const stale = data.sources.filter((s) => s.stale);
  const newest = data.sources.map((s) => s.last).filter(Boolean).sort().at(-1) ?? null;
  const tone = running ? "text-brand" : stale.length ? "text-amber-400" : "text-emerald-400";
  const patch = data.version?.live ?? data.version?.wiki_code?.split("-")[0] ?? "–";

  return (
    <Popover>
      <PopoverTrigger
        className="focus-ring hidden items-center gap-2 rounded-xl border border-brand/20 bg-card/40 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-brand/50 hover:text-foreground md:flex"
        aria-label={`Datenstand: Patch ${patch}`}
      >
        {running ? (
          <Loader2 className={`h-3.5 w-3.5 animate-spin ${tone}`} />
        ) : (
          <span className={`relative flex h-2 w-2`}>
            <span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${stale.length ? "bg-amber-400" : "bg-emerald-400"} animate-ping`} />
            <span className={`relative inline-flex h-2 w-2 rounded-full ${stale.length ? "bg-amber-400" : "bg-emerald-400"}`} />
          </span>
        )}
        <span className="font-display tracking-wide text-foreground">{patch}</span>
        <span className="hidden lg:inline">{running ? "Abgleich läuft" : ago(newest)}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <DataStatusDetails data={data} isAdmin={isAdmin} />
      </PopoverContent>
    </Popover>
  );
}

export function DataStatusDetails({ data, isAdmin }: { data: DataStatus; isAdmin: boolean }) {
  const v = data.version;
  const p = data.latestPatch;
  const added = p
    ? Object.keys(p.after ?? {})
        .map((k) => ({ k, d: (p.after[k] ?? 0) - (p.before[k] ?? 0) }))
        .filter((x) => x.d > 0)
    : [];
  const labels = Object.fromEntries(data.sources.map((s) => [s.key, s.label]));

  return (
    <div className="text-sm">
      <div className="border-b border-brand/15 p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Database className="h-3.5 w-3.5 text-brand" /> Spieldaten
        </div>
        <div className="mt-2 flex items-baseline gap-3">
          <span className="font-display text-2xl text-foreground">{v?.live ?? "–"}</span>
          <span className="text-xs text-muted-foreground">Live</span>
          {v?.ptu && (
            <span className="ml-auto rounded-md border border-brand/25 px-1.5 py-0.5 text-[11px] text-brand">
              PTU {v.ptu}
            </span>
          )}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Wiki-Datenstand {v?.wiki_code?.split("-")[0] ?? "–"} · geprüft {ago(v?.checked_at)}
        </p>
      </div>

      <ul className="divide-y divide-brand/10">
        {data.sources.map((s) => (
          <li key={s.key} className="flex items-center gap-3 px-4 py-2">
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${s.stale ? "bg-amber-400" : "bg-emerald-400"}`} />
            <span className="flex-1 text-foreground/90">{s.label}</span>
            <span className="tabular-nums text-xs text-muted-foreground">{s.count.toLocaleString("de-DE")}</span>
            <span className={`w-24 text-right text-xs ${s.stale ? "text-amber-400" : "text-muted-foreground"}`}>
              {ago(s.last)}
            </span>
          </li>
        ))}
      </ul>

      {p && (
        <div className="border-t border-brand/15 p-4">
          <div className="text-xs text-muted-foreground">
            {p.status === "running" ? "Abgleich für" : "Zuletzt abgeglichen:"} Patch {p.version} · {ago(p.detected_at)}
          </div>
          {added.length > 0 ? (
            <p className="mt-1.5 text-foreground/90">
              Neu: {added.map((a) => `${a.d} ${labels[a.k] ?? a.k}`).join(", ")}
            </p>
          ) : (
            p.status !== "running" && <p className="mt-1.5 text-muted-foreground">Keine neuen Einträge.</p>
          )}
          {p.added?.ships?.length > 0 && (
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              Schiffe: {p.added.ships.join(", ")}
            </p>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="border-t border-brand/15 p-3">
          <Link to="/admin/sync" className="focus-ring block rounded-lg px-2 py-1.5 text-xs text-brand hover:bg-brand/10">
            Datenquellen verwalten
          </Link>
        </div>
      )}
    </div>
  );
}
