import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import aresIdris from "@/assets/hero-ares-idris.jpg.asset.json";
import { UID_CLAIM, UID_MOTTO } from "./content";
import { UidCountUp } from "./UidCountUp";
import { UidWarp } from "./UidWarp";

const stats = [
  { v: "7", l: "Einsatzbereiche" },
  { v: "∞", l: "Gemeinsame Operationen" },
  { v: "100%", l: "Eigenständigkeit" },
  { v: "24/7", l: "Community-Netzwerk" },
];

export function UidHero() {
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        setOffset(Math.min(window.scrollY, 900));
        raf = 0;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  /* Cursor-/Touch-Parallax: schreibt geglättete Werte als CSS-Variablen.
     Maus: Position steuert Parallax + Glow.
     Touch: Drücken aktiviert den Glow (--press), Wischen bewegt die Ebenen,
     nach dem Loslassen laufen alle Werte sanft zurück in die Mitte.
     Zusätzlich sorgt die Gerätneigung für dezente Bewegung ohne Berührung. */
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const coarse = window.matchMedia("(pointer: coarse)").matches;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let tmx = 50;
    let tmy = 40;
    let mx = 50;
    let my = 40;
    let tilt = { x: 0, y: 0 };
    let pressTarget = coarse ? 0 : 1;
    let press = pressTarget;
    let touching = false;
    let releaseAt = 0;
    let raf = 0;

    const loop = () => {
      const since = releaseAt ? performance.now() - releaseAt : 0;
      // Kurzes Tippen bleibt sichtbar: Glow hält ~380ms nach dem Loslassen
      if (coarse && !touching && releaseAt && since > 380) pressTarget = 0;
      // Nach dem Loslassen langsam zur Neigung/Mitte zurückgleiten
      if (coarse && !touching && releaseAt && since > 520) {
        tx = tilt.x;
        ty = tilt.y;
        tmx = 50;
        tmy = 40;
      }
      const ease = touching ? 0.14 : 0.06;
      cx += (tx - cx) * ease;
      cy += (ty - cy) * ease;
      mx += (tmx - mx) * (touching ? 0.22 : 0.08);
      my += (tmy - my) * (touching ? 0.22 : 0.08);
      press += (pressTarget - press) * (pressTarget > press ? 0.2 : 0.045);
      el.style.setProperty("--px", cx.toFixed(4));
      el.style.setProperty("--py", cy.toFixed(4));
      el.style.setProperty("--mx", `${mx.toFixed(2)}%`);
      el.style.setProperty("--my", `${my.toFixed(2)}%`);
      el.style.setProperty("--press", press.toFixed(3));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const fromPoint = (clientX: number, clientY: number) => {
      const r = el.getBoundingClientRect();
      const nx = Math.max(-1, Math.min(1, ((clientX - r.left) / r.width) * 2 - 1));
      const ny = Math.max(-1, Math.min(1, ((clientY - r.top) / r.height) * 2 - 1));
      // Auf Touch bewusst gedämpft, damit Wischgesten nicht ruckartig wirken
      const damp = coarse ? 0.6 : 1;
      tx = nx * damp;
      ty = ny * damp;
      tmx = ((clientX - r.left) / r.width) * 100;
      tmy = ((clientY - r.top) / r.height) * 100;
    };

    const onMove = (e: PointerEvent) => {
      if (coarse && !touching) return;
      fromPoint(e.clientX, e.clientY);
    };

    const onDown = (e: PointerEvent) => {
      if (coarse) {
        const r = el.getBoundingClientRect();
        // Nur Gesten innerhalb der Hero-Sektion beeinflussen die Szene
        if (e.clientY < r.top || e.clientY > r.bottom) return;
        touching = true;
        releaseAt = 0;
        pressTarget = 1;
      }
      fromPoint(e.clientX, e.clientY);
    };

    const onUp = () => {
      if (!coarse) return;
      touching = false;
      releaseAt = performance.now();
    };

    const onLeave = () => {
      if (coarse) return;
      tx = 0;
      ty = 0;
      tmx = 50;
      tmy = 40;
    };

    const onTilt = (e: DeviceOrientationEvent) => {
      if (e.gamma == null || e.beta == null) return;
      tilt = {
        x: Math.max(-1, Math.min(1, e.gamma / 35)) * 0.5,
        y: Math.max(-1, Math.min(1, (e.beta - 45) / 35)) * 0.5,
      };
      if (!touching) {
        tx = tilt.x;
        ty = tilt.y;
      }
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", onDown, { passive: true });
    window.addEventListener("pointerup", onUp, { passive: true });
    window.addEventListener("pointercancel", onUp, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    if (coarse) window.addEventListener("deviceorientation", onTilt);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
      window.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("deviceorientation", onTilt);
    };
  }, []);

  return (
    <section
      ref={rootRef}
      className="uid-hero relative -mt-18 flex min-h-screen flex-col justify-end overflow-hidden"
    >
      {/* Bildebene mit langsamem Ken-Burns-Zoom + Parallax */}
      <div
        className="uid-par uid-par-back absolute inset-0"
        style={{ ["--scrollY" as string]: `${offset * 0.28}px` }}
        aria-hidden
      >
        <img
          src={aresIdris.url}
          alt="Verbündete Flottenverbände der United Imperial Dominion im Orbit"
          width={3840}
          height={2160}
          className="uid-kenburns h-full w-full object-cover"
        />
      </div>

      {/* Vignette / Verlauf */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/25" />
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_10%,transparent,var(--background)_95%)]" />

      {/* Warp-Sternenfeld (Cursor-gesteuerter Fluchtpunkt) */}
      <UidWarp className="pointer-events-none absolute inset-0 h-full w-full opacity-70 [mask-image:radial-gradient(80%_70%_at_50%_35%,#000,transparent)]" />

      {/* Cursor-Leuchten */}
      <div className="uid-hero-glow pointer-events-none absolute inset-0" aria-hidden />

      {/* Bewegtes Raster + Scanlinie */}
      <div className="uid-grid-bg uid-grid-anim uid-par uid-par-mid pointer-events-none absolute -inset-8 opacity-40" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="uid-scanline h-px w-full bg-gradient-to-r from-transparent via-brand/40 to-transparent" />
      </div>

      {/* Inhalt */}
      <div
        className="uid-par uid-par-front relative mx-auto w-full max-w-6xl px-6 pb-16 pt-36 md:pb-20 md:pt-44"
        style={{ opacity: Math.max(0, 1 - offset / 620) }}
      >
        <div className="uid-rise flex items-center gap-3" style={{ animationDelay: "80ms" }}>
          <span className="uid-pulse-dot size-1.5 rounded-full bg-brand" />
          <span className="font-mono text-[10px] uppercase tracking-[0.45em] text-brand">
            Community Network · Aktiv
          </span>
        </div>

        <h1 className="mt-6 font-display leading-[0.92] tracking-tight text-foreground">
          <span
            className="uid-rise block text-4xl md:text-7xl lg:text-8xl"
            style={{ animationDelay: "180ms" }}
          >
            UNITED IMPERIAL
          </span>
          <span
            className="uid-rise uid-sweep relative mt-1 block overflow-hidden text-4xl text-brand md:text-7xl lg:text-8xl"
            style={{ animationDelay: "320ms" }}
          >
            DOMINION
          </span>
        </h1>

        <p
          className="uid-rise mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-lg"
          style={{ animationDelay: "460ms" }}
        >
          {UID_CLAIM} Eine Community unabhängiger Organisationen, der seine Stärke aus der freiwilligen
          Zusammenarbeit in ganz unterschiedlichen Bereichen zieht.
        </p>

        <div
          className="uid-rise mt-9 flex flex-wrap items-center gap-3"
          style={{ animationDelay: "600ms" }}
        >
          <Link
            to="/bewerbung"
            className="group relative overflow-hidden bg-brand px-7 py-3.5 text-[10px] font-bold uppercase tracking-[0.25em] text-primary-foreground transition-transform hover:-translate-y-0.5"
          >
            <span className="relative z-10">Mitgliedschaft beantragen</span>
            <span className="absolute inset-0 -translate-x-full bg-foreground/20 transition-transform duration-500 group-hover:translate-x-0" />
          </Link>
          <Link
            to="/home2/community"
            className="border border-brand/50 px-7 py-3.5 text-[10px] font-bold uppercase tracking-[0.25em] text-brand transition-all hover:-translate-y-0.5 hover:bg-brand hover:text-primary-foreground"
          >
            Die Community kennenlernen
          </Link>
        </div>

        <p
          className="uid-rise mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/60"
          style={{ animationDelay: "740ms" }}
        >
          {UID_MOTTO}
        </p>
      </div>

      {/* Statuszeile unten */}
      <div className="relative border-t border-brand/15 bg-background/60 backdrop-blur-sm">
        <div className="mx-auto grid max-w-6xl grid-cols-2 divide-x divide-brand/10 px-6 md:grid-cols-4">
          {stats.map((s, i) => (
            <div
              key={s.l}
              className="uid-rise px-4 py-5 first:pl-0 last:pr-0"
              style={{ animationDelay: `${820 + i * 90}ms` }}
            >
              <div className="font-display text-xl text-foreground md:text-2xl">
                <UidCountUp value={s.v} />
              </div>
              <div className="mt-1 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground">
                {s.l}
              </div>
            </div>
          ))}
        </div>
      </div>

      <a
        href="#mission"
        aria-label="Weiter zur Mission"
        className="absolute bottom-28 left-1/2 hidden -translate-x-1/2 text-brand/70 transition-colors hover:text-brand md:block"
      >
        <ChevronDown className="uid-cue size-6" />
      </a>
    </section>
  );
}