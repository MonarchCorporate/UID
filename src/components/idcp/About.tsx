import hangar from "@/assets/fleet-hangar.jpg";
import deepspace from "@/assets/vision-deepspace.jpg";
import { useReveal } from "@/hooks/use-reveal";

export function About() {
  const left = useReveal<HTMLDivElement>();
  const right = useReveal<HTMLDivElement>();
  return (
    <section id="about" className="relative border-y border-white/5 bg-card/40 py-32">
      <div className="pointer-events-none absolute inset-0 data-grid opacity-40" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-16 lg:grid-cols-2">
          <div ref={left} className="reveal space-y-6">
            <div className="flex items-center gap-4">
              <div className="h-px w-12 bg-brand" />
              <span className="font-display text-[10px] uppercase tracking-[0.4em] text-brand">
                02 // Einsatzparameter
              </span>
            </div>
            <h2 className="font-display text-3xl leading-tight tracking-tight text-foreground md:text-5xl">
              Jenseits fester <span className="text-brand">Spezialisierungen.</span>
            </h2>
            <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
              Wir sind keine reine Militär-, Handels-, Mining- oder Piratenorganisation. MRC ist ein
              Treffpunkt für Spieler, die Star Citizen gemeinsam erleben wollen. Ob Missionen, Erkundung,
              Events, Handel, Kämpfe oder einfach entspanntes Fliegen — bei uns zählt das gemeinsame
              Erlebnis.
            </p>

            <div className="grid grid-cols-2 gap-4 pt-4">
              {[
                { v: "0%", l: "Aktivitätszwang" },
                { v: "∞", l: "Möglichkeiten" },
                { v: "24/7", l: "Discord Live" },
                { v: "All", l: "Spielstile" },
              ].map((s) => (
                <div
                  key={s.l}
                  className="hud-corners glass-panel border-l-2 border-l-brand p-4 transition-all hover:bg-brand/5"
                >
                  <div className="mb-1 font-display text-2xl text-foreground">{s.v}</div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    {s.l}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div ref={right} className="reveal relative">
            <div className="absolute inset-0 -m-3 border border-brand/10" />
            <div className="relative grid grid-cols-3 grid-rows-3 gap-2 aspect-[5/4]">
              <figure className="hud-corners relative col-span-2 row-span-3 overflow-hidden ring-1 ring-white/5">
                <img
                  src={hangar}
                  alt="Sci-fi hangar bay with pilots and ships"
                  loading="lazy"
                  width={1600}
                  height={1200}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
                <figcaption className="absolute bottom-3 left-3 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/80">
                  // HANGAR-04 · STANTON
                </figcaption>
              </figure>
              <figure className="hud-corners relative row-span-2 overflow-hidden ring-1 ring-white/5">
                <img
                  src={deepspace}
                  alt="Deep space exploration scene"
                  loading="lazy"
                  width={1600}
                  height={1024}
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-background/60 to-transparent" />
              </figure>
              <div className="hud-corners relative grid place-items-center border border-brand/20 bg-background/60 p-3 text-center backdrop-blur">
                <div>
                  <div className="font-mono text-[8px] uppercase tracking-[0.3em] text-brand/70">
                    VERSCHLÜSSELT
                  </div>
                  <div className="mt-1 font-mono text-[10px] italic leading-snug text-foreground/80">
                    „Kein Pilot bleibt allein in der Leere."
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}