import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Copy,
  FolderPlus,
  Hash,
  Volume2,
  Trash2,
  Plus,
  Lock,
  Globe,
  Wand2,
} from "lucide-react";
import { SectionHeader } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  getDiscordTemplateState,
  saveDiscordCategoryTemplate,
  updateDiscordCategoryTemplate,
  deleteDiscordCategoryTemplate,
  applyDiscordCategoryTemplate,
  type CategoryTemplate,
  type TemplateChannel,
} from "@/lib/discord-templates.functions";

/**
 * App-Admin: Kategorie-Vorlagen aus bestehenden Discord-Kategorien kopieren,
 * pflegen und als neue Kategorie mit eigenem Namen und Rollenfreigabe einfügen.
 */
export function CategoryTemplateAdmin() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getDiscordTemplateState);
  const saveFn = useServerFn(saveDiscordCategoryTemplate);
  const updateFn = useServerFn(updateDiscordCategoryTemplate);
  const deleteFn = useServerFn(deleteDiscordCategoryTemplate);
  const applyFn = useServerFn(applyDiscordCategoryTemplate);

  const { data, isLoading } = useQuery({
    queryKey: ["discord-templates"],
    queryFn: () => stateFn(),
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["discord-templates"] });

  const [tplName, setTplName] = useState("");
  const [tplDesc, setTplDesc] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [editing, setEditing] = useState<CategoryTemplate | null>(null);
  const [applying, setApplying] = useState<CategoryTemplate | null>(null);

  const copyM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          name: tplName.trim(),
          description: tplDesc.trim() || undefined,
          source_category_id: sourceId,
        },
      }),
    onSuccess: (r) => {
      toast.success(`Vorlage gespeichert (${r.channels} Channels).`);
      setTplName("");
      setTplDesc("");
      setSourceId("");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Vorlage gelöscht.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={Copy}
        title="Kategorie-Vorlagen"
        subtitle="Bestehende Discord-Kategorien samt Channels kopieren und unter neuem Namen mit eigener Rollenfreigabe einfügen."
      />

      {data?.error && (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {data.error}
        </p>
      )}

      <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3">
        <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          Neue Vorlage aus Kategorie kopieren
        </p>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Quell-Kategorie</Label>
            <Select value={sourceId} onValueChange={setSourceId}>
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                {(data?.categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Name der Vorlage</Label>
            <Input
              value={tplName}
              onChange={(e) => setTplName(e.target.value)}
              placeholder="z.B. Orga-Standard"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Beschreibung (optional)</Label>
            <Input
              value={tplDesc}
              onChange={(e) => setTplDesc(e.target.value)}
              placeholder="Wofür ist die Vorlage?"
            />
          </div>
        </div>
        <Button
          onClick={() => copyM.mutate()}
          disabled={!sourceId || tplName.trim().length < 2 || copyM.isPending}
        >
          <Copy className="mr-2 h-4 w-4" />
          Vorlage speichern
        </Button>
      </div>

      <div className="space-y-2">
        {isLoading && <p className="text-sm text-muted-foreground">Lade Vorlagen…</p>}
        {!isLoading && (data?.templates.length ?? 0) === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Vorlagen angelegt.</p>
        )}
        {(data?.templates ?? []).map((t) => (
          <div
            key={t.id}
            className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.description || t.source_category_name || "—"} · {t.channels.length} Channels
                </p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setApplying(t)}>
                  <Wand2 className="mr-2 h-4 w-4" />
                  Einfügen
                </Button>
                <Button size="sm" variant="outline" onClick={() => setEditing(t)}>
                  Bearbeiten
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => deleteM.mutate(t.id)}
                  disabled={deleteM.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {t.channels.map((c, i) => (
                <Badge key={`${c.name}-${i}`} variant="secondary" className="gap-1 font-normal">
                  {c.kind === "voice" ? (
                    <Volume2 className="h-3 w-3" />
                  ) : (
                    <Hash className="h-3 w-3" />
                  )}
                  {c.name}
                  {c.visibility === "private" && <Lock className="h-3 w-3" />}
                </Badge>
              ))}
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <EditTemplateDialog
          template={editing}
          onClose={() => setEditing(null)}
          onSave={async (name, description, channels) => {
            await updateFn({ data: { id: editing.id, name, description, channels } });
            toast.success("Vorlage aktualisiert.");
            setEditing(null);
            invalidate();
          }}
        />
      )}

      {applying && (
        <ApplyTemplateDialog
          template={applying}
          roles={data?.roles ?? []}
          orgs={data?.orgs ?? []}
          onClose={() => setApplying(null)}
          onApply={async (input) => {
            const r = await applyFn({ data: { template_id: applying.id, ...input } });
            toast.success(`Kategorie angelegt (${r.channels} Channels).`);
            setApplying(null);
            invalidate();
          }}
        />
      )}
    </section>
  );
}

