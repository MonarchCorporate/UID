import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  addMyShip,
  getMyProfile,
  removeMyShip,
  setFleetyardsUsername,
  syncMyFleetyards,
  updateProfile,
  uploadMyAvatar,
  removeMyAvatar,
} from "@/lib/profile.functions";
import { listShipCatalog } from "@/lib/ship-catalog.functions";
import {
  NOTIFICATION_KINDS,
  listNotificationPreferences,
  setNotificationPreference,
} from "@/lib/notifications.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { RsiVerifyCard } from "@/components/profile/RsiVerifyCard";

type CatalogShip = { slug: string; name: string; manufacturer: string | null };

export const Route = createFileRoute("/_authenticated/profil")({
  component: Profil,
});

function Profil() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateProfile);
  const addFn = useServerFn(addMyShip);
  const removeFn = useServerFn(removeMyShip);
  const setFyFn = useServerFn(setFleetyardsUsername);
  const syncFyFn = useServerFn(syncMyFleetyards);
  const uploadAvatarFn = useServerFn(uploadMyAvatar);
  const removeAvatarFn = useServerFn(removeMyAvatar);
  const fetchCatalog = useServerFn(listShipCatalog);

  const { data, isLoading } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });

  const { data: catalog, isLoading: catalogLoading } = useQuery({
    queryKey: ["ship-catalog-list"],
    queryFn: () => fetchCatalog(),
    staleTime: 5 * 60_000,
  });

  const [callsign, setCallsign] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [statusText, setStatusText] = useState("");
  const [fyInput, setFyInput] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (data?.profile) {
      setCallsign(data.profile.callsign ?? "");
      setDisplayName(data.profile.display_name ?? "");
      setStatusText((data.profile as { status_text?: string | null }).status_text ?? "");
      setFyInput((data.profile as { fleetyards_username?: string | null }).fleetyards_username ?? "");
    }
  }, [data?.profile]);

  const ships: CatalogShip[] = useMemo(
    () =>
      ((catalog ?? []) as Array<{ slug: string; name: string; manufacturer: string | null }>)
        .map((s) => ({ slug: s.slug, name: s.name, manufacturer: s.manufacturer ?? null }))
        .sort((a, b) =>
          (a.manufacturer ?? "").localeCompare(b.manufacturer ?? "") ||
          a.name.localeCompare(b.name),
        ),
    [catalog],
  );
  const [pick, setPick] = useState("");
  const [custom, setCustom] = useState("");
  const [pickOpen, setPickOpen] = useState(false);

  const selected = useMemo(() => ships.find((s) => s.slug === pick) ?? null, [ships, pick]);

  // Nach erfolgreicher RSI-Verifizierung sind Callsign und Anzeigename fest
  // an den RSI-Handle gebunden und nicht mehr editierbar.
  const rsiProfile = data?.profile as
    | { rsi_handle?: string | null; rsi_verified_at?: string | null }
    | undefined;
  const rsiLocked = !!rsiProfile?.rsi_verified_at && !!rsiProfile?.rsi_handle;
  const rsiHandle = rsiProfile?.rsi_handle ?? "";

  const saveProfile = useMutation({
    mutationFn: () =>
      updateFn({ data: { callsign, display_name: displayName, status_text: statusText } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  });

  const uploadAvatar = useMutation({
    mutationFn: async (file: File) => {
      const allowed = ["image/png", "image/jpeg", "image/webp", "image/gif"] as const;
      if (!allowed.includes(file.type as (typeof allowed)[number])) {
        throw new Error("Nur PNG, JPG, WEBP oder GIF erlaubt.");
      }
      if (file.size > 2 * 1024 * 1024) throw new Error("Bild ist zu groß (max. 2 MB).");
      const buf = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < buf.length; i += 8192) {
        binary += String.fromCharCode(...buf.subarray(i, i + 8192));
      }
      return uploadAvatarFn({
        data: {
          contentType: file.type as (typeof allowed)[number],
          base64: btoa(binary),
        },
      });
    },
    onSuccess: () => {
      if (fileRef.current) fileRef.current.value = "";
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const dropAvatar = useMutation({
    mutationFn: () => removeAvatarFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  });

  const avatarUrl =
    (data?.profile as { avatar_url?: string | null } | undefined)?.avatar_url ?? null;

  const addShip = useMutation({
    mutationFn: () => {
      if (!selected) throw new Error("Kein Schiff gewählt");
      return addFn({
        data: {
          ship_slug: selected.slug,
          ship_name: selected.name,
          manufacturer: selected.manufacturer,
          custom_name: custom || null,
        },
      });
    },
    onSuccess: () => {
      setPick("");
      setCustom("");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
  });

  const removeShip = useMutation({
    mutationFn: (id: string) => removeFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  });

  const saveFleetyards = useMutation({
    mutationFn: () => setFyFn({ data: { input: fyInput } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  });

  const syncFleetyards = useMutation({
    mutationFn: () => syncFyFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["my-profile"] }),
  });

  const fyProfile = data?.profile as
    | {
        fleetyards_username?: string | null;
        fleetyards_last_sync?: string | null;
        fleetyards_last_error?: string | null;
      }
    | undefined;
  const fyShipCount = (data?.ships ?? []).filter(
    (s) => (s as { source?: string }).source === "fleetyards",
  ).length;

  if (isLoading) return <div className="mx-auto max-w-3xl px-6">Lade…</div>;

  return (
    <section className="mx-auto max-w-3xl space-y-12 px-6">
      <div>
        <div className="mb-3 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// Pilot Profile</div>
        </div>
        <h1 className="font-display text-4xl tracking-tight">Profil</h1>
      </div>

      <NotificationSettings />

      <RsiVerifyCard />

      <div className="border border-brand/20 p-6">
        <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">// Identität</h2>
        <div className="space-y-3">
          <div className="flex flex-col gap-4 border border-brand/10 bg-background/40 p-4 sm:flex-row sm:items-center">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand/30 bg-brand/10 text-xl font-bold text-brand">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profilbild"
                  className="h-full w-full object-cover"
                />
              ) : (
                (callsign || displayName || "?").slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-xs text-muted-foreground">
                Profilbild · PNG, JPG, WEBP oder GIF, max. 2&nbsp;MB
              </p>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadAvatar.mutate(f);
                }}
                className="block w-full text-xs text-muted-foreground file:mr-3 file:border file:border-brand file:bg-brand file:px-4 file:py-1.5 file:text-[10px] file:uppercase file:tracking-[0.3em] file:text-primary-foreground"
              />
              <div className="flex items-center gap-3">
                {uploadAvatar.isPending && (
                  <span className="text-xs text-muted-foreground">Lade hoch…</span>
                )}
                {avatarUrl && (
                  <button
                    type="button"
                    onClick={() => dropAvatar.mutate()}
                    disabled={dropAvatar.isPending}
                    className="border border-brand/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10 disabled:opacity-40"
                  >
                    Entfernen
                  </button>
                )}
              </div>
              {(uploadAvatar.error || dropAvatar.error) && (
                <p className="text-xs text-destructive">
                  {((uploadAvatar.error ?? dropAvatar.error) as Error).message}
                </p>
              )}
            </div>
          </div>
          <div>
            <label className="block mb-1 text-xs text-muted-foreground">Callsign</label>
            <input
              value={rsiLocked ? rsiHandle : callsign}
              onChange={(e) => setCallsign(e.target.value)}
              readOnly={rsiLocked}
              disabled={rsiLocked}
              className="w-full border border-brand/20 bg-background/50 px-4 py-2 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
            />
            {rsiLocked && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Fest mit deinem verifizierten RSI-Handle verknüpft.
              </p>
            )}
          </div>
          <div>
            <label className="block mb-1 text-xs text-muted-foreground">Anzeigename</label>
            <input
              value={rsiLocked ? rsiHandle : displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              readOnly={rsiLocked}
              disabled={rsiLocked}
              className="w-full border border-brand/20 bg-background/50 px-4 py-2 focus:border-brand focus:outline-none disabled:cursor-not-allowed disabled:opacity-70"
            />
            {rsiLocked && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Entspricht immer deinem RSI-Handle „{rsiHandle}".
              </p>
            )}
          </div>
          <div>
            <label className="block mb-1 text-xs text-muted-foreground">
              Status-Info <span className="text-brand/60">({statusText.length}/140)</span>
            </label>
            <input
              value={statusText}
              maxLength={140}
              onChange={(e) => setStatusText(e.target.value)}
              placeholder="z. B. Bergbau in Aaron Halo · meist abends online"
              className="w-full border border-brand/20 bg-background/50 px-4 py-2 focus:border-brand focus:outline-none"
            />
          </div>
          <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="px-5 py-2 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] hover:bg-brand/80 disabled:opacity-50">
            Speichern
          </button>
          {saveProfile.error && <p className="text-xs text-destructive">{(saveProfile.error as Error).message}</p>}
        </div>
      </div>

      <div className="border border-brand/20 p-6">
        <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">// Deine Flotte</h2>
        <div className="mb-6 border border-brand/10 bg-background/40 p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h3 className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
              // Fleetyards-Import
            </h3>
            {fyProfile?.fleetyards_last_sync && (
              <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                letzter Sync: {new Date(fyProfile.fleetyards_last_sync).toLocaleString("de-DE")}
                {" · "}
                {fyShipCount} Schiffe
              </span>
            )}
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Gib deinen Fleetyards-Benutzernamen oder den Link zu deinem öffentlichen Hangar an
            (z. B. <code className="text-brand/80">https://fleetyards.net/hangar/deinname</code>).
            Wir importieren deine Flotte automatisch und aktualisieren sie regelmäßig. Manuell
            hinzugefügte Schiffe bleiben erhalten.
          </p>
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={fyInput}
              onChange={(e) => setFyInput(e.target.value)}
              placeholder="Fleetyards-User oder Hangar-Link"
              className="flex-1 border border-brand/20 bg-background/50 px-4 py-2 focus:border-brand focus:outline-none"
            />
            <button
              onClick={() => saveFleetyards.mutate()}
              disabled={saveFleetyards.isPending}
              className="px-5 py-2 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] hover:bg-brand/80 disabled:opacity-50"
            >
              {saveFleetyards.isPending ? "Verbinde…" : "Speichern & Import"}
            </button>
            <button
              onClick={() => syncFleetyards.mutate()}
              disabled={!fyProfile?.fleetyards_username || syncFleetyards.isPending}
              className="px-5 py-2 border border-brand/40 text-brand text-[10px] uppercase tracking-[0.3em] hover:bg-brand/10 disabled:opacity-40"
            >
              {syncFleetyards.isPending ? "Sync…" : "Jetzt sync"}
            </button>
          </div>
          {(saveFleetyards.error || syncFleetyards.error) && (
            <p className="mt-2 text-xs text-destructive">
              {((saveFleetyards.error ?? syncFleetyards.error) as Error).message}
            </p>
          )}
          {fyProfile?.fleetyards_last_error && !saveFleetyards.error && !syncFleetyards.error && (
            <p className="mt-2 text-xs text-destructive">
              Letzter Sync-Fehler: {fyProfile.fleetyards_last_error}
            </p>
          )}
        </div>

        <div className="mb-4 flex flex-col gap-3 md:flex-row">
          <Popover open={pickOpen} onOpenChange={setPickOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={pickOpen}
                className="flex flex-1 items-center justify-between border border-brand/20 bg-background/50 px-4 py-2 text-left text-sm hover:border-brand/50 focus:border-brand focus:outline-none"
              >
                <span className={cn("truncate", !selected && "text-muted-foreground")}>
                  {selected
                    ? `${selected.manufacturer ?? ""} — ${selected.name}`
                    : catalogLoading
                    ? "Lade Schiffe…"
                    : `— Schiff wählen (${ships.length}) —`}
                </span>
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
              <Command
                filter={(value, search) =>
                  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                }
              >
                <CommandInput placeholder="Schiff oder Hersteller suchen…" />
                <CommandList>
                  <CommandEmpty>Keine Treffer.</CommandEmpty>
                  <CommandGroup>
                    {ships.map((s) => {
                      const label = `${s.manufacturer ?? ""} — ${s.name}`;
                      return (
                        <CommandItem
                          key={s.slug}
                          value={`${label} ${s.slug}`}
                          onSelect={() => {
                            setPick(s.slug);
                            setPickOpen(false);
                          }}
                        >
                          <Check
                            className={cn(
                              "mr-2 h-4 w-4",
                              pick === s.slug ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <span className="truncate">{label}</span>
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <input placeholder="Eigener Name (optional)" value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1 border border-brand/20 bg-background/50 px-4 py-2 focus:border-brand focus:outline-none" />
          <button onClick={() => addShip.mutate()} disabled={!pick || addShip.isPending} className="px-5 py-2 border border-brand bg-brand text-primary-foreground text-[10px] uppercase tracking-[0.3em] hover:bg-brand/80 disabled:opacity-50">+ Hinzufügen</button>
        </div>
        {addShip.error && <p className="mb-3 text-xs text-destructive">{(addShip.error as Error).message}</p>}
        <div className="space-y-2">
          {data?.ships.length === 0 && <p className="text-sm text-muted-foreground">Noch keine Schiffe in deinem Hangar.</p>}
          {data?.ships.map((s) => (
            <div key={s.id} className="flex items-center justify-between border border-brand/10 px-4 py-3">
              <div>
                <div className="text-sm">
                  {s.ship_name}
                  {s.custom_name ? ` · "${s.custom_name}"` : ""}
                  {(s as { source?: string }).source === "fleetyards" && (
                    <span className="ml-2 border border-brand/30 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-brand">
                      Fleetyards
                    </span>
                  )}
                </div>
                <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">{s.manufacturer}</div>
              </div>
              {(s as { source?: string }).source !== "fleetyards" && (
                <button onClick={() => removeShip.mutate(s.id)} className="text-xs text-destructive hover:underline">
                  Entfernen
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function NotificationSettings() {
  const qc = useQueryClient();
  const list = useServerFn(listNotificationPreferences);
  const setPref = useServerFn(setNotificationPreference);
  const q = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => list(),
  });
  const mut = useMutation({
    mutationFn: (v: { kind: string; enabled: boolean }) =>
      setPref({ data: v }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["notification-preferences"] }),
  });
  const prefs = q.data?.prefs ?? [];
  const map = new Map(prefs.map((p) => [p.kind, p.enabled]));
  return (
    <div className="mt-8 border border-brand/20 bg-card/40 p-6">
      <h2 className="mb-1 font-display text-lg">// benachrichtigungen</h2>
      <p className="mb-4 text-xs text-muted-foreground">
        Steuere, welche Ereignisse eine Glocken-Benachrichtigung auslösen.
      </p>
      {q.isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : (
        <ul className="divide-y divide-white/5">
          {NOTIFICATION_KINDS.map((k) => {
            const enabled = map.get(k.kind) ?? true;
            return (
              <li
                key={k.kind}
                className="flex items-start justify-between gap-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground">{k.label}</div>
                  <div className="text-xs text-muted-foreground">
                    {k.description}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  disabled={mut.isPending}
                  onClick={() =>
                    mut.mutate({ kind: k.kind, enabled: !enabled })
                  }
                  className={cn(
                    "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-white/10 transition",
                    enabled ? "bg-brand" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-4 w-4 transform rounded-full bg-background transition",
                      enabled ? "translate-x-6" : "translate-x-1",
                    )}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}