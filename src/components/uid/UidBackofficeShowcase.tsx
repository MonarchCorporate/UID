import { Link } from "@tanstack/react-router";
import {
  CalendarDays,
  Globe,
  Package,
  Radio,
  Rocket,
  TrendingUp,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import backofficeImg from "@/assets/uid-backoffice.jpg";
import { useReveal } from "@/hooks/use-reveal";
import { SectionHeader } from "@/components/uid/UidUI";
import { stagger } from "@/components/uid/UidBento";
import { UidBackofficeDemo } from "@/components/uid/UidBackofficeDemo";
import {
  backofficeHighlights,
  backofficeShowcaseIntro,
  backofficeWhyJoin,
} from "@/components/uid/content";

const icons: Record<string, React.ReactNode> = {
  "01": <Globe className="size-5" />,
  "02": <CalendarDays className="size-5" />,
  "03": <Package className="size-5" />,
  "04": <Radio className="size-5" />,
  "05": <TrendingUp className="size-5" />,
  "06": <Rocket className="size-5" />,
};

export function UidBackofficeShowcase() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="backoffice" className="relative scroll-mt-24 overflow-hidden border-t border-border py-14 md:py-20 uid-deep">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="uid-aurora">
          <span />
          <span />
        </div>
        <div className="uid-grid-bg uid-grid-anim absolute inset-0 opacity-25" />
      </div>

      <div ref={ref} className="uid-reveal relative mx-auto max-w-6xl px-6">
        <SectionHeader
          label="09 // Backoffice"
          title="Ein Werkzeugkasten für eure Organisation"
          intro={backofficeShowcaseIntro}
        />

        <div className="mt-12 grid gap-8 lg:grid-cols-[1.15fr_1fr]">
          {/* Visual */}
          <div
            className="uid-item group relative overflow-hidden rounded-xl border border-border/60 bg-card/40 shadow-xl"
            style={{ ["--d" as string]: "120ms" }}
          >
            <div className="absolute inset-0 bg-gradient-to-t from-background via-background/40 to-transparent" />
            <img
              src={backofficeImg}
              alt="Holografisches Backoffice-Dashboard mit Flottenübersicht und Sternenkarte"
              loading="lazy"
              width={1600}
              height={1000}
              className="h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-105"
            />
            <div className="absolute bottom-0 left-0 right-0 border-t border-brand/20 bg-background/80 p-5 backdrop-blur-sm">
              <div className="flex items-center gap-3">
                <span className="flex size-2 rounded-full bg-brand animate-pulse" />
                <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
                  // Backoffice · Online
                </p>
              </div>
              <p className="mt-1 font-display text-sm tracking-tight text-foreground">
                Alles an einem Ort. Kein externes Hosting nötig.
              </p>
            </div>
          </div>

          {/* Feature cards */}
          <div className="grid gap-4 sm:grid-cols-2">
            {backofficeHighlights.map((f, i) => (
              <div
                key={f.n}
                style={{ ["--d" as string]: stagger(i, 180, 70) }}
                className="uid-item group uid-card rounded-lg p-5"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex shrink-0 items-center justify-center rounded-md border border-brand/25 bg-brand/10 p-2 text-brand transition-colors group-hover:border-brand/50 group-hover:bg-brand/15">
                    {icons[f.n] ?? <Globe className="size-5" />}
                  </span>
                  <div>
                    <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                      {f.n}
                    </div>
                    <h3 className="mt-1 font-display text-xs uppercase tracking-[0.14em] text-foreground transition-colors group-hover:text-brand">
                      {f.title}
                    </h3>
                    <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{f.body}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Why join checklist */}
        <div
          className="uid-item mt-12 grid gap-6 rounded-xl border border-border/60 bg-card/30 p-6 backdrop-blur-sm md:grid-cols-[1fr_auto] md:items-center md:gap-10 md:p-8"
          style={{ ["--d" as string]: "520ms" }}
        >
          <ul className="grid gap-3 sm:grid-cols-2">
            {backofficeWhyJoin.map((item, i) => (
              <li
                key={i}
                style={{ ["--d" as string]: stagger(i, 580, 60) }}
                className="uid-item flex items-start gap-2.5 text-sm text-foreground/85"
              >
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <Link
            to="/home2/mitgliedschaft"
            hash="backoffice"
            className="uid-btn group inline-flex items-center justify-center gap-2 whitespace-nowrap border border-brand/50 px-6 py-3 text-[10px] font-bold uppercase tracking-[0.25em] text-brand transition-all hover:bg-brand hover:text-primary-foreground"
          >
            Alle Vorteile entdecken
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>

      <div className="relative mx-auto mt-14 max-w-6xl px-6">
        <UidBackofficeDemo />
      </div>
    </section>
  );
}
