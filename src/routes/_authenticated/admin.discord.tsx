import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { MessageSquare, RefreshCw, Trash2, Bot, ExternalLink, Copy, CheckCircle2, AlertTriangle, UserCog, Info } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";
import { OrgChannelAdmin } from "@/components/discord/OrgChannelAdmin";
import { OrgCategoryAdmin } from "@/components/discord/OrgCategoryAdmin";
import { CategoryTemplateAdmin } from "@/components/discord/CategoryTemplateAdmin";
import { MembershipApplicationAdmin } from "@/components/discord/MembershipApplicationAdmin";
import { AdminBroadcast } from "@/components/discord/AdminBroadcast";
import { ReactionRolePanels } from "@/components/discord/ReactionRolePanels";
import { RsiVerifySettings } from "@/components/discord/RsiVerifySettings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDiscordAdminState,
  upsertDiscordMapping,
  setDiscordMappingLead,
  setDiscordMappingEnabled,
  deleteDiscordMapping,
  setDiscordSettings,
  runDiscordFullSync,
  getDiscordBotInvite,
  getDiscordBotProfile,
  saveDiscordBotProfile,
} from "@/lib/discord.functions";

export const Route = createFileRoute("/_authenticated/admin/discord")({
  component: AdminDiscordPage,
});

function roleColor(color: number) {
  return color ? `#${color.toString(16).padStart(6, "0")}` : "#99aab5";
}

