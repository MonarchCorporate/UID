import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { getComponentsByRefs } from "@/lib/loadout-builds.functions";
import { getShipCatalogEntry } from "@/lib/ship-catalog.functions";
import { computeTotals, fmt, type ComponentPick } from "@/lib/loadout-calc";
import { decodeLoadout, type InlineSlot } from "@/lib/loadout-share";
import { UidPage } from "@/components/uid/UidPage";

export const Route = createFileRoute("/l/$data")({
  loader: async ({ params }) => {
    const payload = decodeLoadout(params.data);
    if (!payload) throw notFound();
    const refs = payload.slots.map((s) => s.r).filter((r): r is string => !!r);
    const [ship, comps] = await Promise.all([
      getShipCatalogEntry({ data: { slug: payload.slug } }).catch(() => null),
      refs.length > 0 ? getComponentsByRefs({ data: { refs } }) : Promise.resolve([]),
    ]);
    return { payload, ship, components: comps };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Loadout-Link ungültig" }, { name: "robots", content: "noindex" }] };
    }
    const title = `${loaderData.payload.name ?? loaderData.ship?.name ?? "Loadout"} — Kurz-Link`;
    return {
      meta: [
        { title },
        { name: "description", content: loaderData.payload.desc ?? `Star-Citizen-Loadout für ${loaderData.ship?.name ?? loaderData.payload.slug}` },
        { name: "robots", content: "noindex" },
      ],
    };
  },
  component: InlineLoadout,
  notFoundComponent: NotFound,
});

function NotFound() {
  return (
    <div className="uid-theme min-h-screen bg-background text-foreground flex items-center justify-center">
      <div className="text-center">
        <h1 className="font-display text-2xl">Kurz-Link ungültig</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Der Link ist beschädigt oder aus einer inkompatiblen Version.
        </p>
        <Link to="/" className="mt-4 inline-block text-brand hover:underline">
          ← Zur Startseite
        </Link>
      </div>
    </div>
  );
}

function InlineLoadout() {
  const { payload, ship, components } = Route.useLoaderData();
  const compByRef = new Map<string, (typeof components)[number]>();
  for (const c of components) compByRef.set(c.item_ref, c);

  const picks: ComponentPick[] = payload.slots.map((s: InlineSlot) => {
    const c = s.r ? compByRef.get(s.r) : null;
    return {
      slot_key: s.k,
      item_ref: s.r,
      name: c?.name ?? null,
      category: s.c === "Missile & Bomb Racks" ? "missiles" : "weapons",
      size: s.s,
      raw: (c?.raw as Record<string, unknown> | null | undefined) ?? null,
    };
  });
  const totals = computeTotals(picks);

  const grouped = new Map<string, InlineSlot[]>();
  for (const s of payload.slots) {
    const cat = s.c ?? "Sonstige";
    const list = grouped.get(cat) ?? [];
    list.push(s);
    grouped.set(cat, list);
  }

  return (
    <UidPage backdrop="aurora" seed={3307}>
      <div className="pt-16">
        <section className="mx-auto max-w-5xl px-6 pb-24">
          <div className="mb-6">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              // inline loadout · kompakt-link
            </div>
            <h1 className="font-display text-4xl md:text-5xl tracking-tight">
              {payload.name ?? ship?.name ?? payload.slug}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {ship?.name ?? payload.slug} · {ship?.manufacturer ?? ""}
            </p>
            {payload.desc && (
              <p className="mt-4 max-w-2xl text-sm text-muted-foreground whitespace-pre-wrap">
                {payload.desc}
              </p>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
            <div className="space-y-6">
              {Array.from(grouped.entries()).map(([cat, list]) => (
                <section key={cat}>
                  <h2 className="mb-3 font-display text-sm uppercase tracking-[0.2em] text-brand">
                    {cat} · {list.length}
                  </h2>
                  <div className="grid gap-2 md:grid-cols-2">
                    {list.map((s: InlineSlot) => {
                      const c = s.r ? compByRef.get(s.r) : null;
                      return (
                        <div key={s.k} className="rounded-lg border border-white/10 bg-card/30 p-3">
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            {s.s !== null ? `Size ${s.s}` : "Mount"} · {s.n ?? "—"}
                          </div>
                          <div className="mt-1 text-sm">
                            {c ? c.name : <span className="text-muted-foreground italic">— leer —</span>}
                          </div>
                          {c && (
                            <div className="mt-1 font-mono text-[10px] text-muted-foreground">
                              {c.manufacturer_name ?? "—"} · Size {c.size ?? "—"}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>

            <aside className="lg:sticky lg:top-24 self-start">
              <div className="rounded-xl border border-brand/30 bg-brand/5 p-4">
                <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-brand">
                  // stats
                </div>
                <Row label="Total DPS" v={fmt(totals.totalDps)} />
                <Row label="Alpha Strike" v={fmt(totals.totalAlpha)} />
                <Row label="Min Range" v={fmt(totals.minRange, "m")} />
                <Row label="Waffen" v={totals.weaponCount.toString()} />
                <Row label="Missile Count" v={totals.missileCount.toString()} />
                <Row label="Missile Dmg" v={fmt(totals.missileDamage)} />
                <Row label="Power Draw" v={fmt(totals.powerDraw, "W")} />
              </div>
            </aside>
          </div>
        </section>
      </div>
    </UidPage>
  );
}

function Row({ label, v }: { label: string; v: string }) {
  return (
    <div className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono text-sm">{v}</span>
    </div>
  );
}