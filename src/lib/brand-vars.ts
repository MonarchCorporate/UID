/**
 * Zentrale Anwendung des Orga-Brandings (Primär- und Akzentfarbe) auf die
 * globalen Design-Tokens. Wird vom Backoffice, den öffentlichen Orga-Seiten
 * und vor dem Login (gespeichertes Branding) genutzt.
 */
export const BRAND_STORAGE_KEY = "monarch.brand";

/**
 * Pfad-Präfixe des Backoffice. Nur dort wird das Orga-Branding angewendet –
 * die öffentliche Hauptseite behält immer das Ursprungsdesign.
 */
export const BACKOFFICE_PATH_PREFIXES = [
  "/dashboard",
  "/admin",
  "/orga",
  "/ops",
  "/missions",
  "/board",
  "/crafting",
  "/blueprints",
  "/inventar",
  "/items",
  "/materialien",
  "/handel",
  "/einkauf",
  "/marketplace",
  "/farm-lists",
  "/loadout-editor",
  "/loadouts",
  "/meine-flotte",
  "/profil",
  "/onboarding",
  "/benachrichtigungen",
];

export function isBackofficePath(pathname: string): boolean {
  return BACKOFFICE_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
}

export const DEFAULT_BRAND_PRIMARY = "#FFBF00";
export const DEFAULT_BRAND_ACCENT = "#3b82f6";

/** Liefert eine gut lesbare Vordergrundfarbe zu einer Markenfarbe. */
export function readableOn(color: string): string {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return "oklch(0.10 0.01 250)";
  let hex = m[1];
  if (hex.length === 3) hex = hex.split("").map((c) => c + c).join("");
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.45 ? "oklch(0.10 0.01 250)" : "oklch(0.98 0 0)";
}

export function brandVars(primary: string, accent: string): Record<string, string> {
  // Achtung: Es werden bewusst `--b-*`-Override-Variablen gesetzt (nicht die
  // Tokens direkt). Die Tokens in styles.css lesen diese Overrides per
  // `var(--b-token, default)`, damit auch Blöcke wie `.uid-theme`, die die
  // Tokens auf einem tieferen Element neu definieren, das Orga-Branding
  // übernehmen statt es zu überschreiben.
  return {
    "--b-brand": primary,
    "--b-brand-dim": `color-mix(in oklab, ${primary} 55%, black)`,
    "--b-primary": primary,
    "--b-primary-foreground": readableOn(primary),
    "--b-accent": accent,
    "--b-accent-foreground": readableOn(accent),
    "--b-ring": primary,
    "--b-sidebar-primary": primary,
    "--b-sidebar-primary-foreground": readableOn(primary),
    "--b-sidebar-accent": `color-mix(in oklab, ${accent} 18%, transparent)`,
    "--b-sidebar-ring": primary,
    "--brand-accent": accent,
  };
}

/**
 * Setzt die Tokens auf <html> und gibt eine Cleanup-Funktion zurück, die den
 * vorherigen Zustand wiederherstellt (statt die Variablen zu löschen) – so
 * überschreibt eine temporäre Vorschau das gespeicherte Branding nicht dauerhaft.
 */
export function applyBrandVars(primary: string, accent: string): () => void {
  if (typeof document === "undefined") return () => {};
  const root = document.documentElement;
  const vars = brandVars(primary, accent);
  const prev: Record<string, string> = {};
  for (const k of Object.keys(vars)) prev[k] = root.style.getPropertyValue(k);
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  return () => {
    for (const k of Object.keys(vars)) {
      if (prev[k]) root.style.setProperty(k, prev[k]);
      else root.style.removeProperty(k);
    }
  };
}

export function storeBrand(primary: string, accent: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(BRAND_STORAGE_KEY, JSON.stringify({ primary, accent }));
  } catch {
    /* ignore */
  }
}

export function readStoredBrand(): { primary: string; accent: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BRAND_STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { primary?: string; accent?: string };
    if (!v?.primary) return null;
    return { primary: v.primary, accent: v.accent ?? DEFAULT_BRAND_ACCENT };
  } catch {
    return null;
  }
}

/** Entfernt gespeichertes Branding (z. B. beim Logout / Nutzerwechsel). */
export function clearStoredBrand() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(BRAND_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    for (const k of Object.keys(brandVars(DEFAULT_BRAND_PRIMARY, DEFAULT_BRAND_ACCENT))) {
      root.style.removeProperty(k);
    }
  }
}

/**
 * Inline-Skript für den <head>: wendet gespeichertes Branding noch vor dem
 * ersten Paint an, damit nach einem Hard-Reload kein Farbflackern entsteht.
 */
export const BRAND_BOOT_SCRIPT = `(function(){try{
var pfx=${JSON.stringify(BACKOFFICE_PATH_PREFIXES)};var path=location.pathname;
var ok=false;for(var i=0;i<pfx.length;i++){if(path===pfx[i]||path.indexOf(pfx[i]+'/')===0){ok=true;break}}
if(!ok)return;
var raw=localStorage.getItem(${JSON.stringify(BRAND_STORAGE_KEY)});if(!raw)return;
var b=JSON.parse(raw);var p=b&&b.primary;if(!p)return;var a=(b&&b.accent)||${JSON.stringify(DEFAULT_BRAND_ACCENT)};
function fg(c){var m=/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(c).trim());if(!m)return'oklch(0.10 0.01 250)';var h=m[1];if(h.length===3){h=h.split('').map(function(x){return x+x}).join('')}
function ch(i){var v=parseInt(h.substr(i,2),16)/255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4)}
var L=0.2126*ch(0)+0.7152*ch(2)+0.0722*ch(4);return L>0.45?'oklch(0.10 0.01 250)':'oklch(0.98 0 0)'}
var s=document.documentElement.style;var v={'--b-brand':p,'--b-brand-dim':'color-mix(in oklab, '+p+' 55%, black)','--brand-accent':a,'--b-primary':p,'--b-primary-foreground':fg(p),'--b-accent':a,'--b-accent-foreground':fg(a),'--b-ring':p,'--b-sidebar-primary':p,'--b-sidebar-primary-foreground':fg(p),'--b-sidebar-accent':'color-mix(in oklab, '+a+' 18%, transparent)','--b-sidebar-ring':p};
for(var k in v){s.setProperty(k,v[k])}}catch(e){}})();`;
