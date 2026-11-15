import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Target,
  Coins,
  Ship as ShipIcon,
  Wrench,
  Hammer,
  Package,
  Sprout,
  UserCircle,
  Building2,
  ShoppingCart,
  ClipboardList,
  Store,
  Users,
  Boxes,
  Rocket,
  Search,
  Command,
  Radio,
  Mic,
  Plus,
  Lock,
  Unlock,
  ArrowRight,
  Activity,
  CalendarDays,
  RotateCcw,
  PanelLeft,
  Megaphone,
  FileText,
  ShieldCheck,
  LayoutTemplate,
  MessageSquare,
  Settings,
  Wallet,
  Warehouse,
  Sparkles,
  User,
  Calendar,
  Tag,
  Info,
  Route as RouteIcon,
  TrendingUp,
  Signal,
  KeyRound,
  Star,
  Headphones,
  MapPin,
  Pencil,
  Trash2,
  LayoutGrid,
  List as ListIcon,
  ChevronRight,
  RefreshCw,
  Link2,
  ArrowLeft,
  ExternalLink,
} from "lucide-react";
import {
  backofficeDemoIntro,
  backofficeDemoMission,
  backofficeDemoRoutes,
  backofficeDemoSquads,
  backofficeDemoStations,
  backofficeDemoStock,
  backofficeDemoShipDetails,
} from "@/components/uid/content";
import { proxyImage } from "@/lib/proxy-image";
import { useReveal } from "@/hooks/use-reveal";
import { StatCard, StatGrid, StatusBadge } from "@/components/layout/PageShell";
import { SectionHeader as UidSectionHeader } from "@/components/uid/UidUI";

type PageId = "dashboard" | "ops" | "lager" | "handel" | "flotte";

type NavItem = {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  live?: PageId;
};

/** Exakt die Gruppen/Einträge der echten Sidebar (AppSidebar). */
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Persönlich",
    items: [
      { id: "uebersicht", title: "Übersicht", icon: LayoutDashboard, live: "dashboard" },
      { id: "einsaetze", title: "Einsätze", icon: Target, live: "ops" },
      { id: "handel", title: "Handel", icon: Coins, live: "handel" },
      { id: "meine-flotte", title: "Meine Flotte", icon: ShipIcon, live: "flotte" },
      { id: "loadout", title: "Loadout-Editor", icon: Wrench },
      { id: "crafting", title: "Crafting", icon: Hammer },
      { id: "inventar", title: "Inventar", icon: Package },
      { id: "farm", title: "Farm-Listen", icon: Sprout },
      { id: "profil", title: "Profil", icon: UserCircle },
    ],
  },
  {
    label: "Orga & Community",
    items: [
      { id: "orga", title: "Orga", icon: Building2 },
      { id: "lager", title: "Lager", icon: Package, live: "lager" },
      { id: "bestellen", title: "Bestellen", icon: ShoppingCart },
      { id: "bestellungen", title: "Bestellungen", icon: ClipboardList },
      { id: "orga-shop", title: "Orga-Shop", icon: Store },
      { id: "kasse", title: "Kasse", icon: Wallet },
      { id: "mitglieder", title: "Mitglieder", icon: Users },
      { id: "rollen", title: "Rollen", icon: ShieldCheck },
      { id: "seite", title: "Landingpage", icon: LayoutTemplate },
      { id: "discord", title: "Discord", icon: MessageSquare },
      { id: "orga-einstellungen", title: "Orga-Einstellungen", icon: Settings },
      { id: "brett", title: "Schwarzes Brett", icon: Megaphone },
      { id: "shop", title: "Shop", icon: Store },
    ],
  },
  {
    label: "Kataloge",
    items: [
      { id: "items", title: "Item-Katalog", icon: Boxes },
      { id: "materialien", title: "Materialien", icon: Package },
      { id: "komponenten", title: "Schiffskomponenten", icon: ShipIcon },
      { id: "schiffe", title: "Schiffskatalog", icon: Rocket },
      { id: "blueprints", title: "Blueprints", icon: FileText },
      { id: "missions", title: "Missions-Katalog", icon: Target },
    ],
  },
];

const pageMeta: Record<PageId, { eyebrow: string; title: string; description: string; url: string }> = {
  dashboard: {
    eyebrow: "Persönlich",
    title: "Übersicht",
    description: "Dein Kommandozentrum für Flotte, Einsätze und Produktion.",
    url: "uid.sc/dashboard",
  },
  ops: {
    eyebrow: "Operations",
    title: "Einsätze",
    description: "Plane, starte und tritt Einsätzen bei.",
    url: "uid.sc/ops",
  },
  lager: {
    eyebrow: "Orga & Community",
    title: "Orgalager",
    description: "Bestände mit Halter, Standort und Qualität — sperren, freigeben, anfragen.",
    url: "uid.sc/orga/lager",
  },
  handel: {
    eyebrow: "Handel",
    title: "Routenplaner",
    description: "Beste Handelsrouten nach Budget, Frachtraum und Terminal-Filtern.",
    url: "uid.sc/handel/routenplaner",
  },
  flotte: {
    eyebrow: "Persönlich",
    title: "Meine Flotte",
    description: "Schiffe verwalten, Loadouts prüfen und Einsätzen zuordnen.",
    url: "uid.sc/meine-flotte",
  },
};

const allShips = backofficeDemoSquads.flatMap((sq) =>
  sq.ships.map((s) => ({ ...s, squad: sq.name, lead: sq.lead })),
);

/* ── kleine Bausteine, 1:1 aus dem echten Backoffice ───────────── */

function PageHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-brand/10 bg-background/40 px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand/70" />
      <span className="leading-relaxed">{children}</span>
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return <h2 className="font-display text-xl tracking-tight">{title}</h2>;
}

