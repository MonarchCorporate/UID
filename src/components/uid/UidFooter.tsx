import { Link } from "@tanstack/react-router";
import { UID_DISCORD, UID_MOTTO } from "./content";
import uidLogo from "@/assets/uid-logo.png.asset.json";

export function UidFooter() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-6xl px-6 py-14">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <img
                src={uidLogo.url}
                alt="United Imperial Dominion Logo"
                className="size-12 object-contain"
                width={48}
                height={48}
              />
              <div className="font-display text-sm tracking-[0.3em] text-foreground">
                UNITED IMPERIAL DOMINION
              </div>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">{UID_MOTTO}</p>
          </div>
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">Community</div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><Link to="/home2/community" className="hover:text-brand">Über die UID</Link></li>
              <li><Link to="/home2/einsatzbereiche" className="hover:text-brand">Einsatzbereiche</Link></li>
              <li><Link to="/home2/operationen" className="hover:text-brand">Operationen</Link></li>
              <li><Link to="/home2/struktur" className="hover:text-brand">Struktur & Grundsätze</Link></li>
              <li><Link to="/handbuch" className="hover:text-brand">Handbuch: Funktionen</Link></li>
            </ul>
          </div>
          <div>
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">Kontakt</div>
            <ul className="space-y-2 text-xs text-muted-foreground">
              <li><Link to="/home2/mitgliedschaft" className="hover:text-brand">Mitgliedschaft</Link></li>
              <li>
                <a href={UID_DISCORD} target="_blank" rel="noreferrer" className="hover:text-brand">
                  Discord
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="mt-10 border-t border-border pt-6 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          © {new Date().getFullYear()} United Imperial Dominion · Star Citizen Community
        </div>
      </div>
    </footer>
  );
}