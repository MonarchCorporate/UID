import { Link } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import {
  listPublicOrgFleet,
  listPublicOrgMissions,
  listPublicOrgShop,
} from "@/lib/public-org.functions";
import { Starfield } from "@/components/idcp/Starfield";
import { AnimatedHeadline } from "@/components/idcp/AnimatedHeadline";
import { useReveal } from "@/hooks/use-reveal";
import { cn } from "@/lib/utils";
import { LOGO_SIZE_PX, logoSizeCss } from "@/lib/page-blocks";
import type {
  BannerBlock,
  BentoBlock,
  CountdownBlock,
  CtaBlock,
  DividerBlock,
  FaqBlock,
  FeaturesBlock,
  GalleryBlock,
  HeroBlock,
  JoinBlock,
  LogoContrast,
  LogoSize,
  LogoStyle,
  LogosBlock,
  PageBlock,
  PricingBlock,
  QuoteBlock,
  SectionBlock,
  ShapeBlock,
  StatsBlock,
  TeamBlock,
  TextBlock,
  TimelineBlock,
  VideoBlock,
} from "@/lib/page-blocks";
import type { ContainerBlock } from "@/lib/page-blocks";
import type { DragPayload, DropTarget } from "./useCanvasDnd";

export type PageContext = {
  slug: string;
  name: string;
  logoUrl: string;
  memberCount?: number;
};

const PADDING_CLASS: Record<string, string> = {
  none: "py-0",
  sm: "py-8",
  md: "py-14",
  lg: "py-20",
  xl: "py-28 md:py-36",
};

const WIDTH_CLASS: Record<string, string> = {
  narrow: "mx-auto w-full max-w-3xl px-6",
  normal: "mx-auto w-full max-w-6xl px-6",
  wide: "mx-auto w-full max-w-7xl px-6",
  full: "w-full px-6",
};

const ALIGN_CLASS: Record<string, string> = {
  left: "mr-auto ml-0",
  center: "mx-auto",
  right: "ml-auto mr-0",
};

const HOVER_CLASS: Record<string, string> = {
  none: "",
  lift: "fx-lift",
  glow: "fx-glow",
  tilt: "fx-tilt",
};

/** Steuerung für Drag & Drop im Editor-Canvas (pfadbasiert, inkl. Container). */
export type CanvasDnd = {
  setItemRef: (parent: number[], index: number) => (el: HTMLElement | null) => void;
  setZoneRef: (parent: number[]) => (el: HTMLElement | null) => void;
  begin: (e: React.PointerEvent, payload: DragPayload) => void;
  drop: DropTarget | null;
  activePath: number[] | null;
};

/** Aktionen der schwebenden Block-Toolbar im Canvas. */
export type BlockActions = {
  onMove: (id: string, dir: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onToggleHidden: (id: string) => void;
  onDelete: (id: string) => void;
  /** Öffnet die Element-Auswahl an der Einfügeposition (Elternpfad + Index). */
  onInsertAt?: (parent: number[], index: number) => void;
  /** Spalten eines Containers ändern (Breite, Anzahl). */
  onColumns?: (id: string, columns: ContainerBlock["columns"]) => void;
};

const samePath = (a?: number[] | null, b?: number[] | null) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => v === b[i]);

/** Stellt Inline-Bearbeitung im Canvas bereit (Texte direkt im Block ändern). */
const InlineCtx = createContext<{
  id: string;
  patch: (id: string, patch: Record<string, unknown>) => void;
} | null>(null);

/**
 * Inline editierbarer Text. Ohne Editor-Kontext ein normales Element,
 * im Editor `contentEditable` mit Commit beim Verlassen.
 */
function Ed({
  field,
  value,
  as: As = "span",
  className,
  placeholder = "Text …",
  hideWhenEmpty = true,
}: {
  field: string;
  value?: string;
  as?: React.ElementType;
  className?: string;
  placeholder?: string;
  hideWhenEmpty?: boolean;
}) {
  const ctx = useContext(InlineCtx);
  if (!ctx) {
    if (!value && hideWhenEmpty) return null;
    return <As className={className}>{value}</As>;
  }
  return (
    <As
      className={cn(
        className,
        "rounded-sm outline-none focus:ring-1 focus:ring-brand/70",
        !value && "text-muted-foreground/50",
      )}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      onClick={(e: React.MouseEvent) => e.stopPropagation()}
      onPointerDown={(e: React.PointerEvent) => e.stopPropagation()}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === "Escape") (e.target as HTMLElement).blur();
      }}
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const next = e.currentTarget.textContent ?? "";
        if (next !== (value ?? "")) ctx.patch(ctx.id, { [field]: next });
      }}
    >
      {value || placeholder}
    </As>
  );
}

const ANIM_STYLE: Record<string, { from: string }> = {
  "fade-up": { from: "opacity-0 translate-y-7" },
  "fade-in": { from: "opacity-0" },
  "scale-in": { from: "opacity-0 scale-95" },
  "slide-left": { from: "opacity-0 -translate-x-8" },
  "slide-right": { from: "opacity-0 translate-x-8" },
};

