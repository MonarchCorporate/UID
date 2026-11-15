import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { getCraftPreview, craft } from "@/lib/crafting.functions";
import { listMyLocations } from "@/lib/inventory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { Sparkles, Info, Lock, ChevronsUpDown } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const fmtQty = (n: number | null | undefined) =>
  Number(n ?? 0).toLocaleString("de-DE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const PROPERTY_LABELS_DE: Record<string, string> = {
  health_maxhealth: "Hüllen-Integrität",
  shield_maxhealth: "Schildkapazität",
  shield_regeneration: "Schild-Regeneration",
  shield_hardness: "Schild-Härte",
  damage: "Schaden",
  damage_per_shot: "Schaden pro Schuss",
  fire_rate: "Feuerrate",
  range: "Reichweite",
  projectile_speed: "Projektilgeschwindigkeit",
  ammo_capacity: "Magazingröße",
  heat_capacity: "Hitzekapazität",
  cooling_rate: "Kühlrate",
  power_draw: "Energieverbrauch",
  power_output: "Energieausgabe",
  thrust: "Schubkraft",
  fuel_capacity: "Treibstoffkapazität",
  mass: "Masse",
};

function localizeLabel(label: string, key: string | null): string {
  if (key && PROPERTY_LABELS_DE[key]) return PROPERTY_LABELS_DE[key];
  return label;
}

type Segment = {
  start_q: number;
  end_q: number;
  mod_at_start: number;
  mod_at_end: number;
};

function evalSegs(
  segments: Segment[],
  q: number,
  modifierType: "multiplier" | "additive" = "multiplier",
): number {
  const neutral = modifierType === "additive" ? 0 : 1;
  if (!segments || segments.length === 0) return neutral;
  const sorted = segments
    .map((s) => ({
      start_q: Number(s.start_q),
      end_q: Number(s.end_q),
      mod_at_start: Number.isFinite(Number(s.mod_at_start))
        ? Number(s.mod_at_start)
        : neutral,
      mod_at_end: Number.isFinite(Number(s.mod_at_end))
        ? Number(s.mod_at_end)
        : neutral,
    }))
    .sort((a, b) => a.start_q - b.start_q);
  if (q <= sorted[0].start_q) return sorted[0].mod_at_start;
  const last = sorted[sorted.length - 1];
  if (q >= last.end_q) return last.mod_at_end;
  for (const s of sorted) {
    if (q >= s.start_q && q <= s.end_q) {
      const span = s.end_q - s.start_q;
      const t = span > 0 ? (q - s.start_q) / span : 0;
      return s.mod_at_start + (s.mod_at_end - s.mod_at_start) * t;
    }
  }
  return neutral;
}

