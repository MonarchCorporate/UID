import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { searchItemCatalog } from "@/lib/inventory.functions";

export type CatalogHit = {
  item_ref: string | null;
  name: string;
  kind: string | null;
  image_url: string | null;
  unit?: string | null;
};

/**
 * Suchfeld über den gesamten Item-Katalog. Wählbare Treffer werden per
 * `onPick` zurückgegeben. Wiederverwendbar für Inventar, Orgalager und
 * Board-Ladung.
 */
export function CatalogPicker({
  onPick,
  placeholder = "Suche im Katalog (z. B. Iron, Tactical Suit…)",
}: {
  onPick: (hit: CatalogHit) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const searchFn = useServerFn(searchItemCatalog);
  const hitsQ = useQuery({
    queryKey: ["catalog-picker", q],
    queryFn: () => searchFn({ data: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 60_000,
  });
  const hits = (hitsQ.data?.items ?? []) as CatalogHit[];
  return (
    <Popover open={open && hits.length > 0} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <Input
          value={q}
          placeholder={placeholder}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
      </PopoverAnchor>
      <PopoverContent
        className="w-[min(28rem,90vw)] p-0"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          const t = e.target as HTMLElement;
          if (t?.tagName === "INPUT") e.preventDefault();
        }}
      >
        <ul
          className="max-h-72 overflow-auto overscroll-contain"
          onWheel={(e) => {
            // Radix Dialog blockiert Wheel-Events auf portalisierten
            // Popovern. Manuell scrollen und Bubble stoppen.
            e.currentTarget.scrollTop += e.deltaY;
            e.stopPropagation();
          }}
        >
          {hits.map((h) => (
            <li key={`${h.item_ref ?? h.name}`}>
              <button
                type="button"
                className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-muted"
                onClick={() => {
                  onPick(h);
                  setQ(h.name);
                  setOpen(false);
                }}
              >
                {h.image_url ? (
                  <img
                    src={h.image_url}
                    alt=""
                    className="h-8 w-8 shrink-0 rounded object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="h-8 w-8 shrink-0 rounded border border-brand/10" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{h.name}</div>
                  {h.kind && (
                    <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                      {h.kind}
                    </div>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}