import { Link, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Target, Package, Building2, Menu } from "lucide-react";
import { useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

const tabs = [
  { label: "Start", to: "/dashboard", icon: LayoutDashboard, match: (p: string) => p === "/dashboard" },
  { label: "Einsätze", to: "/ops", icon: Target, match: (p: string) => p.startsWith("/ops") },
  { label: "Inventar", to: "/inventar", icon: Package, match: (p: string) => p.startsWith("/inventar") },
  { label: "Orga", to: "/orga", icon: Building2, match: (p: string) => p.startsWith("/orga") },
] as const;

/** Untere Tab-Leiste für Smartphones — App-artige Navigation in Daumenreichweite. */
export function MobileTabBar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { setOpenMobile, openMobile } = useSidebar();

  return (
    <nav className="uid-tabbar fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 md:hidden">
      {tabs.map((t) => {
        const active = t.match(pathname);
        const Icon = t.icon;
        return (
          <Link
            key={t.to}
            to={t.to}
            className={cn(
              "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors",
              active ? "text-brand" : "text-muted-foreground",
            )}
          >
            <Icon className="h-5 w-5 shrink-0" />
            <span className="w-full truncate text-center">{t.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setOpenMobile(!openMobile)}
        className={cn(
          "flex min-h-[56px] flex-col items-center justify-center gap-1 px-1 py-2 text-[10px] font-medium transition-colors",
          openMobile ? "text-brand" : "text-muted-foreground",
        )}
      >
        <Menu className="h-5 w-5 shrink-0" />
        <span className="w-full truncate text-center">Menü</span>
      </button>
    </nav>
  );
}