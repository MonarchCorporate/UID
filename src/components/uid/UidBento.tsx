import { Children, cloneElement, isValidElement, type ReactNode, type PointerEvent } from "react";
import { Link } from "@tanstack/react-router";

const spanMap = {
  sm: "md:col-span-2",
  md: "md:col-span-3",
  lg: "md:col-span-4",
  xl: "md:col-span-6",
} as const;

const rowMap = {
  1: "",
  2: "md:row-span-2",
} as const;

export type TileSpan = keyof typeof spanMap;

/** Einheitliches Stagger-Timing für alle Sektionen */
export const stagger = (i: number, base = 0, step = 70, cap = 560) =>
  `${Math.min(base + i * step, base + cap)}ms`;

export function BentoGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  const items = Children.toArray(children).map((child, i) =>
    isValidElement<{ revealIndex?: number }>(child) && typeof child.type !== "string"
      ? cloneElement(child, { revealIndex: child.props.revealIndex ?? i })
      : child,
  );
  return <div className={`grid gap-4 md:grid-cols-6 ${className}`}>{items}</div>;
}

function trackGlow(e: PointerEvent<HTMLElement>) {
  const el = e.currentTarget;
  const r = el.getBoundingClientRect();
  el.style.setProperty("--mx", `${e.clientX - r.left}px`);
  el.style.setProperty("--my", `${e.clientY - r.top}px`);
}

function centerGlow(e: { currentTarget: HTMLElement }) {
  const el = e.currentTarget;
  el.style.setProperty("--mx", "50%");
  el.style.setProperty("--my", "50%");
}

type BaseProps = {
  children: ReactNode;
  span?: TileSpan;
  rows?: 1 | 2;
  className?: string;
  revealIndex?: number;
};

export function BentoTile({
  children,
  span = "md",
  rows = 1,
  className = "",
  revealIndex = 0,
}: BaseProps) {
  return (
    <div
      onPointerMove={trackGlow}
      style={{ ["--d" as string]: stagger(revealIndex) }}
      className={`uid-tile uid-tile-corner uid-item p-6 md:p-7 ${spanMap[span]} ${rowMap[rows]} ${className}`}
    >
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}

export function BentoLinkTile({
  children,
  span = "md",
  rows = 1,
  className = "",
  revealIndex = 0,
  to,
  hash,
}: BaseProps & { to: string; hash?: string }) {
  return (
    <Link
      to={to}
      hash={hash}
      onPointerMove={trackGlow}
      onFocus={centerGlow}
      style={{ ["--d" as string]: stagger(revealIndex) }}
      className={`uid-tile uid-tile-corner uid-item group block p-6 md:p-7 ${spanMap[span]} ${rowMap[rows]} ${className}`}
    >
      <div className="relative z-10 h-full">{children}</div>
    </Link>
  );
}

export function TileLabel({ children }: { children: ReactNode }) {
  return (
    <div className="font-mono text-[10px] uppercase tracking-[0.35em] text-brand">{children}</div>
  );
}

export function TileTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="mt-3 font-display text-sm uppercase tracking-[0.14em] text-foreground transition-colors group-hover:text-brand">
      {children}
    </h3>
  );
}

export function TileBody({ children }: { children: ReactNode }) {
  return <div className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>;
}
