import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Check, LayoutTemplate, Monitor, Smartphone, Sparkles, Tablet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PAGE_TEMPLATES, type PageTemplate, type PreviewRow } from "@/lib/page-templates";
import type { OrgPage } from "@/lib/page-blocks";
import { BlockList } from "@/components/page-builder/BlockRenderer";

const PREVIEW_DEVICES = {
  desktop: { width: 1280, label: "Desktop", icon: Monitor },
  tablet: { width: 834, label: "Tablet", icon: Tablet },
  mobile: { width: 390, label: "Mobil", icon: Smartphone },
} as const;
type PreviewDevice = keyof typeof PREVIEW_DEVICES;

/** Skalierte, nicht interaktive Live-Vorschau der kompletten Vorlage. */
function LivePreview({
  page,
  device,
  primary,
  accent,
  orgName,
  logoUrl,
}: {
  page: OrgPage;
  device: PreviewDevice;
  primary: string;
  accent: string;
  orgName: string;
  logoUrl: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.4);
  const [height, setHeight] = useState(0);
  const width = PREVIEW_DEVICES[device].width;

  useLayoutEffect(() => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return;
    const measure = () => {
      setScale(Math.min(1, frame.clientWidth / width));
      setHeight(inner.scrollHeight);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(frame);
    ro.observe(inner);
    return () => ro.disconnect();
  }, [width, page]);

  return (
    <div
      ref={frameRef}
      className="max-h-[52vh] overflow-y-auto overflow-x-hidden rounded-lg border border-white/10 bg-background"
    >
      <div style={{ height: height * scale }} className="relative w-full">
        <div
          ref={innerRef}
          className="pointer-events-none absolute left-0 top-0 origin-top-left bg-background text-foreground"
          style={{
            width,
            transform: `scale(${scale})`,
            ["--brand" as string]: primary,
            ["--brand-accent" as string]: accent,
          }}
          aria-hidden
        >
          <div className={page.effects?.starfield ? "star-bg" : undefined}>
            <BlockList
              blocks={page.blocks}
              ctx={{ slug: "preview", name: orgName, logoUrl, memberCount: 24 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Miniatur-Skizze einer Vorlage – rein dekorativ, nutzt die Vorlagenfarben. */
function Thumb({
  rows,
  primary,
  accent,
  logoUrl,
}: {
  rows: PreviewRow[];
  primary: string;
  accent: string;
  logoUrl: string;
}) {
  return (
    <div className="relative flex h-36 flex-col gap-1.5 overflow-hidden rounded-md border border-white/10 bg-[#0a0f18] p-2.5">
      <div
        aria-hidden
        className="absolute inset-0 opacity-40"
        style={{
          background: `radial-gradient(120% 70% at 50% -10%, ${primary}33 0%, transparent 60%)`,
        }}
      />
      {rows.map((row, i) => {
        if (row.kind === "hero") {
          const side = row.logo === "side";
          const size = row.logo === "lg" ? 26 : row.logo === "md" ? 18 : 22;
          return (
            <div
              key={i}
              className={cn(
                "relative flex flex-1 gap-2 rounded-sm border p-2",
                side ? "flex-row items-center" : "flex-col items-center justify-center",
              )}
              style={{ borderColor: `${primary}44`, background: `${primary}10` }}
            >
              <img
                src={logoUrl}
                alt=""
                className="shrink-0 object-contain"
                style={{
                  width: size,
                  height: size,
                  filter: `drop-shadow(0 0 6px ${accent}aa)`,
                }}
              />
              <div className={cn("flex flex-col gap-1", side ? "items-start" : "items-center")}>
                <div className="h-1.5 w-16 rounded-full" style={{ background: primary }} />
                <div className="h-1 w-24 rounded-full bg-white/20" />
              </div>
            </div>
          );
        }
        if (row.kind === "cards") {
          return (
            <div key={i} className="relative flex gap-1.5">
              {Array.from({ length: row.count }).map((_, c) => (
                <div
                  key={c}
                  className="h-5 flex-1 rounded-sm border border-white/10"
                  style={{ background: `${accent}18` }}
                />
              ))}
            </div>
          );
        }
        if (row.kind === "bars") {
          return (
            <div key={i} className="relative flex flex-col gap-1">
              {Array.from({ length: row.count }).map((_, c) => (
                <div
                  key={c}
                  className="h-1 rounded-full bg-white/15"
                  style={{ width: `${100 - c * 18}%` }}
                />
              ))}
            </div>
          );
        }
        if (row.kind === "split") {
          return (
            <div key={i} className="relative flex gap-1.5">
              <div className="h-7 flex-[3] rounded-sm bg-white/[0.07]" />
              <div className="h-7 flex-[2] rounded-sm" style={{ background: `${primary}22` }} />
            </div>
          );
        }
        if (row.kind === "line") {
          return (
            <div
              key={i}
              className="relative h-px w-full"
              style={{ background: `linear-gradient(90deg, transparent, ${primary}, transparent)` }}
            />
          );
        }
        return (
          <div
            key={i}
            className="relative h-7 rounded-sm border border-white/10"
            style={{ background: `${primary}14` }}
          />
        );
      })}
    </div>
  );
}

export function TemplateGallery({
  open,
  onOpenChange,
  orgName,
  logoUrl,
  currentColors,
  onApply,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orgName: string;
  logoUrl: string;
  currentColors: { primary: string; accent: string };
  onApply: (page: OrgPage, colors: { primary: string; accent: string } | null) => void;
}) {
  const [picked, setPicked] = useState<PageTemplate | null>(null);
  const [useTplColors, setUseTplColors] = useState(true);
  const [primary, setPrimary] = useState(currentColors.primary);
  const [accent, setAccent] = useState(currentColors.accent);
  const [device, setDevice] = useState<PreviewDevice>("desktop");

  const previewPage = useMemo(
    () => (picked ? picked.build({ name: orgName }) : null),
    [picked, orgName],
  );

  useEffect(() => {
    if (!open) setPicked(null);
  }, [open]);

  useEffect(() => {
    if (!picked) return;
    setUseTplColors(true);
    setPrimary(picked.colors.primary);
    setAccent(picked.colors.accent);
  }, [picked]);

  useEffect(() => {
    if (!picked) return;
    if (useTplColors) {
      setPrimary(picked.colors.primary);
      setAccent(picked.colors.accent);
    } else {
      setPrimary(currentColors.primary);
      setAccent(currentColors.accent);
    }
  }, [useTplColors, picked, currentColors.primary, currentColors.accent]);

  /** Übernimmt Blöcke, Layout-/Effekt-Einstellungen, Logo-Inszenierung und Farben. */
  const apply = (tpl?: PageTemplate) => {
    const t = tpl ?? picked;
    if (!t) return;
    const colors =
      t === picked ? { primary, accent } : { primary: t.colors.primary, accent: t.colors.accent };
    onApply(t.build({ name: orgName }), colors);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <LayoutTemplate className="h-4 w-4 text-brand" /> Vorlage wählen
          </DialogTitle>
          <DialogDescription>
            Fertige Landingpages mit passendem Farbschema. Alles bleibt danach frei bearbeitbar.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {PAGE_TEMPLATES.map((t) => {
            const active = picked?.id === t.id;
            return (
              <div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => setPicked(t)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setPicked(t);
                  }
                }}
                className={cn(
                  "group cursor-pointer rounded-lg border p-3 text-left transition-all",
                  active
                    ? "border-brand/70 bg-brand/[0.07] ring-1 ring-brand/40"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25",
                )}
              >
                <div className="relative">
                  <Thumb
                    rows={t.preview}
                    primary={t.colors.primary}
                    accent={t.colors.accent}
                    logoUrl={logoUrl}
                  />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-background/70 opacity-0 backdrop-blur-[2px] transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                    <Button
                      size="sm"
                      className="pointer-events-auto"
                      onClick={(e) => {
                        e.stopPropagation();
                        apply(t);
                      }}
                    >
                      <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                      Dieses Template verwenden
                    </Button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <span className="font-display text-sm">{t.name}</span>
                  <span className="flex items-center gap-1">
                    <i
                      className="size-3 rounded-full ring-1 ring-white/20"
                      style={{ background: t.colors.primary }}
                    />
                    <i
                      className="size-3 rounded-full ring-1 ring-white/20"
                      style={{ background: t.colors.accent }}
                    />
                    {active && <Check className="ml-1 h-3.5 w-3.5 text-brand" />}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {t.description}
                </p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {t.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {picked && (
          <div className="mt-2 space-y-3 rounded-lg border border-white/10 bg-white/[0.02] p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="font-display text-sm">Live-Vorschau – {picked.name}</span>
              <div className="flex gap-1">
                {(Object.keys(PREVIEW_DEVICES) as PreviewDevice[]).map((d) => {
                  const Icon = PREVIEW_DEVICES[d].icon;
                  return (
                    <Button
                      key={d}
                      type="button"
                      size="icon"
                      variant={device === d ? "secondary" : "ghost"}
                      title={PREVIEW_DEVICES[d].label}
                      onClick={() => setDevice(d)}
                      className="h-7 w-7"
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </Button>
                  );
                })}
              </div>
            </div>
            {previewPage && (
              <LivePreview
                page={previewPage}
                device={device}
                primary={primary}
                accent={accent}
                orgName={orgName}
                logoUrl={logoUrl}
              />
            )}
            <label className="flex items-center justify-between gap-4 text-sm">
              <span>
                Farben der Vorlage übernehmen
                <span className="mt-0.5 block text-xs text-muted-foreground">
                  Aus bedeutet: eure aktuellen Farben bleiben erhalten.
                </span>
              </span>
              <Switch checked={useTplColors} onCheckedChange={setUseTplColors} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex items-center gap-3 text-xs">
                <input
                  type="color"
                  value={primary}
                  onChange={(e) => setPrimary(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-white/15 bg-transparent"
                />
                Hauptfarbe
              </label>
              <label className="flex items-center gap-3 text-xs">
                <input
                  type="color"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-8 w-12 cursor-pointer rounded border border-white/15 bg-transparent"
                />
                Akzentfarbe
              </label>
            </div>
            <p className="text-xs text-muted-foreground">
              Übernommen werden alle Blöcke, Layout- und Effekt-Einstellungen sowie die
              Logo-Inszenierung der Vorlage. Die aktuelle Seitenstruktur wird ersetzt – mit
              „Rückgängig" im Editor lässt sich das zurücknehmen.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                Abbrechen
              </Button>
              <Button size="sm" onClick={() => apply()}>
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Dieses Template verwenden
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}