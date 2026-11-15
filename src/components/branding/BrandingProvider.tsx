import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listMyOrgs, type OrgBranding, type OrgSummary } from "@/lib/orgs.functions";
import {
  DEFAULT_BRAND_ACCENT,
  DEFAULT_BRAND_PRIMARY,
  applyBrandVars,
  storeBrand,
} from "@/lib/brand-vars";

export type ActiveBranding = {
  org: OrgSummary | null;
  orgs: OrgSummary[];
  setActiveOrgId: (id: string) => void;
  name: string;
  tag: string | null;
  logoUrl: string | null;
  primary: string;
  accent: string;
  heroTitle: string | null;
  heroSubtitle: string | null;
  showFleet: boolean;
  showCalendar: boolean;
  showShop: boolean;
};

const DEFAULT_PRIMARY = DEFAULT_BRAND_PRIMARY;
const DEFAULT_ACCENT = DEFAULT_BRAND_ACCENT;
const ACTIVE_ORG_STORAGE_KEY = "monarch.activeOrgId";

const BrandingContext = createContext<ActiveBranding>({
  org: null,
  orgs: [],
  setActiveOrgId: () => {},
  name: "Monarch",
  tag: null,
  logoUrl: null,
  primary: DEFAULT_PRIMARY,
  accent: DEFAULT_ACCENT,
  heroTitle: null,
  heroSubtitle: null,
  showFleet: true,
  showCalendar: true,
  showShop: true,
});

export function useBranding() {
  return useContext(BrandingContext);
}

/**
 * Applies the current user's org branding as CSS variables on <html>
 * and provides name/logo/hero text via context.
 */
export function BrandingProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  const listFn = useServerFn(listMyOrgs);
  const q = useQuery({
    queryKey: ["my-orgs"],
    queryFn: () => listFn(),
    enabled,
  });
  const orgs = useMemo(() => q.data?.orgs ?? [], [q.data?.orgs]);

  const [activeOrgId, setActiveOrgIdState] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(ACTIVE_ORG_STORAGE_KEY);
  });

  const setActiveOrgId = (id: string) => {
    setActiveOrgIdState(id);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, id);
    }
  };

  const org =
    orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;

  useEffect(() => {
    if (org && org.id !== activeOrgId && typeof window !== "undefined") {
      window.localStorage.setItem(ACTIVE_ORG_STORAGE_KEY, org.id);
    }
  }, [org, activeOrgId]);

  const b: OrgBranding = org?.branding ?? {};

  const value = useMemo<ActiveBranding>(
    () => ({
      org,
      orgs,
      setActiveOrgId,
      name: org?.name ?? "Monarch",
      tag: org?.tag ?? null,
      logoUrl: b.logo_url ?? null,
      primary: b.primary ?? DEFAULT_PRIMARY,
      accent: b.accent ?? DEFAULT_ACCENT,
      heroTitle: b.hero_title?.trim() || null,
      heroSubtitle: b.hero_subtitle?.trim() || null,
      showFleet: b.show_fleet ?? true,
      showCalendar: b.show_calendar ?? true,
      showShop: b.show_shop ?? true,
    }),
    [org, orgs, b.logo_url, b.primary, b.accent, b.hero_title, b.hero_subtitle, b.show_fleet, b.show_calendar, b.show_shop],
  );

  useEffect(() => {
    storeBrand(value.primary, value.accent);
    return applyBrandVars(value.primary, value.accent);
  }, [value.primary, value.accent]);

  return <BrandingContext.Provider value={value}>{children}</BrandingContext.Provider>;
}