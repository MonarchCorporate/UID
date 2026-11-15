import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMissionDetail } from "@/lib/missions-catalog.functions";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, ExternalLink, FileText, MapPin, Target, Clock, Gift } from "lucide-react";

export const Route = createFileRoute("/_authenticated/missions/$uuid")({
  head: () => ({
    meta: [{ title: "Mission – United Imperial Dominion" }],
  }),
  component: MissionDetailPage,
});

function MissionDetailPage() {
  const { uuid } = Route.useParams();
  const fn = useServerFn(getMissionDetail);
  const q = useQuery({
    queryKey: ["mission-detail", uuid],
    queryFn: () => fn({ data: { mission_uuid: uuid } }),
    staleTime: 60_000,
  });

  const m = q.data?.mission;

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <Link
          to="/missions"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="h-3 w-3" /> alle missionen
        </Link>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {q.isError && (
        <p className="text-sm text-rose-400">
          Fehler: {(q.error as Error).message}
        </p>
      )}
      {q.data && !m && (
        <p className="text-sm text-muted-foreground">
          Mission nicht gefunden.
        </p>
      )}

      {m && (
        <>
          <header className="space-y-2 border border-brand/15 bg-background/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl">{m.title}</h1>
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                  {[m.giver, m.faction, m.reward_scope]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
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

            <div className="flex flex-wrap items-center gap-2 pt-2 text-xs">
              {(m.reward_min || m.reward_max) && (
                <Badge variant="outline" className="border-brand/30">
                  Belohnung:{" "}
                  {(m.reward_min ?? m.reward_max ?? 0).toLocaleString("de-DE")}
                  {m.reward_max && m.reward_max !== m.reward_min
                    ? `–${m.reward_max.toLocaleString("de-DE")}`
                    : ""}{" "}
                  aUEC
                </Badge>
              )}
              {!m.reward_min && !m.reward_max && (
                <Badge
                  variant="outline"
                  className="border-brand/20 text-muted-foreground"
                >
                  Belohnung: nicht gelistet
                </Badge>
              )}
              {m.min_standing_name && (
                <Badge variant="outline" className="border-brand/30">
                  <Target className="mr-1 h-3 w-3" />
                  Ruf{m.faction ? ` bei ${m.faction}` : ""} ab: {m.min_standing_name}
                  {m.min_reputation != null
                    ? ` (${m.min_reputation.toLocaleString("de-DE")})`
                    : ""}
                </Badge>
              )}
              {m.max_standing_name &&
                m.max_standing_name !== m.min_standing_name && (
                  <Badge
                    variant="outline"
                    className="border-brand/20 text-muted-foreground"
                  >
                    bis: {m.max_standing_name}
                    {m.max_reputation != null
                      ? ` (${m.max_reputation.toLocaleString("de-DE")})`
                      : ""}
                  </Badge>
                )}
            </div>

            {m.star_systems && m.star_systems.length > 0 && (
              <p className="text-sm text-muted-foreground">
                📍 {m.star_systems.join(", ")}
              </p>
            )}

            {m.web_url && (
              <a
                href={m.web_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70 hover:text-brand"
              >
                Star Citizen Wiki <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </header>

          {(m.mission_type ||
            m.rank_index != null ||
            m.time_to_complete_minutes != null ||
            m.reputation_amount != null) && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              {m.mission_type && (
                <Badge variant="outline" className="border-brand/30">
                  Typ: {m.mission_type}
                </Badge>
              )}
              {m.rank_index != null && (
                <Badge variant="outline" className="border-brand/30">
                  Rang {m.rank_index}
                </Badge>
              )}
              {m.time_to_complete_minutes != null && (
                <Badge variant="outline" className="border-brand/20 text-muted-foreground">
                  <Clock className="mr-1 h-3 w-3" />
                  {m.time_to_complete_minutes} min
                </Badge>
              )}
              {m.reputation_amount != null && (
                <Badge variant="outline" className="border-brand/20 text-muted-foreground">
                  +{m.reputation_amount.toLocaleString("de-DE")} Reputation
                </Badge>
              )}
            </div>
          )}

          {m.description && (
            <section className="space-y-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // briefing
              </h2>
              <div className="whitespace-pre-line border border-brand/15 bg-background/40 p-4 text-sm text-foreground/90">
                {m.description}
              </div>
            </section>
          )}

          {m.availability_locations.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // ort der annahme
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {m.availability_locations.map((loc, i) => (
                  <div
                    key={`${loc.name}-${i}`}
                    className="flex items-start gap-2 border border-brand/15 bg-background/60 p-3"
                  >
                    <MapPin className="mt-0.5 h-4 w-4 text-brand/70" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-display text-sm">
                        {loc.name}
                      </div>
                      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                        {[loc.system, loc.type].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {loc.web_url && (
                        <a
                          href={loc.web_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.25em] text-brand/70 hover:text-brand"
                        >
                          wiki <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {m.reward_items.length > 0 && (
            <section className="space-y-2">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // weitere belohnungen
              </h2>
              <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {m.reward_items.map((r, i) => (
                  <div
                    key={`${r.name}-${i}`}
                    className="flex items-center gap-2 border border-brand/15 bg-background/60 p-3"
                  >
                    <Gift className="h-4 w-4 text-brand/70" />
                    <span className="flex-1 truncate font-display text-sm">
                      {r.name}
                    </span>
                    {r.quantity != null && (
                      <span className="font-mono text-[10px] text-muted-foreground">
                        ×{r.quantity}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                // schaltet blueprints frei ({m.blueprints.length})
              </h2>
            </div>
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {m.blueprints.map((b) => (
                <Link
                  key={b.id}
                  to="/blueprints/$id"
                  params={{ id: b.id }}
                  className="group flex items-center gap-2 border border-brand/15 bg-background/60 p-3 hover:border-brand/60"
                >
                  <FileText className="h-4 w-4 text-brand/70" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-sm">{b.name}</div>
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                      {b.source}
                    </div>
                  </div>
                </Link>
              ))}
              {m.blueprints.length === 0 && (
                <p className="col-span-full text-sm text-muted-foreground">
                  Keine Blueprints verknüpft.
                </p>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}