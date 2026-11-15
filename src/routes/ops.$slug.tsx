import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import fleet from "@/data/fleet.json";
import { supabase } from "@/integrations/supabase/client";
import { UidPage } from "@/components/uid/UidPage";
import {
  addMissionShip,
  assignShipCrew,
  getMissionBoard,
  getMissionBySlug,
  joinMission,
  joinShipCrew,
  leaveShipCrew,
  removeMissionShip,
  removeShipCrewMember,
  setShipRole,
  setShipStatus,
  updateMissionStatus,
} from "@/lib/missions.functions";
import {
  addManualMissionStation,
  assignMissionStation,
  removeMissionStation,
} from "@/lib/missions.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { getShipDetails, type ShipDetails } from "@/lib/ship-details.functions";
import { CopyShareLink } from "@/components/CopyShareLink";
import { RichText } from "@/components/ui/rich-text";
import { MissionVoicePanel } from "@/components/voice/MissionVoicePanel";

type FleetShip = { slug: string; name: string; manufacturer: string | null };

export const Route = createFileRoute("/ops/$slug")({
  component: OpsPage,
});

const STATUSES = [
  { value: "ready", label: "Bereit", color: "border-emerald-400/60 text-emerald-300 bg-emerald-400/10" },
  { value: "waiting_crew", label: "Wartet Besatzung", color: "border-amber-400/60 text-amber-300 bg-amber-400/10" },
  { value: "enroute_station", label: "Auf Weg zur Station", color: "border-sky-400/60 text-sky-300 bg-sky-400/10" },
  { value: "enroute_mission", label: "Auf Weg zum Einsatz", color: "border-violet-400/60 text-violet-300 bg-violet-400/10" },
  { value: "disabled", label: "Außer Gefecht", color: "border-rose-400/60 text-rose-300 bg-rose-400/10" },
] as const;

type TokenInfo = { token: string; participantId: string; displayName: string; missionId: string };

function storageKey(slug: string) { return `idcp:ops:${slug}`; }

function OpsPage() {
  const { slug } = Route.useParams();
  const fetchMission = useServerFn(getMissionBySlug);
  const { data: mission, error: missionError } = useQuery({
    queryKey: ["mission", slug],
    queryFn: () => fetchMission({ data: { slug } }),
    retry: false,
  });

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null);
  useEffect(() => {
    const raw = typeof window !== "undefined" ? localStorage.getItem(storageKey(slug)) : null;
    if (raw) {
      try { setTokenInfo(JSON.parse(raw)); } catch { /* noop */ }
    }
  }, [slug]);

  return (
    <UidPage backdrop="stars" seed={3304}>
      <div className="pt-12 pb-20">
        {missionError && (
          <div className="mx-auto max-w-xl px-6 text-center">
            <h1 className="font-display text-3xl">Einsatz nicht gefunden</h1>
            <p className="mt-2 text-muted-foreground">{(missionError as Error).message}</p>
            <Link to="/" className="mt-6 inline-block text-brand hover:underline">← Zurück</Link>
          </div>
        )}
        {mission && !tokenInfo && (
          <JoinForm
            slug={slug}
            missionTitle={mission.title}
            description={(mission as { description?: string | null }).description ?? null}
            startsAt={(mission as { starts_at?: string | null }).starts_at ?? null}
            status={(mission as { status?: string }).status}
            requiresPassword={!!(mission as { requires_password?: boolean }).requires_password}
            onJoined={(info) => {
              localStorage.setItem(storageKey(slug), JSON.stringify(info));
              setTokenInfo(info);
            }}
          />
        )}
        {mission && tokenInfo && (
          <Board
            slug={slug}
            mission={mission}
            token={tokenInfo}
            onLeave={() => {
              localStorage.removeItem(storageKey(slug));
              setTokenInfo(null);
            }}
          />
        )}
      </div>
    </UidPage>
  );
}

