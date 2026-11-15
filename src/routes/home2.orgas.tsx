import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicOrgs } from "@/lib/public-org.functions";
import { Section, SectionHeader } from "@/components/uid/UidUI";
import { UidCta } from "@/components/uid/UidCta";
import uidLogo from "@/assets/uid-logo.png.asset.json";

const title = "Die Community der UID — Mitgliedsorganisationen";
const description =
  "Alle Organisationen der United Imperial Dominion im Überblick: Name, Mitgliederzahl, Kurzbeschreibung und direkter Link zur jeweiligen Seite.";

export const Route = createFileRoute("/home2/orgas")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UidOrgs,
});

function UidOrgs() {
  const fn = useServerFn(listPublicOrgs);
  const { data, isLoading } = useQuery({
    queryKey: ["public-orgs-list"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  const orgs = data?.orgs ?? [];

  return (
    <>
      <Section backdrop="stars">
        <SectionHeader
          label="Community"
          title="Die Community der UID"
          intro={["Jede Organisation bleibt eigenständig — gemeinsam bilden sie die United Imperial Dominion."]}
        />

        {isLoading && (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-52 animate-pulse border border-border bg-card/40"
              />
            ))}
          </div>
        )}

        {!isLoading && orgs.length === 0 && (
          <p className="mt-12 font-mono text-sm text-muted-foreground">
            // Noch keine Organisationen registriert.
          </p>
        )}

        {orgs.length > 0 && (
          <div className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {orgs.map((o) => (
              <Link
                key={o.id}
                to="/o/$slug"
                params={{ slug: o.slug }}
                className="uid-focus group flex flex-col border border-brand/20 bg-card/40 p-6 transition-colors hover:border-brand/60 hover:bg-card/70"
              >
                <div className="flex items-center gap-4">
                  <img
                    src={o.logoUrl || uidLogo.url}
                    alt={`Logo ${o.name}`}
                    loading="lazy"
                    width={64}
                    height={64}
                    className="h-14 w-14 shrink-0 object-contain transition-transform duration-500 group-hover:scale-110"
                  />
                  <div className="min-w-0">
                    <h2 className="truncate font-display text-lg tracking-tight text-foreground">
                      {o.name}
                    </h2>
                    <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
                      {o.tag ? `[${o.tag}] · ` : ""}
                      {o.member_count === 1 ? "1 Mitglied" : `${o.member_count} Mitglieder`}
                    </p>
                  </div>
                </div>
                <p className="mt-5 flex-1 text-sm leading-relaxed text-muted-foreground">
                  {o.description ?? "Keine Kurzbeschreibung hinterlegt."}
                </p>
                <span className="mt-6 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
                  Zur Seite <span aria-hidden>→</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </Section>

      <UidCta />
    </>
  );
}
