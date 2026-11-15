import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listOrgCustomRoles,
  upsertOrgCustomRole,
  deleteOrgCustomRole,
  type OrgCustomRole,
} from "@/lib/orgs.functions";
import { ORG_PERMS, type OrgPerm } from "@/lib/org-perms";
import { useCurrentOrgId, OrgPermGate } from "./orga";
import { PageHint } from "@/components/orga/PageHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2, Save } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orga/rollen")({
  component: () => (
    <OrgPermGate perm="members.manage">
      <RolesPage />
    </OrgPermGate>
  ),
});

function RolesPage() {
  const [orgId] = useCurrentOrgId();
  const listFn = useServerFn(listOrgCustomRoles);
  const saveFn = useServerFn(upsertOrgCustomRole);
  const delFn = useServerFn(deleteOrgCustomRole);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["org-custom-roles", orgId],
    queryFn: () => listFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const saveM = useMutation({
    mutationFn: (v: {
      id?: string;
      name: string;
      color: string | null;
      permissions: OrgPerm[];
    }) => saveFn({ data: { org_id: orgId!, ...v } }),
    onSuccess: () => {
      toast.success("Rolle gespeichert");
      qc.invalidateQueries({ queryKey: ["org-custom-roles"] });
      qc.invalidateQueries({ queryKey: ["org-members"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { org_id: orgId!, id } }),
    onSuccess: () => {
      toast.success("Rolle gelöscht");
      qc.invalidateQueries({ queryKey: ["org-custom-roles"] });
      qc.invalidateQueries({ queryKey: ["org-members"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [draft, setDraft] = useState<{
    name: string;
    color: string;
    permissions: OrgPerm[];
  }>({ name: "", color: "#38bdf8", permissions: [] });

  if (!orgId)
    return <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>;

  const roles = q.data?.roles ?? [];

  return (
    <div className="space-y-6">
      <PageHint>
        Erstelle eigene Rollen mit gezielten Berechtigungen. So kannst du
        genau steuern, welche Mitglieder das Lager, die Kasse, den Shop oder die
        Landingpage sehen und bearbeiten dürfen.
      </PageHint>

      <section className="space-y-3 border border-brand/10 bg-background/40 p-4">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
          // Neue Rolle
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[180px]">
            <label className="text-xs text-muted-foreground">Name</label>
            <Input
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
              placeholder="z.B. Logistiker"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Farbe</label>
            <input
              type="color"
              value={draft.color}
              onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))}
              className="h-9 w-16 cursor-pointer rounded border border-brand/20 bg-transparent"
            />
          </div>
        </div>
        <PermGrid
          value={draft.permissions}
          onChange={(perms) => setDraft((d) => ({ ...d, permissions: perms }))}
        />
        <div className="flex justify-end">
          <Button
            disabled={!draft.name.trim() || saveM.isPending}
            onClick={() =>
              saveM.mutate(
                {
                  name: draft.name.trim(),
                  color: draft.color,
                  permissions: draft.permissions,
                },
                {
                  onSuccess: () =>
                    setDraft({ name: "", color: "#38bdf8", permissions: [] }),
                },
              )
            }
          >
            <Plus className="mr-1 h-3 w-3" /> Rolle anlegen
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
          // Vorhandene Rollen ({roles.length})
        </div>
        {roles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Noch keine eigenen Rollen definiert.
          </p>
        )}
        {roles.map((r) => (
          <RoleEditor
            key={r.id}
            role={r}
            busy={saveM.isPending}
            onSave={(v) => saveM.mutate({ id: r.id, ...v })}
            onDelete={() => {
              if (confirm(`Rolle "${r.name}" wirklich löschen?`))
                delM.mutate(r.id);
            }}
          />
        ))}
      </section>
    </div>
  );
}

function RoleEditor({
  role,
  busy,
  onSave,
  onDelete,
}: {
  role: OrgCustomRole;
  busy: boolean;
  onSave: (v: { name: string; color: string | null; permissions: OrgPerm[] }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [color, setColor] = useState(role.color ?? "#38bdf8");
  const [perms, setPerms] = useState<OrgPerm[]>(role.permissions);
  const dirty =
    name !== role.name ||
    color !== (role.color ?? "#38bdf8") ||
    JSON.stringify([...perms].sort()) !==
      JSON.stringify([...role.permissions].sort());

  return (
    <div className="space-y-3 border border-brand/10 bg-background/40 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex items-center gap-2">
          <span
            className="inline-block h-4 w-4 rounded"
            style={{ background: role.color ?? "#666" }}
          />
        </div>
        <div className="flex-1 min-w-[180px]">
          <label className="text-xs text-muted-foreground">Name</label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Farbe</label>
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-16 cursor-pointer rounded border border-brand/20 bg-transparent"
          />
        </div>
        <Button variant="ghost" size="sm" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      <PermGrid value={perms} onChange={setPerms} />
      <div className="flex justify-end">
        <Button
          disabled={!dirty || busy || !name.trim()}
          size="sm"
          onClick={() =>
            onSave({ name: name.trim(), color, permissions: perms })
          }
        >
          <Save className="mr-1 h-3 w-3" /> Speichern
        </Button>
      </div>
    </div>
  );
}

function PermGrid({
  value,
  onChange,
}: {
  value: OrgPerm[];
  onChange: (v: OrgPerm[]) => void;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {ORG_PERMS.map((p) => {
        const checked = value.includes(p.key);
        return (
          <label
            key={p.key}
            className="flex cursor-pointer items-start gap-2 border border-brand/5 bg-background/30 p-2 text-xs"
          >
            <Checkbox
              checked={checked}
              onCheckedChange={(v) =>
                onChange(
                  v
                    ? Array.from(new Set([...value, p.key]))
                    : value.filter((x) => x !== p.key),
                )
              }
            />
            <span>
              <div className="font-medium">{p.label}</div>
              <div className="text-[10px] text-muted-foreground">{p.hint}</div>
            </span>
          </label>
        );
      })}
    </div>
  );
}
