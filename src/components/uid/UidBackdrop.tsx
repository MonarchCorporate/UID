import { useMemo } from "react";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BackdropVariant = "none" | "aurora" | "stars" | "grid" | "full";

/**
 * Dezente, rein CSS-basierte Hintergrundebene für UID-Sektionen.
 * Sterne werden deterministisch erzeugt (SSR-sicher, kein Hydration-Mismatch).
 */
export function UidBackdrop({
  variant = "aurora",
  seed = 4711,
  stars = 26,
}: {
  variant?: BackdropVariant;
  seed?: number;
  stars?: number;
}) {
  const points = useMemo(() => {
    if (variant !== "stars" && variant !== "full") return [];
    const rand = mulberry32(seed);
    return Array.from({ length: stars }).map((_, i) => ({
      id: i,
      top: rand() * 100,
      left: rand() * 100,
      size: 0.8 + rand() * 1.6,
      delay: rand() * 6,
      duration: 4 + rand() * 6,
    }));
  }, [variant, seed, stars]);

  if (variant === "none") return null;

  const showAurora = variant === "aurora" || variant === "full";
  const showGrid = variant === "grid" || variant === "full";

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {showAurora && (
        <div className="uid-aurora">
          <span />
          <span />
        </div>
      )}
      {showGrid && <div className="uid-grid-bg uid-grid-anim absolute inset-0 opacity-25" />}
      {points.map((p) => (
        <span
          key={p.id}
          className="uid-star"
          style={{
            top: `${p.top}%`,
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
      <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-background to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background to-transparent" />
    </div>
  );
}