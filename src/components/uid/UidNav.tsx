import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu, X, ChevronDown } from "lucide-react";
import uidLogo from "@/assets/uid-logo.png.asset.json";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const uidLinks = [
  { to: "/home2/community", label: "Was ist die UID" },
  { to: "/home2/einsatzbereiche", label: "Einsatzbereiche" },
  { to: "/home2/operationen", label: "Operationen" },
  { to: "/home2/mitgliedschaft", label: "Mitgliedschaft" },
  { to: "/kalender", label: "Kalender" },
  { to: "/flotte", label: "Flotte" },
] as const;

const topLinks = [
  { to: "/", label: "Start" },
  { to: "/shop", label: "Shop" },
  { to: "/handbuch", label: "Handbuch" },
  { to: "/login", label: "Login" },
] as const;

const linkCls =
  "uid-underline whitespace-nowrap text-muted-foreground transition-colors hover:text-brand text-[10px] uppercase tracking-[0.12em] font-medium 2xl:text-[11px] 2xl:tracking-[0.2em]";

export function UidNav() {
  const [open, setOpen] = useState(false);
  const [uidOpen, setUidOpen] = useState(false);

  return (
    <nav className="fixed top-0 z-50 w-full border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex h-18 max-w-7xl items-center justify-between gap-6 px-6 py-4">
        <Link to="/" className="flex items-center gap-3">
          <img
            src={uidLogo.url}
            alt="United Imperial Dominion Logo"
            className="size-10 object-contain"
            width={40}
            height={40}
          />
          <span className="hidden font-display text-[11px] tracking-[0.3em] text-foreground sm:block">
            UNITED IMPERIAL DOMINION
          </span>
        </Link>

        <div className="hidden items-center gap-3 xl:flex 2xl:gap-4">
          <Link
            to="/"
            activeOptions={{ exact: true }}
            activeProps={{ className: "text-brand" }}
            className={linkCls}
          >
            Start
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger
              className={`${linkCls} inline-flex items-center gap-1 outline-none`}
            >
              UID <ChevronDown className="size-3" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-[180px]">
              {uidLinks.map((l) => (
                <DropdownMenuItem asChild key={l.to}>
                  <Link
                    to={l.to}
                    activeProps={{ className: "text-brand" }}
                    className="text-xs uppercase tracking-[0.15em]"
                  >
                    {l.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {topLinks.slice(1).map((l) => (
            <Link
              key={l.to}
              to={l.to}
              activeOptions={{ exact: l.to === "/" }}
              activeProps={{ className: "text-brand" }}
              className={linkCls}
            >
              {l.label}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/bewerbung"
            className="hidden border border-brand/50 px-4 py-2 text-[10px] font-bold uppercase tracking-[0.2em] text-brand transition-colors hover:bg-brand hover:text-primary-foreground sm:block"
          >
            Beitreten
          </Link>
          <button
            type="button"
            aria-label="Menü"
            onClick={() => setOpen((v) => !v)}
            className="text-muted-foreground transition-colors hover:text-brand xl:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="uid-rise border-t border-border bg-background/95 px-6 py-4 xl:hidden">
          <div className="flex flex-col gap-4">
            <Link to="/" className={linkCls} onClick={() => setOpen(false)}>
              Start
            </Link>

            <button
              type="button"
              onClick={() => setUidOpen((v) => !v)}
              className="flex items-center justify-between py-1 text-left text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground transition-colors hover:text-brand 2xl:text-[11px] 2xl:tracking-[0.2em]"
            >
              UID
              <ChevronDown className={`size-3 transition-transform ${uidOpen ? "rotate-180" : ""}`} />
            </button>
            {uidOpen && (
              <div className="ml-3 flex flex-col gap-3 border-l border-border pl-4">
                {uidLinks.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:text-brand 2xl:text-[11px] 2xl:tracking-[0.2em]"
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </Link>
                ))}
              </div>
            )}

            {topLinks.slice(1).map((l) => (
              <Link key={l.to} to={l.to} className={linkCls} onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}