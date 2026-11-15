import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listPublicOrgs } from "@/lib/public-org.functions";
import uidLogo from "@/assets/uid-logo.png.asset.json";

export function UidOrgMarquee() {
  const fn = useServerFn(listPublicOrgs);
  const { data } = useQuery({
    queryKey: ["public-orgs-marquee"],
    queryFn: () => fn(),
    staleTime: 5 * 60 * 1000,
  });
  const orgs = data?.orgs ?? [];
  if (orgs.length === 0) return null;
  const loop = orgs.length < 6 ? [...orgs, ...orgs, ...orgs, ...orgs] : [...orgs, ...orgs];

  return (
    <div className="mt-10">
      <p className="text-center font-mono text-[10px] uppercase tracking-[0.35em] text-brand/70">
        // Mitgliedsorganisationen
      </p>
      <div className="pb-marquee-mask mt-6 overflow-hidden">
        <div className="pb-marquee gap-4">
          {loop.map((o, i) => (
            <Link
              key={`${o.id}-${i}`}
              to="/o/$slug"
              params={{ slug: o.slug }}
              aria-label={`Landingpage von ${o.name}`}
              className="uid-focus group flex w-[220px] shrink-0 items-center gap-3 border border-brand/20 bg-card/40 px-4 py-3 transition-colors hover:border-brand/60 hover:bg-card/70"
            >
              <img
                src={o.logoUrl || uidLogo.url}
                alt={`Logo ${o.name}`}
                loading="lazy"
                width={48}
                height={48}
                className="h-10 w-10 shrink-0 object-contain transition-transform duration-500 group-hover:scale-110"
              />
              <span className="min-w-0">
                <span className="block truncate font-display text-sm tracking-tight text-foreground">
                  {o.name}
                </span>
                {o.tag && (
                  <span className="block font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
                    [{o.tag}]
                  </span>
                )}
                <span className="block font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
                  {o.member_count === 1 ? "1 Mitglied" : `${o.member_count} Mitglieder`}
                </span>

              </span>

            </Link>
          ))}
        </div>
      </div>
      <div className="mt-8 flex justify-center">
        <Link
          to="/home2/orgas"
          className="uid-focus inline-flex items-center gap-2 border border-brand/40 bg-brand/10 px-6 py-3 font-mono text-[11px] uppercase tracking-[0.3em] text-brand transition-colors hover:border-brand hover:bg-brand/20"
        >
          Die Community der UID
          <span aria-hidden>→</span>
        </Link>
      </div>
    </div>
  );
}
