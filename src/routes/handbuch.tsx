import { createFileRoute } from "@tanstack/react-router";
import { UidPage, UidPageHeader } from "@/components/uid/UidPage";
import { HandbuchSections } from "@/components/uid/HandbuchSections";
import { HANDBUCH_CHAPTERS, HANDBUCH_FAQ } from "@/components/uid/handbuch-content";

const title = "Handbuch — Backoffice & Discord-Bot der United Imperial Dominion";
const description =
  "Alle Funktionen im Überblick: Einsatzplanung, Flotte, Crafting, Orgalager, Handel sowie die Discord-Bot-Möglichkeiten für Orgamitglieder.";
const url = "https://uid.sc/handbuch";

export const Route = createFileRoute("/handbuch")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { property: "og:url", content: url },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: url }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: HANDBUCH_FAQ.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: HandbuchPage,
});

function HandbuchPage() {
  return (
    <UidPage backdrop="grid" seed={412}>
      <div className="mx-auto max-w-6xl px-6 pb-12 pt-16">
        <UidPageHeader
          label="Handbuch"
          title={
            <>
              Was das Backoffice und der
              <br className="hidden md:block" /> Discord-Bot können
            </>
          }
          intro={`Eine offene Übersicht über alle Werkzeuge der United Imperial Dominion – von der Einsatzplanung bis zur Discord-Automatisierung. ${HANDBUCH_CHAPTERS.length} Kapitel, verständlich erklärt.`}
        />
      </div>
      <HandbuchSections />
    </UidPage>
  );
}
