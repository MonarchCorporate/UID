import { useMemo, useState } from "react";
import {
  AlignLeft,
  BadgeEuro,
  CalendarDays,
  Clock,
  Grid2x2,
  Images,
  LayoutPanelTop,
  LayoutTemplate,
  Minus,
  Play,
  Quote,
  Rocket,
  Search,
  ShoppingBag,
  Sparkles,
  SquareStack,
  Store,
  Type,
  UserPlus,
  Users,
  Waves,
  HelpCircle,
  BarChart3,
  GitCommitVertical,
  Columns2,
  Columns3,
  Columns4,
  Square,
} from "lucide-react";
import { BLOCK_META, type BlockType } from "@/lib/page-blocks";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const ICONS: Record<BlockType, React.ComponentType<{ className?: string }>> = {
  container: Columns2,
  hero: Rocket,
  text: Type,
  features: SquareStack,
  stats: BarChart3,
  gallery: Images,
  quote: Quote,
  cta: Sparkles,
  divider: Minus,
  timeline: GitCommitVertical,
  logos: LayoutPanelTop,
  faq: HelpCircle,
  countdown: Clock,
  video: Play,
  bento: Grid2x2,
  team: Users,
  pricing: BadgeEuro,
  shape: Waves,
  banner: LayoutTemplate,
  fleet: Rocket,
  calendar: CalendarDays,
  shop: Store,
  join: UserPlus,
};

const CATEGORIES: { label: string; types: BlockType[] }[] = [
  { label: "Basis", types: ["hero", "text", "gallery", "cta", "divider"] },
  { label: "Layout", types: ["bento", "banner", "shape", "logos"] },
  {
    label: "Inhalt",
    types: [
      "features",
      "stats",
      "timeline",
      "faq",
      "team",
      "pricing",
      "quote",
      "countdown",
      "video",
    ],
  },
  { label: "Orga-Daten", types: ["fleet", "calendar", "shop", "join"] },
];

/** Container-Vorlagen: Spaltenanzahl und Startbreiten. */
const CONTAINER_PRESETS: {
  key: string;
  label: string;
  columns: number;
  widths?: number[];
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { key: "c1", label: "1 Spalte", columns: 1, icon: Square },
  { key: "c2", label: "2 Spalten", columns: 2, icon: Columns2 },
  { key: "c3", label: "3 Spalten", columns: 3, icon: Columns3 },
  { key: "c4", label: "4 Spalten", columns: 4, icon: Columns4 },
  { key: "c7525", label: "75 / 25", columns: 2, widths: [75, 25], icon: Columns2 },
  { key: "c2575", label: "25 / 75", columns: 2, widths: [25, 75], icon: Columns2 },
];

/**
 * Elementor-artige Bibliothek: kategorisiert, durchsuchbar, mit Piktogrammen.
 * Klick fügt hinzu, Ziehen platziert an einer beliebigen Stelle im Canvas.
 */
export function ElementLibrary({
  onAdd,
  onDragStart,
  className,
}: {
  onAdd: (type: BlockType, columns?: number, widths?: number[]) => void;
  onDragStart?: (
    e: React.PointerEvent,
    type: BlockType,
    columns?: number,
    widths?: number[],
  ) => void;
  className?: string;
}) {
  const [q, setQ] = useState("");

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return CATEGORIES.map((c) => ({
      ...c,
      types: c.types.filter((t) => {
        if (!needle) return true;
        const m = BLOCK_META[t];
        return (
          m.label.toLowerCase().includes(needle) ||
          m.description.toLowerCase().includes(needle) ||
          t.includes(needle)
        );
      }),
    })).filter((c) => c.types.length > 0);
  }, [q]);

  return (
    <div className={cn("space-y-4", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Element suchen…"
          className="h-8 pl-7 text-xs"
        />
      </div>

      {"container".includes(q.trim().toLowerCase()) ||
      "spalten layout container".includes(q.trim().toLowerCase()) ? (
        <div className="space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Container
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {CONTAINER_PRESETS.map((p) => {
              const Icon = p.icon;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onAdd("container", p.columns, p.widths)}
                  onPointerDown={(e) => onDragStart?.(e, "container", p.columns, p.widths)}
                  title="Container mit Spalten – Elemente hineinziehen, Breiten stufenlos anpassen"
                  className="flex cursor-grab touch-none flex-col items-start gap-1.5 rounded border border-brand/25 bg-brand/[0.04] px-2 py-2.5 text-left text-xs transition-colors hover:border-brand/60 hover:bg-brand/10 hover:text-brand active:cursor-grabbing"
                >
                  <Icon className="h-4 w-4 shrink-0 text-brand/80" />
                  <span className="w-full truncate font-medium">{p.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {groups.map((c) => (
        <div key={c.label} className="space-y-1.5">
          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            {c.label}
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {c.types.map((t) => {
              const Icon = ICONS[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onAdd(t)}
                  onPointerDown={(e) => onDragStart?.(e, t)}
                  title={`${BLOCK_META[t].description} — klicken oder ins Canvas ziehen`}
                  className="flex cursor-grab touch-none flex-col items-start gap-1.5 rounded border border-white/10 bg-white/[0.02] px-2 py-2.5 text-left text-xs transition-colors hover:border-brand/50 hover:bg-brand/5 hover:text-brand active:cursor-grabbing"
                >
                  <Icon className="h-4 w-4 shrink-0 text-brand/80" />
                  <span className="w-full truncate font-medium">{BLOCK_META[t].label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <p className="p-3 text-center text-xs text-muted-foreground">Nichts gefunden.</p>
      )}
    </div>
  );
}

export { ICONS as BLOCK_ICONS };
