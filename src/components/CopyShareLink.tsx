import { useState } from "react";

type Props = {
  path: string;
  label?: string;
  className?: string;
};

/**
 * Renders the full shareable URL and a copy-to-clipboard button.
 * Uses window.location.origin at click-time so it works on preview,
 * production and custom domains without configuration.
 */
export function CopyShareLink({ path, label = "Link kopieren", className = "" }: Props) {
  const [copied, setCopied] = useState(false);
  const url =
    typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback: select text
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* ignore */ }
      document.body.removeChild(ta);
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      <code
        className="flex-1 min-w-0 truncate border border-white/10 bg-background/40 px-2 py-1.5 font-mono text-[11px] text-muted-foreground"
        title={url}
      >
        {url}
      </code>
      <button
        type="button"
        onClick={copy}
        className="whitespace-nowrap border border-brand/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
      >
        {copied ? "Kopiert ✓" : label}
      </button>
    </div>
  );
}