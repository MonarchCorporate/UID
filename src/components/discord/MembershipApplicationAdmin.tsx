import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ClipboardList, Plus, Save, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { SectionHeader } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getApplicationAdminState,
  saveApplicationSettings,
  upsertApplicationField,
  deleteApplicationField,
  reorderApplicationFields,
  setApplicationStatus,
} from "@/lib/membership-apply.functions";

const TYPE_LABEL: Record<string, string> = {
  text: "Kurztext",
  textarea: "Langtext",
  select: "Auswahl",
  boolean: "Ja/Nein",
  number: "Zahl",
};

const STATUS_LABEL: Record<string, string> = {
  open: "Offen",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
};

type FieldValue = {
  id: string;
  field_key: string;
  label: string;
  help: string | null;
  placeholder: string | null;
  field_type: "text" | "textarea" | "select" | "boolean" | "number";
  required: boolean;
  options: string[];
  sort_order: number;
  active: boolean;
};

type FieldInput = Omit<FieldValue, "id"> & { id?: string };

function hexOf(n: number) {
  return `#${(n || 0).toString(16).padStart(6, "0")}`;
}

/** App-Admin: Bewerbungsformular konfigurieren und Eingänge bearbeiten. */
export function MembershipApplicationAdmin() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getApplicationAdminState);
  const saveSettingsFn = useServerFn(saveApplicationSettings);
  const upsertFieldFn = useServerFn(upsertApplicationField);
  const deleteFieldFn = useServerFn(deleteApplicationField);
  const reorderFn = useServerFn(reorderApplicationFields);
  const statusFn = useServerFn(setApplicationStatus);

  const { data, isLoading } = useQuery({
    queryKey: ["membership-apply-admin"],
    queryFn: () => stateFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["membership-apply-admin"] });

  const [settings, setSettings] = useState<{
    enabled: boolean;
    channel_id: string | null;
    channel_name: string | null;
    embed_title: string;
    embed_color: number;
    ping_role_id: string | null;
    intro_text: string;
    success_text: string;
  } | null>(null);

  useEffect(() => {
    if (data?.settings && !settings) {
      const s = data.settings;
      setSettings({
        enabled: s.enabled,
        channel_id: s.channel_id,
        channel_name: s.channel_name,
        embed_title: s.embed_title,
        embed_color: s.embed_color,
        ping_role_id: s.ping_role_id,
        intro_text: s.intro_text,
        success_text: s.success_text,
      });
    }
  }, [data, settings]);

  const saveSettingsM = useMutation({
    mutationFn: () => saveSettingsFn({ data: settings! }),
    onSuccess: () => {
      toast.success("Einstellungen gespeichert.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const fieldM = useMutation({
    mutationFn: (v: FieldInput) => upsertFieldFn({ data: v }),
    onSuccess: () => {
      toast.success("Feld gespeichert.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFieldFn({ data: { id } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const reorderM = useMutation({
    mutationFn: (order: { id: string; sort_order: number }[]) => reorderFn({ data: { order } }),
    onSuccess: () => invalidate(),
    onError: (e: Error) => toast.error(e.message),
  });

  const statusM = useMutation({
    mutationFn: (v: { id: string; status: "open" | "accepted" | "rejected"; review_note: string | null }) =>
      statusFn({ data: v }),
    onSuccess: (r) => {
      if (r.postError) toast.warning(`Status gesetzt, Discord: ${r.postError}`);
      else toast.success("Status aktualisiert.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [newField, setNewField] = useState({
    field_key: "",
    label: "",
    field_type: "text" as "text" | "textarea" | "select" | "boolean" | "number",
    required: false,
    options: "",
  });
  const [openApp, setOpenApp] = useState<string | null>(null);

  const fields = useMemo(() => (data?.fields ?? []) as FieldValue[], [data]);

  if (isLoading || !settings) {
    return <p className="text-sm text-muted-foreground">Bewerbungs-Einstellungen werden geladen…</p>;
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = [...fields];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    reorderM.mutate(next.map((f, i) => ({ id: f.id, sort_order: i + 1 })));
  };

  return (
    <section className="space-y-6">
      <SectionHeader
        icon={ClipboardList}
        title="Bewerbungsformular"
        subtitle="Felder, Texte und Ziel-Channel für Mitgliedschaftsanfragen."
      />

      {data?.channelError && (
        <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Channels konnten nicht geladen werden: {data.channelError}
        </p>
      )}

      {/* Einstellungen */}
      <div className="grid gap-4 rounded-xl border border-brand/15 bg-card/40 p-4 sm:grid-cols-2">
        <div className="flex items-center justify-between sm:col-span-2">
          <div>
            <Label>Bewerbungen aktiv</Label>
            <p className="text-xs text-muted-foreground">Formular für Nutzer freigeben.</p>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(v) => setSettings({ ...settings, enabled: v })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Ziel-Channel</Label>
          <Select
            value={settings.channel_id ?? ""}
            onValueChange={(v) => {
              const c = (data?.channels ?? []).find((x) => x.id === v);
              setSettings({ ...settings, channel_id: v, channel_name: c?.name ?? null });
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Channel wählen" />
            </SelectTrigger>
            <SelectContent>
              {(data?.channels ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.parentName ? `${c.parentName} / ` : ""}#{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Rollen-Ping (Rollen-ID, optional)</Label>
          <Input
            value={settings.ping_role_id ?? ""}
            placeholder="z. B. 1234567890"
            onChange={(e) =>
              setSettings({ ...settings, ping_role_id: e.target.value.trim() || null })
            }
          />
        </div>

        <div className="space-y-1.5">
          <Label>Embed-Titel</Label>
          <Input
            value={settings.embed_title}
            onChange={(e) => setSettings({ ...settings, embed_title: e.target.value })}
          />
        </div>

        <div className="space-y-1.5">
          <Label>Embed-Farbe</Label>
          <Input
            type="color"
            value={hexOf(settings.embed_color)}
            onChange={(e) =>
              setSettings({ ...settings, embed_color: parseInt(e.target.value.slice(1), 16) })
            }
            className="h-10 w-24 p-1"
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Einleitungstext auf der Bewerbungsseite</Label>
          <Textarea
            rows={3}
            value={settings.intro_text}
            onChange={(e) => setSettings({ ...settings, intro_text: e.target.value })}
          />
        </div>

        <div className="space-y-1.5 sm:col-span-2">
          <Label>Bestätigungstext nach dem Absenden</Label>
          <Textarea
            rows={2}
            value={settings.success_text}
            onChange={(e) => setSettings({ ...settings, success_text: e.target.value })}
          />
        </div>

        <div className="sm:col-span-2">
          <Button onClick={() => saveSettingsM.mutate()} disabled={saveSettingsM.isPending}>
            <Save className="mr-2 h-4 w-4" /> Speichern
          </Button>
        </div>
      </div>

      {/* Felder */}
      <div className="space-y-3 rounded-xl border border-brand/15 bg-card/40 p-4">
        <h3 className="font-display text-sm tracking-tight">Formularfelder</h3>
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground">Noch keine Felder angelegt.</p>
        )}
        <div className="space-y-2">
          {fields.map((f, i) => (
            <FieldRow
              key={f.id}
              field={f}
              onSave={(v) => fieldM.mutate(v)}
              onDelete={() => deleteM.mutate(f.id)}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
            />
          ))}
        </div>

        <div className="grid gap-2 rounded-lg border border-dashed border-brand/25 p-3 sm:grid-cols-5">
          <Input
            placeholder="Schlüssel (z. B. motivation)"
            value={newField.field_key}
            onChange={(e) => setNewField({ ...newField, field_key: e.target.value })}
          />
          <Input
            placeholder="Beschriftung"
            value={newField.label}
            onChange={(e) => setNewField({ ...newField, label: e.target.value })}
          />
          <Select
            value={newField.field_type}
            onValueChange={(v) => setNewField({ ...newField, field_type: v as typeof newField.field_type })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(TYPE_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>
                  {v}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Optionen (Komma)"
            value={newField.options}
            onChange={(e) => setNewField({ ...newField, options: e.target.value })}
          />
          <Button
            variant="secondary"
            onClick={() => {
              if (!newField.field_key || !newField.label) {
                toast.error("Schlüssel und Beschriftung sind nötig.");
                return;
              }
              fieldM.mutate({
                field_key: newField.field_key.trim().toLowerCase(),
                label: newField.label.trim(),
                help: null,
                placeholder: null,
                field_type: newField.field_type,
                required: newField.required,
                options: newField.options
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean),
                sort_order: fields.length + 1,
                active: true,
              });
              setNewField({ field_key: "", label: "", field_type: "text", required: false, options: "" });
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Feld
          </Button>
        </div>
      </div>

      {/* Bewerbungen */}
      <div className="space-y-2 rounded-xl border border-brand/15 bg-card/40 p-4">
        <h3 className="font-display text-sm tracking-tight">Bewerbungen</h3>
        {(data?.applications ?? []).length === 0 && (
          <p className="text-xs text-muted-foreground">Noch keine Bewerbungen eingegangen.</p>
        )}
        {(data?.applications ?? []).map((a) => (
          <div key={a.id} className="rounded-lg border border-brand/10 bg-background/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="text-sm font-medium hover:underline"
                onClick={() => setOpenApp(openApp === a.id ? null : a.id)}
              >
                {a.rsi_handle || a.callsign || "Unbekannt"}
              </button>
              <span className="text-xs text-muted-foreground">
                {new Date(a.created_at as string).toLocaleString("de-DE")}
              </span>
              <span className="rounded-md border border-brand/20 px-2 py-0.5 text-[11px]">
                {STATUS_LABEL[a.status as string]}
              </span>
              <div className="ml-auto flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => statusM.mutate({ id: a.id, status: "accepted", review_note: a.review_note ?? null })}
                >
                  Annehmen
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => statusM.mutate({ id: a.id, status: "rejected", review_note: a.review_note ?? null })}
                >
                  Ablehnen
                </Button>
              </div>
            </div>
            {openApp === a.id && (
              <dl className="mt-3 space-y-2 text-xs">
                {Object.entries((a.answers ?? {}) as Record<string, string>).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">
                      {fields.find((f) => f.field_key === k)?.label ?? k}
                    </dt>
                    <dd className="whitespace-pre-wrap">{v || "—"}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function FieldRow({
  field,
  onSave,
  onDelete,
  onUp,
  onDown,
}: {
  field: FieldValue;
  onSave: (v: FieldValue) => void;
  onDelete: () => void;
  onUp: () => void;
  onDown: () => void;
}) {
  const [v, setV] = useState<FieldValue>(field);
  useEffect(() => setV(field), [field]);

  return (
    <div className="grid gap-2 rounded-lg border border-brand/10 bg-background/40 p-3 sm:grid-cols-[1fr_1fr_auto_auto_auto]">
      <Input value={v.label} onChange={(e) => setV({ ...v, label: e.target.value })} />
      <Input
        value={v.help ?? ""}
        placeholder="Hilfetext"
        onChange={(e) => setV({ ...v, help: e.target.value || null })}
      />
      <div className="flex items-center gap-2 text-xs">
        <Switch checked={v.required} onCheckedChange={(c) => setV({ ...v, required: c })} />
        Pflicht
      </div>
      <div className="flex items-center gap-2 text-xs">
        <Switch checked={v.active} onCheckedChange={(c) => setV({ ...v, active: c })} />
        Aktiv
      </div>
      <div className="flex items-center gap-1">
        <Button size="icon" variant="ghost" onClick={onUp} aria-label="Nach oben">
          <ArrowUp className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDown} aria-label="Nach unten">
          <ArrowDown className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={() => onSave(v)} aria-label="Speichern">
          <Save className="h-4 w-4" />
        </Button>
        <Button size="icon" variant="ghost" onClick={onDelete} aria-label="Löschen">
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
      <p className="text-[11px] text-muted-foreground sm:col-span-5">
        {v.field_key} · {TYPE_LABEL[v.field_type]}
        {v.options.length > 0 ? ` · ${v.options.join(", ")}` : ""}
      </p>
    </div>
  );
}
