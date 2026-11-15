import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  getBlueprint,
  upsertBlueprint,
  deleteBlueprint,
  upsertMission,
  type BlueprintComponent,
} from "@/lib/blueprints.functions";
import { listInventory, listMyLocations } from "@/lib/inventory.functions";
import { craft } from "@/lib/crafting.functions";
import { formatQty, type Unit } from "@/lib/units";
import { CraftingPanel } from "@/components/crafting/CraftingPanel";
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
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Hammer,
  Wand2,
  AlertTriangle,
  ExternalLink,
  Lock,
  Users,
  Pencil,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/blueprints/$id")({
  component: BlueprintDetail,
});

type DraftComp = {
  id?: string;
  slot_label: string;
  item_name: string;
  item_ref?: string | null;
  qty: number;
  unit: Unit;
  weight: number;
};

type Pick = {
  stack_id: string;
  qty_used: number;
  quality_override: number | null;
};

function qualityTone(q: number | null) {
  if (q === null) return "text-muted-foreground";
  if (q >= 80) return "text-emerald-400";
  if (q >= 50) return "text-amber-400";
  return "text-rose-400";
}

function BlueprintDetail() {
  const { id } = Route.useParams();
  return <BlueprintDetailView id={id} />;
}

export function BlueprintDetailView({
  id,
  onClose,
}: {
  id: string;
  onClose?: () => void;
}) {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const getFn = useServerFn(getBlueprint);
  const upFn = useServerFn(upsertBlueprint);
  const delFn = useServerFn(deleteBlueprint);
  const missFn = useServerFn(upsertMission);
  const invFn = useServerFn(listInventory);
  const locFn = useServerFn(listMyLocations);
  const craftFn = useServerFn(craft);

  const bpQ = useQuery({
    queryKey: ["blueprint", id],
    queryFn: () => getFn({ data: { id } }),
  });
  const invQ = useQuery({
    queryKey: ["inventory", "all"],
    queryFn: () => invFn({ data: { scope: "all" } }),
  });
  const locQ = useQuery({
    queryKey: ["locations"],
    queryFn: () => locFn(),
  });

  // Header draft (editable metadata)
  const [header, setHeader] = useState({
    item_name: "",
    item_ref: "" as string | "",
    output_qty: 1,
    visibility: "private" as "private" | "org",
    source_url: "",
    source_mission_ref: "",
    notes: "",
  });
  const [draft, setDraft] = useState<DraftComp[]>([]);
  const [picks, setPicks] = useState<Record<string, Pick>>({});
  const [outputLocId, setOutputLocId] = useState<string>("");
  const [missionOpen, setMissionOpen] = useState(false);
  const [missionForm, setMissionForm] = useState({
    mission_ref: "",
    name: "",
    faction: "",
    rank: "",
    payout: 0,
    location: "",
    reputation: "",
    url: "",
  });

  useEffect(() => {
    if (!bpQ.data) return;
    const { blueprint: bp, components } = bpQ.data;
    setHeader({
      item_name: bp.item_name,
      item_ref: bp.item_ref ?? "",
      output_qty: Number(bp.output_qty),
      visibility: bp.visibility,
      source_url: bp.source_url ?? "",
      source_mission_ref: bp.source_mission_ref ?? "",
      notes: bp.notes ?? "",
    });
    setDraft(
      components.map((c: BlueprintComponent) => ({
        id: c.id,
        slot_label: c.slot_label,
        item_name: c.item_name,
        item_ref: c.item_ref,
        qty: Number(c.qty),
        unit: (c.unit ?? "pcs") as Unit,
        weight: Number(c.weight),
      })),
    );
    // initialize picks to required qty
    const init: Record<string, Pick> = {};
    components.forEach((c) => {
      init[c.id] = { stack_id: "", qty_used: Number(c.qty), quality_override: null };
    });
    setPicks(init);
  }, [bpQ.data]);

  const bp = bpQ.data?.blueprint;
  const comps = bpQ.data?.components ?? [];
  const inv = invQ.data?.items ?? [];
  const locs = locQ.data ?? [];

  const candidatesFor = (c: BlueprintComponent) =>
    inv
      .filter(
        (i) =>
          i.is_owner &&
          i.unit === (c.unit ?? "pcs") &&
          (i.item_name.toLowerCase() === c.item_name.toLowerCase() ||
            (c.item_ref && i.item_ref === c.item_ref)),
      )
      .sort((a, b) => (b.qty_available || 0) - (a.qty_available || 0));

  // Live calculation
  const calc = useMemo(() => {
    let wSum = 0;
    let wTot = 0;
    const missing: string[] = [];
    const lines: Array<{
      slot: string;
      qty: number;
      qty_used: number;
      item: string;
      quality: number | null;
      stack_id: string;
    }> = [];
    for (const c of comps) {
      const p = picks[c.id];
      const stack = inv.find((s) => s.id === p?.stack_id);
      if (!p || !stack) {
        missing.push(`${c.slot_label}: ${formatQty(Number(c.qty), c.unit)} ${c.item_name}`);
        continue;
      }
      if (stack.qty_available < p.qty_used) {
        missing.push(
          `${c.slot_label}: ${formatQty(p.qty_used, c.unit)} ${c.item_name} (nur ${formatQty(stack.qty_available, c.unit)} verf.)`,
        );
      }
      const q = p.quality_override ?? stack.quality;
      if (q !== null && q !== undefined) {
        wSum += Number(c.weight) * Number(q);
        wTot += Number(c.weight);
      }
      lines.push({
        slot: c.slot_label,
        qty: Number(c.qty),
        qty_used: p.qty_used,
        item: stack.item_name,
        quality: q ?? null,
        stack_id: stack.id,
      });
    }
    const quality = wTot > 0 ? Math.round(wSum / wTot) : null;
    return { quality, missing, lines };
  }, [comps, picks, inv]);

  if (bpQ.isLoading)
    return <div className="p-6 text-sm">// laden…</div>;
  if (!bp)
    return (
      <div className="p-6 text-sm">
        Blueprint nicht gefunden oder kein Zugriff.{" "}
        <Link to="/blueprints" className="text-brand underline">
          Zurück
        </Link>
      </div>
    );

  const canCraft =
    bp.is_owner && comps.length > 0 && calc.missing.length === 0;

  const pickByQuality = (mode: "best" | "worst") => {
    const next: Record<string, Pick> = { ...picks };
    for (const c of comps) {
      const cands = candidatesFor(c).filter(
        (i) => i.qty_available >= Number(c.qty),
      );
      cands.sort((a, b) =>
        mode === "best"
          ? (b.quality ?? -1) - (a.quality ?? -1)
          : (a.quality ?? 999) - (b.quality ?? 999),
      );
      if (cands[0]) {
        next[c.id] = {
          stack_id: cands[0].id,
          qty_used: Number(c.qty),
          quality_override: null,
        };
      }
    }
    setPicks(next);
  };

  const saveAll = async () => {
    try {
      await upFn({
        data: {
          id: bp.id,
          item_name: header.item_name.trim(),
          item_ref: header.item_ref || null,
          output_qty: Number(header.output_qty) || 1,
          source_mission_ref: header.source_mission_ref || null,
          source_url: header.source_url || null,
          visibility: header.visibility,
          notes: header.notes || null,
          components: draft.map((d) => ({
            slot_label: d.slot_label,
            item_name: d.item_name,
            item_ref: d.item_ref ?? null,
            qty: Number(d.qty),
            unit: d.unit,
            weight: Number(d.weight),
          })),
        },
      });
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["blueprint", id] });
      qc.invalidateQueries({ queryKey: ["blueprints"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doDelete = async () => {
    if (!confirm("Blueprint wirklich löschen?")) return;
    try {
      await delFn({ data: { id: bp.id } });
      toast.success("Gelöscht");
      qc.invalidateQueries({ queryKey: ["blueprints"] });
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] });
      if (onClose) onClose();
      else navigate({ to: "/blueprints" });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const doCraft = async () => {
    try {
      const result = await craftFn({
        data: {
          blueprint_id: bp.id,
          output_qty: Number(header.output_qty) || 1,
          output_location_id: outputLocId || null,
          picks: comps.map((c) => {
            const p = picks[c.id];
            return {
              component_id: c.id,
              inventory_stack_id: p.stack_id,
              qty_used: p.qty_used,
              quality_used: p.quality_override,
            };
          }),
        },
      });
      toast.success(
        `Hergestellt! Output-Qualität: ${result.output_quality ?? "—"}`,
      );
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["craft-history"] });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const saveMission = async () => {
    try {
      await missFn({
        data: {
          mission_ref: missionForm.mission_ref.trim(),
          name: missionForm.name.trim(),
          faction: missionForm.faction || null,
          rank: missionForm.rank || null,
          payout: Number(missionForm.payout) || null,
          location: missionForm.location || null,
          reputation: missionForm.reputation || null,
          url: missionForm.url || null,
        },
      });
      setHeader((h) => ({ ...h, source_mission_ref: missionForm.mission_ref }));
      setMissionOpen(false);
      toast.success("Mission gespeichert (Speichern nicht vergessen)");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      {!onClose && (
        <Link
          to="/blueprints"
          className="inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
        >
          <ArrowLeft className="h-3 w-3" /> Blueprints
        </Link>
      )}

      {/* HEADER */}
      <header className="space-y-3 border-b border-brand/10 pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <h1 className="font-display text-3xl tracking-tight">
              {header.item_name || "Neue Blaupause"}
            </h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
              // output {header.output_qty}× · {comps.length} bestandteile
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline">
              {header.visibility === "org" ? (
                <>
                  <Users className="mr-1 h-3 w-3" /> orga
                </>
              ) : (
                <>
                  <Lock className="mr-1 h-3 w-3" /> privat
                </>
              )}
            </Badge>
            {bp.is_owner && (
              <>
                <Button size="sm" onClick={saveAll}>
                  <Save className="mr-1 h-3 w-3" /> Speichern
                </Button>
                <Button size="sm" variant="ghost" onClick={doDelete}>
                  <Trash2 className="mr-1 h-3 w-3 text-destructive" />
                  <span className="text-destructive">Löschen</span>
                </Button>
              </>
            )}
            {bp.id && (
              <Button size="sm" variant="secondary" asChild>
                <Link
                  to="/crafting"
                  search={{ bp: bp.id as string }}
                >
                  <Hammer className="mr-1 h-3 w-3" /> Craften
                </Link>
              </Button>
            )}
          </div>
        </div>

        {bp.is_owner ? (
          <div className="grid gap-3 md:grid-cols-[2fr_120px_140px_1fr]">
            <div className="grid gap-1">
              <Label className="text-xs">Item-Name</Label>
              <Input
                value={header.item_name}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, item_name: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Output</Label>
              <Input
                type="number"
                min={1}
                value={header.output_qty}
                onChange={(e) =>
                  setHeader((h) => ({
                    ...h,
                    output_qty: Number(e.target.value),
                  }))
                }
              />
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Sichtbarkeit</Label>
              <Select
                value={header.visibility}
                onValueChange={(v) =>
                  setHeader((h) => ({
                    ...h,
                    visibility: v as "private" | "org",
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="private">Privat</SelectItem>
                  <SelectItem value="org">Orga</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label className="text-xs">Quell-URL (SCMDB / Wiki)</Label>
              <Input
                placeholder="https://scmdb.net/…"
                value={header.source_url}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, source_url: e.target.value }))
                }
              />
            </div>
            <div className="grid gap-1 md:col-span-4">
              <Label className="text-xs">Notizen</Label>
              <Textarea
                rows={2}
                value={header.notes}
                onChange={(e) =>
                  setHeader((h) => ({ ...h, notes: e.target.value }))
                }
              />
            </div>
          </div>
        ) : null}

        {/* Mission card */}
        <div className="flex flex-wrap items-center gap-3">
          {bp.mission ? (
            <a
              href={header.source_url || bp.mission.url || "#"}
              target="_blank"
              rel="noreferrer"
              className="group flex min-w-0 flex-1 items-center gap-3 border border-brand/20 bg-background/60 p-3 hover:border-brand/60"
            >
              <div className="min-w-0 flex-1">
                <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">
                  // quell-mission
                </div>
                <div className="truncate font-display">{bp.mission.name}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {[bp.mission.faction, bp.mission.rank, bp.mission.location]
                    .filter(Boolean)
                    .join(" · ")}
                  {bp.mission.payout
                    ? ` · ${bp.mission.payout.toLocaleString("de-DE")} aUEC`
                    : ""}
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-brand" />
            </a>
          ) : (
            bp.is_owner &&
            (!bpQ.data?.wiki_missions || bpQ.data.wiki_missions.length === 0) && (
              <div className="flex-1 border border-dashed border-brand/20 p-3 text-xs text-muted-foreground">
                Keine Quell-Mission verknüpft.
              </div>
            )
          )}
          {bp.is_owner && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setMissionForm({
                  mission_ref: header.source_mission_ref || "",
                  name: bp.mission?.name || "",
                  faction: bp.mission?.faction || "",
                  rank: bp.mission?.rank || "",
                  payout: bp.mission?.payout || 0,
                  location: bp.mission?.location || "",
                  reputation: bp.mission?.reputation || "",
                  url: bp.mission?.url || header.source_url || "",
                });
                setMissionOpen(true);
              }}
            >
              <Pencil className="mr-1 h-3 w-3" /> Mission
            </Button>
          )}
        </div>
      </header>

      {/* Wiki-Missionen (alle, die diese Blaupause freischalten) */}
      {bpQ.data?.wiki_missions && bpQ.data.wiki_missions.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // missionen ({bpQ.data.wiki_missions.length})
            </h2>
            <span className="font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
              quelle: star citizen wiki
            </span>
          </div>
          <div className="grid gap-2 md:grid-cols-2">
            {bpQ.data.wiki_missions.map((m) => {
              const reward =
                m.reward_min || m.reward_max
                  ? `${(m.reward_min ?? m.reward_max ?? 0).toLocaleString("de-DE")}${
                      m.reward_max && m.reward_max !== m.reward_min
                        ? `–${m.reward_max.toLocaleString("de-DE")}`
                        : ""
                    } aUEC`
                  : null;
              const loc =
                m.star_systems && m.star_systems.length > 0
                  ? m.star_systems.join(", ")
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
                      <div className="truncate font-display text-sm">
                        {m.title}
                      </div>
                      <div className="truncate font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                        {[m.giver, m.faction, m.reward_scope]
                          .filter(Boolean)
                          .join(" · ") || "—"}
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
                        Ruf ab: {m.min_standing_name}
                        {m.min_reputation != null
                          ? ` (${m.min_reputation.toLocaleString("de-DE")})`
                          : ""}
                      </Badge>
                    )}
                    {m.max_standing_name &&
                      m.max_standing_name !== m.min_standing_name && (
                        <Badge variant="outline" className="border-brand/20 text-muted-foreground">
                          bis: {m.max_standing_name}
                        </Badge>
                      )}
                    {reward && (
                      <span className="text-muted-foreground">{reward}</span>
                    )}
                  </div>
                  {loc && (
                    <div className="truncate text-[11px] text-muted-foreground">
                      📍 {loc}
                    </div>
                  )}
                  {m.web_url && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        window.open(m.web_url!, "_blank", "noreferrer");
                      }}
                      className="mt-1 inline-flex w-fit items-center gap-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70 hover:text-brand"
                    >
                      Wiki <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <div className="grid gap-6">
        {/* COMPONENTS */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // bestandteile
            </h2>
            {bp.is_owner && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setDraft((d) => [
                    ...d,
                    {
                      slot_label: `Slot ${d.length + 1}`,
                      item_name: "",
                      qty: 1,
                      unit: "pcs",
                      weight: 1,
                    },
                  ])
                }
              >
                <Plus className="mr-1 h-3 w-3" /> Bestandteil
              </Button>
            )}
          </div>

          {bp.is_owner ? (
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_2fr_80px_80px_80px_auto] gap-2 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                <div>Slot</div>
                <div>Item</div>
                <div>Menge</div>
                <div>Einheit</div>
                <div>Gewicht</div>
                <div></div>
              </div>
              {draft.length === 0 && (
                <p className="border border-dashed border-brand/15 p-4 text-center text-xs text-muted-foreground">
                  Noch keine Bestandteile.
                </p>
              )}
              {draft.map((d, i) => (
                <div
                  key={i}
                  className="grid grid-cols-[1fr_2fr_80px_80px_80px_auto] items-center gap-2 border border-brand/10 bg-background/40 p-2"
                >
                  <Input
                    value={d.slot_label}
                    onChange={(e) =>
                      setDraft((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, slot_label: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    value={d.item_name}
                    placeholder="Item-Name"
                    onChange={(e) =>
                      setDraft((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, item_name: e.target.value } : x,
                        ),
                      )
                    }
                  />
                  <Input
                    type="number"
                    step="0.01"
                    value={d.qty}
                    onChange={(e) =>
                      setDraft((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, qty: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  <Select
                    value={d.unit}
                    onValueChange={(v) =>
                      setDraft((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, unit: v as Unit } : x,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pcs">Stk.</SelectItem>
                      <SelectItem value="scu">SCU</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.1"
                    value={d.weight}
                    onChange={(e) =>
                      setDraft((arr) =>
                        arr.map((x, j) =>
                          j === i ? { ...x, weight: Number(e.target.value) } : x,
                        ),
                      )
                    }
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setDraft((arr) => arr.filter((_, j) => j !== i))
                    }
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              <p className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                // gewicht fließt als faktor in die output-qualität ein (Σ q·w / Σ w)
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              {comps.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between border border-brand/10 p-2 text-sm"
                >
                  <span className="flex items-center gap-1">
                    <span className="text-muted-foreground">
                      {c.slot_label}:{" "}
                    </span>
                    {formatQty(Number(c.qty), c.unit)}{" "}
                    {(() => {
                      const ref =
                        c.item_ref ??
                        (c.external_uuid ? `wiki:${c.external_uuid}` : null) ??
                        (c.item_name ? `name:${c.item_name}` : null);
                      return ref ? (
                        <Link
                          to="/materialien/$ref"
                          params={{ ref: encodeURIComponent(ref) }}
                          className="inline-flex items-center gap-1 text-brand hover:underline"
                          title="Material-Details & Bezugsquellen anzeigen"
                        >
                          {c.item_name}
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      ) : (
                        <span>{c.item_name}</span>
                      );
                    })()}
                  </span>
                  <span className="font-mono text-[9px] uppercase text-muted-foreground">
                    weight {c.weight}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* CRAFTING OVERVIEW (Materialien · Qualität · Modifier · Output) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
            // crafting übersicht
          </h2>
        </div>
        <CraftingPanel blueprintId={bp.id as string} />
      </section>

      {/* Mission dialog */}
      <Dialog open={missionOpen} onOpenChange={setMissionOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quell-Mission verknüpfen</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1">
                <Label className="text-xs">Mission-Ref (Slug)</Label>
                <Input
                  value={missionForm.mission_ref}
                  onChange={(e) =>
                    setMissionForm((m) => ({
                      ...m,
                      mission_ref: e.target.value,
                    }))
                  }
                  placeholder="scmdb-slug"
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Name</Label>
                <Input
                  value={missionForm.name}
                  onChange={(e) =>
                    setMissionForm((m) => ({ ...m, name: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Faction</Label>
                <Input
                  value={missionForm.faction}
                  onChange={(e) =>
                    setMissionForm((m) => ({ ...m, faction: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Rang</Label>
                <Input
                  value={missionForm.rank}
                  onChange={(e) =>
                    setMissionForm((m) => ({ ...m, rank: e.target.value }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Payout (aUEC)</Label>
                <Input
                  type="number"
                  value={missionForm.payout}
                  onChange={(e) =>
                    setMissionForm((m) => ({
                      ...m,
                      payout: Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="grid gap-1">
                <Label className="text-xs">Location</Label>
                <Input
                  value={missionForm.location}
                  onChange={(e) =>
                    setMissionForm((m) => ({ ...m, location: e.target.value }))
                  }
                />
              </div>
              <div className="col-span-2 grid gap-1">
                <Label className="text-xs">URL</Label>
                <Input
                  value={missionForm.url}
                  onChange={(e) =>
                    setMissionForm((m) => ({ ...m, url: e.target.value }))
                  }
                  placeholder="https://scmdb.net/…"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMissionOpen(false)}>
              Abbrechen
            </Button>
            <Button onClick={saveMission}>Übernehmen</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}