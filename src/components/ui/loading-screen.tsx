import { cn } from "@/lib/utils";

type LoadingScreenProps = {
  label?: string;
  hint?: string;
  className?: string;
  /** Number of skeleton card placeholders to render in the grid. */
  cards?: number;
};

/**
 * Designed loading screen matching the IDCP/United Imperial Dominion terminal aesthetic.
 * Shows an animated radar + label, followed by skeleton card placeholders so
 * the layout doesn't collapse while data streams in.
 */
export function LoadingScreen({
  label = "Lade Daten",
  hint = "// initialisiere datenstrom",
  className,
  cards = 6,
}: LoadingScreenProps) {
  return (
    <div className={cn("space-y-6", className)}>
      <div className="relative overflow-hidden border border-brand/20 bg-background/60 p-8">
        {/* scanlines */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent 0 2px, currentColor 2px 3px)",
          }}
        />
        {/* sweeping highlight */}
        <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[loading-sweep_2.2s_linear_infinite] bg-gradient-to-r from-transparent via-brand/15 to-transparent" />

        <div className="relative flex items-center gap-5">
          {/* radar */}
          <div className="relative h-16 w-16 shrink-0">
            <div className="absolute inset-0 rounded-full border border-brand/30" />
            <div className="absolute inset-2 rounded-full border border-brand/20" />
            <div className="absolute inset-4 rounded-full border border-brand/15" />
            <div className="absolute left-1/2 top-1/2 h-px w-px rounded-full bg-brand shadow-[0_0_8px_2px_var(--color-brand,theme(colors.primary.DEFAULT))]" />
            <div
              className="absolute inset-0 animate-[loading-spin_1.6s_linear_infinite] rounded-full"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0deg, color-mix(in oklab, var(--brand, currentColor) 55%, transparent) 60deg, transparent 90deg)",
              }}
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              {hint}
            </div>
            <div className="mt-1 flex items-baseline gap-2 font-display text-xl">
              <span>{label}</span>
              <span className="inline-flex">
                <span className="animate-[loading-dot_1.2s_infinite_0ms]">.</span>
                <span className="animate-[loading-dot_1.2s_infinite_200ms]">.</span>
                <span className="animate-[loading-dot_1.2s_infinite_400ms]">.</span>
              </span>
            </div>
            {/* progress bar */}
            <div className="mt-3 h-1 w-full overflow-hidden border border-brand/15 bg-background/40">
              <div className="h-full w-1/3 animate-[loading-bar_1.6s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-brand to-transparent" />
            </div>
          </div>
        </div>
      </div>

      {cards > 0 && (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: cards }).map((_, i) => (
            <div
              key={i}
              className="relative overflow-hidden border border-brand/10 bg-background/40 p-4"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <div className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 animate-[loading-sweep_2.4s_linear_infinite] bg-gradient-to-r from-transparent via-brand/10 to-transparent" />
              <div className="space-y-3">
                <div className="h-4 w-2/3 rounded-sm bg-brand/10" />
                <div className="h-3 w-1/2 rounded-sm bg-brand/5" />
                <div className="space-y-2 pt-2">
                  <div className="h-2 w-full rounded-sm bg-brand/10" />
                  <div className="h-2 w-5/6 rounded-sm bg-brand/10" />
                  <div className="h-2 w-3/4 rounded-sm bg-brand/10" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}