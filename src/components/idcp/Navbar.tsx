import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown } from "lucide-react";
import logo from "@/assets/idcp-logo.png.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const verse = [
  { label: "Manifest", href: "/#about" },
  { label: "Community", href: "/#community" },
  { label: "Vision", href: "/#vision" },
];

const linkCls =
  "text-muted-foreground transition-colors hover:text-brand text-[11px] uppercase tracking-[0.2em] font-medium";

export function Navbar() {
  const [open, setOpen] = useState(false);
  const [verseOpen, setVerseOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-white/5 bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between px-6">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo.url} alt="MRC logo" className="size-9 object-contain" width={36} height={36} />
          <span className="font-display text-xs tracking-[0.3em] text-foreground">MONARCH ROYAL COMMAND</span>
        </Link>

        <div className="hidden items-center gap-8 md:flex">
          <a href="/#top" className={linkCls}>Start</a>

          <DropdownMenu>
            <DropdownMenuTrigger className={`${linkCls} inline-flex items-center gap-1 outline-none`}>
              Verse <ChevronDown className="h-3 w-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[160px]">
              {verse.map((v) => (
                <DropdownMenuItem asChild key={v.label}>
                  <a href={v.href} className="text-xs uppercase tracking-[0.2em]">{v.label}</a>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Link to="/flotte" className={linkCls}>Flotte</Link>
          <Link to="/schiffskatalog" className={linkCls}>Schiffskatalog</Link>
          <Link to="/kalender" className={linkCls}>Kalender</Link>
          <a href="/#membership" className={linkCls}>Beitreten</a>
        </div>

        <div className="hidden items-center gap-3 md:flex">
          <Link
            to="/dashboard"
            className="px-4 py-2 border border-white/15 text-muted-foreground text-[10px] uppercase tracking-[0.2em] font-bold transition-all hover:border-brand/40 hover:text-brand"
          >
            Backoffice
          </Link>
          <a
            href="/#membership"
            className="px-5 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.2em] font-bold transition-all hover:bg-brand hover:text-primary-foreground"
          >
            Jetzt bewerben
          </a>
        </div>

        <button
          aria-label="Menu"
          className="md:hidden text-brand"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="space-y-1.5">
            <span className="block h-px w-6 bg-current" />
            <span className="block h-px w-6 bg-current" />
            <span className="block h-px w-4 bg-current ml-auto" />
          </div>
        </button>
      </div>

      {open && (
        <div className="md:hidden border-t border-white/5 bg-background/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-col gap-1 px-6 py-4">
            <a href="/#top" onClick={() => setOpen(false)} className="py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-brand">Start</a>

            <button
              onClick={() => setVerseOpen((v) => !v)}
              className="flex items-center justify-between py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-brand"
            >
              Verse <ChevronDown className={`h-3 w-3 transition-transform ${verseOpen ? "rotate-180" : ""}`} />
            </button>
            {verseOpen && (
              <div className="ml-4 flex flex-col gap-1 border-l border-white/10 pl-3">
                {verse.map((v) => (
                  <a
                    key={v.label}
                    href={v.href}
                    onClick={() => setOpen(false)}
                    className="py-1.5 text-[11px] uppercase tracking-[0.2em] text-muted-foreground hover:text-brand"
                  >
                    {v.label}
                  </a>
                ))}
              </div>
            )}

            <Link to="/flotte" onClick={() => setOpen(false)} className="py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-brand">Flotte</Link>
            <Link to="/schiffskatalog" onClick={() => setOpen(false)} className="py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-brand">Schiffskatalog</Link>
            <Link to="/kalender" onClick={() => setOpen(false)} className="py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-brand">Kalender</Link>
            <a href="/#membership" onClick={() => setOpen(false)} className="py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground hover:text-brand">Beitreten</a>

            <div className="mt-3 flex flex-col gap-2 border-t border-white/5 pt-3">
              <Link
                to="/dashboard"
                onClick={() => setOpen(false)}
                className="px-4 py-2 border border-white/15 text-center text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground"
              >
                Backoffice
              </Link>
              <a
                href="/#membership"
                onClick={() => setOpen(false)}
                className="px-4 py-2 border border-brand/40 text-center text-[10px] uppercase tracking-[0.2em] font-bold text-brand"
              >
                Jetzt bewerben
              </a>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}