function EditTemplateDialog({
  template,
  onClose,
  onSave,
}: {
  template: CategoryTemplate;
  onClose: () => void;
  onSave: (
    name: string,
    description: string | null,
    channels: TemplateChannel[],
  ) => Promise<void>;
}) {
  const [name, setName] = useState(template.name);
  const [desc, setDesc] = useState(template.description ?? "");
  const [channels, setChannels] = useState<TemplateChannel[]>(template.channels);
  const [busy, setBusy] = useState(false);

  const update = (i: number, patch: Partial<TemplateChannel>) =>
    setChannels((s) => s.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vorlage bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Beschreibung</Label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
          <div className="space-y-2 max-h-72 overflow-auto pr-1">
            {channels.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select
                  value={c.kind}
                  onValueChange={(v) => update(i, { kind: v as "text" | "voice" })}
                >
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="voice">Voice</SelectItem>
                  </SelectContent>
                </Select>
                <Input
                  value={c.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant={c.visibility === "private" ? "secondary" : "ghost"}
                  size="icon"
                  title={c.visibility === "private" ? "privat" : "öffentlich"}
                  onClick={() =>
                    update(i, {
                      visibility: c.visibility === "private" ? "public" : "private",
                    })
                  }
                >
                  {c.visibility === "private" ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setChannels((s) => s.filter((_, idx) => idx !== i))}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              setChannels((s) => [...s, { name: "neuer-channel", kind: "text", visibility: "public" }])
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Channel hinzufügen
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={busy || channels.length === 0 || name.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(name.trim(), desc.trim() || null, channels);
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ApplyTemplateDialog({
  template,
  roles,
  orgs,
  onClose,
  onApply,
}: {
  template: CategoryTemplate;
  roles: { id: string; name: string; color: number }[];
  orgs: { id: string; name: string; tag: string | null }[];
  onClose: () => void;
  onApply: (input: {
    category_name: string;
    visibility: "public" | "private";
    role_ids: string[];
    org_id?: string;
  }) => Promise<void>;
}) {
  const [categoryName, setCategoryName] = useState(template.name);
  const [isPrivate, setIsPrivate] = useState(false);
  const [roleIds, setRoleIds] = useState<string[]>([]);
  const [orgId, setOrgId] = useState("");
  const [busy, setBusy] = useState(false);

  const sortedRoles = useMemo(
    () => [...roles].sort((a, b) => a.name.localeCompare(b.name)),
    [roles],
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Vorlage „{template.name}" einfügen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs">Name der neuen Kategorie</Label>
            <Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} />
          </div>

          <div className="flex items-center gap-2">
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
            <span className="text-sm">
              Privat — nur ausgewählte Rollen sehen die Kategorie
            </span>
          </div>

          {isPrivate && (
            <div className="max-h-52 space-y-1 overflow-auto rounded-lg border border-border/60 p-2">
              {sortedRoles.map((r) => (
                <label key={r.id} className="flex items-center gap-2 px-1 py-1 text-sm">
                  <Checkbox
                    checked={roleIds.includes(r.id)}
                    onCheckedChange={(v) =>
                      setRoleIds((s) => (v ? [...s, r.id] : s.filter((x) => x !== r.id)))
                    }
                  />
                  <span className="truncate">@{r.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Direkt einer Orga freigeben (optional)</Label>
            <Select value={orgId} onValueChange={setOrgId}>
              <SelectTrigger>
                <SelectValue placeholder="Keine Freigabe" />
              </SelectTrigger>
              <SelectContent>
                {orgs.map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.tag ? ` [${o.tag}]` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <p className="text-xs text-muted-foreground">
            Es werden {template.channels.length} Channels in der neuen Kategorie angelegt.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={
              busy || categoryName.trim().length < 2 || (isPrivate && roleIds.length === 0)
            }
            onClick={async () => {
              setBusy(true);
              try {
                await onApply({
                  category_name: categoryName.trim(),
                  visibility: isPrivate ? "private" : "public",
                  role_ids: isPrivate ? roleIds : [],
                  ...(orgId ? { org_id: orgId } : {}),
                });
              } catch (e) {
                toast.error(e instanceof Error ? e.message : String(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            <FolderPlus className="mr-2 h-4 w-4" />
            Kategorie anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
