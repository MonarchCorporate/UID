import { createFileRoute, Link, Outlet, notFound, useLocation } from "@tanstack/react-router";
import { useEffect } from "react";
import { getPublicOrg, type PublicOrg } from "@/lib/public-org.functions";
import logo from "@/assets/idcp-logo.png.asset.json";
import { resolveBranding } from "@/lib/org-branding";
import { applyBrandVars } from "@/lib/brand-vars";

export const Route = createFileRoute("/o/$slug")({
  loader: async ({ params }) => {
    const org = await getPublicOrg({ data: { slug: params.slug } });
    if (!org) throw notFound();
    return { org };
  },
  head: ({ loaderData }) => {
    if (!loaderData) {
      return {
        meta: [
          { title: "Orga nicht gefunden" },
          { name: "robots", content: "noindex" },
        ],
      };
    }
    const { org } = loaderData;
    const title = `${org.name}${org.tag ? ` [${org.tag}]` : ""}`;
    const desc =
      org.branding.hero_subtitle?.trim() ||
      `${org.name} · Star Citizen Community · Flotte, Einsätze und Shop.`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
      ],
    };
  },
  errorComponent: OrgError,
  notFoundComponent: OrgNotFound,
  component: OrgLayout,
});

function OrgLayout() {
  const { org } = Route.useLoaderData();
  const b = resolveBranding(org.branding, { name: org.name });
  const primary = b.primary;
  const accent = b.accent;

  useEffect(() => applyBrandVars(primary, accent), [primary, accent]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <OrgNav org={org} />
      <Outlet />
      <OrgFooter org={org} />
    </div>
  );
}

function OrgNav({ org }: { org: PublicOrg }) {
  const loc = useLocation();
  const base = `/o/${org.slug}`;
  const b = resolveBranding(org.branding, { name: org.name });
  const logoSrc = b.logoUrl || logo.url;
  const paths: Record<string, string> = {
    fleet: `${base}/flotte`,
    calendar: `${base}/kalender`,
    shop: `${base}/shop`,
  };
  const items: Array<{ to: string; label: string; exact?: boolean }> = [
    { to: base, label: "Start", exact: true },
    ...b.sections
      .filter((s) => s.enabled)
      .map((s) => ({ to: paths[s.key], label: s.label })),
  ];

  return (
    <nav className="sticky top-0 z-40 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <Link to="/o/$slug" params={{ slug: org.slug }} className="flex items-center gap-3">
          <img
            src={logoSrc}
            alt={org.name}
            className="size-9 rounded object-contain"
            width={36}
            height={36}
          />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm tracking-[0.2em] text-foreground">
              {org.name}
            </span>
            {org.tag && (
              <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
                [{org.tag}]
              </span>
            )}
          </div>
        </Link>
        <div className="hidden items-center gap-6 md:flex">
          {items.map((i) => {
            const active = i.exact
              ? loc.pathname === i.to
              : loc.pathname === i.to || loc.pathname.startsWith(i.to + "/");
            return (
              <a
                key={i.to}
                href={i.to}
                className={`text-[11px] uppercase tracking-[0.2em] transition-colors ${
                  active ? "text-brand" : "text-muted-foreground hover:text-brand"
                }`}
              >
                {i.label}
              </a>
            );
          })}
        </div>
        <Link
          to="/dashboard"
          className="border border-white/15 px-4 py-2 text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground hover:border-brand/40 hover:text-brand"
        >
          Backoffice
        </Link>
      </div>
    </nav>
  );
}

function OrgFooter({ org }: { org: PublicOrg }) {
  const b = resolveBranding(org.branding, { name: org.name });
  const links = [
    { href: b.discordUrl, label: "Discord" },
    { href: b.rsiUrl, label: "RSI" },
    { href: b.websiteUrl, label: "Website" },
  ].filter((l): l is { href: string; label: string } => !!l.href);
  return (
    <footer className="mt-24 border-t border-white/5 py-8">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        <span>
          © {new Date().getFullYear()} {org.name}
          {b.footerNote ? ` · ${b.footerNote}` : ""}
        </span>
        {links.length > 0 && (
          <span className="flex flex-wrap gap-4">
            {links.map((l) => (
              <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className="hover:text-brand">
                {l.label}
              </a>
            ))}
          </span>
        )}
        <Link to="/" className="hover:text-brand">
          powered by United Imperial Dominion
        </Link>
      </div>
    </footer>
  );
}

function OrgNotFound() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
      <div className="text-center">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
          // 404
        </div>
        <h1 className="mt-2 font-display text-4xl">Organisation nicht gefunden</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Diese Organisation existiert nicht oder ist deaktiviert.
        </p>
        <Link
          to="/"
          className="mt-6 inline-block border border-brand/40 px-4 py-2 text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
        >
          Zur Startseite
        </Link>
      </div>
    </div>
  );
}

function OrgError({ error }: { error: Error }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-foreground">
      <div>
        <h1 className="font-display text-2xl">Fehler beim Laden</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
      </div>
    </div>
  );
}