/** Wraps a block with background, spacing and its reveal animation. */
function BlockShell({
  block,
  children,
  onSelect,
  selected,
  editing,
  dragging,
  handle,
  innerRef,
}: {
  block: PageBlock;
  children: React.ReactNode;
  onSelect?: (id: string) => void;
  selected?: boolean;
  editing?: boolean;
  dragging?: boolean;
  handle?: React.ReactNode;
  innerRef?: (el: HTMLElement | null) => void;
}) {
  // Inline-Bearbeitung nur für den ausgewählten Block, damit Klicks auf
  // andere Blöcke weiterhin die Auswahl wechseln.
  const ref = useReveal<HTMLElement>();
  const anim = block.anim ?? "fade-up";
  const animated = anim !== "none" && !editing;
  const bg = block.bg ?? "none";
  const overlay = block.bgOverlay ?? 55;
  const custom =
    block.padTop !== undefined || block.padBottom !== undefined
      ? {
          paddingTop: block.padTop !== undefined ? `${block.padTop}px` : undefined,
          paddingBottom: block.padBottom !== undefined ? `${block.padBottom}px` : undefined,
        }
      : {};

  return (
    <section
      ref={(el) => {
        if (animated) (ref as { current: HTMLElement | null }).current = el;
        innerRef?.(el);
      }}
      id={block.anchor || `sec-${block.id}`}
      data-nav-tag={
        (block as { tag?: string }).tag?.trim()
          ? (block as { tag?: string }).tag
          : undefined
      }
      onClick={
        onSelect
          ? (e) => {
              e.stopPropagation();
              onSelect(block.id);
            }
          : undefined
      }
      className={cn(
        "relative",
        PADDING_CLASS[block.padding ?? "lg"],
        bg === "dark" && "bg-black/40",
        bg === "accent" && "bg-brand/5",
        bg === "grid" && "data-grid",
        bg === "stars" && "overflow-hidden bg-black/30",
        bg === "gradient" &&
          "overflow-hidden bg-[linear-gradient(160deg,color-mix(in_oklab,var(--brand)_14%,transparent),transparent_55%,rgba(0,0,0,0.55))]",
        bg === "glow" && "overflow-hidden",
        bg === "image" && "overflow-hidden",
        animated && "block-anim",
        editing && "cursor-pointer transition-colors hover:bg-brand/[0.04]",
        editing && selected && "ring-2 ring-brand/70 ring-offset-0",
        block.hidden && editing && "opacity-40",
        dragging && "opacity-40",
      )}
      style={
        {
          ...(animated ? { transitionDelay: `${block.animDelay ?? 0}ms` } : {}),
          ...custom,
        } as React.CSSProperties
      }
      data-anim={animated ? anim : undefined}
    >
      {bg === "stars" && <Starfield density={70} />}
      {bg === "glow" && (
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 0%, color-mix(in oklab, var(--brand) 22%, transparent), transparent 70%)",
          }}
          aria-hidden
        />
      )}
      {bg === "image" && block.bgImageUrl && (
        <ParallaxImage
          url={block.bgImageUrl}
          overlay={overlay}
          parallax={!!block.parallax && !editing}
        />
      )}
      {handle}
      <div
        className={cn(
          "relative",
          WIDTH_CLASS[block.width ?? "normal"],
          block.alignX && ALIGN_CLASS[block.alignX],
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Hintergrundbild mit optionalem, sanftem Parallax-Versatz. */
function ParallaxImage({
  url,
  overlay,
  parallax,
}: {
  url: string;
  overlay: number;
  parallax: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!parallax) return;
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const r = el.getBoundingClientRect();
        const p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight;
        el.style.transform = `translate3d(0, ${(-p * 40).toFixed(1)}px, 0) scale(1.15)`;
      });
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [parallax]);
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div ref={ref} className="absolute inset-0 will-change-transform">
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
      </div>
      <div className="absolute inset-0 bg-background" style={{ opacity: overlay / 100 }} />
    </div>
  );
}

export function BlockList({
  blocks,
  ctx,
  editing,
  selectedId,
  onSelect,
  dnd,
  actions,
  onPatch,
  path = [],
}: {
  blocks: PageBlock[];
  ctx: PageContext;
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Aktiviert Drag & Drop im Canvas mit einrastender Einfüge-Linie. */
  dnd?: CanvasDnd;
  /** Blockaktionen direkt am Block (Elementor-Stil). */
  actions?: BlockActions;
  /** Inline-Textbearbeitung im Canvas. */
  onPatch?: (id: string, patch: Record<string, unknown>) => void;
  /** Elternpfad dieser Liste ([] = Seitenebene, [2,1] = Spalte 1 von Block 2). */
  path?: number[];
}) {
  const visible = blocks.map((b, index) => ({ b, index })).filter(({ b }) => editing || !b.hidden);
  const dropHere = dnd?.drop && samePath(dnd.drop.parent, path) ? dnd.drop.index : null;
  const inner = (
    <>
      {visible.map(({ b, index }) => (
        <div key={b.id} className="group/blk relative">
          {dropHere === index && <DropLine />}
          {actions?.onInsertAt && <InsertPoint onClick={() => actions.onInsertAt!(path, index)} />}
          <BlockShell
            block={b}
            editing={editing}
            selected={selectedId === b.id}
            onSelect={onSelect}
            dragging={samePath(dnd?.activePath, [...path, index])}
            innerRef={dnd?.setItemRef(path, index)}
            handle={
              dnd ? (
                <button
                  type="button"
                  title="Ziehen zum Verschieben"
                  onPointerDown={(e) =>
                    dnd.begin(e, { kind: "move", path: [...path, index], label: b.type })
                  }
                  onClick={(e) => e.stopPropagation()}
                  className="absolute left-2 top-2 z-30 flex cursor-grab touch-none items-center gap-1 rounded border border-brand/40 bg-background/85 px-1.5 py-1 text-brand opacity-60 backdrop-blur transition-opacity hover:bg-brand/15 hover:opacity-100 active:cursor-grabbing"
                >
                  <GripVertical className="h-3.5 w-3.5" />
                </button>
              ) : undefined
            }
          >
            {actions && (
              <BlockToolbar
                block={b}
                index={index}
                last={index === blocks.length - 1}
                nested={path.length > 0}
                actions={actions}
              />
            )}
            {b.type === "container" ? (
              <ContainerView
                b={b}
                path={[...path, index]}
                ctx={ctx}
                editing={editing}
                selectedId={selectedId}
                onSelect={onSelect}
                dnd={dnd}
                actions={actions}
                onPatch={onPatch}
              />
            ) : onPatch && selectedId === b.id ? (
              <InlineCtx.Provider value={{ id: b.id, patch: onPatch }}>
                <BlockBody block={b} ctx={ctx} />
              </InlineCtx.Provider>
            ) : (
              <BlockBody block={b} ctx={ctx} />
            )}
          </BlockShell>
          {dropHere === index + 1 && index === visible[visible.length - 1].index && <DropLine />}
          {actions?.onInsertAt && index === visible[visible.length - 1].index && (
            <InsertPoint onClick={() => actions.onInsertAt!(path, index + 1)} />
          )}
        </div>
      ))}
      {dnd && visible.length === 0 && dropHere !== null && <DropLine />}
    </>
  );
  // Im Editor braucht jede Liste eine Ablagefläche, damit DnD sie treffen kann.
  if (!dnd) return inner;
  return (
    <div ref={dnd.setZoneRef(path)} className={path.length > 0 ? "min-h-[80px]" : undefined}>
      {inner}
    </div>
  );
}

/* ------------------------------- Container ------------------------------- */

