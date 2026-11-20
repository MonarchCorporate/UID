import { useEffect, useRef, useState } from "react";

const GLYPHS = "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789<>/[]#%+=";
const GLYPHS_LOWER = "abcdefghjkmnpqrstuvwxyz0123456789";

/**
 * Text, der sich wie ein HUD-Signal entschlüsselt: Zeichen flimmern zufällig
 * und rasten von links nach rechts auf den echten Buchstaben ein.
 *
 * trigger="arrival" startet nach dem Quantensprung-Intro (html[data-qt]),
 * trigger="visible" sobald der Text ins Bild scrollt.
 * Server-Rendering und Screenreader bekommen immer den echten Text.
 */
export function UidDecodeText({
  text,
  trigger = "visible",
  delay = 0,
  step = 45,
  className,
}: {
  text: string;
  trigger?: "arrival" | "visible";
  delay?: number;
  step?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [out, setOut] = useState(text);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const html = document.documentElement;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || html.dataset.qt === "still") return;

    const scramble = (resolved: number) =>
      text
        .split("")
        .map((ch, i) =>
          i < resolved || /[\s.,:;!?—–-]/.test(ch)
            ? ch
            : ch === ch.toLowerCase() && ch !== ch.toUpperCase()
              ? GLYPHS_LOWER[Math.floor(Math.random() * GLYPHS_LOWER.length)]
              : GLYPHS[Math.floor(Math.random() * GLYPHS.length)],
        )
        .join("");

    // Unsichtbar vorbereiten (das Element blendet erst später ein)
    setOut(scramble(0));

    let raf = 0;
    let timer = 0;
    let started = false;
    const run = () => {
      if (started) return;
      started = true;
      timer = window.setTimeout(() => {
        const t0 = performance.now();
        let last = 0;
        const tick = (now: number) => {
          const resolved = Math.floor((now - t0) / step);
          if (now - last > 40) {
            last = now;
            setOut(scramble(resolved));
          }
          if (resolved < text.length) raf = requestAnimationFrame(tick);
          else setOut(text);
        };
        raf = requestAnimationFrame(tick);
      }, delay);
    };

    let cleanupTrigger = () => {};
    if (trigger === "arrival") {
      if (html.dataset.qt !== "play") run();
      else {
        const mo = new MutationObserver(() => {
          if (html.dataset.qt !== "play") {
            mo.disconnect();
            run();
          }
        });
        mo.observe(html, { attributes: true, attributeFilter: ["data-qt"] });
        cleanupTrigger = () => mo.disconnect();
      }
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            run();
          }
        },
        { threshold: 0.4 },
      );
      io.observe(el);
      cleanupTrigger = () => io.disconnect();
    }

    return () => {
      cleanupTrigger();
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [text, trigger, delay, step]);

  return (
    <span ref={ref} className={className} aria-label={text}>
      <span aria-hidden>{out}</span>
    </span>
  );
}
