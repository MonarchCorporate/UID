import { Link } from "@tanstack/react-router";
import joinImg from "@/assets/uid-join.jpg";
import { UID_DISCORD, joinOutro, joinQuestions } from "./content";
import { SectionLabel } from "./UidUI";

export function UidCta() {
  return (
    <section id="kontakt" className="relative scroll-mt-24 overflow-hidden border-t border-border">
      <img
        src={joinImg}
        alt="Hangar der Community bei Nacht"
        loading="lazy"
        width={1600}
        height={912}
        className="absolute inset-0 h-full w-full object-cover opacity-35"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/85 to-background/60" />
      <div className="relative mx-auto max-w-6xl px-6 py-24">
        <SectionLabel>Kontakt</SectionLabel>
        <h2 className="mt-4 font-display text-2xl tracking-tight text-foreground md:text-4xl">
          Werde Teil der United Imperial Dominion
        </h2>
        <ul className="mt-6 space-y-2">
          {joinQuestions.map((q) => (
            <li key={q} className="text-sm text-muted-foreground md:text-base">
              {q}
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-1">
          {joinOutro.map((p) => (
            <p key={p} className="text-sm text-foreground/90 md:text-base">
              {p}
            </p>
          ))}
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            to="/home2/mitgliedschaft"
            hash="bewerbung"
            className="bg-brand px-6 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground transition-opacity hover:opacity-90"
          >
            Zur Community bewerben
          </Link>
          <Link
            to="/bewerbung"
            className="border border-brand/50 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-brand transition-colors hover:bg-brand hover:text-primary-foreground"
          >
            Mitgliedschaft beantragen
          </Link>
          <a
            href={UID_DISCORD}
            target="_blank"
            rel="noreferrer"
            className="border border-border px-6 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-muted-foreground transition-colors hover:border-brand/50 hover:text-brand"
          >
            Discord beitreten
          </a>
        </div>
      </div>
    </section>
  );
}