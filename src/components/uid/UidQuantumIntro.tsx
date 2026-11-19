import { useEffect, useRef, useState } from "react";

/**
 * Quantensprung-Ankunft beim ersten Aufruf einer Sitzung.
 *
 * Ablauf (ca. 3,4 s): Quantum-Drive lädt auf → Sprung durch den Tunnel →
 * Lichtblitz → die Seite „taucht auf“. Gesteuert über das Attribut
 * `data-qt` am <html>-Element, das ein Inline-Script vor dem ersten Paint setzt:
 *   play  – Intro läuft, Hero-Inhalte warten
 *   done  – Intro beendet, Hero spielt die Ankunft ab
 *   skip  – Intro in dieser Sitzung schon gesehen
 *   still – reduzierte Bewegung gewünscht, keine Animationen
 * Ohne JavaScript bleibt das Attribut leer und die Seite ist sofort sichtbar.
 */

const SEEN_KEY = "uid-qt-seen";

export const QT_BOOT_SCRIPT = `(function(){try{var d=document.documentElement;if(window.matchMedia("(prefers-reduced-motion: reduce)").matches){d.dataset.qt="still";return}if(sessionStorage.getItem("${SEEN_KEY}")){d.dataset.qt="skip";return}d.dataset.qt="play"}catch(e){}})();`;

const SPOOL_END = 950;
const JUMP_END = 2550;
const FLASH_PEAK = 2720;
const TOTAL = 3350;

type Star = { x: number; y: number; z: number; pz: number; hue: number };

