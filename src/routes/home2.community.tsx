import { createFileRoute } from "@tanstack/react-router";
import councilImg from "@/assets/uid-council.jpg";
import { UidCta } from "@/components/uid/UidCta";
import { BulletList, Prose, Quote, Section, SectionHeader } from "@/components/uid/UidUI";
import {
  communityGoals,
  autonomy,
  intro,
  missionIntro,
  missionPoints,
  noObligations,
  orgKeeps,
  whatIsUid,
  whatIsUidOutro,
} from "@/components/uid/content";

const title = "Die Community — United Imperial Dominion";
const description =
  "Was die United Imperial Dominion als Community ist, welche Mission sie verfolgt und warum jede Mitgliedsorganisation vollständig eigenständig und freiwillig bleibt.";

export const Route = createFileRoute("/home2/community")({
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
  component: UidCommunity,
});

function UidCommunity() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-border">
        <img
          src={councilImg}
          alt="Vertreter mehrerer Organisationen am Strategietisch"
          width={1600}
          height={1104}
          className="absolute inset-0 h-full w-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />
        <div className="relative mx-auto max-w-6xl px-6 py-24">
          <SectionHeader label="Community" title="Was ist die United Imperial Dominion?" intro={whatIsUid} />
        </div>
      </section>

      <Section backdrop="stars">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <Prose paragraphs={intro} />
          </div>
          <div>
            <Prose paragraphs={communityGoals} />
          </div>
        </div>
        <div className="mt-14">
          <Quote>Viele Organisationen. Eine gemeinsame Stärke.</Quote>
        </div>
      </Section>

      <Section tone="band" backdrop="aurora">
        <SectionHeader label="Mission" title="Unsere Mission" intro={missionIntro} />
        <p className="mt-8 font-mono text-[11px] uppercase tracking-[0.3em] text-brand">
          Unsere Mission ist es:
        </p>
        <div className="mt-4">
          <BulletList items={missionPoints} />
        </div>
      </Section>

      <Section backdrop="stars">
        <SectionHeader label="Souveränität" title="Jede Organisation behält" />
        <div className="mt-8">
          <BulletList items={orgKeeps} cols={3} />
        </div>
        <div className="mt-10">
          <Prose paragraphs={whatIsUidOutro} />
        </div>
      </Section>

      <Section tone="band" backdrop="aurora">
        <SectionHeader label="Unabhängigkeit" title="Eigenständigkeit bleibt erhalten" intro={autonomy} />
      </Section>

      <Section backdrop="stars">
        <SectionHeader label="Freiwilligkeit" title="Keine Verpflichtungen" intro={noObligations} />
      </Section>

      <UidCta />
    </>
  );
}