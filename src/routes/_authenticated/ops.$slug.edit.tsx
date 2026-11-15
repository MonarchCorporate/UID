import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { getMissionForEdit, updateMission } from "@/lib/missions.functions";
import { listCategories } from "@/lib/categories.functions";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { RichTextEditor } from "@/components/ui/rich-text";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/ops/$slug/edit")({
  component: EditOp,
});

function EditOp() {
  const { slug } = useParams({ from: "/_authenticated/ops/$slug/edit" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const loadFn = useServerFn(getMissionForEdit);
  const catFn = useServerFn(listCategories);
  const updateFn = useServerFn(updateMission);

  const missionQ = useQuery({
    queryKey: ["mission-edit", slug],
    queryFn: () => loadFn({ data: { slug } }),
  });
  const catsQ = useQuery({ queryKey: ["mission-categories"], queryFn: () => catFn() });

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"password" | "public" | "internal" | "hidden">("password");
  const isHidden = visibility === "hidden";
  const isPublic = visibility === "public" || visibility === "internal";
  const isInternal = visibility === "internal";
  const [changePassword, setChangePassword] = useState(false);
  const [password, setPassword] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [showInCalendar, setShowInCalendar] = useState(true);
  const [showParticipantCount, setShowParticipantCount] = useState(true);
  const [startDate, setStartDate] = useState<Date | undefined>(undefined);
  const [startTime, setStartTime] = useState("20:00");

  useEffect(() => {
    const m = missionQ.data;
    if (!m) return;
    setTitle(m.title);
    setDescription(m.description);
    setVisibility(
      m.is_hidden ? "hidden" : m.is_internal ? "internal" : m.is_public ? "public" : "password",
    );
    setCategoryId(m.category_id ?? "");
    setShowInCalendar(m.show_in_calendar);
    setShowParticipantCount(m.show_participant_count);
    if (m.starts_at) {
      const d = new Date(m.starts_at);
      setStartDate(d);
      setStartTime(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
    } else {
      setStartDate(undefined);
    }
  }, [missionQ.data]);

  const mut = useMutation({
    mutationFn: async () => {
      if (!missionQ.data) throw new Error("Einsatz nicht geladen");
      let starts_at: string | null = null;
      if (startDate) {
        const [h, mm] = startTime.split(":").map((n) => parseInt(n, 10) || 0);
        const d = new Date(startDate);
        d.setHours(h, mm, 0, 0);
        starts_at = d.toISOString();
      }
      let passwordUpdate: string | null | undefined = undefined;
      if (isPublic || isHidden) passwordUpdate = null;
      else if (changePassword) passwordUpdate = password;
      return updateFn({
        data: {
          mission_id: missionQ.data.id,
          title,
          description,
          starts_at,
          category_id: categoryId || null,
          show_in_calendar: isPublic ? showInCalendar : false,
          is_internal: isInternal,
          is_hidden: isHidden,
          show_participant_count: showParticipantCount,
          password: passwordUpdate,
        },
      });
    },
    onSuccess: () => {
      toast.success("Einsatz aktualisiert");
      qc.invalidateQueries({ queryKey: ["mission", slug] });
      qc.invalidateQueries({ queryKey: ["mission-edit", slug] });
      qc.invalidateQueries({ queryKey: ["my-missions"] });
      navigate({ to: "/ops/$slug", params: { slug } });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  if (missionQ.isLoading) {
    return <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>;
  }
  if (missionQ.error) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <p className="text-sm text-destructive">{(missionQ.error as Error).message}</p>
        <Link to="/ops/mine" className="mt-4 inline-block font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          ← Meine Einsätze
        </Link>
      </div>
    );
  }

  return (
    <section className="mx-auto max-w-2xl px-6">
      <Link
        to="/ops/$slug"
        params={{ slug }}
        className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-3 w-3" /> Zurück
      </Link>
      <div className="mb-6 inline-block p-1 border border-brand/30">
        <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
          // Mission bearbeiten
        </div>
      </div>
      <h1 className="mb-8 font-display text-4xl tracking-tight">Einsatz bearbeiten</h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          mut.mutate();
        }}
        className="space-y-5"
      >
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Titel</label>
          <input required value={title} onChange={(e) => setTitle(e.target.value)} className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none" />
        </div>
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Beschreibung</label>
          <RichTextEditor value={description} onChange={setDescription} placeholder="Ablauf, Treffpunkt, Ausrüstung …" />
        </div>
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Kategorie</label>
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
        </div>
        <div>
          <label className="block mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">Start</label>
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
        <div className="space-y-3 border-t border-brand/10 pt-4">
          <div>
            <label className="mb-2 block font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Sichtbarkeit
            </label>
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
              <option value="hidden">Unsichtbar — nicht veröffentlicht</option>
            </select>
            {isHidden && (
              <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                // unsichtbar – erscheint in keinem Kalender und keiner Liste, bis du die Sichtbarkeit änderst
              </p>
            )}
          </div>
          {!isPublic && !isHidden && (
            <>
              <label className="flex items-center justify-between gap-4">
                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  Passwort ändern
                </span>
                <Switch checked={changePassword} onCheckedChange={setChangePassword} />
              </label>
              {changePassword && (
                <input
                  type="text"
                  minLength={3}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Neues Passwort"
                  className="w-full border border-brand/20 bg-background/50 px-4 py-3 focus:border-brand focus:outline-none"
                />
              )}
            </>
          )}
          <label className={cn("flex items-center justify-between gap-4", !isPublic && "opacity-40")}>
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              {isInternal ? "Im internen Einsatzkalender anzeigen" : "Im öffentlichen Kalender anzeigen"}
            </span>
            <Switch checked={isPublic && showInCalendar} disabled={!isPublic} onCheckedChange={setShowInCalendar} />
          </label>
          <label className="flex items-center justify-between gap-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              Teilnehmerzahl im Kalender zeigen
            </span>
            <Switch checked={showParticipantCount} onCheckedChange={setShowParticipantCount} />
          </label>
        </div>
        <button
          disabled={mut.isPending}
          className="w-full border border-brand bg-brand py-3 text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/80 disabled:opacity-50"
        >
          {mut.isPending ? "Speichere…" : "Änderungen speichern →"}
        </button>
      </form>
    </section>
  );
}
