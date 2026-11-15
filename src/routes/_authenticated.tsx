import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { UidBackdrop } from "@/components/uid/UidBackdrop";
import uidLogo from "@/assets/uid-logo.png.asset.json";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/dashboard/AppSidebar";
import { MobileTabBar } from "@/components/dashboard/MobileTabBar";
import { CommandPalette } from "@/components/dashboard/CommandPalette";
import { getMyRoles } from "@/lib/loadouts.functions";
import { getOnboardingStatus } from "@/lib/onboarding.functions";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { Search, Command as CommandIcon } from "lucide-react";
import { BrandingProvider, useBranding } from "@/components/branding/BrandingProvider";
import { clearStoredBrand } from "@/lib/brand-vars";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = useRouterState({ select: (st) => st.location.pathname });

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      const s = data.session;
      if (!s) {
        navigate({ to: "/login" });
      } else {
        setUser({ id: s.user.id, email: s.user.email });
      }
      setReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!mounted) return;
      if (!session) {
        setUser(null);
        navigate({ to: "/login" });
      } else {
        setUser({ id: session.user.id, email: session.user.email });
      }
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearStoredBrand();
    navigate({ to: "/" });
  };

  const fetchRoles = useServerFn(getMyRoles);
  const rolesQ = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
    enabled: !!user,
  });
  const isAdmin = !!rolesQ.data?.isAdmin;

  // Onboarding-Gate: Discord → RSI → Orga
  const fetchOnboarding = useServerFn(getOnboardingStatus);
  const onboardingQ = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => fetchOnboarding(),
    enabled: !!user,
  });
  const onOnboarding = pathname.startsWith("/onboarding");
  const needsOnboarding = onboardingQ.data ? !onboardingQ.data.complete : false;

  useEffect(() => {
    if (needsOnboarding && !onOnboarding) navigate({ to: "/onboarding" });
  }, [needsOnboarding, onOnboarding, navigate]);

  if (!ready || !user) {
    return (
      <div className="uid-theme relative min-h-screen bg-background text-foreground">
        <UidBackdrop variant="full" seed={2201} stars={30} />
        <div className="relative z-10 flex min-h-screen items-center justify-center">
          <p className="font-display text-sm tracking-tight text-muted-foreground">Authentifiziere…</p>
        </div>
      </div>
    );
  }

  const { email } = user;

  return (
    <BrandingProvider enabled={!!user}>
    <SidebarProvider>
      <div className="uid-theme relative flex min-h-screen w-full max-w-full overflow-x-hidden bg-background text-foreground">
        <div className="pointer-events-none fixed inset-0 z-0">
          <UidBackdrop variant="full" seed={1337} stars={34} />
        </div>
        <AppSidebar
          email={email}
          isAdmin={isAdmin}
          onSignOut={signOut}
          onOpenCommandPalette={() => setPaletteOpen(true)}
        />
        <SidebarInset className="relative z-10 min-w-0 max-w-full overflow-x-hidden bg-transparent">
          <header className="uid-shell-header sticky top-0 z-40 flex h-14 items-center gap-2 px-3 backdrop-blur-xl sm:gap-3 sm:px-4">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />
            <div className="hidden sm:block h-5 w-px bg-brand/25" />
            <BrandingHeaderName />
            <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
              <NotificationBell userId={user.id} />
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                className="focus-ring group flex items-center gap-2 rounded-xl border border-brand/20 bg-card/40 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-brand/50 hover:bg-card/70 hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Suchen…</span>
                <kbd className="inline-flex items-center gap-0.5 rounded-md border border-brand/20 bg-background/60 px-1.5 py-0.5 font-display text-[10px] font-medium">
                  <CommandIcon className="h-2.5 w-2.5" />K
                </kbd>
              </button>
            </div>
          </header>
          <div className="uid-divider" />
          <main className="min-w-0 flex-1 overflow-x-hidden px-4 py-6 pb-[calc(72px+env(safe-area-inset-bottom))] md:px-8 md:py-8 md:pb-8">
            <Outlet />
          </main>
        </SidebarInset>
        <MobileTabBar />
        <CommandPalette
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          isAdmin={isAdmin}
          onSignOut={signOut}
        />
      </div>
    </SidebarProvider>
    </BrandingProvider>
  );
}

function BrandingHeaderName() {
  const b = useBranding();
  return (
    <div className="flex min-w-0 items-center gap-2">
      <img
        src={b.logoUrl || uidLogo.url}
        alt={b.name}
        className="size-7 shrink-0 rounded-md object-contain"
        width={28}
        height={28}
      />
      <span className="hidden truncate font-display text-sm tracking-tight text-foreground sm:block">
        {b.name} <span className="text-muted-foreground">· Backoffice</span>
      </span>
    </div>
  );
}