import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  listMyOrgs,
  updateOrgBranding,
  uploadOrgLogo,
  uploadOrgImage,
  type OrgBranding,
} from "@/lib/orgs.functions";
import {
  BLOCK_META,
  HOVER_FX,
  BLOCK_TYPES,
  ANIMATIONS,
  ALIGNMENTS,
  BACKGROUNDS,
  GRID_SIZE,
  MAX_BLOCKS,
  PADDING_PX,
  PADDINGS,
  PAD_SNAPS,
  snapSpacing,
  WIDTHS,
  createBlock,
  migrateBrandingToPage,
  newBlockId,
  listAt,
  mapListAt,
  findPath,
  findBlock,
  blockTrail,
  patchById,
  removeById,
  cloneBlock,
  countBlocks,
  depthOf,
  flattenBlocks,
  MAX_DEPTH,
  MAX_COLUMNS,
  type BlockPath,
  type BlockType,
  type OrgPage,
  type PageBlock,
} from "@/lib/page-blocks";
import { BlockList } from "@/components/page-builder/BlockRenderer";
import { ElementLibrary } from "@/components/page-builder/ElementLibrary";
import { TemplateGallery } from "@/components/page-builder/TemplateGallery";
import { ImageField } from "@/components/page-builder/ImageField";
import { useCanvasDnd } from "@/components/page-builder/useCanvasDnd";
import { useBranding } from "@/components/branding/BrandingProvider";
import { hasPerm } from "@/lib/org-perms";
import { cn } from "@/lib/utils";
import { PageHint } from "@/components/orga/PageHint";
import { OrgPreviewNav, OrgPreviewFooter } from "@/components/orga/OrgPreviewChrome";
import { resolveBranding } from "@/lib/org-branding";
import { brandVars } from "@/lib/brand-vars";
import logoAsset from "@/assets/idcp-logo.png.asset.json";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowDown,
  ArrowUp,
  AlignCenter,
  AlignLeft,
  AlignRight,
  ChevronDown,
  Copy,
  Eye,
  EyeOff,
  ExternalLink,
  Grid3x3,
  GripVertical,
  Laptop,
  LayoutGrid,
  LayoutTemplate,
  ListTree,
  Magnet,
  Monitor,
  Pencil,
  Plus,
  Redo2,
  Ruler,
  Smartphone,
  Trash2,
  Undo2,
  X,
} from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { OrgPermGate } from "./orga";

export const Route = createFileRoute("/_authenticated/orga/seite")({
  head: () => ({ meta: [{ title: "Landingpage gestalten – Orga" }] }),
  component: () => (
    <OrgPermGate perm="branding.manage">
      <OrgLandingEditor />
    </OrgPermGate>
  ),
});

type Global = {
  primary: string;
  accent: string;
  discord_url: string;
  rsi_url: string;
  website_url: string;
  footer_note: string;
};

const DEVICES = {
  desktop: { label: "Desktop", width: "100%", icon: Monitor },
  tablet: { label: "Tablet", width: "820px", icon: Laptop },
  mobile: { label: "Mobil", width: "390px", icon: Smartphone },
} as const;
type Device = keyof typeof DEVICES;

/** Inhaltsbreiten der Blöcke – Basis für die Ausrichtungs-Hilfslinien. */
const WIDTH_PX: Record<string, number | null> = {
  narrow: 768,
  normal: 1152,
  wide: 1280,
  full: null,
};