function JoinForm({
  slug,
  missionTitle,
  description,
  startsAt,
  status,
  requiresPassword,
  onJoined,
}: {
  slug: string;
  missionTitle: string;
  description: string | null;
  startsAt: string | null;
  status?: string;
  requiresPassword: boolean;
  onJoined: (info: TokenInfo) => void;
}) {
  const fn = useServerFn(joinMission);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || cancelled) return;
      setUserId(data.user.id);
      const { data: prof } = await supabase
        .from("profiles")
        .select("rsi_handle,callsign,display_name")
        .eq("id", data.user.id)
        .maybeSingle();
      if (cancelled) return;
      const md = data.user.user_metadata as { callsign?: string; display_name?: string } | null;
      setName(
        prof?.rsi_handle ??
          prof?.callsign ??
          md?.callsign ??
          prof?.display_name ??
          md?.display_name ??
          data.user.email?.split("@")[0] ??
          "",
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const res = await fn({ data: { slug, password, display_name: name } });
      onJoined({
        token: res.token,
        participantId: res.participant_id,
        displayName: name,
        missionId: res.mission_id,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-xl px-6">
      <div className="mb-3 inline-block p-1 border border-brand/30">
        <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// Mission Access</div>
      </div>
      <h1 className="mb-2 font-display text-3xl tracking-tight">{missionTitle}</h1>
      <p className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
        /{slug}
        {startsAt ? ` · ${new Date(startsAt).toLocaleString("de-DE", { dateStyle: "full", timeStyle: "short" })} Uhr` : ""}
        {status ? ` · ${status === "draft" ? "Lobby" : status === "active" ? "Aktiv" : status}` : ""}
      </p>
      <div className="mb-6 border border-brand/15 bg-background/40 p-4">
        <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">// Briefing</div>
        {description ? (
          <RichText content={description} />
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">// keine Beschreibung hinterlegt</p>
        )}
      </div>
      <form onSubmit={submit} className="space-y-4">
        <input required placeholder="Dein Name" value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none" />
        {requiresPassword ? (
          <input required type="password" placeholder="Einsatz-Passwort" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none" />
        ) : (
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">// öffentlicher Einsatz · kein Passwort nötig</p>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button disabled={loading} className="w-full border border-brand bg-brand py-3 text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/80 disabled:opacity-50">
          {loading ? "…" : "Einsatz beitreten →"}
        </button>
      </form>
    </section>
  );
}

function Board({
  slug,
  mission,
  token,
  onLeave,
}: {
  slug: string;
  mission: { id: string; title: string; description: string | null; status: string; starts_at: string | null; leader_id: string };
  token: TokenInfo;
  onLeave: () => void;
}) {
  const qc = useQueryClient();
  const fetchBoard = useServerFn(getMissionBoard);
  const addShip = useServerFn(addMissionShip);
  const removeShip = useServerFn(removeMissionShip);
  const setStatus = useServerFn(setShipStatus);
  const setRole = useServerFn(setShipRole);
  const joinCrew = useServerFn(joinShipCrew);
  const leaveCrew = useServerFn(leaveShipCrew);
  const assignCrew = useServerFn(assignShipCrew);
  const removeCrewMember = useServerFn(removeShipCrewMember);
  const updateMission = useServerFn(updateMissionStatus);
  const fetchProfile = useServerFn(getMyProfile);
  const assignStation = useServerFn(assignMissionStation);
  const addStation = useServerFn(addManualMissionStation);
  const removeStation = useServerFn(removeMissionStation);

  const [isLeader, setIsLeader] = useState(false);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      if (data.user.id === mission.leader_id) {
        setIsLeader(true);
        return;
      }
      // Grant leader-equivalent UI to org members with `missions.manage`
      try {
        const { data: rows } = await supabase
          .from("org_members")
          .select("role, permissions, org_custom_roles:custom_role_id(permissions)")
          .eq("user_id", data.user.id);
        for (const m of rows ?? []) {
          if (m.role === "owner") { setIsLeader(true); return; }
          const custom = (m as { org_custom_roles?: { permissions?: string[] } | null }).org_custom_roles?.permissions ?? [];
          const own = (m.permissions as string[] | null) ?? [];
          if (own.includes("missions.manage") || custom.includes("missions.manage")) {
            setIsLeader(true);
            return;
          }
        }
      } catch { /* best effort */ }
    })();
  }, [mission.leader_id]);

  const board = useQuery({
    queryKey: ["mission-board", mission.id],
    queryFn: () => fetchBoard({ data: { mission_id: mission.id, token: token.token } }),
    refetchOnWindowFocus: false,
  });

  const invalidateBoard = () => qc.invalidateQueries({ queryKey: ["mission-board", mission.id] });

  // Personal fleet (only if authenticated)
  const myProfile = useQuery({
    queryKey: ["my-profile-quick"],
    queryFn: () => fetchProfile(),
    retry: false,
  });

  // Realtime
  useEffect(() => {
    const channel = supabase
      .channel(`mission:${mission.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_ships", filter: `mission_id=eq.${mission.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["mission-board", mission.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_participants", filter: `mission_id=eq.${mission.id}` }, () => {
        qc.invalidateQueries({ queryKey: ["mission-board", mission.id] });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "mission_ship_crew" }, () => {
        qc.invalidateQueries({ queryKey: ["mission-board", mission.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [mission.id, qc]);

  const ships = (fleet as { ships: FleetShip[] }).ships;
  const myShips = myProfile.data?.ships ?? [];

  const [pickSlug, setPickSlug] = useState("");
  const [pickRole, setPickRole] = useState("");
  const [adding, setAdding] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [pickOpen, setPickOpen] = useState(false);

  const pickLabel = useMemo(() => {
    if (!pickSlug) return "";
    if (pickSlug.startsWith("my:")) {
      const m = myShips.find((s) => s.id === pickSlug.slice(3));
      return m ? `${m.ship_name}${m.custom_name ? ` "${m.custom_name}"` : ""} (Hangar)` : "";
    }
    const f = ships.find((s) => s.slug === pickSlug);
    return f ? `${f.manufacturer ?? ""} — ${f.name}` : "";
  }, [pickSlug, myShips, ships]);

  const filteredMyShips = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    if (!q) return myShips;
    return myShips.filter((s) =>
      `${s.ship_name} ${s.custom_name ?? ""} ${s.manufacturer ?? ""}`.toLowerCase().includes(q),
    );
  }, [myShips, pickQuery]);

  const filteredShips = useMemo(() => {
    const q = pickQuery.trim().toLowerCase();
    const list = q
      ? ships.filter((s) => `${s.name} ${s.manufacturer ?? ""}`.toLowerCase().includes(q))
      : ships;
    return list.slice(0, 50);
  }, [ships, pickQuery]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdding(true);
    try {
      let ship_slug = pickSlug;
      let ship_name = "";
      let manufacturer: string | null = null;
      if (pickSlug.startsWith("my:")) {
        const id = pickSlug.slice(3);
        const m = myShips.find((s) => s.id === id);
        if (!m) return;
        ship_slug = m.ship_slug ?? "";
        ship_name = m.custom_name ? `${m.ship_name} "${m.custom_name}"` : m.ship_name;
        manufacturer = m.manufacturer;
      } else {
        const f = ships.find((s) => s.slug === pickSlug);
        if (!f) return;
        ship_name = f.name;
        manufacturer = f.manufacturer;
      }
      await addShip({
        data: {
          mission_id: mission.id,
          token: token.token,
          ship_slug,
          ship_name,
          manufacturer,
          role_tag: pickRole || null,
        },
      });
      await invalidateBoard();
      setPickSlug("");
      setPickRole("");
    } finally {
      setAdding(false);
    }
  };

  type Ship = NonNullable<typeof board.data>["ships"][number];
  type Crew = NonNullable<typeof board.data>["crew"][number];
  type Participant = NonNullable<typeof board.data>["participants"][number];
  type Station = NonNullable<typeof board.data>["stations"][number];

  const crewByShip = useMemo(() => {
    const map = new Map<string, Crew[]>();
    (board.data?.crew ?? []).forEach((c) => {
      const arr = map.get(c.mission_ship_id) ?? [];
      arr.push(c);
      map.set(c.mission_ship_id, arr);
    });
    return map;
  }, [board.data?.crew]);

  const stationsByShip = useMemo(() => {
    const map = new Map<string, Station[]>();
    (board.data?.stations ?? []).forEach((s) => {
      const arr = map.get(s.mission_ship_id) ?? [];
      arr.push(s);
      map.set(s.mission_ship_id, arr);
    });
    return map;
  }, [board.data?.stations]);

  const partById = useMemo(() => {
    const map = new Map<string, Participant>();
    (board.data?.participants ?? []).forEach((p) => map.set(p.id, p));
    return map;
  }, [board.data?.participants]);

  const myCrew = (board.data?.crew ?? []).find((c) => c.participant_id === token.participantId);

  if (mission.status === "draft") {
    const participants = board.data?.participants ?? [];
    return (
      <section className="mx-auto max-w-3xl space-y-6 px-6">
        <div>
          <div className="mb-3 inline-block p-1 border border-amber-400/40">
            <div className="border border-amber-400/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300">
              // Lobby — wartet auf Start
            </div>
          </div>
          <h1 className="font-display text-4xl tracking-tight">{mission.title}</h1>
          {mission.description && <RichText content={mission.description} className="mt-2 max-w-2xl" />}
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            /{slug}
            {mission.starts_at ? ` · ${new Date(mission.starts_at).toLocaleString()}` : ""}
          </div>
          <div className="mt-3 max-w-md">
            <CopyShareLink path={`/ops/${slug}`} label="Einsatz-Link kopieren" />
          </div>
        </div>

        <div className="border border-brand/20 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              Teilnehmer ({participants.length})
            </h2>
            <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Du: {token.displayName}
            </span>
          </div>
          {participants.length === 0 ? (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              // noch niemand eingetragen
            </p>
          ) : (
            <ul className="divide-y divide-brand/10">
              {participants.map((p) => (
                <li key={p.id} className="py-2 flex items-center justify-between">
                  <span>{p.display_name}</span>
                  <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                    {new Date(p.joined_at).toLocaleTimeString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onLeave}
            className="px-4 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-primary-foreground"
          >
            Verlassen
          </button>
          {isLeader && (
            <Link
              to="/ops/$slug/edit"
              params={{ slug }}
              className="px-4 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-primary-foreground"
            >
              Bearbeiten
            </Link>
          )}
          {isLeader && (
            <button
              onClick={() =>
                updateMission({ data: { mission_id: mission.id, status: "active" } })
                  .then(() => qc.invalidateQueries({ queryKey: ["mission", slug] }))
              }
              className="px-5 py-2 border border-brand bg-brand text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/80"
            >
              Einsatz starten →
            </button>
          )}
          {!isLeader && (
            <span className="self-center font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              // warte bis der Leader den Einsatz startet
            </span>
          )}
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-7xl space-y-8 px-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-3 inline-block p-1 border border-brand/30">
            <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// Live Ops Board</div>
          </div>
          <h1 className="font-display text-4xl tracking-tight">{mission.title}</h1>
          {mission.description && <RichText content={mission.description} className="mt-2 max-w-2xl" />}
          <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            /{slug} · {mission.status}
            {mission.starts_at ? ` · ${new Date(mission.starts_at).toLocaleString()}` : ""}
          </div>
          <div className="mt-3 max-w-md">
            <CopyShareLink path={`/ops/${slug}`} label="Einsatz-Link kopieren" />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-brand">Du: {token.displayName}</span>
          <button onClick={onLeave} className="px-4 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-primary-foreground">Verlassen</button>
          {isLeader && (
            <Link
              to="/ops/$slug/edit"
              params={{ slug }}
              className="px-4 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.2em] hover:bg-brand hover:text-primary-foreground"
            >
              Bearbeiten
            </Link>
          )}
          {isLeader && (
            <select
              value={mission.status}
              onChange={(e) => updateMission({ data: { mission_id: mission.id, status: e.target.value as never } }).then(() => qc.invalidateQueries({ queryKey: ["mission", slug] }))}
              className="border border-brand/40 bg-background/50 px-3 py-2 text-[10px] uppercase tracking-[0.2em]"
            >
              <option value="draft">Entwurf</option>
              <option value="active">Aktiv</option>
              <option value="completed">Abgeschlossen</option>
              <option value="cancelled">Abgebrochen</option>
            </select>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <form onSubmit={handleAdd} className="flex flex-col gap-3 border border-brand/20 p-4 md:flex-row">
            <div className="relative flex-1">
              <input
                type="text"
                value={pickOpen ? pickQuery : pickLabel || pickQuery}
                onFocus={() => { setPickOpen(true); setPickQuery(""); }}
                onBlur={() => setTimeout(() => setPickOpen(false), 150)}
                onChange={(e) => { setPickQuery(e.target.value); setPickOpen(true); if (pickSlug) setPickSlug(""); }}
                placeholder="Schiff suchen (z.B. Perseus)…"
                className="w-full border border-brand/20 bg-background/50 px-3 py-2 focus:border-brand focus:outline-none"
              />
              {pickOpen && (
                <div className="absolute z-20 mt-1 max-h-80 w-full overflow-auto border border-brand/30 bg-background shadow-lg">
                  {filteredMyShips.length > 0 && (
                    <>
                      <div className="px-3 py-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70 border-b border-brand/10">Aus deinem Hangar</div>
                      {filteredMyShips.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onMouseDown={(e) => { e.preventDefault(); setPickSlug(`my:${s.id}`); setPickOpen(false); setPickQuery(""); }}
                          className="block w-full px-3 py-2 text-left text-sm hover:bg-brand/10"
                        >
                          {s.ship_name}{s.custom_name ? ` "${s.custom_name}"` : ""}
                          {s.manufacturer && <span className="ml-2 text-xs text-muted-foreground">{s.manufacturer}</span>}
                        </button>
                      ))}
                    </>
                  )}
                  <div className="px-3 py-1 font-mono text-[9px] uppercase tracking-[0.3em] text-brand/70 border-b border-t border-brand/10">Alle SC-Schiffe</div>
                  {filteredShips.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-muted-foreground">Keine Treffer</div>
                  ) : (
                    filteredShips.map((s) => (
                      <button
                        key={s.slug}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setPickSlug(s.slug); setPickOpen(false); setPickQuery(""); }}
                        className="block w-full px-3 py-2 text-left text-sm hover:bg-brand/10"
                      >
                        <span className="text-muted-foreground">{s.manufacturer}</span> — {s.name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <input placeholder="Aufgabe (z.B. Eskorte)" value={pickRole} onChange={(e) => setPickRole(e.target.value)} className="md:w-56 border border-brand/20 bg-background/50 px-3 py-2 focus:border-brand focus:outline-none" />
            <button disabled={!pickSlug || adding} className="px-5 py-2 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] hover:bg-brand/80 disabled:opacity-50">+ Hinzufügen</button>
          </form>

          <div className="grid gap-4 md:grid-cols-2">
            {(board.data?.ships ?? []).map((s: Ship) => {
              const crew = crewByShip.get(s.id) ?? [];
              const statusDef = STATUSES.find((x) => x.value === s.status) ?? STATUSES[1];
              const isMine = !!myCrew && myCrew.mission_ship_id === s.id;
              const canRemove = s.added_by === token.participantId || isLeader;
              const boardCode = (board.data?.boards ?? []).find(
                (b: { mission_ship_id: string | null; code: string }) => b.mission_ship_id === s.id,
              )?.code;
              return (
                <div key={s.id} className="border border-brand/20 p-5">
                  <ShipHeader
                    shipSlug={s.ship_slug}
                    shipName={s.ship_name}
                    manufacturer={s.manufacturer}
                    canRemove={canRemove}
                    onRemove={() =>
                      removeShip({ data: { mission_id: mission.id, token: token.token, ship_id: s.id } }).then(invalidateBoard)
                    }
                  />

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      defaultValue={s.role_tag ?? ""}
                      placeholder="Aufgabe"
                      onBlur={(e) => {
                        if (e.target.value !== (s.role_tag ?? "")) {
                          setRole({ data: { mission_id: mission.id, token: token.token, ship_id: s.id, role_tag: e.target.value } }).then(invalidateBoard);
                        }
                      }}
                      className="flex-1 min-w-[140px] border border-brand/20 bg-background/50 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
                    />
                    <select
                      value={s.status}
                      onChange={(e) => setStatus({ data: { mission_id: mission.id, token: token.token, ship_id: s.id, status: e.target.value as never } }).then(invalidateBoard)}
                      className={`px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] border ${statusDef.color}`}
                    >
                      {STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                    </select>
                    {boardCode && (
                      <a
                        href={`/board/${boardCode}`}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-brand/40 px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
                      >
                        Boardcomputer →
                      </a>
                    )}
                  </div>

                  <div className="mt-4">
                    <StationPanel
                      ship={s}
                      stations={stationsByShip.get(s.id) ?? []}
                      crew={crew}
                      participants={board.data?.participants ?? []}
                      partById={partById}
                      myParticipantId={token.participantId}
                      isMineElsewhere={!!myCrew && myCrew.mission_ship_id !== s.id}
                      isLeader={isLeader}
                      onAssignStation={(station_id, participant_id) =>
                        assignStation({ data: { mission_id: mission.id, token: token.token, station_id, participant_id } }).then(invalidateBoard)
                      }
                      onAddStation={(label, category) =>
                        addStation({ data: { mission_id: mission.id, token: token.token, ship_id: s.id, label, category } }).then(invalidateBoard)
                      }
                      onRemoveStation={(station_id) =>
                        removeStation({ data: { mission_id: mission.id, token: token.token, station_id } }).then(invalidateBoard)
                      }
                      onJoinFreeform={(seatRole) =>
                        joinCrew({ data: { mission_id: mission.id, token: token.token, ship_id: s.id, seat_role: seatRole || null } }).then(invalidateBoard)
                      }
                      onLeave={() =>
                        leaveCrew({ data: { mission_id: mission.id, token: token.token } }).then(invalidateBoard)
                      }
                      onRemoveCrew={(crew_id) =>
                        removeCrewMember({ data: { mission_id: mission.id, token: token.token, crew_id } }).then(invalidateBoard)
                      }
                      onAssignFreeform={(participant_id, seat_role) =>
                        assignCrew({ data: { mission_id: mission.id, token: token.token, ship_id: s.id, target_participant_id: participant_id, seat_role: seat_role || null } }).then(invalidateBoard)
                      }
                    />
                  </div>
                </div>
              );
            })}
            {board.data && board.data.ships.length === 0 && (
              <p className="text-sm text-muted-foreground">Noch keine Schiffe registriert.</p>
            )}
          </div>
        </div>

        <aside className="space-y-4 border border-brand/20 p-5 h-fit">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">// Teilnehmer ({board.data?.participants.length ?? 0})</h2>
          <ul className="space-y-2">
            {(board.data?.participants ?? []).map((p) => {
              const assigned = (board.data?.crew ?? []).find((c) => c.participant_id === p.id);
              const ship = assigned ? (board.data?.ships ?? []).find((s) => s.id === assigned.mission_ship_id) : null;
              return (
                <li key={p.id} className="text-sm">
                  <div className="flex items-center justify-between">
                    <span>{p.display_name}{p.id === token.participantId ? " (Du)" : ""}</span>
                    {p.user_id && <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-brand/70">Member</span>}
                  </div>
                  {ship && <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">→ {ship.ship_name}{assigned?.seat_role ? ` · ${assigned.seat_role}` : ""}</div>}
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <MissionVoicePanel
        missionId={mission.id}
        participantToken={token.token}
        participantId={token.participantId}
        isLeader={isLeader}
        ships={(board.data?.ships ?? []).map((s) => ({ id: s.id, ship_name: s.ship_name }))}
      />
    </section>
  );
}

function JoinCrewControl({ onJoin }: { onJoin: (seatRole: string) => Promise<unknown> }) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="mt-3 w-full border border-brand/40 py-2 text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand hover:text-primary-foreground">
        + An Bord gehen
      </button>
    );
  }
  return (
    <div className="mt-3 flex gap-2">
      <input autoFocus value={role} onChange={(e) => setRole(e.target.value)} placeholder="Sitz (z.B. Pilot)" className="flex-1 border border-brand/20 bg-background/50 px-3 py-1.5 text-sm focus:border-brand focus:outline-none" />
      <button
        disabled={busy}
        onClick={async () => { setBusy(true); try { await onJoin(role); setOpen(false); setRole(""); } finally { setBusy(false); } }}
        className="px-3 py-1.5 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.2em] hover:bg-brand/80 disabled:opacity-50"
      >OK</button>
      <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground">×</button>
    </div>
  );
}

function ShipHeader({
  shipSlug,
  shipName,
  manufacturer,
  canRemove,
  onRemove,
}: {
  shipSlug: string | null;
  shipName: string;
  manufacturer: string | null;
  canRemove: boolean;
  onRemove: () => void;
}) {
  const fetchDetails = useServerFn(getShipDetails);
  const { data } = useQuery<ShipDetails>({
    queryKey: ["ship-details", shipSlug ?? ""],
    queryFn: () => fetchDetails({ data: { slug: shipSlug as string } }),
    enabled: !!shipSlug,
    staleTime: 1000 * 60 * 30,
    retry: false,
  });

  const image = data?.image ?? null;
  const turrets = data?.turrets ?? null;
  const mannedTurrets = data?.mannedTurrets ?? null;
  const missileRacks = data?.missileRacks ?? null;
  const weapons = data?.weaponHardpoints ?? null;
  const crew = data?.crew ?? null;
  const size = data?.size ?? null;
  const focus = data?.focus ?? null;

  return (
    <div>
      <div className="relative -m-5 mb-3 aspect-[16/8] w-[calc(100%+2.5rem)] overflow-hidden border-b border-brand/20 bg-black">
        {image ? (
          <img
            src={image}
            alt={shipName}
            loading="lazy"
            className="h-full w-full object-cover opacity-90"
          />
        ) : (
          <div className="flex h-full items-center justify-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground/50">
            // no image
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background to-transparent p-3">
          <div className="flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-xl leading-tight">{shipName}</div>
              <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                {manufacturer ?? "—"}
                {focus ? ` · ${focus}` : ""}
              </div>
            </div>
            {canRemove && (
              <button onClick={onRemove} className="shrink-0 font-mono text-[10px] uppercase tracking-[0.2em] text-destructive hover:underline">
                Entfernen
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 border border-brand/10 bg-background/40 p-2 font-mono text-[10px] uppercase tracking-[0.15em]">
        <Spec label="Geschütztürme" value={turrets} />
        <Spec label="Gunner benötigt" value={mannedTurrets} />
        <Spec label="Raketenracks" value={missileRacks} />
        <Spec label="Waffen-HP" value={weapons} />
        <Spec label="Crew" value={crew ?? "—"} />
        <Spec label="Größe" value={size ?? "—"} />
        <Spec label="Klasse" value={data?.classification ?? "—"} />
      </div>
    </div>
  );
}

function Spec({ label, value }: { label: string; value: number | string | null }) {
  return (
    <div>
      <div className="text-brand/60">{label}</div>
      <div className="mt-0.5 text-foreground/90">{value === null ? "—" : value}</div>
    </div>
  );
}

type ParticipantLite = { id: string; display_name: string };

function AssignCrewControl({
  participants,
  onAssign,
}: {
  participants: ParticipantLite[];
  onAssign: (participantId: string, seatRole: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pid, setPid] = useState("");
  const [seat, setSeat] = useState("");
  const [busy, setBusy] = useState(false);

  if (participants.length === 0) return null;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full border border-brand/20 py-2 text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:border-brand hover:text-brand"
      >
        + Mitspieler zuweisen
      </button>
    );
  }
  return (
    <div className="mt-2 flex flex-col gap-2 md:flex-row">
      <select
        value={pid}
        onChange={(e) => setPid(e.target.value)}
        className="flex-1 border border-brand/20 bg-background/50 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
      >
        <option value="">— Mitspieler wählen —</option>
        {participants.map((p) => (
          <option key={p.id} value={p.id}>{p.display_name}</option>
        ))}
      </select>
      <input
        value={seat}
        onChange={(e) => setSeat(e.target.value)}
        placeholder="Sitz (optional)"
        className="md:w-36 border border-brand/20 bg-background/50 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          disabled={!pid || busy}
          onClick={async () => {
            setBusy(true);
            try { await onAssign(pid, seat); setOpen(false); setPid(""); setSeat(""); }
            finally { setBusy(false); }
          }}
          className="px-3 py-1.5 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.2em] hover:bg-brand/80 disabled:opacity-50"
        >OK</button>
        <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground">×</button>
      </div>
    </div>
  );
}
type StationLite = {
  id: string;
  mission_ship_id: string;
  slot_key: string;
  label: string;
  hardpoint_name: string | null;
  category: string;
  sort_order: number;
  is_manual: boolean;
  assigned_participant_id: string | null;
};

type CrewLite = { id: string; mission_ship_id: string; participant_id: string; seat_role: string | null };
type PartLite = { id: string; display_name: string; user_id: string | null };
type ShipLite = { id: string; ship_name: string };

function StationPanel({
  ship,
  stations,
  crew,
  participants,
  partById,
  myParticipantId,
  isMineElsewhere,
  isLeader,
  onAssignStation,
  onAddStation,
  onRemoveStation,
  onJoinFreeform,
  onLeave,
  onRemoveCrew,
  onAssignFreeform,
}: {
  ship: ShipLite;
  stations: StationLite[];
  crew: CrewLite[];
  participants: PartLite[];
  partById: Map<string, PartLite>;
  myParticipantId: string;
  isMineElsewhere: boolean;
  isLeader: boolean;
  onAssignStation: (station_id: string, participant_id: string | null) => Promise<unknown>;
  onAddStation: (label: string, category: "seat" | "turret") => Promise<unknown>;
  onRemoveStation: (station_id: string) => Promise<unknown>;
  onJoinFreeform: (seatRole: string) => Promise<unknown>;
  onLeave: () => Promise<unknown>;
  onRemoveCrew: (crew_id: string) => Promise<unknown>;
  onAssignFreeform: (participant_id: string, seat_role: string) => Promise<unknown>;
}) {
  const [addOpen, setAddOpen] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newCat, setNewCat] = useState<"seat" | "turret">("seat");
  const [hideEmpty, setHideEmpty] = useState(true);

  const stationOccupants = new Set(stations.map((s) => s.assigned_participant_id).filter((x): x is string => !!x));
  const freeformCrew = crew.filter((c) => !stationOccupants.has(c.participant_id));

  const grouped = { seat: stations.filter((s) => s.category === "seat"), turret: stations.filter((s) => s.category === "turret") };
  const myStation = stations.find((s) => s.assigned_participant_id === myParticipantId);
  const visible = (list: StationLite[]) => hideEmpty ? list.filter((s) => s.assigned_participant_id) : list;
  const emptyCount = stations.filter((s) => !s.assigned_participant_id).length;

  const row = (s: StationLite) => {
    const p = s.assigned_participant_id ? partById.get(s.assigned_participant_id) : null;
    const isMe = s.assigned_participant_id === myParticipantId;
    return (
      <div key={s.id} className="flex items-center justify-between gap-2 border border-brand/10 bg-background/40 px-3 py-1.5 text-sm">
        <div className="min-w-0 flex-1">
          <div className="truncate">{s.label}</div>
          {null}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {p ? (
            <>
              <span className="text-xs">{p.display_name}{isMe ? " (Du)" : ""}</span>
              {(isMe || isLeader) && (
                <button
                  onClick={() => onAssignStation(s.id, null)}
                  className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive"
                >frei</button>
              )}
            </>
          ) : (
            <button
              onClick={() => onAssignStation(s.id, myParticipantId)}
              className="border border-brand/40 px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand hover:bg-brand hover:text-primary-foreground"
            >{myStation ? "Wechseln" : "Übernehmen"}</button>
          )}
          {isLeader && !p && participants.length > 0 && (
            <select
              defaultValue=""
              onChange={(e) => { if (e.target.value) { onAssignStation(s.id, e.target.value); e.currentTarget.value = ""; } }}
              className="border border-brand/20 bg-background/50 px-1 py-0.5 text-[10px]"
            >
              <option value="">zuweisen…</option>
              {participants.filter((pp) => pp.id !== myParticipantId).map((pp) => (
                <option key={pp.id} value={pp.id}>{pp.display_name}</option>
              ))}
            </select>
          )}
          {s.is_manual && (
            <button onClick={() => onRemoveStation(s.id)} className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive">×</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">// Stationen ({stations.length})</div>
        <div className="flex items-center gap-3">
          {emptyCount > 0 && (
            <button
              onClick={() => setHideEmpty((v) => !v)}
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-brand"
              title={hideEmpty ? "Leere Stationen einblenden" : "Leere Stationen ausblenden"}
            >
              {hideEmpty ? `+ ${emptyCount} leere zeigen` : `− ${emptyCount} leere ausblenden`}
            </button>
          )}
          <button
            onClick={() => setAddOpen((v) => !v)}
            className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-brand"
          >
            {addOpen ? "×" : "+ Station"}
          </button>
        </div>
      </div>

      {addOpen && (
        <div className="flex flex-wrap gap-2 border border-brand/10 bg-background/40 p-2">
          <input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            placeholder="Bezeichnung"
            className="flex-1 min-w-[140px] border border-brand/20 bg-background/50 px-2 py-1 text-sm focus:border-brand focus:outline-none"
          />
          <select value={newCat} onChange={(e) => setNewCat(e.target.value as "seat" | "turret")} className="border border-brand/20 bg-background/50 px-2 py-1 text-sm">
            <option value="seat">Sitz</option>
            <option value="turret">Turret</option>
          </select>
          <button
            disabled={!newLabel.trim()}
            onClick={async () => { await onAddStation(newLabel.trim(), newCat); setNewLabel(""); setAddOpen(false); }}
            className="border border-brand bg-brand px-3 py-1 text-[10px] uppercase tracking-[0.2em] text-primary-foreground hover:bg-brand/80 disabled:opacity-50"
          >Anlegen</button>
        </div>
      )}

      {stations.length === 0 && (
        <p className="text-xs text-muted-foreground">Kein Loadout vorhanden — nutze „An Bord gehen" oder lege manuelle Stationen an.</p>
      )}

      {visible(grouped.seat).length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-sky-300/80">Cockpit / Sitze</div>
          {visible(grouped.seat).map(row)}
        </div>
      )}
      {visible(grouped.turret).length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-rose-300/80">Turrets</div>
          {visible(grouped.turret).map(row)}
        </div>
      )}

      {freeformCrew.length > 0 && (
        <div className="space-y-1">
          <div className="font-mono text-[9px] uppercase tracking-[0.25em] text-muted-foreground">Zusätzliche Besatzung</div>
          {freeformCrew.map((c) => {
            const p = partById.get(c.participant_id);
            const isMe = c.participant_id === myParticipantId;
            return (
              <div key={c.id} className="flex items-center justify-between gap-2 border border-brand/10 bg-background/40 px-3 py-1.5 text-sm">
                <span>{p?.display_name ?? "?"}{c.seat_role ? ` · ${c.seat_role}` : ""}{isMe ? " (Du)" : ""}</span>
                {isMe ? (
                  <button onClick={onLeave} className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive">verlassen</button>
                ) : (
                  <button onClick={() => onRemoveCrew(c.id)} className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground hover:text-destructive">entfernen</button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {!myStation && !freeformCrew.some((c) => c.participant_id === myParticipantId) && (
        <BoardControl
          stations={stations.filter((s) => !s.assigned_participant_id)}
          isMineElsewhere={isMineElsewhere}
          onPickStation={(sid) => onAssignStation(sid, myParticipantId)}
          onFreeform={onJoinFreeform}
        />
      )}

      <AssignCrewControl
        participants={participants.filter((p) => !stationOccupants.has(p.id) && !freeformCrew.some((c) => c.participant_id === p.id))}
        onAssign={onAssignFreeform}
      />
    </div>
  );
}

function BoardControl({
  stations,
  isMineElsewhere,
  onPickStation,
  onFreeform,
}: {
  stations: StationLite[];
  isMineElsewhere: boolean;
  onPickStation: (sid: string) => Promise<unknown>;
  onFreeform: (seatRole: string) => Promise<unknown>;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");
  const [freeform, setFreeform] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"station" | "freeform">(stations.length > 0 ? "station" : "freeform");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-2 w-full border border-brand/40 py-2 text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand hover:text-primary-foreground"
      >
        + An Bord gehen{isMineElsewhere ? " (Schiff wechseln)" : ""}
      </button>
    );
  }
  return (
    <div className="mt-2 space-y-2 border border-brand/20 bg-background/40 p-2">
      {stations.length > 0 && (
        <div className="flex gap-1 font-mono text-[9px] uppercase tracking-[0.2em]">
          <button onClick={() => setMode("station")} className={`px-2 py-0.5 border ${mode === "station" ? "border-brand bg-brand text-primary-foreground" : "border-brand/30 text-muted-foreground"}`}>Station</button>
          <button onClick={() => setMode("freeform")} className={`px-2 py-0.5 border ${mode === "freeform" ? "border-brand bg-brand text-primary-foreground" : "border-brand/30 text-muted-foreground"}`}>Freier Sitz</button>
        </div>
      )}
      {mode === "station" ? (
        <div className="flex gap-2">
          <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 border border-brand/20 bg-background/50 px-3 py-1.5 text-sm">
            <option value="">— Freie Station wählen —</option>
            {stations.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <button
            disabled={!pick || busy}
            onClick={async () => { setBusy(true); try { await onPickStation(pick); setOpen(false); setPick(""); } finally { setBusy(false); } }}
            className="px-3 py-1.5 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.2em] hover:bg-brand/80 disabled:opacity-50"
          >Übernehmen</button>
          <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground">×</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input autoFocus value={freeform} onChange={(e) => setFreeform(e.target.value)} placeholder="Sitz (z.B. Pilot)" className="flex-1 border border-brand/20 bg-background/50 px-3 py-1.5 text-sm" />
          <button
            disabled={busy}
            onClick={async () => { setBusy(true); try { await onFreeform(freeform); setOpen(false); setFreeform(""); } finally { setBusy(false); } }}
            className="px-3 py-1.5 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.2em] hover:bg-brand/80 disabled:opacity-50"
          >OK</button>
          <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-muted-foreground">×</button>
        </div>
      )}
    </div>
  );
}