const COL_BG: Record<string, string> = {
  none: "",
  card: "rounded-xl border border-white/10 bg-white/[0.03]",
  dark: "rounded-xl bg-black/40",
  accent: "rounded-xl bg-brand/5",
};

/** Spalten-Container: rendert verschachtelte Blöcke und erlaubt stufenloses Resizen. */
function ContainerView({
  b,
  path,
  ctx,
  editing,
  selectedId,
  onSelect,
  dnd,
  actions,
  onPatch,
}: {
  b: ContainerBlock;
  path: number[];
  ctx: PageContext;
  editing?: boolean;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  dnd?: CanvasDnd;
  actions?: BlockActions;
  onPatch?: (id: string, patch: Record<string, unknown>) => void;
}) {
  const cols = b.columns.length ? b.columns : [{ id: "c0", width: 100, blocks: [] }];
  const gap = b.gap ?? 24;
  const gridRef = useRef<HTMLDivElement | null>(null);

  const startResize = (e: React.PointerEvent, i: number) => {
    if (!actions?.onColumns) return;
    e.preventDefault();
    e.stopPropagation();
    const grid = gridRef.current;
    if (!grid) return;
    const total = grid.getBoundingClientRect().width;
    const startX = e.clientX;
    const a = cols[i].width;
    const bw = cols[i + 1].width;
    const move = (ev: PointerEvent) => {
      const deltaPct = ((ev.clientX - startX) / Math.max(1, total)) * 100;
      let na = a + deltaPct;
      let nb = bw - deltaPct;
      const min = 5;
      if (na < min) {
        nb -= min - na;
        na = min;
      }
      if (nb < min) {
        na -= min - nb;
        nb = min;
      }
      const round = (v: number) => Math.round(v * 10) / 10;
      actions.onColumns!(
        b.id,
        cols.map((c, j) =>
          j === i ? { ...c, width: round(na) } : j === i + 1 ? { ...c, width: round(nb) } : c,
        ),
      );
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <div className="pb-colwrap">
      <div
        ref={gridRef}
        className={cn("pb-cols", b.stack !== false && "pb-stack")}
        style={
          {
            "--pb-cols": cols.map((c) => `minmax(0, ${Math.max(5, c.width)}fr)`).join(" "),
            "--pb-gap": `${gap}px`,
            alignItems:
              b.alignY === "center"
                ? "center"
                : b.alignY === "end"
                  ? "end"
                  : b.alignY === "start"
                    ? "start"
                    : "stretch",
          } as React.CSSProperties
        }
      >
        {cols.map((col, i) => (
          <div key={col.id} className="relative min-w-0">
            <div
              className={cn(
                "h-full min-w-0",
                COL_BG[col.bg ?? "none"],
                editing && "outline-1 outline-dashed outline-white/10",
              )}
              style={col.pad ? { padding: `${col.pad}px` } : undefined}
            >
              <BlockList
                blocks={col.blocks}
                ctx={ctx}
                editing={editing}
                selectedId={selectedId}
                onSelect={onSelect}
                dnd={dnd}
                actions={actions}
                onPatch={onPatch}
                path={[...path, i]}
              />
              {editing && col.blocks.length === 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    actions?.onInsertAt?.([...path, i], 0);
                  }}
                  className="flex min-h-[80px] w-full items-center justify-center gap-2 rounded-lg border border-dashed border-white/15 text-[11px] text-muted-foreground hover:border-brand/50 hover:text-brand"
                >
                  <Plus className="h-3.5 w-3.5" /> Element hinzufügen
                </button>
              )}
            </div>
            {/* Stufenloser Breiten-Regler zwischen zwei Spalten */}
            {editing && actions?.onColumns && i < cols.length - 1 && (
              <div
                role="separator"
                title="Breite ziehen"
                onPointerDown={(e) => startResize(e, i)}
                onClick={(e) => e.stopPropagation()}
                className="absolute inset-y-0 z-30 hidden w-3 cursor-col-resize items-center justify-center md:flex"
                style={{ right: `-${gap / 2 + 6}px` }}
              >
                <div className="h-10 w-1 rounded bg-brand/40 transition-colors hover:bg-brand" />
              </div>
            )}
            {editing && (
              <div className="pointer-events-none absolute -top-5 left-0 font-mono text-[9px] text-brand/70">
                {Math.round(col.width)}%
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** „+“-Punkt zwischen zwei Blöcken – fügt genau dort ein neues Element ein. */
function InsertPoint({ onClick }: { onClick: () => void }) {
  return (
    <div className="relative z-30 h-0">
      <div className="absolute inset-x-0 -top-3 flex h-6 items-center justify-center opacity-0 transition-opacity hover:opacity-100 group-hover/blk:opacity-100">
        <div className="absolute inset-x-8 top-1/2 h-px bg-brand/30" />
        <button
          type="button"
          title="Hier Element einfügen"
          onClick={(e) => {
            e.stopPropagation();
            onClick();
          }}
          className="relative flex size-6 items-center justify-center rounded-full border border-brand/60 bg-background text-brand shadow hover:bg-brand hover:text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** Schwebende Aktionsleiste am Block (Elementor-Stil). */
function BlockToolbar({
  block,
  index,
  last,
  nested,
  actions,
}: {
  block: PageBlock;
  index: number;
  last: boolean;
  nested?: boolean;
  actions: BlockActions;
}) {
  const btn =
    "flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-brand/15 hover:text-brand disabled:opacity-30";
  return (
    <div
      className={cn(
        "absolute right-2 top-2 z-30 flex items-center gap-0.5 rounded border border-white/15 bg-background/90 px-1 py-1 opacity-0 backdrop-blur transition-opacity group-hover/blk:opacity-100 focus-within:opacity-100",
        nested && "scale-90",
      )}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        title="Nach oben"
        className={btn}
        disabled={index === 0}
        onClick={() => actions.onMove(block.id, -1)}
      >
        <ArrowUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Nach unten"
        className={btn}
        disabled={last}
        onClick={() => actions.onMove(block.id, 1)}
      >
        <ArrowDown className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title="Duplizieren"
        className={btn}
        onClick={() => actions.onDuplicate(block.id)}
      >
        <Copy className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        title={block.hidden ? "Einblenden" : "Ausblenden"}
        className={btn}
        onClick={() => actions.onToggleHidden(block.id)}
      >
        {block.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      </button>
      <button
        type="button"
        title="Löschen"
        className={cn(btn, "hover:bg-destructive/15 hover:text-destructive")}
        onClick={() => actions.onDelete(block.id)}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function DropLine() {
  return (
    <div className="pointer-events-none relative z-40 h-0">
      <div className="absolute inset-x-0 -top-0.5 h-1 bg-brand shadow-[0_0_16px_var(--brand)]" />
    </div>
  );
}

function BlockBody({ block, ctx }: { block: PageBlock; ctx: PageContext }) {
  switch (block.type) {
    case "hero":
      return <HeroView b={block} ctx={ctx} />;
    case "text":
      return <TextView b={block} />;
    case "features":
      return <FeaturesView b={block} />;
    case "stats":
      return <StatsView b={block} />;
    case "gallery":
      return <GalleryView b={block} />;
    case "quote":
      return <QuoteView b={block} />;
    case "cta":
      return <CtaView b={block} />;
    case "divider":
      return <DividerView b={block} />;
    case "join":
      return <JoinView b={block} />;
    case "timeline":
      return <TimelineView b={block} />;
    case "logos":
      return <LogosView b={block} />;
    case "faq":
      return <FaqView b={block} />;
    case "countdown":
      return <CountdownView b={block} />;
    case "video":
      return <VideoView b={block} />;
    case "bento":
      return <BentoView b={block} />;
    case "team":
      return <TeamView b={block} />;
    case "pricing":
      return <PricingView b={block} />;
    case "shape":
      return <ShapeView b={block} />;
    case "banner":
      return <BannerView b={block} ctx={ctx} />;
    case "fleet":
      return <FleetView b={block} ctx={ctx} />;
    case "calendar":
      return <CalendarView b={block} ctx={ctx} />;
    case "shop":
      return <ShopView b={block} ctx={ctx} />;
  }
}

/* ------------------------------- Bausteine ------------------------------ */

function Tag({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return (
    <div className="mb-4 inline-block border border-brand/30 p-1">
      <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
        // {children}
      </div>
    </div>
  );
}

/** Tag-Chip mit Inline-Bearbeitung. */
function EdTag({ value }: { value?: string }) {
  const ctx = useContext(InlineCtx);
  if (!ctx) return <Tag>{value}</Tag>;
  return (
    <Tag>
      <Ed field="tag" value={value} placeholder="Tag" hideWhenEmpty={false} />
    </Tag>
  );
}

/** Gemeinsamer Kopfbereich (Tag + Titel + Untertitel) für die neuen Blöcke. */
function Head({ tag, title, subtitle }: { tag?: string; title?: string; subtitle?: string }) {
  const inline = useContext(InlineCtx);
  if (!inline && !tag && !title && !subtitle) return null;
  return (
    <div className="mb-8">
      <EdTag value={tag} />
      <Ed
        field="title"
        value={title}
        as="h2"
        className="font-display text-3xl tracking-tight md:text-4xl"
        placeholder="Überschrift"
      />
      <Ed
        field="subtitle"
        value={subtitle}
        as="p"
        className="mt-2 block max-w-2xl text-sm text-muted-foreground"
        placeholder="Untertitel"
      />
    </div>
  );
}

/** Container, der die Kind-Elemente gestaffelt einblendet. */
function Stagger({
  ms,
  className,
  children,
}: {
  ms?: number;
  className?: string;
  children: React.ReactNode;
}) {
  const on = !!ms && ms > 0;
  return (
    <div
      className={cn(className, on && "stagger")}
      style={on ? ({ ["--stg" as string]: `${ms}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

function LinkButton({
  label,
  href,
  variant = "solid",
}: {
  label?: string;
  href?: string;
  variant?: "solid" | "ghost";
}) {
  if (!label) return null;
  const cls =
    variant === "solid"
      ? "border border-brand bg-brand/10 text-brand hover:bg-brand hover:text-primary-foreground"
      : "border border-brand/30 text-foreground/80 hover:border-brand hover:text-brand";
  return (
    <a
      href={href || "#"}
      target={href?.startsWith("http") ? "_blank" : undefined}
      rel="noreferrer"
      className={cn(
        "inline-block px-6 py-3 font-mono text-[10px] font-bold uppercase tracking-[0.25em] transition-colors",
        cls,
      )}
    >
      {label}
    </a>
  );
}

/** Orga-Logo in verschiedenen Inszenierungs-Varianten. */
function BrandLogo({
  src,
  alt,
  size,
  variant,
  contrast = "auto",
  autoSize = true,
  onImage = false,
}: {
  src: string;
  alt: string;
  size: LogoSize;
  variant: LogoStyle;
  contrast?: LogoContrast;
  autoSize?: boolean;
  onImage?: boolean;
}) {
  const px = LOGO_SIZE_PX[size] ?? LOGO_SIZE_PX.md;
  const dim = logoSizeCss(size, autoSize);
  /** „auto": Kontrastfläche nur dort, wo ein Bild-/Effekt-Hintergrund stört. */
  const mode: LogoContrast =
    contrast === "auto" ? (onImage && variant !== "badge" ? "dark" : "none") : contrast;
  const plate =
    mode === "none"
      ? undefined
      : mode === "light"
        ? {
            background: "color-mix(in oklab, var(--background) 12%, white 88%)",
            boxShadow: "0 8px 30px -12px rgba(0,0,0,.45)",
          }
        : {
            background: "color-mix(in oklab, var(--background) 78%, black 22%)",
            boxShadow: "0 8px 30px -12px rgba(0,0,0,.65)",
          };
  const plateCls = plate
    ? variant === "badge"
      ? "rounded-2xl p-[10%] backdrop-blur-md"
      : "rounded-full p-[10%] backdrop-blur-md"
    : "";
  const box = (inner: ReactNode, cls: string, style?: CSSProperties) => (
    <div className={cn("shrink-0", cls)} style={{ width: dim, height: dim, ...style }}>
      {inner}
    </div>
  );
  const img = (
    <img
      src={src}
      alt={alt}
      width={px}
      height={px}
      className="h-full w-full object-contain"
    />
  );
  const inner =
    plate && variant !== "ring" ? (
      <div className={cn("h-full w-full", plateCls)} style={plate}>
        {img}
      </div>
    ) : (
      img
    );
  if (variant === "ring") {
    return (
      <div
        className="relative shrink-0 rounded-full border border-brand/40 bg-background/40 p-[14%] backdrop-blur-sm"
        style={{
          width: dim,
          height: dim,
          ...(plate ?? {}),
          boxShadow: `0 0 0 1px color-mix(in oklab, var(--brand-accent) 35%, transparent)${
            plate ? ", 0 8px 30px -12px rgba(0,0,0,.6)" : ""
          }`,
        }}
      >
        {img}
      </div>
    );
  }
  if (variant === "badge") {
    return (
      <div
        className="relative shrink-0 rounded-2xl border border-white/10 bg-gradient-to-br from-brand/15 to-transparent p-[12%]"
        style={{ width: dim, height: dim, ...(plate ?? {}) }}
      >
        {img}
      </div>
    );
  }
  if (variant === "glow") {
    return (
      <div className="relative shrink-0" style={{ width: dim, height: dim }}>
        <div
          aria-hidden
          className="absolute inset-[-25%] rounded-full blur-2xl"
          style={{
            background:
              "radial-gradient(circle, color-mix(in oklab, var(--brand) 45%, transparent) 0%, transparent 70%)",
          }}
        />
        <div className="relative h-full w-full drop-shadow-[0_0_18px_color-mix(in_oklab,var(--brand-accent)_60%,transparent)]">
          {inner}
        </div>
      </div>
    );
  }
  return box(inner, "");
}

function HeroView({ b, ctx }: { b: HeroBlock; ctx: PageContext }) {
  const inline = useContext(InlineCtx);
  const heightCls =
    b.height === "full"
      ? "min-h-[80vh] justify-center"
      : b.height === "half"
        ? "min-h-[48vh] justify-center"
        : "";
  const beside = b.logoPosition === "beside";
  const behind = b.logoPosition === "behind";
  const logo = b.showLogo ? (
    <BrandLogo
      src={ctx.logoUrl}
      alt={ctx.name}
      size={b.logoSize ?? "md"}
      variant={b.logoStyle ?? "plain"}
      contrast={b.logoContrast ?? "auto"}
      autoSize={b.logoAutoSize !== false}
      onImage={!!b.imageUrl || !!b.starfield || b.logoPosition === "behind"}
    />
  ) : null;
  const body = (
    <>
      {logo && !beside && !behind && logo}
      <EdTag value={b.tag} />
      {b.animatedTitle && !inline ? (
        <AnimatedHeadline
          text={b.title}
          className="font-display text-5xl tracking-tight md:text-7xl"
        />
      ) : (
        <Ed
          field="title"
          value={b.title}
          as="h1"
          className="font-display text-5xl tracking-tight md:text-7xl"
          placeholder="Titel"
        />
      )}
      <Ed
        field="subtitle"
        value={b.subtitle}
        as="p"
        className="block max-w-2xl text-base leading-relaxed text-muted-foreground md:text-lg"
        placeholder="Untertitel"
      />
      <div className="flex flex-wrap gap-3">
        <LinkButton label={b.primaryLabel} href={b.primaryUrl} />
        <LinkButton label={b.secondaryLabel} href={b.secondaryUrl} variant="ghost" />
      </div>
    </>
  );
  return (
    <div className={cn("relative flex flex-col", heightCls)}>
      {b.imageUrl && (
        <div className="absolute inset-0 -z-10 overflow-hidden">
          <img
            src={b.imageUrl}
            alt=""
            className="h-full w-full object-cover opacity-50 animate-ken-burns"
            loading="lazy"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/50 via-background/30 to-background" />
        </div>
      )}
      {b.starfield && <Starfield density={110} />}
      {logo && behind && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
          <img
            src={ctx.logoUrl}
            alt=""
            aria-hidden
            className="h-[110%] max-w-none object-contain opacity-[0.07] blur-[1px]"
          />
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-60 blur-[1px] animate-scanline" />
      {beside && logo ? (
        <div className="relative grid items-center gap-10 md:grid-cols-[auto_1fr]">
          <div className="flex justify-center md:justify-start">{logo}</div>
          <div className="flex flex-col items-start gap-6">{body}</div>
        </div>
      ) : (
        <div className="relative flex flex-col items-start gap-6">{body}</div>
      )}
    </div>
  );
}

function TextView({ b }: { b: TextBlock }) {
  const text = (
    <div className={cn(b.align === "center" && "text-center")}>
      <EdTag value={b.tag} />
      <Ed
        field="title"
        value={b.title}
        as="h2"
        className="font-display text-3xl tracking-tight md:text-4xl"
        placeholder="Überschrift"
      />
      <Ed
        field="body"
        value={b.body}
        as="p"
        className="mt-4 block whitespace-pre-wrap text-sm leading-relaxed text-foreground/80 md:text-base"
        placeholder="Text …"
      />
    </div>
  );
  if (!b.imageUrl) return text;
  return (
    <div
      className={cn(
        "grid items-center gap-10 md:grid-cols-2",
        b.imageSide === "left" && "md:[&>*:first-child]:order-2",
      )}
    >
      {text}
      <img
        src={b.imageUrl}
        alt=""
        loading="lazy"
        className="h-64 w-full border border-brand/10 object-cover md:h-80"
      />
    </div>
  );
}

function FeaturesView({ b }: { b: FeaturesBlock }) {
  const cols =
    b.columns === 2
      ? "sm:grid-cols-2"
      : b.columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div>
      <Head tag={b.tag} title={b.title} subtitle={b.subtitle} />
      <div className={cn("grid gap-4", cols)}>
        {b.items.map((it, i) => (
          <div
            key={i}
            className="group border border-brand/10 bg-white/[0.02] p-5 transition-colors hover:border-brand/40"
          >
            <div className="font-display text-lg">{it.title}</div>
            <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{it.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StatsView({ b }: { b: StatsBlock }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {b.items.map((it, i) => (
        <div key={i} className="border border-brand/10 bg-white/[0.02] p-6 text-center">
          <div className="font-display text-4xl text-brand md:text-5xl">{it.value}</div>
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {it.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function GalleryView({ b }: { b: GalleryBlock }) {
  const cols =
    b.columns === 2
      ? "sm:grid-cols-2"
      : b.columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div>
      {b.title && (
        <h2 className="mb-6 font-display text-3xl tracking-tight md:text-4xl">{b.title}</h2>
      )}
      {b.items.length === 0 ? (
        <div className="border border-dashed border-brand/20 p-10 text-center font-mono text-xs text-muted-foreground">
          // noch keine Bilder
        </div>
      ) : (
        <div className={cn("grid gap-3", cols)}>
          {b.items.map((it, i) => (
            <figure key={i} className="overflow-hidden border border-brand/10">
              <img
                src={it.url}
                alt={it.caption ?? ""}
                loading="lazy"
                className="aspect-[16/10] w-full object-cover transition-transform duration-500 hover:scale-105"
              />
              {it.caption && (
                <figcaption className="p-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {it.caption}
                </figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}

function QuoteView({ b }: { b: QuoteBlock }) {
  return (
    <blockquote className="border-l-2 border-brand pl-6">
      <Ed
        field="text"
        value={b.text}
        as="p"
        className="block font-display text-2xl leading-snug tracking-tight md:text-4xl"
        placeholder="Zitat …"
      />
      <Ed
        field="author"
        value={b.author}
        as="footer"
        className="mt-4 block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground"
        placeholder="Autor"
      />
    </blockquote>
  );
}

function CtaView({ b }: { b: CtaBlock }) {
  return (
    <div className="flex flex-col items-center gap-4 border border-brand/20 bg-brand/[0.03] px-6 py-12 text-center">
      <Ed
        field="title"
        value={b.title}
        as="h2"
        className="font-display text-3xl tracking-tight md:text-4xl"
        placeholder="Titel"
      />
      <Ed
        field="text"
        value={b.text}
        as="p"
        className="block max-w-2xl text-sm text-muted-foreground"
        placeholder="Text"
      />
      <LinkButton label={b.buttonLabel} href={b.buttonUrl} />
    </div>
  );
}

function DividerView({ b }: { b: DividerBlock }) {
  if (b.style === "space") return <div className="h-10" />;
  if (b.style === "line") return <div className="h-px w-full bg-white/10" />;
  return <div className="section-scanline" />;
}

function JoinView({ b }: { b: JoinBlock }) {
  return (
    <div className="grid gap-8 md:grid-cols-2 md:items-center">
      <div>
        <Tag>{b.tag}</Tag>
        <h2 className="font-display text-3xl tracking-tight md:text-4xl">{b.title}</h2>
        {b.text && (
          <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{b.text}</p>
        )}
        <div className="mt-6">
          <LinkButton label={b.buttonLabel} href={b.buttonUrl} />
        </div>
      </div>
      <ul className="space-y-2">
        {(b.bullets ?? []).map((x, i) => (
          <li
            key={i}
            className="flex items-center gap-3 border border-brand/10 bg-white/[0.02] px-4 py-3 text-sm"
          >
            <span className="size-1.5 bg-brand" aria-hidden />
            {x}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------------------- Dynamische Blöcke --------------------------- */

function SectionHeader({ b, href }: { b: SectionBlock; href: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <Tag>{b.tag}</Tag>
        <h2 className="font-display text-4xl tracking-tight md:text-5xl">{b.title}</h2>
        {b.subtitle && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{b.subtitle}</p>}
      </div>
      {b.cta && (
        <a
          href={href}
          className="border border-brand/40 px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
        >
          {b.cta}
        </a>
      )}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-brand/20 p-12 text-center font-mono text-xs text-muted-foreground">
      // {text}
    </div>
  );
}

function FleetView({ b, ctx }: { b: SectionBlock; ctx: PageContext }) {
  const fn = useServerFn(listPublicOrgFleet);
  const q = useQuery({
    queryKey: ["public-org-fleet", ctx.slug],
    queryFn: () => fn({ data: { slug: ctx.slug } }),
  });
  const ships = (q.data?.ships ?? []).slice(0, b.limit ?? 8);
  return (
    <div>
      <SectionHeader b={b} href={`/o/${ctx.slug}/flotte`} />
      {q.isLoading ? (
        <Empty text="lade…" />
      ) : ships.length === 0 ? (
        <Empty text="noch keine Schiffe registriert" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ships.map((s) => (
            <div
              key={s.slug}
              className="group relative flex flex-col border border-brand/10 bg-gradient-to-br from-background via-background to-black/40 transition-colors hover:border-brand/40"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
                {s.image ? (
                  <img
                    src={s.image}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90 transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
                    // no image
                  </div>
                )}
                {s.count > 1 && (
                  <div className="absolute right-2 top-2 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.2em] text-brand backdrop-blur">
                    ×{s.count}
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="font-display text-sm">{s.name}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
                  {s.manufacturer ?? ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CalendarView({ b, ctx }: { b: SectionBlock; ctx: PageContext }) {
  const fn = useServerFn(listPublicOrgMissions);
  const q = useQuery({
    queryKey: ["public-org-missions", ctx.slug],
    queryFn: () => fn({ data: { slug: ctx.slug } }),
  });
  const events = (q.data?.missions ?? []).filter((m) => m.starts_at).slice(0, b.limit ?? 5);
  return (
    <div>
      <SectionHeader b={b} href={`/o/${ctx.slug}/kalender`} />
      {q.isLoading ? (
        <Empty text="lade…" />
      ) : events.length === 0 ? (
        <Empty text="keine öffentlichen Einsätze" />
      ) : (
        <ul className="divide-y divide-brand/10 border border-brand/10">
          {events.map((ev) => {
            const color = ev.category?.color ?? "#888888";
            const d = new Date(ev.starts_at!);
            return (
              <li key={ev.id}>
                <Link
                  to="/ops/$slug"
                  params={{ slug: ev.slug }}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-brand/5"
                >
                  <div className="w-20 shrink-0 text-center">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {format(d, "EEE", { locale: de })}
                    </div>
                    <div className="font-display text-2xl leading-none">{format(d, "d")}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {format(d, "MMM yyyy", { locale: de })}
                    </div>
                  </div>
                  <div
                    className="h-10 w-1 shrink-0"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{ev.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      <span>{format(d, "HH:mm", { locale: de })}</span>
                      {ev.category && (
                        <>
                          <span>·</span>
                          <span style={{ color }}>{ev.category.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ShopView({ b, ctx }: { b: SectionBlock; ctx: PageContext }) {
  const fn = useServerFn(listPublicOrgShop);
  const q = useQuery({
    queryKey: ["public-org-shop", ctx.slug],
    queryFn: () => fn({ data: { slug: ctx.slug } }),
  });
  const groups = (q.data?.groups ?? []).slice(0, b.limit ?? 6);
  return (
    <div>
      <SectionHeader b={b} href={`/o/${ctx.slug}/shop`} />
      {q.isLoading ? (
        <Empty text="lade…" />
      ) : groups.length === 0 ? (
        <Empty text="aktuell keine Angebote" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div
              key={g.key}
              className="flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-4 transition-colors hover:border-brand/30"
            >
              <h3 className="text-sm font-semibold">{g.item_name}</h3>
              {g.category && (
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {g.category}
                </div>
              )}
              <div className="mt-3 flex items-end justify-between">
                <div className="text-xs text-muted-foreground">
                  {g.available_qty} {g.unit} verfügbar
                </div>
                <div className="text-sm font-semibold text-brand">
                  {g.min_unit_price === g.max_unit_price
                    ? g.min_unit_price.toLocaleString("de-DE")
                    : `${g.min_unit_price.toLocaleString("de-DE")}–${g.max_unit_price.toLocaleString("de-DE")}`}{" "}
                  <span className="text-[10px] text-muted-foreground">aUEC / {g.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
/* ------------------------- Neue Block-Ansichten ------------------------- */

function TimelineView({ b }: { b: TimelineBlock }) {
  return (
    <div>
      <Head tag={b.tag} title={b.title} />
      <Stagger ms={b.stagger} className="relative border-l border-brand/25 pl-6">
        {b.items.map((it, i) => (
          <div key={i} className="relative pb-8 last:pb-0">
            <span className="absolute -left-[27px] top-1.5 h-2.5 w-2.5 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" />
            {it.date && (
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
                {it.date}
              </div>
            )}
            <h3 className="mt-1 font-display text-xl tracking-tight">{it.title}</h3>
            {it.text && (
              <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{it.text}</p>
            )}
          </div>
        ))}
      </Stagger>
    </div>
  );
}

function LogosView({ b }: { b: LogosBlock }) {
  const logo = (it: LogosBlock["items"][number], i: number) => {
    const img = (
      <img
        src={it.url}
        alt={it.alt || ""}
        loading="lazy"
        className={cn(
          "h-10 w-auto object-contain opacity-70 transition hover:opacity-100",
          b.grayscale !== false && "grayscale hover:grayscale-0",
        )}
      />
    );
    return it.link ? (
      <a key={i} href={it.link} target="_blank" rel="noreferrer noopener" className="shrink-0">
        {img}
      </a>
    ) : (
      <div key={i} className="shrink-0">
        {img}
      </div>
    );
  };

  if (b.marquee) {
    return (
      <div>
        <Head title={b.title} />
        <div className="pb-marquee-mask overflow-hidden">
          <div className="pb-marquee flex w-max items-center gap-12">
            {b.items.map(logo)}
            {b.items.map((it, i) => logo(it, i + b.items.length))}
          </div>
        </div>
      </div>
    );
  }
  return (
    <div>
      <Head title={b.title} />
      <Stagger ms={b.stagger} className="flex flex-wrap items-center justify-center gap-10">
        {b.items.map(logo)}
      </Stagger>
    </div>
  );
}

function FaqView({ b }: { b: FaqBlock }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div>
      <Head tag={b.tag} title={b.title} />
      <Stagger ms={b.stagger} className="divide-y divide-white/10 border-y border-white/10">
        {b.items.map((it, i) => {
          const isOpen = open === i;
          return (
            <div key={i}>
              <button
                type="button"
                onClick={() => setOpen(isOpen ? null : i)}
                className="flex w-full items-center justify-between gap-4 py-4 text-left"
                aria-expanded={isOpen}
              >
                <span className="font-display text-lg tracking-tight">{it.q}</span>
                <ChevronDown
                  className={cn(
                    "h-4 w-4 shrink-0 text-brand transition-transform",
                    isOpen && "rotate-180",
                  )}
                />
              </button>
              {isOpen && (
                <p className="whitespace-pre-wrap pb-5 text-sm text-muted-foreground">{it.a}</p>
              )}
            </div>
          );
        })}
      </Stagger>
    </div>
  );
}

function CountdownView({ b }: { b: CountdownBlock }) {
  const target = b.target ? new Date(b.target).getTime() : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const diff = Math.max(0, target - now);
  const expired = !target || diff <= 0;
  const parts = [
    { v: Math.floor(diff / 86400000), l: "Tage" },
    { v: Math.floor(diff / 3600000) % 24, l: "Std" },
    { v: Math.floor(diff / 60000) % 60, l: "Min" },
    { v: Math.floor(diff / 1000) % 60, l: "Sek" },
  ];
  return (
    <div className="text-center">
      <Head tag={b.tag} title={b.title} subtitle={b.subtitle} />
      {expired ? (
        <p className="font-mono text-sm uppercase tracking-[0.3em] text-brand">
          {b.expiredText || "Es ist soweit"}
        </p>
      ) : (
        <div className="flex flex-wrap justify-center gap-4">
          {parts.map((p) => (
            <div
              key={p.l}
              className="min-w-24 border border-brand/25 bg-black/30 px-5 py-4 tabular-nums"
            >
              <div className="font-display text-4xl tracking-tight text-brand">
                {String(p.v).padStart(2, "0")}
              </div>
              <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
                {p.l}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Wandelt YouTube-/Vimeo-Links in eine einbettbare URL um. */
function embedUrl(raw?: string): string | null {
  const u = (raw ?? "").trim();
  if (!u) return null;
  const yt = u.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}`;
  const vi = u.match(/vimeo\.com\/(\d+)/);
  if (vi) return `https://player.vimeo.com/video/${vi[1]}`;
  return u;
}

function VideoView({ b }: { b: VideoBlock }) {
  const src = embedUrl(b.url);
  const aspect = b.aspect ?? "16/9";
  return (
    <div>
      <Head title={b.title} />
      <div
        className="w-full overflow-hidden border border-white/10 bg-black/40"
        style={{ aspectRatio: aspect.replace("/", " / ") }}
      >
        {src ? (
          <iframe
            src={src}
            title={b.title || "Video"}
            className="h-full w-full"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture"
            allowFullScreen
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-xs text-muted-foreground">
            // Video-URL fehlt
          </div>
        )}
      </div>
      {b.caption && <p className="mt-2 text-xs text-muted-foreground">{b.caption}</p>}
    </div>
  );
}

function BentoView({ b }: { b: BentoBlock }) {
  return (
    <div>
      <Head tag={b.tag} title={b.title} />
      <Stagger ms={b.stagger} className="grid auto-rows-[180px] grid-cols-2 gap-4 md:grid-cols-4">
        {b.items.map((it, i) => {
          const inner = (
            <>
              {it.imageUrl && (
                <img
                  src={it.imageUrl}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover opacity-40 transition group-hover:opacity-60"
                />
              )}
              <div className="relative mt-auto">
                <h3 className="font-display text-xl tracking-tight">{it.title}</h3>
                {it.text && <p className="mt-1 text-sm text-muted-foreground">{it.text}</p>}
              </div>
            </>
          );
          const cls = cn(
            "group relative flex flex-col overflow-hidden border border-white/10 bg-black/30 p-5",
            HOVER_CLASS[b.hoverFx ?? "none"],
            it.size === "lg" ? "col-span-2 row-span-2" : "col-span-2 md:col-span-1",
          );
          return it.link ? (
            <a key={i} href={it.link} className={cls}>
              {inner}
            </a>
          ) : (
            <div key={i} className={cls}>
              {inner}
            </div>
          );
        })}
      </Stagger>
    </div>
  );
}

function TeamView({ b }: { b: TeamBlock }) {
  const cols =
    b.columns === 2
      ? "sm:grid-cols-2"
      : b.columns === 4
        ? "sm:grid-cols-2 lg:grid-cols-4"
        : "sm:grid-cols-3";
  return (
    <div>
      <Head tag={b.tag} title={b.title} />
      <Stagger ms={b.stagger} className={cn("grid gap-6", cols)}>
        {b.items.map((it, i) => {
          const inner = (
            <>
              <div className="aspect-square w-full overflow-hidden border border-white/10 bg-black/40">
                {it.imageUrl ? (
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-3xl text-brand/50">
                    {it.name.slice(0, 1)}
                  </div>
                )}
              </div>
              <div className="mt-3">
                <div className="font-display text-lg tracking-tight">{it.name}</div>
                {it.role && (
                  <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
                    {it.role}
                  </div>
                )}
              </div>
            </>
          );
          const cls = cn("block", HOVER_CLASS[b.hoverFx ?? "none"]);
          return it.link ? (
            <a key={i} href={it.link} className={cls} target="_blank" rel="noreferrer noopener">
              {inner}
            </a>
          ) : (
            <div key={i} className={cls}>
              {inner}
            </div>
          );
        })}
      </Stagger>
    </div>
  );
}

function PricingView({ b }: { b: PricingBlock }) {
  return (
    <div>
      <Head tag={b.tag} title={b.title} />
      <Stagger ms={b.stagger} className="grid gap-6 md:grid-cols-3">
        {b.items.map((it, i) => (
          <div
            key={i}
            className={cn(
              "flex flex-col border bg-black/30 p-6",
              HOVER_CLASS[b.hoverFx ?? "none"],
              it.featured
                ? "border-brand/60 shadow-[0_0_30px_-12px_var(--brand)]"
                : "border-white/10",
            )}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              {it.name}
            </div>
            <div className="mt-3 flex items-end gap-1">
              <span className="font-display text-4xl tracking-tight">{it.price}</span>
              {it.period && <span className="pb-1 text-xs text-muted-foreground">{it.period}</span>}
            </div>
            {it.features && (
              <ul className="mt-5 flex-1 space-y-2 text-sm text-muted-foreground">
                {it.features
                  .split("\n")
                  .map((f) => f.trim())
                  .filter(Boolean)
                  .map((f, k) => (
                    <li key={k} className="flex gap-2">
                      <span className="text-brand">›</span>
                      {f}
                    </li>
                  ))}
              </ul>
            )}
            <div className="mt-6">
              <LinkButton label={it.buttonLabel} href={it.buttonUrl} />
            </div>
          </div>
        ))}
      </Stagger>
    </div>
  );
}

function ShapeView({ b }: { b: ShapeBlock }) {
  const h = b.height ?? 90;
  if (b.style === "gradient") {
    return (
      <div
        style={{ height: h }}
        className={cn(
          "w-full",
          b.flip
            ? "bg-[linear-gradient(to_top,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]"
            : "bg-[linear-gradient(to_bottom,color-mix(in_oklab,var(--brand)_18%,transparent),transparent)]",
        )}
      />
    );
  }
  const path =
    b.style === "slant"
      ? "M0,100 L1440,0 L1440,100 Z"
      : b.style === "curve"
        ? "M0,100 Q720,-20 1440,100 Z"
        : "M0,60 C240,110 480,10 720,50 C960,90 1200,20 1440,60 L1440,100 L0,100 Z";
  return (
    <svg
      viewBox="0 0 1440 100"
      preserveAspectRatio="none"
      style={{ height: h }}
      className={cn("w-full text-brand/15", b.flip && "rotate-180")}
      aria-hidden
    >
      <path d={path} fill="currentColor" />
    </svg>
  );
}

function BannerView({ b, ctx }: { b: BannerBlock; ctx: PageContext }) {
  const height = b.height === "sm" ? "min-h-48" : b.height === "lg" ? "min-h-[28rem]" : "min-h-72";
  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center overflow-hidden border border-white/10 px-6 py-14 text-center",
        height,
      )}
    >
      {b.imageUrl && (
        <>
          <img
            src={b.imageUrl}
            alt=""
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            className="absolute inset-0 bg-background"
            style={{ opacity: (b.overlay ?? 55) / 100 }}
          />
        </>
      )}
      {b.logoWatermark && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <img
            src={ctx.logoUrl}
            alt=""
            aria-hidden
            className="h-[150%] max-w-none object-contain"
            style={{ opacity: (b.logoOpacity ?? 12) / 100 }}
          />
        </div>
      )}
      <div className="relative">
        <EdTag value={b.tag} />
        <Ed
          field="title"
          value={b.title}
          as="h2"
          className="font-display text-3xl tracking-tight md:text-5xl"
          placeholder="Titel"
        />
        <Ed
          field="subtitle"
          value={b.subtitle}
          as="p"
          className="mx-auto mt-3 block max-w-2xl text-sm text-muted-foreground"
          placeholder="Untertitel"
        />
        {b.buttonLabel && (
          <div className="mt-6 flex justify-center">
            <LinkButton label={b.buttonLabel} href={b.buttonUrl} />
          </div>
        )}
      </div>
    </div>
  );
}
