import { useEffect, useRef, useState } from "react";

/**
 * Lädt das Google `<model-viewer>` Web-Component nur clientseitig und
 * rendert die von Fleetyards gelieferte .gltf-Datei. Während des Ladens
 * (oder bei Fehlern) wird ein Fallback-Bild gezeigt.
 */
export function ShipHoloViewer({
  src,
  poster,
  alt,
}: {
  src: string;
  poster?: string | null;
  alt: string;
}) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const ref = useRef<HTMLDivElement | null>(null);
  const mvRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    import("@google/model-viewer")
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const el = mvRef.current;
    if (!el) return;
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ totalProgress: number }>).detail;
      if (detail && typeof detail.totalProgress === "number") {
        setProgress(detail.totalProgress);
      }
    };
    const onLoad = () => {
      setProgress(1);
      setLoaded(true);
    };
    el.addEventListener("progress", onProgress as EventListener);
    el.addEventListener("load", onLoad);
    return () => {
      el.removeEventListener("progress", onProgress as EventListener);
      el.removeEventListener("load", onLoad);
    };
  }, [ready]);

  const showOverlay = !error && (!ready || !loaded);
  const pct = Math.round(progress * 100);

  return (
    <div
      ref={ref}
      className="relative aspect-[16/10] w-full overflow-hidden border border-brand/10 bg-[radial-gradient(ellipse_at_center,_hsl(var(--brand)/0.08),_#000_70%)]"
    >
      {ready && !error && (
        // @ts-expect-error — custom element from @google/model-viewer
        <model-viewer
          ref={mvRef}
          src={src}
          alt={alt}
          camera-controls
          auto-rotate
          rotation-per-second="20deg"
          shadow-intensity="0.6"
          exposure="1"
          environment-image="neutral"
          interaction-prompt="auto"
          loading="eager"
          style={{
            width: "100%",
            height: "100%",
            backgroundColor: "transparent",
            opacity: loaded ? 1 : 0,
            transition: "opacity 600ms ease",
          }}
        />
      )}

      {showOverlay && (
        <HoloLoader poster={poster} alt={alt} progress={pct} ready={ready} />
      )}

      <div className="absolute right-3 top-3 border border-brand/40 bg-background/80 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand backdrop-blur">
        3D · Holo
      </div>
      {error && (
        <div className="absolute bottom-3 left-3 right-3 border border-destructive/40 bg-background/80 p-2 font-mono text-[10px] uppercase tracking-[0.3em] text-destructive backdrop-blur">
          // 3D nicht ladbar: {error}
        </div>
      )}
    </div>
  );
}

function HoloLoader({
  poster,
  alt,
  progress,
  ready,
}: {
  poster?: string | null;
  alt: string;
  progress: number;
  ready: boolean;
}) {
  const phase = !ready
    ? "INITIALISIERE HOLO-PROJEKTION"
    : progress > 0
      ? "RENDERN GEOMETRIE"
      : "SYNCHRONISIERE DATENSTROM";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
      {/* Poster silhouette */}
      {poster && (
        <img
          src={poster}
          alt={alt}
          className="absolute inset-0 h-full w-full object-cover opacity-[0.12] mix-blend-screen [filter:blur(2px)_saturate(2)_hue-rotate(160deg)]"
        />
      )}

      {/* Grid */}
      <div
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--brand)/0.25) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--brand)/0.25) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
          maskImage:
            "radial-gradient(ellipse at center, black 30%, transparent 75%)",
        }}
      />

      {/* Sweeping scanline */}
      <div className="holo-scan absolute inset-x-0 h-px bg-gradient-to-r from-transparent via-brand to-transparent shadow-[0_0_24px_4px_hsl(var(--brand)/0.6)]" />

      {/* Rotating reticle */}
      <div className="relative h-40 w-40">
        <div className="absolute inset-0 rounded-full border border-brand/40 [animation:holo-spin_8s_linear_infinite]" />
        <div className="absolute inset-3 rounded-full border border-dashed border-brand/30 [animation:holo-spin_14s_linear_infinite_reverse]" />
        <div className="absolute inset-8 rounded-full border border-brand/20" />
        <div className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand shadow-[0_0_18px_4px_hsl(var(--brand)/0.8)]" />
        {/* corner ticks */}
        {[0, 90, 180, 270].map((deg) => (
          <div
            key={deg}
            className="absolute left-1/2 top-1/2 h-20 w-px origin-top -translate-x-1/2 bg-brand/60"
            style={{ transform: `translate(-50%, 0) rotate(${deg}deg)` }}
          />
        ))}
      </div>

      {/* HUD */}
      <div className="absolute inset-x-4 bottom-4 space-y-2">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          <span className="holo-blink">// {phase}</span>
          <span className="tabular-nums text-brand/80">
            {progress.toString().padStart(3, "0")}%
          </span>
        </div>
        <div className="h-1 w-full overflow-hidden border border-brand/30 bg-brand/5">
          <div
            className="h-full bg-gradient-to-r from-brand/60 via-brand to-brand/60 shadow-[0_0_12px_hsl(var(--brand)/0.8)] transition-[width] duration-300 ease-out"
            style={{ width: `${Math.max(4, progress)}%` }}
          />
        </div>
      </div>

      {/* Corner brackets */}
      {[
        "left-2 top-2 border-l border-t",
        "right-2 top-2 border-r border-t",
        "left-2 bottom-2 border-l border-b",
        "right-2 bottom-2 border-r border-b",
      ].map((cls) => (
        <div key={cls} className={`absolute h-4 w-4 border-brand/60 ${cls}`} />
      ))}
    </div>
  );
}