import { createFileRoute } from "@tanstack/react-router";
import aresIdris from "@/assets/hero-ares-idris.jpg.asset.json";
import { UidCta } from "@/components/uid/UidCta";
import { BulletList, Prose, Section, SectionHeader } from "@/components/uid/UidUI";
import { jointOps, opComponents, poolingIntro, poolingQuestions } from "@/components/uid/content";

const title = "Gemeinsame Operationen — United Imperial Dominion";
const description =
  "Wie Operationen über Organisationen hinweg entstehen, koordiniert werden und wie Mitglieder freiwillig fehlende Kapazitäten ergänzen.";

export const Route = createFileRoute("/home2/operationen")({
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
  component: UidOperations,
});

const steps = [
  {
    n: "01",
    t: "Vorhaben vorstellen",
    b: "Die Community oder eine Mitgliedsorganisation schlägt eine Operation vor und stellt sie der Community vor.",
  },
  {
    n: "02",
    t: "Kräfte anmelden",
    b: "Passende Organisationen beteiligen sich freiwillig und melden ihre verfügbaren Kräfte an. Niemand ist verpflichtet teilzunehmen.",
  },
  {
    n: "03",
    t: "Koordination",
    b: "Aufgaben, Zuständigkeiten und Ressourcen werden abgestimmt und einer klaren Einsatzleitung zugeordnet.",
  },
  {
    n: "04",
    t: "Durchführung",
    b: "Jede Organisation übernimmt den Bereich, in dem sie besonders leistungsfähig ist.",
  },
];

function UidOperations() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={aresIdris.url}
          alt="Gemeinsamer Flottenverband im Orbit"
          width={3840}
          height={2160}
          className="absolute inset-0 h-full w-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <SectionHeader label="Operationen" title="Gemeinsame Operationen" intro={jointOps} />
        </div>
      </section>

      <Section backdrop="stars">
        <SectionHeader label="Ablauf" title="Von der Idee zum Einsatz" />
        <div className="mt-10 grid gap-px bg-brand/15 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((s) => (
            <div key={s.n} className="bg-background p-6">
              <div className="grid size-10 place-items-center border border-brand/40 font-display text-sm text-brand">
                {s.n}
              </div>
              <h3 className="mt-4 font-display text-xs uppercase tracking-[0.25em] text-foreground">{s.t}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{s.b}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section tone="band" backdrop="aurora">
        <SectionHeader
          label="Komponenten"
          title="Ein gemeinsamer Einsatz kann bestehen aus"
          intro={["Jede Organisation übernimmt den Bereich, in dem sie besonders leistungsfähig ist."]}
        />
        <div className="mt-8">
          <BulletList items={opComponents} cols={2} />
        </div>
      </Section>

      <Section backdrop="stars">
        <SectionHeader label="Netzwerk" title="Ressourcen bündeln" intro={poolingIntro} />
        <div className="mt-8 grid gap-3 sm:grid-cols-2">
          {poolingQuestions.map((q) => (
            <div key={q} className="uid-card p-5 text-sm text-foreground/90">
              {q}
            </div>
          ))}
        </div>
        <div className="mt-8">
          <Prose
            paragraphs={[
              "Innerhalb der UID können passende Partner gefunden und gemeinsame Lösungen aufgebaut werden.",
            ]}
          />
        </div>
      </Section>

      <UidCta />
    </>
  );
}