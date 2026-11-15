import { createFileRoute } from "@tanstack/react-router";
import councilImg from "@/assets/uid-council.jpg";
import { UidCta } from "@/components/uid/UidCta";
import { InfoCard, Section, SectionHeader } from "@/components/uid/UidUI";
import { divisions, principles, structure } from "@/components/uid/content";

const title = "Struktur & Grundsätze — United Imperial Dominion";
const description =
  "Dominion Council, Strategic Command und Operational Divisions: die Struktur der UID-Community und die Grundsätze der freiwilligen Zusammenarbeit.";

export const Route = createFileRoute("/home2/struktur")({
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
  component: UidStructure,
});

function UidStructure() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={councilImg}
          alt="Dominion Council am Strategietisch"
          width={1600}
          height={1104}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <SectionHeader
            label="Struktur"
            title="Struktur der Community"
            intro={[
              "Die UID bleibt bewusst schlank: ein strategisches Gremium, eine koordinierende Ebene und spezialisierte Abteilungen für einzelne Tätigkeitsbereiche.",
            ]}
          />
        </div>
      </section>

      <Section backdrop="stars">
        <div className="grid gap-4 md:grid-cols-3">
          {structure.map((s, i) => (
            <InfoCard key={s.title} title={s.title} eyebrow={`0${i + 1}`}>
              {s.body.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </InfoCard>
          ))}
        </div>
        <div className="mt-10">
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
            Mögliche Bereiche
          </p>
          <div className="grid gap-px bg-brand/15 sm:grid-cols-2 lg:grid-cols-4">
            {divisions.map((d) => (
              <div key={d} className="bg-background px-5 py-4 font-display text-xs uppercase tracking-[0.2em] text-foreground">
                {d}
              </div>
            ))}
          </div>
        </div>
      </Section>

      <Section tone="band" backdrop="aurora">
        <SectionHeader label="Kodex" title="Unsere Grundsätze" center />
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {principles.map((p) => (
            <InfoCard key={p.title} title={p.title}>
              <p>{p.body}</p>
            </InfoCard>
          ))}
        </div>
      </Section>

      <UidCta />
    </>
  );
}