import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { listBlueprintCatalog } from "@/lib/blueprints-catalog.functions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
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
import { cn } from "@/lib/utils";
import { Hammer, FileText } from "lucide-react";
import { CraftingPanel } from "@/components/crafting/CraftingPanel";
import { CraftableOverview } from "@/components/crafting/CraftableOverview";
import { Sparkles } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";

export const Route = createFileRoute("/_authenticated/crafting/")({
  validateSearch: (search: Record<string, unknown>) => ({
    bp:
      typeof search.bp === "string" && search.bp.length > 0
        ? (search.bp as string)
        : undefined,
  }),
  component: CraftingPage,
});

function CraftingPage() {
  const bpListFn = useServerFn(listBlueprintCatalog);

  const search = Route.useSearch();
  const [blueprintId, setBlueprintId] = useState<string>(search.bp ?? "");
  const [bpOpen, setBpOpen] = useState(false);

  const bpQ = useQuery({
    queryKey: ["bp-catalog-crafting"],
    queryFn: () => bpListFn({ data: {} }),
  });

  const blueprints = bpQ.data?.blueprints ?? [];
  const selectedBp = blueprints.find((b) => b.id === blueprintId);

  const sortedBps = useMemo(
    () =>
      [...blueprints].sort((a, b) => a.name.localeCompare(b.name)),
    [blueprints],
  );

  return (
    <PageShell
      eyebrow="Produktion"
      title={
        <span className="flex items-center gap-2">
          <Hammer className="h-7 w-7 text-brand" /> Crafting
        </span>
      }
      description="Material → Output mit Qualitäts-Berechnung."
      actions={
        <>
          <Button variant="outline" size="sm" asChild>
            <Link to="/crafting/historie">Verlauf</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/inventar">Inventar</Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link to="/blueprints">Blueprints</Link>
          </Button>
        </>
      }
    >
      <section className="space-y-3">
        <SectionHeader icon={Sparkles} title="Was kann ich bauen?" subtitle="// aus deinen blueprints & deinem inventar" />
        <CraftableOverview blueprints={blueprints} loading={bpQ.isLoading} onPick={setBlueprintId} />
      </section>

      <section className="space-y-3">
        <SectionHeader
          icon={FileText}
          title="Blaupause wählen"
          subtitle="// quelle für das rezept"
        />
        <div className="border border-brand/10 bg-background/60 p-4">
          <div className="grid gap-2 md:max-w-md">
            <Label className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Blaupause
            </Label>
            <Popover open={bpOpen} onOpenChange={setBpOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className={cn(
                    "w-full justify-between font-normal",
                    !selectedBp && "text-muted-foreground",
                  )}
                >
                  {selectedBp ? selectedBp.name : "— wählen —"}
                </Button>
              </PopoverTrigger>
              <PopoverContent
                className="w-[--radix-popover-trigger-width] p-0"
                align="start"
              >
                <Command
                  filter={(val, search) =>
                    val.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                  }
                >
                  <CommandInput placeholder="Blaupause suchen…" />
                  <CommandList className="max-h-80">
                    <CommandEmpty>Kein Treffer.</CommandEmpty>
                    <CommandGroup>
                      {sortedBps.map((b) => (
                        <CommandItem
                          key={b.id}
                          value={b.name}
                          onSelect={() => {
                            setBlueprintId(b.id);
                            setBpOpen(false);
                          }}
                        >
                          <span className="flex-1">{b.name}</span>
                          {b.craftable && (
                            <Badge variant="outline" className="text-[9px]">
                              craftable
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {selectedBp && (
            <div className="mt-3">
              <Button variant="outline" size="sm" asChild>
                <Link to="/blueprints/$id" params={{ id: selectedBp.id }}>
                  <FileText className="mr-2 h-4 w-4" />
                  Blueprint-Übersicht öffnen
                </Link>
              </Button>
            </div>
          )}
        </div>
      </section>

      <section id="crafting-recipe" className="scroll-mt-20 space-y-3">
        <SectionHeader
          icon={Hammer}
          title="Rezept & Materialien"
          subtitle="// herstellung & qualitätsmix"
        />
        {!blueprintId ? (
          <div className="border border-dashed border-brand/15 p-12 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            // wähle eine blaupause
          </div>
        ) : (
          <CraftingPanel blueprintId={blueprintId} />
        )}
      </section>
    </PageShell>
  );
}
