import type { ResolvedBranding } from "@/lib/org-branding";

/**
 * Statische Nachbildung von Navigation und Footer der öffentlichen Orga-Seite
 * (`/o/:slug`) für die Backoffice-Vorschau. Bewusst ohne Router-Links, damit
 * die Vorschau nicht navigiert – Markup und Klassen sind identisch.
 */
export function OrgPreviewNav({
  org,
  b,
  logoSrc,
}: {
  org: { name: string; tag: string | null; slug: string };
  b: ResolvedBranding;
  logoSrc: string;
}) {
  const items = [
    { label: "Start", active: true },
    ...b.sections.filter((s) => s.enabled).map((s) => ({ label: s.label, active: false })),
  ];
  return (
    <nav className="w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <img
            src={logoSrc}
            alt={org.name}
            className="size-9 rounded object-contain"
            width={36}
            height={36}
          />
          <div className="flex flex-col leading-tight">
            <span className="font-display text-sm tracking-[0.2em] text-foreground">{org.name}</span>
            {org.tag && (
              <span className="font-mono text-[10px] tracking-[0.3em] text-muted-foreground">
                [{org.tag}]
              </span>
            )}
          </div>
        </div>
        <div className="hidden items-center gap-6 md:flex">
          {items.map((i) => (
            <span
              key={i.label}
              className={`text-[11px] uppercase tracking-[0.2em] ${
                i.active ? "text-brand" : "text-muted-foreground"
              }`}
            >
              {i.label}
            </span>
          ))}
        </div>
        <span className="border border-white/15 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground">
          Backoffice
        </span>
      </div>
    </nav>
  );
}

export function OrgPreviewFooter({
  org,
  b,
}: {
  org: { name: string };
  b: ResolvedBranding;
}) {
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
              <span key={l.label}>{l.label}</span>
            ))}
          </span>
        )}
        <span>powered by United Imperial Dominion</span>
      </div>
    </footer>
  );
}
