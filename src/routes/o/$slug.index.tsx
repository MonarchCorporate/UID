import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  listPublicOrgMissions,
  listPublicOrgFleet,
  listPublicOrgShop,
} from "@/lib/public-org.functions";
import { Route as OrgRoute } from "./$slug";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import logo from "@/assets/idcp-logo.png.asset.json";
import { resolveBranding, type ResolvedSection } from "@/lib/org-branding";
import { BlockList } from "@/components/page-builder/BlockRenderer";
import { CursorGlow } from "@/components/idcp/CursorGlow";
import { ScrollProgress } from "@/components/idcp/ScrollProgress";

export const Route = createFileRoute("/o/$slug/")({
  head: ({ params }) => {
    // Leaf inherits parent head; keep minimal so parent title wins.
    return { meta: [{ property: "og:url", content: `/o/${params.slug}` }] };
  },
  component: OrgLanding,
});

function OrgLanding() {
  const { org } = OrgRoute.useLoaderData();
  const b = resolveBranding(org.branding, { name: org.name });
  const logoSrc = b.logoUrl || logo.url;
  const page = org.branding?.page;

  if (page && page.blocks.length > 0) {
    return (
      <main className="relative overflow-x-hidden">
        {page.effects?.cursorGlow && <CursorGlow />}
        {page.effects?.scrollProgress && <ScrollProgress />}
        <div className={page.effects?.starfield ? "star-bg" : undefined}>
          <BlockList
            blocks={page.blocks}
            ctx={{
              slug: org.slug,
              name: org.name,
              logoUrl: logoSrc,
              memberCount: org.member_count,
            }}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-6">
      <section className="relative py-24 md:py-32">
        {b.heroImageUrl && (
          <img
            src={b.heroImageUrl}
            alt=""
            className="mb-10 h-56 w-full rounded-xl object-cover opacity-90 md:h-72"
            loading="lazy"
          />
        )}
        <div className="flex flex-col items-start gap-6">
          {b.showLogo && (
            <img
              src={logoSrc}
              alt={org.name}
              className="size-20 rounded-lg object-contain"
              width={80}
              height={80}
            />
          )}
          <div className="inline-block p-1 border border-brand/30">
            <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              // {org.tag ?? org.slug}
            </div>
          </div>
          <h1 className="font-display text-5xl tracking-tight md:text-6xl">
            {b.heroTitle}
          </h1>
          <p className="max-w-2xl text-base text-muted-foreground">{b.heroSubtitle}</p>
          {b.heroCtaLabel && b.heroCtaUrl && (
            <a
              href={b.heroCtaUrl}
              target={b.heroCtaUrl.startsWith("http") ? "_blank" : undefined}
              rel="noreferrer"
              className="border border-brand/40 px-5 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
            >
              {b.heroCtaLabel}
            </a>
          )}
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            {org.member_count} Mitglieder · gegründet{" "}
            {format(new Date(org.created_at), "MMMM yyyy", { locale: de })}
          </div>
        </div>
      </section>

      {b.aboutText && (
        <section className="border-t border-white/5 py-16">
          <h2 className="font-display text-3xl tracking-tight">{b.aboutTitle}</h2>
          <p className="mt-4 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-foreground/80">
            {b.aboutText}
          </p>
        </section>
      )}

      {b.highlights.length > 0 && (
        <section className="border-t border-white/5 py-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {b.highlights.map((h, i) => (
              <div key={i} className="border border-brand/10 bg-white/[0.02] p-5">
                <div className="font-display text-lg">{h.title}</div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">
                  {h.text}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}

      {b.sections
        .filter((s) => s.enabled)
        .map((s) =>
          s.key === "fleet" ? (
            <FleetTeaser key={s.key} slug={org.slug} section={s} />
          ) : s.key === "calendar" ? (
            <CalendarTeaser key={s.key} slug={org.slug} section={s} />
          ) : (
            <ShopTeaser key={s.key} slug={org.slug} section={s} />
          ),
        )}
    </main>
  );
}

function SectionHeader({
  tag,
  title,
  subtitle,
  href,
  cta,
}: {
  tag: string;
  title: string;
  subtitle?: string;
  href: string;
  cta: string;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="mb-2 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // {tag}
          </div>
        </div>
        <h2 className="font-display text-4xl tracking-tight md:text-5xl">{title}</h2>
        {subtitle && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      <a
        href={href}
        className="border border-brand/40 px-4 py-2 font-mono text-[10px] uppercase tracking-[0.2em] font-bold text-brand hover:bg-brand hover:text-primary-foreground"
      >
        {cta}
      </a>
    </div>
  );
}

function FleetTeaser({ slug, section }: { slug: string; section: ResolvedSection }) {
  const fn = useServerFn(listPublicOrgFleet);
  const q = useQuery({
    queryKey: ["public-org-fleet", slug],
    queryFn: () => fn({ data: { slug } }),
  });
  const ships = (q.data?.ships ?? []).slice(0, 8);
  return (
    <section className="border-t border-white/5 py-20">
      <SectionHeader
        tag={section.tag}
        title={section.title}
        subtitle={section.subtitle}
        href={`/o/${slug}/flotte`}
        cta={section.cta}
      />
      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : ships.length === 0 ? (
        <div className="border border-dashed border-brand/20 p-12 text-center font-mono text-xs text-muted-foreground">
          // noch keine Schiffe registriert
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ships.map((s) => (
            <div
              key={s.slug}
              className="group relative flex flex-col border border-brand/10 bg-gradient-to-br from-background via-background to-black/40"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-black">
                {s.image ? (
                  <img
                    src={s.image}
                    alt={s.name}
                    loading="lazy"
                    className="h-full w-full object-cover opacity-90"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground/40">
                    // no image
                  </div>
                )}
                {s.count > 1 && (
                  <div className="absolute right-2 top-2 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] font-bold tracking-[0.2em] text-brand backdrop-blur">
                    ×{s.count}
                  </div>
                )}
              </div>
              <div className="p-3">
                <div className="font-display text-sm">{s.name}</div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground/80">
                  {s.manufacturer ?? ""}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CalendarTeaser({ slug, section }: { slug: string; section: ResolvedSection }) {
  const fn = useServerFn(listPublicOrgMissions);
  const q = useQuery({
    queryKey: ["public-org-missions", slug],
    queryFn: () => fn({ data: { slug } }),
  });
  const events = (q.data?.missions ?? [])
    .filter((m) => m.starts_at)
    .slice(0, 5);
  return (
    <section className="border-t border-white/5 py-20">
      <SectionHeader
        tag={section.tag}
        title={section.title}
        subtitle={section.subtitle}
        href={`/o/${slug}/kalender`}
        cta={section.cta}
      />
      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : events.length === 0 ? (
        <div className="border border-dashed border-brand/20 p-12 text-center font-mono text-xs text-muted-foreground">
          // keine öffentlichen Einsätze
        </div>
      ) : (
        <ul className="divide-y divide-brand/10 border border-brand/10">
          {events.map((ev) => {
            const color = ev.category?.color ?? "#888888";
            const d = new Date(ev.starts_at!);
            return (
              <li key={ev.id}>
                <Link
                  to="/ops/$slug"
                  params={{ slug: ev.slug }}
                  className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-brand/5"
                >
                  <div className="w-20 shrink-0 text-center">
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {format(d, "EEE", { locale: de })}
                    </div>
                    <div className="font-display text-2xl leading-none">{format(d, "d")}</div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {format(d, "MMM yyyy", { locale: de })}
                    </div>
                  </div>
                  <div className="h-10 w-1 shrink-0" style={{ backgroundColor: color }} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{ev.title}</div>
                    <div className="mt-0.5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      <span>{format(d, "HH:mm", { locale: de })}</span>
                      {ev.category && (
                        <>
                          <span>·</span>
                          <span style={{ color }}>{ev.category.name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function ShopTeaser({ slug, section }: { slug: string; section: ResolvedSection }) {
  const fn = useServerFn(listPublicOrgShop);
  const q = useQuery({
    queryKey: ["public-org-shop", slug],
    queryFn: () => fn({ data: { slug } }),
  });
  const groups = (q.data?.groups ?? []).slice(0, 6);
  return (
    <section className="border-t border-white/5 py-20">
      <SectionHeader
        tag={section.tag}
        title={section.title}
        subtitle={section.subtitle}
        href={`/o/${slug}/shop`}
        cta={section.cta}
      />
      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : groups.length === 0 ? (
        <div className="border border-dashed border-brand/20 p-12 text-center font-mono text-xs text-muted-foreground">
          // aktuell keine Angebote
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((g) => (
            <div key={g.key} className="flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <h3 className="text-sm font-semibold">{g.item_name}</h3>
              {g.category && (
                <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{g.category}</div>
              )}
              <div className="mt-3 flex items-end justify-between">
                <div className="text-xs text-muted-foreground">
                  {g.available_qty} {g.unit} verfügbar
                </div>
                <div className="text-sm font-semibold text-brand">
                  {g.min_unit_price === g.max_unit_price
                    ? g.min_unit_price.toLocaleString("de-DE")
                    : `${g.min_unit_price.toLocaleString("de-DE")}–${g.max_unit_price.toLocaleString("de-DE")}`}{" "}
                  <span className="text-[10px] text-muted-foreground">aUEC / {g.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}