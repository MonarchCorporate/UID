import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Send,
  Trash2,
  CalendarClock,
  MessageSquare,
  FolderCog,
  Plus,
  Pencil,
  Check,
  X,
  Lock,
  Globe,
  Users,
} from "lucide-react";
import { useCurrentOrgId, OrgPermGate } from "./orga";
import { PageHint } from "@/components/orga/PageHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getOrgDiscordState,
  postOrgDiscordMessage,
  postOrgMissionAnnouncement,
  deleteOrgDiscordPost,
  getOrgDiscordChannelAdmin,
  createOrgDiscordChannel,
  renameOrgDiscordChannel,
  deleteOrgDiscordChannel,
  setOrgDiscordChannelVisibility,
} from "@/lib/discord.functions";

export const Route = createFileRoute("/_authenticated/orga/discord")({
  component: () => (
    <OrgPermGate perm="discord.post">
      <OrgaDiscordPage />
    </OrgPermGate>
  ),
});

function OrgaDiscordPage() {
  const [orgId] = useCurrentOrgId();
  const qc = useQueryClient();
  const stateFn = useServerFn(getOrgDiscordState);
  const postFn = useServerFn(postOrgDiscordMessage);
  const announceFn = useServerFn(postOrgMissionAnnouncement);
  const deleteFn = useServerFn(deleteOrgDiscordPost);

  const { data, isLoading } = useQuery({
    queryKey: ["org-discord", orgId],
    queryFn: () => stateFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });

  const channels = data?.channels ?? [];
  const [channelId, setChannelId] = useState("");
  const channel = useMemo(
    () => channels.find((c) => c.channel_id === channelId) ?? null,
    [channels, channelId],
  );

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [color, setColor] = useState("#22d3ee");
  const [mention, setMention] = useState<"none" | "everyone" | "here" | "role">("none");
  const [mentionRoleId, setMentionRoleId] = useState("");
  const roles = data?.roles ?? [];

  const [missionId, setMissionId] = useState("");
  const [note, setNote] = useState("");

  const invalidate = () => qc.invalidateQueries({ queryKey: ["org-discord", orgId] });

  const postM = useMutation({
    mutationFn: () =>
      postFn({
        data: {
          org_id: orgId!,
          channel_id: channelId,
          title: title.trim(),
          body: body.trim(),
          image_url: imageUrl.trim() || null,
          color,
          mention,
          mention_role_id: mention === "role" ? mentionRoleId : null,
        },
      }),
    onSuccess: () => {
      setTitle("");
      setBody("");
      setImageUrl("");
      toast.success("Nachricht gepostet.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const announceM = useMutation({
    mutationFn: () =>
      announceFn({
        data: {
          org_id: orgId!,
          channel_id: channelId,
          mission_id: missionId,
          note: note.trim() || null,
          mention,
          mention_role_id: mention === "role" ? mentionRoleId : null,
        },
      }),
    onSuccess: () => {
      setNote("");
      toast.success("Event angekündigt.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { org_id: orgId!, id } }),
    onSuccess: () => {
      toast.success("Beitrag gelöscht.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const mission = (data?.missions ?? []).find((m) => m.id === missionId) ?? null;

  const channelPicker = (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="space-y-1.5">
        <Label>Channel</Label>
        <Select value={channelId} onValueChange={setChannelId}>
          <SelectTrigger>
            <SelectValue placeholder="Channel wählen" />
          </SelectTrigger>
          <SelectContent>
            {channels.map((c) => (
              <SelectItem key={c.channel_id} value={c.channel_id}>
                #{c.channel_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Erwähnung</Label>
        <Select
          value={mention}
          onValueChange={(v) => setMention(v as typeof mention)}
          disabled={
            !channel ||
            (!channel.allow_mentions &&
              !channel.allow_here &&
              !channel.allow_role_mentions)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Keine</SelectItem>
            {channel?.allow_here && <SelectItem value="here">@here</SelectItem>}
            {channel?.allow_mentions && (
              <SelectItem value="everyone">@everyone</SelectItem>
            )}
            {channel?.allow_role_mentions && roles.length > 0 && (
              <SelectItem value="role">Orga-Rolle</SelectItem>
            )}
          </SelectContent>
        </Select>
        {channel &&
          !channel.allow_mentions &&
          !channel.allow_here &&
          !channel.allow_role_mentions && (
            <p className="text-xs text-muted-foreground">
              In diesem Channel sind Erwähnungen nicht freigegeben.
            </p>
          )}
        {mention === "role" && (
          <Select value={mentionRoleId} onValueChange={setMentionRoleId}>
            <SelectTrigger>
              <SelectValue placeholder="Rolle wählen" />
            </SelectTrigger>
            <SelectContent>
              {roles.map((r) => (
                <SelectItem key={r.discord_role_id} value={r.discord_role_id}>
                  @{r.discord_role_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <PageHint>
        Hier kannst du mit dem UID-Bot in den für deine Orga freigegebenen Discord-Channels
        posten und Einsätze als eingebettete Nachricht ankündigen. Die Freigabe der Channels
        erfolgt durch die App-Administration.
      </PageHint>

      {isLoading && <p className="font-mono text-xs text-muted-foreground">// lade…</p>}

      {!isLoading && channels.length === 0 && (
        <>
          <div className="rounded-xl border border-brand/15 bg-card/40 p-6 text-sm text-muted-foreground">
            Für deine Orga ist noch kein Discord-Channel zum Posten freigegeben. Wende dich an
            die App-Administration.
          </div>
          {orgId && <ChannelManager orgId={orgId} />}
        </>
      )}

      {channels.length > 0 && (
        <Tabs defaultValue="message">
          <TabsList>
            <TabsTrigger value="message">
              <MessageSquare className="mr-2 h-4 w-4" />
              Nachricht
            </TabsTrigger>
            <TabsTrigger value="event">
              <CalendarClock className="mr-2 h-4 w-4" />
              Event ankündigen
            </TabsTrigger>
            <TabsTrigger value="channels">
              <FolderCog className="mr-2 h-4 w-4" />
              Channels verwalten
            </TabsTrigger>
          </TabsList>

          <TabsContent value="message" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Freie Nachricht</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {channelPicker}
                <div className="space-y-1.5">
                  <Label>Titel</Label>
                  <Input
                    value={title}
                    maxLength={256}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="z. B. Wartungsfenster am Wochenende"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Text</Label>
                  <Textarea
                    rows={6}
                    maxLength={4000}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    placeholder="Markdown wird von Discord unterstützt."
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Bild-URL (optional)</Label>
                    <Input
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      placeholder="https://…"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Farbe</Label>
                    <Input
                      type="color"
                      value={color}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-10 w-24 p-1"
                    />
                  </div>
                </div>

                <EmbedPreview
                  color={color}
                  title={title || "Vorschau"}
                  body={body}
                  imageUrl={imageUrl}
                />

                <Button
                  onClick={() => postM.mutate()}
                  disabled={
                    !channelId ||
                    !title.trim() ||
                    !body.trim() ||
                    (mention === "role" && !mentionRoleId) ||
                    postM.isPending
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  {postM.isPending ? "Sende…" : "In Discord posten"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="event" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Event ankündigen</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {channelPicker}
                <div className="space-y-1.5">
                  <Label>Einsatz</Label>
                  <Select value={missionId} onValueChange={setMissionId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Einsatz wählen" />
                    </SelectTrigger>
                    <SelectContent>
                      {(data?.missions ?? []).map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.title}
                          {m.starts_at
                            ? ` · ${new Date(m.starts_at).toLocaleString("de-DE")}`
                            : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Zusatztext (optional)</Label>
                  <Textarea
                    rows={3}
                    maxLength={1000}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Kurzer Hinweis über der Einsatzbeschreibung."
                  />
                </div>

                <EmbedPreview
                  color={color}
                  title={mission?.title ?? "Vorschau"}
                  body={[note, mission?.description].filter(Boolean).join("\n\n")}
                  footer={
                    mission?.starts_at
                      ? `Start: ${new Date(mission.starts_at).toLocaleString("de-DE")}`
                      : undefined
                  }
                />

                <Button
                  onClick={() => announceM.mutate()}
                  disabled={
                    !channelId ||
                    !missionId ||
                    (mention === "role" && !mentionRoleId) ||
                    announceM.isPending
                  }
                >
                  <Send className="mr-2 h-4 w-4" />
                  {announceM.isPending ? "Sende…" : "Ankündigung posten"}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="channels" className="mt-4">
            <ChannelManager orgId={orgId!} />
          </TabsContent>
        </Tabs>
      )}

      {(data?.posts ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verlauf</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {(data?.posts ?? []).map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-brand/10 px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate">{p.title ?? "(ohne Titel)"}</div>
                  <div className="font-mono text-[11px] text-muted-foreground">
                    #{p.channel_name ?? p.channel_id} ·{" "}
                    {new Date(p.created_at).toLocaleString("de-DE")} ·{" "}
                    {p.kind === "event" ? "Event" : "Nachricht"}
                  </div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => delM.mutate(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * Auswahl der Discord-Rollen, die einen privaten Channel sehen dürfen.
 * Leere Auswahl = alle der Orga zugeordneten Rollen.
 */
function RolePicker({
  roles,
  value,
  disabled,
  onSave,
}: {
  roles: { id: string; name: string }[];
  value: string[];
  disabled?: boolean;
  onSave: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>(value);

  const label =
    value.length === 0
      ? "alle Orga-Rollen"
      : roles
          .filter((r) => value.includes(r.id))
          .map((r) => `@${r.name}`)
          .join(", ");

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setSel(value);
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled} className="h-7 max-w-[220px]">
          <Users className="mr-2 h-3.5 w-3.5" />
          <span className="truncate text-xs">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2">
        <p className="text-xs text-muted-foreground">
          Sichtbar für ausgewählte Rollen — ohne Auswahl gilt: alle Orga-Rollen.
        </p>
        <div className="max-h-56 space-y-1 overflow-auto">
          {roles.map((r) => (
            <label key={r.id} className="flex items-center gap-2 rounded-md px-1 py-1 text-sm">
              <Checkbox
                checked={sel.includes(r.id)}
                onCheckedChange={(v) =>
                  setSel((s) => (v ? [...s, r.id] : s.filter((x) => x !== r.id)))
                }
              />
              <span className="truncate">@{r.name}</span>
            </label>
          ))}
        </div>
        <div className="flex justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSel([])}>
            Alle
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onSave(sel);
              setOpen(false);
            }}
          >
            Übernehmen
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ChannelManager({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const stateFn = useServerFn(getOrgDiscordChannelAdmin);
  const createFn = useServerFn(createOrgDiscordChannel);
  const renameFn = useServerFn(renameOrgDiscordChannel);
  const deleteFn = useServerFn(deleteOrgDiscordChannel);
  const visFn = useServerFn(setOrgDiscordChannelVisibility);

  const { data, isLoading } = useQuery({
    queryKey: ["org-discord-channels", orgId],
    queryFn: () => stateFn({ data: { org_id: orgId } }),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org-discord-channels", orgId] });
    qc.invalidateQueries({ queryKey: ["org-discord", orgId] });
  };

  const [newName, setNewName] = useState<Record<string, string>>({});
  const [newKind, setNewKind] = useState<Record<string, "text" | "voice">>({});
  const [newPrivate, setNewPrivate] = useState<Record<string, boolean>>({});
  const [newRoles, setNewRoles] = useState<Record<string, string[]>>({});
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const createM = useMutation({
    mutationFn: (v: {
      category_id: string;
      name: string;
      kind: "text" | "voice";
      visibility: "public" | "private";
      role_ids?: string[];
    }) =>
      createFn({ data: { org_id: orgId, ...v } }),
    onSuccess: (_r, v) => {
      setNewName((s) => ({ ...s, [v.category_id]: "" }));
      toast.success("Channel angelegt.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const visM = useMutation({
    mutationFn: (v: {
      channel_id: string;
      visibility: "public" | "private";
      role_ids?: string[];
    }) =>
      visFn({ data: { org_id: orgId, ...v } }),
    onSuccess: (_r, v) => {
      toast.success(
        v.visibility === "private"
          ? "Channel ist jetzt nur für die Orga-Rollen sichtbar."
          : "Channel ist jetzt öffentlich sichtbar.",
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const renameM = useMutation({
    mutationFn: (v: { channel_id: string; name: string }) =>
      renameFn({ data: { org_id: orgId, ...v } }),
    onSuccess: () => {
      setEditing(null);
      toast.success("Channel umbenannt.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteM = useMutation({
    mutationFn: (channel_id: string) => deleteFn({ data: { org_id: orgId, channel_id } }),
    onSuccess: () => {
      toast.success("Channel gelöscht.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="font-mono text-xs text-muted-foreground">// lade…</p>;
  }

  const categories = data?.categories ?? [];
  const orgRoles = data?.orgRoles ?? [];

  return (
    <div className="space-y-4">
      {data?.error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {data.error}
        </p>
      )}

      {categories.length === 0 && (
        <div className="rounded-xl border border-brand/15 bg-card/40 p-6 text-sm text-muted-foreground">
          Für deine Orga ist noch keine Discord-Kategorie freigegeben. Die App-Administration
          kann euch eine Kategorie zuweisen, in der ihr eigene Channels anlegen dürft.
        </div>
      )}

      {categories.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Privat bedeutet: nur sichtbar für{" "}
          {orgRoles.length > 0
            ? orgRoles.map((r) => `@${r.name}`).join(", ")
            : "— aktuell ist deiner Orga keine Discord-Rolle zugeordnet"}
          . Öffentlich bedeutet: für alle auf dem Discord sichtbar.
        </p>
      )}

      {categories.map((cat) => (
        <Card key={cat.category_id}>
          <CardHeader>
            <CardTitle className="text-base uppercase tracking-wide">
              {cat.category_name}
            </CardTitle>
            <p className="font-mono text-[11px] text-muted-foreground">
              {cat.used} / {cat.max_channels} eigene Channels ·{" "}
              {[
                cat.can_create ? "anlegen" : null,
                cat.can_rename ? "umbenennen" : null,
                cat.can_delete ? "löschen" : null,
              ]
                .filter(Boolean)
                .join(", ") || "nur lesen"}
            </p>
          </CardHeader>
          <CardContent className="space-y-3">
            {cat.channels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-brand/10 px-3 py-2 text-sm"
              >
                {editing?.id === ch.id ? (
                  <div className="flex flex-1 items-center gap-2">
                    <Input
                      value={editing.name}
                      maxLength={90}
                      onChange={(e) => setEditing({ id: ch.id, name: e.target.value })}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      disabled={renameM.isPending}
                      onClick={() =>
                        renameM.mutate({ channel_id: ch.id, name: editing.name })
                      }
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => setEditing(null)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <span className="truncate">
                      {ch.kind === "voice" ? "🔊 " : "#"}
                      {ch.name}
                      <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                        {ch.visibility === "private" ? "privat" : "öffentlich"}
                      </span>
                      {!ch.managed && (
                        <span className="ml-2 font-mono text-[10px] uppercase text-muted-foreground">
                          bestehend
                        </span>
                      )}
                    </span>
                    <div className="flex shrink-0 items-center gap-1">
                      <div className="mr-2 flex items-center gap-2">
                        {ch.visibility === "private" ? (
                          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                        ) : (
                          <Globe className="h-3.5 w-3.5 text-muted-foreground" />
                        )}
                        <Switch
                          checked={ch.visibility === "private"}
                          disabled={!ch.managed || visM.isPending}
                          onCheckedChange={(v) =>
                            visM.mutate({
                              channel_id: ch.id,
                              visibility: v ? "private" : "public",
                              role_ids: v ? ch.visible_role_ids : [],
                            })
                          }
                        />
                      </div>
                      {ch.managed && ch.visibility === "private" && orgRoles.length > 0 && (
                        <RolePicker
                          roles={orgRoles}
                          value={ch.visible_role_ids}
                          disabled={visM.isPending}
                          onSave={(ids) =>
                            visM.mutate({
                              channel_id: ch.id,
                              visibility: "private",
                              role_ids: ids,
                            })
                          }
                        />
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!ch.managed || !cat.can_rename}
                        onClick={() => setEditing({ id: ch.id, name: ch.name })}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        disabled={!ch.managed || !cat.can_delete || deleteM.isPending}
                        onClick={() => {
                          if (confirm(`Channel „${ch.name}" wirklich löschen?`)) {
                            deleteM.mutate(ch.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {cat.can_create && (
              <div className="flex flex-wrap items-end gap-2 pt-1">
                <div className="min-w-[200px] flex-1 space-y-1.5">
                  <Label>Neuer Channel</Label>
                  <Input
                    value={newName[cat.category_id] ?? ""}
                    maxLength={90}
                    placeholder="z. B. einsatz-briefing"
                    onChange={(e) =>
                      setNewName((s) => ({ ...s, [cat.category_id]: e.target.value }))
                    }
                  />
                </div>
                <Select
                  value={newKind[cat.category_id] ?? "text"}
                  onValueChange={(v) =>
                    setNewKind((s) => ({ ...s, [cat.category_id]: v as "text" | "voice" }))
                  }
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text</SelectItem>
                    <SelectItem value="voice">Voice</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-2 pb-2">
                  <Switch
                    checked={!!newPrivate[cat.category_id]}
                    onCheckedChange={(v) =>
                      setNewPrivate((s) => ({ ...s, [cat.category_id]: v }))
                    }
                  />
                  <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    privat
                  </span>
                  {newPrivate[cat.category_id] && orgRoles.length > 0 && (
                    <RolePicker
                      roles={orgRoles}
                      value={newRoles[cat.category_id] ?? []}
                      onSave={(ids) =>
                        setNewRoles((s) => ({ ...s, [cat.category_id]: ids }))
                      }
                    />
                  )}
                </div>
                <Button
                  disabled={
                    !(newName[cat.category_id] ?? "").trim() ||
                    cat.used >= cat.max_channels ||
                    createM.isPending
                  }
                  onClick={() =>
                    createM.mutate({
                      category_id: cat.category_id,
                      name: (newName[cat.category_id] ?? "").trim(),
                      kind: newKind[cat.category_id] ?? "text",
                      visibility: newPrivate[cat.category_id] ? "private" : "public",
                      role_ids: newPrivate[cat.category_id]
                        ? (newRoles[cat.category_id] ?? [])
                        : [],
                    })
                  }
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Anlegen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmbedPreview({
  color,
  title,
  body,
  imageUrl,
  footer,
}: {
  color: string;
  title: string;
  body?: string;
  imageUrl?: string;
  footer?: string;
}) {
  return (
    <div className="rounded-xl border border-brand/10 bg-background/40 p-3">
      <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        // vorschau
      </div>
      <div
        className="rounded-md bg-card/70 p-3"
        style={{ borderLeft: `4px solid ${color}` }}
      >
        <div className="font-display text-sm">{title}</div>
        {body && (
          <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{body}</p>
        )}
        {imageUrl && (
          <img
            src={imageUrl}
            alt=""
            className="mt-2 max-h-40 rounded-md object-cover"
            loading="lazy"
          />
        )}
        {footer && <div className="mt-2 text-xs text-muted-foreground">{footer}</div>}
      </div>
    </div>
  );
}
