import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Check, X, Shield, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  getOrgRoleState,
  createOrgDiscordRole,
  updateOrgDiscordRole,
  deleteOrgDiscordRole,
  setOrgMemberDiscordRole,
} from "@/lib/discord-roles.functions";

const toHex = (n: number) => `#${(n & 0xffffff).toString(16).padStart(6, "0")}`;
const toInt = (hex: string) => parseInt(hex.replace("#", ""), 16) || 0;

type Form = { name: string; color: string; hoist: boolean; mentionable: boolean };
const EMPTY: Form = { name: "", color: "#5865f2", hoist: false, mentionable: false };

/** Rollenverwaltung einer Orga: eigene Rollen pflegen und Rollen vergeben. */
export function OrgRoleManager({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getOrgRoleState);
  const createFn = useServerFn(createOrgDiscordRole);
  const updateFn = useServerFn(updateOrgDiscordRole);
  const deleteFn = useServerFn(deleteOrgDiscordRole);
  const assignFn = useServerFn(setOrgMemberDiscordRole);

  const { data, isLoading } = useQuery({
    queryKey: ["org-discord-roles", orgId],
    queryFn: () => stateFn({ data: { org_id: orgId } }),
    enabled: !!orgId,
  });

  const [form, setForm] = useState<Form>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["org-discord-roles", orgId] });

  const saveM = useMutation({
    mutationFn: async () => {
      const payload = {
        org_id: orgId,
        name: form.name.trim(),
        color: toInt(form.color),
        hoist: form.hoist,
        mentionable: form.mentionable,
      };
      return editing
        ? updateFn({ data: { ...payload, id: editing } })
        : createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(editing ? "Rolle aktualisiert." : "Rolle angelegt.");
      setForm(EMPTY);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { org_id: orgId, id } }),
    onSuccess: () => {
      toast.success("Rolle gelöscht.");
      setConfirmDelete(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignM = useMutation({
    mutationFn: (v: { user_id: string; discord_role_id: string; add: boolean }) =>
      assignFn({ data: { org_id: orgId, ...v } }),
    onSuccess: () => {
      toast.success("Rollen aktualisiert.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const assignable = useMemo(
    () => [
      ...(data?.managed ?? []).map((r) => ({
        id: r.discord_role_id,
        name: r.name,
        color: r.color,
        own: true,
      })),
      ...(data?.assigned ?? []).map((r) => ({
        id: r.discord_role_id,
        name: r.name,
        color: r.color,
        own: false,
      })),
    ],
    [data],
  );

  const atLimit = (data?.managed.length ?? 0) >= (data?.quota ?? 15);

  return (
    <div className="space-y-6">
      {data?.error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {data.error}
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" /> Eigene Discord-Rollen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto] sm:items-end">
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Rollenname</Label>
              <Input
                id="role-name"
                value={form.name}
                placeholder="z. B. IDCP Leitung"
                maxLength={90}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-color">Farbe</Label>
              <Input
                id="role-color"
                type="color"
                className="h-10 w-16 p-1"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-xs">Separat anzeigen</Label>
              <Switch
                checked={form.hoist}
                onCheckedChange={(v) => setForm({ ...form, hoist: v })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="block text-xs">Erwähnbar</Label>
              <Switch
                checked={form.mentionable}
                onCheckedChange={(v) => setForm({ ...form, mentionable: v })}
              />
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => saveM.mutate()}
                disabled={
                  form.name.trim().length < 2 ||
                  saveM.isPending ||
                  (!editing && atLimit)
                }
              >
                {editing ? <Check className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
                {editing ? "Speichern" : "Anlegen"}
              </Button>
              {editing && (
                <Button
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                    setForm(EMPTY);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          {atLimit && !editing && (
            <p className="text-xs text-muted-foreground">
              Limit von {data?.quota} eigenen Rollen erreicht.
            </p>
          )}

          <div className="space-y-1">
            {isLoading && (
              <p className="font-mono text-xs text-muted-foreground">// lade…</p>
            )}
            {(data?.managed ?? []).map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-brand/10 px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: toHex(r.color) }}
                  />
                  <span className="truncate text-sm">{r.name}</span>
                  {r.hoist && <Badge variant="outline">separat</Badge>}
                  {r.mentionable && <Badge variant="outline">erwähnbar</Badge>}
                  {!r.exists && <Badge variant="destructive">in Discord gelöscht</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditing(r.id);
                      setForm({
                        name: r.name,
                        color: toHex(r.color),
                        hoist: r.hoist,
                        mentionable: r.mentionable,
                      });
                    }}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={confirmDelete === r.id ? "destructive" : "ghost"}
                    disabled={deleteM.isPending}
                    onClick={() =>
                      confirmDelete === r.id
                        ? deleteM.mutate(r.id)
                        : setConfirmDelete(r.id)
                    }
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {confirmDelete === r.id ? "Wirklich?" : ""}
                  </Button>
                </div>
              </div>
            ))}
            {!isLoading && (data?.managed ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Noch keine eigenen Rollen angelegt.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4" /> Rollen vergeben
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {assignable.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Keine vergebbaren Rollen vorhanden.
            </p>
          ) : (
            (data?.members ?? []).map((m) => (
              <div
                key={m.user_id}
                className="rounded-lg border border-brand/10 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm">{m.name}</p>
                    <p className="truncate font-mono text-[10px] text-muted-foreground">
                      {m.discord_username ?? "kein Discord verknüpft"}
                    </p>
                  </div>
                  {!m.onGuild && (
                    <Badge variant="outline">nicht auf dem Discord-Server</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {assignable.map((r) => {
                    const active = m.role_ids.includes(r.id);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        disabled={!m.onGuild || assignM.isPending}
                        onClick={() =>
                          assignM.mutate({
                            user_id: m.user_id,
                            discord_role_id: r.id,
                            add: !active,
                          })
                        }
                        className={`focus-ring flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition disabled:opacity-40 ${
                          active
                            ? "border-brand/60 bg-brand/15 text-foreground"
                            : "border-brand/15 text-muted-foreground hover:border-brand/40 hover:text-foreground"
                        }`}
                      >
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: toHex(r.color) }}
                        />
                        {r.name}
                        {!r.own && <span className="opacity-60">·zugeteilt</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          {!isLoading && (data?.members ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground">Keine Mitglieder gefunden.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
