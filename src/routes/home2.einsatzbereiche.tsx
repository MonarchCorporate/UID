import { createFileRoute } from "@tanstack/react-router";
import opsImg from "@/assets/uid-ops.jpg";
import { UidCta } from "@/components/uid/UidCta";
import { BulletList, Prose, Section, SectionHeader } from "@/components/uid/UidUI";
import { domains } from "@/components/uid/content";

const title = "Einsatzbereiche — United Imperial Dominion";
const description =
  "Militär, Handel, Industrie, Logistik, Aufklärung, Medizin und Bergung: die sieben Einsatzbereiche der UID-Community im Detail.";

export const Route = createFileRoute("/home2/einsatzbereiche")({
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
  component: UidDomains,
});

function UidDomains() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={opsImg}
          alt="Konvoi und Industrieanlage im Einsatzgebiet"
          width={1600}
          height={912}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <SectionHeader
            label="Divisionen"
            title="Unsere Einsatzbereiche"
            intro={[
              "Mitgliedsorganisationen bringen ihre Spezialisierung dort ein, wo sie am wirkungsvollsten ist. Sieben Bereiche bilden das Rückgrat gemeinsamer Operationen.",
            ]}
          />
          <nav className="mt-8 flex flex-wrap gap-2">
            {domains.map((d) => (
              <a
                key={d.id}
                href={`#${d.id}`}
                className="border border-brand/25 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:border-brand/60 hover:text-brand"
              >
                {d.n} · {d.title}
              </a>
            ))}
          </nav>
        </div>
      </section>

      {domains.map((d, i) => (
        <Section key={d.id} id={d.id} tone={i % 2 === 1 ? "band" : "deep"} backdrop={i % 2 === 1 ? "aurora" : "stars"} seed={900 + i}>
          <SectionHeader label={d.n} title={d.title} />
          <div className="mt-6 grid gap-10 lg:grid-cols-2">
            <Prose paragraphs={d.lead} />
            <div className="space-y-6">
              {d.bullets && <BulletList items={d.bullets} cols={1} />}
              {d.outro && <Prose paragraphs={d.outro} />}
            </div>
          </div>
        </Section>
      ))}

      <UidCta />
    </>
  );
}