import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Rocket } from "lucide-react";
import {
  getOrgFleetSettings,
  setOrgFleetSettings,
  syncOrgFleetyardsNow,
} from "@/lib/org-fleet.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/** Fleet configuration of a single org — rendered inside the org settings page. */
export function OrgFleetCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrgFleetSettings);
  const setFn = useServerFn(setOrgFleetSettings);
  const syncFn = useServerFn(syncOrgFleetyardsNow);

  const q = useQuery({
    queryKey: ["org-fleet-settings", orgId],
    queryFn: () => getFn({ data: { org_id: orgId } }),
    enabled: !!orgId,
  });

  const [source, setSource] = useState<"members" | "fleetyards">("members");
  const [slug, setSlug] = useState("");
  useEffect(() => {
    if (q.data) {
      setSource(q.data.fleet_source);
      setSlug(q.data.fleetyards_slug ?? "");
    }
  }, [q.data]);

  const saveMut = useMutation({
    mutationFn: () =>
      setFn({
        data: { org_id: orgId, fleet_source: source, fleetyards_slug: slug.trim() || null },
      }),
    onSuccess: () => {
      toast.success("Flotteneinstellungen gespeichert");
      qc.invalidateQueries({ queryKey: ["org-fleet-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const syncMut = useMutation({
    mutationFn: () => syncFn({ data: { org_id: orgId } }),
    onSuccess: (r) => {
      toast.success(`${r.count} Schiffsmodelle von "${r.slug}" synchronisiert`);
      qc.invalidateQueries({ queryKey: ["org-fleet-settings"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const dirty =
    !!q.data &&
    (source !== q.data.fleet_source || slug.trim() !== (q.data.fleetyards_slug ?? ""));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-brand" /> Orgaflotte
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Label>Quelle der öffentlichen Flotte</Label>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  key: "members" as const,
                  title: "Mitglieder-Hangars",
                  desc: "Aggregiert alle Schiffe, die Mitglieder dieser Orga zugeordnet haben.",
                },
                {
                  key: "fleetyards" as const,
                  title: "Fleetyards-Flotte",
                  desc: "Übernimmt eine öffentliche Fleetyards-Flotte per Sync.",
                },
              ]
            ).map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setSource(o.key)}
                className={`rounded-xl border p-3 text-left transition ${
                  source === o.key
                    ? "border-brand/60 bg-brand/10"
                    : "border-brand/15 hover:border-brand/40"
                }`}
              >
                <div className="text-sm font-medium">{o.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{o.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {source === "fleetyards" && (
          <div className="space-y-2">
            <Label htmlFor="fy-slug">Fleetyards-Slug</Label>
            <Input
              id="fy-slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="z. B. idcp"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Aus der URL: fleetyards.net/fleets/<strong>slug</strong>
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
          <div className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
            {q.data
              ? `// ${q.data.synced_count} synchronisierte Einheiten${
                  q.data.last_synced_at
                    ? ` · zuletzt ${new Date(q.data.last_synced_at).toLocaleString("de-DE")}`
                    : ""
                }`
              : "// lade…"}
          </div>
          <div className="flex gap-2">
            {source === "fleetyards" && (
              <Button
                variant="outline"
                onClick={() => syncMut.mutate()}
                disabled={syncMut.isPending || dirty || !slug.trim()}
              >
                <RefreshCw
                  className={`mr-1 h-3 w-3 ${syncMut.isPending ? "animate-spin" : ""}`}
                />
                Jetzt synchronisieren
              </Button>
            )}
            <Button onClick={() => saveMut.mutate()} disabled={!dirty || saveMut.isPending}>
              Speichern
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