function DashSectionHeader({
  icon: Icon,
  title,
  subtitle,
}: {
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        {Icon && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <div className="truncate font-display text-lg leading-tight">{title}</div>
          {subtitle && <div className="text-xs text-muted-foreground">{subtitle}</div>}
        </div>
      </div>
    </div>
  );
}

function ShortcutCard({
  icon: Icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-card/40 p-3.5 text-left backdrop-blur-md transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-card/70"
    >
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-background/60 text-brand transition group-hover:border-brand/40 group-hover:bg-brand/10">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-sm leading-tight">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 flex-none text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </button>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-background/40 px-3 py-2">
      <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function DemoBadge({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${
        className || "border-white/15 text-muted-foreground"
      }`}
    >
      {children}
    </span>
  );
}

/* ── Formular-Bausteine (Look des echten Backoffices) ──────────── */

function DemoField({
  label,
  children,
  className = "",
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="block text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

const inputCls =
  "focus-ring h-9 w-full rounded-xl border border-white/10 bg-background/60 px-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-brand/50";

function PrimaryBtn({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-brand/20 transition hover:brightness-110 disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function GhostBtn({
  children,
  onClick,
  disabled,
  tone = "default",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "danger" | "brand";
}) {
  const toneCls =
    tone === "danger"
      ? "border-red-500/30 text-red-300 hover:bg-red-500/10"
      : tone === "brand"
        ? "border-brand/40 bg-brand/10 text-brand hover:bg-brand/20"
        : "border-white/10 text-muted-foreground hover:border-brand/40 hover:text-brand";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${toneCls}`}
    >
      {children}
    </button>
  );
}

/* ── Demo-Datenmodelle (lokaler CRUD-Store) ────────────────────── */

type DemoMission = {
  id: string;
  title: string;
  date: string;
  objective: string;
  isPublic: boolean;
  status: "draft" | "active" | "completed";
  participants: number;
  routeId: string | null;
};

type DemoStockItem = {
  id: string;
  name: string;
  qty: string;
  holder: string;
  loc: string;
  q: string;
  locked: boolean;
};

type DemoRequest = {
  id: string;
  itemId: string;
  itemName: string;
  qty: string;
  status: "open" | "approved" | "rejected";
};

type DemoRoute = {
  id: string;
  commodity: string;
  from: string;
  to: string;
  profit: string;
  scu: number;
  ship: string;
};

let idSeq = 0;
const nextId = (p: string) => `${p}-${++idSeq}`;

const initialMissions = (): DemoMission[] => [
  {
    id: "m-seed",
    title: backofficeDemoMission.title,
    date: backofficeDemoMission.date,
    objective: backofficeDemoMission.objective,
    isPublic: true,
    status: "draft",
    participants: 3,
    routeId: null,
  },
];

const initialStock = (): DemoStockItem[] =>
  backofficeDemoStock.map((s, i) => ({
    id: `s-seed-${i}`,
    name: s.name,
    qty: s.qty,
    holder: s.holder,
    loc: s.loc,
    q: s.q,
    locked: s.name === "Med-Gel",
  }));

const initialRoutes = (): DemoRoute[] =>
  backofficeDemoRoutes.map((r, i) => ({ id: `r-seed-${i}`, ...r }));

/* ── Hauptkomponente ───────────────────────────────────────────── */

export function UidBackofficeDemo() {
  const ref = useReveal<HTMLDivElement>();
  const [page, setPage] = useState<PageId>("dashboard");
  const [lagerTab, setLagerTab] = useState<"stock" | "offers" | "releases" | "requests">("stock");
  const [voiceJoined, setVoiceJoined] = useState(false);
  const [activeStation, setActiveStation] = useState<string>("reta-cockpit");
  const [mode, setMode] = useState<"ptt" | "vox">("ptt");
  const [shipWide, setShipWide] = useState(false);
  const [squadleadNet, setSquadleadNet] = useState(false);
  const [missionNet, setMissionNet] = useState(false);
  const [fleetFilter, setFleetFilter] = useState("");
  const [fleetView, setFleetView] = useState<"grid" | "list">("grid");
  const [fleetSort, setFleetSort] = useState<"default" | "alpha">("default");

  /* CRUD-Store */
  const [missions, setMissions] = useState<DemoMission[]>(initialMissions);
  const [stockItems, setStockItems] = useState<DemoStockItem[]>(initialStock);
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [routeList, setRouteList] = useState<DemoRoute[]>(initialRoutes);

  const [openId, setOpenId] = useState<string | null>(null);
  const [missionForm, setMissionForm] = useState<null | { id?: string; title: string; date: string; objective: string; isPublic: boolean }>(null);
  const [stockForm, setStockForm] = useState<null | { id?: string; name: string; qty: string; holder: string; loc: string; q: string }>(null);
  const [routeForm, setRouteForm] = useState<null | { id?: string; commodity: string; from: string; to: string; profit: string; scu: string; ship: string }>(null);
  const [requestDraft, setRequestDraft] = useState<null | { itemId: string; itemName: string; qty: string }>(null);

  const opsDetail = openId !== null;
  const setOpsDetail = (v: boolean) => setOpenId(v ? (openId ?? missions[0]?.id ?? null) : null);
  const openMission = missions.find((m) => m.id === openId) ?? null;
  const missionActive = missions.some((m) => m.status === "active");
  const confirmedRoute = routeList.find((r) => missions.some((m) => m.routeId === r.id)) ?? null;
  const openRequests = requests.filter((r) => r.status === "open");

  const updateMission = (id: string, patch: Partial<DemoMission>) =>
    setMissions((ms) => ms.map((m) => (m.id === id ? { ...m, ...patch } : m)));

  const steps = useMemo(
    () => [missionActive, requests.length > 0, confirmedRoute !== null, voiceJoined],
    [missionActive, requests, confirmedRoute, voiceJoined],
  );
  const done = steps.filter(Boolean).length;

  const reset = () => {
    setPage("dashboard");
    setOpenId(null);
    setLagerTab("stock");
    setMissions(initialMissions());
    setStockItems(initialStock());
    setRequests([]);
    setRouteList(initialRoutes());
    setMissionForm(null);
    setStockForm(null);
    setRouteForm(null);
    setRequestDraft(null);
    setVoiceJoined(false);
    setActiveStation("reta-cockpit");
    setMode("ptt");
    setShipWide(false);
    setSquadleadNet(false);
    setMissionNet(false);
    setFleetFilter("");
    setFleetView("grid");
    setFleetSort("default");
  };

  const meta = pageMeta[page];
  const stationShip = allShips.find((s) =>
    (backofficeDemoStations[s.id] ?? []).some((st) => st.id === activeStation),
  );
  const stationName =
    Object.values(backofficeDemoStations)
      .flat()
      .find((st) => st.id === activeStation)?.name ?? "Cockpit";

  return (
    <section className="relative scroll-mt-24 overflow-hidden border-t border-border py-20 md:py-28 uid-deep">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <div className="uid-grid-bg uid-grid-anim absolute inset-0 opacity-20" />
      </div>

      <div ref={ref} className="uid-reveal relative mx-auto max-w-6xl px-6">
        <UidSectionHeader
          label={backofficeDemoIntro.eyebrow}
          title={backofficeDemoIntro.title}
          intro={[backofficeDemoIntro.body]}
        />

        <div className="uid-item mt-8 flex flex-col gap-3 rounded-xl border border-brand/15 bg-brand/5 px-4 py-3 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-foreground/85">
            <span className="font-medium text-brand">Demo-Modus:</span> Dies ist eine eingeschränkte Vorschau. Für die vollen Funktionen melde dich mit Discord an.
          </p>
          <Link
            to="/login"
            className="focus-ring inline-flex items-center justify-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-brand/20 transition hover:brightness-110"
          >
            Anmelden
          </Link>
        </div>

        <div
          className="uid-item mt-8 overflow-hidden rounded-2xl border border-brand/15 bg-background/70 shadow-2xl backdrop-blur-xl"
          style={{ ["--d" as string]: "180ms" }}
        >
          {/* Fenster-Titelleiste */}
          <div className="flex items-center gap-3 border-b border-brand/15 bg-card/40 px-4 py-2.5">
            <div className="flex gap-1.5">
              <span className="size-2.5 rounded-full bg-rose-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <div className="mx-auto rounded-md border border-brand/15 bg-background/60 px-3 py-0.5 font-mono text-[10px] text-muted-foreground">
              {opsDetail ? "uid.sc/ops/aegis-retaliator-konvoi" : meta.url}
            </div>
            <span className="font-mono text-[10px] uppercase tracking-wider text-brand">{done}/4</span>
          </div>

          <div className="grid md:grid-cols-[224px_1fr]">
            {/* Sidebar */}
            <aside className="hidden max-h-[720px] overflow-y-auto border-r border-brand/15 bg-card/25 px-2 py-3 md:block">
              <div className="flex items-center gap-2 rounded-xl border border-brand/15 bg-card/40 px-2.5 py-2">
                <div className="flex size-7 items-center justify-center rounded-lg bg-brand/15 font-display text-[11px] font-bold text-brand">
                  UID
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[12px] font-medium text-foreground">United Imperial Dominion</div>
                  <div className="truncate text-[10px] text-muted-foreground">Officer</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2 rounded-xl border border-brand/20 bg-card/40 px-3 py-2 text-[11px] text-muted-foreground">
                <Search className="size-3.5" />
                <span className="flex-1">Schnellsuche…</span>
                <kbd className="inline-flex items-center gap-0.5 rounded-md border border-brand/20 bg-background/60 px-1.5 py-0.5 font-display text-[9px]">
                  <Command className="size-2.5" />K
                </kbd>
              </div>

              <div className="mt-3 flex h-9 items-center gap-2 rounded-xl border border-brand/20 bg-card/40 px-3 text-[12px] text-muted-foreground/70">
                <Search className="size-3.5 text-brand/60" />
                <span>Menü durchsuchen…</span>
              </div>

              <nav className="mt-3">
                {navGroups.map((g, gi) => (
                  <div key={g.label}>
                    {gi > 0 && <div className="uid-divider my-3" />}
                    <div className="px-3 pb-1 font-display text-[10px] font-medium uppercase tracking-[0.18em] text-brand/70">
                      {g.label}
                    </div>
                    <ul className="space-y-1">
                      {g.items.map((it) => {
                        const active = !!it.live && page === it.live && !(it.live === "ops" && false);
                        return (
                          <li key={it.id}>
                            <button
                              type="button"
                              disabled={!it.live}
                              onClick={() => {
                                if (!it.live) return;
                                setPage(it.live);
                                setOpsDetail(false);
                              }}
                              className={`focus-ring relative flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[13px] font-medium tracking-tight transition-colors ${
                                active
                                  ? "bg-brand/15 text-brand"
                                  : it.live
                                    ? "text-muted-foreground hover:bg-white/[0.04] hover:text-foreground"
                                    : "cursor-default text-muted-foreground/40"
                              }`}
                            >
                              {active && (
                                <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand" />
                              )}
                              <it.icon className="size-4 shrink-0" />
                              <span className="truncate">{it.title}</span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                <div className="uid-divider my-3" />
                <div className="px-3 pb-1 font-display text-[10px] font-medium uppercase tracking-[0.18em] text-brand/70">
                  Administration
                </div>
                <div className="flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-muted-foreground/40">
                  <ShieldCheck className="size-4" /> Admin
                </div>
              </nav>

              <div className="mt-4 border-t border-brand/15 pt-3">
                <div className="flex items-center gap-2 rounded-xl border border-brand/15 bg-card/30 px-3 py-2">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand/15 text-[11px] font-bold text-brand">
                    K
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[11px] font-medium text-foreground">Kommandant</div>
                    <div className="truncate text-[10px] text-muted-foreground">Officer · United Imperial Dominion</div>
                  </div>
                </div>
              </div>
            </aside>

            <div>
              {/* App-Header (h-14, Glas) */}
              <div className="flex h-14 items-center gap-3 border-b border-white/5 bg-background/70 px-4 backdrop-blur-xl">
                <PanelLeft className="size-4 text-muted-foreground" />
                <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {meta.eyebrow}
                </span>
                <span className="ml-auto flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-0.5 font-mono text-[10px] text-emerald-300">
                  <Activity className="size-3" />
                  {missionActive ? "Einsatz live" : "Bereit"}
                </span>
              </div>

              {/* Mobile Tabs */}
              <div className="flex gap-1 overflow-x-auto border-b border-brand/10 px-3 py-2 md:hidden">
                {(["dashboard", "ops", "lager", "handel", "flotte"] as PageId[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => {
                      setPage(p);
                      setOpsDetail(false);
                    }}
                    className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-[11px] font-medium ${
                      page === p ? "bg-brand/15 text-brand" : "text-muted-foreground"
                    }`}
                  >
                    {pageMeta[p].title}
                  </button>
                ))}
              </div>

              {/* Seiteninhalt */}
              <div className="min-h-[520px] space-y-8 p-5 sm:p-8">
                {/* ── DASHBOARD ─────────────────────────────── */}
                {page === "dashboard" && (
                  <div className="animate-fade-up space-y-10">
                    <div className="ambient-glow relative overflow-hidden rounded-3xl border border-white/8 bg-card/40 p-6 backdrop-blur-xl sm:p-8">
                      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                        <div className="min-w-0 space-y-3">
                          <div className="text-xs font-medium text-brand/80">
                            {backofficeDemoIntro.orgName} · Willkommen zurück ·{" "}
                            {backofficeDemoIntro.orgRole}
                          </div>
                          <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
                            Hallo<span className="text-brand">, {backofficeDemoIntro.greetingName}</span>
                          </h3>
                          <p className="max-w-xl text-sm text-muted-foreground">
                            Dein Kommandozentrum für Flotte, Einsätze und Produktion. Drücke{" "}
                            <kbd className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium">
                              ⌘K
                            </kbd>{" "}
                            zum schnellen Navigieren.
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => {
                              setPage("ops");
                              setOpenId(null);
                              setMissionForm({ title: "", date: "", objective: "", isPublic: true });
                            }}
                            className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-brand/20 transition hover:brightness-110"
                          >
                            <Plus className="h-4 w-4" /> Neuer Einsatz
                          </button>
                          <button
                            onClick={() => {
                              const m: DemoMission = {
                                id: nextId("m"),
                                title: "Sofort-Einsatz",
                                date: "Jetzt",
                                objective: "Ad-hoc Operation",
                                isPublic: false,
                                status: "active",
                                participants: 1,
                                routeId: null,
                              };
                              setMissions((ms) => [m, ...ms]);
                              setPage("ops");
                              setOpenId(m.id);
                            }}
                            className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/50 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-card/70"
                          >
                            <Radio className="h-4 w-4" /> Sofort starten
                          </button>
                        </div>
                      </div>
                    </div>

                    <StatGrid cols={4}>
                      <StatCard label="Schiffe in Flotte" value={allShips.length} icon={ShipIcon} tone="brand" />
                      <StatCard
                        label="Aktive Einsätze"
                        value={missions.filter((m) => m.status === "active").length}
                        icon={Activity}
                        tone={missionActive ? "emerald" : "default"}
                      />
                      <StatCard
                        label="Live Boards"
                        value={missionActive ? allShips.length : 0}
                        icon={Radio}
                        tone={missionActive ? "emerald" : "default"}
                      />
                      <StatCard label="Einsätze geleitet" value={missions.length} icon={Target} />
                    </StatGrid>

                    <section className="space-y-3">
                      <SectionHead title="Shortcuts" />
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <ShortcutCard icon={Warehouse} title="Orgalager" desc="Bestand & Bestellungen" onClick={() => setPage("lager")} />
                        <ShortcutCard icon={Coins} title="Routenplaner" desc="Beste Handelsroute" onClick={() => setPage("handel")} />
                        <ShortcutCard icon={ShipIcon} title="Meine Flotte" desc="Schiffe & Loadouts" onClick={() => setPage("flotte")} />
                        <ShortcutCard icon={Sparkles} title="Crafting starten" desc="Blueprint auswählen" />
                        <ShortcutCard icon={ClipboardList} title="Farm-Liste" desc="Materialien sammeln" />
                        <ShortcutCard icon={Store} title="Schwarzes Brett" desc="Anzeige erstellen" />
                        <ShortcutCard icon={CalendarDays} title="Einsatzkalender" desc="Öffentliche Ops" onClick={() => setPage("ops")} />
                        <ShortcutCard icon={Boxes} title="Item-Katalog" desc="Alles aus dem Wiki" />
                      </div>
                    </section>

                    <section className="space-y-4">
                      <div className="flex items-center gap-2.5">
                        {missionActive && (
                          <span className="relative flex h-2.5 w-2.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                          </span>
                        )}
                        <h2 className="font-display text-xl">{missionActive ? "Live-Einsätze" : "Einsätze"}</h2>
                        <span className="text-xs text-muted-foreground">
                          {missions.filter((m) => m.status === "active").length} aktiv ·{" "}
                          {missions.filter((m) => m.status === "draft").length} Entwurf
                        </span>
                      </div>
                      <div className="grid gap-3 md:grid-cols-2">
                        {missions.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-brand/20 p-6 text-sm text-muted-foreground">
                            Keine Einsätze. Lege oben einen neuen Einsatz an.
                          </div>
                        )}
                        {missions.map((m) => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setPage("ops");
                              setOpenId(m.id);
                            }}
                            className={`group relative block rounded-2xl border p-4 text-left backdrop-blur-md transition ${
                              m.status === "active"
                                ? "border-emerald-500/40 bg-emerald-500/[0.04] hover:border-emerald-400/60"
                                : "border-white/8 bg-card/40 hover:border-brand/30 hover:bg-card/70"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="truncate font-display text-lg leading-tight">{m.title}</div>
                                <div className="mt-1 truncate text-xs text-muted-foreground">
                                  {m.date} · {m.participants} Teilnehmer
                                </div>
                              </div>
                              <StatusBadge
                                tone={m.status === "active" ? "emerald" : m.status === "completed" ? "slate" : "amber"}
                                className="shrink-0"
                              >
                                {m.status === "active" ? "Live" : m.status === "completed" ? "Beendet" : "Entwurf"}
                              </StatusBadge>
                            </div>
                          </button>
                        ))}
                      </div>
                    </section>
                  </div>
                )}

                {/* ── OPS ───────────────────────────────────── */}
                {page === "ops" && !opsDetail && (
                  <div className="animate-fade-up space-y-8">
                    <header className="space-y-2 pb-2">
                      <div className="text-xs font-medium text-brand/80">Operations</div>
                      <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">Einsätze</h3>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        Plane, starte und tritt Einsätzen bei.
                      </p>
                    </header>

                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      {[
                        {
                          label: "Einsatz jetzt starten",
                          desc: "Sofort losfliegen — inkl. Boardcomputer",
                          icon: Plus,
                          run: () => {
                            const m: DemoMission = {
                              id: nextId("m"),
                              title: "Sofort-Einsatz",
                              date: "Jetzt",
                              objective: "Ad-hoc Operation",
                              isPublic: false,
                              status: "active",
                              participants: 1,
                              routeId: null,
                            };
                            setMissions((ms) => [m, ...ms]);
                            setOpenId(m.id);
                          },
                        },
                        {
                          label: "Event planen",
                          desc: "Mit Termin, Lobby und Kalender",
                          icon: Calendar,
                          run: () => setMissionForm({ title: "", date: "", objective: "", isPublic: true }),
                        },
                        {
                          label: "Meine Einsätze",
                          desc: "Als Leader oder Teilnehmer",
                          icon: User,
                          run: () => setMissionForm(null),
                        },
                        {
                          label: "Kalender",
                          desc: "Öffentliche & interne Einsätze",
                          icon: CalendarDays,
                          run: () => setMissionForm(null),
                        },
                      ].map((t) => (
                        <button
                          key={t.label}
                          onClick={t.run}
                          className="group flex flex-col gap-2 rounded-2xl border border-white/8 bg-card/40 p-4 text-left transition hover:border-brand/40 hover:bg-card/70"
                        >
                          <t.icon className="h-5 w-5 text-brand" />
                          <div className="text-sm font-semibold tracking-tight">{t.label}</div>
                          <div className="text-xs text-muted-foreground">{t.desc}</div>
                        </button>
                      ))}
                    </div>

                    {missionForm && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = missionForm;
                          if (!f.title.trim()) return;
                          if (f.id) {
                            updateMission(f.id, {
                              title: f.title.trim(),
                              date: f.date.trim() || "Termin offen",
                              objective: f.objective.trim(),
                              isPublic: f.isPublic,
                            });
                          } else {
                            const created = nextId("m");
                            setMissions((ms) => [
                              {
                                id: created,
                                title: f.title.trim(),
                                date: f.date.trim() || "Termin offen",
                                objective: f.objective.trim() || "Ohne Zielangabe",
                                isPublic: f.isPublic,
                                status: "draft",
                                participants: 1,
                                routeId: null,
                              },
                              ...ms,
                            ]);
                            setOpenId(created);
                          }
                          setMissionForm(null);
                        }}
                        className="space-y-4 rounded-2xl border border-brand/25 bg-card/50 p-5 backdrop-blur-md"
                      >
                        <DashSectionHeader
                          icon={Plus}
                          title={missionForm.id ? "Einsatz bearbeiten" : "Neuer Einsatz"}
                          subtitle="Titel, Termin, Ziel und Sichtbarkeit"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <DemoField label="Titel">
                            <input
                              className={inputCls}
                              value={missionForm.title}
                              placeholder="z. B. Konvoi Aaron's Halo"
                              onChange={(e) => setMissionForm({ ...missionForm, title: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Start">
                            <input
                              className={inputCls}
                              value={missionForm.date}
                              placeholder="Heute, 20:30 Uhr"
                              onChange={(e) => setMissionForm({ ...missionForm, date: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Ziel" className="sm:col-span-2">
                            <input
                              className={inputCls}
                              value={missionForm.objective}
                              placeholder="Bergung und Eskorte"
                              onChange={(e) => setMissionForm({ ...missionForm, objective: e.target.value })}
                            />
                          </DemoField>
                        </div>
                        <button
                          type="button"
                          onClick={() => setMissionForm({ ...missionForm, isPublic: !missionForm.isPublic })}
                          className="flex items-center gap-2 text-xs text-muted-foreground"
                        >
                          <span
                            className={`relative h-5 w-9 rounded-full transition ${
                              missionForm.isPublic ? "bg-brand/70" : "bg-white/10"
                            }`}
                          >
                            <span
                              className={`absolute top-0.5 h-4 w-4 rounded-full bg-background transition ${
                                missionForm.isPublic ? "left-[18px]" : "left-0.5"
                              }`}
                            />
                          </span>
                          Öffentlich im Kalender zeigen
                        </button>
                        <div className="flex flex-wrap gap-2">
                          <PrimaryBtn type="submit">
                            <Plus className="h-4 w-4" /> {missionForm.id ? "Änderungen speichern" : "Einsatz anlegen"}
                          </PrimaryBtn>
                          <GhostBtn onClick={() => setMissionForm(null)}>Abbrechen</GhostBtn>
                        </div>
                      </form>
                    )}

                    <div className="space-y-3">
                      <DashSectionHeader icon={Target} title="Deine Einsätze" subtitle={`${missions.length} gesamt`} />
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                        {missions.length === 0 && (
                          <div className="rounded-xl border border-dashed border-brand/20 p-6 text-center text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">
                            Keine Einsätze vorhanden — lege oben einen an.
                          </div>
                        )}
                        {missions.map((m) => (
                          <div
                            key={m.id}
                            className="flex flex-col gap-2 rounded-xl border border-white/8 bg-card/40 p-3 transition hover:border-brand/40"
                          >
                            <button onClick={() => setOpenId(m.id)} className="flex items-center gap-3 text-left">
                              <Target className="h-4 w-4 text-brand" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">{m.title}</div>
                                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  {m.status} · {m.participants} TN · {m.isPublic ? "öffentlich" : "intern"}
                                </div>
                              </div>
                            </button>
                            <div className="flex flex-wrap gap-1.5">
                              <GhostBtn
                                onClick={() =>
                                  setMissionForm({
                                    id: m.id,
                                    title: m.title,
                                    date: m.date,
                                    objective: m.objective,
                                    isPublic: m.isPublic,
                                  })
                                }
                              >
                                Bearbeiten
                              </GhostBtn>
                              <GhostBtn
                                tone="brand"
                                disabled={m.status !== "draft"}
                                onClick={() => updateMission(m.id, { status: "active" })}
                              >
                                <Activity className="h-3 w-3" /> Starten
                              </GhostBtn>
                              <GhostBtn
                                tone="danger"
                                onClick={() => {
                                  setMissions((ms) => ms.filter((x) => x.id !== m.id));
                                  if (openId === m.id) setOpenId(null);
                                }}
                              >
                                Löschen
                              </GhostBtn>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── OPS DETAIL + VOICE ────────────────────── */}
                {page === "ops" && opsDetail && openMission && (
                  <div className="animate-fade-up space-y-6">
                    <button
                      onClick={() => setOpenId(null)}
                      className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-brand"
                    >
                      ← Einsätze
                    </button>

                    <header className="space-y-2 pb-2">
                      <div className="text-xs font-medium text-brand/80">Operations</div>
                      <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
                        {openMission.title}
                      </h3>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        {openMission.date} · {openMission.objective} ·{" "}
                        {openMission.isPublic ? "Öffentlich" : "Intern"}
                      </p>
                    </header>

                    <StatGrid cols={4}>
                      <StatCard
                        label="Status"
                        value={
                          openMission.status === "active"
                            ? "Aktiv"
                            : openMission.status === "completed"
                              ? "Beendet"
                              : "Lobby"
                        }
                        icon={Activity}
                        tone={openMission.status === "active" ? "emerald" : "amber"}
                      />
                      <StatCard label="Teilnehmer" value={openMission.participants} icon={Users} tone="brand" />
                      <StatCard label="Schiffe" value={allShips.length} icon={ShipIcon} />
                      <StatCard label="Squads" value={backofficeDemoSquads.length} icon={Target} />
                    </StatGrid>

                    {confirmedRoute && openMission.routeId === confirmedRoute.id && (
                      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/30 bg-brand/[0.06] p-4 text-sm">
                        <RouteIcon className="h-4 w-4 text-brand" />
                        <span className="font-medium">{confirmedRoute.commodity}</span>
                        <span className="text-muted-foreground">
                          {confirmedRoute.from} → {confirmedRoute.to} · {confirmedRoute.scu} SCU
                        </span>
                        <span className="ml-auto font-display text-emerald-400">+{confirmedRoute.profit} aUEC</span>
                        <GhostBtn tone="danger" onClick={() => updateMission(openMission.id, { routeId: null })}>
                          Route entfernen
                        </GhostBtn>
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => {
                          updateMission(openMission.id, {
                            status: "active",
                            participants: Math.max(openMission.participants, 4),
                          });
                        }}
                        disabled={openMission.status !== "draft"}
                        className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-brand/20 transition hover:brightness-110 disabled:opacity-50"
                      >
                        <Activity className="h-4 w-4" />{" "}
                        {openMission.status === "draft" ? "Einsatz starten" : "Einsatz läuft"}
                      </button>
                      <button
                        onClick={() => updateMission(openMission.id, { participants: openMission.participants + 1 })}
                        className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/50 px-5 py-2.5 text-sm font-medium transition hover:bg-card/70"
                      >
                        <Plus className="h-4 w-4" /> Teilnehmer eintragen
                      </button>
                      <button
                        onClick={() =>
                          updateMission(openMission.id, {
                            participants: Math.max(0, openMission.participants - 1),
                          })
                        }
                        className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/50 px-5 py-2.5 text-sm font-medium transition hover:bg-card/70"
                      >
                        Austragen
                      </button>
                      <button
                        onClick={() => updateMission(openMission.id, { status: "completed" })}
                        disabled={openMission.status !== "active"}
                        className="focus-ring inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-5 py-2.5 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                      >
                        Einsatz abschließen
                      </button>
                    </div>

                    {/* Squads & Schiffe */}
                    <div className="space-y-3">
                      <DashSectionHeader icon={Users} title="Squads & Schiffe" subtitle="Einsatzstruktur" />
                      {backofficeDemoSquads.map((sq) => (
                        <div key={sq.id} className="rounded-2xl border border-white/8 bg-card/40 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="font-display text-sm">{sq.name}</div>
                            <DemoBadge className="border-brand/30 text-brand">Squadlead: {sq.lead}</DemoBadge>
                          </div>
                          <div className="mt-3 space-y-2">
                            {sq.ships.map((s) => (
                              <div
                                key={s.id}
                                className="flex items-center gap-3 rounded-xl border border-white/8 bg-background/40 px-3 py-2"
                              >
                                <ShipIcon className="h-4 w-4 text-brand" />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium">{s.name}</div>
                                  <div className="truncate text-xs text-muted-foreground">
                                    {s.pilot} · {s.role}
                                  </div>
                                </div>
                                <Chip>{(backofficeDemoStations[s.id] ?? []).length} Stationen</Chip>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Voice-Panel im Terminal-Look des echten Backoffices */}
                    <VoiceDemo
                      joined={voiceJoined}
                      setJoined={setVoiceJoined}
                      activeStation={activeStation}
                      setActiveStation={setActiveStation}
                      stationName={stationName}
                      stationShip={stationShip?.name}
                      mode={mode}
                      setMode={setMode}
                      shipWide={shipWide}
                      setShipWide={setShipWide}
                      squadleadNet={squadleadNet}
                      setSquadleadNet={setSquadleadNet}
                      missionNet={missionNet}
                      setMissionNet={setMissionNet}
                    />
                  </div>
                )}

                {/* ── ORGALAGER ─────────────────────────────── */}
                {page === "lager" && (
                  <div className="animate-fade-up space-y-6">
                    <header className="space-y-2 pb-2">
                      <div className="text-xs font-medium text-brand/80">Orga & Community</div>
                      <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">Orgalager</h3>
                      <p className="max-w-2xl text-sm text-muted-foreground">{pageMeta.lager.description}</p>
                    </header>

                    <PageHint>
                      Übersicht über den gesamten Orgalagerbestand. Gesperrte Items sind nur für das Orgateam
                      verfügbar; offene Angebote und Freigaben kannst du hier direkt annehmen oder verwalten.
                    </PageHint>

                    <div className="inline-flex flex-wrap items-center gap-1 rounded-xl bg-muted/40 p-1">
                      {(
                        [
                          ["stock", "Bestand", stockItems.length],
                          ["offers", "Offene Angebote", 1],
                          ["releases", "Freigaben", 0],
                          ["requests", "Anfragen", requests.length],
                        ] as const
                      ).map(([id, label, count]) => (
                        <button
                          key={id}
                          onClick={() => setLagerTab(id)}
                          className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition ${
                            lagerTab === id
                              ? "bg-background text-foreground shadow-sm"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {label} <DemoBadge>{count}</DemoBadge>
                        </button>
                      ))}
                    </div>

                    {lagerTab === "stock" && (
                      <div className="space-y-4">
                        <div className="flex flex-wrap gap-2">
                          <PrimaryBtn
                            onClick={() =>
                              setStockForm({ name: "", qty: "", holder: "Kommandant", loc: "HUR-L3 · Hangar 4", q: "A" })
                            }
                          >
                            <Plus className="h-4 w-4" /> Position anlegen
                          </PrimaryBtn>
                        </div>

                        {stockForm && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              const f = stockForm;
                              if (!f.name.trim()) return;
                              if (f.id) {
                                setStockItems((items) =>
                                  items.map((it) =>
                                    it.id === f.id
                                      ? {
                                          ...it,
                                          name: f.name.trim(),
                                          qty: f.qty.trim(),
                                          holder: f.holder.trim(),
                                          loc: f.loc.trim(),
                                          q: f.q.trim() || "A",
                                        }
                                      : it,
                                  ),
                                );
                              } else {
                                setStockItems((items) => [
                                  {
                                    id: nextId("s"),
                                    name: f.name.trim(),
                                    qty: f.qty.trim() || "1 Stk",
                                    holder: f.holder.trim() || "Kommandant",
                                    loc: f.loc.trim() || "HUR-L3 · Hangar 4",
                                    q: f.q.trim() || "A",
                                    locked: false,
                                  },
                                  ...items,
                                ]);
                              }
                              setStockForm(null);
                            }}
                            className="space-y-4 rounded-2xl border border-brand/25 bg-card/50 p-5"
                          >
                            <DashSectionHeader
                              icon={Package}
                              title={stockForm.id ? "Position bearbeiten" : "Neue Lagerposition"}
                              subtitle="Item, Menge, Halter, Standort und Qualität"
                            />
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                              <DemoField label="Item">
                                <input
                                  className={inputCls}
                                  value={stockForm.name}
                                  placeholder="z. B. Quantum Fuel"
                                  onChange={(e) => setStockForm({ ...stockForm, name: e.target.value })}
                                />
                              </DemoField>
                              <DemoField label="Menge">
                                <input
                                  className={inputCls}
                                  value={stockForm.qty}
                                  placeholder="600 L"
                                  onChange={(e) => setStockForm({ ...stockForm, qty: e.target.value })}
                                />
                              </DemoField>
                              <DemoField label="Halter">
                                <input
                                  className={inputCls}
                                  value={stockForm.holder}
                                  onChange={(e) => setStockForm({ ...stockForm, holder: e.target.value })}
                                />
                              </DemoField>
                              <DemoField label="Standort" className="sm:col-span-2">
                                <input
                                  className={inputCls}
                                  value={stockForm.loc}
                                  onChange={(e) => setStockForm({ ...stockForm, loc: e.target.value })}
                                />
                              </DemoField>
                              <DemoField label="Qualität">
                                <select
                                  className={inputCls}
                                  value={stockForm.q}
                                  onChange={(e) => setStockForm({ ...stockForm, q: e.target.value })}
                                >
                                  {["A", "B", "C"].map((q) => (
                                    <option key={q} value={q}>
                                      {q}
                                    </option>
                                  ))}
                                </select>
                              </DemoField>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              <PrimaryBtn type="submit">
                                <Plus className="h-4 w-4" /> {stockForm.id ? "Speichern" : "Position anlegen"}
                              </PrimaryBtn>
                              <GhostBtn onClick={() => setStockForm(null)}>Abbrechen</GhostBtn>
                            </div>
                          </form>
                        )}

                        {requestDraft && (
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              setRequests((rs) => [
                                {
                                  id: nextId("req"),
                                  itemId: requestDraft.itemId,
                                  itemName: requestDraft.itemName,
                                  qty: requestDraft.qty.trim() || "1",
                                  status: "open",
                                },
                                ...rs,
                              ]);
                              setRequestDraft(null);
                              setLagerTab("requests");
                            }}
                            className="flex flex-wrap items-end gap-3 rounded-2xl border border-brand/25 bg-card/50 p-4"
                          >
                            <DemoField label={`Anfrage · ${requestDraft.itemName}`} className="min-w-[200px] flex-1">
                              <input
                                className={inputCls}
                                value={requestDraft.qty}
                                placeholder="Menge, z. B. 200 L"
                                onChange={(e) => setRequestDraft({ ...requestDraft, qty: e.target.value })}
                              />
                            </DemoField>
                            <PrimaryBtn type="submit">
                              <ShoppingCart className="h-4 w-4" /> Anfrage senden
                            </PrimaryBtn>
                            <GhostBtn onClick={() => setRequestDraft(null)}>Abbrechen</GhostBtn>
                          </form>
                        )}

                        <div className="space-y-1">
                          <div className="flex items-center gap-2 border-b border-brand/10 pb-1 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                            <Tag className="h-3 w-3" /> Verbrauchsmaterial
                            <DemoBadge>{stockItems.length}</DemoBadge>
                          </div>
                          {stockItems.map((s) => {
                            const isLocked = s.locked;
                            const isRequested = requests.some((r) => r.itemId === s.id && r.status === "open");
                            return (
                              <div
                                key={s.id}
                                className={`flex flex-wrap items-center gap-3 border px-3 py-2 ${
                                  isLocked ? "border-red-500/40 bg-red-500/5" : "border-brand/10 bg-background/50"
                                }`}
                              >
                                {isLocked ? (
                                  <Lock className="h-4 w-4 text-red-400" />
                                ) : (
                                  <Package className="h-4 w-4 text-muted-foreground" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                                    <span className="truncate text-brand">{s.name}</span>
                                    <DemoBadge className="border-brand/30 text-brand">Qualität {s.q}</DemoBadge>
                                    {isLocked && (
                                      <DemoBadge className="border-red-500/40 text-red-300">Gesperrt</DemoBadge>
                                    )}
                                    {isRequested && (
                                      <DemoBadge className="border-emerald-500/40 text-emerald-300">
                                        Angefragt
                                      </DemoBadge>
                                    )}
                                  </div>
                                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                    {s.qty} · Halter {s.holder} · {s.loc}
                                  </div>
                                </div>
                                <button
                                  onClick={() =>
                                    setStockItems((items) =>
                                      items.map((it) => (it.id === s.id ? { ...it, locked: !it.locked } : it)),
                                    )
                                  }
                                  className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-muted-foreground transition hover:border-brand/40 hover:text-brand"
                                >
                                  {isLocked ? <Unlock className="h-3 w-3" /> : <Lock className="h-3 w-3" />}
                                  {isLocked ? "Freigeben" : "Sperren"}
                                </button>
                                <GhostBtn
                                  onClick={() =>
                                    setStockForm({
                                      id: s.id,
                                      name: s.name,
                                      qty: s.qty,
                                      holder: s.holder,
                                      loc: s.loc,
                                      q: s.q,
                                    })
                                  }
                                >
                                  Bearbeiten
                                </GhostBtn>
                                <GhostBtn
                                  tone="danger"
                                  onClick={() => {
                                    setStockItems((items) => items.filter((it) => it.id !== s.id));
                                    setRequests((rs) => rs.filter((r) => r.itemId !== s.id));
                                  }}
                                >
                                  Löschen
                                </GhostBtn>
                                <button
                                  disabled={isLocked || isRequested}
                                  aria-label={`Item anfragen: ${s.name}`}
                                  onClick={() => setRequestDraft({ itemId: s.id, itemName: s.name, qty: "" })}
                                  className="inline-flex items-center gap-1.5 rounded-md border border-brand/40 bg-brand/10 px-2.5 py-1 text-[11px] font-medium text-brand transition hover:bg-brand/20 disabled:opacity-40"
                                >
                                  <ShoppingCart className="h-3 w-3" /> {isRequested ? "Angefragt" : "Item anfragen"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {lagerTab === "offers" && (
                      <div className="flex items-center gap-3 border border-brand/10 bg-background/50 px-3 py-2 text-sm">
                        <Store className="h-4 w-4 text-brand" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium">Salvage RMC · 96 SCU</div>
                          <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                            Angeboten von Salvor · Aaron’s Halo
                          </div>
                        </div>
                        <DemoBadge className="border-emerald-500/40 text-emerald-300">Offen</DemoBadge>
                      </div>
                    )}

                    {lagerTab === "releases" && (
                      <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
                        Keine offenen Freigaben.
                      </div>
                    )}

                    {lagerTab === "requests" &&
                      (requests.length === 0 ? (
                        <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
                          Keine Anfragen. Frage im Reiter „Bestand“ ein nicht gesperrtes Item an.
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {requests.map((r) => (
                            <div
                              key={r.id}
                              className="flex flex-wrap items-center gap-3 border border-brand/10 bg-background/50 px-3 py-2"
                            >
                              <ClipboardList className="h-4 w-4 text-brand" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-sm font-medium">
                                  {r.itemName} · {r.qty}
                                </div>
                                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                  Angefragt von Kommandant ·{" "}
                                  {r.status === "open"
                                    ? "wartet auf Lagerverwaltung"
                                    : r.status === "approved"
                                      ? "bestätigt, Übergabe Ingame"
                                      : "abgelehnt"}
                                </div>
                              </div>
                              <DemoBadge
                                className={
                                  r.status === "approved"
                                    ? "border-emerald-500/40 text-emerald-300"
                                    : r.status === "rejected"
                                      ? "border-red-500/40 text-red-300"
                                      : "border-amber-500/40 text-amber-300"
                                }
                              >
                                {r.status === "approved"
                                  ? "Bestätigt"
                                  : r.status === "rejected"
                                    ? "Abgelehnt"
                                    : "Offen"}
                              </DemoBadge>
                              <GhostBtn
                                tone="brand"
                                disabled={r.status !== "open"}
                                onClick={() =>
                                  setRequests((rs) =>
                                    rs.map((x) => (x.id === r.id ? { ...x, status: "approved" as const } : x)),
                                  )
                                }
                              >
                                Bestätigen
                              </GhostBtn>
                              <GhostBtn
                                disabled={r.status !== "open"}
                                onClick={() =>
                                  setRequests((rs) =>
                                    rs.map((x) => (x.id === r.id ? { ...x, status: "rejected" as const } : x)),
                                  )
                                }
                              >
                                Ablehnen
                              </GhostBtn>
                              <GhostBtn
                                tone="danger"
                                onClick={() => setRequests((rs) => rs.filter((x) => x.id !== r.id))}
                              >
                                Löschen
                              </GhostBtn>
                            </div>
                          ))}
                        </div>
                      ))}
                  </div>
                )}

                {/* ── HANDEL / ROUTENPLANER ─────────────────── */}
                {page === "handel" && (
                  <div className="animate-fade-up space-y-6">
                    <header className="grid gap-4 pb-2 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
                      <div className="min-w-0 space-y-2">
                        <div className="text-xs font-medium text-brand/80">Handel</div>
                        <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
                          Routenplaner
                        </h3>
                        <p className="max-w-2xl text-sm text-muted-foreground">{pageMeta.handel.description}</p>
                      </div>
                      <nav className="inline-flex flex-wrap items-center gap-1 rounded-2xl border border-white/8 bg-card/50 p-1 backdrop-blur-md">
                        {["Übersicht", "Routenplaner", "Verkauf"].map((l) => (
                          <span
                            key={l}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium ${
                              l === "Routenplaner"
                                ? "bg-brand/20 text-brand"
                                : "text-muted-foreground"
                            }`}
                          >
                            {l}
                          </span>
                        ))}
                      </nav>
                    </header>

                    <div className="space-y-4 rounded-2xl border border-white/8 bg-card/40 p-5">
                      <div className="grid gap-3 sm:grid-cols-3">
                        <Metric label="Budget" value="1 200 000 aUEC" />
                        <Metric label="Frachtraum" value="96 SCU" />
                        <Metric label="Startort" value="HUR-L3" />
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <Chip>Nur Stationen</Chip>
                        <Chip>Keine Raffinerien als Kauf-Ort</Chip>
                        <Chip>Min. Marge 40 aUEC/SCU</Chip>
                      </div>
                    </div>

                    <StatGrid cols={3}>
                      <StatCard icon={RouteIcon} label="Routen gefunden" value={routeList.length} />
                      <StatCard icon={TrendingUp} label="Bester Gewinn" value="142 000 aUEC" tone="emerald" />
                      <StatCard icon={Coins} label="Ø Gewinn" value="78 433 aUEC" />
                    </StatGrid>

                    <div className="flex flex-wrap gap-2">
                      <PrimaryBtn
                        onClick={() =>
                          setRouteForm({ commodity: "", from: "", to: "", profit: "", scu: "96", ship: allShips[0]?.name ?? "" })
                        }
                      >
                        <Plus className="h-4 w-4" /> Route anlegen
                      </PrimaryBtn>
                    </div>

                    {routeForm && (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const f = routeForm;
                          if (!f.commodity.trim()) return;
                          const payload = {
                            commodity: f.commodity.trim(),
                            from: f.from.trim() || "HUR-L3",
                            to: f.to.trim() || "ARC-L1",
                            profit: f.profit.trim() || "0",
                            scu: Number(f.scu) || 0,
                            ship: f.ship.trim() || (allShips[0]?.name ?? "—"),
                          };
                          if (f.id) {
                            setRouteList((rs) => rs.map((r) => (r.id === f.id ? { ...r, ...payload } : r)));
                          } else {
                            setRouteList((rs) => [{ id: nextId("r"), ...payload }, ...rs]);
                          }
                          setRouteForm(null);
                        }}
                        className="space-y-4 rounded-2xl border border-brand/25 bg-card/50 p-5"
                      >
                        <DashSectionHeader
                          icon={RouteIcon}
                          title={routeForm.id ? "Route bearbeiten" : "Neue Route"}
                          subtitle="Ware, Start, Ziel, Menge und Gewinn"
                        />
                        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          <DemoField label="Ware">
                            <input
                              className={inputCls}
                              value={routeForm.commodity}
                              placeholder="Salvage RMC"
                              onChange={(e) => setRouteForm({ ...routeForm, commodity: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Kaufort">
                            <input
                              className={inputCls}
                              value={routeForm.from}
                              placeholder="HUR-L3"
                              onChange={(e) => setRouteForm({ ...routeForm, from: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Verkaufsort">
                            <input
                              className={inputCls}
                              value={routeForm.to}
                              placeholder="ARC-L1"
                              onChange={(e) => setRouteForm({ ...routeForm, to: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Menge (SCU)">
                            <input
                              className={inputCls}
                              inputMode="numeric"
                              value={routeForm.scu}
                              onChange={(e) => setRouteForm({ ...routeForm, scu: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Gewinn (aUEC)">
                            <input
                              className={inputCls}
                              value={routeForm.profit}
                              placeholder="142 000"
                              onChange={(e) => setRouteForm({ ...routeForm, profit: e.target.value })}
                            />
                          </DemoField>
                          <DemoField label="Schiff">
                            <select
                              className={inputCls}
                              value={routeForm.ship}
                              onChange={(e) => setRouteForm({ ...routeForm, ship: e.target.value })}
                            >
                              {allShips.map((s) => (
                                <option key={s.id} value={s.name}>
                                  {s.name}
                                </option>
                              ))}
                            </select>
                          </DemoField>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <PrimaryBtn type="submit">
                            <Plus className="h-4 w-4" /> {routeForm.id ? "Speichern" : "Route anlegen"}
                          </PrimaryBtn>
                          <GhostBtn onClick={() => setRouteForm(null)}>Abbrechen</GhostBtn>
                        </div>
                      </form>
                    )}

                    <div className="space-y-3">
                      {routeList.map((r, i) => {
                        const target = openMission ?? missions[0] ?? null;
                        const selected = missions.some((m) => m.routeId === r.id);
                        return (
                          <div
                            key={r.id}
                            className={`w-full rounded-2xl border p-4 text-left transition ${
                              selected ? "border-brand/50 bg-brand/[0.06]" : "border-white/8 bg-card/40 hover:border-brand/30"
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs text-muted-foreground">#{i + 1}</span>
                                  <span className="font-display text-lg">{r.commodity}</span>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                                  <span className="text-foreground">{r.from}</span>
                                  <span>→</span>
                                  <span className="text-emerald-300">{r.to}</span>
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-display text-2xl tabular-nums text-emerald-400">
                                  +{r.profit}
                                </div>
                                <div className="text-xs text-muted-foreground">aUEC Gewinn</div>
                              </div>
                            </div>
                            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                              <Metric label="Menge" value={`${r.scu} SCU`} />
                              <Metric label="Schiff" value={r.ship} />
                              <Metric label="Kauf/SCU" value="1 240 aUEC" />
                              <Metric label="Investment" value="119 040 aUEC" />
                            </div>
                            <div className="mt-3 flex flex-wrap items-center gap-2">
                              <GhostBtn
                                tone="brand"
                                disabled={!target || selected}
                                aria-label={`Route ${r.commodity} für Einsatz bestätigen`}
                                onClick={() => target && updateMission(target.id, { routeId: r.id })}
                              >
                                <Activity className="h-3 w-3" />{" "}
                                {target ? `Für „${target.title}" bestätigen` : "Kein Einsatz vorhanden"}
                              </GhostBtn>
                              <GhostBtn
                                onClick={() =>
                                  setRouteForm({
                                    id: r.id,
                                    commodity: r.commodity,
                                    from: r.from,
                                    to: r.to,
                                    profit: r.profit,
                                    scu: String(r.scu),
                                    ship: r.ship,
                                  })
                                }
                              >
                                Bearbeiten
                              </GhostBtn>
                              <GhostBtn
                                tone="danger"
                                onClick={() => {
                                  setRouteList((rs) => rs.filter((x) => x.id !== r.id));
                                  setMissions((ms) =>
                                    ms.map((m) => (m.routeId === r.id ? { ...m, routeId: null } : m)),
                                  );
                                }}
                              >
                                Löschen
                              </GhostBtn>
                              {selected && (
                                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                                  In Einsatz übernommen
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* ── MEINE FLOTTE ──────────────────────────── */}
                {page === "flotte" && (
                  <DemoFleetPage
                    filter={fleetFilter}
                    setFilter={setFleetFilter}
                    view={fleetView}
                    setView={setFleetView}
                    sortMode={fleetSort}
                    setSortMode={setFleetSort}
                  />
                )}
              </div>

              {/* Footer der Demo */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-brand/15 bg-card/30 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  {[
                    ["Einsatz starten", missionActive],
                    ["Material anfragen", requests.length > 0],
                    ["Route wählen", confirmedRoute !== null],
                    ["Voice beitreten", voiceJoined],
                  ].map(([label, ok]) => (
                    <span
                      key={String(label)}
                      className={`rounded-full border px-2 py-0.5 ${
                        ok ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-300" : "border-white/10"
                      }`}
                    >
                      {String(label)}
                    </span>
                  ))}
                </div>
                <button
                  onClick={reset}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-brand/25 px-3 py-1.5 text-[11px] font-medium text-brand hover:bg-brand/10"
                >
                  <RotateCcw className="size-3.5" /> Demo zurücksetzen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── Voice im Look des echten VoicePanels ──────────────────────── */

function VoiceDemo({
  joined,
  setJoined,
  activeStation,
  setActiveStation,
  stationName,
  stationShip,
  mode,
  setMode,
  shipWide,
  setShipWide,
  squadleadNet,
  setSquadleadNet,
  missionNet,
  setMissionNet,
}: {
  joined: boolean;
  setJoined: (v: boolean) => void;
  activeStation: string;
  setActiveStation: (v: string) => void;
  stationName: string;
  stationShip?: string;
  mode: "ptt" | "vox";
  setMode: (v: "ptt" | "vox") => void;
  shipWide: boolean;
  setShipWide: (v: boolean) => void;
  squadleadNet: boolean;
  setSquadleadNet: (v: boolean) => void;
  missionNet: boolean;
  setMissionNet: (v: boolean) => void;
}) {
  return (
    <section className="voice-panel-frame relative overflow-hidden">
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-brand/25 px-4 py-2.5">
        <div className="flex items-center gap-2.5 font-mono text-[10px] uppercase tracking-[0.35em] text-brand">
          <span className={`voice-led ${joined ? "is-on" : ""}`} />
          Voice
          <span className="text-muted-foreground/50">·</span>
          <span className="text-muted-foreground">{joined ? "verbunden" : "getrennt"}</span>
        </div>
        <button
          onClick={() => setJoined(!joined)}
          className={`flex items-center gap-1.5 border px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] transition ${
            joined
              ? "border-rose-400/50 text-rose-200 hover:bg-rose-500/10"
              : "border-brand bg-brand text-primary-foreground"
          }`}
        >
          <Mic size={11} /> {joined ? "Verlassen" : "Kanal beitreten"}
        </button>
      </div>

      {joined && (
        <div className="relative z-10 border-b border-brand/25 bg-background/70 px-4 py-3 backdrop-blur">
          <div className="grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.35em] text-muted-foreground">
                <Signal size={11} className="text-brand" /> Aktiver Kanal
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-brand/70">
                  {stationShip ?? "Schiff"}
                </span>
                <span className="text-muted-foreground">›</span>
                <span
                  className="font-mono text-base uppercase tracking-[0.15em] text-brand"
                  style={{ textShadow: "0 0 8px color-mix(in oklab, var(--brand) 40%, transparent)" }}
                >
                  {stationName}
                </span>
                {shipWide && (
                  <span className="inline-flex items-center gap-1.5 border border-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-200">
                    <span className="voice-led is-broadcast" /> Schiffsweit live
                  </span>
                )}
                {missionNet && (
                  <span className="inline-flex items-center gap-1.5 border border-cyan-400/60 bg-cyan-500/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-200">
                    <span className="voice-led is-broadcast" /> Einsatzweit live
                  </span>
                )}
                {squadleadNet && (
                  <span className="inline-flex items-center gap-1.5 border border-amber-400/70 bg-amber-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-amber-200">
                    <span className="voice-led is-squadlead" /> Squadlead-Funk live
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <div className="inline-flex overflow-hidden border border-brand/40 font-mono">
                  <button
                    onClick={() => setMode("ptt")}
                    className={`px-2.5 py-1.5 text-[10px] uppercase tracking-[0.25em] ${
                      mode === "ptt" ? "bg-brand text-primary-foreground" : "text-brand hover:bg-brand/10"
                    }`}
                  >
                    PTT
                  </button>
                  <button
                    onClick={() => setMode("vox")}
                    className={`border-l border-brand/40 px-2.5 py-1.5 text-[10px] uppercase tracking-[0.25em] ${
                      mode === "vox" ? "bg-brand text-primary-foreground" : "text-brand hover:bg-brand/10"
                    }`}
                  >
                    VOX
                  </button>
                </div>
                <span className="flex items-center gap-1.5 border border-brand/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <Mic size={11} /> Mic an
                </span>
                <span className="flex items-center gap-1.5 border border-brand/30 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  <Headphones size={11} /> Audio
                </span>
              </div>
            </div>

            <div className="flex min-w-[240px] flex-col justify-center gap-1.5">
              <button
                onClick={() => setShipWide(!shipWide)}
                className={`voice-broadcast-btn ${shipWide ? "is-live" : ""} flex flex-col items-center gap-1 px-4 py-3 font-mono uppercase`}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`voice-led ${shipWide ? "is-broadcast" : ""}`} /> Schiffsweiter Kanal
                </div>
                <div className="text-[9px] tracking-[0.35em] opacity-80">
                  {shipWide ? "aktiv" : "alle Stationen"}
                </div>
              </button>
              <button
                onClick={() => setMissionNet(!missionNet)}
                className={`voice-broadcast-btn ${missionNet ? "is-live" : ""} flex flex-col items-center gap-1 px-4 py-2 font-mono uppercase`}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className={`voice-led ${missionNet ? "is-broadcast" : ""}`} /> Einsatzweiter Broadcast
                </div>
                <div className="text-[9px] tracking-[0.35em] opacity-80">{missionNet ? "on air" : "alle Squads"}</div>
              </button>
              <button
                onClick={() => setSquadleadNet(!squadleadNet)}
                className={`voice-broadcast-btn is-squadlead ${squadleadNet ? "is-live" : ""} flex flex-col items-center gap-1 px-4 py-2 font-mono uppercase`}
              >
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="voice-led is-squadlead" /> Squadlead-Funk
                </div>
                <div className="text-[9px] tracking-[0.35em] opacity-80">
                  {squadleadNet ? "on air" : "nur Squadleads"}
                </div>
              </button>
            </div>
          </div>

          <div className="mt-3 border-t border-brand/15 pt-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <span className="text-brand">{mode === "ptt" ? "PTT" : "VOX"}</span> ·{" "}
            {mode === "ptt" ? (
              <>
                halte <KeyRound size={10} className="inline" /> <span className="text-brand">Leertaste</span> zum
                Senden
              </>
            ) : (
              <>Sprachaktivierung mit einstellbarer Schwelle</>
            )}
          </div>
          <div className="mt-2 font-mono text-[9px] uppercase tracking-[0.3em] text-amber-200/70">
            <Star size={10} className="mr-1 inline" /> Squadleads werden direkt am Teilnehmer im Kanal ernannt
          </div>
        </div>
      )}

      {/* Kanalbaum */}
      <div className="relative z-10 border-b border-brand/10 px-4 py-3">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
          <Rocket size={12} className="text-brand" /> Multicrew-Schiffe
        </div>
        <div className="space-y-3">
          {backofficeDemoSquads.map((sq) => (
            <div key={sq.id} className="space-y-2">
              <div className="font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70">{sq.name}</div>
              {sq.ships.map((s) => {
                const stations = backofficeDemoStations[s.id] ?? [];
                const isBroadcastParent =
                  shipWide && stations.some((st) => st.id === activeStation);
                return (
                  <div
                    key={s.id}
                    className={`border ${isBroadcastParent ? "border-cyan-400/60" : "border-brand/20"} bg-background/40`}
                  >
                    <div className="voice-parent-header flex items-center justify-between gap-2 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <Rocket size={14} className={isBroadcastParent ? "text-cyan-300" : "text-brand"} />
                        <span className="truncate font-mono text-sm uppercase tracking-[0.15em] text-foreground">
                          {s.name}
                        </span>
                        <span className="ml-1 font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">
                          {stations.length} Stationen
                        </span>
                      </div>
                      {isBroadcastParent && (
                        <span className="inline-flex items-center gap-1 border border-cyan-400/60 bg-cyan-500/15 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.3em] text-cyan-100">
                          <span className="voice-led is-broadcast" /> LIVE
                        </span>
                      )}
                    </div>
                    <div className="space-y-1 p-2">
                      {stations.map((st) => {
                        const active = joined && activeStation === st.id;
                        return (
                          <button
                            key={st.id}
                            onClick={() => {
                              setActiveStation(st.id);
                              setJoined(true);
                            }}
                            className={`flex w-full items-center justify-between gap-2 border px-2.5 py-1.5 text-left font-mono text-[11px] uppercase tracking-[0.2em] transition ${
                              active
                                ? "border-brand/60 bg-brand/10 text-brand"
                                : "border-transparent text-muted-foreground hover:border-brand/20 hover:text-foreground"
                            }`}
                          >
                            <span className="flex items-center gap-2">
                              <span className={`voice-led ${active ? "is-live" : ""}`} />
                              {st.name}
                            </span>
                            <span className="text-[9px] tracking-[0.25em] text-muted-foreground/70">{st.crew}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
/* ── Meine Flotte im Look der echten Backoffice-Seite ──────────── */

function DemoSpecStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[10px] uppercase tracking-[0.18em] text-brand/60">{label}</div>
      <div className="mt-0.5 truncate text-xs text-foreground/90">{value || "—"}</div>
    </div>
  );
}

function DemoShipThumb({ code, name, image }: { code: string; name: string; image?: string }) {
  const src = proxyImage(image);
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        loading="lazy"
        className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand/12 via-background to-black/60">
      <span className="font-display text-2xl text-brand/25">{name.slice(0, 3).toUpperCase()}</span>
      <span className="sr-only">{code}</span>
    </div>
  );
}

/* ── Schiffs-Detailansicht wie im echten Backoffice ─────────────── */

type DemoShipRow = {
  id: string;
  name: string;
  customName: string | null;
  manufacturer: string;
  code: string;
  classification: string;
  size: string;
  crew: string;
  crewRange: string;
  length: string;
  cargo: string;
  location: string;
  notes: string;
  source: string;
  image?: string;
  focus: string;
  pledge: string;
  status: string;
  description: string;
};

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/60">{label}</div>
      <div className="mt-1 font-display text-xl">{value || "—"}</div>
    </div>
  );
}

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-white/5 py-2 text-sm last:border-0">
      <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{label}</span>
      <span className="truncate text-foreground/90">{value || "—"}</span>
    </div>
  );
}

function DemoShipDetail({ ship, onBack }: { ship: DemoShipRow; onBack: () => void }) {
  const img = proxyImage(ship.image);
  return (
    <div className="animate-fade-up space-y-8">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground transition hover:text-brand"
      >
        <ArrowLeft className="h-3 w-3" /> Zurück zu meiner Flotte
      </button>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="relative aspect-[16/10] overflow-hidden rounded-2xl border border-white/8 bg-black/40">
          {img ? (
            <img src={img} alt={ship.name} className="h-full w-full object-cover" />
          ) : null}
          <div className="absolute left-3 top-3">
            <StatusBadge tone="brand">{ship.code}</StatusBadge>
          </div>
          <div className="absolute right-3 top-3">
            <StatusBadge tone="emerald">{ship.status}</StatusBadge>
          </div>
        </div>

        <div className="space-y-5">
          <div>
            <div className="mb-3 inline-block rounded-md border border-brand/30 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              // {ship.classification}
            </div>
            <h3 className="font-display text-4xl leading-tight tracking-tight md:text-5xl">
              {ship.customName || ship.name}
            </h3>
            <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.25em] text-muted-foreground">
              {ship.manufacturer} · {ship.focus}
            </p>
          </div>

          <div className="grid grid-cols-2 divide-x divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-card/40 backdrop-blur-sm">
            <DetailStat label="Größe" value={ship.size} />
            <DetailStat label="Länge" value={ship.length} />
            <DetailStat label="Besatzung" value={ship.crewRange} />
            <DetailStat label="Fracht" value={ship.cargo} />
          </div>

          <div className="grid grid-cols-2 divide-x divide-white/5 overflow-hidden rounded-2xl border border-white/8 bg-card/40 backdrop-blur-sm">
            <DetailStat label="Pledge (USD)" value={ship.pledge} />
            <DetailStat label="In-Game (aUEC)" value="—" />
          </div>

          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-xs font-medium text-primary-foreground">
              <Wrench className="h-4 w-4" /> Bewaffnung planen
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-card/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              RSI Store <ExternalLink className="h-3.5 w-3.5" />
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-card/50 px-4 py-2 text-xs font-medium text-muted-foreground">
              Fleetyards <ExternalLink className="h-3.5 w-3.5" />
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-6 border-b border-white/8 pb-2 font-mono text-[10px] uppercase tracking-[0.25em]">
        {["Übersicht", "Technik", "Bewaffnung", "Galerie", "Lackierungen", "3D-Modell"].map((t, i) => (
          <span
            key={t}
            className={i === 0 ? "border-b-2 border-brand pb-2 text-brand" : "pb-2 text-muted-foreground"}
          >
            {t}
          </span>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div>
          <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// Beschreibung</div>
          <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{ship.description}</p>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/8 bg-card/40 p-4 backdrop-blur-sm">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 text-brand/70" />
                {ship.location !== "—" ? ship.location : "Kein Standort hinterlegt"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/8 bg-card/40 p-4 text-xs text-muted-foreground backdrop-blur-sm">
              {ship.notes || "Keine Notizen hinterlegt."}
            </div>
          </div>
        </div>
        <aside className="rounded-2xl border border-white/8 bg-card/40 p-4 backdrop-blur-sm">
          <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// Schnellfakten</div>
          <FactRow label="Hersteller" value={ship.manufacturer} />
          <FactRow label="Klassifikation" value={ship.classification} />
          <FactRow label="Fokus" value={ship.focus} />
          <FactRow label="Größe" value={ship.size} />
          <FactRow label="Besatzung" value={ship.crewRange} />
          <FactRow label="Länge" value={ship.length} />
          <FactRow label="Fracht" value={ship.cargo} />
          <FactRow label="Quelle" value={ship.source === "fleetyards" ? "Fleetyards" : "Manuell"} />
        </aside>
      </div>

      <PageHint>
        In der echten Anwendung findest du hier zusätzlich Galerie, Lackierungen, 3D-Modell und den
        Loadout-Editor für dieses Schiff.
      </PageHint>
    </div>
  );
}

function DemoFleetPage({
  filter,
  setFilter,
  view,
  setView,
  sortMode,
  setSortMode,
}: {
  filter: string;
  setFilter: (v: string) => void;
  view: "grid" | "list";
  setView: (v: "grid" | "list") => void;
  sortMode: "default" | "alpha";
  setSortMode: (v: "default" | "alpha") => void;
}) {
  const [openShip, setOpenShip] = useState<string | null>(null);
  const rows = allShips.map((s) => {
    const d = backofficeDemoShipDetails[s.id];
    return {
      id: s.id,
      name: s.name,
      customName: d?.customName ?? null,
      manufacturer: d?.manufacturer ?? "—",
      code: d?.code ?? "",
      classification: d?.classification ?? "—",
      size: d?.size ?? "—",
      crew: d?.crew ?? "—",
      length: d?.length ?? "—",
      cargo: d?.cargo ?? "—",
      crewRange: d?.crewRange ?? d?.crew ?? "—",
      image: d?.image,
      focus: d?.focus ?? "—",
      pledge: d?.pledge ?? "—",
      status: d?.status ?? "Flugbereit",
      description: d?.description ?? "",
      location: d?.location ?? "—",
      notes: d?.notes ?? "",
      source: d?.source ?? "manuell",
      squad: s.squad,
      pilot: s.pilot,
    };
  });

  const q = filter.trim().toLowerCase();
  const filtered = rows
    .filter((r) =>
      q
        ? `${r.name} ${r.manufacturer} ${r.customName ?? ""} ${r.location}`.toLowerCase().includes(q)
        : true,
    )
    .sort((a, b) =>
      sortMode === "alpha"
        ? a.name.localeCompare(b.name, "de")
        : a.manufacturer.localeCompare(b.manufacturer, "de") || a.name.localeCompare(b.name, "de"),
    );

  const openShipRow = openShip ? rows.find((r) => r.id === openShip) : null;
  const fyCount = rows.filter((r) => r.source === "fleetyards").length;
  const withLocation = rows.filter((r) => r.location && r.location !== "—").length;

  if (openShipRow) {
    return <DemoShipDetail ship={openShipRow} onBack={() => setOpenShip(null)} />;
  }

  return (
    <div className="animate-fade-up space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4 pb-2">
        <div className="space-y-2">
          <div className="text-xs font-medium text-brand/80">Persönlich</div>
          <h3 className="font-display text-3xl leading-tight tracking-tight md:text-4xl">
            Meine <span className="text-brand">Flotte</span>
          </h3>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Deine registrierten Schiffe. Klicke auf ein Schiff, um die Detailansicht zu öffnen — Standort
            und Notizen bearbeitest du über das Stift-Symbol.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-card/50 px-3 py-2 text-xs font-medium text-muted-foreground">
            <Link2 className="h-4 w-4" /> Fleetyards
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-xl bg-brand px-3 py-2 text-xs font-medium text-primary-foreground">
            <Plus className="h-4 w-4" /> Schiff hinzufügen
          </span>
        </div>
      </header>

      <StatGrid cols={4}>
        <StatCard label="Schiffe gesamt" value={rows.length} icon={ShipIcon} tone="brand" />
        <StatCard label="Aus Fleetyards" value={fyCount} icon={RefreshCw} tone="violet" />
        <StatCard label="Manuell erfasst" value={rows.length - fyCount} icon={Pencil} />
        <StatCard label="Mit Standort" value={withLocation} icon={MapPin} tone="emerald" />
      </StatGrid>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-white/8 bg-card/40 p-2 backdrop-blur-sm">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Schiff, Hersteller oder Standort suchen…"
            className="w-full rounded-xl border border-white/10 bg-background/50 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand/50"
          />
        </div>
        <div className="inline-flex items-center gap-1 rounded-2xl border border-white/8 bg-card/50 p-1">
          {(["default", "alpha"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setSortMode(m)}
              aria-pressed={sortMode === m}
              className={`rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                sortMode === m ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {m === "default" ? "Hersteller" : "A → Z"}
            </button>
          ))}
        </div>
        <div className="inline-flex items-center gap-1 rounded-2xl border border-white/8 bg-card/50 p-1">
          {([
            ["grid", LayoutGrid, "Kacheln"],
            ["list", ListIcon, "Liste"],
          ] as const).map(([v, Icon, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              aria-label={label}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-sm font-medium transition ${
                view === v ? "bg-brand/20 text-brand" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/8 bg-card/40 p-12 text-center text-sm text-muted-foreground backdrop-blur-sm">
          Keine Treffer für deine Suche.
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((r) => (
            <div
              key={r.id}
              role="link"
              tabIndex={0}
              aria-label={`${r.name} — Details öffnen`}
              onClick={() => setOpenShip(r.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setOpenShip(r.id);
                }
              }}
              className="group flex cursor-pointer flex-col overflow-hidden rounded-2xl border border-white/8 bg-card/50 backdrop-blur-sm transition hover:border-brand/40 hover:bg-card/70"
            >
              <div className="relative aspect-[16/10] w-full overflow-hidden bg-black/40">
                <DemoShipThumb code={r.code} name={r.name} image={r.image} />
                {r.source === "fleetyards" && (
                  <div className="absolute right-2 top-2">
                    <StatusBadge tone="violet">Fleetyards</StatusBadge>
                  </div>
                )}
                <div className="absolute bottom-2 left-2 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/80">
                  {r.code}
                </div>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="truncate font-display text-base leading-tight group-hover:text-brand">
                      {r.customName || r.name}
                    </h4>
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.customName ? `${r.name} · ` : ""}
                    {r.manufacturer}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2 border-t border-white/5 pt-3">
                  <DemoSpecStat label="Klasse" value={r.classification} />
                  <DemoSpecStat label="Größe" value={r.size} />
                  <DemoSpecStat label="Crew" value={r.crew} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <DemoSpecStat label="Länge" value={r.length} />
                  <DemoSpecStat label="Cargo" value={r.cargo} />
                </div>

                <div className="space-y-1 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5 shrink-0 text-brand/70" />
                    <span className="truncate">{r.location !== "—" ? r.location : "Kein Standort hinterlegt"}</span>
                  </div>
                  {r.notes && <p className="line-clamp-2 text-muted-foreground/80">{r.notes}</p>}
                </div>

                <div
                  className="mt-auto flex items-center gap-2 border-t border-white/5 pt-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="inline-flex items-center rounded-lg px-2 py-1.5 text-muted-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                  <span className="inline-flex items-center rounded-lg px-2 py-1.5 text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5" />
                  </span>
                  {r.source !== "fleetyards" && (
                    <span className="ml-auto inline-flex items-center rounded-lg px-2 py-1.5 text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-white/8 bg-card/40 backdrop-blur-sm">
          <ul className="divide-y divide-white/5">
            {filtered.map((r) => (
              <li
                key={r.id}
                role="link"
                tabIndex={0}
                aria-label={`${r.name} — Details öffnen`}
                onClick={() => setOpenShip(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpenShip(r.id);
                  }
                }}
                className="group flex cursor-pointer items-center gap-4 px-4 py-3 transition hover:bg-white/[0.04]"
              >
                <div className="h-12 w-20 shrink-0 overflow-hidden rounded-xl border border-white/8 bg-black/40">
                  <DemoShipThumb code={r.code} name={r.name} image={r.image} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium group-hover:text-brand">
                      {r.customName || r.name}
                    </span>
                    {r.source === "fleetyards" && <StatusBadge tone="violet">Fleetyards</StatusBadge>}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.customName ? `${r.name} · ` : ""}
                    {r.manufacturer} · {r.classification} · {r.size}
                  </div>
                </div>
                <div className="hidden min-w-0 flex-1 items-center gap-1.5 text-xs text-muted-foreground md:flex">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-brand/70" />
                  <span className="truncate">{r.location}</span>
                </div>
                <div className="hidden min-w-0 flex-1 truncate text-xs text-muted-foreground lg:block">
                  {r.notes || "—"}
                </div>
                <div className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <span className="inline-flex items-center rounded-lg px-2 py-1.5 text-muted-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </span>
                  <span className="inline-flex items-center rounded-lg px-2 py-1.5 text-muted-foreground">
                    <Wrench className="h-3.5 w-3.5" />
                  </span>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-brand" />
              </li>
            ))}
          </ul>
        </div>
      )}

      <PageHint>
        In der echten Anwendung öffnet ein Klick die Schiffs-Detailansicht mit Loadout, Komponenten und
        Einsatzhistorie.
      </PageHint>
    </div>
  );
}
