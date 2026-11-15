import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ListTree } from "lucide-react";
import { uidBtn } from "./UidPage";
import { SectionLabel } from "./UidUI";
import {
  HANDBUCH_CHAPTERS,
  HANDBUCH_FAQ,
  HANDBUCH_INTRO,
  HANDBUCH_METRICS,
  type Audience,
  type HandbuchChapter,
  type Surface,
} from "./handbuch-content";

export const DISCORD_INVITE = "https://discord.gg/QMvCtbjyqe";

const audienceCls: Record<Audience, string> = {
  Mitglied: "border-brand/40 text-brand",
  Orgaleitung: "border-accent/50 text-accent",
  Admin: "border-border text-muted-foreground",
};

function Badge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`border px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.18em] ${className}`}
    >
      {children}
    </span>
  );
}

function SurfaceBadge({ surface }: { surface: Surface }) {
  return <Badge className="border-border/70 text-muted-foreground">{surface}</Badge>;
}

/** Mitlaufende Kapitelübersicht (Desktop) bzw. aufklappbares Menü (Mobil). */
function TableOfContents({ active }: { active: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="mb-6 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between border border-border bg-card/40 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <ListTree className="size-4 text-brand" />
            Inhalt
          </span>
          <ChevronDown
            className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
          />
        </button>
        {open && (
          <ul className="border border-t-0 border-border bg-card/40 p-2">
            {HANDBUCH_CHAPTERS.map((c) => (
              <li key={c.id}>
                <a
                  href={`#${c.id}`}
                  onClick={() => setOpen(false)}
                  className="block px-3 py-2 text-xs text-muted-foreground hover:text-brand"
                >
                  <span className="mr-2 font-mono text-[10px] text-brand">{c.nr}</span>
                  {c.title}
                </a>
              </li>
            ))}
            <li>
              <a
                href="#faq"
                onClick={() => setOpen(false)}
                className="block px-3 py-2 text-xs text-muted-foreground hover:text-brand"
              >
                <span className="mr-2 font-mono text-[10px] text-brand">10</span>
                Häufige Fragen
              </a>
            </li>
          </ul>
        )}
      </div>

      <nav className="hidden lg:block">
        <div className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">Inhalt</div>
        <ul className="space-y-1 border-l border-border">
          {[...HANDBUCH_CHAPTERS.map((c) => ({ id: c.id, nr: c.nr, title: c.short })), {
            id: "faq",
            nr: "10",
            title: "Häufige Fragen",
          }].map((c) => (
            <li key={c.id}>
              <a
                href={`#${c.id}`}
                className={`-ml-px flex items-center gap-2 border-l py-1.5 pl-4 text-xs transition-colors ${
                  active === c.id
                    ? "border-brand text-brand"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="font-mono text-[10px] opacity-70">{c.nr}</span>
                {c.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}

function Chapter({ chapter }: { chapter: HandbuchChapter }) {
  return (
    <section id={chapter.id} className="scroll-mt-28">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-brand">{chapter.nr}</span>
        <h2 className="font-display text-2xl tracking-tight text-foreground md:text-3xl">
          {chapter.title}
        </h2>
      </div>
      <p className="mt-3 max-w-3xl text-sm leading-relaxed text-muted-foreground">{chapter.intro}</p>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {chapter.points.map((p) => (
          <article
            key={p.title}
            className="border border-border bg-card/40 p-5 backdrop-blur-sm transition-colors hover:border-brand/40"
          >
            <h3 className="font-display text-base text-foreground">{p.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.text}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {p.audience.map((a) => (
                <Badge key={a} className={audienceCls[a]}>
                  {a}
                </Badge>
              ))}
              <SurfaceBadge surface={p.surface} />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section id="faq" className="scroll-mt-28">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-xs text-brand">10</span>
        <h2 className="font-display text-2xl tracking-tight text-foreground md:text-3xl">
          Häufige Fragen
        </h2>
      </div>
      <div className="mt-6 divide-y divide-border border border-border bg-card/40 backdrop-blur-sm">
        {HANDBUCH_FAQ.map((item) => (
          <details key={item.q} className="group p-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-medium text-foreground">
              {item.q}
              <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Öffentliche Funktionsübersicht: Backoffice, Discord-Bot und Mitglieder-Möglichkeiten. */
export function HandbuchSections() {
  const [active, setActive] = useState(HANDBUCH_CHAPTERS[0]!.id);

  useEffect(() => {
    const ids = [...HANDBUCH_CHAPTERS.map((c) => c.id), "faq"];
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-120px 0px -60% 0px", threshold: 0 },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      <div className="grid gap-6 border border-border bg-card/40 p-6 backdrop-blur-sm sm:grid-cols-3">
        {HANDBUCH_METRICS.map((m) => (
          <div key={m.label}>
            <div className="font-display text-3xl text-brand">{m.value}</div>
            <div className="mt-1 font-mono text-[10px] uppercase tracking-[0.22em] text-foreground">
              {m.label}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{m.hint}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className={uidBtn}>
          Discord beitreten
        </a>
        <Link to="/bewerbung" className={uidBtn}>
          Bewerben
        </Link>
        <Link to="/login" className={uidBtn}>
          Zum Backoffice
        </Link>
      </div>

      <div className="mt-14 grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-14">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <TableOfContents active={active} />
        </div>

        <div className="min-w-0 space-y-16">
          <section className="border border-brand/20 bg-card/30 p-6 backdrop-blur-sm">
            <SectionLabel>Einstieg</SectionLabel>
            <h2 className="mt-3 font-display text-xl text-foreground">Was ist das Backoffice?</h2>
            {HANDBUCH_INTRO.map((p) => (
              <p key={p} className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Diese Seite listet auf, was möglich ist und wer es nutzen darf. Die Kennzeichnung an jedem Punkt
              zeigt die Zielgruppe (Mitglied, Orgaleitung, Admin) und ob die Funktion im Backoffice, auf Discord
              oder öffentlich auf der Website stattfindet.
            </p>
          </section>

          {HANDBUCH_CHAPTERS.map((c) => (
            <Chapter key={c.id} chapter={c} />
          ))}

          <Faq />

          <section className="border border-brand/30 bg-card/40 p-8 text-center backdrop-blur-sm">
            <h2 className="font-display text-xl text-foreground">Bereit mitzufliegen?</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Tritt unserem Discord bei, verifiziere deinen RSI-Account und du hast Zugriff auf alle Werkzeuge
              deiner Organisation.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <a href={DISCORD_INVITE} target="_blank" rel="noreferrer" className={uidBtn}>
                Discord beitreten
              </a>
              <Link to="/bewerbung" className={uidBtn}>
                Mitglied werden
              </Link>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
