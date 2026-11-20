import type { ReactNode } from "react";
import { useReveal } from "@/hooks/use-reveal";
import { UidBackdrop, type BackdropVariant } from "./UidBackdrop";
import { stagger } from "./UidBento";
import { UidDecodeText } from "./UidDecodeText";

export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px w-8 bg-brand" />
      <span className="font-mono text-[10px] uppercase tracking-[0.4em] text-brand">{children}</span>
    </div>
  );
}

export function SectionHeader({
  label,
  title,
  intro,
  center,
}: {
  label: string;
  title: string;
  intro?: string[];
  center?: boolean;
}) {
  return (
    <header className={center ? "mx-auto max-w-3xl text-center" : "max-w-3xl"}>
      <div
        className={`uid-item ${center ? "flex justify-center" : ""}`}
        style={{ ["--d" as string]: "0ms" }}
      >
        <SectionLabel>{label}</SectionLabel>
      </div>
      <h2
        className="uid-item mt-4 font-display text-2xl leading-tight tracking-tight text-foreground md:text-4xl"
        style={{ ["--d" as string]: "90ms" }}
      >
        <UidDecodeText text={title} trigger="visible" delay={220} step={22} />
      </h2>
      {intro?.map((p, i) => (
        <p
          key={p}
          className="uid-item mt-4 text-sm leading-relaxed text-muted-foreground md:text-base"
          style={{ ["--d" as string]: stagger(i, 170, 60) }}
        >
          {p}
        </p>
      ))}
    </header>
  );
}

export function Section({
  id,
  children,
  tone = "plain",
  backdrop = "none",
  seed = 1234,
  compact,
}: {
  id?: string;
  children: ReactNode;
  tone?: "plain" | "band" | "deep";
  backdrop?: BackdropVariant;
  seed?: number;
  compact?: boolean;
}) {
  const ref = useReveal<HTMLDivElement>();
  const toneClass = tone === "band" ? "uid-band" : tone === "deep" ? "uid-deep" : "";
  return (
    <section
      id={id}
      className={`relative scroll-mt-24 overflow-hidden border-t border-border ${
        compact ? "py-12 md:py-16" : "py-20 md:py-28"
      } ${toneClass}`}
    >
      <UidBackdrop variant={backdrop} seed={seed} />
      <div ref={ref} className="uid-reveal relative mx-auto max-w-6xl px-6">
        {children}
      </div>
    </section>
  );
}

export function BulletList({ items, cols = 2 }: { items: string[]; cols?: 1 | 2 | 3 }) {
  const grid = cols === 1 ? "" : cols === 3 ? "sm:grid-cols-2 lg:grid-cols-3" : "sm:grid-cols-2";
  return (
    <ul className={`grid gap-2 ${grid}`}>
      {items.map((it, i) => (
        <li
          key={it}
          style={{ ["--d" as string]: stagger(i, 120, 50) }}
          className="uid-item flex items-start gap-3 border-l border-brand/30 bg-card/40 px-4 py-2.5 text-sm text-foreground/85 transition-[transform,border-color,background-color] duration-300 hover:translate-x-1 hover:border-brand hover:bg-card/70"
        >
          <span className="mt-2 size-1.5 shrink-0 bg-brand" />
          <span>{it}</span>
        </li>
      ))}
    </ul>
  );
}

export function InfoCard({
  title,
  children,
  eyebrow,
}: {
  title: string;
  children: ReactNode;
  eyebrow?: string;
}) {
  return (
    <article className="uid-card uid-item group p-6">
      {eyebrow && (
        <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">{eyebrow}</div>
      )}
      <h3 className="font-display text-sm uppercase tracking-[0.2em] text-foreground transition-colors group-hover:text-brand">
        {title}
      </h3>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </article>
  );
}

export function Quote({ children }: { children: ReactNode }) {
  return (
    <p
      className="uid-item border-y border-brand/25 py-6 text-center font-display text-lg tracking-tight text-foreground md:text-2xl"
      style={{ ["--d" as string]: "120ms" }}
    >
      {children}
    </p>
  );
}

export function Prose({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="space-y-4">
      {paragraphs.map((p, i) => (
        <p
          key={p}
          style={{ ["--d" as string]: stagger(i, 80, 60) }}
          className="uid-item text-sm leading-relaxed text-muted-foreground md:text-base"
        >
          {p}
        </p>
      ))}
    </div>
  );
}