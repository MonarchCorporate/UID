import { Link } from "@tanstack/react-router";
import { Section, SectionHeader } from "@/components/uid/UidUI";
import { UidCountUp } from "@/components/uid/UidCountUp";
import { stagger } from "@/components/uid/UidBento";
import { uidBtn } from "@/components/uid/UidPage";
import { HANDBUCH_CHAPTERS, HANDBUCH_METRICS } from "@/components/uid/handbuch-content";
import { DISCORD_INVITE } from "@/components/uid/HandbuchSections";

function firstSentence(text: string) {
  const m = text.match(/^(.*?[.!?])(?:\s|$)/);
  return m ? m[1] : text;
}

export function UidHandbuchTeaser() {
  return (
    <Section compact tone="band" backdrop="grid" seed={707}>
      <SectionHeader
        label="Handbuch"
        title="Alle Funktionen im Überblick"
        intro={[
          "Backoffice, Discord-Bot und Orga-Werkzeuge – zusammengefasst, verständlich und öffentlich einsehbar.",
        ]}
        center
      />

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {HANDBUCH_METRICS.map((m, i) => (
          <div
            key={m.label}
            style={{ ["--d" as string]: stagger(i, 120, 70) }}
            className="uid-item uid-card rounded-lg p-5 text-center"
          >
            <div className="font-display text-3xl text-foreground md:text-4xl">
              <UidCountUp value={m.value} />
            </div>
            <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.28em] text-muted-foreground">
              {m.label}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {HANDBUCH_CHAPTERS.map((c, i) => (
          <Link
            key={c.id}
            to="/handbuch"
            hash={c.id}
            style={{ ["--d" as string]: stagger(i, 100, 55) }}
            className="uid-item uid-card uid-focus group rounded-lg p-5"
          >
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">{c.nr}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{c.short}</span>
            </div>
            <h3 className="mt-2 font-display text-xs uppercase tracking-[0.14em] text-foreground transition-colors group-hover:text-brand">
              {c.title}
            </h3>
            <p className="mt-2 line-clamp-3 text-xs leading-relaxed text-muted-foreground">
              {firstSentence(c.intro)}
            </p>
          </Link>
        ))}
      </div>

      <div className="uid-item mt-8 flex flex-wrap justify-center gap-3" style={{ ["--d" as string]: "420ms" }}>
        <Link to="/handbuch" className="uid-btn uid-focus bg-brand px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground hover:opacity-90">
          Handbuch öffnen
        </Link>
        <a
          href={DISCORD_INVITE}
          target="_blank"
          rel="noreferrer"
          className={uidBtn}
        >
          Discord beitreten
        </a>
      </div>
    </Section>
  );
}
