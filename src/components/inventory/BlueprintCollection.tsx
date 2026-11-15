import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listBlueprintCatalog,
  toggleBlueprintOwned,
} from "@/lib/blueprints-catalog.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { LoadingScreen } from "@/components/ui/loading-screen";
import { StatGrid, StatCard } from "@/components/layout/PageShell";
import { FileText, Plus, Trash2, Hammer } from "lucide-react";

export function BlueprintCollection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listBlueprintCatalog);
  const toggleFn = useServerFn(toggleBlueprintOwned);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const bpQ = useQuery({
    queryKey: ["bp-catalog-inventory"],
    queryFn: () => listFn({ data: {} }),
  });
  const blueprints = useMemo(() => bpQ.data?.blueprints ?? [], [bpQ.data]);

  const toggleM = useMutation({
    mutationFn: (p: { blueprint_id: string; owned: boolean }) =>
      toggleFn({ data: p }),
    onSuccess: (_r, v) => {
      toast.success(v.owned ? "Als gesammelt markiert" : "Entfernt");
      qc.invalidateQueries({ queryKey: ["bp-catalog-inventory"] });
      qc.invalidateQueries({ queryKey: ["bp-catalog-crafting"] });
      qc.invalidateQueries({ queryKey: ["blueprint-catalog"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const owned = useMemo(
    () =>
      blueprints
        .filter((b) => b.owned)
        .filter((b) =>
          search ? b.name.toLowerCase().includes(search.toLowerCase()) : true,
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [blueprints, search],
  );
  const notOwned = useMemo(
    () =>
      blueprints
        .filter((b) => !b.owned)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [blueprints],
  );
  const craftable = owned.filter((b) => b.craftable).length;

  if (bpQ.isLoading) {
    return (
      <LoadingScreen
        label="Lade Blueprints"
        hint="// rufe gesammelte blaupausen ab"
        cards={6}
      />
    );
  }

  return (
    <div className="space-y-4">
      <StatGrid cols={3}>
        <StatCard
          label="Gesammelte Blueprints"
          value={blueprints.filter((b) => b.owned).length}
          icon={FileText}
          tone="brand"
        />
        <StatCard label="Aktuell craftbar" value={craftable} icon={Hammer} tone="emerald" />
        <StatCard label="Noch nicht gesammelt" value={notOwned.length} icon={Plus} />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2">
        <Popover open={addOpen} onOpenChange={setAddOpen}>
          <PopoverTrigger asChild>
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" /> Blueprint hinzufügen
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[340px] p-0" align="start">
            <Command
              filter={(val, s) =>
                val.toLowerCase().includes(s.toLowerCase()) ? 1 : 0
              }
            >
              <CommandInput placeholder="Blaupause suchen…" />
              <CommandList className="max-h-80">
                <CommandEmpty>Kein Treffer.</CommandEmpty>
                <CommandGroup>
                  {notOwned.slice(0, 500).map((b) => (
                    <CommandItem
                      key={b.id}
                      value={b.name}
                      onSelect={() => {
                        toggleM.mutate({ blueprint_id: b.id, owned: true });
                        setAddOpen(false);
                      }}
                    >
                      <span className="flex-1">{b.name}</span>
                      {b.category && (
                        <Badge variant="outline" className="text-[9px]">
                          {b.category}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Input
          placeholder="Gesammelte durchsuchen…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="ml-auto max-w-xs"
        />
      </div>

      {owned.length === 0 ? (
        <div className="border border-dashed border-brand/15 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          // noch keine blueprints gesammelt
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {owned.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-2 border border-brand/10 bg-background/60 p-3"
            >
              <div className="flex items-start gap-2">
                <FileText className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{b.name}</div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {b.category ?? b.source}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1">
                {b.craftable ? (
                  <Badge variant="outline" className="text-[9px] text-emerald-400">
                    craftbar
                  </Badge>
                ) : (
                  b.missing.length > 0 && (
                    <Badge variant="outline" className="text-[9px]">
                      fehlt: {b.missing.length}
                    </Badge>
                  )
                )}
              </div>
              <div className="mt-auto flex gap-1">
                <Button variant="outline" size="sm" asChild className="flex-1">
                  <Link to="/crafting" search={{ bp: b.id }}>
                    <Hammer className="mr-1 h-3 w-3" /> Craften
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() =>
                    toggleM.mutate({ blueprint_id: b.id, owned: false })
                  }
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
