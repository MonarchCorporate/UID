import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkOrgSlugAvailable } from "@/lib/orgs.functions";
import { validateSlugFormat } from "@/lib/slugify";
import { cn } from "@/lib/utils";

export type SlugStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "invalid"; message: string }
  | { kind: "taken" }
  | { kind: "available" };

/** Reusable slug input with debounced availability check. */
export function SlugField({
  value,
  onChange,
  excludeOrgId,
  originalSlug,
  onStatusChange,
  label = "Slug (URL)",
  disabled,
  id = "slug",
}: {
  value: string;
  onChange: (next: string) => void;
  excludeOrgId?: string;
  originalSlug?: string;
  onStatusChange?: (status: SlugStatus) => void;
  label?: string;
  disabled?: boolean;
  id?: string;
}) {
  const checkFn = useServerFn(checkOrgSlugAvailable);
  const [status, setStatus] = useState<SlugStatus>({ kind: "idle" });
  const seq = useRef(0);

  const trimmed = value.trim().toLowerCase();
  const formatError = useMemo(
    () => (trimmed ? validateSlugFormat(trimmed) : null),
    [trimmed],
  );

  useEffect(() => {
    onStatusChange?.(status);
  }, [status, onStatusChange]);

  useEffect(() => {
    if (!trimmed) {
      setStatus({ kind: "idle" });
      return;
    }
    if (formatError) {
      setStatus({ kind: "invalid", message: formatError });
      return;
    }
    if (originalSlug && trimmed === originalSlug) {
      setStatus({ kind: "available" });
      return;
    }
    setStatus({ kind: "checking" });
    const mySeq = ++seq.current;
    const t = setTimeout(async () => {
      try {
        const res = await checkFn({
          data: { slug: trimmed, excludeOrgId },
        });
        if (mySeq !== seq.current) return;
        if (res.available) setStatus({ kind: "available" });
        else if (res.reason === "invalid")
          setStatus({ kind: "invalid", message: "Ungültiges Format." });
        else setStatus({ kind: "taken" });
      } catch (e) {
        if (mySeq !== seq.current) return;
        setStatus({
          kind: "invalid",
          message: (e as Error).message ?? "Prüfung fehlgeschlagen",
        });
      }
    }, 350);
    return () => clearTimeout(t);
  }, [trimmed, formatError, originalSlug, excludeOrgId, checkFn]);

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.toLowerCase())}
        maxLength={32}
        disabled={disabled}
        placeholder="monarch"
        className={cn(
          "font-mono",
          status.kind === "taken" || status.kind === "invalid"
            ? "border-destructive"
            : status.kind === "available"
              ? "border-emerald-500/60"
              : undefined,
        )}
      />
      <SlugStatusHint status={status} />
    </div>
  );
}

function SlugStatusHint({ status }: { status: SlugStatus }) {
  if (status.kind === "idle")
    return (
      <p className="text-xs text-muted-foreground">
        Kleinbuchstaben, Zahlen und Bindestriche.
      </p>
    );
  if (status.kind === "checking")
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> Prüfe Verfügbarkeit …
      </p>
    );
  if (status.kind === "available")
    return (
      <p className="flex items-center gap-1 text-xs text-emerald-500">
        <CheckCircle2 className="h-3 w-3" /> Slug ist verfügbar.
      </p>
    );
  if (status.kind === "taken")
    return (
      <p className="flex items-center gap-1 text-xs text-destructive">
        <XCircle className="h-3 w-3" /> Slug ist bereits vergeben.
      </p>
    );
  return (
    <p className="flex items-center gap-1 text-xs text-destructive">
      <XCircle className="h-3 w-3" /> {status.message}
    </p>
  );
}

/** Convenience: `true` when the field is safe to submit. */
export function isSlugSubmittable(status: SlugStatus): boolean {
  return status.kind === "available";
}