function AdminDiscordPage() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getDiscordAdminState);
  const upsertFn = useServerFn(upsertDiscordMapping);
  const toggleFn = useServerFn(setDiscordMappingEnabled);
  const leadFn = useServerFn(setDiscordMappingLead);
  const deleteFn = useServerFn(deleteDiscordMapping);
  const settingsFn = useServerFn(setDiscordSettings);
  const syncFn = useServerFn(runDiscordFullSync);
  const inviteFn = useServerFn(getDiscordBotInvite);
  const profileFn = useServerFn(getDiscordBotProfile);
  const saveProfileFn = useServerFn(saveDiscordBotProfile);

  const { data, isLoading } = useQuery({
    queryKey: ["discord-admin"],
    queryFn: () => stateFn(),
  });

  const { data: bot } = useQuery({
    queryKey: ["discord-bot-invite"],
    queryFn: () => inviteFn(),
  });

  const [roleId, setRoleId] = useState("");
  const [orgId, setOrgId] = useState("");

  const { data: botProfile } = useQuery({
    queryKey: ["discord-bot-profile"],
    queryFn: () => profileFn(),
  });

  const [botName, setBotName] = useState<string | null>(null);
  const [botNick, setBotNick] = useState<string | null>(null);
  const [avatarDataUri, setAvatarDataUri] = useState<string | null>(null);

  const nameValue = botName ?? botProfile?.profile?.username ?? "";
  const nickValue = botNick ?? botProfile?.profile?.nickname ?? "";

  const profileM = useMutation({
    mutationFn: () =>
      saveProfileFn({
        data: {
          username: nameValue.trim() || undefined,
          nickname: nickValue.trim(),
          avatarDataUri: avatarDataUri ?? undefined,
        },
      }),
    onSuccess: () => {
      setAvatarDataUri(null);
      setBotName(null);
      setBotNick(null);
      toast.success("Bot-Profil gespeichert.");
      qc.invalidateQueries({ queryKey: ["discord-bot-profile"] });
      qc.invalidateQueries({ queryKey: ["discord-bot-invite"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const onPickAvatar = (file: File | undefined) => {
    if (!file) return;
    if (file.size > 2_000_000) {
      toast.error("Bild ist zu groß (max. 2 MB).");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setAvatarDataUri(String(reader.result));
    reader.readAsDataURL(file);
  };

  const invalidate = () => qc.invalidateQueries({ queryKey: ["discord-admin"] });

  const addM = useMutation({
    mutationFn: async () => {
      const role = data?.roles.find((r) => r.id === roleId);
      if (!role || !orgId) throw new Error("Bitte Rolle und Orga auswählen.");
      return upsertFn({
        data: {
          discord_role_id: role.id,
          discord_role_name: role.name,
          discord_role_color: role.color,
          org_id: orgId,
          enabled: true,
        },
      });
    },
    onSuccess: () => {
      setRoleId("");
      setOrgId("");
      toast.success("Zuordnung gespeichert.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleM = useMutation({
    mutationFn: (v: { id: string; enabled: boolean }) => toggleFn({ data: v }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const delM = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Zuordnung entfernt.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const leadM = useMutation({
    mutationFn: (v: { id: string; is_lead: boolean }) => leadFn({ data: v }),
    onSuccess: (r) => {
      if (r.warning) toast.warning(`Discord-Rechte teilweise nicht gesetzt: ${r.warning}`);
      else toast.success("Leitungsrolle aktualisiert.");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const settingsM = useMutation({
    mutationFn: (remove_on_role_loss: boolean) =>
      settingsFn({ data: { remove_on_role_loss } }),
    onSuccess: invalidate,
    onError: (e: Error) => toast.error(e.message),
  });

  const syncM = useMutation({
    mutationFn: () => syncFn({ data: undefined }),
    onSuccess: (r) => {
      toast.success(
        `${r.users} Konten geprüft · ${r.added} Zuordnungen ergänzt · ${r.removed} entfernt${r.missing ? ` · ${r.missing} nicht auf dem Server` : ""}`,
      );
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <PageShell
      eyebrow="Administration"
      title="Discord-Anbindung"
      description="Discord-Rollen des zentralen Servers auf Organisationen abbilden."
    >
      {isLoading && (
        <p className="font-mono text-xs text-muted-foreground">// lade…</p>
      )}

      {data && !data.configured && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-5 text-sm">
          <p className="font-display text-base">Discord nicht erreichbar</p>
          <p className="mt-2 text-muted-foreground">{data.error}</p>
          <p className="mt-2 text-muted-foreground">
            Prüfe, ob der Bot auf dem Server ist und die Server-ID stimmt.
          </p>
        </div>
      )}

      {data && (
        <>
          <section className="space-y-4">
            <SectionHeader
              icon={Bot}
              title="Bot einladen"
              subtitle="Der Bot liest Rollen und Mitglieder des Servers aus."
            />
            <div className="space-y-4 rounded-2xl border border-brand/15 bg-card/40 p-5">
              {bot?.error && (
                <p className="text-sm text-destructive">{bot.error}</p>
              )}
              {bot?.status && (
                <div className="flex items-start gap-2 text-sm">
                  {bot.status.onGuild && bot.status.canManageRoles ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
                  )}
                  <div>
                    <p className="font-display text-sm">
                      {bot.status.botName ? `Bot „${bot.status.botName}"` : "Bot"}
                      {bot.status.onGuild
                        ? ` ist auf ${bot.status.guildName ?? "dem Server"}`
                        : " ist noch nicht auf dem Server"}
                    </p>
                    {bot.status.message && (
                      <p className="mt-1 text-muted-foreground">{bot.status.message}</p>
                    )}
                  </div>
                </div>
              )}
              <p className="text-sm text-muted-foreground">
                Über den Button öffnet sich Discord und der Bot kann mit den nötigen
                Rechten (Rollen verwalten, Kanäle sehen) auf den Server geholt werden.
                Dafür braucht man auf dem Server das Recht „Server verwalten".
              </p>
              <div className="flex flex-wrap gap-3">
                <Button
                  disabled={!bot?.inviteUrl}
                  onClick={() => window.open(bot!.inviteUrl!, "_blank", "noopener")}
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Bot auf den Server einladen
                </Button>
                <Button
                  variant="outline"
                  disabled={!bot?.inviteUrlAnyServer}
                  onClick={() =>
                    window.open(bot!.inviteUrlAnyServer!, "_blank", "noopener")
                  }
                >
                  Anderen Server wählen
                </Button>
                <Button
                  variant="ghost"
                  disabled={!bot?.inviteUrlAnyServer}
                  onClick={() => {
                    navigator.clipboard.writeText(bot!.inviteUrlAnyServer!);
                    toast.success("Einladungslink kopiert.");
                  }}
                >
                  <Copy className="mr-2 h-4 w-4" />
                  Link kopieren
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    qc.invalidateQueries({ queryKey: ["discord-bot-invite"] });
                    invalidate();
                  }}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Status prüfen
                </Button>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={UserCog}
              title="Bot-Profil"
              subtitle="Name, Server-Nickname und Profilbild des Bots anpassen."
            />
            <div className="space-y-5 rounded-2xl border border-brand/15 bg-card/40 p-5">
              {botProfile?.error && (
                <p className="text-sm text-destructive">{botProfile.error}</p>
              )}
              <div className="flex flex-wrap items-center gap-5">
                <div className="flex items-center gap-4">
                  <img
                    src={
                      avatarDataUri ??
                      botProfile?.profile?.avatarUrl ??
                      "https://cdn.discordapp.com/embed/avatars/0.png"
                    }
                    alt="Aktuelles Profilbild des Discord-Bots"
                    className="h-16 w-16 rounded-full border border-brand/20 object-cover"
                  />
                  <div className="space-y-2">
                    <Label htmlFor="bot-avatar" className="text-xs text-muted-foreground">
                      Profilbild (PNG, JPG oder GIF, max. 2 MB)
                    </Label>
                    <Input
                      id="bot-avatar"
                      type="file"
                      accept="image/png,image/jpeg,image/gif"
                      className="w-64"
                      onChange={(e) => onPickAvatar(e.target.files?.[0])}
                    />
                  </div>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bot-name" className="text-xs text-muted-foreground">
                    Bot-Name (global)
                  </Label>
                  <Input
                    id="bot-name"
                    value={nameValue}
                    maxLength={32}
                    placeholder="UID Assistant"
                    onChange={(e) => setBotName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bot-nick" className="text-xs text-muted-foreground">
                    Anzeigename auf diesem Server
                  </Label>
                  <Input
                    id="bot-nick"
                    value={nickValue}
                    maxLength={32}
                    placeholder="leer = globaler Name"
                    onChange={(e) => setBotNick(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-xl border border-brand/10 bg-background/40 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Der grüne „Online"-Punkt entsteht nur durch eine dauerhafte
                  Discord-Gateway-Verbindung. Dieses Backoffice läuft serverlos ohne
                  Dauerverbindung, deshalb bleibt der Bot offline – Rollen-Auslesen und
                  Synchronisierung funktionieren trotzdem vollständig.
                </span>
              </div>
              <Button onClick={() => profileM.mutate()} disabled={profileM.isPending}>
                {profileM.isPending ? "Speichere…" : "Bot-Profil speichern"}
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={MessageSquare}
              title="Rollen-Zuordnung"
              subtitle="Wer diese Discord-Rolle trägt, wird Mitglied der Orga. Die Leitungsrolle erhält in allen freigegebenen Kategorien und Bot-Kanälen volle Verwaltungsrechte."
            />
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-brand/15 bg-card/40 p-4">
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Discord-Rolle" />
                </SelectTrigger>
                <SelectContent>
                  {data.roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{ background: roleColor(r.color) }}
                        />
                        {r.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={orgId} onValueChange={setOrgId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Organisation" />
                </SelectTrigger>
                <SelectContent>
                  {data.orgs.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                      {o.tag ? ` [${o.tag}]` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                onClick={() => addM.mutate()}
                disabled={addM.isPending || !roleId || !orgId}
              >
                Zuordnen
              </Button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-brand/15">
              <table className="w-full text-sm">
                <thead className="bg-card/60 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <tr>
                    <th className="p-3 text-left">Discord-Rolle</th>
                    <th className="p-3 text-left">Organisation</th>
                    <th className="p-3 text-left">Aktiv</th>
                    <th className="p-3 text-left">Leitung</th>
                    <th className="p-3" />
                  </tr>
                </thead>
                <tbody>
                  {data.mappings.length === 0 && (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">
                        Noch keine Zuordnungen.
                      </td>
                    </tr>
                  )}
                  {data.mappings.map((m) => (
                    <tr key={m.id} className="border-t border-brand/10">
                      <td className="p-3">
                        <span className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full"
                            style={{ background: roleColor(m.discord_role_color) }}
                          />
                          {m.discord_role_name}
                        </span>
                      </td>
                      <td className="p-3">
                        {data.orgs.find((o) => o.id === m.org_id)?.name ?? "—"}
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={m.enabled}
                          onCheckedChange={(v) =>
                            toggleM.mutate({ id: m.id, enabled: v })
                          }
                        />
                      </td>
                      <td className="p-3">
                        <Switch
                          checked={m.is_lead}
                          onCheckedChange={(v) => leadM.mutate({ id: m.id, is_lead: v })}
                        />
                      </td>
                      <td className="p-3 text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => delM.mutate(m.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={RefreshCw}
              title="Synchronisierung"
              subtitle={`${data.linkedUsers} Konten mit Discord verknüpft${
                data.settings.last_full_sync_at
                  ? ` · zuletzt ${new Date(data.settings.last_full_sync_at).toLocaleString("de-DE")}`
                  : ""
              }`}
            />
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand/15 bg-card/40 p-5">
              <div className="max-w-md">
                <p className="font-display text-sm">Mitgliedschaft bei Rollenverlust entfernen</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Entfernt zugeordnete Mitgliedschaften (nur Rolle „member"), wenn die
                  passende Discord-Rolle fehlt.
                </p>
              </div>
              <Switch
                checked={data.settings.remove_on_role_loss}
                onCheckedChange={(v) => settingsM.mutate(v)}
              />
            </div>
            <Button
              onClick={() => syncM.mutate()}
              disabled={syncM.isPending || !data.configured}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              {syncM.isPending ? "Synchronisiere…" : "Jetzt alle Konten synchronisieren"}
            </Button>
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={MessageSquare}
              title="Bot-Nachrichten"
              subtitle="Eingebettete Nachrichten als Bot in jeden Channel des Servers senden, bearbeiten oder löschen."
            />
            <AdminBroadcast />
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={MessageSquare}
              title="Reaktions-Rollen"
              subtitle="Nachricht posten, auf die Mitglieder reagieren, um automatisch eine Rolle zu erhalten."
            />
            <ReactionRolePanels />
          </section>

          <section className="space-y-4">
            <SectionHeader
              icon={UserCog}
              title="RSI-Verifizierung"
              subtitle="Nach erfolgreicher RSI-Verifizierung Discord-Nickname auf den Handle setzen und die Rolle „Verifiziert“ vergeben."
            />
            <RsiVerifySettings />
          </section>

          <OrgChannelAdmin />

          <OrgCategoryAdmin />

          <CategoryTemplateAdmin />

          <MembershipApplicationAdmin />
        </>
      )}
    </PageShell>
  );
}
