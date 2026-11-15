import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Bildfeld mit Vorschau: hochladen oder URL einfügen.
 * Der Upload wird von außen bereitgestellt, damit die Komponente
 * nichts über die Orga wissen muss.
 */
export function ImageField({
  label,
  value,
  onChange,
  onUpload,
  className,
}: {
  label: string;
  value?: string | null;
  onChange: (url: string) => void;
  onUpload?: (file: File) => Promise<string>;
  className?: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = async (file?: File | null) => {
    if (!file || !onUpload) return;
    setBusy(true);
    try {
      onChange(await onUpload(file));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn("space-y-1.5", className)}>
      <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <div className="flex items-center gap-2">
        <div className="flex h-12 w-16 shrink-0 items-center justify-center overflow-hidden rounded border border-white/10 bg-black/40">
          {value ? (
            <img src={value} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-1.5">
          <Input
            className="h-8 text-xs"
            placeholder="https://… oder hochladen"
            value={value ?? ""}
            onChange={(e) => onChange(e.target.value)}
          />
          <div className="flex gap-1.5">
            {onUpload && (
              <>
                <input
                  ref={input}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void pick(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={busy}
                  onClick={() => input.current?.click()}
                >
                  {busy ? (
                    <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                  ) : (
                    <ImagePlus className="mr-1 h-3 w-3" />
                  )}
                  Hochladen
                </Button>
              </>
            )}
            {value && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-[11px] text-destructive"
                onClick={() => onChange("")}
              >
                <Trash2 className="mr-1 h-3 w-3" /> Entfernen
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
