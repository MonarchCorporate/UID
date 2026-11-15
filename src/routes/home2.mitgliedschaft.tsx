import { createFileRoute, Link } from "@tanstack/react-router";
import joinImg from "@/assets/uid-join.jpg";
import { UidCta } from "@/components/uid/UidCta";
import { BulletList, InfoCard, Prose, Section, SectionHeader } from "@/components/uid/UidUI";
import {
  benefits,
  membershipChecks,
  noObligations,
  platformBenefits,
  platformIntro,
  smallOrgs,
  suitableOrgs,
} from "@/components/uid/content";

const title = "Mitgliedschaft — United Imperial Dominion";
const description =
  "Für welche Organisationen der UID-Community geeignet ist, welche Vorteile eine Mitgliedschaft bringt und wie der Aufnahmeprozess abläuft.";

export const Route = createFileRoute("/home2/mitgliedschaft")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: UidMembership,
});

function UidMembership() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={joinImg}
          alt="Crew im Hangar vor einem Schiff"
          width={1600}
          height={912}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <SectionHeader
            label="Mitgliedschaft"
            title="Für welche Organisationen ist die UID geeignet?"
            intro={[
              "Die United Imperial Dominion richtet sich an aktive Organisationen, die ihre Möglichkeiten erweitern möchten, ohne ihre Eigenständigkeit aufzugeben.",
            ]}
          />
        </div>
      </section>

      <Section backdrop="stars">
        <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-brand">Geeignet sind unter anderem:</p>
        <div className="mt-4">
          <BulletList items={suitableOrgs} cols={3} />
        </div>
        <div className="mt-8">
          <Prose
            paragraphs={[
              "Entscheidend ist nicht ausschließlich die Größe einer Organisation.",
              "Wichtiger sind Aktivität, Verlässlichkeit, Kooperationsbereitschaft und die Bereitschaft, bei gemeinsamen Vorhaben Verantwortung zu übernehmen.",
            ]}
          />
        </div>
      </Section>

      <Section tone="band" backdrop="aurora">
        <SectionHeader label="Nutzen" title="Vorteile für Mitgliedsorganisationen" center />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {benefits.map((b) => (
            <InfoCard key={b.title} title={b.title}>
              <p>{b.body}</p>
            </InfoCard>
          ))}
        </div>
      </Section>

      <Section id="backoffice" backdrop="stars">
        <SectionHeader label="Plattform" title="Das UID-Backoffice" intro={platformIntro} />
        <div className="mt-10 grid gap-px bg-brand/15 sm:grid-cols-2 lg:grid-cols-3">
          {platformBenefits.map((p) => (
            <div key={p.n} className="group bg-background p-6 transition-colors hover:bg-card">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">{p.n}</div>
              <h3 className="mt-3 font-display text-sm uppercase tracking-[0.2em] text-foreground transition-colors group-hover:text-brand">
                {p.title}
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section id="bewerbung" backdrop="stars">
        <SectionHeader
          label="Aufnahme"
          title="Mitgliedschaft"
          intro={[
            "Organisationen können sich um eine Aufnahme in die United Imperial Dominion bewerben.",
            "Im Rahmen des Aufnahmeprozesses lernen wir die Organisation, ihre Ausrichtung und ihre Verantwortlichen kennen.",
          ]}
        />
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          Dabei prüfen wir insbesondere:
        </p>
        <div className="mt-4">
          <BulletList items={membershipChecks} cols={2} />
        </div>
        <div className="mt-8">
          <Prose
            paragraphs={[
              "Nach einer erfolgreichen Aufnahme wird die Organisation in die Kommunikations- und Koordinationsstrukturen der UID integriert.",
            ]}
          />
        </div>
        <div className="mt-8">
          <Link
            to="/bewerbung"
            className="inline-block bg-brand px-6 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground transition-opacity hover:opacity-90"
          >
            Mitgliedschaft beantragen
          </Link>
        </div>
      </Section>

      <Section tone="band" backdrop="aurora">
        <SectionHeader
          label="Größe"
          title="Keine Organisation ist zu klein, um einen Unterschied zu machen"
          intro={smallOrgs}
        />
      </Section>

      <Section backdrop="stars">
        <SectionHeader
          label="Freiwilligkeit"
          title="Keine Verpflichtungen"
          intro={noObligations}
        />
      </Section>

      <UidCta />
    </>
  );
}