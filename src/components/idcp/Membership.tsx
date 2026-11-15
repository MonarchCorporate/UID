import pilotsImg from "@/assets/enlist-pilots.jpg";
import cockpitImg from "@/assets/enlist-cockpit.jpg";
import fleetImg from "@/assets/enlist-fleet.jpg";
import { useReveal } from "@/hooks/use-reveal";

const benefits = [
  "Keine Aktivitätspflicht",
  "Kein fester Spielstil vorgeschrieben",
  "Unterstützung für neue Spieler",
  "Gemeinsame Abenteuer",
  "Discord-Community",
];

const stats = [
  { v: "Alle", l: "Erfahrungsstufen" },
  { v: "Täglich", l: "Flotten-Ops" },
  { v: "Global", l: "Zeitzonen" },
  { v: "Alle", l: "Schiffsklassen" },
];

export function Membership() {
  const ref = useReveal<HTMLDivElement>();
  return (
    <section id="membership" className="py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div ref={ref} className="reveal hud-corners glass-panel group relative overflow-hidden p-10 md:p-20">
          <div className="absolute -top-24 -right-24 size-64 rounded-full bg-brand/5 blur-3xl transition-colors group-hover:bg-brand/10" />
          <div className="absolute top-0 left-0 h-px w-full bg-gradient-to-r from-transparent via-brand/50 to-transparent" />
          <div className="pointer-events-none absolute inset-0 scanlines-overlay opacity-30" />

          <div className="relative z-10 grid items-center gap-12 md:grid-cols-2">
            <div>
              <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.5em] text-brand">
                06 // Rekrutierungs-Terminal
              </p>
              <h2 className="mb-6 font-display text-3xl leading-tight text-foreground md:text-5xl">
                Anfänger, Veteran oder Gelegenheitspilot?
              </h2>
              <p className="mb-8 text-muted-foreground">
                Egal ob du gerade deinen ersten Quantum-Sprung wagst oder seit Jahren das Verse erkundest
                — bei MRC findest du Anschluss.
              </p>
              <ul className="mb-10 space-y-4">
                {benefits.map((b) => (
                  <li key={b} className="flex items-center gap-3 text-sm text-foreground/85">
                    <span className="size-1.5 rotate-45 bg-brand" />
                    {b}
                  </li>
                ))}
              </ul>
              <a
                href="#"
                className="group/btn relative inline-flex items-center gap-3 overflow-hidden bg-brand px-12 py-5 text-xs font-bold uppercase tracking-[0.25em] text-primary-foreground transition-all hover:shadow-[0_0_50px_rgba(255,191,0,0.5)] active:scale-95"
              >
                <span className="size-1.5 bg-primary-foreground group-hover/btn:animate-ping" />
                Jetzt bewerben
                <span aria-hidden className="absolute inset-y-0 -left-12 w-12 -skew-x-12 bg-white/30 transition-transform duration-700 group-hover/btn:translate-x-[260px]" />
              </a>
            </div>

            <div className="grid grid-cols-6 grid-rows-6 gap-3 md:gap-4">
              <figure className="relative col-span-6 row-span-3 overflow-hidden border border-white/10 group/img">
                <img
                  src={pilotsImg}
                  alt="MRC Piloten auf dem Hangar-Deck vor ihren Schiffen"
                  loading="lazy"
                  width={1280}
                  height={1600}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
                <figcaption className="absolute bottom-3 left-3 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/90">
                  // FLUGCREW · STANTON
                </figcaption>
              </figure>

              <figure className="relative col-span-3 row-span-2 overflow-hidden border border-white/10 group/img">
                <img
                  src={cockpitImg}
                  alt="Cockpit-Sicht eines Star-Citizen-Schiffes mit HUD-Anzeigen"
                  loading="lazy"
                  width={1280}
                  height={960}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              </figure>

              <figure className="relative col-span-3 row-span-2 overflow-hidden border border-white/10 group/img">
                <img
                  src={fleetImg}
                  alt="Capital-Ship über einem Planeten im Quantum-Flug"
                  loading="lazy"
                  width={1280}
                  height={960}
                  className="h-full w-full object-cover transition-transform duration-700 group-hover/img:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/80 to-transparent" />
              </figure>

              <div className="col-span-6 row-span-1 grid grid-cols-4 gap-2 md:gap-3">
                {stats.map((s) => (
                  <div
                    key={s.l}
                    className="flex flex-col items-center justify-center border border-white/10 bg-white/5 px-2 py-3 text-center"
                  >
                    <span className="font-display text-sm text-brand md:text-base">{s.v}</span>
                    <span className="mt-1 text-[8px] uppercase tracking-[0.2em] text-muted-foreground md:text-[9px]">
                      {s.l}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}