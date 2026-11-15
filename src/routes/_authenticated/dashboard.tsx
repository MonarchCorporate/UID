import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Ship as ShipIcon, Radio as RadioIcon, Target as TargetIcon, Activity, Plus, ArrowRight, Trash2, PackagePlus, ClipboardList, Store, Wallet, Warehouse, Sparkles, CalendarDays, Boxes } from "lucide-react";
import { deleteMission, listMyMissions } from "@/lib/missions.functions";
import { listMyBoardSessions } from "@/lib/board.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getFleetShips } from "@/lib/fleet.functions";
import { getMyRoles } from "@/lib/loadouts.functions";
import { getAdminOverviewStats } from "@/lib/admin.functions";
import { StatCard, StatGrid, StatusBadge, type StatusTone } from "@/components/layout/PageShell";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding/BrandingProvider";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  active:    { label: "Live",          tone: "emerald" },
  draft:     { label: "Entwurf",       tone: "amber" },
  completed: { label: "Abgeschlossen", tone: "brand" },
  cancelled: { label: "Abgebrochen",   tone: "rose" },
};

const BOARD_STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  standby:   { label: "Standby",   tone: "amber" },
  in_flight: { label: "In Flight", tone: "emerald" },
  docked:    { label: "Docked",    tone: "brand" },
};

type MissionRow = { id: string; slug: string; title: string; status: string; starts_at?: string | null };
type BoardRow = { id: string; code: string; ship_name: string; custom_name: string | null; ship_slug: string | null; status: string; updated_at: string };
type UserShip = { id: string; ship_slug: string | null; ship_name: string; manufacturer: string | null; custom_name: string | null };

