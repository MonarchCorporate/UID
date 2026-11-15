import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listMissionsCatalog } from "@/lib/missions-catalog.functions";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Target, FileText } from "lucide-react";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const Route = createFileRoute("/_authenticated/missions/")({
  head: () => ({
    meta: [{ title: "Missionen – United Imperial Dominion" }],
  }),
  component: MissionsPage,
});

function MissionsPage() {
  const listFn = useServerFn(listMissionsCatalog);
  const q = useQuery({
    queryKey: ["missions-catalog"],
    queryFn: () => listFn(),
    staleTime: 60_000,
  });

  const [search, setSearch] = useState("");
  const [legalOnly, setLegalOnly] = useState(false);
  const [sort, setSort] = useState<"title" | "reward" | "min_rep">("title");

  const missions = q.data?.missions ?? [];
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let arr = missions.filter((m) => {
      if (legalOnly && (m.legality_label?.toLowerCase().includes("illegal") ?? false))
        return false;
      if (!s) return true;
      return (
        m.title.toLowerCase().includes(s) ||
        (m.giver ?? "").toLowerCase().includes(s) ||
        (m.faction ?? "").toLowerCase().includes(s)
      );
    });
    arr = [...arr];
    if (sort === "reward") {
      arr.sort((a, b) => (b.reward_max ?? b.reward_min ?? 0) - (a.reward_max ?? a.reward_min ?? 0));
    } else if (sort === "min_rep") {
      arr.sort((a, b) => (a.min_reputation ?? Infinity) - (b.min_reputation ?? Infinity));
    } else {
      arr.sort((a, b) => a.title.localeCompare(b.title, "de"));
    }
    return arr;
  }, [missions, search, legalOnly, sort]);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Missionen</h1>
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            // alle wiki-missionen mit blueprint-belohnung ({missions.length})
          </p>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border border-brand/15 bg-background/40 p-3">
        <Input
          placeholder="Suchen (Titel, Geber, Fraktion)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-72 max-w-full"
        />
        <label className="flex items-center gap-2 text-xs">
          <Checkbox
            checked={legalOnly}
            onCheckedChange={(v) => setLegalOnly(!!v)}
          />
          nur legal
        </label>
        <div className="ml-auto flex items-center gap-1 text-xs">
          <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            sort:
          </span>
          {(["title", "reward", "min_rep"] as const).map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => setSort(opt)}
              className={`px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] ${
                sort === opt
                  ? "bg-brand/20 text-brand"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {opt === "title" ? "titel" : opt === "reward" ? "belohnung" : "min-ruf"}
            </button>
          ))}
        </div>
      </div>

      {q.isError && (
        <p className="text-sm text-rose-400">
          Fehler: {(q.error as Error).message}
        </p>
      )}

      {q.isLoading && (
        <LoadingScreen
          label="Lade Missionen"
          hint="// synchronisiere wiki-missionen"
          cards={6}
        />
      )}

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {filtered.map((m) => {
          const reward =
            m.reward_min || m.reward_max
              ? `${(m.reward_min ?? m.reward_max ?? 0).toLocaleString("de-DE")}${
                  m.reward_max && m.reward_max !== m.reward_min
                    ? `–${m.reward_max.toLocaleString("de-DE")}`
                    : ""
                } aUEC`
              : null;
          return (
            <Link
              key={m.mission_uuid}
              to="/missions/$uuid"
              params={{ uuid: m.mission_uuid }}
              className="group flex flex-col gap-1 border border-brand/15 bg-background/60 p-3 hover:border-brand/60"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate font-display text-sm">{m.title}</div>
                  <div className="truncate font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                    {[m.giver, m.faction].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {m.legality_label && (
                  <Badge
                    variant="outline"
                    className={
                      m.legality_label.toLowerCase().includes("illegal")
                        ? "border-rose-500/40 text-rose-400"
                        : "border-emerald-500/40 text-emerald-400"
                    }
                  >
                    {m.legality_label}
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {m.min_standing_name && (
                  <Badge variant="outline" className="border-brand/30">
                    <Target className="mr-1 h-3 w-3" />
                    {m.faction ? `${m.faction}: ` : ""}{m.min_standing_name}
                    {m.min_reputation != null
                      ? ` (${m.min_reputation.toLocaleString("de-DE")})`
                      : ""}
                  </Badge>
                )}
                {reward && (
                  <span className="text-muted-foreground">{reward}</span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70">
                  <FileText className="h-3 w-3" />
                  {m.blueprint_count} BP
                </span>
              </div>
            </Link>
          );
        })}
        {!q.isLoading && filtered.length === 0 && (
          <p className="col-span-full text-sm text-muted-foreground">
            Keine Missionen gefunden.
          </p>
        )}
      </div>
    </div>
  );
}