import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient, queryOptions, useSuspenseQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { getShipCatalogEntry, listShipCatalog } from "@/lib/ship-catalog.functions";
import {
  getStockLoadout,
  getBespokeItemRefs,
  type StockLoadoutEntry,
} from "@/lib/stock-loadouts.functions";
import {
  assignStockToSlots,
  type StockEntryLike,
} from "@/lib/loadout/stock-mapping";
import {
  getBuild,
  saveBuild,
  listCompatibleComponents,
  getComponentsByRefs,
  resolveComponentsByClassNames,
  type SlotPick,
  type CompatComponent,
} from "@/lib/loadout-builds.functions";
import {
  computeTotals,
  fmt,
  weaponStats,
  missileStats,
  shieldStats,
  powerGen,
  coolerRate,
  type ComponentPick,
} from "@/lib/loadout-calc";
import { LoadoutStatPanel } from "@/components/loadouts/StatPanel";
import { aggregateWeapons, weaponStats as weaponStatsFull } from "@/lib/loadout/domain/stats/weapons";
import { SustainedDpsChart } from "@/components/loadouts/SustainedDpsChart";
import { CostsPanel } from "@/components/loadouts/CostsPanel";
import { FlightModePanel } from "@/components/loadouts/FlightModePanel";
import { DEFAULT_MODE, pipMultiplier, sustainedSummary, type FlightMode } from "@/lib/loadout/domain";
import { aggregateShields } from "@/lib/loadout/domain/stats/shields";
import { encodeLoadout } from "@/lib/loadout-share";
import {
  Save,
  Share2,
  Trash2,
  Plus,
  Search,
  RotateCcw,
  Copy,
  Check,
  Crosshair,
  Shield,
  Radio,
  Zap,
  Rocket,
  ChevronDown,
  Wrench,
  Gauge,
  Snowflake,
  Radar as RadarIcon,
  Battery,
  ShoppingCart,
  Info,
} from "lucide-react";

const catalogQuery = queryOptions({
  queryKey: ["ship-catalog-list"],
  queryFn: () => listShipCatalog(),
  staleTime: 10 * 60 * 1000,
});

const searchSchema = z.object({ id: z.string().uuid().optional() });

export const Route = createFileRoute("/_authenticated/loadout-editor/$slug")({
  validateSearch: (s) => searchSchema.parse(s),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(catalogQuery).catch(() => undefined),
  head: () => ({ meta: [{ title: "Loadout-Editor" }] }),
  component: EditorPage,
  pendingComponent: () => <LoadingScreen label="Loadout wird geladen…" />,
});

type CompCat = "weapons" | "missiles" | "systems" | "propulsion";
type SlotKind = "weapon" | "rack" | "ammo" | "system" | "propulsion";

type SlotDescriptor = {
  key: string;
  name: string;
  category: string;
  size: number | null;
  kind: SlotKind | null;
  expectedType: string | null;
  expectedSubType: string | null;
  sizeExact: boolean;
};

/**
 * Scunpacked-ClassName in einen lesbaren Namen umwandeln, wenn kein
 * Katalog-Item existiert (z.B. `RADR_GNRP_S03_Idris_TEMP` -> "Idris Radar S3").
 */
function humanizeClassName(cn: string): string {
  const raw = cn.replace(/_scitem$/i, "").replace(/_temp$/i, "");
  const parts = raw.split("_").filter(Boolean);
  const prefixMap: Record<string, string> = {
    RADR: "Radar",
    QDRV: "Quantum Drive",
    SHLD: "Shield",
    POWR: "Power Plant",
    COOL: "Cooler",
    MRCK: "Missile Rack",
  };
  const catLabel = prefixMap[parts[0]?.toUpperCase() ?? ""] ?? parts[0] ?? "";
  const sizeToken = parts.find((p) => /^S\d+$/i.test(p));
  const rest = parts
    .slice(1)
    .filter((p) => !/^S\d+$/i.test(p))
    .join(" ");
  const label = [rest, catLabel].filter(Boolean).join(" · ");
  return sizeToken ? `${label} (${sizeToken.toUpperCase()})` : label || cn;
}

function toSlotDescriptor(
  h: {
    name: string;
    category: string;
    size: number | null;
    kind?: string | null;
    expectedType?: string | null;
    expectedSubType?: string | null;
    sizeExact?: boolean;
  },
  i: number,
): SlotDescriptor {
  return {
    key: `${i}:${h.category}:${h.name}`,
    name: h.name,
    category: h.category,
    size: h.size,
    kind: deriveKind(h.category, h.kind ?? null),
    expectedType: h.expectedType ?? null,
    expectedSubType: h.expectedSubType ?? null,
    sizeExact: h.sizeExact ?? true,
  };
}

function mapCategoryToComponentCategory(hardpointCategory: string): CompCat | null {
  const c = hardpointCategory;
  if (c === "Missile & Bomb Racks") return "missiles";
  if (c === "Weapons") return "weapons";
  if (
    c === "Power Plants" ||
    c === "Coolers" ||
    c === "Shield Generators" ||
    c === "Radar"
  ) {
    return "systems";
  }
  if (c === "Quantum Drives") return "propulsion";
  // Turret-Parent-Slots sind reine Info-Zeilen (keine Auswahl).
  if (c === "Turret Mounts") return null;
  return null;
}

function deriveKind(category: string, existing?: string | null): SlotKind | null {
  if (existing === "weapon" || existing === "rack" || existing === "ammo" || existing === "system" || existing === "propulsion") {
    return existing;
  }
  if (category === "Weapons") return "weapon";
  if (category === "Missile & Bomb Racks") return "rack";
  if (category === "Quantum Drives") return "propulsion";
  if (category === "Power Plants" || category === "Coolers" || category === "Shield Generators" || category === "Radar") return "system";
  return null;
}

