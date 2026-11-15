import { useCallback, useEffect, useState } from "react";

type NavSection = { id: string; label: string };

const FALLBACK: NavSection[] = [
  { id: "top", label: "SIGNAL" },
  { id: "about", label: "MANIFEST" },
  { id: "community", label: "CREW" },
  { id: "vision", label: "VISION" },
  { id: "fleet", label: "FLOTTE" },
  { id: "membership", label: "BEITRETEN" },
];

function collect(): NavSection[] {
  if (typeof document === "undefined") return [];
  const found: NavSection[] = [];
  document.querySelectorAll<HTMLElement>("[data-nav-tag]").forEach((el) => {
    const label = (el.dataset.navTag ?? "").trim();
    if (!label || !el.id) return;
    if (found.some((f) => f.id === el.id)) return;
    found.push({ id: el.id, label });
  });
  if (found.length > 0) return found;
  return FALLBACK.filter((s) => document.getElementById(s.id));
}

export function ScrollProgress() {
  const [sections, setSections] = useState<NavSection[]>([]);
  const [active, setActive] = useState("");
  const [progress, setProgress] = useState(0);

  const sync = useCallback((list: NavSection[]) => {
    const h = document.documentElement;
    const max = h.scrollHeight - h.clientHeight;
    setProgress(max > 0 ? (h.scrollTop / max) * 100 : 0);

    let current = list[0]?.id ?? "";
    for (const s of list) {
      const el = document.getElementById(s.id);
      if (!el) continue;
      if (el.getBoundingClientRect().top <= window.innerHeight * 0.4) current = s.id;
    }
    setActive(current);
  }, []);

  useEffect(() => {
    let list = collect();
    setSections(list);
    sync(list);

    const onScroll = () => sync(list);
    window.addEventListener("scroll", onScroll, { passive: true });

    // Blöcke können nachladen (Flotte, Kalender, Shop) -> Liste beobachten
    const observer = new MutationObserver(() => {
      const next = collect();
      if (
        next.length !== list.length ||
        next.some((s, i) => s.id !== list[i]?.id || s.label !== list[i]?.label)
      ) {
        list = next;
        setSections(next);
        sync(next);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer.disconnect();
    };
  }, [sync]);

  const go = (e: React.MouseEvent, id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    e.preventDefault();
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  if (sections.length === 0) return null;

  return (
    <>
      {/* Top progress bar */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-px bg-white/5">
        <div
          className="h-full bg-brand shadow-[0_0_12px_var(--brand)] transition-[width] duration-150"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Right HUD nav */}
      <nav
        aria-label="Section navigation"
        className="pointer-events-none fixed right-6 top-1/2 z-40 hidden -translate-y-1/2 flex-col gap-3 lg:flex"
      >
        {sections.map((s, i) => {
          const isActive = active === s.id;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={(e) => go(e, s.id)}
              title={s.label}
              className="pointer-events-auto group flex items-center justify-end gap-3"
            >
              <span
                className={`max-w-[220px] truncate font-mono text-[9px] uppercase tracking-[0.3em] transition-all ${
                  isActive ? "text-brand opacity-100" : "text-muted-foreground/40 opacity-0 group-hover:opacity-100"
                }`}
              >
                {String(i + 1).padStart(2, "0")} // {s.label}
              </span>
              <span
                className={`block h-px transition-all ${
                  isActive ? "w-10 bg-brand shadow-[0_0_8px_var(--brand)]" : "w-4 bg-muted-foreground/30 group-hover:w-6 group-hover:bg-brand/60"
                }`}
              />
            </a>
          );
        })}
      </nav>
    </>
  );
}
