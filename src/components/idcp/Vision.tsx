import warp from "@/assets/warp-tunnel.jpg";
import { useReveal } from "@/hooks/use-reveal";

const QUOTE = "Zwischen Sternensystemen, Dimensionen und unbekannten Wegen steht MRC für Verbindung.";

export function Vision() {
  const ref = useReveal<HTMLDivElement>();
  const words = QUOTE.split(" ");
  return (
    <section id="vision" className="relative overflow-hidden bg-black py-40">
      <div className="absolute inset-0 z-0 opacity-50 animate-ken-burns">
        <img
          src={warp}
          alt=""
          loading="lazy"
          width={1920}
          height={1080}
          className="h-full w-full object-cover"
        />
      </div>
      {/* Light rays */}
      <div className="absolute inset-0 z-[1] overflow-hidden">
        <div className="light-ray" />
        <div className="light-ray" style={{ animationDelay: "-4s", animationDuration: "11s" }} />
      </div>
      <div className="absolute inset-0 z-[1] bg-gradient-to-t from-background via-transparent to-background" />
      <div className="pointer-events-none absolute inset-0 z-[1] scanlines-overlay opacity-40" />

      <div ref={ref} className="reveal relative z-10 mx-auto max-w-4xl px-6 text-center">
        <div className="mb-10 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.4em] text-brand">
            04 // Royal Vision
          </div>
        </div>
        <h2 className="mb-10 font-display text-2xl leading-tight tracking-tight text-foreground md:text-4xl">
          <span className="text-brand">„</span>
          {words.map((w, i) => (
            <span
              key={i}
              className="inline-block transition-all duration-700"
              style={{
                opacity: 0,
                transform: "translateY(20px)",
                animation: `idcp-fade-up 0.6s cubic-bezier(0.2,0.8,0.2,1) both`,
                animationDelay: `${300 + i * 80}ms`,
              }}
            >
              {w === "Verbindung." ? <span className="text-brand">{w}</span> : w}
              {i < words.length - 1 && <span>&nbsp;</span>}
            </span>
          ))}
          <span className="text-brand">"</span>
        </h2>
        <p className="mx-auto max-w-2xl text-base text-muted-foreground md:text-lg">
          Wir schaffen einen Ort, an dem Spieler nicht allein durchs Universum reisen müssen. MRC ist
          mehr als ein Tag — es ist die Brücke zwischen den Dimensionen des Star-Citizen-Universums.
        </p>
      </div>
    </section>
  );
}