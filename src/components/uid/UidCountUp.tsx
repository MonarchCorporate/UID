import { useEffect, useRef, useState } from "react";

/** Zählt beim Sichtbarwerden hoch. Nicht-numerische Werte werden unverändert gezeigt. */
export function UidCountUp({
  value,
  duration = 1200,
  className = "",
}: {
  value: string;
  duration?: number;
  className?: string;
}) {
  const match = value.match(/^(\D*)(\d+(?:[.,]\d+)?)(.*)$/);
  const target = match ? Number(match[2].replace(",", ".")) : null;
  const [n, setN] = useState(target === null ? 0 : 0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (target === null) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setN(target);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setN(target);
      return;
    }
    let raf = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - p, 3);
          setN(target * eased);
          if (p < 1) raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [target, duration]);

  if (target === null || !match) return <span className={className}>{value}</span>;

  const decimals = match[2].includes(".") || match[2].includes(",") ? 1 : 0;
  return (
    <span ref={ref} className={className}>
      {match[1]}
      {n.toFixed(decimals)}
      {match[3]}
    </span>
  );
}