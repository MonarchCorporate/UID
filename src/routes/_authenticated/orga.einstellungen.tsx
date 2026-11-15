import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plus, Trash2, Upload } from "lucide-react";
import {
  listMyOrgs,
  updateOrg,
  updateOrgBranding,
  uploadOrgLogo,
} from "@/lib/orgs.functions";
import { BrandPreview } from "@/components/branding/BrandPreview";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
} from "@/lib/categories.functions";
import {
  listRoleNotificationSettings,
  setRoleNotificationSetting,
  NOTIFICATION_KINDS,
} from "@/lib/notifications.functions";
import {
  getOrgBlueprintSettings,
  setOrgBlueprintSettings,
} from "@/lib/orga-orders.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { OrgFleetCard } from "@/components/orga/OrgFleetCard";
import { PageHint } from "@/components/orga/PageHint";
import { useCurrentOrgId, OrgPermGate } from "./orga";

export const Route = createFileRoute("/_authenticated/orga/einstellungen")({
  component: () => (
    <OrgPermGate perm="settings.manage">
      <OrgSettingsPage />
    </OrgPermGate>
  ),
});

function OrgSettingsPage() {
  const [orgId] = useCurrentOrgId();
  const listFn = useServerFn(listMyOrgs);
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => listFn() });
  const org = orgsQ.data?.orgs.find((o) => o.id === orgId) ?? null;

  if (!orgId || !org)
    return <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>;

  return (
    <div className="space-y-6">
      <PageHint>
        Zentrale Einstellungen für deine Orga: Name, Tag, Farben, Logo,
        Einsatz-Kategorien, Flotte und Benachrichtigungen pro Rolle. Änderungen
        werden auf der öffentlichen Landingpage übernommen.
      </PageHint>

      <IdentityCard
        orgId={orgId}
        name={org.name}
        tag={org.tag ?? ""}
      />
      <DesignCard
        orgId={orgId}
        primary={org.branding.primary ?? "#22d3ee"}
        accent={org.branding.accent ?? "#3b82f6"}
        logoUrl={org.branding.logo_url ?? null}
      />
      <CategoriesCard orgId={orgId} />
      <BlueprintSourceCard orgId={orgId} />
      <OrgFleetCard orgId={orgId} />
      <RoleNotificationsCard orgId={orgId} />
      <Card>
        <CardHeader>
          <CardTitle>Rollen & Berechtigungen</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-3 text-sm text-muted-foreground">
            Eigene Rollen mit Berechtigungen definierst du im Rollen-Editor.
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/orga/rollen">Zu den Rollen</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function IdentityCard({
  orgId,
  name: initialName,
  tag: initialTag,
}: {
  orgId: string;
  name: string;
  tag: string;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateOrg);
  const [name, setName] = useState(initialName);
  const [tag, setTag] = useState(initialTag);
  useEffect(() => {
    setName(initialName);
    setTag(initialTag);
  }, [initialName, initialTag]);

  const mut = useMutation({
    mutationFn: () =>
      updateFn({ data: { org_id: orgId, name: name.trim(), tag: tag.trim() || null } }),
    onSuccess: () => {
      toast.success("Orga aktualisiert");
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Identität</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="org-name">Name</Label>
          <Input
            id="org-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-tag">Tag (max. 10 Zeichen, A-Z, 0-9, -)</Label>
          <Input
            id="org-tag"
            value={tag}
            onChange={(e) => setTag(e.target.value.toUpperCase())}
            maxLength={10}
          />
        </div>
        <div className="flex justify-end">
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending ||
              name.trim().length < 2 ||
              (name.trim() === initialName && tag.trim() === initialTag)
            }
          >
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function DesignCard({
  orgId,
  primary: initialPrimary,
  accent: initialAccent,
  logoUrl,
}: {
  orgId: string;
  primary: string;
  accent: string;
  logoUrl: string | null;
}) {
  const qc = useQueryClient();
  const brandFn = useServerFn(updateOrgBranding);
  const logoFn = useServerFn(uploadOrgLogo);
  const [primary, setPrimary] = useState(initialPrimary);
  const [accent, setAccent] = useState(initialAccent);
  const [livePreview, setLivePreview] = useState(false);
  useEffect(() => {
    setPrimary(initialPrimary);
    setAccent(initialAccent);
  }, [initialPrimary, initialAccent]);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["my-orgs"] });

  const saveMut = useMutation({
    mutationFn: () => brandFn({ data: { org_id: orgId, branding: { primary, accent } } }),
    onSuccess: () => {
      toast.success("Design gespeichert");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      return logoFn({
        data: {
          org_id: orgId,
          filename: file.name,
          content_type: file.type || "image/png",
          data_base64: btoa(bin),
        },
      });
    },
    onSuccess: () => {
      toast.success("Logo hochgeladen");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Design</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-6">
          <div className="space-y-2">
            <Label htmlFor="brand-primary">Farbe</Label>
            <input
              id="brand-primary"
              type="color"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded border border-brand/20 bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="brand-accent">Akzentfarbe</Label>
            <input
              id="brand-accent"
              type="color"
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              className="h-10 w-16 cursor-pointer rounded border border-brand/20 bg-background"
            />
          </div>
          <div className="space-y-2">
            <Label>Logo</Label>
            <div className="flex items-center gap-3">
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="Orga-Logo"
                  className="size-10 rounded object-contain"
                />
              )}
              <label className="focus-ring inline-flex cursor-pointer items-center gap-2 rounded-md border border-brand/25 px-3 py-2 text-xs uppercase tracking-widest hover:border-brand/60">
                <Upload className="h-3 w-3" />
                {uploadMut.isPending ? "lädt…" : "Hochladen"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) uploadMut.mutate(f);
                    e.target.value = "";
                  }}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Label className="text-xs uppercase tracking-widest text-muted-foreground">
              Live-Vorschau
            </Label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="accent-primary"
                checked={livePreview}
                onChange={(e) => setLivePreview(e.target.checked)}
              />
              Im gesamten Backoffice anwenden (ungespeichert)
            </label>
          </div>
          <BrandPreview primary={primary} accent={accent} live={livePreview} />
        </div>
        <div className="flex justify-end gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setPrimary(initialPrimary);
              setAccent(initialAccent);
            }}
            disabled={primary === initialPrimary && accent === initialAccent}
          >
            Zurücksetzen
          </Button>
          <Button
            onClick={() => saveMut.mutate()}
            disabled={
              saveMut.isPending ||
              (primary === initialPrimary && accent === initialAccent)
            }
          >
            Speichern
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoriesCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listCategories);
  const createFn = useServerFn(createCategory);
  const updateFn = useServerFn(updateCategory);
  const deleteFn = useServerFn(deleteCategory);
  const q = useQuery({
    queryKey: ["mission-categories", orgId],
    queryFn: () => listFn({ data: { org_id: orgId } }),
  });

  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const invalidate = () => qc.invalidateQueries({ queryKey: ["mission-categories"] });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({ data: { org_id: orgId, name: newName.trim(), color: newColor } }),
    onSuccess: () => {
      toast.success("Kategorie angelegt");
      setNewName("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const updateMut = useMutation({
    mutationFn: (v: { id: string; name: string; color: string }) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Aktualisiert");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gelöscht");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Einsatz-Kategorien</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          {(q.data?.categories ?? []).map((c) => (
            <CategoryRow
              key={c.id}
              id={c.id}
              initialName={c.name}
              initialColor={c.color}
              onSave={(v) => updateMut.mutate(v)}
              onDelete={() => {
                if (confirm(`Kategorie „${c.name}" löschen?`)) deleteMut.mutate(c.id);
              }}
            />
          ))}
          {q.data?.categories.length === 0 && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              // noch keine Kategorien
            </p>
          )}
        </div>
        <div className="flex items-end gap-2 border-t border-white/5 pt-4">
          <div className="flex-1 space-y-2">
            <Label htmlFor="cat-name">Neue Kategorie</Label>
            <Input
              id="cat-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={60}
              placeholder="z. B. Mining"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-color">Farbe</Label>
            <input
              id="cat-color"
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              className="h-10 w-14 cursor-pointer rounded border border-brand/20 bg-background"
            />
          </div>
          <Button
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending || newName.trim().length < 1}
          >
            <Plus className="mr-1 h-3 w-3" /> Hinzufügen
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function CategoryRow({
  id,
  initialName,
  initialColor,
  onSave,
  onDelete,
}: {
  id: string;
  initialName: string;
  initialColor: string;
  onSave: (v: { id: string; name: string; color: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor);
  const dirty = name !== initialName || color !== initialColor;
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        className="h-9 w-12 cursor-pointer rounded border border-brand/20 bg-background"
      />
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={60}
        className="flex-1"
      />
      <Button
        size="sm"
        variant={dirty ? "default" : "ghost"}
        disabled={!dirty || name.trim().length < 1}
        onClick={() => onSave({ id, name: name.trim(), color })}
      >
        Speichern
      </Button>
      <Button size="icon" variant="ghost" onClick={onDelete} title="Löschen">
        <Trash2 className="h-4 w-4 text-destructive" />
      </Button>
    </div>
  );
}

const PRESET_ORG_ROLES: { key: string; label: string }[] = [
  { key: "owner", label: "Owner" },
  { key: "officer", label: "Officer" },
  { key: "quartermaster", label: "Quartermaster" },
  { key: "treasurer", label: "Treasurer" },
  { key: "member", label: "Mitglied" },
];

function BlueprintSourceCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getOrgBlueprintSettings);
  const setFn = useServerFn(setOrgBlueprintSettings);
  const q = useQuery({
    queryKey: ["org-blueprint-settings", orgId],
    queryFn: () => getFn({ data: { org_id: orgId } }),
  });

  const [mode, setMode] = useState<"all" | "roles">("all");
  const [roles, setRoles] = useState<string[]>([]);
  const [customIds, setCustomIds] = useState<string[]>([]);
  useEffect(() => {
    if (!q.data) return;
    setMode(q.data.settings.source_mode);
    setRoles(q.data.settings.allowed_roles);
    setCustomIds(q.data.settings.allowed_custom_role_ids);
  }, [q.data]);

  const mut = useMutation({
    mutationFn: () =>
      setFn({
        data: {
          org_id: orgId,
          source_mode: mode,
          allowed_roles: roles,
          allowed_custom_role_ids: customIds,
        },
      }),
    onSuccess: () => {
      toast.success("Blueprint-Quelle gespeichert");
      qc.invalidateQueries({ queryKey: ["org-blueprint-settings", orgId] });
      qc.invalidateQueries({ queryKey: ["orga-orderables"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const toggle = (list: string[], set: (v: string[]) => void, key: string) =>
    set(list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const customRoles = q.data?.custom_roles ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Blueprint-Quelle für Bestellungen</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Legt fest, wessen gesammelte Blaupausen bei „Bestellen“ als
          herstellbare Items angeboten werden.
        </p>
        <div className="space-y-2">
          {(
            [
              ["all", "Alle Orgamitglieder"],
              ["roles", "Nur ausgewählte Rollen"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <input
                type="radio"
                name="bp-source-mode"
                className="accent-primary"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </div>

        {mode === "roles" && (
          <div className="space-y-3 rounded border border-border/60 p-3">
            <div className="grid gap-2 sm:grid-cols-2">
              {PRESET_ORG_ROLES.map((r) => (
                <label
                  key={r.key}
                  className="flex cursor-pointer items-center gap-2 text-sm"
                >
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={roles.includes(r.key)}
                    onChange={() => toggle(roles, setRoles, r.key)}
                  />
                  {r.label}
                </label>
              ))}
            </div>
            {customRoles.length > 0 && (
              <div className="grid gap-2 border-t border-border/60 pt-3 sm:grid-cols-2">
                {customRoles.map((r) => (
                  <label
                    key={r.id}
                    className="flex cursor-pointer items-center gap-2 text-sm"
                  >
                    <input
                      type="checkbox"
                      className="accent-primary"
                      checked={customIds.includes(r.id)}
                      onChange={() => toggle(customIds, setCustomIds, r.id)}
                    />
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ background: r.color ?? "currentColor" }}
                    />
                    {r.name}
                  </label>
                ))}
              </div>
            )}
            {roles.length === 0 && customIds.length === 0 && (
              <p className="text-xs text-amber-400">
                Ohne ausgewählte Rolle werden bei „Bestellen“ keine Blueprints
                angezeigt.
              </p>
            )}
          </div>
        )}

        <Button size="sm" onClick={() => mut.mutate()} disabled={mut.isPending}>
          Speichern
        </Button>
      </CardContent>
    </Card>
  );
}

function RoleNotificationsCard({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listRoleNotificationSettings);
  const setFn = useServerFn(setRoleNotificationSetting);
  const q = useQuery({
    queryKey: ["role-notification-settings", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });
  const mut = useMutation({
    mutationFn: (v: { roleKey: string; kind: string; enabled: boolean }) =>
      setFn({ data: { orgId, ...v } }),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["role-notification-settings", orgId] }),
    onError: (e) => toast.error((e as Error).message),
  });

  const roles = q.data?.roles ?? [];
  const settings = q.data?.settings ?? {};

  return (
    <Card>
      <CardHeader>
        <CardTitle>Benachrichtigungen pro Rolle</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          // standard: aktiv · owner werden nie stumm geschaltet
        </p>
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Lade…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-separate border-spacing-y-1">
              <thead>
                <tr>
                  <th className="pr-3 text-left text-xs font-medium text-muted-foreground">
                    Rolle
                  </th>
                  {NOTIFICATION_KINDS.map((k) => (
                    <th
                      key={k.kind}
                      className="px-2 text-left text-xs font-medium text-muted-foreground"
                      title={k.description}
                    >
                      {k.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {roles.map((r) => (
                  <tr key={r.key}>
                    <td className="pr-3 text-sm">
                      <span
                        className="inline-flex items-center gap-2"
                        style={r.color ? { color: r.color } : undefined}
                      >
                        {r.label}
                      </span>
                    </td>
                    {NOTIFICATION_KINDS.map((k) => {
                      const isOwner = r.key === "owner";
                      const enabled = isOwner || (settings[r.key]?.[k.kind] ?? true);
                      return (
                        <td key={k.kind} className="px-2">
                          <Switch
                            checked={enabled}
                            disabled={isOwner || mut.isPending}
                            onCheckedChange={(v) =>
                              mut.mutate({ roleKey: r.key, kind: k.kind, enabled: v })
                            }
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}