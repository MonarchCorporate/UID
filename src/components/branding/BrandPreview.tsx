import { useEffect } from "react";
import { Bell, Rocket, ShoppingCart } from "lucide-react";
import { brandVars, applyBrandVars, readableOn } from "@/lib/brand-vars";

/**
 * Live-Vorschau des Orga-Brandings. Die Farb-Tokens werden nur innerhalb
 * dieses Containers gesetzt, damit Admins Primär-/Akzentfarbe prüfen können,
 * bevor gespeichert wird. Optional lässt sich die Vorschau global anwenden.
 */
export function BrandPreview({
  primary,
  accent,
  live = false,
}: {
  primary: string;
  accent: string;
  live?: boolean;
}) {
  useEffect(() => {
    if (!live) return;
    return applyBrandVars(primary, accent);
  }, [live, primary, accent]);

  const style = brandVars(primary, accent) as React.CSSProperties;

  return (
    <div
      style={style}
      className="overflow-hidden rounded-xl border border-brand/20 bg-background/60 backdrop-blur"
    >
      <div className="flex items-center justify-between gap-3 border-b border-brand/15 bg-brand/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span
            className="grid size-7 place-items-center rounded-md text-[11px] font-bold"
            style={{ background: primary, color: readableOn(primary) }}
          >
            OR
          </span>
          <div className="font-display text-sm">Willkommen bei deiner Orga</div>
        </div>
        <Bell className="h-4 w-4 text-brand" />
      </div>

      <div className="grid gap-3 p-4 sm:grid-cols-[140px_1fr]">
        <div className="space-y-1 rounded-lg border border-brand/15 p-2">
          {[
            { icon: Rocket, label: "Einsätze", active: true },
            { icon: ShoppingCart, label: "Bestellen", active: false },
          ].map((i) => (
            <div
              key={i.label}
              className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${
                i.active ? "bg-brand/15 text-brand" : "text-muted-foreground"
              }`}
            >
              <i.icon className="h-3.5 w-3.5" />
              {i.label}
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <div className="rounded-lg border border-brand/15 p-3">
            <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
              // vorschau
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              So wirken Primär- und Akzentfarbe im Backoffice.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ background: primary, color: readableOn(primary) }}
            >
              Primär-Aktion
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-1.5 text-xs font-medium"
              style={{ background: accent, color: readableOn(accent) }}
            >
              Akzent
            </button>
            <span className="rounded-full border border-brand/40 bg-brand/10 px-2.5 py-1 text-[11px] text-brand">
              Badge
            </span>
            <span
              className="rounded-md px-2.5 py-1 text-[11px]"
              style={{
                background: `color-mix(in oklab, ${accent} 18%, transparent)`,
              }}
            >
              Hinweis
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-brand/10">
            <div
              className="h-full w-2/3 rounded-full"
              style={{ background: `linear-gradient(90deg, ${primary}, ${accent})` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
