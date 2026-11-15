import { Link } from "@tanstack/react-router";
import { UidCta } from "@/components/uid/UidCta";
import { UidHero } from "@/components/uid/UidHero";
import { UidCountUp } from "@/components/uid/UidCountUp";
import { UidOrgMarquee } from "@/components/uid/UidOrgMarquee";
import { UidBackofficeShowcase } from "@/components/uid/UidBackofficeShowcase";
import { UidHandbuchTeaser } from "@/components/uid/UidHandbuchTeaser";
import { Section, SectionHeader } from "@/components/uid/UidUI";
import { stagger } from "@/components/uid/UidBento";
import {
  UID_MOTTO,
  benefits,
  domains,
  missionIntro,
  opComponents,
} from "@/components/uid/content";

const stats = [
  { v: "7", l: "Einsatzbereiche" },
  { v: "100%", l: "Eigenständigkeit" },
  { v: "1", l: "Gemeinsames Backoffice" },
];

export function UidHomeSections() {
  return (
    <>
      <UidHero />

      {/* 01 — Auftrag kompakt: Claim + Kennzahlen */}
      <Section compact tone="band" backdrop="aurora" seed={101}>
        <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
          <div>
            <SectionHeader
              label="Auftrag"
              title="Viele Organisationen. Eine gemeinsame Community."
              intro={[missionIntro[0]]}
            />
            <div className="mt-6 flex flex-wrap gap-2">
              {opComponents.slice(0, 6).map((c, i) => (
                <span
                  key={c}
                  style={{ ["--d" as string]: stagger(i, 140, 45) }}
                  className="uid-chip uid-item border border-brand/25 bg-card/50 px-3 py-1.5 text-xs text-foreground/85"
                >
                  {c}
                </span>
              ))}
            </div>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link
                to="/bewerbung"
                className="uid-btn uid-focus bg-brand px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground hover:opacity-90"
              >
                Mitglied werden
              </Link>
              <Link
                to="/home2/community"
                className="uid-btn uid-focus border border-brand/50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.25em] text-brand hover:bg-brand hover:text-primary-foreground"
              >
                Über die Community
              </Link>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {stats.map((s, i) => (
              <div
                key={s.l}
                style={{ ["--d" as string]: stagger(i, 120, 70) }}
                className="uid-item uid-card rounded-lg p-5 text-center"
              >
                <div className="font-display text-3xl text-foreground md:text-4xl">
                  <UidCountUp value={s.v} />
                </div>
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
                  {s.l}
                </p>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 02 — Einsatzbereiche kompakt */}
      <Section compact tone="deep" backdrop="grid" seed={303}>
        <SectionHeader label="Divisionen" title="Unsere Einsatzbereiche" center />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {domains.map((d, i) => (
            <Link
              key={d.id}
              to="/home2/einsatzbereiche"
              hash={d.id}
              style={{ ["--d" as string]: stagger(i, 100, 55) }}
              className="uid-item uid-card uid-focus group rounded-lg p-5"
            >
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">{d.n}</div>
              <h3 className="mt-2 font-display text-xs uppercase tracking-[0.14em] text-foreground transition-colors group-hover:text-brand">
                {d.title}
              </h3>
              <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
                {d.lead[0]}
              </p>
            </Link>
          ))}
        </div>
      </Section>

      {/* 03 — Vorteile kompakt */}
      <Section compact tone="band" backdrop="stars" seed={505}>
        <SectionHeader label="Nutzen" title="Vorteile für Mitgliedsorganisationen" center />
        <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.slice(0, 6).map((b, i) => (
            <div
              key={b.title}
              style={{ ["--d" as string]: stagger(i, 100, 55) }}
              className="uid-item uid-card rounded-lg p-5"
            >
              <h3 className="font-display text-xs uppercase tracking-[0.14em] text-foreground">
                {b.title}
              </h3>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{b.body}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* 04 — Backoffice-Showcase (bleibt erhalten) */}
      <UidBackofficeShowcase />

      {/* 05 — Handbuch-Teaser */}
      <UidHandbuchTeaser />

      {/* 06 — Organisationen */}
      <Section compact tone="deep" backdrop="aurora" seed={909}>
        <SectionHeader
          label="Community"
          title="Die Organisationen der UID"
          intro={["Eigenständig geführt, gemeinsam stark — jede Mitgliedsorganisation mit eigener Landingpage."]}
          center
        />
        <UidOrgMarquee />
        <div className="uid-item mt-12 text-center" style={{ ["--d" as string]: "320ms" }}>
          <div className="font-display text-lg tracking-[0.2em] text-foreground md:text-2xl">
            UNITED IMPERIAL DOMINION
          </div>
          <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">{UID_MOTTO}</p>
        </div>
      </Section>

      <UidCta />
    </>
  );
}