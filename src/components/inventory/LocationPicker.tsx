import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  ensurePresetLocation,
  upsertLocation,
  type InventoryLocation,
} from "@/lib/inventory.functions";
import { SC_LOCATIONS, type SCLocationPreset } from "@/data/sc-locations";
import { listGameLocations } from "@/lib/game-locations.functions";
import { toast } from "sonner";

export type PickedLocation = {
  id: string | null;
  label: string | null;
};

type Props = {
  value: PickedLocation;
  locations: InventoryLocation[];
  /** Wenn true, werden neu angelegte Locations mit visibility='org' erstellt. */
  visibility?: "private" | "org";
  onChange: (loc: PickedLocation) => void;
  onLocationsChanged?: () => void;
  placeholder?: string;
  className?: string;
};

/**
 * Reusable Lagerort-Picker: kombiniert eigene `inventory_locations` mit einer
 * Preset-Liste (Städte, Stationen, …) und erlaubt Freitext-Eingabe unter
 * „Sonstiges". Für Presets wird bei Bedarf ein Location-Row angelegt.
 */
export function LocationPicker({
  value,
  locations,
  visibility = "private",
  onChange,
  onLocationsChanged,
  placeholder = "— kein Lagerort —",
  className,
}: Props) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [freeText, setFreeText] = useState("");
  const ensureFn = useServerFn(ensurePresetLocation);
  const upsertFn = useServerFn(upsertLocation);

  const presetIdByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of locations) {
      // preset_key steckt in `notes` nicht — wir matchen über den Namen; das
      // Backend garantiert Idempotenz via `(owner_id, preset_key)` unique.
      // Hier nur zur Vor-Selektion.
      m.set(l.name, l.id);
    }
    return m;
  }, [locations]);

  const userLocs = useMemo(
    () =>
      locations
        .slice()
        .sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );

  // Live-Orte aus UEX (Städte, Stationen, Außenposten), Presets als Rückfall
  const liveLocFn = useServerFn(listGameLocations);
  const { data: liveLocations } = useQuery({
    queryKey: ["game-locations"],
    queryFn: () => liveLocFn(),
    staleTime: 6 * 60 * 60 * 1000,
  });
  const allPresets = liveLocations ?? SC_LOCATIONS;

  const presetsBySystem = useMemo(() => {
    const m = new Map<string, SCLocationPreset[]>();
    for (const p of allPresets) {
      if (!m.has(p.system)) m.set(p.system, []);
      m.get(p.system)!.push(p);
    }
    return Array.from(m.entries());
  }, [allPresets]);

  const pickPreset = useMutation({
    mutationFn: async (p: SCLocationPreset) => {
      const r = await ensureFn({
        data: {
          preset_key: p.key,
          label: p.name,
          note: `${p.system} · ${p.kind}`,
          visibility,
        },
      });
      return { id: r.id, label: p.name };
    },
    onSuccess: (r) => {
      onChange(r);
      onLocationsChanged?.();
      qc.invalidateQueries({ queryKey: ["inventory-locations"] });
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const pickFree = useMutation({
    mutationFn: async (name: string) => {
      const r = await upsertFn({
        data: { name, visibility },
      });
      return { id: r.id, label: name };
    },
    onSuccess: (r) => {
      onChange(r);
      onLocationsChanged?.();
      qc.invalidateQueries({ queryKey: ["inventory-locations"] });
      setFreeText("");
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const label = value.label ?? (value.id ? locations.find((l) => l.id === value.id)?.name ?? null : null);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          className={cn(
            "w-full justify-between font-normal",
            !label && "text-muted-foreground",
            className,
          )}
        >
          {label ?? placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command
          filter={(val, search) =>
            val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
          }
        >
          <CommandInput placeholder="Lagerort suchen…" />
          <CommandList className="max-h-80">
            <CommandEmpty>Kein Treffer.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="kein keiner none"
                onSelect={() => {
                  onChange({ id: null, label: null });
                  setOpen(false);
                }}
              >
                — kein Lagerort —
              </CommandItem>
            </CommandGroup>

            {userLocs.length > 0 && (
              <CommandGroup heading="Meine Lagerorte">
                {userLocs.map((l) => (
                  <CommandItem
                    key={l.id}
                    value={`user ${l.name}`}
                    onSelect={() => {
                      onChange({ id: l.id, label: l.name });
                      setOpen(false);
                    }}
                  >
                    <span>{l.name}</span>
                    <span className="ml-2 text-[10px] text-muted-foreground">
                      {l.visibility === "org" ? "orga" : "privat"}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            <CommandSeparator />
            {presetsBySystem.map(([system, presets]) => (
              <CommandGroup key={system} heading={`${system} · Städte & Stationen`}>
                {presets.map((p) => {
                  const existingId = presetIdByKey.get(p.name);
                  return (
                    <CommandItem
                      key={p.key}
                      value={`${p.name} ${p.system} ${p.kind}`}
                      disabled={pickPreset.isPending}
                      onSelect={() => {
                        if (existingId) {
                          onChange({ id: existingId, label: p.name });
                          setOpen(false);
                        } else {
                          pickPreset.mutate(p);
                        }
                      }}
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="ml-2 shrink-0 text-[10px] text-muted-foreground">
                        {p.kind}
                      </span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}

            <CommandSeparator />
            <CommandGroup heading="Sonstiges (Freitext)">
              <div className="flex items-center gap-2 px-2 py-1.5">
                <Input
                  value={freeText}
                  placeholder="z. B. Freund Hangar, POI-Wrack…"
                  onChange={(e) => setFreeText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && freeText.trim()) {
                      e.preventDefault();
                      pickFree.mutate(freeText.trim());
                    }
                  }}
                  className="h-8 text-xs"
                />
                <Button
                  size="sm"
                  disabled={!freeText.trim() || pickFree.isPending}
                  onClick={() => pickFree.mutate(freeText.trim())}
                >
                  Anlegen
                </Button>
              </div>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}