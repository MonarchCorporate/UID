import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { FolderCog, Save, Trash2 } from "lucide-react";
import { SectionHeader } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDiscordCategoryState,
  setOrgDiscordCategories,
  deleteDiscordCategory,
} from "@/lib/discord.functions";

type Draft = Record<
  string,
  {
    selected: boolean;
    canCreate: boolean;
    canRename: boolean;
    canDelete: boolean;
    maxChannels: number;
  }
>;

/**
 * App-Admin-Bereich: legt fest, in welchen Discord-Kategorien eine Orga
 * mit dem Bot eigene Channels anlegen und verwalten darf.
 */
export function OrgCategoryAdmin() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getDiscordCategoryState);
  const saveFn = useServerFn(setOrgDiscordCategories);
  const deleteCatFn = useServerFn(deleteDiscordCategory);

  const { data, isLoading } = useQuery({
    queryKey: ["discord-categories"],
    queryFn: () => stateFn(),
  });

  const [orgId, setOrgId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const current: Draft = useMemo(() => {
    const base: Draft = {};
    for (const c of data?.categories ?? []) {
      const r = (data?.releases ?? []).find(
        (x) => x.org_id === orgId && x.category_id === c.id,
      );
      base[c.id] = {
        selected: !!r,
        canCreate: r?.can_create ?? true,
        canRename: r?.can_rename ?? true,
        canDelete: r?.can_delete ?? false,
        maxChannels: r?.max_channels ?? 10,
      };
    }
    return base;
  }, [data, orgId]);

  const value = draft ?? current;

  const set = (id: string, patch: Partial<Draft[string]>) =>
    setDraft({ ...value, [id]: { ...value[id], ...patch } });

  const saveM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          org_id: orgId,
          categories: (data?.categories ?? [])
            .filter((c) => value[c.id]?.selected)
            .map((c) => ({
              category_id: c.id,
              category_name: c.name,
              can_create: !!value[c.id]?.canCreate,
              can_rename: !!value[c.id]?.canRename,
              can_delete: !!value[c.id]?.canDelete,
              max_channels: Math.max(0, Math.min(200, value[c.id]?.maxChannels ?? 10)),
            })),
        },
      }),
    onSuccess: () => {
      setDraft(null);
      toast.success("Kategorie-Freigaben gespeichert.");
      qc.invalidateQueries({ queryKey: ["discord-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const countFor = (id: string) =>
    (data?.releases ?? []).filter((r) => r.org_id === id).length;

  const deleteM = useMutation({
    mutationFn: (categoryId: string) => deleteCatFn({ data: { category_id: categoryId } }),
    onSuccess: (res) => {
      setConfirmId(null);
      setDraft(null);
      toast.success(`Kategorie „${res.name}" inkl. ${res.deleted} Channel gelöscht.`);
      qc.invalidateQueries({ queryKey: ["discord-categories"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={FolderCog}
        title="Kategorie-Freigaben"
        subtitle="Bestimmt, in welchen Kategorien eine Orga eigene Channels anlegen und verwalten darf."
      />

      {data?.error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {data.error}
        </p>
      )}

      <div className="space-y-4 rounded-2xl border border-brand/15 bg-card/40 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Select
              value={orgId}
              onValueChange={(v) => {
                setOrgId(v);
                setDraft(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Organisation wählen" />
              </SelectTrigger>
              <SelectContent>
                {(data?.orgs ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.tag ? ` [${o.tag}]` : ""} · {countFor(o.id)} Kategorie
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => saveM.mutate()} disabled={!orgId || saveM.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveM.isPending ? "Speichere…" : "Freigaben speichern"}
          </Button>
        </div>

        {isLoading && <p className="font-mono text-xs text-muted-foreground">// lade…</p>}

        {orgId && (
          <div className="max-h-[420px] space-y-1 overflow-auto rounded-xl border border-brand/10 p-2">
            {(data?.categories ?? []).map((c) => (
              <div
                key={c.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-brand/5"
              >
                <label className="flex min-w-0 items-center gap-3">
                  <Checkbox
                    checked={!!value[c.id]?.selected}
                    onCheckedChange={(v) => set(c.id, { selected: !!v })}
                  />
                  <span className="truncate text-sm uppercase tracking-wide">{c.name}</span>
                </label>
                <div className="flex shrink-0 flex-wrap items-center gap-4">
                  {(
                    [
                      ["Anlegen", "canCreate"],
                      ["Umbenennen", "canRename"],
                      ["Löschen", "canDelete"],
                    ] as const
                  ).map(([label, key]) => (
                    <div key={key} className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                        {label}
                      </span>
                      <Switch
                        checked={!!value[c.id]?.[key]}
                        disabled={!value[c.id]?.selected}
                        onCheckedChange={(v) => set(c.id, { [key]: v })}
                      />
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Limit
                    </span>
                    <Input
                      type="number"
                      min={0}
                      max={200}
                      className="h-8 w-20"
                      disabled={!value[c.id]?.selected}
                      value={value[c.id]?.maxChannels ?? 10}
                      onChange={(e) =>
                        set(c.id, { maxChannels: Number(e.target.value) || 0 })
                      }
                    />
                  </div>
                </div>
                <Button
                  variant={confirmId === c.id ? "destructive" : "ghost"}
                  size="sm"
                  disabled={deleteM.isPending}
                  onClick={() => (confirmId === c.id ? deleteM.mutate(c.id) : setConfirmId(c.id))}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {confirmId === c.id ? "Wirklich löschen?" : "Kategorie löschen"}
                </Button>
              </div>
            ))}
            {(data?.categories ?? []).length === 0 && !isLoading && (
              <p className="p-3 text-sm text-muted-foreground">Keine Kategorien gefunden.</p>
            )}
          </div>
        )}

        {!orgId && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Wähle eine Organisation, um ihre Kategorien festzulegen.
          </p>
        )}
      </div>
    </section>
  );
}