import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Kleiner erklärender Hinweis, der oben auf einer Orga-Seite angezeigt wird,
 * wenn der Bereich ausgewählt ist. Fügt sich dezent in das Dashboard-Design ein.
 */
export function PageHint({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-md border border-brand/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand/70" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

