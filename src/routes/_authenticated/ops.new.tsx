import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { createMission } from "@/lib/missions.functions";
import { listCategories } from "@/lib/categories.functions";
import { getOrgDiscordState, postOrgMissionAnnouncement } from "@/lib/discord.functions";
import { useQuery } from "@tanstack/react-query";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";
import { useBranding } from "@/components/branding/BrandingProvider";

export const Route = createFileRoute("/_authenticated/ops/new")({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: s.mode === "instant" ? ("instant" as const) : ("planned" as const),
  }),
  component: NewOp,
});

function NewOp() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const fn = useServerFn(createMission);
  const catFn = useServerFn(listCategories);
  const discordStateFn = useServerFn(getOrgDiscordState);
  const announceFn = useServerFn(postOrgMissionAnnouncement);
  const branding = useBranding();
  const catsQ = useQuery({ queryKey: ["mission-categories"], queryFn: () => catFn() });
  const [mode, setMode] = useState<"instant" | "planned">(search.mode);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [password, setPassword] = useState("");
  const [visibility, setVisibility] = useState<"password" | "public" | "internal" | "hidden">("password");
  const isHidden = visibility === "hidden";
  const isPublic = visibility === "public" || visibility === "internal";
  const isInternal = visibility === "internal";
  const [categoryId, setCategoryId] = useState<string>("");
  const [showInCalendar, setShowInCalendar] = useState(true);
  const [showParticipantCount, setShowParticipantCount] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("20:00");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // --- Discord posting ---
  const orgId = branding.org?.id ?? null;
  const [postToDiscord, setPostToDiscord] = useState(false);
  const [channelId, setChannelId] = useState("");
  const [mention, setMention] = useState<"none" | "here" | "everyone" | "role">("none");
  const [mentionRoleId, setMentionRoleId] = useState("");
  const discordQ = useQuery({
    queryKey: ["org-discord", orgId],
    queryFn: () => discordStateFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
    retry: false,
  });
  const channels = discordQ.data?.channels ?? [];
  const roles = discordQ.data?.roles ?? [];
  const channel = channels.find((c) => c.channel_id === channelId) ?? null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      let starts_at: string | null = null;
      if (mode === "planned" && startDate) {
        const [h, m] = startTime.split(":").map((n) => parseInt(n, 10) || 0);
        const d = new Date(startDate);
        d.setHours(h, m, 0, 0);
        starts_at = d.toISOString();
      }
      const m = await fn({
        data: {
          title,
          description,
          password: isPublic || isHidden ? null : password,
          starts_at,
          category_id: categoryId || null,
          show_in_calendar: mode === "planned" && isPublic ? showInCalendar : false,
          show_participant_count: showParticipantCount,
          is_internal: isInternal,
          is_hidden: isHidden,
          org_id: branding.org?.id ?? null,
          mode,
        },
      });
      if (postToDiscord && orgId && channelId) {
        try {
          await announceFn({
            data: {
              org_id: orgId,
              channel_id: channelId,
              mission_id: m.id,
              note: null,
              password: isPublic || isHidden ? null : password.trim() || null,
              mention,
              mention_role_id: mention === "role" ? mentionRoleId : null,
            },
          });
        } catch (e) {
          setErr(
            "Einsatz angelegt, aber Discord-Post fehlgeschlagen: " +
              (e instanceof Error ? e.message : String(e)),
          );
          setLoading(false);
          return;
        }
      }
      navigate({ to: "/ops/$slug", params: { slug: m.slug } });
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mx-auto max-w-2xl px-6">
      <div className="mb-6 inline-block p-1 border border-brand/30">
        <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          // Mission Briefing
        </div>
      </div>
      <h1 className="mb-8 font-display text-4xl tracking-tight">Neuer Einsatz</h1>
      <div className="mb-8 grid gap-3 sm:grid-cols-2">
        <ModeCard
          active={mode === "instant"}
          onClick={() => setMode("instant")}
          title="Jetzt starten"
          desc="Sofort-Einsatz — läuft direkt, Crew kann beitreten und der Boardcomputer steht pro Schiff bereit."
        />
        <ModeCard
          active={mode === "planned"}
          onClick={() => setMode("planned")}
          title="Event planen"
          desc="Mit Termin — Lobby zum Eintragen, Start später per Knopfdruck, optional im Kalender."
        />
      </div>
      <form onSubmit={submit} className="space-y-5">
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Titel</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Beschreibung</label>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            placeholder="Ablauf, Treffpunkt, Ausrüstung …"
          />
        </div>
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Kategorie (optional)</label>
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none"
          >
            <option value="">— keine Kategorie —</option>
            {(catsQ.data?.categories ?? []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          {categoryId && (
            <div className="mt-2 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              <span
                className="inline-block h-3 w-3 rounded-sm"
                style={{ backgroundColor: catsQ.data?.categories.find((c) => c.id === categoryId)?.color }}
              />
              Farbe im Kalender
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {mode === "planned" && (
          <div>
            <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Start (optional)</label>
            <div className="flex gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex flex-1 items-center gap-2 border border-brand/20 bg-background/50 px-4 py-3 text-left focus:border-brand focus:outline-none",
                      !startDate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4" />
                    {startDate ? format(startDate, "PP", { locale: de }) : "Datum wählen"}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={setStartDate}
                    initialFocus
                    locale={de}
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                disabled={!startDate}
                className="w-28 border border-brand/20 bg-background/50 px-3 py-3 focus:border-brand focus:outline-none disabled:opacity-50"
              />
              {startDate && (
                <button
                  type="button"
                  onClick={() => setStartDate(undefined)}
                  className="border border-brand/20 px-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground hover:text-brand"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
          )}
          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Sichtbarkeit</label>
            <select
              value={visibility}
              onChange={(e) =>
                setVisibility(e.target.value as "password" | "public" | "internal" | "hidden")
              }
              className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none"
            >
              <option value="password">Mit Passwort — nur wer Link + Passwort hat</option>
              <option value="public">Öffentlich — jeder mit dem Link</option>
              <option value="internal">Intern — nur Orga-Mitglieder</option>
              <option value="hidden">Unsichtbar — nur du, später veröffentlichbar</option>
            </select>
            {visibility === "password" && (
              <input
                required
                minLength={3}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Einsatz-Passwort"
                className="mt-2 w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none"
              />
            )}
          </div>
        </div>
        <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {isHidden
            ? "// unsichtbar – der Einsatz taucht in keinem Kalender und keiner Liste auf, bis du die Sichtbarkeit änderst"
            : isInternal
            ? "// intern – nur Mitglieder deiner Orga sehen den Einsatz im internen Kalender und treten ohne Passwort bei"
            : isPublic
              ? "// öffentlich – jeder mit dem Link kann beitreten"
              : "// Teilnehmer brauchen den Einsatz-Link + dieses Passwort"}
        </p>
        <div className="space-y-3 border-t border-brand/10 pt-4">
          {mode === "planned" && (
          <label className={cn("flex items-center justify-between gap-4", !isPublic && "opacity-40")}>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              {isInternal ? "Im internen Einsatzkalender anzeigen" : "Im öffentlichen Kalender anzeigen"}
            </span>
            <Switch
              checked={isPublic && showInCalendar}
              disabled={!isPublic}
              onCheckedChange={setShowInCalendar}
            />
          </label>
          )}
          <label className="flex items-center justify-between gap-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Teilnehmerzahl im Kalender zeigen
            </span>
            <Switch checked={showParticipantCount} onCheckedChange={setShowParticipantCount} />
          </label>
        </div>
        {channels.length > 0 && (
          <div className="space-y-3 border-t border-brand/10 pt-4">
            <label className="flex items-center justify-between gap-4">
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                Im Discord posten
              </span>
              <Switch checked={postToDiscord} onCheckedChange={setPostToDiscord} />
            </label>
            {postToDiscord && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                      Channel
                    </label>
                    <select
                      value={channelId}
                      onChange={(e) => {
                        setChannelId(e.target.value);
                        setMention("none");
                      }}
                      className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none"
                    >
                      <option value="">— Channel wählen —</option>
                      {channels.map((c) => (
                        <option key={c.channel_id} value={c.channel_id}>
                          #{c.channel_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
                      Erwähnung
                    </label>
                    <select
                      value={mention}
                      onChange={(e) => setMention(e.target.value as typeof mention)}
                      disabled={!channel}
                      className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none disabled:opacity-50"
                    >
                      <option value="none">Keine</option>
                      {channel?.allow_here && <option value="here">@here</option>}
                      {channel?.allow_mentions && <option value="everyone">@everyone</option>}
                      {channel?.allow_role_mentions && roles.length > 0 && (
                        <option value="role">Orga-Rolle</option>
                      )}
                    </select>
                    {mention === "role" && (
                      <select
                        value={mentionRoleId}
                        onChange={(e) => setMentionRoleId(e.target.value)}
                        className="mt-2 w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none"
                      >
                        <option value="">— Rolle wählen —</option>
                        {roles.map((r) => (
                          <option key={r.discord_role_id} value={r.discord_role_id}>
                            @{r.discord_role_name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  // eingebettete nachricht mit titel, beschreibung, kategorie und startzeit
                </p>
              </>
            )}
          </div>
        )}
        {err && <p className="text-xs text-destructive">{err}</p>}
        <button disabled={loading || (postToDiscord && (!channelId || (mention === "role" && !mentionRoleId)))} className="w-full border border-brand bg-brand py-3 text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/80 disabled:opacity-50">
          {loading ? "…" : mode === "instant" ? "Einsatz jetzt starten →" : "Event anlegen →"}
        </button>
      </form>
    </section>
  );
}

function ModeCard({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-2xl border p-4 text-left transition",
        active ? "border-brand bg-brand/10" : "border-white/10 bg-card/30 hover:border-brand/40",
      )}
    >
      <div className="font-display text-lg tracking-tight">{title}</div>
      <div className="mt-1 text-xs text-muted-foreground">{desc}</div>
    </button>
  );
}