export function UidQuantumIntro() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [phase, setPhase] = useState<"spool" | "jump" | "exit">("spool");
  const [spool, setSpool] = useState(0);
  const [distance, setDistance] = useState(4.82);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const html = document.documentElement;
    if (html.dataset.qt !== "play") return;
    setActive(true);

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      html.dataset.qt = "done";
      return;
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    let w = 0;
    let h = 0;
    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const stars: Star[] = Array.from({ length: coarse ? 260 : 520 }, () => {
      const s: Star = { x: 0, y: 0, z: 0, pz: 0, hue: 0 };
      s.x = (Math.random() - 0.5) * 2;
      s.y = (Math.random() - 0.5) * 2;
      s.z = Math.random();
      s.pz = s.z;
      s.hue = Math.random();
      return s;
    });

    let start = 0;
    let raf = 0;
    let finished = false;
    let lastUi = 0;

    const finish = () => {
      if (finished) return;
      finished = true;
      cancelAnimationFrame(raf);
      try {
        sessionStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* privates Fenster */
      }
      html.dataset.qt = "done";
      rootRef.current?.classList.add("uid-qt-gone");
      window.setTimeout(() => setActive(false), 700);
    };

    const easeIn = (x: number) => x * x * x;

    const frame = (now: number) => {
      if (!start) start = now;
      const t = now - start;
      raf = requestAnimationFrame(frame);

      // Geschwindigkeit: Spool langsam, Sprung exponentiell, Austritt abrupt
      let speed: number;
      if (t < SPOOL_END) speed = 0.0015 + (t / SPOOL_END) * 0.004;
      else if (t < JUMP_END) speed = 0.0055 + easeIn((t - SPOOL_END) / (JUMP_END - SPOOL_END)) * 0.085;
      else speed = Math.max(0.002, 0.09 * (1 - (t - JUMP_END) / 300));

      const jumpK = t < SPOOL_END ? 0 : Math.min(1, (t - SPOOL_END) / (JUMP_END - SPOOL_END));
      const cx = w / 2;
      const cy = h * 0.46;
      const scale = Math.max(w, h) * 0.7;

      // Nachleuchten statt harter Löschung → Lichtschweife
      ctx.fillStyle = `rgba(2, 5, 12, ${t < SPOOL_END ? 0.55 : 0.28 + (1 - jumpK) * 0.2})`;
      ctx.fillRect(0, 0, w, h);

      // Tunnelringe während des Sprungs
      if (t > SPOOL_END && t < JUMP_END + 200) {
        const rings = 7;
        for (let i = 0; i < rings; i++) {
          const p = ((t / 520 + i / rings) % 1) ** 2.2;
          const r = 30 + p * Math.max(w, h) * 0.95;
          const a = (1 - p) * 0.22 * jumpK;
          ctx.strokeStyle = `rgba(70, 205, 255, ${a})`;
          ctx.lineWidth = 1 + p * 6;
          ctx.beginPath();
          ctx.ellipse(cx, cy, r, r * 0.62, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        // Kern des Tunnels
        const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.32);
        core.addColorStop(0, `rgba(170, 235, 255, ${0.35 * jumpK})`);
        core.addColorStop(0.4, `rgba(40, 140, 220, ${0.12 * jumpK})`);
        core.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = core;
        ctx.fillRect(0, 0, w, h);
      }

      ctx.lineCap = "round";

      // Dichte Tunnel-Streifen: radial vom Zentrum nach außen, rotierend
      if (jumpK > 0 && t < JUMP_END + 120) {
        const maxR = Math.hypot(w, h) * 0.62;
        const n = Math.floor((coarse ? 55 : 110) * jumpK);
        const spin = t * 0.00035;
        for (let i = 0; i < n; i++) {
          const a = Math.random() * Math.PI * 2 + spin;
          const r0 = (0.06 + Math.random() * 0.55) * maxR;
          const len = (0.08 + Math.random() * 0.35) * maxR * (0.4 + jumpK);
          const r1 = r0 + len;
          const ca = Math.cos(a);
          const sa = Math.sin(a) * 0.68;
          const g = ctx.createLinearGradient(cx + ca * r0, cy + sa * r0, cx + ca * r1, cy + sa * r1);
          const bright = Math.random() > 0.75;
          g.addColorStop(0, "rgba(120, 220, 255, 0)");
          g.addColorStop(1, bright ? `rgba(235, 250, 255, ${0.55 * jumpK})` : `rgba(70, 190, 255, ${0.35 * jumpK})`);
          ctx.strokeStyle = g;
          ctx.lineWidth = bright ? 1.6 : 1;
          ctx.beginPath();
          ctx.moveTo(cx + ca * r0, cy + sa * r0);
          ctx.lineTo(cx + ca * r1, cy + sa * r1);
          ctx.stroke();
        }
      }

      for (const s of stars) {
        s.pz = s.z;
        s.z -= speed;
        if (s.z <= 0.02) {
          s.x = (Math.random() - 0.5) * 2;
          s.y = (Math.random() - 0.5) * 2;
          s.z = 1;
          s.pz = 1;
          continue;
        }
        const x = cx + (s.x * scale) / s.z;
        const y = cy + (s.y * scale) / s.z;
        // Während des Sprungs verlängern sich die Schweife deutlich
        const trail = 1 + jumpK * 5;
        const pz = Math.min(1, s.z + (s.pz - s.z) * trail);
        const px = cx + (s.x * scale) / pz;
        const py = cy + (s.y * scale) / pz;
        if (x < -100 || x > w + 100 || y < -100 || y > h + 100) continue;
        const depth = 1 - s.z;
        const alpha = Math.min(1, depth * 1.2);
        const cyan = s.hue > 0.82;
        ctx.strokeStyle = cyan
          ? `rgba(90, 220, 255, ${alpha})`
          : `rgba(${215 + depth * 40}, ${235 + depth * 20}, 255, ${alpha * 0.9})`;
        ctx.lineWidth = Math.max(0.5, depth * (1.4 + jumpK * 1.8));
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }

      // Blitz beim Austritt
      if (flashRef.current) {
        let f = 0;
        if (t > JUMP_END - 150 && t <= FLASH_PEAK) f = (t - (JUMP_END - 150)) / (FLASH_PEAK - JUMP_END + 150);
        else if (t > FLASH_PEAK) f = Math.max(0, 1 - (t - FLASH_PEAK) / 520);
        flashRef.current.style.opacity = f.toFixed(3);
      }

      // HUD-Werte nur ~20x pro Sekunde aktualisieren
      if (now - lastUi > 50) {
        lastUi = now;
        setSpool(Math.min(100, Math.round((t / SPOOL_END) * 100)));
        setPhase(t < SPOOL_END ? "spool" : t < JUMP_END ? "jump" : "exit");
        const d = t < SPOOL_END ? 4.82 : 4.82 * Math.pow(1 - jumpK, 1.6);
        setDistance(d);
      }

      if (t > FLASH_PEAK + 60 && !finished) {
        // Seite schon unter dem Blitz freigeben, damit die Ankunft nahtlos wirkt
        finish();
      }
      if (t > TOTAL) cancelAnimationFrame(raf);
    };
    raf = requestAnimationFrame(frame);

    const skip = () => finish();
    window.addEventListener("keydown", skip);
    window.addEventListener("wheel", skip, { passive: true });
    window.addEventListener("touchmove", skip, { passive: true });

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", skip);
      window.removeEventListener("wheel", skip);
      window.removeEventListener("touchmove", skip);
      if (!finished) html.dataset.qt = "done";
    };
  }, []);

  const statusLabel =
    phase === "spool" ? "Quantum-Antrieb lädt" : phase === "jump" ? "Quantensprung aktiv" : "Austritt";

  return (
    <div
      ref={rootRef}
      className={`uid-qt${active ? " is-on" : ""}`}
      aria-hidden
      onClick={() => {
        // Klick überspringt: über keydown-Pfad identisch behandelt
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      }}
      data-phase={phase}
    >
      <canvas ref={canvasRef} className="uid-qt-canvas" />
      <div className="uid-qt-vignette" />

      <div className="uid-qt-hud">
        <div className="uid-qt-reticle">
          <svg viewBox="0 0 200 200" className="uid-qt-ring">
            <circle cx="100" cy="100" r="86" className="uid-qt-ring-track" />
            <circle
              cx="100"
              cy="100"
              r="86"
              className="uid-qt-ring-fill"
              style={{ strokeDashoffset: 540 - (540 * spool) / 100 }}
            />
            <g className="uid-qt-ticks">
              {Array.from({ length: 36 }, (_, i) => (
                <line
                  key={i}
                  x1="100"
                  y1="6"
                  x2="100"
                  y2={i % 3 === 0 ? 16 : 11}
                  transform={`rotate(${i * 10} 100 100)`}
                />
              ))}
            </g>
          </svg>
          <div className="uid-qt-readout">
            <span className="uid-qt-value">{phase === "spool" ? `${spool}%` : `${distance.toFixed(2)}`}</span>
            <span className="uid-qt-unit">{phase === "spool" ? "Spool" : "Gm bis Ziel"}</span>
          </div>
        </div>

        <div className="uid-qt-status">
          <span className="uid-qt-blink" />
          {statusLabel}
        </div>
        <div className="uid-qt-target">Ziel · United Imperial Dominion</div>
      </div>

      <div className="uid-qt-skip">Klicken oder Taste drücken zum Überspringen</div>
      <div ref={flashRef} className="uid-qt-flash" />
    </div>
  );
}
