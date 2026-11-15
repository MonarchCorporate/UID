import { useMemo } from "react";

// Tiny deterministic PRNG (mulberry32) so SSR and client render the exact
// same star positions — avoids React hydration mismatches that previously
// forced a full client re-render of every star on every navigation.
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

export function Starfield({
  density = 80,
  className = "",
  seed = 1337,
}: {
  density?: number;
  className?: string;
  seed?: number;
}) {
  const stars = useMemo(() => {
    const rand = mulberry32(seed);
    return Array.from({ length: density }).map((_, i) => ({
      id: i,
      top: rand() * 100,
      left: rand() * 100,
      size: rand() * 1.6 + 0.4,
      delay: rand() * 6,
      duration: 3 + rand() * 5,
      opacity: 0.3 + rand() * 0.6,
    }));
  }, [density, seed]);

  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden>
      {stars.map((s) => (
        <span
          key={s.id}
          className="absolute rounded-full bg-white animate-twinkle"
          style={{
            top: `${s.top}%`,
            left: `${s.left}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            opacity: s.opacity,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
}