function normName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/[\-_·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function rackPrefix(name: string | null | undefined): string {
  return (name ?? "").split("·")[0]?.trim() ?? "";
}

function numFromRaw(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function getRackLayout(
  rackPick: SlotPick | undefined,
  fallbackChildren: SlotDescriptor[],
): { count: number; size: number | null; subType: string } {
  const raw = (rackPick as unknown as { raw?: { missile_rack?: Record<string, unknown> } } | undefined)?.raw;
  const rack = raw?.missile_rack ?? {};
  const count = numFromRaw(rack.missile_count) ?? fallbackChildren.length;
  const size = numFromRaw(rack.missile_size) ?? fallbackChildren[0]?.size ?? null;
  const rname = String(((rackPick as unknown as { _name?: string })?._name ?? "")).toLowerCase();
  const subType = /torpedo/.test(rname)
    ? "Torpedo"
    : /rocket/.test(rname)
      ? "Rocket"
      : "Missile";
  return { count, size, subType };
}

function buildEffectiveSlots(
  baseSlots: SlotDescriptor[],
  picks: Record<string, SlotPick>,
): SlotDescriptor[] {
  const ammoByRack = new Map<string, SlotDescriptor[]>();
  for (const s of baseSlots) {
    if (s.kind !== "ammo") continue;
    const prefix = rackPrefix(s.name);
    const arr = ammoByRack.get(prefix) ?? [];
    arr.push(s);
    ammoByRack.set(prefix, arr);
  }

  const out: SlotDescriptor[] = [];
  for (const s of baseSlots) {
    if (s.kind === "ammo") continue;
    out.push(s);
    if (s.kind !== "rack") continue;

    const prefix = rackPrefix(s.name);
    const fallback = ammoByRack.get(prefix) ?? [];
    const layout = getRackLayout(picks[s.key], fallback);
    for (let i = 0; i < layout.count; i++) {
      const base = fallback[i];
      out.push({
        ...(base ?? s),
        key: base?.key ?? `${s.key}:ammo:${i + 1}`,
        name: `${prefix} · Mount ${i + 1}${layout.size ? ` (S${layout.size})` : ""}`,
        category: "Missile & Bomb Racks",
        size: layout.size,
        kind: "ammo",
        expectedType: "Missile",
        expectedSubType: layout.subType,
        sizeExact: true,
      });
    }
  }
  return out;
}

function pickCategoryForStats(category: string | null): string | null {
  if (category === "Missile & Bomb Racks") return "missiles";
  if (category === "Weapons") return "weapons";
  if (category === "Quantum Drives") return "propulsion";
  if (
    category === "Power Plants" ||
    category === "Coolers" ||
    category === "Shield Generators" ||
    category === "Radar"
  ) {
    return "systems";
  }
  return category;
}

function pct(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "0%";
  return `${Math.round(v * 100)}%`;
}

type DefaultEntry = {
  category: string;
  size: number | null;
  itemName: string | null;
  consumed: boolean;
};

function EditorPage() {
  const { slug } = Route.useParams();
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const shipFn = useServerFn(getShipCatalogEntry);
  const buildFn = useServerFn(getBuild);
  const saveFn = useServerFn(saveBuild);
  const listCompFn = useServerFn(listCompatibleComponents);
  const stockLoadoutFn = useServerFn(getStockLoadout);
  const bespokeFn = useServerFn(getBespokeItemRefs);
  const componentsByRefsFn = useServerFn(getComponentsByRefs);
  const resolveByClassFn = useServerFn(resolveComponentsByClassNames);
  const { data: catalog } = useSuspenseQuery(catalogQuery);

  const { data: ship, isLoading: shipLoading } = useQuery({
    queryKey: ["ship-catalog", slug],
    queryFn: () => shipFn({ data: { slug } }),
    staleTime: 10 * 60 * 1000,
  });

  // Bespoke-Set (schiffs-spezifische, im Spiel nicht austauschbare Komponenten).
  // Quelle: scunpacked-Ship-JSON, abgeleitet aus der echten Slot-Editierbarkeit.
  const { data: bespokeData } = useQuery({
    queryKey: ["bespoke-item-refs", slug],
    queryFn: () => bespokeFn({ data: { shipSlug: slug } }),
    staleTime: 30 * 60 * 1000,
    enabled: !!ship,
  });
  const bespokeSet = useMemo(
    () => new Set<string>(bespokeData?.itemRefs ?? []),
    [bespokeData],
  );

  const { data: existingBuild } = useQuery({
    queryKey: ["build", id],
    queryFn: () => buildFn({ data: { id: id! } }),
    enabled: !!id,
  });

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [picks, setPicks] = useState<Record<string, SlotPick>>({});
  const [openSlot, setOpenSlot] = useState<string | null>(null);
  const [shipPickerOpen, setShipPickerOpen] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);
  const [copiedInline, setCopiedInline] = useState(false);

  // Bundle-Mode: identisch bestückte Slots (z.B. 4× VariPuck S5) werden
  // in einer Turret-Karte zusammengefasst. Der User kann sie mit "Expand all"
  // aufklappen oder einzelne Karten per Chevron aufklappen.
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  // Wenn ein Bundle-Header geöffnet wird, propagieren wir die Auswahl auf
  // alle Slots derselben Gruppe.
  const [bundleTargets, setBundleTargets] = useState<Record<string, string[]>>({});

  // Flight mode (SCM/NAV/Stealth/Custom) with per-slug localStorage.
  const modeStorageKey = `loadout:mode:${slug}`;
  const [mode, setMode] = useState<FlightMode>(DEFAULT_MODE);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(modeStorageKey);
      if (raw) setMode(JSON.parse(raw) as FlightMode);
    } catch {
      /* ignore */
    }
  }, [modeStorageKey]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(modeStorageKey, JSON.stringify(mode));
    } catch {
      /* ignore */
    }
  }, [mode, modeStorageKey]);

  // Slot key = index-based on hardpoint order to survive equal names
  const slots = useMemo(() => {
    if (!ship) return [] as SlotDescriptor[];
    return ship.hardpoints.map((h, i) => toSlotDescriptor(h, i));
  }, [ship]);

  // Ammo-Slots **dynamisch** aus dem tatsächlich verbauten Rack ableiten.
  // Verbindlich sind `raw.missile_rack.missile_count` und `missile_size`:
  // beim Wechsel auf z.B. ein 528-Rack entstehen sofort 8 passende S2-Slots.
  const effectiveSlots = useMemo(() => {
    if (!ship) return [] as SlotDescriptor[];
    return buildEffectiveSlots(slots, picks);
  }, [slots, ship, picks]);

  // Initialize from build/ship. On a new build we also pre-fill picks
  // from the ship's default loadout (Erkul-Style).
  useEffect(() => {
    if (!ship) return;
    if (existingBuild) {
      setName(existingBuild.name);
      setDescription(existingBuild.description ?? "");
      setIsPublic(existingBuild.is_public);
      const map: Record<string, SlotPick> = {};
      for (const s of existingBuild.slots ?? []) map[s.slot_key] = s;
      setPicks(map);
    } else if (!id) {
      setName(`${ship.name} — Standard`);
      setPicks({});
      void (async () => {
        // Erkul-Parität: beim Öffnen eines Schiffs sofort das Werk-Loadout
        // anwenden. Fallback auf Fleetyards-Default, wenn kein Stock-Snapshot
        // existiert. Ammo-Slots werden anschließend aus dem Default-Loadout
        // vorbefüllt (Stock enthält keine Munition).
        const applied = await applyStockLoadout();
        if (!applied) {
          await prefillFromDefaultLoadout();
        } else {
          await prefillFromDefaultLoadout({ ammoOnly: true });
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ship, existingBuild, id]);

  async function prefillFromDefaultLoadout(opts: { ammoOnly?: boolean } = {}) {
    if (!ship) return;
    // slot list mit computed keys spiegeln
    const localSlots = ship.hardpoints.map((h, i) => toSlotDescriptor(h, i));
    if (opts.ammoOnly) {
      const additions = await buildDefaultMissilePicks(localSlots, picks);
      if (Object.keys(additions).length > 0) {
        setPicks((prev) => ({ ...prev, ...additions }));
      }
      return;
    }
    // Für jede benötigte Component-Category einmal laden.
    const needed = new Set<CompCat>();
    for (const s of localSlots) {
      const c = mapCategoryToComponentCategory(s.category);
      if (c) needed.add(c);
    }
    const buckets: Record<string, CompatComponent[]> = {};
    await Promise.all(
      Array.from(needed).map(async (cat) => {
        try {
          buckets[cat] = await listCompFn({ data: { category: cat, maxSize: null } });
        } catch {
          buckets[cat] = [];
        }
      }),
    );
    // Default-Loadout-Queue: gleiche Bucket-Kategorie darf jeden Eintrag
    // nur einmal verbrauchen. Für Racks vs. Munition zusätzlich nach `kind` splitten.
    const dlByBucket = new Map<string, DefaultEntry[]>();
    for (const dl of ship.defaultLoadout ?? []) {
      const dlKind = (dl as { kind?: string | null }).kind ?? deriveKind(dl.category, null);
      const bucketKey = `${dl.category}|${dlKind ?? ""}`;
      const arr = dlByBucket.get(bucketKey) ?? [];
      arr.push({ ...dl, consumed: false });
      dlByBucket.set(bucketKey, arr);
    }
    const next: Record<string, SlotPick> = {};
    for (const slot of localSlots) {
      const compCat = mapCategoryToComponentCategory(slot.category);
      if (!compCat) continue;
      const list = buckets[compCat] ?? [];
      // 1) Kandidaten aus defaultLoadout mit gleicher Bucket-Kategorie + kind.
      const bucketKey = `${slot.category}|${slot.kind ?? ""}`;
      const dlEntries = dlByBucket.get(bucketKey) ?? [];
      // Für Racks/Munition zusätzlich passende Classification vorfiltern.
      const filtered = slot.kind === "rack"
        ? list.filter((c) => c.classification_label === "Missile Rack")
        : slot.kind === "ammo"
          ? list.filter((c) => c.classification_label === "Missile" || c.classification_label === "Torpedo" || c.classification_label === "Rocket")
          : list;
      // Bevorzuge die exakte Größe.
      const candidate =
        dlEntries.find((d) => !d.consumed && d.size === slot.size && d.itemName) ??
        dlEntries.find((d) => !d.consumed && d.itemName);
      if (!candidate?.itemName) continue;
      const wantName = normName(candidate.itemName);
      // Match: gleicher Name (case-insensitive), passende Größe.
      const comp =
        filtered.find(
          (c) =>
            normName(c.name) === wantName &&
            (slot.size == null || c.size == null || c.size === slot.size),
        ) ??
        filtered.find((c) => normName(c.name) === wantName);
      if (!comp) continue;
      candidate.consumed = true;
      next[slot.key] = {
        slot_key: slot.key,
        hardpoint_name: slot.name,
        category: slot.category,
        size: slot.size,
        item_ref: comp.item_ref,
        // stash raw client-side only
        ...({ raw: comp.raw, _name: comp.name } as object),
      } as SlotPick;
    }
    if (Object.keys(next).length === 0) return;
    setPicks((prev) => (Object.keys(prev).length === 0 ? next : prev));
  }

  async function buildDefaultMissilePicks(
    localSlots: SlotDescriptor[],
    current: Record<string, SlotPick>,
  ): Promise<Record<string, SlotPick>> {
    const dynamicAmmo = buildEffectiveSlots(localSlots, current).filter(
      (s) => s.kind === "ammo" && !current[s.key],
    );
    if (dynamicAmmo.length === 0) return {};

    const byNeed = new Map<string, CompatComponent[]>();
    await Promise.all(
      Array.from(new Set(dynamicAmmo.map((s) => `${s.size ?? ""}|${s.expectedSubType ?? "Missile"}`))).map(
        async (need) => {
          const [sizeRaw, subTypeRaw] = need.split("|");
          const size = sizeRaw ? Number(sizeRaw) : null;
          const subType = subTypeRaw || "Missile";
          try {
            byNeed.set(
              need,
              await listCompFn({
                data: {
                  category: "missiles",
                  size,
                  kind: "ammo",
                  expectedType: "Missile",
                  expectedSubType: subType,
                  sizeExact: true,
                },
              }),
            );
          } catch {
            byNeed.set(need, []);
          }
        },
      ),
    );

    const out: Record<string, SlotPick> = {};
    for (const slot of dynamicAmmo) {
      const need = `${slot.size ?? ""}|${slot.expectedSubType ?? "Missile"}`;
      const comp = byNeed.get(need)?.[0];
      if (!comp) continue;
      out[slot.key] = {
        slot_key: slot.key,
        hardpoint_name: slot.name,
        category: slot.category,
        size: slot.size,
        item_ref: comp.item_ref,
        ...({ raw: comp.raw, _name: comp.name } as object),
      } as SlotPick;
    }
    return out;
  }

  async function applyStockLoadout(opts: { silent?: boolean } = {}): Promise<boolean> {
    if (!ship) return false;
    const stock = await stockLoadoutFn({ data: { shipSlug: slug } });
    if (!stock || stock.loadout.length === 0) return false;
    const localSlots = ship.hardpoints.map((h, i) => toSlotDescriptor(h, i));
    // Stock-Loadout enthält auch bespoke Komponenten (z.B. Apollo-Rack). Diese
    // werden vom regulären Compat-Filter ausgeschlossen — daher direkt per
    // item_ref aus dem Katalog nachladen.
    const refs = Array.from(
      new Set(
        stock.loadout
          .map((e) => e.item_ref)
          .filter((r): r is string => typeof r === "string" && r.length > 0),
      ),
    );
    const rows = refs.length > 0 ? await componentsByRefsFn({ data: { refs } }) : [];
    const byRef = new Map<string, (typeof rows)[number]>();
    for (const r of rows) byRef.set(r.item_ref as string, r);
    // Late-Resolve: Stock-Einträge ohne `item_ref` (Katalog-Sync fand die
    // ClassName nicht) über den case-insensitiven Class-Name-Lookup nachladen,
    // damit auch nachträglich indexierte Katalog-Einträge greifen.
    const missingClassNames = Array.from(
      new Set(
        stock.loadout
          .filter(
            (e) =>
              typeof e.class_name === "string" &&
              e.class_name.length > 0 &&
              (!e.item_ref || !byRef.has(e.item_ref)),
          )
          .map((e) => e.class_name),
      ),
    );
    const resolvedByClass = new Map<string, { item_ref: string; name: string; raw: unknown }>();
    if (missingClassNames.length > 0) {
      try {
        const resolved = await resolveByClassFn({ data: { classNames: missingClassNames } });
        for (const r of resolved) {
          resolvedByClass.set(
            r.matched_class_name.toLowerCase(),
            { item_ref: r.item_ref, name: r.name, raw: r.raw },
          );
        }
      } catch {
        /* ignore */
      }
    }
    const next: Record<string, SlotPick> = {};
    const orderedSlots = localSlots.filter((s) => mapCategoryToComponentCategory(s.category));
    // Strukturierte Zuordnung: der Wiki-Portbaum (Turret → Mounts,
    // Rack → Munition, Gimbal → Waffe) wird auf die konkreten Slots gelegt,
    // damit jede Komponente an ihrem tatsächlichen Platz landet.
    const assignment = assignStockToSlots(
      orderedSlots.map((s) => ({
        key: s.key,
        name: s.name,
        category: s.category,
        size: s.size,
      })),
      stock.loadout as unknown as StockEntryLike[],
    );
    for (const slot of orderedSlots) {
      const entry = assignment.get(slot.key);
      if (!entry) continue;
      pushEntry(slot, entry as unknown as StockLoadoutEntry);
    }

    function pushEntry(
      slot: (typeof localSlots)[number],
      entry: StockLoadoutEntry,
    ) {
      let compRef: string | null = entry?.item_ref ?? null;
      let compName: string | null = null;
      let compRaw: unknown = null;
      if (compRef) {
        const comp = byRef.get(compRef);
        if (comp) {
          compName = comp.name as string;
          compRaw = comp.raw;
        } else {
          compRef = null;
        }
      }
      if (!compRef && entry?.class_name) {
        const hit = resolvedByClass.get(entry.class_name.toLowerCase());
        if (hit) {
          compRef = hit.item_ref;
          compName = hit.name;
          compRaw = hit.raw;
        }
      }
      if (!compRef) {
        // Kein Katalogtreffer für diese ClassName -> ship-spezifischer
        // Placeholder (z.B. Idris `RADR_..._TEMP` / `QDRV_..._TEMP`,
        // Javelin/Polaris Turret-Racks). Slot bleibt sichtbar, wird aber
        // als "fest verbaut" markiert und kann nicht getauscht werden.
        if (entry?.class_name) {
          next[slot.key] = {
            slot_key: slot.key,
            hardpoint_name: slot.name,
            category: slot.category,
            size: slot.size ?? entry.size ?? null,
            item_ref: null,
            ...({
              raw: null,
              _name: humanizeClassName(entry.class_name),
              _shipFixed: true,
            } as object),
          } as SlotPick;
        }
        return;
      }
      next[slot.key] = {
        slot_key: slot.key,
        hardpoint_name: slot.name,
        category: slot.category,
        size: slot.size,
        item_ref: compRef,
        ...({ raw: compRaw, _name: compName } as object),
      } as SlotPick;
    }
    if (Object.keys(next).length === 0) return false;
    const ammoPicks = await buildDefaultMissilePicks(localSlots, next);
    const fullNext = { ...next, ...ammoPicks };
    if (opts.silent) {
      setPicks((prev) => (Object.keys(prev).length === 0 ? fullNext : prev));
    } else {
      setPicks(fullNext);
    }
    return true;
  }

  const groupedSlots = useMemo(() => {
    const g = new Map<string, typeof slots>();
    for (const s of effectiveSlots) {
      const list = g.get(s.category) ?? [];
      list.push(s);
      g.set(s.category, list);
    }
    return Array.from(g.entries());
  }, [effectiveSlots]);

  const componentPicks: ComponentPick[] = useMemo(
    () =>
      Object.values(picks).map((p) => ({
        slot_key: p.slot_key,
        item_ref: p.item_ref,
        name: null,
        category: pickCategoryForStats(p.category),
        size: p.size,
        raw: (p as unknown as { raw?: unknown }).raw as Record<string, unknown> | null | undefined,
      })),
    [picks],
  );
  const totals = useMemo(() => computeTotals(componentPicks), [componentPicks]);
  const weaponsAgg = useMemo(() => aggregateWeapons(componentPicks), [componentPicks]);
  const shieldsAgg = useMemo(() => aggregateShields(componentPicks), [componentPicks]);
  const wMul = pipMultiplier(mode.triangle.weapons);
  const sMul = pipMultiplier(mode.triangle.shields);
  const sustainedAgg = useMemo(
    () => sustainedSummary(componentPicks, { durationSeconds: 60, stepSeconds: 0.1 }),
    [componentPicks],
  );

  const save = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          id: existingBuild?.id ?? id,
          ship_slug: slug,
          name: name.trim() || `${ship?.name ?? "Ship"} Build`,
          description: description.trim() || null,
          slots: Object.values(picks).map(({ slot_key, hardpoint_name, category, size, item_ref }) => ({
            slot_key,
            hardpoint_name,
            category,
            size,
            item_ref,
          })),
          is_public: isPublic,
        },
      }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["loadout-builds"] });
      if (!id && res?.id) {
        navigate({ to: "/loadout-editor/$slug", params: { slug }, search: { id: res.id } });
      }
    },
  });

  if (shipLoading) return <LoadingScreen label="Schiff wird geladen…" />;
  if (!ship)
    return (
      <div className="mx-auto max-w-3xl p-8">
        <h1 className="font-display text-2xl">Nicht gefunden</h1>
        <p className="mt-2 text-sm text-muted-foreground">Schiff nicht gefunden.</p>
        <Link to="/loadout-editor" className="mt-4 inline-block text-brand hover:underline">
          ← Zurück
        </Link>
      </div>
    );

  const shareUrl =
    existingBuild?.share_token && typeof window !== "undefined"
      ? `${window.location.origin}/loadout/${existingBuild.share_token}`
      : null;

  const inlineShareUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/l/${encodeLoadout({
          v: 1,
          slug,
          name: name || undefined,
          desc: description || undefined,
          slots: Object.values(picks).map((p) => ({
            k: p.slot_key,
            n: p.hardpoint_name,
            c: p.category,
            s: p.size,
            r: p.item_ref,
          })),
        })}`
      : null;

  const groupIcon = (cat: string) => {
    if (cat === "Missile & Bomb Racks") return Rocket;
    if (cat === "Counter Measures") return Shield;
    return Crosshair;
  };

  const hero = ship.storeImage ?? ship.heroImage ?? ship.angledView ?? ship.frontView;

  // Buckets für die neuen Erkul-Sektionen
  const bucket = (cats: string[]) =>
    groupedSlots.filter(([c]) => cats.includes(c));
  const armament = bucket(["Weapons", "Turret Mounts", "Missile & Bomb Racks", "Missile Rack Mounts"]);
  const shields = bucket(["Shield Generators"]);
  const powerPlants = bucket(["Power Plants"]);
  const coolers = bucket(["Coolers"]);
  const quantums = bucket(["Quantum Drives"]);
  const radars = bucket(["Radar"]);

  // Hardpoint-Schematic: Zählung je Size
  const sizeCounts = new Map<number, number>();
  for (const h of ship.hardpoints ?? []) {
    if (h.category === "Weapons" || h.category === "Turret Mounts" || h.category === "Missile & Bomb Racks") {
      const s = h.size ?? 0;
      sizeCounts.set(s, (sizeCounts.get(s) ?? 0) + 1);
    }
  }
  const sizeList = Array.from(sizeCounts.entries()).sort((a, b) => b[0] - a[0]);

  return (
    <div className="mx-auto w-full max-w-[1600px] px-4 py-4">
      <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-amber-100">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
        <p className="text-sm leading-relaxed">
          <span className="font-semibold">Beta-Hinweis:</span> Der Loadout-Editor befindet sich noch in der aktiven Entwicklung. Berechnungen, Kompatibilitätsdaten und das Teilen von Builds können sich noch ändern.
        </p>
      </div>

      {/* Top: Ship-Picker wide */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          to="/loadout-editor"
          className="rounded-lg border border-white/10 bg-card/40 px-3 py-2 text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground hover:border-brand hover:text-brand"
        >
          ← Builds
        </Link>
        <div className="relative flex-1 min-w-[240px]">
          <button
            onClick={() => setShipPickerOpen((v) => !v)}
            className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-card/40 px-3 py-2 text-left hover:border-brand/50"
          >
            <Search className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 truncate text-sm">
              {asText(ship.manufacturer) ? `${asText(ship.manufacturer)} ` : ""}
              <span className="font-medium">{ship.name}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>
          {shipPickerOpen && (
            <ShipPicker
              ships={catalog}
              currentSlug={slug}
              onPick={(s) => {
                setShipPickerOpen(false);
                navigate({ to: "/loadout-editor/$slug", params: { slug: s }, search: {} });
              }}
              onClose={() => setShipPickerOpen(false)}
            />
          )}
        </div>
      </div>

      {slots.length === 0 && (
        <div className="mb-4 rounded-lg border border-amber-400/30 bg-amber-500/5 p-3 text-sm text-amber-200">
          Für dieses Schiff sind (noch) keine Hardpoints synchronisiert.
        </div>
      )}

      {/* Sticky Top-Stat-Leiste (Erkul-Style) */}
      <div className="sticky top-0 z-30 -mx-4 mb-3 border-y border-white/10 bg-background/80 px-4 py-2 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
        <div className="flex flex-nowrap items-center gap-x-5 gap-y-2 overflow-x-auto">
          <HeroStat icon={Crosshair} value={fmt(totals.totalAlpha * wMul)} label="Alpha" />
          <HeroStat value={fmt(sustainedAgg.sustainedDps * wMul)} label="Sustained" accent />
          <HeroStat value={fmt(weaponsAgg.totalBurstDps * wMul)} label="Burst" />
          <div className="h-7 w-px shrink-0 bg-white/10" />
          <HeroStat icon={Rocket} value={fmt(totals.missileDamage)} label="Missile" />
          <div className="h-7 w-px shrink-0 bg-white/10" />
          <HeroStat icon={Shield} value={fmt((totals.shieldHp || 0) * sMul)} label="Shield HP" />
          <HeroStat value={fmt((totals.shieldRegen || 0) * sMul)} label="Regen hp/s" accent />
          <div className="h-7 w-px shrink-0 bg-white/10" />
          <HeroStat
            value={String(mode.triangle.weapons + mode.triangle.shields + mode.triangle.engines)}
            label={`/ ${mode.label ?? "Pips"}`}
          />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_22rem]">
        {/* CENTER — Erkul-Masonry: 3 gleich breite Karten-Spalten */}
        <div className="grid items-start gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            <Panel className="overflow-hidden !p-0 lg:col-span-2 2xl:col-span-1">
              <div className="relative aspect-[16/9] w-full bg-gradient-to-b from-black/20 to-black 2xl:aspect-[4/3]">
                {hero ? (
                  <img src={hero} alt={ship.name} className="h-full w-full object-cover opacity-90" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground">kein Bild</div>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background via-background/70 to-transparent p-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {asText(ship.manufacturer) ?? "—"}
                  </div>
                  <h1 className="font-display text-xl leading-tight">{ship.name}</h1>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {asText(ship.size) && <Chip>{asText(ship.size)}</Chip>}
                    {asText(ship.classificationLabel) && <Chip>{asText(ship.classificationLabel)}</Chip>}
                    {asText(ship.focus) && <Chip>{asText(ship.focus)}</Chip>}
                    {ship.crewMax && <Chip>{ship.crewMax} crew</Chip>}
                  </div>
                </div>
              </div>
            </Panel>

            <Panel>
              <PanelHeader icon={Crosshair} title="Damage" />
              <div className="grid grid-cols-2 gap-1.5">
                <BigStat label="Σ Alpha" value={fmt(totals.totalAlpha * wMul)} />
                <BigStat label="Burst DPS" value={fmt(weaponsAgg.totalBurstDps * wMul)} highlight />
              </div>
              <div className="mt-2.5 border-t border-white/5 pt-1.5">
                <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 pb-1 font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground/70">
                  <span>Source</span>
                  <span className="w-14 text-right">Σ Alpha</span>
                  <span className="w-14 text-right">Sust.</span>
                  <span className="w-14 text-right">Burst</span>
                </div>
                <SourceRow label="Pilot" alpha={weaponsAgg.totalAlpha * wMul} sust={weaponsAgg.totalBurstDps * wMul} burst={weaponsAgg.totalBurstDps * wMul} />
                <SourceRow label="Manned turret" alpha={0} sust={0} burst={0} />
                <SourceRow label="Remote turret" alpha={0} sust={0} burst={0} />
                <SourceRow label="PDS" alpha={0} sust={0} burst={0} />
              </div>
              <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-white/5 pt-2.5">
                <MiniStat label="Waffen" value={String(weaponsAgg.weaponCount)} />
                <MiniStat label="Missile" value={fmt(totals.missileDamage)} />
                <MiniStat label="Bomb" value="—" />
                <MiniStat label="EMP" value="—" />
              </div>
            </Panel>

            <Panel>
              <PanelHeader icon={Shield} title="Defense" />
              <div className="grid grid-cols-2 gap-1.5">
                <BigStat label="Shield HP" value={fmt((totals.shieldHp || 0) * sMul)} />
                <BigStat label="Regen hp/s" value={fmt((totals.shieldRegen || 0) * sMul)} highlight />
              </div>
              <div className="mt-2.5 border-t border-white/5 pt-1.5">
                <StatRow label="Face type" value="Bubble" />
                <StatRow
                  label="Resistance"
                  badges={[
                    ["Phys", pct(shieldsAgg.resistance.physical)],
                    ["Energy", pct(shieldsAgg.resistance.energy)],
                    ["Distort", pct(shieldsAgg.resistance.distortion)],
                  ]}
                />
                <StatRow
                  label="Effective HP"
                  badges={[
                    ["Phys", fmt(shieldsAgg.effectiveHp.physical * sMul)],
                    ["Energy", fmt(shieldsAgg.effectiveHp.energy * sMul)],
                    ["Distort", fmt(shieldsAgg.effectiveHp.distortion * sMul)],
                  ]}
                />
                <StatRow label="Damaged delay" value={shieldsAgg.damagedDelay ? `${shieldsAgg.damagedDelay.toFixed(1)}s` : "—"} />
                <StatRow label="Downed delay" value={shieldsAgg.downedDelay ? `${shieldsAgg.downedDelay.toFixed(1)}s` : "—"} />
              </div>
            </Panel>

          {/* Linke Doppelspalte: Armament */}
          <div className="space-y-3 lg:col-span-2">
          {armament.length > 0 && (
            <Panel>
              <PanelHeader
                icon={Crosshair}
                title="Armament"
                right={
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setExpandedGroups({ __all__: true })}
                      className="rounded-md border border-white/10 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:border-brand hover:text-brand"
                    >
                      Expand all
                    </button>
                    <button
                      onClick={() => setExpandedGroups({})}
                      className="rounded-md border border-white/10 bg-background/40 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:border-brand hover:text-brand"
                    >
                      Collapse all
                    </button>
                  </div>
                }
              />
              <ArmamentChain
                list={armament.flatMap(([, list]) => list)}
                picks={picks}
                setPicks={setPicks}
                setOpenSlot={setOpenSlot}
                bespokeSet={bespokeSet}
                shipDps={totals.totalDps}
                expandedGroups={expandedGroups}
                setExpandedGroups={setExpandedGroups}
                onOpenBundle={(keys) => {
                  if (keys.length === 0) return;
                  setBundleTargets((m) => ({ ...m, [keys[0]]: keys.slice(1) }));
                  setOpenSlot(keys[0]);
                }}
              />
            </Panel>
          )}
          </div>

          {/* Rechte Karten-Spalte: Info & Systeme */}
          <div className="space-y-3">
          {ship.descriptionDe || ship.description ? (
            <Panel>
              <PanelHeader title="Description" />
              <p className="whitespace-pre-wrap text-[13px] text-muted-foreground leading-relaxed line-clamp-5">
                {asText(ship.descriptionDe) ?? asText(ship.description)}
              </p>
            </Panel>
          ) : null}

          <Panel>
            <PanelHeader title="Simulations" />
            <SustainedDpsChart picks={componentPicks} />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                disabled
                className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground opacity-70"
              >
                <Crosshair className="h-3.5 w-3.5" /> Penetration
              </button>
              <button
                disabled
                className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-background/40 px-2 py-1.5 text-[11px] text-muted-foreground opacity-70"
              >
                <Shield className="h-3.5 w-3.5" /> Deflection
              </button>
            </div>
          </Panel>

          {shields.length > 0 && (
            <Panel>
              <PanelHeader icon={Shield} title="Shields" />
              {shields.map(([cat, list]) => (
                <SectionGroup
                  key={cat}
                  title={cat}
                  list={list}
                  picks={picks}
                  setPicks={setPicks}
                  setOpenSlot={setOpenSlot} bespokeSet={bespokeSet} hideTitle single
                />
              ))}
            </Panel>
          )}

          {powerPlants.length > 0 && (
            <Panel>
              <PanelHeader icon={Battery} title="Power plant" />
              {powerPlants.map(([cat, list]) => (
                <SectionGroup key={cat} title={cat} list={list} picks={picks} setPicks={setPicks} setOpenSlot={setOpenSlot} bespokeSet={bespokeSet} hideTitle single />
              ))}
            </Panel>
          )}
          {coolers.length > 0 && (
            <Panel>
              <PanelHeader icon={Snowflake} title="Coolers" />
              {coolers.map(([cat, list]) => (
                <SectionGroup key={cat} title={cat} list={list} picks={picks} setPicks={setPicks} setOpenSlot={setOpenSlot} bespokeSet={bespokeSet} hideTitle single />
              ))}
            </Panel>
          )}
          {quantums.length > 0 && (
            <Panel>
              <PanelHeader icon={Rocket} title="Quantum drives" />
              {quantums.map(([cat, list]) => (
                <SectionGroup key={cat} title={cat} list={list} picks={picks} setPicks={setPicks} setOpenSlot={setOpenSlot} bespokeSet={bespokeSet} hideTitle single />
              ))}
            </Panel>
          )}
          {radars.length > 0 && (
            <Panel>
              <PanelHeader icon={RadarIcon} title="Radar" />
              {radars.map(([cat, list]) => (
                <SectionGroup key={cat} title={cat} list={list} picks={picks} setPicks={setPicks} setOpenSlot={setOpenSlot} bespokeSet={bespokeSet} hideTitle single />
              ))}
            </Panel>
          )}
          </div>
        </div>

        {/* RIGHT RAIL */}
        <aside className="space-y-3 xl:sticky xl:top-4 xl:self-start xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:pr-1">
          {/* Actions */}
          <Panel>
            <PanelHeader title="Actions" />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Build-Name…"
              className="mb-2 w-full rounded-md border border-white/10 bg-background/60 px-2 py-1.5 text-sm outline-none focus:border-brand"
            />
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => save.mutate()}
                disabled={save.isPending || slots.length === 0}
                className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-brand bg-brand px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-brand/80 disabled:opacity-40"
              >
                <Save className="h-4 w-4" />
                {save.isPending ? "Speichere…" : existingBuild ? "Aktualisieren" : "Speichern"}
              </button>
              <button
                onClick={() => applyStockLoadout()}
                disabled={slots.length === 0}
                className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs hover:border-brand hover:text-brand disabled:opacity-40"
              >
                <Wrench className="h-3.5 w-3.5" /> Werk-Loadout
              </button>
              <button
                onClick={async () => {
                  const localSlots = ship.hardpoints.map((h, i) => toSlotDescriptor(h, i));
                  const additions = await buildDefaultMissilePicks(localSlots, picks);
                  if (Object.keys(additions).length > 0) {
                    setPicks((prev) => ({ ...prev, ...additions }));
                  }
                }}
                disabled={slots.length === 0}
                className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs hover:border-brand hover:text-brand disabled:opacity-40"
                title="Füllt leere Ammo-/Missile-Slots aus dem Standard-Loadout"
              >
                <Rocket className="h-3.5 w-3.5" /> Munition auffüllen
              </button>
              <button
                onClick={async () => {
                  if (!shareUrl) return;
                  await navigator.clipboard.writeText(shareUrl);
                  setCopiedShare(true);
                  setTimeout(() => setCopiedShare(false), 1500);
                }}
                disabled={!shareUrl}
                className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs hover:border-brand hover:text-brand disabled:opacity-40"
              >
                {copiedShare ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                {copiedShare ? "Kopiert" : "Share"}
              </button>
              <button
                onClick={async () => {
                  if (!inlineShareUrl) return;
                  await navigator.clipboard.writeText(inlineShareUrl);
                  setCopiedInline(true);
                  setTimeout(() => setCopiedInline(false), 1500);
                }}
                disabled={!inlineShareUrl}
                className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-[11px] hover:border-brand hover:text-brand disabled:opacity-40"
                title="Erzeugt einen selbst-enthaltenden Kurz-Link ohne Speichern"
              >
                {copiedInline ? <Check className="h-3.5 w-3.5" /> : <Share2 className="h-3.5 w-3.5" />}
                {copiedInline ? "Kurz-Link kopiert" : "Kurz-Link (ohne Speichern)"}
              </button>
              <button
                onClick={() => setPicks({})}
                className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-xs hover:border-rose-400/50 hover:text-rose-300"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
              <button
                onClick={() => {
                  const payload = {
                    version: 1,
                    ship: slug,
                    name,
                    description,
                    slots: Object.values(picks),
                  };
                  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `${slug}-${(name || "build").replace(/\s+/g, "_")}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                className="flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-[11px] hover:border-brand hover:text-brand"
                title="Build als JSON herunterladen"
              >
                <Save className="h-3.5 w-3.5" /> Export JSON
              </button>
              <label
                className="flex cursor-pointer items-center justify-center gap-2 rounded-md border border-white/10 bg-card/40 px-3 py-2 text-[11px] hover:border-brand hover:text-brand"
                title="Build aus JSON-Datei importieren"
              >
                <Plus className="h-3.5 w-3.5" /> Import JSON
                <input
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    try {
                      const text = await f.text();
                      const data = JSON.parse(text) as {
                        name?: string;
                        description?: string;
                        slots?: SlotPick[];
                      };
                      if (data.name) setName(data.name);
                      if (data.description) setDescription(data.description);
                      const map: Record<string, SlotPick> = {};
                      for (const s of data.slots ?? []) if (s?.slot_key) map[s.slot_key] = s;
                      setPicks(map);
                    } catch {
                      /* ignore malformed file */
                    } finally {
                      e.target.value = "";
                    }
                  }}
                />
              </label>
              <button
                disabled
                className="col-span-2 flex items-center justify-center gap-2 rounded-md border border-white/10 bg-card/20 px-3 py-2 text-[11px] text-muted-foreground opacity-60"
              >
                <ShoppingCart className="h-3.5 w-3.5" /> Non-stock items to cart
              </button>
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="h-3.5 w-3.5 accent-brand"
              />
              <span>Über Share-Link öffentlich</span>
            </label>
            {shareUrl && (
              <div className="mt-2 flex items-center gap-1 rounded-md border border-white/8 bg-background/60 px-2 py-1">
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  className="flex-1 bg-transparent text-[10px] font-mono outline-none"
                />
                <Copy className="h-3 w-3 text-muted-foreground" />
              </div>
            )}
          </Panel>

          {/* Live stats — domain layer */}
          <LoadoutStatPanel picks={componentPicks} mode={mode} shipRaw={ship} />

          {/* Flight Mode + Power Triangle */}
          <Panel>
            <PanelHeader icon={Zap} title="Power management" />
            <FlightModePanel mode={mode} onChange={setMode} />
            {sizeList.length > 0 && (
              <div className="mt-3 border-t border-white/5 pt-3">
                <div className="mb-2 font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Hardpoints</div>
                <div className="flex flex-wrap gap-1.5">
                  {sizeList.map(([s, count]) => (
                    <div key={s} className="rounded border border-brand/40 bg-brand/10 px-2 py-1 font-mono text-[10px] text-brand">
                      S{s} ×{count}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Panel>

          {/* Costs & Locations (Phase 5) */}
          <Panel>
            <PanelHeader icon={ShoppingCart} title="Beschaffung" />
            <CostsPanel picks={componentPicks} />
          </Panel>

          {/* Flight */}
          <Panel>
            <PanelHeader icon={Gauge} title="Flight" />
            <div className="grid grid-cols-3 gap-2">
              <BigStat label="Pitch °/s" value={ship.pitchRate ? fmt(ship.pitchRate) : "—"} />
              <BigStat label="Yaw °/s" value={ship.yawRate ? fmt(ship.yawRate) : "—"} />
              <BigStat label="Roll °/s" value={ship.rollRate ? fmt(ship.rollRate) : "—"} />
            </div>
            <div className="mt-3 border-t border-white/5 pt-2">
              <StatRow label="SCM speed" value={ship.scmSpeed ? `${fmt(ship.scmSpeed)} m/s` : "—"} />
              <StatRow label="Max speed" value={ship.maxSpeed ? `${fmt(ship.maxSpeed)} m/s` : "—"} />
              <StatRow label="Hydrogen" value={ship.hydrogenFuel ? fmt(ship.hydrogenFuel) : "—"} />
              <StatRow label="Qt fuel" value={ship.quantumFuel ? fmt(ship.quantumFuel) : "—"} />
              <StatRow label="Mass" value={ship.massKg ? `${(ship.massKg / 1000).toFixed(0)} t` : "—"} />
              <StatRow label="Length" value={ship.lengthM ? `${ship.lengthM} m` : "—"} />
            </div>
          </Panel>

          {/* Notes */}
          <Panel>
            <PanelHeader icon={Radio} title="Notes" />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Beschreibung…"
              className="w-full rounded-md border border-white/10 bg-background/60 px-2 py-1.5 text-xs outline-none focus:border-brand resize-none"
            />
          </Panel>
        </aside>
      </div>

      {openSlot && (
        <ComponentPickerDialog
          slot={effectiveSlots.find((s) => s.key === openSlot)!}
          currentItemRef={picks[openSlot]?.item_ref ?? null}
          shipSlug={slug}
          isBespoke={
            !!picks[openSlot]?.item_ref &&
            bespokeSet.has(picks[openSlot]!.item_ref as string)
          }
          onClose={() => {
            setOpenSlot(null);
            setBundleTargets((m) => {
              if (!openSlot || !(openSlot in m)) return m;
              const n = { ...m };
              delete n[openSlot];
              return n;
            });
          }}
          onPick={(comp) => {
            const slot = effectiveSlots.find((s) => s.key === openSlot)!;
            const extraKeys = bundleTargets[openSlot] ?? [];
            setPicks((p) => {
              const next: Record<string, SlotPick> = {
                ...p,
                [openSlot]: {
                  slot_key: openSlot,
                  hardpoint_name: slot.name,
                  category: slot.category,
                  size: slot.size,
                  item_ref: comp.item_ref,
                  // stash raw client-side only; not persisted
                  ...({ raw: comp.raw, _name: comp.name } as object),
                } as SlotPick,
              };
              // Bundle-Propagation: gleiche Waffe für alle Geschwister-Slots.
              for (const k of extraKeys) {
                const s2 = effectiveSlots.find((x) => x.key === k);
                if (!s2) continue;
                next[k] = {
                  slot_key: k,
                  hardpoint_name: s2.name,
                  category: s2.category,
                  size: s2.size,
                  item_ref: comp.item_ref,
                  ...({ raw: comp.raw, _name: comp.name } as object),
                } as SlotPick;
              }
              // Wenn ein Rack getauscht wurde, Ammo-Sub-Slots leeren —
              // sonst hängen dort noch Missiles einer falschen Größe.
              if (slot.kind === "rack") {
                  const prefix = rackPrefix(slot.name);
                if (prefix) {
                  for (const s of effectiveSlots) {
                    if (s.kind !== "ammo") continue;
                    if (rackPrefix(s.name) === prefix) {
                      delete next[s.key];
                    }
                  }
                }
              }
              return next;
            });
            setOpenSlot(null);
            setBundleTargets((m) => {
              if (!(openSlot in m)) return m;
              const n = { ...m };
              delete n[openSlot];
              return n;
            });
          }}
        />
      )}
    </div>
  );
}

/* ---------- Erkul-inspired presentational primitives ---------- */

function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-lg border border-white/8 bg-gradient-to-b from-card/50 to-card/20 p-3 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.03)] ${className ?? ""}`}
    >
      {children}
    </div>
  );
}

function PanelHeader({
  icon: Icon,
  title,
  right,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        {Icon && <Icon className="h-3.5 w-3.5 text-brand" />}
        <h3 className="font-display text-xs uppercase tracking-[0.25em] text-foreground/90">
          {title}
        </h3>
      </div>
      {right}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-brand/40 bg-brand/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-[0.15em] text-brand">
      {children}
    </span>
  );
}

function HeroStat({
  icon: Icon,
  value,
  label,
  accent,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  value: string;
  label: string;
  accent?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-baseline gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0 translate-y-0.5 text-brand" />}
      <span
        className={`font-mono text-xl font-black leading-none tabular-nums sm:text-2xl ${
          accent ? "text-brand" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </span>
    </div>
  );
}

function BigStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`min-w-0 rounded-md border px-2 py-1.5 ${
        highlight
          ? "border-brand/40 bg-brand/5"
          : "border-white/8 bg-background/40"
      }`}
    >
      <div
        title={value}
        className={`truncate font-mono text-lg font-bold leading-none tabular-nums ${
          highlight ? "text-brand" : "text-foreground"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 truncate font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-sm tabular-nums">{value}</div>
    </div>
  );
}

function SidebarStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 text-sm last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums text-foreground">{value}</span>
    </div>
  );
}

function StatRow({
  label,
  value,
  badges,
}: {
  label: string;
  value?: string;
  badges?: Array<[string, string]>;
}) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-white/5 py-1.5 text-sm last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      {badges ? (
        <div className="flex flex-wrap items-center justify-end gap-1">
          {badges.map(([k, v]) => (
            <span key={k} className="rounded border border-white/10 bg-background/60 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              {k} <span className="text-foreground">{v}</span>
            </span>
          ))}
        </div>
      ) : (
        <span className="font-mono tabular-nums text-foreground">{value ?? "—"}</span>
      )}
    </div>
  );
}

function SourceRow({
  label,
  alpha,
  sust,
  burst,
}: {
  label: string;
  alpha: number;
  sust: number;
  burst: number;
}) {
  const v = (n: number) => (n > 0 ? fmt(n) : "—");
  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-3 border-b border-white/5 py-1 text-xs last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono tabular-nums w-14 text-right">{v(alpha)}</span>
      <span className="font-mono tabular-nums w-14 text-right">{v(sust)}</span>
      <span className="font-mono tabular-nums w-14 text-right">{v(burst)}</span>
    </div>
  );
}

function BarStat({
  label,
  value,
  unit = "",
  raw,
}: {
  label: string;
  value: number;
  unit?: string;
  raw?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{raw ?? `${value}${unit}`}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded bg-white/5">
        <div className="h-full rounded bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SectionGroup({
  title,
  list,
  picks,
  setPicks,
  setOpenSlot,
  hideTitle,
  bespokeSet,
  single,
}: {
  title: string;
  list: Array<SlotDescriptor>;
  picks: Record<string, SlotPick>;
  setPicks: React.Dispatch<React.SetStateAction<Record<string, SlotPick>>>;
  setOpenSlot: (k: string) => void;
  hideTitle?: boolean;
  bespokeSet?: Set<string>;
  /** Einspaltig rendern (schmale Karten-Spalte à la erkul). */
  single?: boolean;
}) {
  return (
    <div className="space-y-2">
      {!hideTitle && (
        <div className="flex items-center gap-2">
          <h4 className="font-display text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
            {title}
          </h4>
          <span className="font-mono text-[10px] text-muted-foreground">· {list.length}</span>
        </div>
      )}
      <div className={`grid gap-2 ${single ? "" : "md:grid-cols-2"}`}>
        {list.map((s) => (
          <SlotCard
            key={s.key}
            slot={s}
            pick={picks[s.key]}
            bespoke={
              !!picks[s.key]?.item_ref &&
              !!bespokeSet?.has(picks[s.key]!.item_ref as string)
            }
            onOpen={() => setOpenSlot(s.key)}
            onClear={() => {
              setPicks((p) => {
                const next = { ...p };
                delete next[s.key];
                return next;
              });
            }}
          />
        ))}
      </div>
    </div>
  );
}


function asText(v: unknown): string | null {
  if (typeof v === "string") return v || null;
  if (v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string") {
    return (v as { name: string }).name || null;
  }
  return null;
}

/* ---------- Bundled Armament (erkul-style grouped turret cards) ---------- */

/* ============ Erkul-style Armament Chain (Mount → Weapon) ============ */

function chainPrefix(name: string): string {
  return name
    .replace(/\s*·.*$/, "")
    .replace(/\s*\(.*\)\s*$/, "")
    .trim();
}

function stripIndex(name: string): string {
  return chainPrefix(name).replace(/\s+\d+$/, "").trim();
}

type ChainRow = {
  sig: string;
  count: number;
  parent: SlotDescriptor | null;
  parents: SlotDescriptor[];
  children: SlotDescriptor[][]; // per parent instance
};

function buildChainRows(
  list: SlotDescriptor[],
  picks: Record<string, SlotPick>,
): ChainRow[] {
  const parents = list.filter(
    (s) => s.category === "Turret Mounts" || s.kind === "rack",
  );
  const parentByPrefix = new Map<string, SlotDescriptor>();
  for (const p of parents) parentByPrefix.set(chainPrefix(p.name), p);

  const childrenByPrefix = new Map<string, SlotDescriptor[]>();
  const loose: SlotDescriptor[] = [];
  for (const s of list) {
    if (parents.includes(s)) continue;
    const pre = chainPrefix(s.name);
    if (parentByPrefix.has(pre)) {
      const arr = childrenByPrefix.get(pre) ?? [];
      arr.push(s);
      childrenByPrefix.set(pre, arr);
    } else {
      loose.push(s);
    }
  }

  const nameOf = (k: string) =>
    (picks[k] as unknown as { _name?: string } | undefined)?._name ?? "—";

  const rows: ChainRow[] = [];
  const bySig = new Map<string, ChainRow>();

  const push = (parent: SlotDescriptor | null, kids: SlotDescriptor[]) => {
    const sig = [
      parent ? `${stripIndex(parent.name)}|${parent.size}|${nameOf(parent.key)}` : "loose",
      kids.map((k) => `${k.size}:${nameOf(k.key)}`).join(","),
    ].join("#");
    const found = bySig.get(sig);
    if (found) {
      found.count += 1;
      if (parent) found.parents.push(parent);
      found.children.push(kids);
      return;
    }
    const row: ChainRow = { sig, count: 1, parent, parents: parent ? [parent] : [], children: [kids] };
    bySig.set(sig, row);
    rows.push(row);
  };

  for (const p of parents) {
    push(p, childrenByPrefix.get(chainPrefix(p.name)) ?? []);
  }
  for (const s of loose) push(null, [s]);
  return rows;
}

function ArmamentChain({
  list,
  picks,
  setPicks,
  setOpenSlot,
  bespokeSet,
  shipDps,
  onOpenBundle,
  expandedGroups,
  setExpandedGroups,
}: {
  list: SlotDescriptor[];
  picks: Record<string, SlotPick>;
  setPicks: React.Dispatch<React.SetStateAction<Record<string, SlotPick>>>;
  setOpenSlot: (k: string) => void;
  bespokeSet?: Set<string>;
  shipDps: number;
  onOpenBundle: (keys: string[]) => void;
  expandedGroups: Record<string, boolean>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
}) {
  const rows = useMemo(() => buildChainRows(list, picks), [list, picks]);
  const allOpen = !!expandedGroups.__all__;

  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <ChainRowView
          key={row.sig}
          row={row}
          picks={picks}
          setPicks={setPicks}
          setOpenSlot={setOpenSlot}
          bespokeSet={bespokeSet}
          shipDps={shipDps}
          onOpenBundle={onOpenBundle}
          isOpen={allOpen || !!expandedGroups[row.sig]}
          onToggle={() =>
            setExpandedGroups((m) => {
              const n = { ...m };
              delete n.__all__;
              if (allOpen) for (const r of rows) n[r.sig] = true;
              n[row.sig] = !(allOpen || !!m[row.sig]);
              return n;
            })
          }
        />
      ))}
    </div>
  );
}

function ChainRowView({
  row,
  picks,
  setPicks,
  setOpenSlot,
  bespokeSet,
  shipDps,
  onOpenBundle,
  isOpen,
  onToggle,
}: {
  row: ChainRow;
  picks: Record<string, SlotPick>;
  setPicks: React.Dispatch<React.SetStateAction<Record<string, SlotPick>>>;
  setOpenSlot: (k: string) => void;
  bespokeSet?: Set<string>;
  shipDps: number;
  onOpenBundle: (keys: string[]) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const parent = row.parent;
  const allKids = row.children.flat();
  // Waffen-Bündel innerhalb der Zeile: gleiche Auswahl → eine Karte
  const weaponGroups = useMemo(() => {
    const map = new Map<string, SlotDescriptor[]>();
    for (const k of allKids) {
      const ref = picks[k.key]?.item_ref ?? "__empty__";
      const sig = `${k.size}|${ref}`;
      const arr = map.get(sig) ?? [];
      arr.push(k);
      map.set(sig, arr);
    }
    return Array.from(map.values());
  }, [allKids, picks]);

  return (
    <div className="rounded-lg border border-white/8 bg-background/30 p-2">
      <div className="grid items-stretch gap-0 lg:grid-cols-[minmax(0,15rem)_1.25rem_minmax(0,1fr)]">
        {/* Mount / Frame */}
        <div className="flex">
          {parent ? (
            <MountCard
              slot={parent}
              count={row.count}
              pick={picks[parent.key]}
              onOpen={() =>
                onOpenBundle(row.parents.map((p) => p.key))
              }
              onToggle={allKids.length > 1 ? onToggle : undefined}
              isOpen={isOpen}
            />
          ) : (
            <div className="hidden lg:block" />
          )}
        </div>
        {/* Connector */}
        <div className="hidden lg:flex items-center justify-center">
          {parent && <div className="h-px w-full bg-brand/40" />}
        </div>
        {/* Weapons */}
        <div className="mt-2 space-y-2 lg:mt-0">
          {weaponGroups.map((g) => (
            <WeaponChainCard
              key={g[0].key}
              slots={g}
              pick={picks[g[0].key]}
              shipDps={shipDps}
              bespoke={
                !!picks[g[0].key]?.item_ref &&
                !!bespokeSet?.has(picks[g[0].key]!.item_ref as string)
              }
              multiplier={row.count > 1 ? 1 : 1}
              onOpen={() => onOpenBundle(g.map((s) => s.key))}
              onClear={() =>
                setPicks((p) => {
                  const n = { ...p };
                  for (const s of g) delete n[s.key];
                  return n;
                })
              }
            />
          ))}
        </div>
      </div>
      {isOpen && allKids.length > 1 && (
        <div className="mt-2 grid gap-2 border-t border-white/5 pt-2 md:grid-cols-2">
          {allKids.map((s) => (
            <SlotCard
              key={s.key}
              slot={s}
              pick={picks[s.key]}
              bespoke={
                !!picks[s.key]?.item_ref && !!bespokeSet?.has(picks[s.key]!.item_ref as string)
              }
              onOpen={() => setOpenSlot(s.key)}
              onClear={() =>
                setPicks((p) => {
                  const n = { ...p };
                  delete n[s.key];
                  return n;
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MountCard({
  slot,
  count,
  pick,
  onOpen,
  onToggle,
  isOpen,
}: {
  slot: SlotDescriptor;
  count: number;
  pick?: SlotPick;
  onOpen: () => void;
  onToggle?: () => void;
  isOpen: boolean;
}) {
  const pickedName = (pick as unknown as { _name?: string } | undefined)?._name ?? null;
  const isRack = slot.kind === "rack";
  const label = stripIndex(slot.name) || slot.name;
  return (
    <div className="w-full rounded-lg border border-white/10 bg-card/40 p-2.5">
      <div className="flex items-center gap-2">
        {count > 1 && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-bold">
            {count}×
          </span>
        )}
        <span className="rounded bg-brand px-1.5 py-0.5 font-mono text-[11px] font-bold text-background">
          S{slot.size ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{label}</div>
          <div className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            {isRack ? "Rack" : "Turret"}
          </div>
        </div>
        {onToggle && (
          <button
            onClick={onToggle}
            className="rounded border border-white/10 p-1 text-muted-foreground hover:border-brand hover:text-brand"
            title={isOpen ? "Slots einklappen" : "Slots einzeln zeigen"}
          >
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-2 border-t border-white/5 pt-2">
        <div className="min-w-0 flex-1 truncate text-[12px]">
          {pickedName ?? (
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {isRack ? "kein Rack" : "fester Rahmen"}
            </span>
          )}
        </div>
        {isRack && (
          <button
            onClick={onOpen}
            className="rounded border border-white/10 p-1 text-muted-foreground hover:border-brand hover:text-brand"
            title="Rack tauschen"
          >
            <Plus className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function WeaponChainCard({
  slots,
  pick,
  shipDps,
  bespoke,
  onOpen,
  onClear,
}: {
  slots: SlotDescriptor[];
  pick?: SlotPick;
  shipDps: number;
  bespoke?: boolean;
  multiplier?: number;
  onOpen: () => void;
  onClear: () => void;
}) {
  const first = slots[0];
  const n = slots.length;
  const name = (pick as unknown as { _name?: string } | undefined)?._name ?? null;
  const raw = (pick as unknown as { raw?: unknown } | undefined)?.raw as
    | Record<string, unknown>
    | undefined;
  const isMissile = first.category === "Missile & Bomb Racks";
  const w = raw && !isMissile ? weaponStatsFull(raw) : null;
  const m = raw && isMissile ? missileStats(raw) : null;

  const totalDps = (w?.burstDps ?? 0) * n;
  const share = shipDps > 0 ? Math.min(100, (totalDps / shipDps) * 100) : 0;
  const dominant = w
    ? (Object.entries(w.damageByType).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null)
    : null;
  const manufacturer = (() => {
    const r = raw as { manufacturer_name?: unknown; manufacturer?: unknown } | undefined;
    return asText(r?.manufacturer_name) ?? asText(r?.manufacturer);
  })();
  const speed = (() => {
    const vw = (raw as { vehicle_weapon?: { ammo?: { speed?: number } } } | undefined)?.vehicle_weapon;
    return vw?.ammo?.speed ?? 0;
  })();

  return (
    <div className="rounded-lg border border-brand/25 bg-card/50 p-2.5 transition hover:border-brand/60">
      <div className="flex items-start gap-2">
        <span className="rounded bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-bold">{n}×</span>
        <span className="rounded bg-brand px-1.5 py-0.5 font-mono text-[11px] font-bold text-background">
          S{first.size ?? "—"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-semibold">
              {name ?? <span className="italic font-normal text-muted-foreground">— leer —</span>}
            </span>
            {dominant && (
              <span className="rounded bg-brand/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-brand">
                {dominant}
              </span>
            )}
            {bespoke && (
              <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-amber-300">
                bespoke
              </span>
            )}
          </div>
          {manufacturer && (
            <div className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {manufacturer}
            </div>
          )}
        </div>
        <div className="shrink-0 text-right">
          <div className="font-mono text-lg font-bold leading-none text-brand tabular-nums">
            {fmt(totalDps)}
          </div>
          <div className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
            dps
          </div>
        </div>
      </div>

      {w && (
        <>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-0.5 font-mono text-[11px] tabular-nums">
            <span><span className="text-muted-foreground">alpha </span>{fmt(w.alpha)}</span>
            <span><span className="text-muted-foreground">rate </span>{fmt(w.shotsPerSecond)}/s</span>
            {w.ammoCapacity > 0 && (
              <span><span className="text-muted-foreground">ammo </span>{fmt(w.ammoCapacity)}</span>
            )}
            {speed > 0 && (
              <span><span className="text-muted-foreground">vel </span>{fmt(speed, "m/s")}</span>
            )}
            {w.range > 0 && (
              <span><span className="text-muted-foreground">range </span>{fmt(w.range, "m")}</span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/8">
              <div className="h-full rounded-full bg-brand" style={{ width: `${share}%` }} />
            </div>
            <span className="shrink-0 font-mono text-[10px] text-muted-foreground tabular-nums">
              {share.toFixed(1)}% of ship DPS
            </span>
          </div>
        </>
      )}

      {m && (
        <div className="mt-2 flex flex-wrap gap-x-4 font-mono text-[11px] tabular-nums">
          <span><span className="text-muted-foreground">dmg </span>{fmt(m.damage)}</span>
          <span><span className="text-muted-foreground">Σ </span>{fmt(m.damage * n)}</span>
        </div>
      )}

      <div className="mt-2 flex justify-end gap-1">
        <button
          onClick={onOpen}
          className="rounded border border-white/10 p-1 text-muted-foreground hover:border-brand hover:text-brand"
          title="Alle tauschen"
        >
          <Plus className="h-3 w-3" />
        </button>
        {pick?.item_ref && !bespoke && (
          <button
            onClick={onClear}
            className="rounded border border-white/10 p-1 text-muted-foreground hover:border-rose-400/50 hover:text-rose-300"
            title="Leeren"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

function bundleSig(s: SlotDescriptor): string {
  // "VariPuck S5 Mount 1", "VariPuck S5 Mount 2" -> gleiche Signatur.
  const base = s.name
    .replace(/\s*·?\s*Mount\s+\d+.*$/i, "")
    .replace(/\s+\d+$/, "")
    .trim();
  return `${s.category}|${s.size ?? ""}|${s.kind ?? ""}|${base}`;
}

function BundledSectionGroup({
  title,
  list,
  picks,
  setPicks,
  setOpenSlot,
  bespokeSet,
  expandedGroups,
  setExpandedGroups,
  onOpenBundle,
}: {
  title: string;
  list: Array<SlotDescriptor>;
  picks: Record<string, SlotPick>;
  setPicks: React.Dispatch<React.SetStateAction<Record<string, SlotPick>>>;
  setOpenSlot: (k: string) => void;
  bespokeSet?: Set<string>;
  expandedGroups: Record<string, boolean>;
  setExpandedGroups: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  onOpenBundle: (sig: string, keys: string[]) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, SlotDescriptor[]>();
    for (const s of list) {
      const sig = bundleSig(s);
      const arr = map.get(sig) ?? [];
      arr.push(s);
      map.set(sig, arr);
    }
    return Array.from(map.entries());
  }, [list]);

  const allOpen = !!expandedGroups.__all__;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="font-display text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
          {title}
        </h4>
        <span className="font-mono text-[10px] text-muted-foreground">· {list.length}</span>
      </div>
      <div className="space-y-2">
        {groups.map(([sig, items]) => {
          const isOpen = allOpen || !!expandedGroups[sig];
          if (items.length <= 1) {
            const s = items[0];
            return (
              <SlotCard
                key={s.key}
                slot={s}
                pick={picks[s.key]}
                bespoke={!!picks[s.key]?.item_ref && !!bespokeSet?.has(picks[s.key]!.item_ref as string)}
                onOpen={() => setOpenSlot(s.key)}
                onClear={() => setPicks((p) => { const n = { ...p }; delete n[s.key]; return n; })}
              />
            );
          }
          const keys = items.map((i) => i.key);
          return (
            <BundleCard
              key={sig}
              items={items}
              picks={picks}
              isOpen={isOpen}
              onToggle={() =>
                setExpandedGroups((m) => {
                  const n = { ...m };
                  delete n.__all__;
                  // if we were showing all-open, seed current open states
                  if (allOpen) {
                    for (const [s2] of groups) n[s2] = true;
                  }
                  n[sig] = !isOpen;
                  return n;
                })
              }
              onOpenBundle={() => onOpenBundle(sig, keys)}
              onClearBundle={() =>
                setPicks((p) => {
                  const n = { ...p };
                  for (const k of keys) delete n[k];
                  return n;
                })
              }
              onOpenSingle={(k) => setOpenSlot(k)}
              onClearSingle={(k) =>
                setPicks((p) => { const n = { ...p }; delete n[k]; return n; })
              }
              bespokeSet={bespokeSet}
            />
          );
        })}
      </div>
    </div>
  );
}

function BundleCard({
  items,
  picks,
  isOpen,
  onToggle,
  onOpenBundle,
  onClearBundle,
  onOpenSingle,
  onClearSingle,
  bespokeSet,
}: {
  items: SlotDescriptor[];
  picks: Record<string, SlotPick>;
  isOpen: boolean;
  onToggle: () => void;
  onOpenBundle: () => void;
  onClearBundle: () => void;
  onOpenSingle: (k: string) => void;
  onClearSingle: (k: string) => void;
  bespokeSet?: Set<string>;
}) {
  const first = items[0];
  const firstPick = picks[first.key];
  const firstName = (firstPick as unknown as { _name?: string } | undefined)?._name ?? null;
  // Uniform pick?
  const refs = items.map((i) => picks[i.key]?.item_ref ?? null);
  const uniform = refs.every((r) => r === refs[0]);
  const anyBespoke = items.some(
    (i) => !!picks[i.key]?.item_ref && !!bespokeSet?.has(picks[i.key]!.item_ref as string),
  );

  // Summed stats (weapons + missiles)
  let sumDps = 0, sumAlpha = 0, sumBurst = 0, sumCount = 0, sumMissiles = 0, sumMissileDmg = 0;
  for (const it of items) {
    const raw = (picks[it.key] as unknown as { raw?: unknown } | undefined)?.raw as
      | Record<string, unknown>
      | undefined;
    if (!raw) continue;
    if (it.category === "Weapons") {
      const w = weaponStats(raw);
      sumDps += w.dps; sumAlpha += w.alpha; sumBurst += w.dps; sumCount++;
    } else if (it.category === "Missile & Bomb Racks") {
      const m = missileStats(raw);
      sumMissiles += m.count; sumMissileDmg += m.damage;
    }
  }

  return (
    <div className="rounded-md border border-white/8 bg-background/40 hover:border-brand/40 transition">
      <div className="flex items-start gap-2 p-2.5">
        <button
          onClick={onToggle}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded border border-white/10 bg-background/60 text-muted-foreground hover:border-brand hover:text-brand"
          title={isOpen ? "Zusammenklappen" : "Aufklappen"}
        >
          <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "rotate-0" : "-rotate-90"}`} />
        </button>
        <div className="flex h-9 min-w-[46px] shrink-0 items-center justify-center gap-1 rounded border border-brand/50 bg-brand/10 px-1.5 font-mono text-brand">
          <span className="text-sm font-bold leading-none">{items.length}×</span>
          <span className="text-[9px] leading-none opacity-80">S{first.size ?? "—"}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground truncate">
            {first.name.replace(/\s*·?\s*Mount\s+\d+.*$/i, "").replace(/\s+\d+$/, "").trim() || first.name}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium">
            {uniform
              ? firstName ?? <span className="text-muted-foreground italic font-normal">— leer —</span>
              : <span className="text-amber-300 italic font-normal">gemischt</span>}
            {anyBespoke && (
              <span className="ml-2 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-amber-300 align-middle">
                bespoke
              </span>
            )}
          </div>
          {(sumDps > 0 || sumAlpha > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums">
              <span><span className="text-muted-foreground">Σ dps </span><span className="text-brand">{fmt(sumDps)}</span></span>
              <span><span className="text-muted-foreground">Σ alpha </span>{fmt(sumAlpha)}</span>
              <span><span className="text-muted-foreground">burst </span>{fmt(sumBurst)}</span>
            </div>
          )}
          {(sumMissiles > 0 || sumMissileDmg > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] tabular-nums">
              <span><span className="text-muted-foreground">missiles </span>{sumMissiles}</span>
              <span><span className="text-muted-foreground">Σ dmg </span><span className="text-brand">{fmt(sumMissileDmg)}</span></span>
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button
            onClick={onOpenBundle}
            className="rounded border border-white/10 p-1 text-muted-foreground hover:text-brand hover:border-brand"
            title="Alle im Bundle ändern"
          >
            <Plus className="h-3 w-3" />
          </button>
          {refs.some((r) => r) && !anyBespoke && (
            <button
              onClick={onClearBundle}
              className="rounded border border-white/10 p-1 text-muted-foreground hover:text-rose-300 hover:border-rose-400/50"
              title="Bundle leeren"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>
      {isOpen && (
        <div className="border-t border-white/5 p-2 grid gap-2 md:grid-cols-2">
          {items.map((s) => (
            <SlotCard
              key={s.key}
              slot={s}
              pick={picks[s.key]}
              bespoke={!!picks[s.key]?.item_ref && !!bespokeSet?.has(picks[s.key]!.item_ref as string)}
              onOpen={() => onOpenSingle(s.key)}
              onClear={() => onClearSingle(s.key)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ShipPicker({
  ships,
  currentSlug,
  onPick,
  onClose,
}: {
  ships: Awaited<ReturnType<typeof listShipCatalog>>;
  currentSlug: string;
  onPick: (slug: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const ready = ships.filter(
      (x) => x.productionStatus === "flight-ready" || x.slug === currentSlug,
    );
    const list = s
      ? ready.filter(
          (x) =>
            x.name.toLowerCase().includes(s) ||
            (x.manufacturer ?? "").toLowerCase().includes(s),
        )
      : ready;
    return list.slice(0, 200);
  }, [ships, q, currentSlug]);
  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="absolute z-40 mt-1 w-full rounded-lg border border-white/10 bg-background/95 backdrop-blur shadow-2xl">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          placeholder="Schiff suchen…"
          className="w-full border-b border-white/10 bg-transparent px-3 py-2 text-sm outline-none"
        />
        <div className="max-h-80 overflow-y-auto">
          {filtered.map((s) => (
            <button
              key={s.slug}
              onClick={() => onPick(s.slug)}
              className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/5 ${
                s.slug === currentSlug ? "bg-brand/10" : ""
              }`}
            >
              {s.image && (
                <img src={s.image} alt="" className="h-8 w-12 shrink-0 rounded object-cover" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{s.name}</div>
                <div className="truncate font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {asText(s.manufacturer) ?? "—"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </>
  );
}

function SlotCard({
  slot,
  pick,
  onOpen,
  onClear,
  bespoke,
}: {
  slot: SlotDescriptor;
  pick?: SlotPick;
  onOpen: () => void;
  onClear: () => void;
  bespoke?: boolean;
}) {
  const pickedName = (pick as unknown as { _name?: string } | undefined)?._name ?? pick?.item_ref ?? null;
  const shipFixed = !!(pick as unknown as { _shipFixed?: boolean } | undefined)?._shipFixed;
  const raw = (pick as unknown as { raw?: unknown } | undefined)?.raw as Record<string, unknown> | undefined;
  const isInfoOnly = slot.category === "Turret Mounts";
  const compCat = slot.category === "Missile & Bomb Racks" ? "missiles" : "weapons";
  const w = raw && compCat === "weapons" ? weaponStats(raw) : null;
  const m = raw && compCat === "missiles" ? missileStats(raw) : null;
  const sh = raw ? shieldStats(raw) : null;
  const pg = raw ? powerGen(raw) : 0;
  const cr = raw ? coolerRate(raw) : 0;

  return (
    <div className="group rounded-md border border-white/8 bg-background/40 p-2.5 hover:border-brand/40 transition">
      <div className="flex items-start gap-2">
        {/* Size chip */}
        <div className="flex h-9 w-9 shrink-0 flex-col items-center justify-center rounded border border-brand/50 bg-brand/10 font-mono text-brand">
          <span className="text-[9px] leading-none">S</span>
          <span className="text-sm leading-none font-bold">
            {slot.size ?? "—"}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground truncate">
            {slot.name}
          </div>
          <div className="mt-0.5 truncate text-sm font-medium">
            {isInfoOnly ? (
              <span className="text-muted-foreground italic font-normal">
                Turret-/Rack-Rahmen (Slots darunter bestücken)
              </span>
            ) : (
              pickedName ?? <span className="text-muted-foreground italic font-normal">— leer —</span>
            )}
            {(bespoke || shipFixed) && (
              <span
                title={
                  shipFixed
                    ? "Fest verbautes Schiffs-Bauteil (kein austauschbares Katalog-Item vorhanden)"
                    : "Schiffs-spezifisch (bespoke) — im Spiel nicht austauschbar"
                }
                className="ml-2 rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-amber-300 align-middle"
              >
                {shipFixed ? "fest verbaut" : "bespoke"}
              </span>
            )}
          </div>
          {w && (w.dps > 0 || w.alpha > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-[10px] tabular-nums">
              <span><span className="text-muted-foreground">dps </span><span className="text-brand">{fmt(w.dps)}</span></span>
              <span><span className="text-muted-foreground">alpha </span>{fmt(w.alpha)}</span>
              <span><span className="text-muted-foreground">range </span>{fmt(w.range, "m")}</span>
              {w.rpm > 0 && <span><span className="text-muted-foreground">rpm </span>{fmt(w.rpm)}</span>}
            </div>
          )}
          {m && (m.count > 0 || m.damage > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] tabular-nums">
              <span><span className="text-muted-foreground">count </span>{m.count}</span>
              <span><span className="text-muted-foreground">dmg </span><span className="text-brand">{fmt(m.damage)}</span></span>
            </div>
          )}
          {sh && sh.hp > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] tabular-nums">
              <span><span className="text-muted-foreground">hp </span><span className="text-brand">{fmt(sh.hp)}</span></span>
              <span><span className="text-muted-foreground">regen </span>{fmt(sh.regen, "hp/s")}</span>
            </div>
          )}
          {(pg > 0 || cr > 0) && (
            <div className="mt-1.5 flex flex-wrap gap-x-3 font-mono text-[10px] tabular-nums">
              {pg > 0 && <span><span className="text-muted-foreground">pwr </span>{fmt(pg)}</span>}
              {cr > 0 && <span><span className="text-muted-foreground">cool </span>{fmt(cr)}</span>}
            </div>
          )}
        </div>
        {!isInfoOnly && !shipFixed && <div className="flex flex-col gap-1 shrink-0">
          <button
            onClick={onOpen}
            className="rounded border border-white/10 p-1 text-muted-foreground hover:text-brand hover:border-brand"
            title={pickedName ? "Ändern" : "Auswählen"}
          >
            <Plus className="h-3 w-3" />
          </button>
          {pick && !bespoke && (
            <button
              onClick={onClear}
              className="rounded border border-white/10 p-1 text-muted-foreground hover:text-rose-300 hover:border-rose-400/50"
              title="Leeren"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          )}
        </div>}
      </div>
    </div>
  );
}

function ComponentPickerDialog({
  slot,
  currentItemRef,
  shipSlug,
  isBespoke,
  onClose,
  onPick,
}: {
  slot: SlotDescriptor;
  currentItemRef?: string | null;
  shipSlug: string;
  isBespoke?: boolean;
  onClose: () => void;
  onPick: (c: CompatComponent) => void;
}) {
  const compCat = mapCategoryToComponentCategory(slot.category) ?? "weapons";
  const listFn = useServerFn(listCompatibleComponents);
  const kindParam =
    slot.kind === "rack" || slot.kind === "ammo" || slot.kind === "weapon" || slot.kind === "system" || slot.kind === "propulsion"
      ? slot.kind
      : null;
  const { data, isLoading } = useQuery({
    queryKey: [
      "components",
      compCat,
      slot.size,
      kindParam,
      slot.expectedType,
      slot.expectedSubType,
      slot.sizeExact,
      currentItemRef ?? null,
      shipSlug,
    ],
    queryFn: () =>
      listFn({
        data: {
          category: compCat,
          size: slot.size,
          kind: kindParam ?? undefined,
          expectedType: slot.expectedType ?? undefined,
          expectedSubType: slot.expectedSubType ?? undefined,
          sizeExact: slot.sizeExact,
          currentItemRef: currentItemRef ?? undefined,
          shipSlug,
        },
      }),
    staleTime: 5 * 60 * 1000,
  });
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = data ?? [];
    if (!s) return list;
    return list.filter(
      (c) =>
        c.name.toLowerCase().includes(s) ||
        (c.manufacturer_name ?? "").toLowerCase().includes(s),
    );
  }, [data, q]);
  const alternatives = useMemo(() => {
    const list = data ?? [];
    if (!currentItemRef) return list;
    return list.filter((c) => c.item_ref !== currentItemRef);
  }, [data, currentItemRef]);
  const noAlternatives = !isLoading && alternatives.length === 0;
  const locked = !!isBespoke || noAlternatives;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-24" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-white/10 bg-background/95 backdrop-blur p-5 shadow-2xl"
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
              Slot · {slot.size !== null ? `Size ${slot.size}` : "Mount"}
            </div>
            <h3 className="font-display text-lg">{slot.name}</h3>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">✕</button>
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Komponente suchen…"
          disabled={locked}
          className="mb-3 w-full rounded-lg border border-white/10 bg-background/60 px-3 py-2 text-sm outline-none focus:border-brand disabled:opacity-40"
          autoFocus
        />
        {locked && (
          <div className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-200">
            <div className="font-mono uppercase tracking-[0.2em] text-[10px] text-amber-300/80 mb-1">
              // slot gesperrt
            </div>
            {isBespoke
              ? "Diese Komponente ist bespoke — laut scunpacked-Slot-Editierbarkeit auf diesem Schiff fest verbaut und im Spiel nicht austauschbar."
              : "Dieser Slot ist schiffs-spezifisch. Es sind keine kompatiblen Alternativen im Komponenten-Katalog vorhanden, daher kann die Komponente nicht getauscht werden."}
          </div>
        )}
        <div className="max-h-[60vh] overflow-y-auto divide-y divide-white/5 rounded-lg border border-white/10">
          {isLoading && <p className="p-4 text-sm text-muted-foreground">Lade…</p>}
          {!isLoading && !locked && filtered.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">Keine kompatiblen Komponenten gefunden.</p>
          )}
          {!locked && filtered.slice(0, 300).map((c) => (
            <button
              key={c.item_ref}
              onClick={() => onPick(c)}
              className={`flex w-full items-center gap-3 p-3 text-left hover:bg-white/[0.04] ${
                c.item_ref === currentItemRef ? "bg-brand/5" : ""
              }`}
            >
              {c.image_url ? (
                <img src={c.image_url} alt="" className="h-10 w-10 shrink-0 rounded object-cover" />
              ) : (
                <div className="h-10 w-10 shrink-0 rounded bg-white/5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm">{c.name}</div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground truncate">
                  {c.manufacturer_name ?? "—"} · Size {c.size ?? "—"} · {c.grade ?? c.classification_label ?? "—"}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}