import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { effectiveOrgPerms } from "@/lib/org-perms";
import { getMyProfile } from "@/lib/profile.functions";
import {
  MonitorSmartphone,
  LayoutDashboard,
  Radio,
  Ship,
  UserCircle,
  ShieldCheck,
  ExternalLink,
  LogOut,
  Target,
  Hammer,
  Building2,
  Search,
  Command,
  Boxes,
  FileText,
  Rocket,
  Package,
  Sprout,
  Megaphone,
  Coins,
  Store,
  Gift,
  Wrench,
  X,
  ShoppingCart,
  ClipboardList,
  Wallet,
  Users,
  LayoutTemplate,
  MessageSquare,
  Shield,
  Settings,
  Calendar,
  ChevronRight,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding/BrandingProvider";
import { OrgSwitcher } from "@/components/branding/OrgSwitcher";

type Item = {
  title: string;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  exact?: boolean;
  group?: string;
  keywords?: string;
  children?: Item[];
};

const personal: Item[] = [
  { title: "Übersicht", url: "/dashboard", icon: LayoutDashboard, exact: true, group: "Persönlich" },
  {
    title: "Einsätze",
    url: "/ops",
    icon: Target,
    group: "Persönlich",
    keywords: "missionen op events",
    children: [
      { title: "Übersicht", url: "/ops", icon: Target, group: "Persönlich", keywords: "übersicht" },
      { title: "Bevorstehende Einsätze", url: "/ops/liste", icon: Calendar, group: "Persönlich", keywords: "events liste bevorstehend" },
      { title: "Kalender", url: "/ops/kalender", icon: Calendar, group: "Persönlich", keywords: "kalender" },
      { title: "Meine Einsätze", url: "/ops/mine", icon: UserCircle, group: "Persönlich", keywords: "meine einsätze" },
      { title: "Neuer Einsatz", url: "/ops/new", icon: Rocket, group: "Persönlich", keywords: "neuer einsatz erstellen" },
    ],
  },
  { title: "Handel", url: "/handel", icon: Coins, group: "Persönlich", keywords: "routen verkauf handel" },
  { title: "Meine Flotte", url: "/meine-flotte", icon: Ship, group: "Persönlich", keywords: "schiffe meine flotte" },
  { title: "Loadout-Editor", url: "/loadout-editor", icon: Wrench, group: "Persönlich", keywords: "ausrüstung bewaffnung" },
  { title: "Crafting", url: "/crafting", icon: Hammer, group: "Persönlich", keywords: "crafting produktion herstellen" },
  { title: "Inventar", url: "/inventar", icon: Package, group: "Persönlich", keywords: "lager items bestand" },
  { title: "Companion", url: "/companion", icon: MonitorSmartphone, group: "Persönlich", keywords: "overlay game.log companion desktop plan aufträge mining" },
  { title: "Farm-Listen", url: "/farm-lists", icon: Sprout, group: "Persönlich", keywords: "sammeln listen" },
  { title: "Profil", url: "/profil", icon: UserCircle, group: "Persönlich", keywords: "account einstellungen avatar status" },
];

const community: Item[] = [
  { title: "Orga", url: "/orga", icon: Building2, exact: true, group: "Orga & Community", keywords: "organisation übersicht" },
  { title: "Schwarzes Brett", url: "/marketplace", icon: Megaphone, group: "Orga & Community", keywords: "marktplatz angebote" },
  { title: "Shop", url: "/einkauf", icon: Store, group: "Orga & Community", keywords: "bestellen einkauf" },
  { title: "Gewinnspiele", url: "/gewinnspiele", icon: Gift, group: "Orga & Community", keywords: "gewinnspiel lose verlosung giveaway" },
];

const catalogs: Item[] = [
  { title: "Item-Katalog", url: "/items", icon: Boxes, group: "Kataloge", keywords: "gegenstände items" },
  { title: "Materialien", url: "/materialien", icon: Package, group: "Kataloge", keywords: "rohstoffe erze" },
  { title: "Schiffskomponenten", url: "/schiffskomponenten", icon: Ship, group: "Kataloge" },
  { title: "Schiffskatalog", url: "/schiffe", icon: Rocket, group: "Kataloge", keywords: "raumschiffe" },
  { title: "Blueprints", url: "/blueprints", icon: FileText, group: "Kataloge" },
  { title: "Missions-Katalog", url: "/missions", icon: Target, group: "Kataloge" },
];

function GroupSection({
  title,
  children,
  defaultOpen = true,
  divider = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  divider?: boolean;
}) {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return (
      <>
        {divider && <div className="uid-divider my-3" />}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu className="gap-1">{children}</SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </>
    );
  }

  return (
    <>
      {divider && <div className="uid-divider my-3" />}
      <Collapsible defaultOpen={defaultOpen} className="group/collapsible-section">
        <SidebarGroup className="group-data-[state=closed]/collapsible-section:pb-0">
          <SidebarGroupContent>
            <CollapsibleTrigger asChild>
              <button
                type="button"
                className="flex w-full items-center justify-between px-3 pb-1 pt-0 text-left font-display text-[10px] font-medium uppercase tracking-[0.18em] text-brand/70 transition-colors hover:text-brand"
              >
                <span>{title}</span>
                <ChevronRight className="h-3.5 w-3.5 transition-transform group-data-[state=open]/collapsible-section:rotate-90" />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <SidebarMenu className="gap-1">{children}</SidebarMenu>
            </CollapsibleContent>
          </SidebarGroupContent>
        </SidebarGroup>
      </Collapsible>
    </>
  );
}

