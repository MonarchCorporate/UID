import { useMemo } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Hammer, Loader2, Sprout } from "lucide-react";
import { toast } from "sonner";
import type { CatalogBlueprint } from "@/lib/blueprints-catalog.functions";
import { addBlueprintToList, createFarmList } from "@/lib/farm-lists.functions";

function coverage(b: CatalogBlueprint) {
  if (!b.ingredients.length) return 0;
  const parts = b.ingredients.map((i) => (i.need > 0 ? Math.min(1, i.have / i.need) : 1));
  return parts.reduce((s, x) => s + x, 0) / parts.length;
}

/**
 * „Was kann ich bauen?“ – aus den eigenen Blueprints und dem Inventar:
 * sofort craftbar, und fast craftbar mit den fehlenden Materialien.
 */
export function CraftableOverview({
  blueprints,
  loading,
  onPick,
}: {
  blueprints: CatalogBlueprint[];
  loading: boolean;
  onPick: (id: string) => void;
}) {
  const navigate = useNavigate();
  const createFn = useServerFn(createFarmList);
  const addFn = useServerFn(addBlueprintToList);

  const { ready, almost, owned } = useMemo(() => {
    const own = blueprints.filter((b) => b.owned && b.ingredients.length > 0);
    return {
      owned: own.length,
      ready: own.filter((b) => b.craftable).sort((a, b) => a.name.localeCompare(b.name)),
      almost: own
        .filter((b) => !b.craftable)
        .map((b) => ({ b, c: coverage(b) }))
        .filter((x) => x.c >= 0.4)
        .sort((a, b) => b.c - a.c || a.b.name.localeCompare(b.b.name))
        .slice(0, 8),
    };
  }, [blueprints]);

  const farm = useMutation({
    mutationFn: async (b: CatalogBlueprint) => {
      const list = await createFn({
        data: {
          name: `Material für ${b.name}`,
          description: `Fehlt noch: ${b.missing.join(", ")}`,
          include_personal_inventory: true,
          include_org_warehouse: true,
        },
      });
      await addFn({ data: { list_id: list.id, blueprint_id: b.id, quantity: 1 } });
      return list.id;
    },
    onSuccess: (id) => {
      toast.success("Farm-Liste angelegt.");
      navigate({ to: "/farm-lists/$id", params: { id } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : String(e)),
  });

  const pick = (id: string) => {
    onPick(id);
    window.setTimeout(() => document.getElementById("crafting-recipe")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  };

  if (loading) {
    return (
      <div className="grid gap-3 md:grid-cols-2">
        <div className="uid-card h-40 animate-pulse rounded-xl" />
        <div className="uid-card h-40 animate-pulse rounded-xl" />
      </div>
    );
  }

  if (owned === 0) {
    return (
      <div className="uid-card rounded-xl p-6 text-sm text-muted-foreground">
        Du hast noch keine Blueprints in deiner Sammlung. Markiere unter{" "}
        <Link to="/blueprints" className="text-brand hover:underline">
          Blueprints
        </Link>{" "}
        die Rezepte, die du freigeschaltet hast – dann zeigt dir diese Übersicht, was du mit deinem Inventar bauen kannst.
      </div>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="uid-card rounded-xl p-4 md:p-5" aria-labelledby="craft-ready">
        <h3 id="craft-ready" className="flex items-center gap-2 text-sm text-foreground">
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
          Jetzt craftbar
          <span className="text-muted-foreground">({ready.length})</span>
        </h3>
        {ready.length ? (
          <ul className="mt-3 divide-y divide-brand/10">
            {ready.slice(0, 10).map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground/90">
                  {b.name}
                  {b.output_qty > 1 && <span className="text-muted-foreground"> ×{b.output_qty}</span>}
                </span>
                <button
                  type="button"
                  onClick={() => pick(b.id)}
                  className="focus-ring inline-flex items-center gap-1.5 rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:opacity-90"
                >
                  <Hammer className="h-3.5 w-3.5" /> Craften
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Mit deinem aktuellen Inventar ist noch nichts komplett. Daneben siehst du, wo am wenigsten fehlt.
          </p>
        )}
      </section>

      <section className="uid-card rounded-xl p-4 md:p-5" aria-labelledby="craft-almost">
        <h3 id="craft-almost" className="flex items-center gap-2 text-sm text-foreground">
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          Fast craftbar
        </h3>
        {almost.length ? (
          <ul className="mt-3 space-y-3">
            {almost.map(({ b, c }) => (
              <li key={b.id}>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => pick(b.id)}
                    className="focus-ring min-w-0 flex-1 truncate text-left text-sm text-foreground/90 hover:text-brand"
                  >
                    {b.name}
                  </button>
                  <span className="tabular-nums text-xs text-muted-foreground">{Math.round(c * 100)} %</span>
                  <button
                    type="button"
                    disabled={farm.isPending}
                    onClick={() => farm.mutate(b)}
                    title="Farm-Liste mit den fehlenden Materialien anlegen"
                    className="focus-ring inline-flex items-center gap-1 rounded-md border border-brand/30 px-2 py-1 text-xs text-brand hover:bg-brand/10 disabled:opacity-50"
                  >
                    {farm.isPending && farm.variables?.id === b.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sprout className="h-3.5 w-3.5" />
                    )}
                    Farmen
                  </button>
                </div>
                <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-brand/10">
                  <div className="h-full rounded-full bg-amber-400/80" style={{ width: `${Math.round(c * 100)}%` }} />
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">Fehlt: {b.missing.slice(0, 3).join(", ")}{b.missing.length > 3 ? " …" : ""}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Für keinen deiner Blueprints hast du schon einen großen Teil der Materialien.</p>
        )}
      </section>
    </div>
  );
}
