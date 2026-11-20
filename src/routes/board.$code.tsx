import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UidPage } from "@/components/uid/UidPage";
import { COMMODITIES } from "@/data/commodities";
import { listCommodityNames } from "@/lib/game-locations.functions";
import {
  addCargo,
  addStation,
  assignStation,
  getBoardByCode,
  getBoardState,
  getCommanderToken,
  joinBoardSession,
  leaveBoardSession,
  removeCargo,
  removeStation,
  reseedStations,
  setSessionStatus,
  setMemberTransferPermission,
  transferCargoToMember,
  updateCargo,
} from "@/lib/board.functions";
import { getShipDetails } from "@/lib/ship-details.functions";
import { CopyShareLink } from "@/components/CopyShareLink";
import { BoardVoicePanel } from "@/components/voice/BoardVoicePanel";
import { ChevronDown, Radio, Share2, LogOut as LogOutIcon, Info, RefreshCw, Users, Package, Anchor, Crosshair, Armchair, Send } from "lucide-react";
import { CatalogPicker, type CatalogHit } from "@/components/inventory/CatalogPicker";
import { LocationPicker, type PickedLocation } from "@/components/inventory/LocationPicker";
import { listMyLocations } from "@/lib/inventory.functions";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/board/$code")({
  component: BoardCockpit,
});

type TokenInfo = { token: string; memberId: string; sessionId: string; displayName: string };

function storageKey(code: string) {
  return `idcp:board:${code.toUpperCase()}`;
}

const SESSION_STATUSES = [
  { value: "standby", label: "Standby", cls: "border-zinc-400/40 text-zinc-300 bg-zinc-400/10" },
  { value: "in_flight", label: "Im Flug", cls: "border-emerald-400/60 text-emerald-300 bg-emerald-400/10" },
  { value: "docked", label: "Angedockt", cls: "border-sky-400/60 text-sky-300 bg-sky-400/10" },
] as const;

const CARGO_STATUSES = [
  { value: "loaded", label: "Geladen", cls: "text-emerald-300" },
  { value: "unloaded", label: "Abgeladen", cls: "text-sky-300" },
  { value: "lost", label: "Verloren", cls: "text-rose-300" },
] as const;

function BoardCockpit() {
  const { code } = Route.useParams();
  const codeUpper = code.toUpperCase();
  const qc = useQueryClient();

  const fetchBoard = useServerFn(getBoardByCode);
  const { data: session, error: sessionError } = useQuery({
    queryKey: ["board-by-code", codeUpper],
    queryFn: () => fetchBoard({ data: { code: codeUpper } }),
    retry: false,
  });

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey(codeUpper)) : null;
    if (raw) {
      try { setTokenInfo(JSON.parse(raw)); } catch { /* noop */ }
    }
  }, [codeUpper]);

  // Auto-recover commander token
  const getCmdToken = useServerFn(getCommanderToken);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null));
  }, []);
  useEffect(() => {
    if (!session || tokenInfo || !authUserId) return;
    if (session.commander_id !== authUserId) return;
    getCmdToken({ data: { code: codeUpper } })
      .then((r) => {
        const info: TokenInfo = {
          token: r.token, memberId: r.member_id, sessionId: r.session_id, displayName: r.display_name,
        };
        localStorage.setItem(storageKey(codeUpper), JSON.stringify(info));
        setTokenInfo(info);
      })
      .catch(() => { /* not commander */ });
  }, [session, tokenInfo, authUserId, codeUpper, getCmdToken]);

  // Board state polling/realtime
  const fetchState = useServerFn(getBoardState);
  const { data: state } = useQuery({
    queryKey: ["board-state", tokenInfo?.sessionId, tokenInfo?.token],
    queryFn: () => fetchState({ data: { session_id: tokenInfo!.sessionId, token: tokenInfo!.token } }),
    enabled: !!tokenInfo,
    refetchInterval: 8000,
  });

  useEffect(() => {
    if (!tokenInfo) return;
    const channel = supabase
      .channel(`board-${tokenInfo.sessionId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "board_stations", filter: `session_id=eq.${tokenInfo.sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "board_cargo", filter: `session_id=eq.${tokenInfo.sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "board_members", filter: `session_id=eq.${tokenInfo.sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }))
      .on("postgres_changes", { event: "*", schema: "public", table: "board_sessions", filter: `id=eq.${tokenInfo.sessionId}` },
        () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [tokenInfo, qc]);

  return (
    <UidPage backdrop="stars" seed={3308}>
      <div className="pt-12 pb-20">
        {sessionError && (
          <div className="mx-auto max-w-xl px-6 text-center">
            <h1 className="font-display text-3xl">Boardcomputer nicht gefunden</h1>
            <p className="mt-2 text-muted-foreground">{(sessionError as Error).message}</p>
            <Link to="/board" className="mt-6 inline-block text-brand hover:underline">← Zurück</Link>
          </div>
        )}
        {session && !tokenInfo && (
          <JoinForm
            code={codeUpper}
            shipName={session.custom_name || session.ship_name}
            onJoined={(info) => {
              localStorage.setItem(storageKey(codeUpper), JSON.stringify(info));
              setTokenInfo(info);
            }}
          />
        )}
        {tokenInfo && state && (
          <Cockpit
            code={codeUpper}
            tokenInfo={tokenInfo}
            state={state}
            authUserId={authUserId}
            onLeave={() => {
              localStorage.removeItem(storageKey(codeUpper));
              setTokenInfo(null);
              qc.removeQueries({ queryKey: ["board-state"] });
            }}
          />
        )}
      </div>
    </UidPage>
  );
}

function JoinForm({ code, shipName, onJoined }: { code: string; shipName: string; onJoined: (i: TokenInfo) => void }) {
  const [name, setName] = useState("");
  const join = useServerFn(joinBoardSession);
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setAuthUserId(data.user?.id ?? null)); }, []);

  const m = useMutation({
    mutationFn: () => join({ data: { code, display_name: name.trim() } }),
    onSuccess: (r) => onJoined({
      token: r.token, memberId: r.member_id, sessionId: r.session_id, displayName: name.trim(),
    }),
  });

  return (
    <div className="mx-auto max-w-md px-6">
      <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// {code}</p>
      <h1 className="mt-2 font-display text-3xl">{shipName}</h1>
      <p className="mt-2 text-sm text-muted-foreground">Trete der Crew bei und übernimm eine Station.</p>
      <div className="mt-6 grid gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Dein Name an Bord"
          className="border border-white/10 bg-background px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        <button
          onClick={() => m.mutate()}
          disabled={!name.trim() || m.isPending}
          className="border border-brand bg-brand px-5 py-3 text-[11px] uppercase tracking-[0.25em] font-bold text-primary-foreground hover:bg-brand/80 disabled:opacity-50"
        >
          {m.isPending ? "Verbinde…" : "An Bord gehen"}
        </button>
        {m.error && <p className="text-sm text-rose-400">{(m.error as Error).message}</p>}
      </div>
    </div>
  );
}

