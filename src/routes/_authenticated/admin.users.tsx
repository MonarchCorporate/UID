import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Pencil, Search, UserPlus, Mail, KeyRound, Ban, CircleCheck } from "lucide-react";
import {
  listAllUsers,
  setUserAdmin,
  updateUserProfileAdmin,
  createUserAdmin,
  updateUserEmailAdmin,
  updateUserPasswordAdmin,
  setUserBannedAdmin,
} from "@/lib/admin.functions";
import { getMyRoles } from "@/lib/loadouts.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/users")({
  component: AdminUsersPage,
});

type Row = Awaited<ReturnType<typeof listAllUsers>>[number];

function AdminUsersPage() {
  const fetchRoles = useServerFn(getMyRoles);
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => fetchRoles() });
  const isAdmin = !!rolesQ.data?.isAdmin;

  const fetchUsers = useServerFn(listAllUsers);
  const setRole = useServerFn(setUserAdmin);
  const updateProfile = useServerFn(updateUserProfileAdmin);
  const createUser = useServerFn(createUserAdmin);
  const updateEmail = useServerFn(updateUserEmailAdmin);
  const updatePassword = useServerFn(updateUserPasswordAdmin);
  const setBanned = useServerFn(setUserBannedAdmin);
  const qc = useQueryClient();

  const usersQ = useQuery({
    queryKey: ["admin-users"],
    queryFn: () => fetchUsers(),
    enabled: isAdmin,
  });

  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [emailEditing, setEmailEditing] = useState<Row | null>(null);
  const [pwEditing, setPwEditing] = useState<Row | null>(null);

  const filtered = useMemo(() => {
    const list = usersQ.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.callsign?.toLowerCase().includes(q) ||
        u.display_name?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q),
    );
  }, [usersQ.data, search]);

  const roleMut = useMutation({
    mutationFn: (v: { userId: string; isAdmin: boolean }) => setRole({ data: v }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success("Rolle aktualisiert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const banMut = useMutation({
    mutationFn: (v: { userId: string; banned: boolean }) => setBanned({ data: v }),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["admin-users"] });
      toast.success(v.banned ? "Zugang gesperrt" : "Zugang entsperrt");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (rolesQ.isLoading) {
    return <p className="text-center font-mono text-xs text-muted-foreground">// lade…</p>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="font-display text-2xl">Kein Zugriff</h1>
        <p className="mt-2 text-sm text-muted-foreground">Diese Seite ist Admins vorbehalten.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl">
      <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand">// admin</p>
        <h1 className="break-words font-display text-2xl sm:text-3xl">Benutzerverwaltung</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle registrierten Mitglieder · {usersQ.data?.length ?? 0} insgesamt
        </p>
        </div>
        <Button className="w-full sm:w-auto" onClick={() => setCreating(true)}>
          <UserPlus className="mr-2 h-4 w-4" /> Neuer Nutzer
        </Button>
      </header>

      <div className="relative mb-4 max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Suche nach Callsign, Name oder Email…"
          className="pl-9"
        />
      </div>

      <div className="overflow-x-auto rounded border border-white/10 bg-background/50">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-white/10 bg-white/5 text-left text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Callsign</th>
              <th className="px-3 py-2">Display Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Erstellt</th>
              <th className="px-3 py-2">Admin</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Aktion</th>
            </tr>
          </thead>
          <tbody>
            {usersQ.isLoading && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Lade Nutzer…</td></tr>
            )}
            {!usersQ.isLoading && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Keine Nutzer gefunden.</td></tr>
            )}
            {filtered.map((u) => {
              const isUserAdmin = u.roles.includes("admin");
              const isBanned = !!u.banned_until && new Date(u.banned_until) > new Date();
              return (
                <tr key={u.id} className="border-b border-white/5 last:border-0">
                  <td className="px-3 py-2 font-mono text-xs">
                    {u.callsign}
                    {isUserAdmin && (
                      <Badge variant="outline" className="ml-2 border-brand/40 text-brand">
                        <ShieldCheck className="mr-1 h-3 w-3" /> admin
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2">{u.display_name ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{u.email ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs text-muted-foreground">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-3 py-2">
                    <Switch
                      checked={isUserAdmin}
                      disabled={roleMut.isPending}
                      onCheckedChange={(checked) =>
                        roleMut.mutate({ userId: u.id, isAdmin: checked })
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {isBanned ? (
                      <Badge variant="outline" className="border-destructive/40 text-destructive">
                        <Ban className="mr-1 h-3 w-3" /> gesperrt
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="border-emerald-500/40 text-emerald-400">
                        <CircleCheck className="mr-1 h-3 w-3" /> aktiv
                      </Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="sm" title="Profil" onClick={() => setEditing(u)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Email ändern" onClick={() => setEmailEditing(u)}>
                        <Mail className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="sm" title="Passwort setzen" onClick={() => setPwEditing(u)}>
                        <KeyRound className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        title={isBanned ? "Entsperren" : "Sperren"}
                        disabled={banMut.isPending}
                        onClick={() => banMut.mutate({ userId: u.id, banned: !isBanned })}
                      >
                        {isBanned ? (
                          <CircleCheck className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Ban className="h-3.5 w-3.5 text-destructive" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <EditDialog
        row={editing}
        onClose={() => setEditing(null)}
        onSave={async (values) => {
          try {
            await updateProfile({ data: values });
            toast.success("Profil aktualisiert");
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            setEditing(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <CreateDialog
        open={creating}
        onClose={() => setCreating(false)}
        onCreate={async (values) => {
          try {
            await createUser({ data: values });
            toast.success("Nutzer angelegt");
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            setCreating(false);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <EmailDialog
        row={emailEditing}
        onClose={() => setEmailEditing(null)}
        onSave={async (email) => {
          if (!emailEditing) return;
          try {
            await updateEmail({ data: { userId: emailEditing.id, email } });
            toast.success("Email aktualisiert");
            qc.invalidateQueries({ queryKey: ["admin-users"] });
            setEmailEditing(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />

      <PasswordDialog
        row={pwEditing}
        onClose={() => setPwEditing(null)}
        onSave={async (password) => {
          if (!pwEditing) return;
          try {
            await updatePassword({ data: { userId: pwEditing.id, password } });
            toast.success("Passwort gesetzt");
            setPwEditing(null);
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function EditDialog({
  row,
  onClose,
  onSave,
}: {
  row: Row | null;
  onClose: () => void;
  onSave: (v: {
    userId: string;
    display_name: string | null;
    callsign: string;
    fleetyards_username: string | null;
  }) => Promise<void>;
}) {
  const [callsign, setCallsign] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fleetyards, setFleetyards] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCallsign(row?.callsign ?? "");
    setDisplayName(row?.display_name ?? "");
    setFleetyards(row?.fleetyards_username ?? "");
  }, [row]);

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Profil bearbeiten</DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Callsign</Label>
              <Input value={callsign} onChange={(e) => setCallsign(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Display Name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fleetyards Username</Label>
              <Input value={fleetyards} onChange={(e) => setFleetyards(e.target.value)} />
            </div>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {row.email}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button
            disabled={saving || !callsign.trim() || !row}
            onClick={async () => {
              if (!row) return;
              setSaving(true);
              await onSave({
                userId: row.id,
                callsign: callsign.trim(),
                display_name: displayName.trim() || null,
                fleetyards_username: fleetyards.trim() || null,
              });
              setSaving(false);
            }}
          >
            {saving ? "Speichere…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (v: {
    email: string;
    password: string;
    callsign: string;
    display_name?: string;
    fleetyards_username?: string;
    isAdmin?: boolean;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [callsign, setCallsign] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [fleetyards, setFleetyards] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail(""); setPassword(""); setCallsign("");
      setDisplayName(""); setFleetyards(""); setIsAdmin(false);
    }
  }, [open]);

  const canSave = email.trim() && password.length >= 8 && callsign.trim() && !saving;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neuen Nutzer anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Passwort (min. 8)</Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Callsign</Label>
            <Input value={callsign} onChange={(e) => setCallsign(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Display Name (optional)</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fleetyards Username (optional)</Label>
            <Input value={fleetyards} onChange={(e) => setFleetyards(e.target.value)} />
          </div>
          <div className="flex items-center justify-between rounded border border-white/10 px-3 py-2">
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Als Admin anlegen</Label>
            <Switch checked={isAdmin} onCheckedChange={setIsAdmin} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button
            disabled={!canSave}
            onClick={async () => {
              setSaving(true);
              await onCreate({
                email: email.trim(),
                password,
                callsign: callsign.trim(),
                display_name: displayName.trim() || undefined,
                fleetyards_username: fleetyards.trim() || undefined,
                isAdmin,
              });
              setSaving(false);
            }}
          >
            {saving ? "Lege an…" : "Anlegen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmailDialog({
  row, onClose, onSave,
}: { row: Row | null; onClose: () => void; onSave: (email: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setEmail(row?.email ?? ""); }, [row]);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Email ändern</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Neue Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              Aktuell: {row.email ?? "—"}
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button
            disabled={saving || !email.trim() || email.trim() === row?.email}
            onClick={async () => { setSaving(true); await onSave(email.trim()); setSaving(false); }}
          >
            {saving ? "Speichere…" : "Speichern"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PasswordDialog({
  row, onClose, onSave,
}: { row: Row | null; onClose: () => void; onSave: (password: string) => Promise<void> }) {
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPassword(""); }, [row]);
  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Passwort setzen</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
              Neues Passwort für {row.callsign}
            </Label>
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="min. 8 Zeichen" />
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Abbrechen</Button>
          <Button
            disabled={saving || password.length < 8}
            onClick={async () => { setSaving(true); await onSave(password); setSaving(false); }}
          >
            {saving ? "Speichere…" : "Passwort setzen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
