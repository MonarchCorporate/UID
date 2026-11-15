import logo from "@/assets/idcp-logo.png.asset.json";

export function Footer() {
  return (
    <footer className="relative border-t border-white/5 bg-background py-20">
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col items-start justify-between gap-12 md:flex-row md:items-center">
          <div>
            <div className="mb-4 flex items-center gap-3">
              <img src={logo.url} alt="MRC" className="size-7 object-contain" width={28} height={28} />
              <span className="font-display text-xs tracking-[0.3em] text-foreground">MRC</span>
            </div>
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              Jenseits der Systeme. Jenseits der Grenzen.
            </p>
          </div>

          <div className="flex flex-wrap gap-12 text-[10px] font-bold uppercase tracking-[0.2em]">
            <div className="flex flex-col gap-4">
              <span className="text-muted-foreground/60">Navigation</span>
              <a href="#top" className="text-muted-foreground transition-colors hover:text-brand">Home</a>
              <a href="#about" className="text-muted-foreground transition-colors hover:text-brand">Manifest</a>
              <a href="#community" className="text-muted-foreground transition-colors hover:text-brand">Community</a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="text-muted-foreground/60">Verbindung</span>
              <a href="#" className="text-muted-foreground transition-colors hover:text-brand">Discord</a>
              <a href="#" className="text-muted-foreground transition-colors hover:text-brand">RSI Org</a>
              <a href="#" className="text-muted-foreground transition-colors hover:text-brand">Kontakt</a>
            </div>
            <div className="flex flex-col gap-4">
              <span className="text-muted-foreground/60">Bewerbung</span>
              <a href="#membership" className="text-muted-foreground transition-colors hover:text-brand">Beitreten</a>
              <a href="#vision" className="text-muted-foreground transition-colors hover:text-brand">Vision</a>
            </div>
          </div>
        </div>

        <div className="mt-20 flex flex-col justify-between gap-4 border-t border-white/5 pt-8 font-mono text-[9px] uppercase tracking-[0.3em] text-muted-foreground/60 md:flex-row">
          <span>© 2954 Monarch Royal Command</span>
          <span>Fan-Portal · nicht offiziell mit Cloud Imperium Games verbunden</span>
        </div>
      </div>
    </footer>
  );
}