type BoardState = Awaited<ReturnType<typeof getBoardState>>;

function Cockpit({
  code, tokenInfo, state, authUserId, onLeave,
}: {
  code: string;
  tokenInfo: TokenInfo;
  state: BoardState;
  authUserId: string | null;
  onLeave: () => void;
}) {
  const qc = useQueryClient();
  const { session, members, stations, cargo } = state;
  const isCommander = !!authUserId && authUserId === session.commander_id;

  const setStatusFn = useServerFn(setSessionStatus);
  const statusM = useMutation({
    mutationFn: (s: "standby" | "in_flight" | "docked") =>
      setStatusFn({ data: { session_id: tokenInfo.sessionId, token: tokenInfo.token, status: s } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });

  const leaveFn = useServerFn(leaveBoardSession);
  const leaveM = useMutation({
    mutationFn: () => leaveFn({ data: { session_id: tokenInfo.sessionId, token: tokenInfo.token } }),
    onSuccess: onLeave,
  });

  const assignFn = useServerFn(assignStation);
  const assignM = useMutation({
    mutationFn: (vars: { station_id: string; member_id: string | null }) =>
      assignFn({ data: { session_id: tokenInfo.sessionId, token: tokenInfo.token, ...vars } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });

  const reseedFn = useServerFn(reseedStations);
  const reseedM = useMutation({
    mutationFn: () => reseedFn({ data: { session_id: tokenInfo.sessionId } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });

  const addStationFn = useServerFn(addStation);
  const addStationM = useMutation({
    mutationFn: (vars: { label: string; category: "seat" | "turret" }) =>
      addStationFn({ data: { session_id: tokenInfo.sessionId, ...vars } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });
  const removeStationFn = useServerFn(removeStation);
  const removeStationM = useMutation({
    mutationFn: (station_id: string) =>
      removeStationFn({ data: { session_id: tokenInfo.sessionId, station_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });

  const [dragMemberId, setDragMemberId] = useState<string | null>(null);
  const [dragOverStation, setDragOverStation] = useState<string | null>(null);
  const [shipInfoOpen, setShipInfoOpen] = useState(false);
  const [voiceOpen, setVoiceOpen] = useState(true);

  // Map memberId -> stations they currently occupy (a member can only sit on one seat)
  const memberStation = useMemo(() => {
    const map = new Map<string, string>();
    stations.forEach((s) => { if (s.assigned_member_id) map.set(s.assigned_member_id, s.id); });
    return map;
  }, [stations]);

  const cargoTotal = useMemo(
    () =>
      cargo
        .filter((c) => c.status === "loaded" && (c.unit ?? "scu") === "scu")
        .reduce((a, c) => a + Number(c.qty ?? c.scu ?? 0), 0),
    [cargo],
  );

  const myMember = useMemo(
    () => members.find((m) => m.id === tokenInfo.memberId) ?? null,
    [members, tokenInfo.memberId],
  );
  const canTransferCargo = !!(myMember?.is_commander || myMember?.can_transfer_cargo);

  const setPermFn = useServerFn(setMemberTransferPermission);
  const setPermM = useMutation({
    mutationFn: (v: { member_id: string; can_transfer: boolean }) =>
      setPermFn({
        data: { session_id: tokenInfo.sessionId, token: tokenInfo.token, ...v },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const seatCount = stations.filter((s) => s.category !== "turret").length;
  const seatOccupied = stations.filter((s) => s.category !== "turret" && s.assigned_member_id).length;
  const turretCount = stations.filter((s) => s.category === "turret").length;
  const turretOccupied = stations.filter((s) => s.category === "turret" && s.assigned_member_id).length;
  const shipMeta = (session.ship_meta as ShipMetaJSON | null) ?? null;

  return (
    <div className="mx-auto max-w-7xl px-4 sm:px-6 pb-40">
      {/* HEADER — compact HUD */}
      <div className="border border-white/10 bg-white/[0.02]">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 p-4">
          <ShipThumb session={session} />
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              <span>// Boardcomputer</span>
              <span className="text-muted-foreground">·</span>
              <span className="text-foreground">{code}</span>
            </div>
            <div className="mt-1 flex items-center gap-2 min-w-0">
              <h1 className="truncate font-display text-2xl sm:text-3xl">{session.custom_name || session.ship_name}</h1>
              <button
                onClick={() => setShipInfoOpen((v) => !v)}
                title="Schiffs-Details"
                className="shrink-0 border border-white/10 p-1 text-muted-foreground hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
              </button>
            </div>
            {session.custom_name && (
              <div className="text-xs text-muted-foreground truncate">{session.ship_name}</div>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5">
            {SESSION_STATUSES.map((s) => (
              <button
                key={s.value}
                onClick={() => statusM.mutate(s.value)}
                className={`border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] transition ${session.status === s.value ? s.cls : "border-white/10 text-muted-foreground hover:text-foreground"}`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* StatBar */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-white/10 border-t border-white/10">
          <StatCell icon={<Users className="h-3.5 w-3.5" />} label="Crew" value={`${members.length}${session.crew_cap ? ` / ${session.crew_cap}` : ""}`} />
          <StatCell icon={<Armchair className="h-3.5 w-3.5" />} label="Sitze" value={`${seatOccupied} / ${seatCount}`} />
          <StatCell icon={<Crosshair className="h-3.5 w-3.5" />} label="Türme" value={`${turretOccupied} / ${turretCount}`} />
          <StatCell
            icon={<Package className="h-3.5 w-3.5" />}
            label="Fracht"
            value={`${cargoTotal.toFixed(0)}${session.cargo_cap_scu ? ` / ${session.cargo_cap_scu}` : ""} SCU`}
            progress={session.cargo_cap_scu ? Math.min(100, (cargoTotal / session.cargo_cap_scu) * 100) : null}
            over={!!session.cargo_cap_scu && cargoTotal > session.cargo_cap_scu}
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/10 px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span>Du: <span className="text-foreground normal-case tracking-normal">{tokenInfo.displayName}</span></span>
            {isCommander && <span className="border border-brand/40 bg-brand/10 px-1.5 py-0.5 text-brand">CMDR</span>}
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              <Share2 className="h-3 w-3" />
              <span className="font-mono text-brand normal-case tracking-widest">{code}</span>
              <CopyShareLink path={`/board/${code}`} />
            </div>
            {!isCommander && (
              <button
                onClick={() => leaveM.mutate()}
                className="ml-2 flex items-center gap-1 border border-white/10 px-2 py-1 text-rose-400/70 hover:text-rose-300"
                title="Crew verlassen"
              >
                <LogOutIcon className="h-3 w-3" /> Verlassen
              </button>
            )}
          </div>
        </div>

        {/* Ship info drawer */}
        {shipInfoOpen && (
          <div className="border-t border-white/10 p-4">
            <ShipOverview
              shipSlug={session.ship_slug}
              shipName={session.custom_name || session.ship_name}
              meta={shipMeta}
            />
          </div>
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[260px_1fr_320px]">
        {/* Crew column */}
        <section className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground">Crew · Dock</h2>
            <span className="font-mono text-[10px] text-muted-foreground">{members.length}{session.crew_cap ? `/${session.crew_cap}` : ""}</span>
          </div>
          <p className="mt-1 text-[10px] text-muted-foreground italic">Ziehe auf eine Station →</p>
          <ul className="mt-3 space-y-1.5">
            {members.map((m) => {
              const seatId = memberStation.get(m.id);
              const seat = seatId ? stations.find((s) => s.id === seatId) : null;
              const initials = m.display_name.trim().split(/\s+/).map(s => s[0]).slice(0,2).join("").toUpperCase();
              return (
                <li
                  key={m.id}
                  draggable
                  onDragStart={(e) => {
                    setDragMemberId(m.id);
                    e.dataTransfer.setData("text/plain", m.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={() => setDragMemberId(null)}
                  className={`group cursor-grab active:cursor-grabbing border border-white/10 bg-background/40 px-2 py-1.5 text-sm transition ${dragMemberId === m.id ? "opacity-50" : "hover:border-brand/50"} ${seat ? "border-l-2 border-l-emerald-400/60" : ""}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="grid h-6 w-6 shrink-0 place-items-center border border-white/10 bg-white/5 font-mono text-[10px] text-muted-foreground">{initials || "?"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs flex items-center gap-1.5">
                        <span className="truncate">{m.display_name}</span>
                        {m.is_commander && <span className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-brand">CMDR</span>}
                        {!m.is_commander && m.can_transfer_cargo && (
                          <span className="shrink-0 text-[9px] uppercase tracking-[0.2em] text-emerald-300/80" title="Darf Ladung ins Inventar übergeben">FRACHT</span>
                        )}
                      </div>
                      {seat ? (
                        <div className="truncate text-[10px] uppercase tracking-[0.15em] text-emerald-300/80">→ {seat.label}</div>
                      ) : (
                        <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground/60">unstationiert</div>
                      )}
                      {isCommander && !m.is_commander && (
                        <label className="mt-1 flex cursor-pointer items-center gap-1.5 text-[9px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={!!m.can_transfer_cargo}
                            onChange={(e) =>
                              setPermM.mutate({ member_id: m.id, can_transfer: e.target.checked })
                            }
                            className="h-3 w-3 accent-brand"
                          />
                          darf Fracht übergeben
                        </label>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {/* Unassign drop zone */}
          <div
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
            onDrop={(e) => {
              e.preventDefault();
              const memberId = e.dataTransfer.getData("text/plain") || dragMemberId;
              if (!memberId) return;
              const seatId = memberStation.get(memberId);
              if (seatId) assignM.mutate({ station_id: seatId, member_id: null });
              setDragMemberId(null);
            }}
            className="mt-3 border border-dashed border-white/10 px-3 py-2 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:border-rose-400/50 hover:text-rose-300"
          >
            ↓ Freigeben
          </div>
        </section>

        {/* Stations column */}
        <section className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground">Stationen & Funk</h2>
              <p className="mt-1 text-[10px] text-muted-foreground italic">Sitz übernehmen · Crew per Drag & Drop</p>
            </div>
            {isCommander && (
              <button
                onClick={() => {
                  if (confirm("Stationen anhand aktueller Schiff-Daten neu laden? Zuweisungen gehen verloren.")) {
                    reseedM.mutate();
                  }
                }}
                disabled={reseedM.isPending}
                title="Lädt Sitze & Türme mit aktuellen Positions-Labels neu."
                className="flex items-center gap-1 border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-foreground disabled:opacity-40"
              >
                <RefreshCw className={`h-3 w-3 ${reseedM.isPending ? "animate-spin" : ""}`} />
                {reseedM.isPending ? "Lade…" : "Neu"}
              </button>
            )}
          </div>
          {stations.length === 0 && (
            <p className="mt-4 text-sm text-muted-foreground">Keine Stationen — Schiff hat keine Hardpoints geliefert.</p>
          )}
          {(() => {
            const seats = stations.filter((s) => s.category !== "turret");
            const turrets = stations
              .filter((s) => s.category === "turret")
              .slice()
              .sort((a, b) => {
                const sa = parseInt(/^S(\d+)/.exec(a.label)?.[1] ?? "0", 10);
                const sb = parseInt(/^S(\d+)/.exec(b.label)?.[1] ?? "0", 10);
                if (sb !== sa) return sb - sa;
                return a.sort_order - b.sort_order;
              });
            const renderStation = (st: typeof stations[number]) => {
              const assigned = members.find((m) => m.id === st.assigned_member_id);
              const isOver = dragOverStation === st.id;
              const isTurret = st.category === "turret";
              const sizeMatch = /^(S\d+)\b/.exec(st.label);
              const isManual = st.is_manual;
              return (
                <div
                  key={st.id}
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverStation(st.id); }}
                  onDragLeave={() => setDragOverStation((c) => (c === st.id ? null : c))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const memberId = e.dataTransfer.getData("text/plain") || dragMemberId;
                    setDragOverStation(null);
                    setDragMemberId(null);
                    if (!memberId) return;
                    if (st.assigned_member_id === memberId) return;
                    const prev = memberStation.get(memberId);
                    const apply = () => assignM.mutate({ station_id: st.id, member_id: memberId });
                    if (prev && prev !== st.id) {
                      assignFn({ data: { session_id: tokenInfo.sessionId, token: tokenInfo.token, station_id: prev, member_id: null } })
                        .then(apply)
                        .catch(apply);
                    } else {
                      apply();
                    }
                  }}
                  className={`border p-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] items-center transition ${isOver ? "border-brand bg-brand/10" : assigned ? "border-emerald-400/30" : "border-white/10"}`}
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-display text-base">{st.label}</span>
                      {sizeMatch && (
                        <span className="border border-amber-400/40 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-amber-300">
                          {sizeMatch[1]}
                        </span>
                      )}
                      <span className={`border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] ${isTurret ? "border-rose-400/40 text-rose-300" : "border-sky-400/40 text-sky-300"}`}>
                        {isTurret ? "Turret" : "Sitz"}
                      </span>
                      {isManual && (
                        <span className="border border-white/20 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.15em] text-muted-foreground">
                          manuell
                        </span>
                      )}
                    </div>
                    {st.hardpoint_name && st.hardpoint_name !== st.label && (
                      <div className="mt-1 font-mono text-[10px] text-muted-foreground/70 truncate">{st.hardpoint_name}</div>
                    )}
                  </div>
                  <div className="text-sm">
                    {assigned ? (
                      <span
                        draggable
                        onDragStart={(e) => {
                          setDragMemberId(assigned.id);
                          e.dataTransfer.setData("text/plain", assigned.id);
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => setDragMemberId(null)}
                        className="cursor-grab active:cursor-grabbing inline-flex items-center gap-2 border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-emerald-300"
                      >
                        {assigned.display_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground italic">unbesetzt</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {assigned?.id === tokenInfo.memberId ? (
                      <button
                        onClick={() => assignM.mutate({ station_id: st.id, member_id: null })}
                        className="border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground hover:text-rose-300"
                      >
                        Frei
                      </button>
                    ) : (
                      <button
                        onClick={() => assignM.mutate({ station_id: st.id, member_id: tokenInfo.memberId })}
                        className="border border-brand/50 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-brand hover:bg-brand hover:text-primary-foreground"
                      >
                        Übernehmen
                      </button>
                    )}
                    <select
                      value={st.assigned_member_id ?? ""}
                      onChange={(e) => assignM.mutate({ station_id: st.id, member_id: e.target.value || null })}
                      className="border border-white/10 bg-background px-2 py-1 text-xs"
                    >
                      <option value="">— zuweisen —</option>
                      {members.map((m) => (
                        <option key={m.id} value={m.id}>{m.display_name}</option>
                      ))}
                    </select>
                    {isCommander && isManual && (
                      <button
                        onClick={() => {
                          if (confirm(`Station „${st.label}" entfernen?`)) {
                            removeStationM.mutate(st.id);
                          }
                        }}
                        className="border border-rose-400/30 px-2 py-1 text-[10px] uppercase tracking-[0.15em] text-rose-300/70 hover:bg-rose-400/10 hover:text-rose-200"
                        title="Manuelle Station entfernen"
                      >
                        ×
                      </button>
                    )}
                  </div>
                </div>
              );
            };
            return (
              <div className="mt-3 space-y-4">
                {seats.length > 0 && (
                  <div>
                    <StationGroupHeader
                      icon={<Armchair className="h-3 w-3" />}
                      label="Cockpit"
                      color="sky"
                      occupied={seats.filter(s=>s.assigned_member_id).length}
                      total={seats.length}
                    />
                    <div className="mt-2 grid gap-1.5">{seats.map(renderStation)}</div>
                  </div>
                )}
                {turrets.length > 0 && (
                  <div>
                    <StationGroupHeader
                      icon={<Crosshair className="h-3 w-3" />}
                      label="Türme"
                      color="rose"
                      occupied={turrets.filter(s=>s.assigned_member_id).length}
                      total={turrets.length}
                    />
                    <div className="mt-2 grid gap-1.5">{turrets.map(renderStation)}</div>
                  </div>
                )}
              </div>
            );
          })()}
          {isCommander && (
            <ManualStationForm onAdd={(label, category) => addStationM.mutate({ label, category })} pending={addStationM.isPending} />
          )}
        </section>

        {/* Cargo column */}
        <section className="border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-xs uppercase tracking-[0.2em] text-muted-foreground">Fracht</h2>
            <p className="font-mono text-xs">
              <span className="text-foreground">{cargoTotal.toFixed(1)}</span>
              {session.cargo_cap_scu ? <span className="text-muted-foreground"> / {session.cargo_cap_scu}</span> : null}
              <span className="text-muted-foreground"> SCU</span>
            </p>
          </div>
          {session.cargo_cap_scu ? (
            <div className="mt-2 h-1 bg-white/10 overflow-hidden">
              <div
                className={`h-full ${cargoTotal > session.cargo_cap_scu ? "bg-rose-400" : "bg-brand"}`}
                style={{ width: `${Math.min(100, (cargoTotal / session.cargo_cap_scu) * 100)}%` }}
              />
            </div>
          ) : null}
          <CargoEditor
            tokenInfo={tokenInfo}
            cargo={cargo}
            members={members}
            canTransfer={canTransferCargo}
          />
        </section>
      </div>

      {/* Sticky Voice Dock */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-background/95 backdrop-blur">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <button
            onClick={() => setVoiceOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-3 py-2 text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:text-foreground"
          >
            <span className="flex items-center gap-2">
              <Radio className="h-3.5 w-3.5 text-brand" />
              <span className="text-brand">Schifffunk</span>
              <span className="hidden sm:inline text-muted-foreground/70">· Voice-Kanäle & Broadcast</span>
            </span>
            <ChevronDown className={`h-4 w-4 transition ${voiceOpen ? "rotate-180" : ""}`} />
          </button>
          {voiceOpen && (
            <div className="max-h-[65vh] overflow-y-auto pb-4">
              <BoardVoicePanel
                sessionId={tokenInfo.sessionId}
                token={tokenInfo.token}
                memberId={tokenInfo.memberId}
                isCommander={isCommander}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCell({ icon, label, value, progress, over }: {
  icon: React.ReactNode; label: string; value: string; progress?: number | null; over?: boolean;
}) {
  return (
    <div className="bg-background/60 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
        {icon}<span>{label}</span>
      </div>
      <div className="mt-0.5 font-mono text-sm text-foreground">{value}</div>
      {typeof progress === "number" && (
        <div className="mt-1 h-0.5 bg-white/10 overflow-hidden">
          <div className={`h-full ${over ? "bg-rose-400" : "bg-brand"}`} style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function StationGroupHeader({ icon, label, color, occupied, total }: {
  icon: React.ReactNode; label: string; color: "sky" | "rose"; occupied: number; total: number;
}) {
  const cls = color === "sky"
    ? "border-sky-400/30 bg-sky-400/5 text-sky-300"
    : "border-rose-400/30 bg-rose-400/5 text-rose-300";
  return (
    <div className={`flex items-center justify-between border px-2 py-1 ${cls}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em]">
        {icon}<span>{label}</span>
      </div>
      <span className="font-mono text-[10px]">{occupied}/{total}</span>
    </div>
  );
}

function ShipThumb({ session }: { session: BoardState["session"] }) {
  const fetchShip = useServerFn(getShipDetails);
  const { data: ship } = useQuery({
    queryKey: ["ship-details", session.ship_slug],
    queryFn: () => fetchShip({ data: { slug: session.ship_slug! } }),
    enabled: !!session.ship_slug,
    staleTime: 1000 * 60 * 60,
  });
  if (ship?.image) {
    return <img src={ship.image} alt={session.ship_name} loading="lazy" className="h-14 w-24 sm:h-16 sm:w-28 object-cover border border-white/10" />;
  }
  return (
    <div className="h-14 w-24 sm:h-16 sm:w-28 border border-dashed border-white/10 grid place-items-center text-muted-foreground">
      <Anchor className="h-5 w-5" />
    </div>
  );
}

function CargoEditor({
  tokenInfo, cargo, members, canTransfer,
}: {
  tokenInfo: TokenInfo;
  cargo: BoardState["cargo"];
  members: BoardState["members"];
  canTransfer: boolean;
}) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<CatalogHit | null>(null);
  const [itemName, setItemName] = useState("");
  const [itemRef, setItemRef] = useState<string | null>(null);
  const [itemKind, setItemKind] = useState<string | null>(null);
  const [unit, setUnit] = useState<"pcs" | "scu">("scu");
  const [qty, setQty] = useState("");
  const [quality, setQuality] = useState("");
  const [transferFor, setTransferFor] = useState<BoardState["cargo"][number] | null>(null);
  const commodityFn = useServerFn(listCommodityNames);
  const { data: commodityNames } = useQuery({
    queryKey: ["uex-commodity-names"],
    queryFn: () => commodityFn(),
    staleTime: 6 * 60 * 60 * 1000,
  });

  const addFn = useServerFn(addCargo);
  const addM = useMutation({
    mutationFn: () => addFn({
      data: {
        session_id: tokenInfo.sessionId,
        token: tokenInfo.token,
        item_ref: itemRef,
        item_name: itemName.trim(),
        item_kind: itemKind,
        unit,
        qty: Number(qty) || 0,
        quality: quality.trim() ? Number(quality) : null,
      },
    }),
    onSuccess: () => {
      setPicked(null);
      setItemName("");
      setItemRef(null);
      setItemKind(null);
      setQty("");
      setQuality("");
      qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const updateFn = useServerFn(updateCargo);
  const updateM = useMutation({
    mutationFn: (vars: { cargo_id: string; status?: "loaded"|"unloaded"|"lost"; qty?: number }) =>
      updateFn({ data: { session_id: tokenInfo.sessionId, token: tokenInfo.token, ...vars } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });
  const removeFn = useServerFn(removeCargo);
  const removeM = useMutation({
    mutationFn: (cargo_id: string) => removeFn({ data: { session_id: tokenInfo.sessionId, token: tokenInfo.token, cargo_id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] }),
  });

  return (
    <div className="mt-4">
      <ul className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {cargo.length === 0 && (
          <li className="text-sm text-muted-foreground italic">Noch keine Fracht erfasst.</li>
        )}
        {cargo.map((c) => {
          const meta = CARGO_STATUSES.find((s) => s.value === c.status)!;
          const name = c.item_name ?? c.commodity ?? "—";
          const qtyVal = Number(c.qty ?? c.scu ?? 0);
          const u = (c.unit ?? "scu").toUpperCase();
          return (
            <li key={c.id} className="border border-white/10 p-2 grid grid-cols-[1fr_auto] gap-2">
              <div>
                <div className="text-sm font-medium">{name}</div>
                <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  {qtyVal.toFixed(u === "SCU" ? 1 : 0)} {u}
                  {c.quality != null ? ` · Q${c.quality}` : ""} ·{" "}
                  <span className={meta.cls}>{meta.label}</span>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <select
                  value={c.status}
                  onChange={(e) => updateM.mutate({ cargo_id: c.id, status: e.target.value as "loaded"|"unloaded"|"lost" })}
                  className="border border-white/10 bg-background px-1 py-0.5 text-[10px]"
                >
                  {CARGO_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                {canTransfer && qtyVal > 0 && (
                  <button
                    onClick={() => setTransferFor(c)}
                    className="flex items-center justify-center gap-1 border border-emerald-400/40 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.15em] text-emerald-300/90 hover:bg-emerald-400/10"
                    title="Ladung an Mitglied übergeben"
                  >
                    <Send className="h-3 w-3" /> Übergeben
                  </button>
                )}
                <button
                  onClick={() => removeM.mutate(c.id)}
                  className="text-[10px] uppercase tracking-[0.15em] text-rose-400/70 hover:text-rose-300"
                >
                  Entfernen
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 grid gap-2 border-t border-white/5 pt-4">
        <div className="grid gap-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            Aus Katalog wählen
          </div>
          <CatalogPicker
            onPick={(h) => {
              setPicked(h);
              setItemName(h.name);
              setItemRef(h.item_ref);
              setItemKind(h.kind);
              if (h.unit === "pcs" || h.unit === "scu") setUnit(h.unit);
            }}
          />
        </div>
        <input
          list="commodity-list"
          value={itemName}
          onChange={(e) => {
            setItemName(e.target.value);
            if (picked && e.target.value !== picked.name) {
              setPicked(null);
              setItemRef(null);
            }
          }}
          placeholder="Name (oder Freitext)"
          className="border border-white/10 bg-background px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <datalist id="commodity-list">
          {(commodityNames ?? COMMODITIES).map((c) => <option key={c} value={c} />)}
        </datalist>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            type="number"
            min={0}
            step={unit === "scu" ? "0.1" : "1"}
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            placeholder="Menge"
            className="border border-white/10 bg-background px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as "pcs" | "scu")}
            className="border border-white/10 bg-background px-2 py-1.5 text-sm"
          >
            <option value="scu">SCU</option>
            <option value="pcs">Stk.</option>
          </select>
        </div>
        <input
          type="number"
          min={0}
          max={1000}
          value={quality}
          onChange={(e) => setQuality(e.target.value)}
          placeholder="Qualität (optional)"
          className="border border-white/10 bg-background px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <button
          onClick={() => addM.mutate()}
          disabled={!itemName.trim() || !(Number(qty) > 0) || addM.isPending}
          className="border border-brand/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground disabled:opacity-40"
        >
          + Hinzufügen
        </button>
      </div>

      {transferFor && (
        <TransferCargoDialog
          tokenInfo={tokenInfo}
          cargoRow={transferFor}
          members={members}
          onClose={() => setTransferFor(null)}
        />
      )}
    </div>
  );
}

function TransferCargoDialog({
  tokenInfo,
  cargoRow,
  members,
  onClose,
}: {
  tokenInfo: TokenInfo;
  cargoRow: BoardState["cargo"][number];
  members: BoardState["members"];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const available = Number(cargoRow.qty ?? cargoRow.scu ?? 0);
  const unit = (cargoRow.unit ?? "scu").toUpperCase();
  const [targetId, setTargetId] = useState<string>("");
  const [qty, setQty] = useState<string>(String(available));
  const [loc, setLoc] = useState<PickedLocation>({ id: null, label: null });

  const locFn = useServerFn(listMyLocations);
  const locsQ = useQuery({
    queryKey: ["inventory-locations"],
    queryFn: () => locFn(),
  });

  const eligible = members.filter((m) => !!m.user_id && m.id !== tokenInfo.memberId);
  const noneOnline = eligible.length === 0;

  const transferFn = useServerFn(transferCargoToMember);
  const mut = useMutation({
    mutationFn: () =>
      transferFn({
        data: {
          session_id: tokenInfo.sessionId,
          token: tokenInfo.token,
          cargo_id: cargoRow.id,
          target_member_id: targetId,
          qty: Number(qty),
          location_id: loc.id,
          location_label: loc.label,
        },
      }),
    onSuccess: (r) => {
      toast.success(`${r.transferred} ${unit} an ${r.target} übergeben`);
      qc.invalidateQueries({ queryKey: ["board-state", tokenInfo.sessionId] });
      onClose();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const parsed = Number(qty);
  const canSubmit =
    !!targetId && parsed > 0 && parsed <= available && !mut.isPending;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ladung übergeben</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="rounded border border-brand/10 bg-brand/5 px-3 py-2 text-sm">
            <div className="font-medium">
              {cargoRow.item_name ?? cargoRow.commodity ?? "—"}
            </div>
            <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              verfügbar: {available} {unit}
              {cargoRow.quality != null ? ` · Q${cargoRow.quality}` : ""}
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Empfänger</Label>
            {noneOnline ? (
              <p className="text-xs text-muted-foreground">
                Keine angemeldeten Mitspieler in der Session.
              </p>
            ) : (
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Mitglied wählen" />
                </SelectTrigger>
                <SelectContent>
                  {eligible.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.display_name}
                      {m.is_commander ? " · CMDR" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {members.some((m) => !m.user_id) && (
              <p className="text-[10px] text-muted-foreground">
                Gast-Mitglieder (nicht angemeldet) können kein Inventar empfangen.
              </p>
            )}
          </div>
          <div className="grid gap-1">
            <Label>Menge ({unit})</Label>
            <Input
              type="number"
              min={0}
              max={available}
              step={unit === "SCU" ? "0.1" : "1"}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label>Lagerort im Ziel-Inventar</Label>
            <LocationPicker
              value={loc}
              locations={locsQ.data ?? []}
              visibility="private"
              onChange={setLoc}
            />
            <p className="text-[10px] text-muted-foreground">
              Der gewählte Ort wird im Inventar des Empfängers gespeichert.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button onClick={() => mut.mutate()} disabled={!canSubmit}>
            {parsed || 0} {unit} übergeben
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type ShipMetaJSON = {
  sourceOk?: boolean;
  mannedTurretCount?: number;
  turretSizes?: string[];
  positions?: string[];
  positionsPaired?: boolean;
};

function ShipOverview({
  shipSlug, shipName, meta,
}: {
  shipSlug: string | null;
  shipName: string;
  meta: ShipMetaJSON | null;
}) {
  const fetchShip = useServerFn(getShipDetails);
  const { data: ship } = useQuery({
    queryKey: ["ship-details", shipSlug],
    queryFn: () => fetchShip({ data: { slug: shipSlug! } }),
    enabled: !!shipSlug,
    staleTime: 1000 * 60 * 60,
  });

  const sizes = meta?.turretSizes ?? [];
  const sizeCounts = sizes.reduce<Record<string, number>>((acc, s) => {
    acc[s] = (acc[s] ?? 0) + 1;
    return acc;
  }, {});
  const sizeBreakdown = Object.entries(sizeCounts)
    .sort((a, b) => parseInt(b[0].slice(1), 10) - parseInt(a[0].slice(1), 10))
    .map(([s, n]) => `${n}× ${s}`)
    .join(" · ");

  return (
    <div className="mt-4 border border-white/10 bg-background/40 p-3">
      <div className="flex items-start gap-3">
        {ship?.image ? (
          <img src={ship.image} alt={ship.name} loading="lazy" className="h-20 w-32 object-cover border border-white/10" />
        ) : (
          <div className="h-20 w-32 border border-dashed border-white/10 grid place-items-center text-[10px] text-muted-foreground">
            kein Bild
          </div>
        )}
        <div className="min-w-0 flex-1">
          <div className="font-display text-base truncate">{shipName}</div>
          {ship?.manufacturer && (
            <div className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground">{ship.manufacturer}</div>
          )}
          <div className="mt-2 text-xs">
            {meta?.sourceOk === false ? (
              <span className="text-amber-300/80">
                Keine Hardpoint-Daten verfügbar — bitte Stationen manuell hinzufügen.
              </span>
            ) : (
              <>
                <span className="text-foreground">
                  {meta?.mannedTurretCount ?? 0} bemannbare Türme
                </span>
                {sizeBreakdown && (
                  <span className="text-muted-foreground"> · {sizeBreakdown}</span>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      {meta?.positions && meta.positions.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Positionen laut Fleetyards</div>
          <ul className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {meta.positions.map((p, i) => (
              <li key={i}>· {p}</li>
            ))}
          </ul>
          {meta.positionsPaired === false && (
            <p className="mt-2 text-[10px] text-amber-300/70">
              ⚠ Positionen konnten nicht eindeutig den Türmen zugeordnet werden — die Liste oben ist informativ, die Slots tragen generische Nummern.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function ManualStationForm({
  onAdd, pending,
}: {
  onAdd: (label: string, category: "seat" | "turret") => void;
  pending: boolean;
}) {
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState<"seat" | "turret">("seat");
  return (
    <div className="mt-4 border-t border-white/5 pt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto]">
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Eigene Station (z. B. Hangar-Operator)"
        className="border border-white/10 bg-background px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
      />
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value as "seat" | "turret")}
        className="border border-white/10 bg-background px-2 py-1.5 text-xs"
      >
        <option value="seat">Sitz</option>
        <option value="turret">Turret</option>
      </select>
      <button
        onClick={() => {
          if (label.trim()) {
            onAdd(label.trim(), category);
            setLabel("");
          }
        }}
        disabled={!label.trim() || pending}
        className="border border-brand/50 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground disabled:opacity-40"
      >
        + Station
      </button>
    </div>
  );
}