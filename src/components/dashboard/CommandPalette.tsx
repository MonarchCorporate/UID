import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { globalSearch, type SearchHit } from "@/lib/global-search.functions";
import { proxyImage } from "@/lib/proxy-image";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Target,
  Radio,
  Ship,
  Hammer,
  Building2,
  ShieldCheck,
  UserCircle,
  Plus,
  CalendarDays,
  Package,
  Wallet,
  Users,
  ClipboardList,
  Boxes,
  FileText,
  Wrench,
  Sprout,
  Rocket,
  History,
  ShoppingCart,
  ExternalLink,
  LogOut,
  RefreshCw,
  Cpu,
  Gem,
  Crosshair,
  Loader2,
} from "lucide-react";

const HIT_ICONS: Record<SearchHit["group"], React.ComponentType<{ className?: string }>> = {
  Schiffe: Ship,
  Komponenten: Cpu,
  Items: Package,
  Materialien: Gem,
  Blueprints: FileText,
  Missionen: Crosshair,
};

type Entry = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  group: string;
  keywords?: string;
};

const baseEntries: Entry[] = [
  { label: "Übersicht", to: "/dashboard", icon: LayoutDashboard, group: "Bereiche" },
  { label: "Einsätze", to: "/ops/mine", icon: Target, group: "Bereiche" },
  { label: "Einsatz-Kalender", to: "/ops/kalender", icon: CalendarDays, group: "Einsätze" },
  { label: "Neuer Einsatz", to: "/ops/new", icon: Plus, group: "Einsätze", keywords: "op create mission neu event planen" },
  { label: "Boardcomputer / Sofort-Einsatz", to: "/ops/mine", icon: Radio, group: "Einsätze", keywords: "board session schiff" },
  { label: "Meine Flotte", to: "/meine-flotte", icon: Ship, group: "Flotte" },
  { label: "Meine Loadouts", to: "/loadouts", icon: Wrench, group: "Flotte" },
  { label: "Orga-Flotte", to: "/flotte", icon: Rocket, group: "Flotte" },
  { label: "Crafting", to: "/crafting", icon: Hammer, group: "Produktion" },
  { label: "Crafting-Verlauf", to: "/crafting/historie", icon: History, group: "Produktion" },
  { label: "Inventar", to: "/inventar", icon: Package, group: "Produktion" },
  { label: "Farm-Listen", to: "/farm-lists", icon: Sprout, group: "Produktion" },
  { label: "Item-Katalog", to: "/items", icon: Boxes, group: "Produktion" },
  { label: "Materialien", to: "/materialien", icon: Boxes, group: "Produktion" },
  { label: "Schiffskomponenten", to: "/schiffskomponenten", icon: Ship, group: "Produktion" },
  { label: "Blueprints", to: "/blueprints", icon: FileText, group: "Produktion" },
  { label: "Orga-Übersicht", to: "/orga", icon: Building2, group: "Orga" },
  { label: "Orga-Lager", to: "/orga/lager", icon: Package, group: "Orga" },
  { label: "Orga bestellen", to: "/orga/bestellen", icon: ShoppingCart, group: "Orga" },
  { label: "Orga-Bestellungen", to: "/orga/bestellungen", icon: ClipboardList, group: "Orga" },
  { label: "Orga-Kasse", to: "/orga/kasse", icon: Wallet, group: "Orga" },
  { label: "Mitglieder", to: "/orga/mitglieder", icon: Users, group: "Orga" },
  { label: "Rollen", to: "/orga/rollen", icon: ShieldCheck, group: "Orga" },
  { label: "Orgaflotte", to: "/orga/flotte", icon: Rocket, group: "Orga" },
  { label: "Orga-Einstellungen", to: "/orga/einstellungen", icon: Building2, group: "Orga" },
  { label: "Schwarzes Brett", to: "/marketplace", icon: FileText, group: "Orga" },
  { label: "Profil", to: "/profil", icon: UserCircle, group: "Konto" },
  { label: "Zur Website", to: "/", icon: ExternalLink, group: "Konto" },
];

