import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

/**
 * PageShell — ruhiges, "macOS-artiges" Seiten-Layout.
 * Großzügiger Header, weiche Trennlinie, konsistente Abstände.
 */
export function PageShell({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mx-auto w-full max-w-7xl space-y-8", className)}>
      <header className="flex flex-col gap-3 pb-2 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0 space-y-2">
          {eyebrow && (
            <div className="text-xs font-medium text-brand/80">{eyebrow}</div>
          )}
          <h1 className="break-words font-display text-2xl sm:text-3xl md:text-4xl tracking-tight leading-tight">
            {title}
          </h1>
          {description && (
            <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && (
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0">{actions}</div>
        )}
      </header>
      {children}
    </div>
  );
}

/** Sektions-Header für innere Abschnitte: Icon + Titel + Untertitel. */
export function SectionHeader({
  icon: Icon,
  title,
  subtitle,
  actions,
  className,
}: {
  icon?: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-end justify-between gap-3",
        className,
      )}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <div className="font-display text-base sm:text-lg leading-tight break-words">{title}</div>
          {subtitle && (
            <div className="text-xs text-muted-foreground">{subtitle}</div>
          )}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * StickyToolbar — bleibt unter dem App-Header (h-14) kleben, dezenter
 * Glas-Hintergrund. Ideal für Such-/Filter-Leisten.
 */
export function StickyToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "sticky top-14 z-30 -mx-4 md:-mx-8 border-b border-white/5 bg-background/70 px-4 md:px-8 py-3 backdrop-blur-xl",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2">
        {children}
      </div>
    </div>
  );
}

/** Kleine KPI-Kachel. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "default",
  to,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: "default" | "brand" | "emerald" | "amber" | "violet";
  /** Optionales Ziel — macht die Kachel klickbar. */
  to?: string;
}) {
  const toneCls =
    tone === "brand"
      ? "border-brand/30 bg-brand/[0.06]"
      : tone === "emerald"
      ? "border-emerald-500/25 bg-emerald-500/[0.06]"
      : tone === "amber"
      ? "border-amber-500/25 bg-amber-500/[0.06]"
      : tone === "violet"
      ? "border-violet-500/25 bg-violet-500/[0.06]"
      : "border-white/8 bg-card/50";
  const valueTone =
    tone === "emerald"
      ? "text-emerald-300"
      : tone === "amber"
      ? "text-amber-300"
      : tone === "violet"
      ? "text-violet-300"
      : tone === "brand"
      ? "text-brand"
      : "text-foreground";
  const inner = (
    <>
      {Icon && (
        <span className={cn("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-current/25 bg-current/10", valueTone)}>
          <Icon className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-muted-foreground truncate">{label}</div>
        <div className={cn("mt-1 font-display text-2xl leading-tight tabular-nums", valueTone)}>
          {value}
        </div>
        {hint && (
          <div className="mt-0.5 text-xs text-muted-foreground truncate">{hint}</div>
        )}
      </div>
    </>
  );
  const base = cn("flex items-start gap-3 rounded-2xl border p-4 backdrop-blur-sm", toneCls);
  if (to) {
    return (
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      <Link to={to as any} className={cn(base, "transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-card/70")}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={base}>
      {inner}
    </div>
  );
}

/** Reihe für KPI-Kacheln. */
export function StatGrid({
  children,
  cols = 4,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4;
}) {
  const grid =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={cn("grid gap-3", grid)}>{children}</div>;
}

export type StatusTone =
  | "emerald"
  | "amber"
  | "violet"
  | "brand"
  | "slate"
  | "rose";

/** Einheitliches Status-Badge mit konsistenten Farbcodes. */
export function StatusBadge({
  tone,
  children,
  icon: Icon,
  className,
}: {
  tone: StatusTone;
  children: ReactNode;
  icon?: LucideIcon;
  className?: string;
}) {
  const cls: Record<StatusTone, string> = {
    emerald: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
    amber: "border-amber-500/40 bg-amber-500/10 text-amber-300",
    violet: "border-violet-500/40 bg-violet-500/10 text-violet-300",
    brand: "border-brand/40 bg-brand/10 text-brand",
    slate: "border-white/15 bg-white/5 text-muted-foreground",
    rose: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium",
        cls[tone],
        className,
      )}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

/**
 * SegmentedNav — macOS-artige Pill-Navigation für Sub-Bereiche.
 * Nimmt eine Liste von Routen und markiert die aktive automatisch.
 */
export type SegmentedNavItem = {
  to: string;
  label: string;
  icon?: LucideIcon;
  exact?: boolean;
};

export function SegmentedNav({
  items,
  className,
}: {
  items: SegmentedNavItem[];
  className?: string;
}) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const isActive = (item: SegmentedNavItem) =>
    item.exact ? pathname === item.to : pathname === item.to || pathname.startsWith(item.to + "/");
  return (
    <nav
      className={cn(
        "inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/8 bg-card/50 p-1 backdrop-blur-md",
        className,
      )}
    >
      {items.map((item) => {
        const active = isActive(item);
        return (
          <Link
            key={item.to}
            to={item.to}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition",
              active
                ? "bg-brand/20 text-brand shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
                : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
            )}
          >
            {item.icon && <item.icon className="h-3.5 w-3.5" />}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}