import { useEffect, useRef } from "react";

type Star = { x: number; y: number; z: number; pz: number };

/**
 * Dezenter Warp-Sternenfeld-Canvas. Reagiert auf Cursor/Touch (Richtung des
 * Warps) und pausiert bei prefers-reduced-motion oder wenn nicht sichtbar.
 */
export function UidWarp({ className = "" }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    let stars: Star[] = [];
    let raf = 0;
    let visible = true;

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const count = coarse ? 90 : 170;
    const baseSpeed = coarse ? 0.006 : 0.009;
    const host = canvas.closest<HTMLElement>(".uid-hero");

    // Ziel- und geglättete Cursorposition (-1..1)
    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;

    const reset = (s: Star, initial: boolean) => {
      s.x = (Math.random() - 0.5) * 2;
      s.y = (Math.random() - 0.5) * 2;
      s.z = initial ? Math.random() : 1;
      s.pz = s.z;
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width);
      h = Math.max(1, rect.height);
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      stars = Array.from({ length: count }, () => {
        const s: Star = { x: 0, y: 0, z: 1, pz: 1 };
        reset(s, true);
        return s;
      });
    };

    const onPointer = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      tx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ty = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    };
    const onLeave = () => {
      tx = 0;
      ty = 0;
    };

    const draw = () => {
      raf = requestAnimationFrame(draw);
      if (!visible) return;

      cx += (tx - cx) * 0.045;
      cy += (ty - cy) * 0.045;

      // Beim Drücken (Touch) beschleunigt der Warp dezent
      const pressRaw = host ? Number.parseFloat(host.style.getPropertyValue("--press")) : 1;
      const press = Number.isFinite(pressRaw) ? pressRaw : 1;
      const speed = baseSpeed * (coarse ? 1 + press * 0.9 : 1);

      // Fluchtpunkt folgt dem Cursor nur leicht
      const ox = w / 2 + cx * w * 0.09;
      const oy = h / 2 + cy * h * 0.09;

      ctx.clearRect(0, 0, w, h);
      ctx.lineCap = "round";

      const scale = Math.max(w, h) * 0.75;
      for (const s of stars) {
        s.pz = s.z;
        s.z -= speed;
        if (s.z <= 0.03) {
          reset(s, false);
          continue;
        }
        const x = ox + (s.x * scale) / s.z;
        const y = oy + (s.y * scale) / s.z;
        const px = ox + (s.x * scale) / s.pz;
        const py = oy + (s.y * scale) / s.pz;

        if (x < -80 || x > w + 80 || y < -80 || y > h + 80) continue;

        const t = 1 - s.z;
        const alpha = Math.min(0.5, t * 0.55) * (coarse ? 0.55 + press * 0.45 : 1);
        ctx.strokeStyle = `rgba(150, 225, 255, ${alpha})`;
        ctx.lineWidth = Math.max(0.4, t * 1.5);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0 },
    );
    io.observe(canvas);

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    raf = requestAnimationFrame(draw);

    window.addEventListener("pointermove", onPointer, { passive: true });
    window.addEventListener("pointerdown", onPointer, { passive: true });
    window.addEventListener("pointerleave", onLeave);

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      window.removeEventListener("pointermove", onPointer);
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return <canvas ref={ref} aria-hidden className={className} />;
}
