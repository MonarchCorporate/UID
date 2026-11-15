import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Layers, Plus, ExternalLink, Upload, Loader2 } from "lucide-react";
import {
  createOrg,
  listAllOrgs,
  adminUpdateOrg,
  uploadOrgLogo,
  listOrgMembers,
  setMemberRole,
  addMemberByCallsign,
  removeMember,
  type OrgMember,
  type OrgRole,
  type AdminOrgSummary,
  type OrgBranding,
} from "@/lib/orgs.functions";
import { SlugField, isSlugSubmittable, type SlugStatus } from "@/components/orga/SlugField";
import { slugify } from "@/lib/slugify";
import { getMyRoles } from "@/lib/loadouts.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Crown, Trash2, UserPlus } from "lucide-react";

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: "Owner",
  officer: "Officer",
  quartermaster: "Quartermaster",
  treasurer: "Treasurer",
  member: "Mitglied",
};

export const Route = createFileRoute("/_authenticated/admin/orgs")({
  head: () => ({ meta: [{ title: "Orga-Verwaltung – Admin" }] }),
  component: AdminOrgsPage,
});

function AdminOrgsPage() {
  const rolesFn = useServerFn(getMyRoles);
  const rolesQ = useQuery({ queryKey: ["my-roles"], queryFn: () => rolesFn() });
  const isAdmin = !!rolesQ.data?.isAdmin;

  const listFn = useServerFn(listAllOrgs);
  const q = useQuery({
    queryKey: ["admin-orgs"],
    queryFn: () => listFn(),
    enabled: !rolesQ.isLoading,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<AdminOrgSummary | null>(null);

  if (rolesQ.isLoading) {
    return (
      <div className="p-12 text-center font-mono text-xs text-muted-foreground">
        // lade…
      </div>
    );
  }

  const orgs = q.data?.orgs ?? [];
  if (!isAdmin && orgs.length === 0 && !q.isLoading) {
    return (
      <div className="mx-auto max-w-xl p-12 text-center">
        <p className="text-sm text-muted-foreground">
          Du hast in keiner Orga Owner- oder Officer-Rechte.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <Button asChild size="sm" variant="ghost">
          <Link to="/admin">
            <ArrowLeft className="mr-1 h-3 w-3" /> Zurück zum Admin
          </Link>
        </Button>
        {isAdmin && (
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 h-3 w-3" /> Neue Orga
          </Button>
        )}
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-brand" />
            {isAdmin ? "Alle Orgas" : "Meine Orgas"}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {q.isLoading && (
            <p className="text-sm text-muted-foreground">Lade…</p>
          )}
          {orgs.length === 0 && !q.isLoading && (
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              // noch keine Orgas
            </p>
          )}
          {orgs.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setEditing(o)}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-white/8 bg-card/40 px-4 py-3 text-left transition hover:border-brand/40 hover:bg-card/60"
            >
              <div className="flex items-center gap-3">
                {o.branding.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={o.branding.logo_url}
                    alt=""
                    className="h-9 w-9 rounded object-cover"
                  />
                ) : (
                  <div
                    className="flex h-9 w-9 items-center justify-center rounded font-mono text-xs"
                    style={{
                      background: o.branding.primary ?? "hsl(var(--brand))",
                      color: "#0b0b0b",
                    }}
                  >
                    {(o.tag ?? o.slug.slice(0, 3)).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="font-medium">
                    {o.name}{" "}
                    {!o.is_active && (
                      <Badge variant="destructive" className="ml-1">
                        inaktiv
                      </Badge>
                    )}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    /{o.slug} · {o.member_count} Mitglied
                    {o.member_count === 1 ? "" : "er"}
                    {o.owner_callsign ? ` · Owner ${o.owner_callsign}` : ""}
                  </div>
                </div>
              </div>
              <ExternalLink className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </CardContent>
      </Card>

      {createOpen && (
        <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {editing && (
        <EditOrgDialog
          org={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
          isAdmin={isAdmin}
        />
      )}
    </div>
  );
}

function CreateOrgDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const createFn = useServerFn(createOrg);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: "idle" });
  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [sid, setSid] = useState("");
  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          slug: slug.trim().toLowerCase(),
          name: name.trim(),
          tag: tag.trim() || null,
          rsi_sid: sid.trim() || null,
        },
      }),
    onSuccess: () => {
      toast.success("Orga angelegt");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      onOpenChange(false);
      setSlug("");
      setSlugTouched(false);
      setName("");
      setTag("");
      setSid("");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Neue Orga anlegen</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (!slugTouched) setSlug(slugify(v));
              }}
              placeholder="United Imperial Dominion"
              maxLength={80}
            />
          </div>
          <SlugField
            id="new-slug"
            label="Slug (URL)"
            value={slug}
            onChange={(v) => {
              setSlug(v);
              setSlugTouched(true);
            }}
            onStatusChange={setSlugStatus}
          />
          <div className="space-y-1">
            <Label htmlFor="new-tag">Tag (max 10)</Label>
            <Input
              id="new-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value.toUpperCase())}
              placeholder="MNRC"
              maxLength={10}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="new-sid">Spectrum Identification (SID)</Label>
            <Input
              id="new-sid"
              value={sid}
              onChange={(e) => setSid(e.target.value.toUpperCase())}
              placeholder="UID"
              maxLength={20}
            />
            <p className="text-xs text-muted-foreground">
              SID der RSI-Orga (steht im RSI-Profil unter der Orga).
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Du wirst automatisch als Owner eingetragen.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Abbrechen
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending ||
              name.trim().length < 2 ||
              !isSlugSubmittable(slugStatus)
            }
          >
            Anlegen
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditOrgDialog({
  org,
  open,
  onOpenChange,
  isAdmin,
}: {
  org: AdminOrgSummary;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const updateFn = useServerFn(adminUpdateOrg);

  const [slug, setSlug] = useState(org.slug);
  const [slugStatus, setSlugStatus] = useState<SlugStatus>({ kind: "available" });
  const [name, setName] = useState(org.name);
  const [tag, setTag] = useState(org.tag ?? "");
  const [sid, setSid] = useState(org.rsi_sid ?? "");
  const [isActive, setIsActive] = useState(org.is_active);
  const [b, setB] = useState<OrgBranding>({
    primary: org.branding.primary ?? "#f5b301",
    accent: org.branding.accent ?? "#3b82f6",
    logo_url: org.branding.logo_url ?? null,
    hero_title: org.branding.hero_title ?? "",
    hero_subtitle: org.branding.hero_subtitle ?? "",
    about_md: org.branding.about_md ?? "",
    show_fleet: org.branding.show_fleet ?? true,
    show_calendar: org.branding.show_calendar ?? true,
    show_shop: org.branding.show_shop ?? true,
    show_in_overview: org.branding.show_in_overview ?? true,
  });

  const mut = useMutation({
    mutationFn: () =>
      updateFn({
        data: {
          id: org.id,
          ...(isAdmin
            ? {
                slug: slug.trim().toLowerCase(),
                is_active: isActive,
              }
            : {}),
          name: name.trim(),
          tag: tag.trim() || null,
          rsi_sid: sid.trim() || null,
          branding: {
            primary: b.primary,
            accent: b.accent,
            logo_url: b.logo_url || null,
            hero_title: b.hero_title,
            hero_subtitle: b.hero_subtitle,
            about_md: b.about_md,
            show_fleet: b.show_fleet,
            show_calendar: b.show_calendar,
            show_shop: b.show_shop,
            show_in_overview: b.show_in_overview,
          },
        },
      }),
    onSuccess: () => {
      toast.success("Gespeichert");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
      onOpenChange(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {org.name}{" "}
            <span className="font-mono text-xs text-muted-foreground">
              /{org.slug}
            </span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              // Basis
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              {isAdmin && (
                <SlugField
                  value={slug}
                  onChange={setSlug}
                  originalSlug={org.slug}
                  excludeOrgId={org.id}
                  onStatusChange={setSlugStatus}
                />
              )}
              <div className="space-y-1">
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={80}
                />
              </div>
              <div className="space-y-1">
                <Label>Tag</Label>
                <Input
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  maxLength={10}
                />
              </div>
              <div className="space-y-1">
                <Label>Spectrum Identification (SID)</Label>
                <Input
                  value={sid}
                  onChange={(e) => setSid(e.target.value.toUpperCase())}
                  placeholder="UID"
                  maxLength={20}
                />
              </div>
              {isAdmin && (
                <div className="flex items-end gap-2">
                  <Switch
                    checked={isActive}
                    onCheckedChange={setIsActive}
                  />
                  <Label>Aktiv</Label>
                </div>
              )}
              {isAdmin && (
                <div className="flex items-end gap-2">
                  <Switch
                    checked={b.show_in_overview !== false}
                    onCheckedChange={(v) =>
                      setB((p) => ({ ...p, show_in_overview: v }))
                    }
                  />
                  <Label>In Orga-Übersicht anzeigen</Label>
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              // Branding
            </h3>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Primary-Farbe</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={b.primary ?? "#f5b301"}
                    onChange={(e) =>
                      setB((p) => ({ ...p, primary: e.target.value }))
                    }
                    className="h-10 w-14 cursor-pointer rounded border border-brand/20 bg-background"
                  />
                  <Input
                    value={b.primary ?? ""}
                    onChange={(e) =>
                      setB((p) => ({ ...p, primary: e.target.value }))
                    }
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Accent-Farbe</Label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={b.accent ?? "#3b82f6"}
                    onChange={(e) =>
                      setB((p) => ({ ...p, accent: e.target.value }))
                    }
                    className="h-10 w-14 cursor-pointer rounded border border-brand/20 bg-background"
                  />
                  <Input
                    value={b.accent ?? ""}
                    onChange={(e) =>
                      setB((p) => ({ ...p, accent: e.target.value }))
                    }
                    className="font-mono"
                  />
                </div>
              </div>
              <div className="md:col-span-2 space-y-2">
                <Label>Logo</Label>
                <OrgLogoUploader
                  orgId={org.id}
                  value={b.logo_url ?? null}
                  onChange={(url) =>
                    setB((p) => ({ ...p, logo_url: url }))
                  }
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>Hero-Titel (Public-Landing)</Label>
                <Input
                  value={b.hero_title ?? ""}
                  onChange={(e) =>
                    setB((p) => ({ ...p, hero_title: e.target.value }))
                  }
                  maxLength={120}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>Hero-Untertitel</Label>
                <Input
                  value={b.hero_subtitle ?? ""}
                  onChange={(e) =>
                    setB((p) => ({ ...p, hero_subtitle: e.target.value }))
                  }
                  maxLength={240}
                />
              </div>
              <div className="md:col-span-2 space-y-1">
                <Label>About (Markdown)</Label>
                <Textarea
                  value={b.about_md ?? ""}
                  onChange={(e) =>
                    setB((p) => ({ ...p, about_md: e.target.value }))
                  }
                  rows={5}
                  maxLength={4000}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
              // Public-Bereiche
            </h3>
            <div className="grid gap-2 md:grid-cols-3">
              <label className="flex items-center gap-2">
                <Switch
                  checked={b.show_fleet ?? true}
                  onCheckedChange={(v) =>
                    setB((p) => ({ ...p, show_fleet: v }))
                  }
                />
                <span className="text-sm">Fleet zeigen</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={b.show_calendar ?? true}
                  onCheckedChange={(v) =>
                    setB((p) => ({ ...p, show_calendar: v }))
                  }
                />
                <span className="text-sm">Kalender zeigen</span>
              </label>
              <label className="flex items-center gap-2">
                <Switch
                  checked={b.show_shop ?? true}
                  onCheckedChange={(v) => setB((p) => ({ ...p, show_shop: v }))}
                />
                <span className="text-sm">Shop zeigen</span>
              </label>
            </div>
          </section>

          <OrgMembersSection org={org} isAdmin={isAdmin} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
          <Button
            onClick={() => mut.mutate()}
            disabled={
              mut.isPending ||
              (isAdmin && !isSlugSubmittable(slugStatus))
            }
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrgMembersSection({
  org,
  isAdmin,
}: {
  org: AdminOrgSummary;
  isAdmin: boolean;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listOrgMembers);
  const roleFn = useServerFn(setMemberRole);
  const addFn = useServerFn(addMemberByCallsign);
  const removeFn = useServerFn(removeMember);
  const ownerFn = useServerFn(adminUpdateOrg);
  const [callsign, setCallsign] = useState("");

  const q = useQuery({
    queryKey: ["admin-org-members", org.id],
    queryFn: () => listFn({ data: { org_id: org.id } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-org-members", org.id] });
    qc.invalidateQueries({ queryKey: ["admin-orgs"] });
  };

  const roleMut = useMutation({
    mutationFn: (v: { user_id: string; role: OrgRole }) =>
      roleFn({ data: { org_id: org.id, user_id: v.user_id, role: v.role } }),
    onSuccess: () => {
      toast.success("Rolle aktualisiert");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const addMut = useMutation({
    mutationFn: () =>
      addFn({ data: { org_id: org.id, callsign: callsign.trim(), role: "member" } }),
    onSuccess: () => {
      toast.success("Mitglied hinzugefügt");
      setCallsign("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const removeMut = useMutation({
    mutationFn: (user_id: string) => removeFn({ data: { org_id: org.id, user_id } }),
    onSuccess: () => {
      toast.success("Mitglied entfernt");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const ownerMut = useMutation({
    mutationFn: (user_id: string) => ownerFn({ data: { id: org.id, owner_id: user_id } }),
    onSuccess: () => {
      toast.success("Owner gewechselt");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const members: OrgMember[] = q.data?.members ?? [];

  return (
    <section className="space-y-3">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
        // Mitglieder ({members.length})
      </h3>

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <Label>Mitglied hinzufügen (Callsign)</Label>
          <Input
            value={callsign}
            onChange={(e) => setCallsign(e.target.value)}
            placeholder="Callsign"
            onKeyDown={(e) => {
              if (e.key === "Enter" && callsign.trim().length > 0) addMut.mutate();
            }}
          />
        </div>
        <Button
          size="sm"
          onClick={() => addMut.mutate()}
          disabled={addMut.isPending || callsign.trim().length === 0}
        >
          <UserPlus className="mr-1 h-3 w-3" /> Hinzufügen
        </Button>
      </div>

      {q.isLoading && <p className="text-sm text-muted-foreground">Lade Mitglieder…</p>}
      {!q.isLoading && members.length === 0 && (
        <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
          // noch keine Mitglieder
        </p>
      )}

      <div className="space-y-2">
        {members.map((m) => {
          const isOwner = m.user_id === org.owner_id || m.role === "owner";
          return (
            <div
              key={m.user_id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-white/8 bg-card/40 px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate text-sm font-medium">
                  {m.callsign ?? m.display_name ?? "—"}
                  {m.user_id === org.owner_id && (
                    <Badge variant="secondary" className="gap-1">
                      <Crown className="h-3 w-3" /> Owner
                    </Badge>
                  )}
                  {m.custom_role_name && (
                    <Badge
                      variant="outline"
                      style={
                        m.custom_role_color
                          ? { borderColor: m.custom_role_color, color: m.custom_role_color }
                          : undefined
                      }
                    >
                      {m.custom_role_name}
                    </Badge>
                  )}
                </div>
                <div className="font-mono text-[11px] text-muted-foreground">
                  {m.display_name ?? ""} · seit{" "}
                  {new Date(m.joined_at).toLocaleDateString("de-DE")} · {m.permissions.length} Rechte
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={m.role}
                  onValueChange={(v) =>
                    roleMut.mutate({ user_id: m.user_id, role: v as OrgRole })
                  }
                >
                  <SelectTrigger className="h-8 w-[170px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(ROLE_LABELS) as OrgRole[]).map((r) => (
                      <SelectItem key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {isAdmin && m.user_id !== org.owner_id && (
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Als Owner festlegen"
                    disabled={ownerMut.isPending}
                    onClick={() => ownerMut.mutate(m.user_id)}
                  >
                    <Crown className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  title="Mitglied entfernen"
                  disabled={removeMut.isPending || (isOwner && !isAdmin)}
                  onClick={() => {
                    if (confirm("Mitglied wirklich aus der Orga entfernen?"))
                      removeMut.mutate(m.user_id);
                  }}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function OrgLogoUploader({
  orgId,
  value,
  onChange,
}: {
  orgId: string;
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  const qc = useQueryClient();
  const uploadFn = useServerFn(uploadOrgLogo);
  const [busy, setBusy] = useState(false);

  async function handleFile(file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Bitte eine Bilddatei auswählen.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Datei zu groß (max. 5 MB).");
      return;
    }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      // base64 encode via chunks to avoid stack limits
      let binary = "";
      const bytes = new Uint8Array(buf);
      const chunk = 0x8000;
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
      }
      const b64 = btoa(binary);
      const res = await uploadFn({
        data: {
          org_id: orgId,
          filename: file.name,
          content_type: file.type,
          data_base64: b64,
        },
      });
      onChange(res.logo_url);
      toast.success("Logo hochgeladen");
      qc.invalidateQueries({ queryKey: ["admin-orgs"] });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded border border-brand/20 bg-background">
          {value ? (
            <img
              src={`${value}${value.includes("?") ? "&" : "?"}v=${Date.now()}`}
              alt="Logo"
              className="h-full w-full object-contain"
            />
          ) : (
            <span className="text-[10px] text-muted-foreground">kein Logo</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded border border-brand/30 bg-background px-3 py-1.5 text-sm hover:bg-brand/10">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            <span>{busy ? "Lade hoch…" : "Logo hochladen"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void handleFile(f);
                e.currentTarget.value = "";
              }}
            />
          </label>
          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 justify-start px-2 text-xs"
              onClick={() => onChange(null)}
            >
              Logo entfernen
            </Button>
          )}
        </div>
      </div>
      <Input
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder="/api/public/org-logo/… oder https://…/logo.png"
        className="font-mono text-xs"
      />
      <p className="text-[11px] text-muted-foreground">
        PNG/JPG/WebP/SVG, max. 5 MB. Dateien landen im privaten Bucket
        „org-branding" und werden über einen öffentlichen Read-Through-Endpoint
        ausgeliefert.
      </p>
    </div>
  );
}