function OrgLandingEditor() {
  const listFn = useServerFn(listMyOrgs);
  const saveFn = useServerFn(updateOrgBranding);
  const uploadFn = useServerFn(uploadOrgLogo);
  const uploadImageFn = useServerFn(uploadOrgImage);
  const qc = useQueryClient();
  const { org: activeOrg } = useBranding();
  const { data } = useQuery({ queryKey: ["my-orgs"], queryFn: () => listFn() });
  const orgs = useMemo(() => data?.orgs ?? [], [data?.orgs]);
  const org = orgs.find((o) => o.id === activeOrg?.id) ?? orgs[0] ?? null;
  const allowed = org
    ? hasPerm(org.my_role, org.my_permissions, "branding.manage") || org.my_role === "officer"
    : false;

  const [page, setPageState] = useState<OrgPage | null>(null);
  const [global, setGlobal] = useState<Global | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<Device>("desktop");
  const [editorOpen, setEditorOpen] = useState(false);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [leftTab, setLeftTab] = useState<"elements" | "structure">("elements");
  const [showGrid, setShowGrid] = useState(true);
  const [showGuides, setShowGuides] = useState(true);
  const [snapping, setSnapping] = useState(true);
  const [pro, setPro] = useState(false);
  const [pendingInsert, setPendingInsert] = useState<{
    parent: BlockPath;
    index: number;
  } | null>(null);
  const [dirty, setDirty] = useState(false);
  const past = useRef<OrgPage[]>([]);
  const future = useRef<OrgPage[]>([]);
  const [, force] = useState(0);

  useEffect(() => {
    setPro(localStorage.getItem("pb-pro-mode") === "1");
  }, []);
  useEffect(() => {
    if (!org) return;
    const b = org.branding ?? {};
    setPageState(b.page ?? migrateBrandingToPage(b, { name: org.name }));
    setGlobal({
      primary: b.primary ?? "#FFBF00",
      accent: b.accent ?? "#3b82f6",
      discord_url: b.discord_url ?? "",
      rsi_url: b.rsi_url ?? "",
      website_url: b.website_url ?? "",
      footer_note: b.footer_note ?? "",
    });
    past.current = [];
    future.current = [];
    setDirty(false);
    setSelected(null);
  }, [org?.id]);

  const setPage = useCallback((updater: (p: OrgPage) => OrgPage) => {
    setPageState((prev) => {
      if (!prev) return prev;
      past.current = [...past.current.slice(-49), prev];
      future.current = [];
      setDirty(true);
      return updater(prev);
    });
    force((n) => n + 1);
  }, []);

  const undo = () => {
    const prev = past.current.pop();
    if (!prev || !page) return;
    future.current.push(page);
    setPageState(prev);
    setDirty(true);
    force((n) => n + 1);
  };
  const redo = () => {
    const next = future.current.pop();
    if (!next || !page) return;
    past.current.push(page);
    setPageState(next);
    setDirty(true);
    force((n) => n + 1);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!org || !page || !global) return;
      const legacy = org.branding ?? {};
      const branding: OrgBranding = {
        ...legacy,
        primary: global.primary,
        accent: global.accent,
        discord_url: global.discord_url,
        rsi_url: global.rsi_url,
        website_url: global.website_url,
        footer_note: global.footer_note,
        page,
        show_fleet: flattenBlocks(page.blocks).some((b) => b.type === "fleet" && !b.hidden),
        show_calendar: flattenBlocks(page.blocks).some((b) => b.type === "calendar" && !b.hidden),
        show_shop: flattenBlocks(page.blocks).some((b) => b.type === "shop" && !b.hidden),
      };
      delete (branding as Record<string, unknown>).logo_url_unused;
      return saveFn({ data: { org_id: org.id, branding } });
    },
    onSuccess: () => {
      toast.success("Landingpage gespeichert.");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!org) return;
      const buf = await file.arrayBuffer();
      let bin = "";
      const arr = new Uint8Array(buf);
      for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
      return uploadFn({
        data: {
          org_id: org.id,
          filename: file.name,
          content_type: file.type || "image/png",
          data_base64: btoa(bin),
        },
      });
    },
    onSuccess: () => {
      toast.success("Logo aktualisiert.");
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  /* --------------------------- Drag & Drop (Canvas) -------------------------- */
  /** Bild-Upload für Blockinhalte – liefert die öffentliche URL zurück. */
  const uploadImage = useCallback(
    async (file: File) => {
      if (!org) throw new Error("Keine Orga.");
      const buf = await file.arrayBuffer();
      const arr = new Uint8Array(buf);
      let bin = "";
      for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
      try {
        const res = await uploadImageFn({
          data: {
            org_id: org.id,
            filename: file.name,
            content_type: file.type || "image/png",
            data_base64: btoa(bin),
          },
        });
        return res.url;
      } catch (e) {
        toast.error((e as Error).message);
        throw e;
      }
    },
    [org?.id, uploadImageFn],
  );

  /** Element an beliebiger Stelle im Baum einfügen (auch in Container-Spalten). */
  const insertAt = useCallback(
    (
      type: BlockType,
      target: { parent: BlockPath; index: number },
      columns?: number,
      widths?: number[],
    ) => {
      const block = createBlock(type, { columns, widths });
      // In Spalten passen kompakte Abstände und volle Breite besser.
      const nested =
        target.parent.length > 0
          ? ({ ...block, padding: "sm", width: "full" } as PageBlock)
          : block;
      setPage((p) => {
        if (countBlocks(p.blocks) >= MAX_BLOCKS) {
          toast.error(`Maximal ${MAX_BLOCKS} Blöcke.`);
          return p;
        }
        if (type === "container" && depthOf(target.parent) >= MAX_DEPTH) {
          toast.error(`Verschachtelung zu tief (Grenze: ${MAX_DEPTH} Ebenen).`);
          return p;
        }
        return {
          ...p,
          blocks: mapListAt(p.blocks, target.parent, (list) => {
            const i = Math.max(0, Math.min(target.index, list.length));
            return [...list.slice(0, i), nested, ...list.slice(i)];
          }),
        };
      });
      setSelected(nested.id);
      setPendingInsert(null);
    },
    [setPage],
  );

  /** Block per Pfad an eine andere Stelle im Baum verschieben. */
  const moveTo = useCallback(
    (from: BlockPath, to: { parent: BlockPath; index: number }) => {
      setPage((p) => {
        const src = from.slice(0, -1);
        const srcIndex = from[from.length - 1];
        const moving = listAt(p.blocks, src)[srcIndex];
        if (!moving) return p;
        // Container nicht in sich selbst ablegen.
        if (to.parent.length >= from.length && from.every((v, i) => v === to.parent[i])) return p;
        const sameList = src.length === to.parent.length && src.every((v, i) => v === to.parent[i]);
        if (sameList) {
          return {
            ...p,
            blocks: mapListAt(p.blocks, src, (list) => {
              const next = [...list];
              next.splice(srcIndex, 1);
              const at = to.index > srcIndex ? to.index - 1 : to.index;
              next.splice(Math.max(0, Math.min(at, next.length)), 0, moving);
              return next;
            }),
          };
        }
        const removed = mapListAt(p.blocks, src, (list) => list.filter((_, i) => i !== srcIndex));
        return {
          ...p,
          blocks: mapListAt(removed, to.parent, (list) => {
            const i = Math.max(0, Math.min(to.index, list.length));
            return [...list.slice(0, i), moving, ...list.slice(i)];
          }),
        };
      });
    },
    [setPage],
  );

  const dnd = useCanvasDnd({
    onMove: moveTo,
    onInsert: (type, to, columns, widths) => insertAt(type as BlockType, to, columns, widths),
    canDrop: (payload, to) =>
      !(
        payload.kind === "new" &&
        payload.blockType === "container" &&
        depthOf(to.parent) >= MAX_DEPTH
      ),
  });

  if (!org) {
    return (
      <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
        Keine Orga ausgewählt.
      </div>
    );
  }
  if (!allowed) {
    return (
      <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
        Dir fehlt die Berechtigung „Landingpage &amp; Branding gestalten“.
      </div>
    );
  }
  if (!page || !global) return null;

  /** Fügt ein Element ein – an der vorgemerkten Stelle, sonst hinter der Auswahl. */
  const addBlock = (type: BlockType, columns?: number, widths?: number[]) => {
    let target = pendingInsert;
    if (!target) {
      const p = selected ? findPath(page.blocks, selected) : null;
      target = p
        ? { parent: p.slice(0, -1), index: p[p.length - 1] + 1 }
        : { parent: [], index: page.blocks.length };
    }
    insertAt(type, target, columns, widths);
  };

  const patchBlock = (id: string, patch: Record<string, unknown>) =>
    setPage((p) => ({ ...p, blocks: patchById(p.blocks, id, patch) }));

  const removeBlock = (id: string) => {
    setPage((p) => ({ ...p, blocks: removeById(p.blocks, id) }));
    setSelected((s) => (s === id ? null : s));
  };

  const duplicateBlock = (id: string) =>
    setPage((p) => {
      const path = findPath(p.blocks, id);
      if (!path) return p;
      const parent = path.slice(0, -1);
      const i = path[path.length - 1];
      return {
        ...p,
        blocks: mapListAt(p.blocks, parent, (list) => [
          ...list.slice(0, i + 1),
          cloneBlock(list[i]),
          ...list.slice(i + 1),
        ]),
      };
    });

  /** Block innerhalb seiner Liste um eine Position verschieben. */
  const moveById = (id: string, dir: -1 | 1) => {
    const path = findPath(page.blocks, id);
    if (!path) return;
    const i = path[path.length - 1];
    moveTo(path, { parent: path.slice(0, -1), index: dir === -1 ? i - 1 : i + 2 });
  };

  const moveBlock = (from: number, to: number) =>
    setPage((p) => {
      if (to < 0 || to >= p.blocks.length) return p;
      const blocks = [...p.blocks];
      const [b] = blocks.splice(from, 1);
      blocks.splice(to, 0, b);
      return { ...p, blocks };
    });

  const applyTemplate = (
    tpl: OrgPage,
    colors: { primary: string; accent: string } | null,
  ) => {
    setPage(() => tpl);
    setSelected(tpl.blocks[0]?.id ?? null);
    if (colors) {
      setGlobal((g) => (g ? { ...g, primary: colors.primary, accent: colors.accent } : g));
      setDirty(true);
    }
    toast.success("Template übernommen", {
      description: "Blöcke, Layout-Einstellungen und Logo-Positionen wurden angewendet.",
    });
  };

  const current = selected ? findBlock(page.blocks, selected) : null;
  const selectedPath = selected ? findPath(page.blocks, selected) : null;
  const trail = selectedPath ? blockTrail(page.blocks, selectedPath) : [];

  /* ------------------------------ Preview mode ----------------------------- */
  const previewBranding = resolveBranding(
    {
      ...(org.branding ?? {}),
      primary: global.primary,
      accent: global.accent,
      discord_url: global.discord_url,
      rsi_url: global.rsi_url,
      website_url: global.website_url,
      footer_note: global.footer_note,
      show_fleet: flattenBlocks(page.blocks).some((b) => b.type === "fleet" && !b.hidden),
      show_calendar: flattenBlocks(page.blocks).some((b) => b.type === "calendar" && !b.hidden),
      show_shop: flattenBlocks(page.blocks).some((b) => b.type === "shop" && !b.hidden),
    },
    { name: org.name },
  );
  const canvas = (
    <div
      className="mx-auto bg-background text-foreground"
      style={{
        width: DEVICES[device].width,
        maxWidth: "100%",
        ...brandVars(global.primary, global.accent),
      }}
      onClick={() => setSelected(null)}
    >
      {!editorOpen && (
        <OrgPreviewNav
          org={{ name: org.name, tag: org.tag ?? null, slug: org.slug }}
          b={previewBranding}
          logoSrc={previewBranding.logoUrl || logoAsset.url}
        />
      )}
      <div className={page.effects?.starfield ? "star-bg" : undefined}>
        <BlockList
          blocks={page.blocks}
          editing={editorOpen}
          selectedId={selected}
          onSelect={setSelected}
          dnd={
            editorOpen
              ? {
                  setItemRef: dnd.setItemRef,
                  setZoneRef: dnd.setZoneRef,
                  begin: dnd.begin,
                  drop: dnd.drop,
                  activePath: dnd.drag?.kind === "move" ? dnd.drag.path : null,
                }
              : undefined
          }
          ctx={{
            slug: org.slug,
            name: org.name,
            logoUrl: org.branding?.logo_url || logoAsset.url,
            memberCount: org.member_count,
          }}
          actions={
            editorOpen
              ? {
                  onMove: moveById,
                  onDuplicate: duplicateBlock,
                  onToggleHidden: (id) => {
                    const b = findBlock(page.blocks, id);
                    if (b) patchBlock(id, { hidden: !b.hidden });
                  },
                  onDelete: removeBlock,
                  onInsertAt: (parent, index) => {
                    setPendingInsert({ parent, index });
                    setLeftTab("elements");
                  },
                  onColumns: (id, columns) => patchBlock(id, { columns }),
                }
              : undefined
          }
          onPatch={editorOpen ? patchBlock : undefined}
        />
        {editorOpen && page.blocks.length === 0 && (
          <div className="mx-auto max-w-2xl px-6 py-20 text-center">
            <h3 className="font-display text-2xl">Mit einer Vorlage starten</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Fertige Designs, abgestimmt auf eure Farben und euer Logo. Oder links ein Element
              auswählen und ins Canvas ziehen.
            </p>
            <Button
              className="mt-6"
              onClick={(e) => {
                e.stopPropagation();
                setGalleryOpen(true);
              }}
            >
              <LayoutTemplate className="h-4 w-4" /> Vorlagen ansehen
            </Button>
          </div>
        )}
      </div>
      {!editorOpen && <OrgPreviewFooter org={{ name: org.name }} b={previewBranding} />}
    </div>
  );

  const guideWidth = WIDTH_PX[current?.width ?? "normal"];

  if (!editorOpen) {
    return (
      <div className="space-y-4" style={{ ["--brand" as string]: global.primary }}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs font-medium text-brand/80">Landingpage</div>
            <h2 className="font-display text-2xl">{org.name}</h2>
            <p className="text-sm text-muted-foreground">
              So sieht eure öffentliche Seite aus. Zum Bearbeiten den Editor öffnen.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {dirty && (
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                ungespeichert
              </span>
            )}
            <Button asChild variant="outline" size="sm">
              <a href={`/o/${org.slug}`} target="_blank" rel="noreferrer">
                <ExternalLink className="mr-2 h-3.5 w-3.5" /> Seite ansehen
              </a>
            </Button>
            <Button size="sm" onClick={() => setEditorOpen(true)}>
              <Pencil className="mr-2 h-3.5 w-3.5" /> Mit Editor bearbeiten
            </Button>
          </div>
        </div>

        <PageHint>
          So sieht die öffentliche Landingpage für Besucher aus. Öffne den
          Editor, um Blöcke, Farben, Texte und Bilder anzupassen – oder wähle
          eine Vorlage als Ausgangspunkt.
        </PageHint>

        <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
          <div className="border-b border-white/10 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Vorschau · /o/{org.slug}
          </div>
          <div className="max-h-[75vh] overflow-auto">{canvas}</div>
        </div>
      </div>
    );
  }

  /* ------------------------------ Editor mode ------------------------------ */
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-background"
      style={{ ["--brand" as string]: global.primary }}
    >
      {/* Topbar */}
      <header className="flex h-12 shrink-0 items-center gap-2 border-b border-white/10 bg-black/40 px-3">
        <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
          <X className="mr-2 h-4 w-4" /> Schließen
        </Button>
        <div className="min-w-0 flex-1 truncate font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {org.name} · Landingpage-Editor
          {dirty && <span className="ml-2 text-brand">• ungespeichert</span>}
        </div>
        <div className="hidden gap-1 sm:flex">
          {(Object.keys(DEVICES) as Device[]).map((d) => {
            const Icon = DEVICES[d].icon;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDevice(d)}
                title={DEVICES[d].label}
                className={cn(
                  "rounded p-1.5",
                  device === d
                    ? "bg-brand/15 text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}
        </div>
        <div className="mx-1 hidden gap-1 border-l border-white/10 pl-2 sm:flex">
          <button
            type="button"
            title="Profi-Modus: Feineinstellungen einblenden"
            onClick={() => {
              const next = !pro;
              setPro(next);
              localStorage.setItem("pb-pro-mode", next ? "1" : "0");
            }}
            className={cn(
              "rounded px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em]",
              pro ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Profi
          </button>
          {(
            [
              [showGrid, setShowGrid, Grid3x3, "Raster einblenden"],
              [showGuides, setShowGuides, Ruler, "Hilfslinien"],
              [snapping, setSnapping, Magnet, "Snapping (8px-Raster)"],
            ] as const
          ).map(([on, set, Icon, title], i) => (
            <button
              key={i}
              type="button"
              title={title}
              onClick={() => (set as (v: boolean) => void)(!on)}
              className={cn(
                "rounded p-1.5",
                on ? "bg-brand/15 text-brand" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={undo}
          disabled={past.current.length === 0}
          title="Rückgängig"
        >
          <Undo2 className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={redo}
          disabled={future.current.length === 0}
          title="Wiederholen"
        >
          <Redo2 className="h-4 w-4" />
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href={`/o/${org.slug}`} target="_blank" rel="noreferrer">
            <ExternalLink className="mr-2 h-3.5 w-3.5" /> Ansehen
          </a>
        </Button>
        <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending}>
          {save.isPending ? "Speichert…" : "Speichern"}
        </Button>
      </header>

      {dnd.drag && dnd.pointer && (
        <div
          className="pointer-events-none fixed z-[100] -translate-y-1/2 translate-x-3 rounded border border-brand/60 bg-background/90 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-brand shadow-lg backdrop-blur"
          style={{ left: dnd.pointer.x, top: dnd.pointer.y }}
        >
          {dnd.drag.label}
        </div>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ------------------------------ Left toolbar ----------------------------- */}
        <aside className="flex w-[280px] shrink-0 flex-col border-r border-white/10 bg-black/30">
          <div className="flex shrink-0 border-b border-white/10">
            {(
              [
                ["elements", "Elemente", LayoutGrid],
                ["structure", "Aufbau", ListTree],
              ] as const
            ).map(([key, label, Icon]) => (
              <button
                key={key}
                type="button"
                onClick={() => setLeftTab(key)}
                className={cn(
                  "flex flex-1 items-center justify-center gap-2 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em]",
                  leftTab === key
                    ? "border-b-2 border-brand text-brand"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" /> {label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {leftTab === "elements" ? (
              <>
                {pendingInsert !== null && (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded border border-brand/40 bg-brand/10 px-2 py-1.5 text-[11px] text-brand">
                    <span>
                      Element wird {pendingInsert.parent.length > 0 ? "in der Spalte " : ""}an
                      Position {pendingInsert.index + 1} eingefügt
                    </span>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={() => setPendingInsert(null)}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                )}
                <ElementLibrary
                  onAdd={addBlock}
                  onDragStart={(e, t, columns, widths) =>
                    dnd.begin(e, {
                      kind: "new",
                      blockType: t,
                      columns,
                      widths,
                      label: BLOCK_META[t].label,
                    })
                  }
                />
                <div className="mt-4 space-y-1.5">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    Vorlage laden
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full"
                    onClick={() => setGalleryOpen(true)}
                  >
                    <LayoutTemplate className="h-3.5 w-3.5" /> Vorlagen-Galerie
                  </Button>
                </div>
              </>
            ) : (
              <>
                <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  Aufbau ({page.blocks.length})
                </div>
                <ul className="space-y-1">
                  {page.blocks.map((b, i) => (
                    <li
                      key={b.id}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(i))}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        const from = Number(e.dataTransfer.getData("text/plain"));
                        if (!Number.isNaN(from) && from !== i) moveBlock(from, i);
                      }}
                      onClick={() => setSelected(b.id)}
                      className={cn(
                        "group flex cursor-pointer items-center gap-1 rounded border px-2 py-1.5 text-xs",
                        selected === b.id
                          ? "border-brand/60 bg-brand/10 text-brand"
                          : "border-white/10 hover:border-white/25",
                        b.hidden && "opacity-50",
                      )}
                    >
                      <GripVertical className="h-3 w-3 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{BLOCK_META[b.type].label}</span>
                      <button
                        type="button"
                        title={b.hidden ? "Einblenden" : "Ausblenden"}
                        onClick={(e) => {
                          e.stopPropagation();
                          patchBlock(b.id, { hidden: !b.hidden });
                        }}
                      >
                        {b.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </button>
                      <button
                        type="button"
                        title="Nach oben"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBlock(i, i - 1);
                        }}
                      >
                        <ArrowUp className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Nach unten"
                        onClick={(e) => {
                          e.stopPropagation();
                          moveBlock(i, i + 1);
                        }}
                      >
                        <ArrowDown className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Duplizieren"
                        onClick={(e) => {
                          e.stopPropagation();
                          duplicateBlock(b.id);
                        }}
                      >
                        <Copy className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        title="Löschen"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeBlock(b.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </li>
                  ))}
                  {page.blocks.length === 0 && (
                    <li className="p-4 text-center text-xs text-muted-foreground">
                      Noch keine Blöcke — unter „Elemente“ hinzufügen.
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        </aside>

        {/* ------------------------------- Canvas -------------------------------- */}
        <main
          ref={(el) => {
            dnd.scrollerRef.current = el;
          }}
          className="relative min-w-0 flex-1 overflow-auto bg-black/50 p-4"
        >
          {/* Ebenen-Navigation durch verschachtelte Container */}
          <nav
            aria-label="Ebenen"
            className="sticky top-0 z-30 -mx-4 -mt-4 mb-3 flex flex-wrap items-center gap-1 border-b border-white/10 bg-black/70 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.15em] backdrop-blur"
          >
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={cn(
                "rounded px-1.5 py-0.5 transition-colors hover:text-brand",
                trail.length === 0 ? "text-brand" : "text-muted-foreground",
              )}
            >
              Seite
            </button>
            {trail.map((t, i) => (
              <span key={`${t.id}-${i}`} className="flex items-center gap-1">
                <span className="text-muted-foreground/50">/</span>
                <button
                  type="button"
                  onClick={() => setSelected(t.id)}
                  className={cn(
                    "rounded px-1.5 py-0.5 transition-colors hover:text-brand",
                    t.id === selected ? "text-brand" : "text-muted-foreground",
                  )}
                >
                  {BLOCK_META[t.type].label}
                  {t.column !== undefined ? ` · Sp. ${t.column + 1}` : ""}
                </button>
              </span>
            ))}
          </nav>
          <div className="relative">
            {canvas}
            {/* Raster + Ausrichtungs-Hilfslinien */}
            <div className="pointer-events-none absolute inset-0 z-20">
              {showGrid && (
                <div
                  className="absolute inset-0"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, color-mix(in oklab, var(--brand) 12%, transparent) 0 1px, transparent 1px 100%)",
                    backgroundSize: `100% ${GRID_SIZE * 4}px`,
                  }}
                />
              )}
              {showGuides && (
                <div className="absolute inset-0 flex justify-center">
                  <div
                    className="relative h-full w-full border-x border-dashed border-brand/40"
                    style={{ maxWidth: guideWidth ? `${guideWidth}px` : "100%" }}
                  >
                    <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-brand/25" />
                    <div className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand">
                      {current ? BLOCK_META[current.type].label : "Inhaltsbreite"}
                      {guideWidth ? ` · ${guideWidth}px` : " · voll"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {/* ------------------------------ Inspector ----------------------------- */}
        <aside className="w-[320px] shrink-0 overflow-y-auto border-l border-white/10 bg-black/30 p-3">
          {current ? (
            <BlockInspector
              key={current.id}
              block={current}
              snap={snapping}
              pro={pro}
              onUpload={uploadImage}
              onChange={(patch) => patchBlock(current.id, patch)}
            />
          ) : (
            <GlobalInspector
              page={page}
              global={global}
              onGlobal={(patch) => {
                setGlobal((g) => (g ? { ...g, ...patch } : g));
                setDirty(true);
              }}
              onEffects={(patch) =>
                setPage((p) => ({ ...p, effects: { ...(p.effects ?? {}), ...patch } }))
              }
              onLogo={(f) => upload.mutate(f)}
            />
          )}
        </aside>
      </div>
      <TemplateGallery
        open={galleryOpen}
        onOpenChange={setGalleryOpen}
        orgName={org.name}
        logoUrl={org.branding?.logo_url || logoAsset.url}
        currentColors={{ primary: global.primary, accent: global.accent }}
        onApply={applyTemplate}
      />
    </div>
  );
}

/* ------------------------------- Inspector ------------------------------- */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

/** Einklappbarer Bereich für Feineinstellungen. */
function Advanced({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded border border-white/10">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-2 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-brand"
      >
        Erweitert
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="space-y-3 border-t border-white/10 p-2">{children}</div>}
    </div>
  );
}

function Choice({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o} value={o} className="text-xs">
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

type Patch = Record<string, unknown>;

/**
 * Spacing-Regler, der auf das 8px-Raster rastet und magnetisch auf die
 * Preset-Stops (32/56/80/112 …) einschnappt – wie in WordPress-Buildern.
 */
function SpacingSnap({
  label,
  value,
  snap,
  isCustom,
  onChange,
  onReset,
}: {
  label: string;
  value: number;
  snap: boolean;
  isCustom: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const atSnap = PAD_SNAPS.includes(value as (typeof PAD_SNAPS)[number]);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs">{label}</Label>
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-mono text-[10px]",
              atSnap && snap ? "text-brand" : "text-muted-foreground",
            )}
          >
            {value}px
          </span>
          {isCustom && (
            <button
              type="button"
              className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-brand"
              onClick={onReset}
            >
              Reset
            </button>
          )}
        </div>
      </div>
      <Slider
        value={[value]}
        min={0}
        max={240}
        step={snap ? GRID_SIZE : 1}
        onValueChange={([v]) => onChange(snap ? snapSpacing(v) : Math.round(v))}
      />
      <div className="flex flex-wrap gap-1">
        {PAD_SNAPS.filter((s) => s <= 240).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(s)}
            className={cn(
              "rounded border px-1.5 py-0.5 font-mono text-[10px]",
              value === s
                ? "border-brand/60 bg-brand/10 text-brand"
                : "border-white/10 text-muted-foreground hover:border-white/25",
            )}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

function BlockInspector({
  block,
  onChange,
  snap = true,
  pro = false,
  onUpload,
}: {
  block: PageBlock;
  onChange: (patch: Patch) => void;
  snap?: boolean;
  /** Profi-Modus blendet Feineinstellungen ein. */
  pro?: boolean;
  onUpload?: (file: File) => Promise<string>;
}) {
  const b = block as PageBlock & Record<string, any>;
  return (
    <Tabs defaultValue="content">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
        {BLOCK_META[block.type].label}
      </div>
      <TabsList className={cn("grid w-full", pro ? "grid-cols-3" : "grid-cols-2")}>
        <TabsTrigger value="content" className="text-xs">
          Inhalt
        </TabsTrigger>
        <TabsTrigger value="style" className="text-xs">
          Stil
        </TabsTrigger>
        {pro && (
          <TabsTrigger value="anim" className="text-xs">
            Animation
          </TabsTrigger>
        )}
      </TabsList>

      <TabsContent value="content" className="mt-3 space-y-3">
        <ContentFields block={b} onChange={onChange} onUpload={onUpload} />
      </TabsContent>

      <TabsContent value="style" className="mt-3 space-y-3">
        <Field label="Hintergrund">
          <Choice
            value={b.bg ?? "none"}
            onChange={(v) => onChange({ bg: v })}
            options={BACKGROUNDS}
          />
        </Field>
        <Field label="Innenabstand (Preset)">
          <Choice
            value={b.padding ?? "lg"}
            onChange={(v) => onChange({ padding: v, padTop: undefined, padBottom: undefined })}
            options={PADDINGS}
          />
        </Field>
        <Field label="Breite">
          <Choice
            value={b.width ?? "normal"}
            onChange={(v) => onChange({ width: v })}
            options={WIDTHS}
          />
        </Field>
        <Field label="Ausrichtung">
          <div className="flex gap-1">
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([a, Icon]) => (
              <button
                key={a}
                type="button"
                onClick={() => onChange({ alignX: a })}
                title={a}
                className={cn(
                  "flex-1 rounded border px-2 py-1.5",
                  (b.alignX ?? "center") === a
                    ? "border-brand/60 bg-brand/10 text-brand"
                    : "border-white/10 text-muted-foreground hover:border-white/25",
                )}
              >
                <Icon className="mx-auto h-3.5 w-3.5" />
              </button>
            ))}
          </div>
        </Field>
        {b.bg === "image" && (
          <>
            {/* Hintergrundbild-Optionen nur relevant, wenn "image" gewählt ist. */}
            <ImageField
              label="Hintergrundbild"
              value={b.bgImageUrl}
              onChange={(url) => onChange({ bgImageUrl: url })}
              onUpload={onUpload}
            />
            <Field label={`Abdunklung (${b.bgOverlay ?? 55}%)`}>
              <Input
                type="range"
                min={0}
                max={100}
                value={b.bgOverlay ?? 55}
                onChange={(e) => onChange({ bgOverlay: Number(e.target.value) })}
              />
            </Field>
          </>
        )}
        <label className="flex items-center justify-between text-xs">
          Block sichtbar
          <Switch checked={!b.hidden} onCheckedChange={(v) => onChange({ hidden: !v })} />
        </label>

        {!pro && (
          <Field label="Einblend-Effekt">
            <Choice
              value={b.anim ?? "fade-up"}
              onChange={(v) => onChange({ anim: v })}
              options={ANIMATIONS}
            />
          </Field>
        )}

        {pro && (
          <Advanced>
            <SpacingSnap
              label="Abstand oben"
              value={b.padTop ?? PADDING_PX[(b.padding ?? "lg") as keyof typeof PADDING_PX]}
              snap={snap}
              onChange={(v) => onChange({ padTop: v })}
              onReset={() => onChange({ padTop: undefined })}
              isCustom={b.padTop !== undefined}
            />
            <SpacingSnap
              label="Abstand unten"
              value={b.padBottom ?? PADDING_PX[(b.padding ?? "lg") as keyof typeof PADDING_PX]}
              snap={snap}
              onChange={(v) => onChange({ padBottom: v })}
              onReset={() => onChange({ padBottom: undefined })}
              isCustom={b.padBottom !== undefined}
            />
            {b.bg === "image" && (
              <label className="flex items-center justify-between text-xs">
                Parallax-Effekt
                <Switch checked={!!b.parallax} onCheckedChange={(v) => onChange({ parallax: v })} />
              </label>
            )}
            <Field label="Hover-Effekt (Karten)">
              <Choice
                value={b.hoverFx ?? "none"}
                onChange={(v) => onChange({ hoverFx: v })}
                options={HOVER_FX}
              />
            </Field>
            <Field label="Anker-ID (für Links)">
              <Input
                className="h-8 text-xs"
                value={b.anchor ?? ""}
                onChange={(e) => onChange({ anchor: e.target.value.replace(/[^a-z0-9-]/gi, "") })}
              />
            </Field>
          </Advanced>
        )}
      </TabsContent>

      <TabsContent value="anim" className="mt-3 space-y-3">
        <Field label="Effekt">
          <Choice
            value={b.anim ?? "fade-up"}
            onChange={(v) => onChange({ anim: v })}
            options={ANIMATIONS}
          />
        </Field>
        <Field label="Verzögerung (ms)">
          <Input
            type="number"
            min={0}
            max={2000}
            step={50}
            className="h-8 text-xs"
            value={b.animDelay ?? 0}
            onChange={(e) =>
              onChange({ animDelay: Math.max(0, Math.min(2000, Number(e.target.value) || 0)) })
            }
          />
        </Field>
        <Field label={`Gestaffelt (${b.stagger ?? 0} ms pro Element)`}>
          <Input
            type="range"
            min={0}
            max={300}
            step={10}
            value={b.stagger ?? 0}
            onChange={(e) => onChange({ stagger: Number(e.target.value) })}
          />
        </Field>
        <p className="text-[11px] text-muted-foreground">
          Animationen laufen auf der öffentlichen Seite beim Scrollen – in der Vorschau sind sie
          ausgeschaltet.
        </p>
      </TabsContent>
    </Tabs>
  );
}

function ListEditor({
  items,
  fields,
  max,
  onChange,
  addLabel,
}: {
  items: Record<string, string>[];
  fields: { key: string; label: string; area?: boolean }[];
  max: number;
  addLabel: string;
  onChange: (items: Record<string, string>[]) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="space-y-1.5 rounded border border-white/10 p-2">
          {fields.map((f) =>
            f.area ? (
              <Textarea
                key={f.key}
                rows={2}
                className="text-xs"
                placeholder={f.label}
                value={it[f.key] ?? ""}
                onChange={(e) =>
                  onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))
                }
              />
            ) : (
              <Input
                key={f.key}
                className="h-8 text-xs"
                placeholder={f.label}
                value={it[f.key] ?? ""}
                onChange={(e) =>
                  onChange(items.map((x, j) => (j === i ? { ...x, [f.key]: e.target.value } : x)))
                }
              />
            ),
          )}
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs text-destructive"
            onClick={() => onChange(items.filter((_, j) => j !== i))}
          >
            <Trash2 className="mr-1 h-3 w-3" /> Entfernen
          </Button>
        </div>
      ))}
      {items.length < max && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 w-full text-xs"
          onClick={() => onChange([...items, Object.fromEntries(fields.map((f) => [f.key, ""]))])}
        >
          <Plus className="mr-1 h-3 w-3" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

function ContentFields({
  block,
  onChange,
  onUpload,
}: {
  block: PageBlock & Record<string, any>;
  onChange: (patch: Patch) => void;
  onUpload?: (file: File) => Promise<string>;
}) {
  const text = (key: string, label: string, max?: number) => (
    <Field label={label}>
      <Input
        className="h-8 text-xs"
        maxLength={max}
        value={block[key] ?? ""}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </Field>
  );
  const area = (key: string, label: string, rows = 4) => (
    <Field label={label}>
      <Textarea
        rows={rows}
        className="text-xs"
        value={block[key] ?? ""}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </Field>
  );
  const img = (key: string, label: string) => (
    <ImageField
      label={label}
      value={block[key]}
      onChange={(url) => onChange({ [key]: url })}
      onUpload={onUpload}
    />
  );

  switch (block.type) {
    case "container": {
      const cols = block.columns as {
        id: string;
        width: number;
        pad?: number;
        bg?: string;
        blocks: PageBlock[];
      }[];
      const setCols = (next: typeof cols) => onChange({ columns: next });
      const even = () =>
        setCols(cols.map((c) => ({ ...c, width: Math.round((100 / cols.length) * 10) / 10 })));
      return (
        <>
          <Field label={`Spaltenabstand (${block.gap ?? 24} px)`}>
            <Input
              type="range"
              min={0}
              max={96}
              step={4}
              value={block.gap ?? 24}
              onChange={(e) => onChange({ gap: Number(e.target.value) })}
            />
          </Field>
          <Field label="Vertikale Ausrichtung">
            <Choice
              value={block.alignY ?? "stretch"}
              onChange={(v) => onChange({ alignY: v })}
              options={["stretch", "start", "center", "end"] as const}
            />
          </Field>
          <label className="flex items-center justify-between text-xs">
            Auf schmalen Breiten stapeln
            <Switch
              checked={block.stack !== false}
              onCheckedChange={(v) => onChange({ stack: v })}
            />
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Spalten ({cols.length})</Label>
              <Button size="sm" variant="ghost" className="h-6 text-[11px]" onClick={even}>
                Gleich verteilen
              </Button>
            </div>
            {cols.map((c, i) => (
              <div key={c.id} className="space-y-1.5 rounded border border-white/10 p-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Spalte {i + 1}</span>
                  <span className="font-mono text-brand">{Math.round(c.width * 10) / 10}%</span>
                </div>
                <Input
                  type="range"
                  min={5}
                  max={95}
                  step={0.5}
                  value={c.width}
                  onChange={(e) => {
                    // Differenz gleichmäßig auf die übrigen Spalten verteilen.
                    const target = Number(e.target.value);
                    const rest = cols.filter((_, j) => j !== i);
                    const restSum = rest.reduce((s, r) => s + r.width, 0) || 1;
                    const left = Math.max(5 * rest.length, 100 - target);
                    setCols(
                      cols.map((x, j) =>
                        j === i
                          ? { ...x, width: Math.round(target * 10) / 10 }
                          : { ...x, width: Math.round((x.width / restSum) * left * 10) / 10 },
                      ),
                    );
                  }}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <Choice
                    value={c.bg ?? "none"}
                    onChange={(v) => setCols(cols.map((x, j) => (j === i ? { ...x, bg: v } : x)))}
                    options={["none", "card", "dark", "accent"] as const}
                  />
                  <Input
                    type="number"
                    min={0}
                    max={96}
                    className="h-8 text-xs"
                    placeholder="Innenabstand px"
                    value={c.pad ?? ""}
                    onChange={(e) =>
                      setCols(
                        cols.map((x, j) =>
                          j === i
                            ? {
                                ...x,
                                pad: e.target.value === "" ? undefined : Number(e.target.value),
                              }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
                {cols.length > 1 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    onClick={() => {
                      const next = cols.filter((_, j) => j !== i);
                      const sum = next.reduce((s, r) => s + r.width, 0) || 1;
                      setCols(
                        next.map((x) => ({ ...x, width: Math.round((x.width / sum) * 1000) / 10 })),
                      );
                    }}
                  >
                    <Trash2 className="mr-1 h-3 w-3" /> Spalte entfernen
                  </Button>
                )}
              </div>
            ))}
            {cols.length < MAX_COLUMNS && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 w-full text-xs"
                onClick={() => {
                  const n = cols.length + 1;
                  setCols([
                    ...cols.map((c) => ({ ...c, width: Math.round((100 / n) * 10) / 10 })),
                    { id: newBlockId(), width: Math.round((100 / n) * 10) / 10, blocks: [] },
                  ]);
                }}
              >
                <Plus className="mr-1 h-3 w-3" /> Spalte hinzufügen
              </Button>
            )}
          </div>
        </>
      );
    }
    case "hero":
      return (
        <>
          {text("tag", "Kleiner Tag über dem Titel", 40)}
          {text("title", "Titel", 120)}
          {area("subtitle", "Untertitel", 3)}
          <label className="flex items-center justify-between text-xs">
            Titel animiert schreiben
            <Switch
              checked={block.animatedTitle !== false}
              onCheckedChange={(v) => onChange({ animatedTitle: v })}
            />
          </label>
          <label className="flex items-center justify-between text-xs">
            Logo anzeigen
            <Switch checked={!!block.showLogo} onCheckedChange={(v) => onChange({ showLogo: v })} />
          </label>
          {block.showLogo && (
            <div className="space-y-3 rounded border border-white/10 p-2">
              <Field label="Logo-Größe">
                <Choice
                  value={block.logoSize ?? "md"}
                  onChange={(v) => onChange({ logoSize: v })}
                  options={["sm", "md", "lg", "xl"]}
                />
              </Field>
              <Field label="Logo-Stil">
                <Choice
                  value={block.logoStyle ?? "plain"}
                  onChange={(v) => onChange({ logoStyle: v })}
                  options={["plain", "ring", "glow", "badge"]}
                />
              </Field>
              <Field label="Logo-Position">
                <Choice
                  value={block.logoPosition ?? "above"}
                  onChange={(v) => onChange({ logoPosition: v })}
                  options={["above", "beside", "behind"]}
                />
              </Field>
              <Field label="Kontrast-Fläche">
                <Choice
                  value={block.logoContrast ?? "auto"}
                  onChange={(v) => onChange({ logoContrast: v })}
                  options={["auto", "light", "dark", "none"]}
                />
              </Field>
              <label className="flex items-center justify-between text-xs">
                Größe automatisch anpassen
                <Switch
                  checked={block.logoAutoSize !== false}
                  onCheckedChange={(v) => onChange({ logoAutoSize: v })}
                />
              </label>
              <p className="text-[11px] leading-snug text-muted-foreground">
                „auto" legt bei Bild-/Sternenfeld-Hintergründen automatisch eine dezente
                Kontrastfläche hinter das Logo; die Größe skaliert responsiv mit.
              </p>
            </div>
          )}
          <label className="flex items-center justify-between text-xs">
            Sternenfeld
            <Switch
              checked={!!block.starfield}
              onCheckedChange={(v) => onChange({ starfield: v })}
            />
          </label>
          <Field label="Höhe">
            <Choice
              value={block.height ?? "half"}
              onChange={(v) => onChange({ height: v })}
              options={["auto", "half", "full"]}
            />
          </Field>
          {img("imageUrl", "Hintergrundbild")}
          {text("primaryLabel", "Button 1 – Text", 40)}
          {text("primaryUrl", "Button 1 – Link")}
          {text("secondaryLabel", "Button 2 – Text", 40)}
          {text("secondaryUrl", "Button 2 – Link")}
        </>
      );
    case "text":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          {area("body", "Text", 8)}
          <Field label="Ausrichtung">
            <Choice
              value={block.align ?? "left"}
              onChange={(v) => onChange({ align: v })}
              options={["left", "center"]}
            />
          </Field>
          {img("imageUrl", "Bild")}
          <Field label="Bildposition">
            <Choice
              value={block.imageSide ?? "right"}
              onChange={(v) => onChange({ imageSide: v })}
              options={["left", "right"]}
            />
          </Field>
        </>
      );
    case "features":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          {area("subtitle", "Untertitel", 2)}
          <Field label="Spalten">
            <Choice
              value={String(block.columns ?? 3)}
              onChange={(v) => onChange({ columns: Number(v) })}
              options={["2", "3", "4"]}
            />
          </Field>
          <ListEditor
            items={block.items ?? []}
            max={12}
            addLabel="Karte"
            fields={[
              { key: "title", label: "Titel" },
              { key: "text", label: "Text", area: true },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "stats":
      return (
        <ListEditor
          items={block.items ?? []}
          max={6}
          addLabel="Kennzahl"
          fields={[
            { key: "value", label: "Wert" },
            { key: "label", label: "Beschriftung" },
          ]}
          onChange={(items) => onChange({ items })}
        />
      );
    case "gallery":
      return (
        <>
          {text("title", "Überschrift", 120)}
          <Field label="Spalten">
            <Choice
              value={String(block.columns ?? 3)}
              onChange={(v) => onChange({ columns: Number(v) })}
              options={["2", "3", "4"]}
            />
          </Field>
          <ListEditor
            items={block.items ?? []}
            max={12}
            addLabel="Bild"
            fields={[
              { key: "url", label: "Bild-URL (https://)" },
              { key: "caption", label: "Bildunterschrift" },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "quote":
      return (
        <>
          {area("text", "Zitat", 3)}
          {text("author", "Quelle", 80)}
        </>
      );
    case "cta":
      return (
        <>
          {text("title", "Titel", 120)}
          {area("text", "Text", 3)}
          {text("buttonLabel", "Button-Text", 40)}
          {text("buttonUrl", "Button-Link")}
        </>
      );
    case "divider":
      return (
        <Field label="Stil">
          <Choice
            value={block.style ?? "scanline"}
            onChange={(v) => onChange({ style: v })}
            options={["scanline", "line", "space"]}
          />
        </Field>
      );
    case "join":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          {area("text", "Text", 4)}
          {text("buttonLabel", "Button-Text", 40)}
          {text("buttonUrl", "Button-Link")}
          <ListEditor
            items={(block.bullets ?? []).map((x: string) => ({ v: x }))}
            max={8}
            addLabel="Punkt"
            fields={[{ key: "v", label: "Punkt" }]}
            onChange={(items) => onChange({ bullets: items.map((i) => i.v ?? "") })}
          />
        </>
      );
    case "timeline":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          <ListEditor
            items={block.items ?? []}
            max={12}
            addLabel="Station"
            fields={[
              { key: "date", label: "Datum / Label" },
              { key: "title", label: "Titel" },
              { key: "text", label: "Text", area: true },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "logos":
      return (
        <>
          {text("title", "Überschrift", 120)}
          <label className="flex items-center justify-between text-xs">
            Endlos-Laufband
            <Switch checked={!!block.marquee} onCheckedChange={(v) => onChange({ marquee: v })} />
          </label>
          <label className="flex items-center justify-between text-xs">
            Graustufen
            <Switch
              checked={block.grayscale !== false}
              onCheckedChange={(v) => onChange({ grayscale: v })}
            />
          </label>
          <ListEditor
            items={block.items ?? []}
            max={16}
            addLabel="Logo"
            fields={[
              { key: "url", label: "Bild-URL (https://)" },
              { key: "alt", label: "Name" },
              { key: "link", label: "Link (optional)" },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "faq":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          <ListEditor
            items={block.items ?? []}
            max={16}
            addLabel="Frage"
            fields={[
              { key: "q", label: "Frage" },
              { key: "a", label: "Antwort", area: true },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "countdown":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          {area("subtitle", "Untertitel", 2)}
          <Field label="Zieldatum &amp; Uhrzeit">
            <Input
              type="datetime-local"
              className="h-8 text-xs"
              value={block.target ? String(block.target).slice(0, 16) : ""}
              onChange={(e) =>
                onChange({
                  target: e.target.value ? new Date(e.target.value).toISOString() : "",
                })
              }
            />
          </Field>
          {text("expiredText", "Text nach Ablauf", 80)}
        </>
      );
    case "video":
      return (
        <>
          {text("title", "Überschrift", 120)}
          {text("url", "Video-URL (YouTube, Vimeo oder Einbett-Link)")}
          {text("caption", "Bildunterschrift", 120)}
          <Field label="Seitenverhältnis">
            <Choice
              value={block.aspect ?? "16/9"}
              onChange={(v) => onChange({ aspect: v })}
              options={["16/9", "21/9", "4/3"]}
            />
          </Field>
        </>
      );
    case "bento":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          <ListEditor
            items={block.items ?? []}
            max={8}
            addLabel="Kachel"
            fields={[
              { key: "title", label: "Titel" },
              { key: "text", label: "Text", area: true },
              { key: "imageUrl", label: "Bild-URL (optional)" },
              { key: "link", label: "Link (optional)" },
              { key: "size", label: "Größe: sm oder lg" },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "team":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          <Field label="Spalten">
            <Choice
              value={String(block.columns ?? 3)}
              onChange={(v) => onChange({ columns: Number(v) })}
              options={["2", "3", "4"]}
            />
          </Field>
          <ListEditor
            items={block.items ?? []}
            max={12}
            addLabel="Person"
            fields={[
              { key: "name", label: "Name" },
              { key: "role", label: "Rolle" },
              { key: "imageUrl", label: "Bild-URL (optional)" },
              { key: "link", label: "Link (optional)" },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "pricing":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          <ListEditor
            items={(block.items ?? []) as unknown as Record<string, string>[]}
            max={4}
            addLabel="Paket"
            fields={[
              { key: "name", label: "Name" },
              { key: "price", label: "Preis" },
              { key: "period", label: "Zeitraum" },
              { key: "features", label: "Leistungen (eine pro Zeile)", area: true },
              { key: "buttonLabel", label: "Button-Text" },
              { key: "buttonUrl", label: "Button-Link" },
            ]}
            onChange={(items) => onChange({ items })}
          />
        </>
      );
    case "shape":
      return (
        <>
          <Field label="Form">
            <Choice
              value={block.style ?? "wave"}
              onChange={(v) => onChange({ style: v })}
              options={["wave", "slant", "curve", "gradient"]}
            />
          </Field>
          <label className="flex items-center justify-between text-xs">
            Spiegeln
            <Switch checked={!!block.flip} onCheckedChange={(v) => onChange({ flip: v })} />
          </label>
          <Field label={`Höhe (${block.height ?? 90} px)`}>
            <Input
              type="range"
              min={20}
              max={240}
              step={10}
              value={block.height ?? 90}
              onChange={(e) => onChange({ height: Number(e.target.value) })}
            />
          </Field>
        </>
      );
    case "banner":
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Titel", 120)}
          {area("subtitle", "Untertitel", 2)}
          {img("imageUrl", "Hintergrundbild")}
          <Field label={`Abdunklung (${block.overlay ?? 55}%)`}>
            <Input
              type="range"
              min={0}
              max={100}
              value={block.overlay ?? 55}
              onChange={(e) => onChange({ overlay: Number(e.target.value) })}
            />
          </Field>
          <label className="flex items-center justify-between text-xs">
            Logo als Wasserzeichen
            <Switch
              checked={!!block.logoWatermark}
              onCheckedChange={(v) => onChange({ logoWatermark: v })}
            />
          </label>
          {block.logoWatermark && (
            <Field label={`Logo-Deckkraft (${block.logoOpacity ?? 12}%)`}>
              <Input
                type="range"
                min={3}
                max={40}
                value={block.logoOpacity ?? 12}
                onChange={(e) => onChange({ logoOpacity: Number(e.target.value) })}
              />
            </Field>
          )}
          <Field label="Höhe">
            <Choice
              value={block.height ?? "md"}
              onChange={(v) => onChange({ height: v })}
              options={["sm", "md", "lg"]}
            />
          </Field>
          {text("buttonLabel", "Button-Text", 40)}
          {text("buttonUrl", "Button-Link")}
        </>
      );
    default:
      return (
        <>
          {text("tag", "Tag", 40)}
          {text("title", "Überschrift", 120)}
          {area("subtitle", "Untertitel", 2)}
          {text("cta", "Button-Text", 40)}
          <Field label="Anzahl Einträge">
            <Input
              type="number"
              min={1}
              max={24}
              className="h-8 text-xs"
              value={block.limit ?? 6}
              onChange={(e) =>
                onChange({ limit: Math.max(1, Math.min(24, Number(e.target.value) || 1)) })
              }
            />
          </Field>
          <p className="text-[11px] text-muted-foreground">
            Die Inhalte kommen automatisch aus eurer Orga.
          </p>
        </>
      );
  }
}

function GlobalInspector({
  page,
  global,
  onGlobal,
  onEffects,
  onLogo,
}: {
  page: OrgPage;
  global: Global;
  onGlobal: (patch: Partial<Global>) => void;
  onEffects: (patch: Partial<NonNullable<OrgPage["effects"]>>) => void;
  onLogo: (f: File) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
        Seiteneinstellungen
      </div>
      <p className="text-[11px] text-muted-foreground">
        Klick einen Block in der Vorschau an, um ihn zu bearbeiten.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Primärfarbe">
          <Input
            type="color"
            className="h-8"
            value={global.primary}
            onChange={(e) => onGlobal({ primary: e.target.value })}
          />
        </Field>
        <Field label="Akzentfarbe">
          <Input
            type="color"
            className="h-8"
            value={global.accent}
            onChange={(e) => onGlobal({ accent: e.target.value })}
          />
        </Field>
      </div>
      <Field label="Logo hochladen">
        <input
          type="file"
          accept="image/*"
          className="text-xs"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onLogo(f);
          }}
        />
      </Field>
      <div className="space-y-2 rounded border border-white/10 p-2">
        <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          Globale Effekte
        </div>
        <label className="flex items-center justify-between text-xs">
          Sternenhimmel
          <Switch
            checked={!!page.effects?.starfield}
            onCheckedChange={(v) => onEffects({ starfield: v })}
          />
        </label>
        <label className="flex items-center justify-between text-xs">
          Cursor-Glow
          <Switch
            checked={!!page.effects?.cursorGlow}
            onCheckedChange={(v) => onEffects({ cursorGlow: v })}
          />
        </label>
        <label className="flex items-center justify-between text-xs">
          Scroll-Fortschritt
          <Switch
            checked={!!page.effects?.scrollProgress}
            onCheckedChange={(v) => onEffects({ scrollProgress: v })}
          />
        </label>
      </div>
      <Field label="Discord-Link">
        <Input
          className="h-8 text-xs"
          value={global.discord_url}
          onChange={(e) => onGlobal({ discord_url: e.target.value })}
        />
      </Field>
      <Field label="RSI-Link">
        <Input
          className="h-8 text-xs"
          value={global.rsi_url}
          onChange={(e) => onGlobal({ rsi_url: e.target.value })}
        />
      </Field>
      <Field label="Website">
        <Input
          className="h-8 text-xs"
          value={global.website_url}
          onChange={(e) => onGlobal({ website_url: e.target.value })}
        />
      </Field>
      <Field label="Footer-Hinweis">
        <Input
          className="h-8 text-xs"
          maxLength={200}
          value={global.footer_note}
          onChange={(e) => onGlobal({ footer_note: e.target.value })}
        />
      </Field>
    </div>
  );
}
