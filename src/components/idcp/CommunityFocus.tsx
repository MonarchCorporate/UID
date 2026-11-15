import { useReveal } from "@/hooks/use-reveal";

const cards = [
  {
    n: "01",
    title: "Gemeinsames Spielen",
    body: "Spontane Missionen und koordinierte Sessions. Niemand muss allein durch das Verse fliegen.",
  },
  {
    n: "02",
    title: "Events & Missionen",
    body: "Von hochriskanten Rennen bis zu großen Operationen — regelmäßige Events für alle Spielstile.",
  },
  {
    n: "03",
    title: "Flottenaktivitäten",
    body: "Vom Starter-Hopper bis zum Capital Ship. Multi-Crew-Ops und koordinierte Geschwaderflüge.",
  },
  {
    n: "04",
    title: "Neue Spieler willkommen",
    body: "Anfänger finden bei uns Mentoren und Unterstützung — von der ersten Landung an.",
  },
];

export function CommunityFocus() {
  const head = useReveal<HTMLDivElement>();
  const grid = useReveal<HTMLDivElement>();
  return (
    <section id="community" className="relative py-32">
      <div className="pointer-events-none absolute inset-0 data-grid opacity-30" />
      <div className="relative mx-auto max-w-7xl px-6">
        <div ref={head} className="reveal mb-16 text-center">
          <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.5em] text-brand">
            03 // Kerndirektiven
          </p>
          <h2 className="mx-auto max-w-3xl font-display text-3xl leading-tight tracking-tight text-foreground md:text-5xl">
            Alles, was wir tun, <span className="text-brand">tun wir gemeinsam.</span>
          </h2>
        </div>

        <div ref={grid} className="reveal grid gap-px bg-brand/10 border border-brand/10 md:grid-cols-2 lg:grid-cols-4">
          {cards.map((c, i) => (
            <article
              key={c.n}
              className="group relative overflow-hidden bg-background p-8 transition-all hover:bg-brand/[0.04]"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              {/* HUD corners */}
              <span className="absolute left-2 top-2 size-3 border-l border-t border-brand/0 transition-colors duration-300 group-hover:border-brand" />
              <span className="absolute right-2 top-2 size-3 border-r border-t border-brand/0 transition-colors duration-300 group-hover:border-brand" />
              <span className="absolute left-2 bottom-2 size-3 border-l border-b border-brand/0 transition-colors duration-300 group-hover:border-brand" />
              <span className="absolute right-2 bottom-2 size-3 border-r border-b border-brand/0 transition-colors duration-300 group-hover:border-brand" />

              {/* Scan stream on hover */}
              <span className="pointer-events-none absolute -inset-y-2 left-0 w-px bg-brand/40 opacity-0 transition-all duration-500 group-hover:opacity-100 group-hover:translate-x-[300%]" />

              <div className="mb-6 grid size-12 place-items-center border border-brand/30 bg-background font-display text-xl text-brand transition-all duration-300 group-hover:border-brand group-hover:bg-brand group-hover:text-primary-foreground group-hover:shadow-[0_0_20px_rgba(255,191,0,0.5)]">
                {c.n}
              </div>
              <h3 className="mb-4 font-display text-xs uppercase tracking-[0.25em] text-foreground">
                {c.title}
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{c.body}</p>

              <div className="mt-6 flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/40 transition-colors group-hover:text-brand">
                <span className="h-px w-4 bg-current" /> KANAL · AKTIV
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}