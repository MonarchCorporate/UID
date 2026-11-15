import type { ShipCatalogSummary } from "@/lib/ship-catalog.functions";
import { proxyImage } from "@/lib/proxy-image";

type Props = {
  ships: ShipCatalogSummary[];
  max: number;
  onRemove: (slug: string) => void;
  onClear: () => void;
  onOpen: () => void;
};

export function CompareBar({ ships, max, onRemove, onClear, onOpen }: Props) {
  if (ships.length === 0) return null;
  const canCompare = ships.length >= 2;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-brand/40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-6 py-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          // vergleich {ships.length} / {max}
        </div>
        <ul className="flex flex-1 flex-wrap items-center gap-2">
          {ships.map((s) => {
            const img = proxyImage(s.image);
            return (
              <li
                key={s.slug}
                className="flex items-center gap-2 border border-brand/20 bg-background/60 py-1 pl-1 pr-2"
              >
                <div className="h-8 w-12 overflow-hidden bg-black">
                  {img ? (
                    <img src={img} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="text-xs text-foreground">{s.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(s.slug)}
                  aria-label={`${s.name} entfernen`}
                  className="font-mono text-[10px] text-muted-foreground hover:text-destructive"
                >
                  ×
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          onClick={onClear}
          className="border border-brand/20 px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:border-brand/60 hover:text-brand"
        >
          Zurücksetzen
        </button>
        <button
          type="button"
          onClick={onOpen}
          disabled={!canCompare}
          className="border border-brand bg-brand px-5 py-2 font-mono text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Vergleichen
        </button>
      </div>
    </div>
  );
}