function Dashboard() {
  const fetchMissions = useServerFn(listMyMissions);
  const removeMission = useServerFn(deleteMission);
  const fetchBoards = useServerFn(listMyBoardSessions);
  const fetchProfile = useServerFn(getMyProfile);
  const fetchFleet = useServerFn(getFleetShips);
  const fetchRoles = useServerFn(getMyRoles);
  const fetchAdminStats = useServerFn(getAdminOverviewStats);
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["my-missions"],
    queryFn: () => fetchMissions(),
  });
  const boards = useQuery({ queryKey: ["my-boards"], queryFn: () => fetchBoards() });
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => fetchProfile() });
  const fleet = useQuery({ queryKey: ["fleet-ships"], queryFn: () => fetchFleet() });
  const roles = useQuery({ queryKey: ["my-roles"], queryFn: () => fetchRoles() });
  const isAdmin = !!roles.data?.isAdmin;
  const adminStats = useQuery({
    queryKey: ["admin-overview"],
    queryFn: () => fetchAdminStats(),
    enabled: isAdmin,
  });

  const delMut = useMutation({
    mutationFn: (mission_id: string) => removeMission({ data: { mission_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-missions"] }),
  });

  const led = (data?.led ?? []) as MissionRow[];
  const joined = ((data?.joined ?? []) as Array<{ missions?: MissionRow }>)
    .map((p) => p.missions)
    .filter((m): m is MissionRow => !!m);

  const activeLed = led.filter((m) => m.status === "active");
  const otherLed = led.filter((m) => m.status !== "active");
  const activeJoined = joined.filter((m) => m.status === "active");
  const otherJoined = joined.filter((m) => m.status !== "active");

  const ledIds = new Set(activeLed.map((m) => m.id));
  const activeJoinedOnly = activeJoined.filter((m) => !ledIds.has(m.id));
  const activeCount = activeLed.length + activeJoinedOnly.length;

  const fleetBySlug = new Map((fleet.data?.ships ?? []).map((s) => [s.slug, s] as const));
  const SIZE_ORDER: Record<string, number> = {
    capital: 0, large: 1, medium: 2, small: 3, snub: 4, vehicle: 5,
  };
  const sizeRank = (s?: string | null) =>
    s ? SIZE_ORDER[s.toLowerCase()] ?? 99 : 99;
  const myShips = ((profile.data?.ships ?? []) as UserShip[])
    .slice()
    .sort((a, b) => {
      const ma = (a.manufacturer ?? "zzz").toLowerCase();
      const mb = (b.manufacturer ?? "zzz").toLowerCase();
      if (ma !== mb) return ma.localeCompare(mb);
      const sa = sizeRank(a.ship_slug ? fleetBySlug.get(a.ship_slug)?.size : null);
      const sb = sizeRank(b.ship_slug ? fleetBySlug.get(b.ship_slug)?.size : null);
      if (sa !== sb) return sa - sb;
      return a.ship_name.localeCompare(b.ship_name);
    });
  const boardRows = (boards.data ?? []) as BoardRow[];
  const liveBoards = boardRows.filter((b) => b.status !== "standby");

  const callsign = profile.data?.profile?.callsign;
  const branding = useBranding();

  return (
    <section className="mx-auto max-w-7xl space-y-10">
      {/* HERO */}
      <div className="ambient-glow relative overflow-hidden rounded-3xl border border-white/8 bg-card/40 p-8 backdrop-blur-xl">
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0 space-y-3">
            <div className="text-xs font-medium text-brand/80">
              {branding.name} · Willkommen zurück{isAdmin ? " · Admin" : ""}
            </div>
            {(() => {
              const p = profile.data?.profile as
                | { rsi_handle?: string | null; rsi_verified_at?: string | null }
                | undefined;
              if (!p?.rsi_verified_at || !p.rsi_handle) {
                return (
                  <Link
                    to="/profil"
                    className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-background/60 px-3 py-1 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    RSI-Account nicht verifiziert · jetzt verifizieren
                  </Link>
                );
              }
              return (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/10 px-3 py-1 text-[11px] text-brand">
                  RSI verifiziert · {p.rsi_handle}
                </span>
              );
            })()}
            <h1 className="font-display text-4xl md:text-5xl tracking-tight leading-tight">
              Willkommen bei <span className="text-brand">{branding.name}</span>
            </h1>
            <p className="max-w-xl text-sm text-muted-foreground">
              {callsign ? (
                <>
                  Schön dich zu sehen, <span className="text-foreground">{callsign}</span>. Dein
                  Kommandozentrum für Flotte, Einsätze und Produktion.
                </>
              ) : (
                <>
                  Dein Kommandozentrum für Flotte, Einsätze und Produktion. Drücke{" "}
                  <kbd className="inline-flex items-center gap-0.5 rounded-md border border-white/10 bg-background/60 px-1.5 py-0.5 text-[10px] font-medium">⌘K</kbd>{" "}
                  zum schnellen Navigieren.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/ops/new"
              search={{ mode: "planned" }}
              className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-brand/20 transition hover:brightness-110"
            >
              <Plus className="h-4 w-4" /> Neuer Einsatz
            </Link>
            <Link
              to="/ops/new"
              search={{ mode: "instant" } as never}
              className="focus-ring inline-flex items-center gap-2 rounded-full border border-white/10 bg-card/50 px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-card/70"
            >
              <RadioIcon className="h-4 w-4" /> Sofort starten
            </Link>
          </div>
        </div>
      </div>

      {/* STATS */}
      <StatGrid cols={4}>
        <StatCard to="/meine-flotte" label="Schiffe in Flotte" value={myShips.length} icon={ShipIcon} tone="brand" />
        <StatCard to="/ops" label="Aktive Einsätze" value={activeCount} icon={Activity} tone={activeCount > 0 ? "emerald" : "default"} />
        <StatCard to="/board" label="Live Boards" value={liveBoards.length} icon={RadioIcon} tone={liveBoards.length > 0 ? "emerald" : "default"} />
        <StatCard to="/ops/mine" label="Einsätze geleitet" value={led.length} icon={TargetIcon} tone="default" />
      </StatGrid>

      {/* SHORTCUTS */}
      <section className="space-y-3">
        <SectionHead title="Shortcuts" />
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          <ShortcutCard to="/inventar" icon={PackagePlus} title="Item ins Inventar" desc="Neuen Stack anlegen" />
          <ShortcutCard to="/orga/lager" icon={Warehouse} title="Orgalager" desc="Bestand & Bestellungen" />
          <ShortcutCard to="/crafting" icon={Sparkles} title="Crafting starten" desc="Blueprint auswählen" />
          <ShortcutCard to="/farm-lists" icon={ClipboardList} title="Farm-Liste" desc="Materialien sammeln" />
          <ShortcutCard to="/marketplace/new" icon={Store} title="Schwarzes Brett" desc="Anzeige erstellen" />
          <ShortcutCard to="/orga/kasse" icon={Wallet} title="Orgakasse" desc="Ein-/Auszahlung" />
          <ShortcutCard to="/ops/kalender" icon={CalendarDays} title="Einsatzkalender" desc="Öffentliche Ops" />
          <ShortcutCard to="/items" icon={Boxes} title="Item-Katalog" desc="Alles aus dem Wiki" />
        </div>
      </section>

      {isLoading && <p className="text-sm text-muted-foreground">Lade…</p>}
      {error && <p className="text-sm text-destructive">{(error as Error).message}</p>}

      {/* LIVE OPS */}
      {(activeLed.length > 0 || activeJoined.length > 0) && (
        <section className="space-y-4">
          <div className="flex items-center gap-2.5">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
            </span>
            <h2 className="font-display text-xl">Live-Einsätze</h2>
            <span className="text-xs text-muted-foreground">{activeCount} aktiv</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {activeLed.map((m) => (
              <MissionCard
                key={m.id}
                m={m}
                highlight
                role="leader"
                onDelete={() => {
                  if (confirm(`Einsatz „${m.title}" wirklich endgültig löschen?`)) delMut.mutate(m.id);
                }}
                deleting={delMut.isPending && delMut.variables === m.id}
              />
            ))}
            {activeJoinedOnly.map((m) => (
              <MissionCard key={m.id} m={m} highlight role="member" />
            ))}
          </div>
        </section>
      )}

      {/* FLOTTE + BOARDS */}
      <div className="grid gap-6 lg:grid-cols-12">
        <section className="space-y-4 lg:col-span-8">
          <SectionHead title="Deine Flotte" href="/meine-flotte" hrefLabel="Verwalten" />
          {profile.isLoading ? (
            <p className="text-sm text-muted-foreground">Lade Flotte…</p>
          ) : myShips.length === 0 ? (
            <EmptyCard
              title="Noch keine Schiffe"
              action={<Link to="/meine-flotte" className="text-sm font-medium text-brand hover:underline">+ Schiff hinzufügen</Link>}
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {myShips.map((s) => (
                <ShipCard key={s.id} ship={s} fleet={s.ship_slug ? fleetBySlug.get(s.ship_slug) : undefined} />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4 lg:col-span-4">
          <SectionHead title="Aktive Boards" href="/ops/mine" hrefLabel="Alle" />
          {boards.isLoading ? (
            <p className="text-sm text-muted-foreground">Lade…</p>
          ) : boardRows.length === 0 ? (
            <EmptyCard
              title="Kein Boardcomputer aktiv"
              action={<Link to="/ops/new" search={{ mode: "instant" } as never} className="text-sm font-medium text-brand hover:underline">+ Einsatz jetzt starten</Link>}
            />
          ) : (
            <div className="space-y-2">
              {boardRows.slice(0, 6).map((b) => (
                <BoardCard key={b.id} b={b} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* EINSÄTZE */}
      <section className="space-y-4">
        <SectionHead title="Einsätze" />
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Von dir geleitet</h3>
            <div className="space-y-2.5">
              {led.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Einsätze.</p>}
              {otherLed.map((m) => (
                <MissionCard
                  key={m.id}
                  m={m}
                  role="leader"
                  onDelete={() => {
                    if (confirm(`Einsatz „${m.title}" wirklich endgültig löschen?`)) delMut.mutate(m.id);
                  }}
                  deleting={delMut.isPending && delMut.variables === m.id}
                />
              ))}
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">Teilgenommen</h3>
            <div className="space-y-2.5">
              {joined.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Teilnahmen.</p>}
              {otherJoined.map((m) => (
                <MissionCard key={m.id} m={m} role="member" />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ADMIN */}
      {isAdmin && adminStats.data && (
        <section className="space-y-4">
          <SectionHead title="Admin · System-Übersicht" href="/loadouts" hrefLabel="Loadout-Defaults" />
          <StatGrid cols={3}>
            <StatCard to="/admin/users" label="Piloten" value={adminStats.data.users} tone="brand" />
            <StatCard to="/admin/ship-catalog" label="Fleet-Schiffe" value={adminStats.data.fleetShips} />
            <StatCard to="/meine-flotte" label="User-Schiffe" value={adminStats.data.userShips} />
            <StatCard to="/board" label="Live Boards" value={adminStats.data.activeBoards} tone={adminStats.data.activeBoards > 0 ? "emerald" : "default"} />
            <StatCard to="/admin/missions" label="Aktive Ops" value={adminStats.data.activeMissions} tone={adminStats.data.activeMissions > 0 ? "emerald" : "default"} />
            <StatCard to="/admin/global-loadouts" label="Admin Loadouts" value={adminStats.data.adminTemplates} tone="brand" />
          </StatGrid>
        </section>
      )}

      {delMut.error && (
        <p className="text-sm text-destructive">{(delMut.error as Error).message}</p>
      )}
    </section>
  );
}

function SectionHead({
  title,
  href,
  hrefLabel,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <h2 className="font-display text-xl tracking-tight">{title}</h2>
      {href && hrefLabel && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Link to={href as any} className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-brand">
          {hrefLabel} <ArrowRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function EmptyCard({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-white/10 bg-card/30 p-8 text-center">
      <p className="text-sm text-muted-foreground">{title}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

function ShortcutCard({ to, icon: Icon, title, desc }: { to: string; icon: React.ComponentType<{ className?: string }>; title: string; desc: string }) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link to={to as any} className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-card/40 p-3.5 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-brand/40 hover:bg-card/70">
      <div className="flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-white/10 bg-background/60 text-brand transition group-hover:border-brand/40 group-hover:bg-brand/10">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm leading-tight truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{desc}</div>
      </div>
      <ArrowRight className="h-4 w-4 flex-none text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-brand" />
    </Link>
  );
}

function ShipCard({ ship, fleet }: { ship: UserShip; fleet?: { image: string | null; manufacturer: string | null; crew: string | null; cargo: string | null; size: string | null; classification: string | null } }) {
  const img = fleet?.image;
  const manu = ship.manufacturer ?? fleet?.manufacturer ?? "—";
  return (
    <div className="group overflow-hidden rounded-2xl border border-white/8 bg-card/40 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-[0_16px_40px_-20px_rgba(0,0,0,0.7)]">
      <div className="relative aspect-video overflow-hidden bg-gradient-to-br from-brand/10 to-background">
        {img ? (
          <img src={img} alt={ship.ship_name} loading="lazy" className="h-full w-full object-cover opacity-80 transition group-hover:opacity-100" />
        ) : (
          <div className="flex h-full w-full items-center justify-center font-display text-3xl text-brand/30">
            {manu.slice(0, 3).toUpperCase()}
          </div>
        )}
        <div className="absolute left-2 top-2 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-brand backdrop-blur-md">
          {manu}
        </div>
      </div>
      <div className="p-3.5">
        <div className="font-display text-base leading-tight truncate">{ship.ship_name}</div>
        {ship.custom_name && (
          <div className="mt-0.5 text-xs text-brand/80 truncate">„{ship.custom_name}"</div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {fleet?.crew && <Chip>Crew {fleet.crew}</Chip>}
          {fleet?.cargo && <Chip>{fleet.cargo} SCU</Chip>}
          {fleet?.size && <Chip>{fleet.size}</Chip>}
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <Link
            to="/ops/new"
            search={{ mode: "instant" } as never}
            className="text-xs font-medium text-brand hover:underline"
          >
            → Sofort-Einsatz
          </Link>
          <Link to="/loadouts" className="text-xs text-muted-foreground hover:text-brand">
            Loadout
          </Link>
        </div>
      </div>
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-white/10 bg-background/60 px-2 py-0.5 text-[10px] text-muted-foreground">
      {children}
    </span>
  );
}

function BoardCard({ b }: { b: BoardRow }) {
  const meta = BOARD_STATUS_META[b.status] ?? BOARD_STATUS_META.standby;
  return (
    <Link
      to="/board/$code"
      params={{ code: b.code }}
      className="group flex items-center gap-3 rounded-2xl border border-white/8 bg-card/40 p-3 transition hover:border-brand/40 hover:bg-card/70"
    >
      <div className="min-w-0 flex-1">
        <div className="font-display text-sm leading-tight truncate">
          {b.custom_name || b.ship_name}
        </div>
        <div className="text-xs text-muted-foreground truncate">{b.ship_name}</div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge>
        <span className="text-[10px] font-mono text-brand/80">{b.code}</span>
      </div>
    </Link>
  );
}

function MissionCard({
  m,
  highlight,
  role,
  onDelete,
  deleting,
}: {
  m: MissionRow;
  highlight?: boolean;
  role: "leader" | "member";
  onDelete?: () => void;
  deleting?: boolean;
}) {
  const meta = STATUS_META[m.status] ?? STATUS_META.draft;
  const [hover, setHover] = useState(false);
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={cn(
        "group relative block rounded-2xl border p-4 backdrop-blur-md transition",
        highlight
          ? "border-emerald-500/40 bg-emerald-500/[0.04] hover:border-emerald-400/60"
          : "border-white/8 bg-card/40 hover:border-brand/30 hover:bg-card/70",
      )}
    >
      <Link to="/ops/$slug" params={{ slug: m.slug }} className="block">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-display text-lg leading-tight truncate">{m.title}</div>
            <div className="mt-1 text-xs text-muted-foreground truncate">
              /{m.slug}{m.starts_at ? ` · ${new Date(m.starts_at).toLocaleString()}` : ""}
            </div>
          </div>
          <StatusBadge tone={meta.tone} className="shrink-0">{meta.label}</StatusBadge>
        </div>
      </Link>
      {role === "leader" && onDelete && (
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
          disabled={deleting}
          className={cn(
            "absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive hover:text-destructive-foreground disabled:opacity-50",
            hover ? "opacity-100" : "opacity-0",
            "focus:opacity-100",
          )}
          aria-label="Einsatz löschen"
        >
          <Trash2 className="h-3 w-3" /> {deleting ? "…" : "Löschen"}
        </button>
      )}
    </div>
  );
}