export function CraftingPanel({ blueprintId }: { blueprintId: string }) {
  const qc = useQueryClient();
  const locFn = useServerFn(listMyLocations);
  const previewFn = useServerFn(getCraftPreview);
  const craftFn = useServerFn(craft);

  const [multiplier, setMultiplier] = useState<number>(1);
  const [locationId, setLocationId] = useState<string>("");
  const [locOpen, setLocOpen] = useState(false);
  const [slotQualities, setSlotQualities] = useState<Record<string, number>>({});
  const [debouncedSlotQualities, setDebouncedSlotQualities] = useState<Record<string, number>>({});
  const [onlyAvailable, setOnlyAvailable] = useState<boolean>(false);
  const [hydrated, setHydrated] = useState<boolean>(false);

  // Hydrate from LocalStorage when blueprint changes
  useEffect(() => {
    setHydrated(false);
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`crafting:setup:${blueprintId}`);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          v?: number;
          multiplier?: number;
          locationId?: string;
          slotQualities?: Record<string, number>;
          onlyAvailable?: boolean;
        };
        if (parsed && parsed.v === 1) {
          setMultiplier(
            Number.isFinite(parsed.multiplier) ? Number(parsed.multiplier) : 1,
          );
          setLocationId(typeof parsed.locationId === "string" ? parsed.locationId : "");
          setSlotQualities(parsed.slotQualities ?? {});
          setDebouncedSlotQualities(parsed.slotQualities ?? {});
          setOnlyAvailable(!!parsed.onlyAvailable);
          setHydrated(true);
          return;
        }
      }
    } catch {
      // ignore corrupt payloads
    }
    setMultiplier(1);
    setLocationId("");
    setSlotQualities({});
    setDebouncedSlotQualities({});
    setOnlyAvailable(false);
    setHydrated(true);
  }, [blueprintId]);

  // Persist setup to LocalStorage (debounced)
  useEffect(() => {
    if (!hydrated || typeof window === "undefined") return;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(
          `crafting:setup:${blueprintId}`,
          JSON.stringify({
            v: 1,
            multiplier,
            locationId,
            slotQualities,
            onlyAvailable,
          }),
        );
      } catch {
        // quota / private mode – ignore
      }
    }, 250);
    return () => clearTimeout(t);
  }, [hydrated, blueprintId, multiplier, locationId, slotQualities, onlyAvailable]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSlotQualities(slotQualities), 250);
    return () => clearTimeout(t);
  }, [slotQualities]);

  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
  });
  const locations = locsQ.data ?? [];
  const selectedLoc = locations.find((l) => l.id === locationId);

  const slotKey = useMemo(
    () =>
      Object.entries(debouncedSlotQualities)
        .filter(([, v]) => Number.isFinite(v))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => `${k}:${v}`)
        .join("|"),
    [debouncedSlotQualities],
  );

  const previewQ = useQuery({
    enabled: !!blueprintId && multiplier > 0,
    queryKey: ["craft-preview", blueprintId, multiplier, locationId || null, slotKey],
    queryFn: () =>
      previewFn({
        data: {
          blueprint_id: blueprintId,
          multiplier,
          output_location_id: locationId || null,
          slot_qualities: debouncedSlotQualities,
        },
      }),
    placeholderData: keepPreviousData,
  });

  const craftMut = useMutation({
    mutationFn: () =>
      craftFn({
        data: {
          blueprint_id: blueprintId,
          multiplier,
          output_location_id: locationId || null,
          slot_qualities: slotQualities,
        },
      }),
    onSuccess: (res) => {
      toast.success(`Hergestellt – ${res.output_quality ?? "—"} Q`);
      // Setup nach erfolgreichem Craft zurücksetzen
      try {
        window.localStorage.removeItem(`crafting:setup:${blueprintId}`);
      } catch {
        // ignore
      }
      setMultiplier(1);
      setLocationId("");
      setSlotQualities({});
      setDebouncedSlotQualities({});
      qc.invalidateQueries({ queryKey: ["craft-preview"] });
      qc.invalidateQueries({ queryKey: ["craft-history"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["bp-catalog-crafting"] });
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] });
      qc.invalidateQueries({ queryKey: ["blueprint", blueprintId] });
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const preview = previewQ.data;

  const liveGroups = useMemo(() => {
    if (!preview) return [];
    const compById = new Map(
      preview.components.map((c) => [
        c.component_id,
        {
          id: c.component_id,
          required_qty: c.required_qty,
          auto_quality: c.auto_quality,
        },
      ] as const),
    );
    const qOf = (compId: string, auto: number | null) =>
      slotQualities[compId] ?? auto;
    return (preview.modifier_groups ?? []).map((g) => {
      const sliderMin = g.slider_min ?? 0;
      const sliderMax = g.slider_max ?? 1000;
      const initQ = g.initial_quality ?? 500;
      const members = (g.member_component_ids ?? [])
        .map((id) => compById.get(id))
        .filter(
          (c): c is { id: string; required_qty: number; auto_quality: number | null } =>
            !!c,
        );
      let gq: number | null = null;
      let sum = 0;
      let w = 0;
      for (const m of members) {
        const q = qOf(m.id, m.auto_quality);
        if (q === null || q === undefined) continue;
        sum += q * m.required_qty;
        w += m.required_qty;
      }
      // Ohne zugewiesenes Material: der vom Wiki vorgegebene Slot-Default
      // (meist 500) — nicht der Blueprint-Gesamtdurchschnitt, sonst wären
      // alle Slots gekoppelt.
      gq = w > 0 ? sum / w : initQ;
      // Clamp aufs Wiki-Slider-Fenster.
      gq = Math.min(sliderMax, Math.max(sliderMin, gq));
      const mods = g.modifiers.map((m) => {
        const value = evalSegs(m.segments, gq ?? 500, m.modifier_type ?? "multiplier");
        return { ...m, value };
      });
      return { ...g, group_quality: gq === null ? null : Math.round(gq), modifiers: mods };
    });
  }, [preview, slotQualities]);

  const liveFinalModifiers = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; better_when: "higher" | "lower" | null; multiplier_pct: number; additive: number }
    >();
    for (const g of liveGroups) {
      if (g.group_quality === null) continue;
      for (const m of g.modifiers) {
        const key = m.property_key ?? m.label;
        const ex = map.get(key);
        const modifierType = m.modifier_type ?? "multiplier";
        if (ex) {
          if (modifierType === "additive") ex.additive += m.value;
          else ex.multiplier_pct += (m.value - 1) * 100;
        } else {
          map.set(key, {
            key,
            label: m.label,
            better_when: m.better_when,
            multiplier_pct: modifierType === "additive" ? 0 : (m.value - 1) * 100,
            additive: modifierType === "additive" ? m.value : 0,
          });
        }
      }
    }
    return Array.from(map.values());
  }, [liveGroups]);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 border border-brand/10 bg-background/60 p-4">
        <div className="space-y-2">
          <Label>Menge (Multiplikator)</Label>
          <Input
            type="number"
            min={1}
            max={100}
            value={multiplier}
            onChange={(e) =>
              setMultiplier(Math.max(1, Math.min(100, Number(e.target.value) || 1)))
            }
          />
        </div>
        <div className="space-y-2">
          <Label>
            Ziel-Lagerort{" "}
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              (optional)
            </span>
          </Label>
          <Popover open={locOpen} onOpenChange={setLocOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                role="combobox"
                className={cn(
                  "w-full justify-between font-normal",
                  !selectedLoc && "text-muted-foreground",
                )}
              >
                {selectedLoc ? selectedLoc.name : "— ohne Lagerort —"}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              className="w-[--radix-popover-trigger-width] p-0"
              align="start"
            >
              <Command
                filter={(val, search) =>
                  val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }
              >
                <CommandInput placeholder="Lagerort suchen…" />
                <CommandList className="max-h-72">
                  <CommandEmpty>Kein Treffer.</CommandEmpty>
                  <CommandGroup>
                    <CommandItem
                      value="ohne lagerort kein none"
                      onSelect={() => {
                        setLocationId("");
                        setLocOpen(false);
                      }}
                    >
                      — ohne Lagerort —
                    </CommandItem>
                    {locations.map((l) => (
                      <CommandItem
                        key={l.id}
                        value={l.name}
                        onSelect={() => {
                          setLocationId(l.id);
                          setLocOpen(false);
                        }}
                      >
                        {l.name}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div className="md:col-span-2 flex items-center gap-2 pt-1">
          <Checkbox
            id="only-available"
            checked={onlyAvailable}
            onCheckedChange={(v) => setOnlyAvailable(v === true)}
          />
          <Label
            htmlFor="only-available"
            className="cursor-pointer font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground"
          >
            Nur vorhandene Qualitäten anbieten
          </Label>
        </div>
      </div>

      {previewQ.isLoading ? (
        <div className="border border-brand/10 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          // berechne…
        </div>
      ) : previewQ.error ? (
        <div className="border border-red-500/30 bg-red-500/5 p-4 text-sm text-red-300">
          {(previewQ.error as Error).message}
        </div>
      ) : preview ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-3">
            <h3 className="font-display text-xl">Materialien</h3>
            {preview.components.length === 0 ? (
              <div className="border border-brand/10 p-6 text-sm text-muted-foreground">
                Diese Blaupause hat keine eingetragenen Materialien.
              </div>
            ) : (
              preview.components.map((c) => (
                <div
                  key={c.component_id}
                  className={cn(
                    "border p-3",
                    c.shortage > 0
                      ? "border-red-500/40 bg-red-500/5"
                      : "border-brand/10 bg-background/60",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      {c.item_ref ? (
                        <Link
                          to="/materialien/$ref"
                          params={{ ref: encodeURIComponent(c.item_ref) }}
                          className="font-display text-base text-brand hover:underline"
                          title="Material-Details & Bezugsquellen anzeigen"
                        >
                          {c.item_name}
                        </Link>
                      ) : (
                        <Link
                          to="/materialien/$ref"
                          params={{ ref: encodeURIComponent(`name:${c.item_name}`) }}
                          className="font-display text-base text-brand hover:underline"
                          title="Material-Details & Bezugsquellen anzeigen"
                        >
                          {c.item_name}
                        </Link>
                      )}
                      <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                        {c.slot_label || c.kind || "—"}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Badge variant="outline">
                        benötigt {fmtQty(c.required_qty)} {c.unit}
                      </Badge>
                      <Badge variant="outline">
                        verfügbar {fmtQty(c.available_qty)}
                      </Badge>
                      {c.auto_quality !== null && (
                        <Badge variant="outline">
                          Auto Q {Math.round(c.auto_quality)}
                        </Badge>
                      )}
                      {c.shortage > 0 && (
                        <Badge className="bg-red-500/20 text-red-300 border-red-500/40">
                          fehlen {fmtQty(c.shortage)}
                        </Badge>
                      )}
                    </div>
                  </div>
                  {onlyAvailable ? (
                    <div className="mt-3">
                      <StackQualityPicker
                        component={c}
                        value={slotQualities[c.component_id]}
                        onSelect={(q) =>
                          setSlotQualities((prev) => ({ ...prev, [c.component_id]: q }))
                        }
                        onAuto={() =>
                          setSlotQualities((prev) => {
                            const next = { ...prev };
                            delete next[c.component_id];
                            return next;
                          })
                        }
                      />
                    </div>
                  ) : (
                    (() => {
                      const grp = liveGroups.find(
                        (g) =>
                          g.member_component_ids?.includes(c.component_id) ||
                          g.name === (c.slot_label ?? ""),
                      );
                      const sMin = grp?.slider_min ?? 0;
                      const sMax = grp?.slider_max ?? 1000;
                      const sInit = grp?.initial_quality ?? 500;
                      const dynamic = grp?.has_dynamic_modifiers ?? true;
                      const clamp = (n: number) =>
                        Math.max(sMin, Math.min(sMax, n));
                      const currentQ = clamp(
                        slotQualities[c.component_id] ??
                          c.quality_used ??
                          c.auto_quality ??
                          sInit,
                      );
                      if (!dynamic) {
                        return (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                            <Badge variant="outline" className="font-mono">
                              konstante Qualität · Q {sInit}
                            </Badge>
                            <span className="text-[10px]">
                              Slider hat für diese Zutat laut Wiki keinen
                              Einfluss auf das Ergebnis.
                            </span>
                          </div>
                        );
                      }
                      return (
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto] md:items-center">
                          <div className="flex items-center gap-3">
                            <Label className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap">
                              Quality
                            </Label>
                            <Slider
                              value={[currentQ]}
                              min={sMin}
                              max={sMax}
                              step={1}
                              onValueChange={(v) =>
                                setSlotQualities((prev) => ({
                                  ...prev,
                                  [c.component_id]: clamp(v[0]),
                                }))
                              }
                              className="flex-1"
                            />
                          </div>
                          <Input
                            type="number"
                            min={sMin}
                            max={sMax}
                            value={currentQ}
                            onChange={(e) =>
                              setSlotQualities((prev) => ({
                                ...prev,
                                [c.component_id]: clamp(
                                  Number(e.target.value) || sMin,
                                ),
                              }))
                            }
                            className="w-24 h-8 text-right font-mono"
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setSlotQualities((prev) => {
                                const next = { ...prev };
                                delete next[c.component_id];
                                return next;
                              })
                            }
                            disabled={slotQualities[c.component_id] === undefined}
                          >
                            Auto
                          </Button>
                        </div>
                      );
                    })()
                  )}
                  {c.picks.length > 0 && (
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                      {c.picks.map((p, i) => (
                        <div key={i} className="flex justify-between gap-2 font-mono">
                          <span className="truncate">
                            ↳ {p.item_name} · {p.location_name ?? "ohne Lager"}
                          </span>
                          <span>
                            {fmtQty(p.qty_use)}× · Q{" "}
                            {p.stack_quality === null ? "—" : p.stack_quality}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const grp = liveGroups.find(
                      (g) =>
                        g.member_component_ids?.includes(c.component_id) ||
                        g.name === (c.slot_label ?? ""),
                    );
                    if (!grp || grp.modifiers.length === 0) return null;
                    const qNow = slotQualities[c.component_id] ?? c.auto_quality;
                    return (
                      <div className="mt-2 border-t border-brand/10 pt-2 space-y-0.5">
                        <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                          // beeinflusst
                        </div>
                        {grp.modifiers.map((m, mi) => {
                          const modifierType = m.modifier_type ?? "multiplier";
                          const neutral = modifierType === "additive" ? 0 : 1;
                          const currentValue =
                            qNow === null || qNow === undefined
                              ? null
                              : evalSegs(m.segments, qNow, modifierType);
                          const pct =
                            currentValue === null
                              ? null
                              : modifierType === "additive"
                                ? currentValue
                                : (currentValue - 1) * 100;
                          const minPct =
                            modifierType === "additive"
                              ? evalSegs(m.segments, 0, modifierType)
                              : (evalSegs(m.segments, 0, modifierType) - 1) * 100;
                          const maxPct =
                            modifierType === "additive"
                              ? evalSegs(m.segments, 1000, modifierType)
                              : (evalSegs(m.segments, 1000, modifierType) - 1) * 100;
                          const good =
                            pct !== null &&
                            ((m.better_when === "higher" && pct > neutral - (modifierType === "additive" ? 0 : 1)) ||
                              (m.better_when === "lower" && pct < neutral - (modifierType === "additive" ? 0 : 1)));
                          const bad =
                            pct !== null &&
                            ((m.better_when === "higher" && pct < neutral - (modifierType === "additive" ? 0 : 1)) ||
                              (m.better_when === "lower" && pct > neutral - (modifierType === "additive" ? 0 : 1)));
                          const cls = good ? "text-emerald-300" : bad ? "text-rose-300" : "text-zinc-200";
                          const fmt = (p: number) =>
                            `${p >= 0 ? "+" : ""}${p.toFixed(Math.abs(p) < 0.05 ? 0 : 1)}${modifierType === "additive" ? "" : "%"}`;
                          return (
                            <div key={mi} className="flex items-center justify-between gap-2 text-[11px]">
                              <span className="truncate">
                                {localizeLabel(m.label, m.property_key)}
                                <span className="ml-1 text-[9px] text-muted-foreground">
                                  {m.better_when === "higher"
                                    ? "↑ besser"
                                    : m.better_when === "lower"
                                      ? "↓ besser"
                                      : ""}
                                </span>
                              </span>
                              <span className="font-mono whitespace-nowrap">
                                {pct === null ? (
                                  <span className="text-muted-foreground">
                                    {fmt(minPct)} … {fmt(maxPct)}
                                  </span>
                                ) : (
                                  <span className={cls}>{fmt(pct)}</span>
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>
              ))
            )}
          </div>

          <aside className="space-y-3">
            <div className="border border-brand/10 bg-background/60 p-4 space-y-2">
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em]">
                <Sparkles className="h-3 w-3" /> Output-Vorschau
              </div>
              <div className="font-display text-2xl">{preview.blueprint.item_name}</div>
              <div className="text-sm">
                Menge: <span className="font-mono">{preview.output_qty_total}</span>
              </div>
            </div>

            {liveFinalModifiers.length > 0 && (
              <div className="border border-brand/10 bg-background/60 p-3 space-y-2">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  // final combined modifiers
                </div>
                <ul className="space-y-3">
                  {liveFinalModifiers.map((fm) => {
                    const p = fm.multiplier_pct;
                    const hasMultiplier = Math.abs(fm.multiplier_pct) >= 0.005;
                    const hasAdditive = Math.abs(fm.additive) >= 0.005;
                    const good =
                      (fm.better_when === "higher" && (p > 0 || fm.additive > 0)) ||
                      (fm.better_when === "lower" && (p < 0 || fm.additive < 0));
                    const bad =
                      (fm.better_when === "higher" && (p < 0 || fm.additive < 0)) ||
                      (fm.better_when === "lower" && (p > 0 || fm.additive > 0));
                    const cls = good ? "text-emerald-300" : bad ? "text-rose-300" : "text-zinc-200";
                    const fmtPct = `${p >= 0 ? "+" : ""}${p.toFixed(Math.abs(p) < 0.05 ? 0 : 2)}%`;
                    const fmtAdd = `${fm.additive >= 0 ? "+" : ""}${fm.additive.toLocaleString("de-DE", { maximumFractionDigits: 2 })}`;
                    const fmt = hasMultiplier && hasAdditive ? `${fmtPct} ${fmtAdd}` : hasAdditive ? fmtAdd : fmtPct;
                    const baseStats =
                      (preview.blueprint as { base_stats?: Record<string, number> }).base_stats ?? {};
                    const baseKey = Object.keys(baseStats).find(
                      (k) => k.toLowerCase() === fm.key.toLowerCase(),
                    );
                    const base = baseKey ? baseStats[baseKey] : null;
                    const final = base !== null ? base * (1 + p / 100) + fm.additive : null;
                    const fmtNum = (n: number) =>
                      n >= 100
                        ? Math.round(n).toLocaleString("de-DE")
                        : n.toLocaleString("de-DE", { maximumFractionDigits: 2 });
                    return (
                      <li key={fm.key} className="space-y-1">
                        <div className="flex items-center justify-between gap-2 text-xs">
                          <span className="truncate">{localizeLabel(fm.label, fm.key)}</span>
                          <span className={cn("font-mono", cls)}>{fmt}</span>
                        </div>
                        {base !== null && final !== null && (
                          <div className="flex items-center justify-between gap-2 border-t border-brand/10 pt-1 font-mono text-[10px] text-muted-foreground">
                            <span>
                              base <span className="text-foreground">{fmtNum(base)}</span>
                            </span>
                            <span>
                              final <span className={cls}>{fmtNum(final)}</span>
                            </span>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {liveGroups.length > 0 && (
              <TooltipProvider delayDuration={150}>
                <div className="border border-brand/10 bg-background/60 p-3 space-y-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                    // beeinflusste werte
                  </div>
                  {liveGroups.map((g, gi) => {
                    const hasQ = g.group_quality !== null;
                    return (
                      <div key={gi} className="space-y-1">
                        <div className="flex items-baseline justify-between gap-2">
                          <div className="font-display text-sm">{g.name}</div>
                          {hasQ ? (
                            <div className="font-mono text-[10px] text-muted-foreground">
                              Q {g.group_quality}
                            </div>
                          ) : (
                            <div className="flex items-center gap-1 font-mono text-[10px] italic text-muted-foreground/80">
                              <Lock className="h-3 w-3" />
                              keine Materialien zugewiesen
                            </div>
                          )}
                        </div>
                        {g.modifiers.length === 0 ? (
                          <div className="text-[10px] text-muted-foreground">
                            keine Modifikatoren
                          </div>
                        ) : (
                          <ul className="space-y-0.5">
                            {g.modifiers.map((m, mi) => {
                              const modifierType = m.modifier_type ?? "multiplier";
                              const pct =
                                modifierType === "additive" ? m.value : (m.value - 1) * 100;
                              const neutral = modifierType === "additive" ? 0 : 1;
                              const segs = m.segments ?? [];
                              const sortedSegs = [...segs]
                                .map((s) => ({
                                  ...s,
                                  mod_at_start: Number.isFinite(Number(s.mod_at_start))
                                    ? Number(s.mod_at_start)
                                    : neutral,
                                  mod_at_end: Number.isFinite(Number(s.mod_at_end))
                                    ? Number(s.mod_at_end)
                                    : neutral,
                                }))
                                .sort((a, b) => a.start_q - b.start_q);
                              const minPct =
                                sortedSegs.length > 0
                                  ? modifierType === "additive"
                                    ? sortedSegs[0].mod_at_start
                                    : (sortedSegs[0].mod_at_start - 1) * 100
                                  : 0;
                              const maxPct =
                                sortedSegs.length > 0
                                  ? modifierType === "additive"
                                    ? sortedSegs[sortedSegs.length - 1].mod_at_end
                                    : (sortedSegs[sortedSegs.length - 1].mod_at_end - 1) * 100
                                  : 0;
                              const colorFor = (p: number): string => {
                                const good =
                                  (m.better_when === "higher" && p > 0) ||
                                  (m.better_when === "lower" && p < 0);
                                const bad =
                                  (m.better_when === "higher" && p < 0) ||
                                  (m.better_when === "lower" && p > 0);
                                if (good) return "text-emerald-300";
                                if (bad) return "text-rose-300";
                                return "text-zinc-200";
                              };
                              const fmt = (p: number) =>
                                `${p >= 0 ? "+" : ""}${p.toFixed(
                                  Math.abs(p) < 0.05 ? 0 : 1,
                                )}${modifierType === "additive" ? "" : "%"}`;
                              const name = localizeLabel(m.label, m.property_key);
                              const arrow =
                                m.better_when === "higher"
                                  ? "↑ besser"
                                  : m.better_when === "lower"
                                    ? "↓ besser"
                                    : "";
                              return (
                                <li
                                  key={mi}
                                  className="flex items-center justify-between gap-2 text-xs"
                                >
                                  <span className="truncate">
                                    {name}
                                    {arrow && (
                                      <span className="ml-1 text-[9px] text-muted-foreground">
                                        {arrow}
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono flex items-center gap-1 whitespace-nowrap">
                                    {hasQ ? (
                                      <span className={colorFor(pct)}>{fmt(pct)}</span>
                                    ) : (
                                      <span className="flex items-center gap-1">
                                        <span
                                          className={colorFor(minPct)}
                                          title="bei Q 0 (schlechteste Qualität)"
                                        >
                                          {fmt(minPct)}
                                        </span>
                                        <span className="text-[9px] text-muted-foreground">…</span>
                                        <span
                                          className={colorFor(maxPct)}
                                          title="bei Q 1000 (beste Qualität)"
                                        >
                                          {fmt(maxPct)}
                                        </span>
                                      </span>
                                    )}
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          className="text-muted-foreground/70 hover:text-foreground"
                                          aria-label="Erklärung anzeigen"
                                        >
                                          <Info className="h-3 w-3" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent
                                        side="left"
                                        className="max-w-[260px] text-[11px] leading-snug"
                                      >
                                        <div className="font-medium mb-1">{name}</div>
                                        <div>
                                          {modifierType === "additive"
                                            ? "Additive Änderung auf den Basiswert:"
                                            : "Linearer Multiplikator auf den Basiswert:"}
                                        </div>
                                        <div className="font-mono mt-1">
                                          Q 0 → {fmt(minPct)}
                                          <br />
                                          Q 1000 → {fmt(maxPct)}
                                        </div>
                                        <div className="mt-1 opacity-80">
                                          {arrow
                                            ? `${arrow.startsWith("↑") ? "↑" : "↓"} = in diese Richtung ist besser. `
                                            : ""}
                                          {hasQ
                                            ? `Aktuell bei Q ${g.group_quality}: ${fmt(pct)}.`
                                            : "Sobald passende Materialien zugewiesen sind, wird der aktuelle Wert berechnet."}
                                        </div>
                                      </TooltipContent>
                                    </Tooltip>
                                  </span>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                  <div className="font-mono text-[9px] text-muted-foreground">
                    // % = Abweichung vom Basiswert · 0 % = verlustfrei
                  </div>
                </div>
              </TooltipProvider>
            )}

            <Button
              className="w-full"
              disabled={!preview.can_craft || craftMut.isPending}
              onClick={() => craftMut.mutate()}
            >
              {craftMut.isPending
                ? "Stelle her…"
                : preview.can_craft
                  ? "Jetzt craften"
                  : "Material fehlt"}
            </Button>
          </aside>
        </div>
      ) : null}
    </div>
  );
}

type StackComponent = {
  component_id: string;
  required_qty: number;
  unit: string;
  auto_quality: number | null;
  available_stacks?: Array<{
    quality: number | null;
    qty_total: number;
    locations: string[];
  }>;
};

function StackQualityPicker({
  component,
  value,
  onSelect,
  onAuto,
}: {
  component: StackComponent;
  value: number | undefined;
  onSelect: (q: number) => void;
  onAuto: () => void;
}) {
  const [open, setOpen] = useState(false);
  const stacks = component.available_stacks ?? [];
  const hasStacks = stacks.length > 0;

  const isAuto = value === undefined;
  const matchedStack = !isAuto
    ? stacks.find((s) => (s.quality ?? -1) === value)
    : null;
  const isCustom = !isAuto && !matchedStack;

  const label = isAuto
    ? `Auto${component.auto_quality !== null ? ` (Q ${Math.round(component.auto_quality)})` : ""}`
    : matchedStack
      ? matchedStack.quality === null
        ? `ohne Q · ${matchedStack.qty_total}×`
        : `Q ${matchedStack.quality} · ${matchedStack.qty_total}×`
      : `Custom Q ${value}`;

  return (
    <div className="flex items-center gap-2">
      <Label className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground whitespace-nowrap">
        Quality
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            disabled={!hasStacks && isAuto}
            className="flex-1 justify-between font-normal"
          >
            <span className="truncate">
              {hasStacks ? label : "kein Bestand"}
            </span>
            <ChevronsUpDown className="ml-2 h-3 w-3 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          align="start"
        >
          <Command>
            <CommandList className="max-h-72">
              <CommandEmpty>Kein Bestand.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="auto"
                  onSelect={() => {
                    onAuto();
                    setOpen(false);
                  }}
                >
                  <span className="flex-1">
                    Auto
                    {component.auto_quality !== null && (
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground">
                        (Q {Math.round(component.auto_quality)})
                      </span>
                    )}
                  </span>
                </CommandItem>
                {isCustom && (
                  <CommandItem
                    value={`custom-${value}`}
                    onSelect={() => setOpen(false)}
                  >
                    <span className="flex-1">Custom Q {value}</span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      manuell
                    </span>
                  </CommandItem>
                )}
                {stacks.map((s, i) => {
                  const q = s.quality;
                  const k = q === null ? "null" : String(q);
                  return (
                    <CommandItem
                      key={`${k}-${i}`}
                      value={`q-${k}-${s.qty_total}`}
                      onSelect={() => {
                        // null → 0 (Backend behandelt das im weighted-avg sauber;
                        // Picks ohne Q werden nicht in eff_quality berücksichtigt)
                        onSelect(q ?? 0);
                        setOpen(false);
                      }}
                    >
                      <span className="flex-1 font-mono">
                        {q === null ? "ohne Q" : `Q ${q}`}
                      </span>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {s.qty_total}× ·{" "}
                        {s.locations.slice(0, 2).join(", ")}
                        {s.locations.length > 2 ? " …" : ""}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}