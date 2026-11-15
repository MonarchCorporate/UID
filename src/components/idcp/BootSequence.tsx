import { useEffect, useState } from "react";

const lines = [
  "> INIT MRC-TERMINAL v4.9.22",
  "> VERBINDUNG WIRD AUFGEBAUT · STANTON-ARRAY",
  "> AUTH-HANDSHAKE · OK",
  "> MANIFEST WIRD ENTSCHLÜSSELT · ████████ 100%",
  "> SIGNAL EMPFANGEN",
];

export function BootSequence() {
  const [shown, setShown] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(false);
      return;
    }
    if (sessionStorage.getItem("idcp-booted")) {
      setShown(false);
      return;
    }
    sessionStorage.setItem("idcp-booted", "1");
    document.body.style.overflow = "hidden";
    const timers: number[] = [];
    lines.forEach((_, i) => {
      timers.push(window.setTimeout(() => setStep(i + 1), 180 + i * 220));
    });
    timers.push(
      window.setTimeout(() => {
        setShown(false);
        document.body.style.overflow = "";
      }, 1600),
    );
    return () => {
      timers.forEach(clearTimeout);
      document.body.style.overflow = "";
    };
  }, []);

  if (!shown) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-background transition-opacity duration-500"
      aria-hidden
    >
      <div className="scanlines-overlay absolute inset-0" />
      <div className="relative w-full max-w-lg px-6 font-mono text-[11px] uppercase tracking-[0.2em] text-brand/90">
        <div className="mb-6 flex items-center justify-between text-[9px] text-brand/60">
          <span>MRC // STARTSEQUENZ</span>
          <span className="animate-tele-tick">● LIVE</span>
        </div>
        <ul className="space-y-2">
          {lines.slice(0, step).map((l, i) => (
            <li key={i} className="animate-fade-up">
              {l}
            </li>
          ))}
          {step < lines.length && (
            <li className="text-brand/70">
              <span className="animate-cursor-blink">▌</span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