const adminEntries: Entry[] = [
  { label: "Admin-Übersicht", to: "/admin", icon: ShieldCheck, group: "Admin" },
  { label: "Benutzer verwalten", to: "/admin/users", icon: Users, group: "Admin" },
  { label: "Audit-Log & Zugriffe", to: "/admin/audit", icon: ShieldCheck, group: "Admin" },
  { label: "Schiffskatalog", to: "/admin/ship-catalog", icon: Ship, group: "Admin" },
  { label: "Global Loadouts", to: "/admin/global-loadouts", icon: Wrench, group: "Admin" },
  { label: "Orga-Verwaltung", to: "/admin/orgs", icon: Building2, group: "Admin" },
  { label: "Datenquellen synchronisieren", to: "/admin/sync", icon: RefreshCw, group: "Admin" },
];

export function CommandPalette({
  open,
  onOpenChange,
  isAdmin,
  onSignOut,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdmin: boolean;
  onSignOut: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(query.trim()), 180);
    return () => window.clearTimeout(t);
  }, [query]);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const searchFn = useServerFn(globalSearch);
  const search = useQuery({
    queryKey: ["global-search", debounced],
    queryFn: () => searchFn({ data: { q: debounced, limit: 5 } }),
    enabled: open && debounced.length >= 2,
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
  const hits = (debounced.length >= 2 ? (search.data ?? []) : []).filter(
    (h, i, all) => all.findIndex((o) => o.group === h.group && o.label === h.label && o.detail === h.detail) === i,
  );
  const hitGroups = Array.from(new Set(hits.map((h) => h.group)));

  const goHit = (h: SearchHit) => {
    onOpenChange(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: h.to as any, params: h.params as any });
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [open, onOpenChange]);

  const go = (to: string) => {
    onOpenChange(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: to as any });
  };

  const entries = isAdmin ? [...baseEntries, ...adminEntries] : baseEntries;
  const groups = Array.from(new Set(entries.map((e) => e.group)));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder="Schiff, Item, Blueprint, Material suchen – oder zu Bereich springen…"
      />
      <CommandList className="max-h-[min(70vh,520px)]">
        <CommandEmpty>
          {search.isFetching ? (
            <span className="inline-flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Suche …
            </span>
          ) : debounced.length >= 2 ? (
            "Nichts gefunden. Probiere einen kürzeren Begriff."
          ) : (
            "Keine Treffer."
          )}
        </CommandEmpty>
        {hitGroups.map((g) => {
          const Icon = HIT_ICONS[g];
          return (
            <CommandGroup key={`hit-${g}`} heading={g}>
              {hits
                .filter((h) => h.group === g)
                .map((h) => (
                  <CommandItem
                    key={`${g}-${h.label}-${Object.values(h.params).join("-")}`}
                    // Treffer kommen vom Server – immer zum Suchbegriff passend halten
                    value={`${query} ${h.label} ${g} ${Object.values(h.params).join(" ")}`}
                    onSelect={() => goHit(h)}
                    className="gap-3"
                  >
                    {h.image ? (
                      <img
                        src={proxyImage(h.image) ?? h.image}
                        alt=""
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.style.visibility = "hidden";
                        }}
                        className="h-8 w-8 shrink-0 rounded-md border border-brand/15 bg-brand/5 object-contain"
                      />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-brand/15 bg-brand/5">
                        <Icon className="h-4 w-4 text-brand" />
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{h.label}</span>
                      {h.detail && <span className="block truncate text-xs text-muted-foreground">{h.detail}</span>}
                    </span>
                  </CommandItem>
                ))}
            </CommandGroup>
          );
        })}
        {hitGroups.length > 0 && <CommandSeparator />}
        {groups.map((g, idx) => (
          <div key={g}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {entries
                .filter((e) => e.group === g)
                .map((e) => (
                  <CommandItem
                    key={e.to + e.label}
                    value={`${e.label} ${e.keywords ?? ""}`}
                    onSelect={() => go(e.to)}
                  >
                    <e.icon className="h-4 w-4 text-muted-foreground" />
                    <span>{e.label}</span>
                  </CommandItem>
                ))}
            </CommandGroup>
          </div>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Aktionen">
          <CommandItem
            value="abmelden logout"
            onSelect={() => {
              onOpenChange(false);
              onSignOut();
            }}
          >
            <LogOut className="h-4 w-4 text-rose-300" />
            <span>Abmelden</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}