/** macOS-inspired sidebar with nested collapsible groups. */
export function AppSidebar({
  email,
  isAdmin,
  onSignOut,
  onOpenCommandPalette,
}: {
  email?: string;
  isAdmin: boolean;
  onSignOut: () => void;
  onOpenCommandPalette?: () => void;
}) {
  const { state, setOpen } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const [query, setQuery] = useState("");
  const { org: activeOrg } = useBranding();
  const orgRole = activeOrg?.my_role;
  const orgPerms = (activeOrg?.my_permissions ?? []) as string[];
  const isOwner = orgRole === "owner";
  const effPerms = effectiveOrgPerms(orgRole, orgPerms) as string[];
  const canOrg = (p: string) => isOwner || effPerms.includes(p);

  const orgSubItems = useMemo<Item[]>(() => {
    if (!activeOrg) return [];
    const items: Array<Item & { show?: boolean }> = [
      { title: "Lager", url: "/orga/lager", icon: Package, group: "Orga & Community", keywords: "orga lager warehouse" },
      { title: "Bestellen", url: "/orga/bestellen", icon: ShoppingCart, group: "Orga & Community" },
      { title: "Bestellungen", url: "/orga/bestellungen", icon: ClipboardList, group: "Orga & Community", show: canOrg("orders.view") },
      { title: "Orga-Shop", url: "/orga/shop", icon: Store, group: "Orga & Community", show: canOrg("warehouse.manage") },
      { title: "Kasse", url: "/orga/kasse", icon: Wallet, group: "Orga & Community", show: true },
      { title: "Mitglieder", url: "/orga/mitglieder", icon: Users, group: "Orga & Community", show: canOrg("members.manage") },
      { title: "Rollen", url: "/orga/rollen", icon: ShieldCheck, group: "Orga & Community", show: canOrg("members.manage") },
      { title: "Landingpage", url: "/orga/seite", icon: LayoutTemplate, group: "Orga & Community", show: canOrg("branding.manage") },
      { title: "Discord", url: "/orga/discord", icon: MessageSquare, group: "Orga & Community", keywords: "discord posten ankündigung event", show: canOrg("discord.post") },
      { title: "Discord-Rollen", url: "/orga/discord-rollen", icon: Shield, group: "Orga & Community", keywords: "discord rollen anlegen vergeben", show: canOrg("discord.roles") },
      { title: "Orga-Einstellungen", url: "/orga/einstellungen", icon: Settings, group: "Orga & Community", show: canOrg("settings.manage") },
    ];
    return items.filter((i) => i.show !== false).map(({ show: _s, ...rest }) => rest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrg?.id, orgRole, orgPerms.join(",")]);

  const communityItems = useMemo<Item[]>(() => {
    const [overview, ...rest] = community;
    return [overview, ...orgSubItems, ...rest];
  }, [orgSubItems]);

  const fetchProfile = useServerFn(getMyProfile);
  const { data: me } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
    staleTime: 60_000,
  });
  const myProfile = me?.profile as
    | { avatar_url?: string | null; status_text?: string | null; display_name?: string | null; callsign?: string | null }
    | undefined;

  const isActive = (url: string, exact?: boolean) => {
    // Einsätze section covers /ops/* AND legacy detail routes like /missions/*
    if (url === "/ops")
      return pathname.startsWith("/ops") || pathname.startsWith("/missions") || pathname.startsWith("/board");
    if (url === "/meine-flotte")
      return (
        pathname.startsWith("/meine-flotte") ||
        pathname.startsWith("/loadouts") ||
        pathname.startsWith("/flotte") ||
        pathname.startsWith("/schiff/")
      );
    if (url === "/loadout-editor") return pathname.startsWith("/loadout-editor");
    if (url === "/crafting")
      return (
        pathname.startsWith("/crafting") ||
        pathname.startsWith("/inventar")
      );
    if (url === "/farm-lists") return pathname.startsWith("/farm-lists");
    if (url === "/orga") return pathname === "/orga";
    if (url === "/marketplace") return pathname.startsWith("/marketplace");
    if (url === "/handel") return pathname.startsWith("/handel");
    if (url === "/einkauf") return pathname.startsWith("/einkauf");
    if (url === "/admin") return pathname.startsWith("/admin");
    return exact ? pathname === url : pathname === url || pathname.startsWith(url + "/");
  };

  const adminItem: Item = { title: "Admin", url: "/admin", icon: ShieldCheck, group: "Administration", keywords: "benutzer verwaltung global" };

  const allItems = useMemo(
    () =>
      isAdmin
        ? [...personal, ...communityItems, ...catalogs, adminItem]
        : [...personal, ...communityItems, ...catalogs],
    [isAdmin, communityItems]
  );

  const normalize = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const matches = (item: Item) => {
    if (!query.trim()) return true;
    const q = normalize(query);
    const haystack = normalize(`${item.title} ${item.keywords ?? ""} ${item.group ?? ""}`);
    return haystack.includes(q);
  };

  const filteredPersonal = useMemo(() => {
    if (!query.trim()) return personal;
    return personal.flatMap((item) => {
      const parentMatches = matches(item);
      const childMatches = item.children?.filter(matches) ?? [];
      if (parentMatches) return [item];
      if (childMatches.length) return [{ ...item, children: childMatches }];
      return [];
    });
  }, [personal, query]);

  const filteredCommunity = communityItems.filter(matches);
  const filteredCatalogs = catalogs.filter(matches);
  const filteredAdmin = (isAdmin ? [adminItem] : []).filter(matches);
  const hasAny =
    filteredPersonal.length + filteredCommunity.length + filteredCatalogs.length + filteredAdmin.length > 0;

  const renderItem = (item: Item) => {
    if (item.children && item.children.length > 0 && !collapsed) {
      const anyChildActive = item.children.some((c) => isActive(c.url, c.exact));
      const parentActive = isActive(item.url, item.exact) || anyChildActive;
      return (
        <Collapsible key={item.title} defaultOpen={parentActive} className="group/collapsible">
          <SidebarMenuItem>
            <CollapsibleTrigger asChild>
              <SidebarMenuButton
                isActive={parentActive}
                tooltip={item.title}
                className={cn(
                  "h-10 rounded-xl transition-colors",
                  parentActive
                    ? "bg-brand/15 text-brand hover:bg-brand/20 data-[active=true]:bg-brand/15"
                    : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                )}
              >
                <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
                  {parentActive && (
                    <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                  )}
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="text-[13px] font-medium tracking-tight">{item.title}</span>
                <ChevronRight className="ml-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-90" />
              </SidebarMenuButton>
            </CollapsibleTrigger>
          </SidebarMenuItem>
          <CollapsibleContent>
            <SidebarMenuSub>
              {item.children.map((child) => {
                const childActive = isActive(child.url, child.exact);
                return (
                  <SidebarMenuSubItem key={child.url}>
                    <SidebarMenuSubButton
                      asChild
                      isActive={childActive}
                      className={cn(
                        "rounded-lg transition-colors",
                        childActive
                          ? "bg-brand/15 text-brand hover:bg-brand/20 data-[active=true]:bg-brand/15"
                          : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
                      )}
                    >
                      <Link to={child.url} onClick={() => setQuery("")}>
                        <span className="text-[13px] font-medium tracking-tight">{child.title}</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                );
              })}
            </SidebarMenuSub>
          </CollapsibleContent>
        </Collapsible>
      );
    }

    const active = isActive(item.url, item.exact);
    return (
      <SidebarMenuItem key={item.url}>
        <SidebarMenuButton
          asChild
          isActive={active}
          tooltip={item.title}
          className={cn(
            "h-10 rounded-xl transition-colors",
            active
              ? "bg-brand/15 text-brand hover:bg-brand/20 data-[active=true]:bg-brand/15"
              : "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground",
          )}
        >
          <Link to={item.url} className="flex items-center gap-3" onClick={() => setQuery("")}>
            <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
              {active && (
                <span className="absolute -left-3 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
              )}
              <item.icon className="h-4 w-4" />
            </span>
            <span className="text-[13px] font-medium tracking-tight">{item.title}</span>
          </Link>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  };

  return (
    <Sidebar collapsible="icon" className="border-r border-brand/15">
      <SidebarHeader className="border-b border-brand/15 px-2 py-3">
        <OrgSwitcher collapsed={collapsed} />

        {onOpenCommandPalette && !collapsed && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            className="focus-ring group mt-3 flex w-full items-center gap-2 rounded-xl border border-brand/20 bg-card/40 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-brand/50 hover:bg-card/70 hover:text-foreground"
          >
            <Search className="h-3.5 w-3.5" />
            <span className="flex-1">Schnellsuche…</span>
            <kbd className="inline-flex items-center gap-0.5 rounded-md border border-brand/20 bg-background/60 px-1.5 py-0.5 font-display text-[10px] font-medium">
              <Command className="h-2.5 w-2.5" />K
            </kbd>
          </button>
        )}
        {onOpenCommandPalette && collapsed && (
          <button
            type="button"
            onClick={onOpenCommandPalette}
            title="Schnellsuche (⌘K)"
            className="focus-ring mx-auto mt-3 flex h-9 w-9 items-center justify-center rounded-xl border border-brand/20 bg-card/40 text-muted-foreground hover:border-brand/50 hover:text-brand"
          >
            <Search className="h-4 w-4" />
          </button>
        )}
      </SidebarHeader>

      <SidebarContent className="px-2 py-3">
        {!collapsed && (
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-brand/60" />
            <input
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (e.target.value && collapsed) setOpen(true);
              }}
              placeholder="Menü durchsuchen…"
              className="h-9 w-full rounded-xl border border-brand/20 bg-card/40 pl-9 pr-8 text-[12px] text-foreground placeholder:text-muted-foreground/60 transition focus:border-brand/50 focus:bg-card/70 focus:outline-none focus:ring-1 focus:ring-brand/30"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-brand/10 hover:text-brand"
                aria-label="Suche zurücksetzen"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {collapsed && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            title="Menü durchsuchen"
            className="focus-ring mx-auto mb-3 flex h-9 w-9 items-center justify-center rounded-xl border border-brand/20 bg-card/40 text-muted-foreground hover:border-brand/50 hover:text-brand"
          >
            <Search className="h-4 w-4" />
          </button>
        )}

        {query && !hasAny && (
          <div className="px-3 py-4 text-center text-[12px] text-muted-foreground">
            Keine Treffer für „{query}“.
          </div>
        )}

        {(filteredPersonal.length > 0 || !query) && (
          <GroupSection title="Persönlich" defaultOpen>
            <SidebarMenu className="gap-1">{filteredPersonal.map(renderItem)}</SidebarMenu>
          </GroupSection>
        )}

        {(filteredCommunity.length > 0 || !query) && (
          <GroupSection title="Orga & Community" defaultOpen divider>
            <SidebarMenu className="gap-1">{filteredCommunity.map(renderItem)}</SidebarMenu>
          </GroupSection>
        )}

        {(filteredCatalogs.length > 0 || !query) && (
          <GroupSection title="Kataloge" defaultOpen divider>
            <SidebarMenu className="gap-1">{filteredCatalogs.map(renderItem)}</SidebarMenu>
          </GroupSection>
        )}

        {isAdmin && (filteredAdmin.length > 0 || !query) && (
          <GroupSection title="Administration" defaultOpen divider>
            <SidebarMenu className="gap-1">{filteredAdmin.map(renderItem)}</SidebarMenu>
          </GroupSection>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-brand/15 px-2 py-3">
        <SidebarMenu className="gap-1">
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Zur Website" className="h-9 rounded-xl text-muted-foreground hover:bg-white/[0.04] hover:text-foreground">
              <Link to="/" className="flex items-center gap-3">
                <ExternalLink className="h-4 w-4" />
                <span className="text-[13px]">Zur Website</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={onSignOut}
              tooltip="Abmelden"
              className="h-9 rounded-xl text-muted-foreground hover:bg-rose-500/10 hover:text-rose-300"
            >
              <LogOut className="h-4 w-4" />
              <span className="text-[13px]">Abmelden</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        {!collapsed && email && (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand/15 bg-card/30 px-3 py-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand/15 text-[11px] font-bold text-brand">
              {myProfile?.avatar_url ? (
                <img src={myProfile.avatar_url} alt="" className="h-full w-full object-cover" />
              ) : (
                (myProfile?.callsign || email).slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-medium text-foreground">
                {myProfile?.display_name || myProfile?.callsign || email}
              </div>
              {myProfile?.status_text && (
                <div className="truncate text-[10px] text-muted-foreground">{myProfile.status_text}</div>
              )}
              {isAdmin && (
                <div className="flex items-center gap-1 text-[10px] text-brand">
                  <ShieldCheck className="h-2.5 w-2.5" /> Admin
                </div>
              )}
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
