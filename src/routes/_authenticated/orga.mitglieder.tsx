import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  listOrgMembers,
  listMyOrgs,
  setMemberRole,
  setMemberPermissions,
  listOrgCustomRoles,
  setMemberCustomRole,
  addMemberByCallsign,
  removeMember,
  type OrgRole,
} from "@/lib/orgs.functions";
import { ORG_PERMS, type OrgPerm } from "@/lib/org-perms";
import { useCurrentOrgId, OrgPermGate } from "./orga";
import { PageHint } from "@/components/orga/PageHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Shield, Trash2, UserPlus } from "lucide-react";

export const Route = createFileRoute("/_authenticated/orga/mitglieder")({
  component: () => (
    <OrgPermGate perm="members.manage">
      <MembersPage />
    </OrgPermGate>
  ),
});

const ROLES: OrgRole[] = ["member", "quartermaster", "treasurer", "officer", "owner"];

function MembersPage() {
  const [orgId] = useCurrentOrgId();
  const orgsFn = useServerFn(listMyOrgs);
  const memFn = useServerFn(listOrgMembers);
  const roleFn = useServerFn(setMemberRole);
  const permFn = useServerFn(setMemberPermissions);
  const rolesFn = useServerFn(listOrgCustomRoles);
  const setCustomFn = useServerFn(setMemberCustomRole);
  const addFn = useServerFn(addMemberByCallsign);
  const rmFn = useServerFn(removeMember);
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const me = orgsQ.data?.orgs.find((o) => o.id === orgId);
  const canManage = me
    ? me.my_role === "owner" || me.my_permissions.includes("members.manage")
    : false;

  const q = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => memFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });
  const rolesQ = useQuery({
    queryKey: ["org-custom-roles", orgId],
    queryFn: () => rolesFn({ data: { org_id: orgId! } }),
    enabled: !!orgId && canManage,
  });
  const customRoles = rolesQ.data?.roles ?? [];
  const setCustomM = useMutation({
    mutationFn: (v: { user_id: string; custom_role_id: string | null }) =>
      setCustomFn({ data: { org_id: orgId!, ...v } }),
    onSuccess: () => {
      toast.success("Rolle zugewiesen");
      qc.invalidateQueries({ queryKey: ["org-members"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const roleM = useMutation({
    mutationFn: (v: { user_id: string; role: OrgRole }) =>
      roleFn({ data: { org_id: orgId!, ...v } }),
    onSuccess: () => {
      toast.success("Rolle aktualisiert");
      qc.invalidateQueries({ queryKey: ["org-members"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const permM = useMutation({
    mutationFn: (v: { user_id: string; permissions: OrgPerm[] }) =>
      permFn({ data: { org_id: orgId!, ...v } }),
    onSuccess: () => {
      toast.success("Berechtigungen gespeichert");
      qc.invalidateQueries({ queryKey: ["org-members"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const addM = useMutation({
    mutationFn: (callsign: string) =>
      addFn({ data: { org_id: orgId!, callsign } }),
    onSuccess: () => {
      toast.success("Mitglied hinzugefügt");
      setCs("");
      qc.invalidateQueries({ queryKey: ["org-members"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const rmM = useMutation({
    mutationFn: (user_id: string) =>
      rmFn({ data: { org_id: orgId!, user_id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["org-members"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [cs, setCs] = useState("");
  if (!orgId) return <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>;
  const members = q.data?.members ?? [];

  return (
    <div className="space-y-4">
      <PageHint>
        Verwalte Mitglieder deiner Orga, weise Rollen und Berechtigungen zu
        und lade neue Spieler über ihr Callsign ein. Änderungen wirken sich
        sofort auf Menüzugriff und Berechtigungen aus.
      </PageHint>

      {canManage && (
        <div className="flex items-end gap-2 border border-brand/10 bg-background/40 p-3">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground">Callsign</label>
            <Input value={cs} onChange={(e) => setCs(e.target.value)} placeholder="Callsign des Spielers" />
          </div>
          <Button disabled={!cs.trim() || addM.isPending} onClick={() => addM.mutate(cs.trim())}>
            <UserPlus className="mr-1 h-3 w-3" /> Einladen
          </Button>
        </div>
      )}
      <div className="space-y-1">
        {members.map((m) => (
          <div key={m.user_id} className="flex flex-wrap items-center gap-3 border border-brand/10 bg-background/40 px-3 py-2">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">{m.callsign ?? m.user_id.slice(0, 8)}</div>
              <div className="text-[10px] text-muted-foreground">
                {m.display_name ?? "—"} · seit {new Date(m.joined_at).toLocaleDateString("de-DE")}
              </div>
            </div>
            {canManage && m.role !== "owner" ? (
              <PermPopover
                current={m.permissions}
                busy={permM.isPending}
                onSave={(perms) => permM.mutate({ user_id: m.user_id, permissions: perms })}
              />
            ) : m.role === "owner" ? (
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
                Alle Rechte
              </span>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                {m.permissions.length} Recht{m.permissions.length === 1 ? "" : "e"}
              </span>
            )}
            {canManage && m.role !== "owner" && (
              <Select
                value={m.custom_role_id ?? "__none__"}
                onValueChange={(v) =>
                  setCustomM.mutate({
                    user_id: m.user_id,
                    custom_role_id: v === "__none__" ? null : v,
                  })
                }
              >
                <SelectTrigger className="h-8 w-[170px] text-xs">
                  <SelectValue placeholder="Eigene Rolle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— keine —</SelectItem>
                  {customRoles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="inline-block h-2 w-2 rounded-full"
                          style={{ background: r.color ?? "#888" }}
                        />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {!canManage && m.custom_role_name && (
              <span
                className="rounded px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.2em]"
                style={{
                  background: (m.custom_role_color ?? "#666") + "22",
                  color: m.custom_role_color ?? undefined,
                }}
              >
                {m.custom_role_name}
              </span>
            )}
            {canManage && m.role !== "owner" ? (
              <Select
                value={m.role}
                onValueChange={(v) => roleM.mutate({ user_id: m.user_id, role: v as OrgRole })}
              >
                <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLES.filter((r) => r !== "owner" || me?.my_role === "owner").map((r) => (
                    <SelectItem key={r} value={r}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{m.role}</span>
            )}
            {canManage && m.role !== "owner" && (
              <Button size="sm" variant="ghost" onClick={() => rmM.mutate(m.user_id)}>
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function PermPopover({
  current,
  busy,
  onSave,
}: {
  current: OrgPerm[];
  busy: boolean;
  onSave: (perms: OrgPerm[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<OrgPerm[]>(current);
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(current);
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs">
          <Shield className="h-3 w-3" />
          Rechte ({current.length})
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-3">
        <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          // Berechtigungen
        </div>
        <div className="space-y-2">
          {ORG_PERMS.map((p) => {
            const checked = draft.includes(p.key);
            return (
              <label
                key={p.key}
                className="flex cursor-pointer items-start gap-2 text-xs"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={(v) =>
                    setDraft((d) =>
                      v ? Array.from(new Set([...d, p.key])) : d.filter((x) => x !== p.key),
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
        <div className="flex justify-end gap-2 pt-1">
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
            Abbrechen
          </Button>
          <Button
            size="sm"
            disabled={busy}
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Speichern
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}