import { useEffect, useState } from "react";
import logo from "@/assets/idcp-logo.png.asset.json";
import aresIdris from "@/assets/hero-ares-idris.jpg.asset.json";
import { Starfield } from "./Starfield";
import { AnimatedHeadline } from "./AnimatedHeadline";

function useTelemetry() {
  const [t, setT] = useState({ sec: "49.022.11", x: "+0042.117", y: "−0009.882", z: "+0118.040" });
  useEffect(() => {
    const id = window.setInterval(() => {
      const rand = (n: number) => (Math.random() * n - n / 2).toFixed(3);
      setT({
        sec: `49.0${(20 + Math.floor(Math.random() * 9))}.${(10 + Math.floor(Math.random() * 89))}`,
        x: `${Math.random() > 0.5 ? "+" : "−"}0${(40 + +rand(8)).toFixed(3)}`,
        y: `${Math.random() > 0.5 ? "+" : "−"}0${(9 + +rand(4)).toFixed(3)}`,
        z: `${Math.random() > 0.5 ? "+" : "−"}0${(118 + +rand(6)).toFixed(3)}`,
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);
  return t;
}

export function Hero() {
  const t = useTelemetry();
  return (
    <section id="top" className="relative flex min-h-screen items-center overflow-hidden pt-32 pb-24">
      {/* Nebula backdrop with ken-burns */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <img
          src={aresIdris.url}
          alt=""
          width={3840}
          height={2160}
          className="h-full w-full object-cover opacity-70 animate-ken-burns"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/20 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background/60" />
      </div>
      <Starfield density={140} />
      <div className="absolute inset-0 -z-0 data-grid opacity-50" />

      {/* Scanline sweeping the hero */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent opacity-60 blur-[1px] animate-scanline" />
      </div>

      <div className="relative z-10 mx-auto grid w-full max-w-7xl gap-12 px-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        {/* LEFT — Title block */}
        <div className="relative">
          {/* HUD frame */}
          <div className="absolute -inset-6 -z-10 hidden border border-brand/15 md:block" aria-hidden>
            <span className="absolute -top-px -left-px size-5 border-l border-t border-brand" />
            <span className="absolute -top-px -right-px size-5 border-r border-t border-brand" />
            <span className="absolute -bottom-px -left-px size-5 border-l border-b border-brand" />
            <span className="absolute -bottom-px -right-px size-5 border-r border-b border-brand" />
          </div>

          <p className="mb-6 inline-flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.5em] text-brand/80 animate-fade-in">
            <span className="size-1.5 animate-tele-tick bg-brand" />
            // SIGNAL EMPFANGEN · SEK {t.sec}
          </p>

          <AnimatedHeadline
            text="WILLKOMMEN IM VERSE"
            className="mb-5 block font-display text-4xl leading-[0.95] tracking-tight text-foreground md:text-7xl"
          />

          <div className="mb-8 flex items-center gap-4">
            <span className="h-px w-12 bg-brand" />
            <span className="font-display text-[10px] uppercase tracking-[0.4em] text-brand md:text-xs">
              MRC // MONARCH ROYAL COMMAND
            </span>
          </div>

          <p className="mb-10 max-w-xl text-base leading-relaxed text-muted-foreground md:text-lg">
            Eine offene Star-Citizen-Organisation für Piloten, die das Universum nicht allein erobern
            wollen. <span className="text-foreground">Erkunden. Verbinden. Gemeinsam spielen.</span>
          </p>

          <div className="mb-10 flex flex-col gap-4 sm:flex-row">
            <a
              href="#membership"
              className="hud-corners group relative inline-flex items-center gap-3 overflow-hidden bg-brand px-10 py-4 text-xs font-bold uppercase tracking-[0.25em] text-primary-foreground transition-all hover:shadow-[0_0_40px_rgba(255,191,0,0.5)] active:scale-95"
            >
              <span className="size-1.5 bg-primary-foreground group-hover:animate-ping" />
              <span className="relative">Der Korporation beitreten</span>
              <span aria-hidden className="absolute inset-y-0 -left-12 w-12 -skew-x-12 bg-white/30 transition-transform duration-700 group-hover:translate-x-[260px]" />
            </a>
            <a
              href="#"
              className="hud-corners group inline-flex items-center gap-3 border border-white/15 bg-white/[0.03] px-10 py-4 text-xs font-bold uppercase tracking-[0.25em] text-foreground transition-all hover:border-brand/40 hover:bg-white/5"
            >
              <span className="size-1.5 rounded-full bg-brand/70 group-hover:bg-brand" />
              Discord betreten
            </a>
          </div>

          {/* Telemetry strip */}
          <div className="grid max-w-md grid-cols-3 border border-brand/15 bg-background/40 backdrop-blur font-mono text-[10px] uppercase tracking-[0.2em]">
            {(["x", "y", "z"] as const).map((k) => (
              <div key={k} className="border-r border-brand/10 px-3 py-2 last:border-r-0">
                <div className="text-brand/60">ACHSE {k.toUpperCase()}</div>
                <div className="mt-1 text-foreground/90">{t[k]}</div>
              </div>
            ))}
          </div>
        </div>

        {/* RIGHT — Emblem */}
        <div className="relative mx-auto hidden aspect-square w-full max-w-[480px] lg:block">
          <div className="absolute inset-0 animate-orbit-slow rounded-full border border-brand/15" />
          <div
            className="absolute inset-6 animate-orbit-slow rounded-full border border-brand/10"
            style={{ animationDirection: "reverse", animationDuration: "30s" }}
          />
          <div className="absolute inset-12 rounded-full border border-brand/5" />
          <div className="absolute inset-16 rounded-full border border-dashed border-brand/10" />

          {/* Orbiting dots */}
          <div className="absolute inset-0 animate-orbit-slow" style={{ animationDuration: "22s" }}>
            <span className="absolute left-1/2 top-0 size-2 -translate-x-1/2 rounded-full bg-brand shadow-[0_0_12px_var(--brand)]" />
          </div>
          <div className="absolute inset-6 animate-orbit-slow" style={{ animationDuration: "34s", animationDirection: "reverse" }}>
            <span className="absolute right-0 top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-brand/70" />
          </div>

          <div className="absolute inset-1/4 grid place-items-center rounded-full bg-card/70 backdrop-blur-md animate-pulse-glow">
            <img
              src={logo.url}
              alt="MRC — Monarch Royal Command emblem"
              className="size-32 object-contain"
              width={160}
              height={160}
            />
          </div>

          {/* HUD readouts around */}
          <div className="absolute -left-2 top-6 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">
            ⌐ SYS.VERBINDUNG
          </div>
          <div className="absolute -right-2 bottom-8 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">
            HÜLLE.INTEGRITÄT · 100%
          </div>
        </div>
      </div>

      {/* Scroll indicator */}
      <a
        href="#about"
        className="group absolute bottom-8 left-1/2 z-10 -translate-x-1/2 font-mono text-[9px] uppercase tracking-[0.4em] text-brand/70 transition-colors hover:text-brand"
      >
        <span className="mb-2 block">scrollen zum Start</span>
        <span className="mx-auto block h-8 w-px animate-pulse bg-gradient-to-b from-brand to-transparent" />
      </a>
    </section>
  );
}