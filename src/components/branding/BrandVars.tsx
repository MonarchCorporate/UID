import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { applyBrandVars, isBackofficePath, readStoredBrand } from "@/lib/brand-vars";

/**
 * Wendet das zuletzt genutzte Orga-Branding im Backoffice an – auch auf Seiten
 * ohne BrandingProvider (Onboarding, Fehlerseiten, Modals/Toasts).
 * Öffentliche Seiten behalten das Ursprungsdesign.
 */
export function BrandVars() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useEffect(() => {
    if (!isBackofficePath(pathname)) return;
    const stored = readStoredBrand();
    if (!stored) return;
    return applyBrandVars(stored.primary, stored.accent);
  }, [pathname]);
  return null;
}
