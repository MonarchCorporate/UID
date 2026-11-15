import type { ReactNode } from "react";
import { UidNav } from "./UidNav";
import { UidFooter } from "./UidFooter";
import { UidBackdrop, type BackdropVariant } from "./UidBackdrop";
import { useReveal } from "@/hooks/use-reveal";
import { stagger } from "./UidBento";
import { SectionLabel } from "./UidUI";

/**
 * Gemeinsamer Rahmen für alle öffentlichen Seiten im UID-Design:
 * Theme-Tokens, Navigation, dezente Hintergrundebene und Footer.
 */
export function UidPage({
  children,
  backdrop = "full",
  seed = 909,
}: {
  children: ReactNode;
  backdrop?: BackdropVariant;
  seed?: number;
}) {
  return (
    <div className="uid-theme flex min-h-screen flex-col [overflow-x:clip]">
      <UidNav />
      <main className="relative flex-1 pt-18">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[80vh]">
          <UidBackdrop variant={backdrop} seed={seed} />
        </div>
        <div className="relative z-10">{children}</div>
      </main>
      <UidFooter />
    </div>
  );
}

/** Kopfbereich einer UID-Unterseite (Label, Titel, Intro, Aktionen). */
export function UidPageHeader({
  label,
  title,
  intro,
  actions,
  className = "",
}: {
  label: string;
  title: ReactNode;
  intro?: string;
  actions?: ReactNode;
  className?: string;
}) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`uid-reveal ${className}`}>
      <div className="uid-item" style={{ ["--d" as string]: "0ms" }}>
        <SectionLabel>{label}</SectionLabel>
      </div>
      <h1
        className="uid-item mt-4 font-display text-3xl leading-tight tracking-tight text-foreground md:text-5xl"
        style={{ ["--d" as string]: stagger(0, 90, 60) }}
      >
        {title}
      </h1>
      {intro && (
        <p
          className="uid-item mt-4 max-w-3xl text-sm leading-relaxed text-muted-foreground md:text-base"
          style={{ ["--d" as string]: stagger(1, 90, 60) }}
        >
          {intro}
        </p>
      )}
      {actions && (
        <div
          className="uid-item mt-6 flex flex-wrap gap-3"
          style={{ ["--d" as string]: stagger(2, 90, 60) }}
        >
          {actions}
        </div>
      )}
    </div>
  );
}

export const uidBtn =
  "uid-btn uid-focus inline-block border border-brand/50 px-5 py-2.5 text-[10px] font-bold uppercase tracking-[0.25em] text-brand transition-colors hover:bg-brand hover:text-primary-foreground";
