import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Send, Trash2, Pencil, MessageSquare, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getAdminDiscordPostState,
  postAdminDiscordMessage,
  editAdminDiscordMessage,
  deleteAdminDiscordPost,
} from "@/lib/discord.functions";

/**
 * App-Admin-Werkzeug: eingebettete Bot-Nachrichten in beliebige Channel
 * des Discord-Servers senden, nachträglich bearbeiten und löschen.
 */
export function AdminBroadcast() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getAdminDiscordPostState);
  const postFn = useServerFn(postAdminDiscordMessage);
  const editFn = useServerFn(editAdminDiscordMessage);
  const delFn = useServerFn(deleteAdminDiscordPost);

  const { data, isLoading } = useQuery({
    queryKey: ["discord-admin-posts"],
    queryFn: () => stateFn(),
  });

  const [channelId, setChannelId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [footer, setFooter] = useState("");
  const [color, setColor] = useState("#7dd3fc");
  const [mention, setMention] = useState<"none" | "everyone" | "here" | "role">("none");
  const [roleId, setRoleId] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const channels = data?.channels ?? [];
  const grouped = useMemo(() => {
    const map = new Map<string, typeof channels>();
    for (const c of channels) {
      const key = c.parentName ?? "Ohne Kategorie";
      map.set(key, [...(map.get(key) ?? []), c]);
    }
    return [...map.entries()];
  }, [channels]);

  const reset = () => {
    setTitle("");
    setBody("");
    setImageUrl("");
    setFooter("");
    setMention("none");
    setRoleId("");
    setEditId(null);
  };

  const send = useMutation({
    mutationFn: () =>
      editId
        ? editFn({
            data: {
              id: editId,
              title,
              body,
              image_url: imageUrl.trim() || null,
              footer: footer.trim() || null,
              color,
            },
          })
        : postFn({
            data: {
              channel_id: channelId,
              title,
              body,
              image_url: imageUrl.trim() || null,
              footer: footer.trim() || null,
              color,
              mention,
              mention_role_id: mention === "role" ? roleId || null : null,
            },
          }),
    onSuccess: () => {
      toast.success(editId ? "Nachricht aktualisiert." : "Nachricht gesendet.");
      reset();
      qc.invalidateQueries({ queryKey: ["discord-admin-posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Nachricht gelöscht.");
      qc.invalidateQueries({ queryKey: ["discord-admin-posts"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSend =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (editId ? true : channelId.length > 0) &&
    (mention !== "role" || !!roleId);

  return (
    <div className="space-y-6">
      {data?.error && (
        <p className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="h-4 w-4" /> {data.error}
        </p>
      )}

      <div className="grid gap-4 rounded-xl border border-border/60 bg-card/60 p-5 backdrop-blur">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Channel</Label>
            <Select value={channelId} onValueChange={setChannelId} disabled={!!editId}>
              <SelectTrigger>
                <SelectValue placeholder={isLoading ? "Lädt…" : "Channel wählen"} />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([cat, list]) => (
                  <div key={cat}>
                    <div className="px-2 py-1 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {cat}
                    </div>
                    {list.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        #{c.name}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Erwähnung</Label>
            <div className="flex gap-2">
              <Select
                value={mention}
                onValueChange={(v) => setMention(v as typeof mention)}
                disabled={!!editId}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Keine</SelectItem>
                  <SelectItem value="everyone">@everyone</SelectItem>
                  <SelectItem value="here">@here</SelectItem>
                  <SelectItem value="role">Rolle…</SelectItem>
                </SelectContent>
              </Select>
              {mention === "role" && (
                <Select value={roleId} onValueChange={setRoleId} disabled={!!editId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Rolle" />
                  </SelectTrigger>
                  <SelectContent>
                    {(data?.roles ?? []).map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label>Titel</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} />
        </div>

        <div className="space-y-1.5">
          <Label>Text</Label>
          <Textarea
            rows={6}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={4000}
            placeholder="Markdown wird unterstützt."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label>Bild-URL (optional)</Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Footer (optional)</Label>
            <Input value={footer} onChange={(e) => setFooter(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Farbe</Label>
            <Input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-full p-1"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => send.mutate()} disabled={!canSend || send.isPending}>
            <Send className="mr-2 h-4 w-4" />
            {editId ? "Nachricht aktualisieren" : "Nachricht senden"}
          </Button>
          {editId && (
            <Button variant="secondary" onClick={reset}>
              Abbrechen
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 font-display text-sm tracking-tight">
          <MessageSquare className="h-4 w-4" /> Zuletzt gesendet
        </h3>
        {(data?.posts ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground">Noch keine Admin-Nachrichten.</p>
        )}
        <ul className="space-y-2">
          {(data?.posts ?? []).map((p) => (
            <li
              key={p.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-card/40 px-4 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-sm">{p.title ?? "(ohne Titel)"}</p>
                <p className="font-mono text-[11px] text-muted-foreground">
                  #{p.channel_name ?? p.channel_id} ·{" "}
                  {new Date(p.created_at).toLocaleString("de-DE")}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setEditId(p.id);
                    setTitle(p.title ?? "");
                    toast.info("Text anpassen und „Nachricht aktualisieren“ drücken.");
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => remove.mutate(p.id)}
                  disabled={remove.isPending}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
