import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Smile, AlertTriangle, Send } from "lucide-react";
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
  getReactionRoleState,
  createReactionRolePanel,
  updateReactionRolePanel,
  deleteReactionRolePanel,
} from "@/lib/discord.functions";

type Option = { emoji: string; role_id: string; role_name: string; description?: string | null };

/**
 * App-Admin-Werkzeug: Nachricht posten, auf die Mitglieder reagieren, um
 * automatisch die hinterlegte Discord-Rolle zu erhalten.
 */
export function ReactionRolePanels() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getReactionRoleState);
  const createFn = useServerFn(createReactionRolePanel);
  const updateFn = useServerFn(updateReactionRolePanel);
  const deleteFn = useServerFn(deleteReactionRolePanel);

  const { data, isLoading } = useQuery({
    queryKey: ["discord-reaction-roles"],
    queryFn: () => stateFn(),
  });

  const [channelId, setChannelId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [color, setColor] = useState("#7dd3fc");
  const [options, setOptions] = useState<Option[]>([]);
  const [emoji, setEmoji] = useState("");
  const [roleId, setRoleId] = useState("");
  const [optDesc, setOptDesc] = useState("");
  const [editId, setEditId] = useState<string | null>(null);

  const channels = data?.channels ?? [];
  const roles = data?.roles ?? [];
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
    setOptions([]);
    setEmoji("");
    setRoleId("");
    setOptDesc("");
    setEditId(null);
  };

  const addOption = () => {
    const role = roles.find((r) => r.id === roleId);
    if (!emoji.trim() || !role) {
      toast.error("Emoji und Rolle auswählen.");
      return;
    }
    if (options.some((o) => o.emoji === emoji.trim())) {
      toast.error("Dieses Emoji ist schon vergeben.");
      return;
    }
    setOptions([
      ...options,
      {
        emoji: emoji.trim(),
        role_id: role.id,
        role_name: role.name,
        description: optDesc.trim() || null,
      },
    ]);
    setEmoji("");
    setRoleId("");
    setOptDesc("");
  };

  const save = useMutation({
    mutationFn: () => {
      const payload = { channel_id: channelId, title, body, color, options };
      return editId ? updateFn({ data: { ...payload, id: editId } }) : createFn({ data: payload });
    },
    onSuccess: () => {
      toast.success(editId ? "Nachricht aktualisiert." : "Nachricht gepostet.");
      reset();
      void qc.invalidateQueries({ queryKey: ["discord-reaction-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Nachricht gelöscht.");
      void qc.invalidateQueries({ queryKey: ["discord-reaction-roles"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const canSave = title.trim() && options.length > 0 && (editId || channelId);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Smile className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Reaktions-Rollen</h3>
      </div>
      <p className="text-xs text-muted-foreground">
        Der Bot postet eine Nachricht mit den gewählten Emojis. Wer reagiert, bekommt die
        zugeordnete Rolle – wer die Reaktion entfernt, verliert sie wieder. Eigene Server-Emojis
        im Format <code>name:id</code> angeben.
      </p>

      {data?.error ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
          <span>{data.error}</span>
        </div>
      ) : null}

      <div className="grid gap-4 rounded-xl border border-border/60 bg-card/40 p-4">
        {!editId ? (
          <div className="grid gap-2">
            <Label>Channel</Label>
            <Select value={channelId} onValueChange={setChannelId}>
              <SelectTrigger>
                <SelectValue placeholder="Channel wählen" />
              </SelectTrigger>
              <SelectContent>
                {grouped.map(([group, list]) => (
                  <div key={group}>
                    <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground">
                      {group}
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
        ) : null}

        <div className="grid gap-2 sm:grid-cols-[1fr_120px]">
          <div className="grid gap-2">
            <Label>Titel</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={256} />
          </div>
          <div className="grid gap-2">
            <Label>Farbe</Label>
            <Input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label>Text</Label>
          <Textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        <div className="grid gap-2">
          <Label>Emoji → Rolle</Label>
          <div className="grid gap-2 sm:grid-cols-[90px_1fr_1fr_auto]">
            <Input
              placeholder="✅"
              value={emoji}
              onChange={(e) => setEmoji(e.target.value)}
              maxLength={60}
            />
            <Select value={roleId} onValueChange={setRoleId}>
              <SelectTrigger>
                <SelectValue placeholder="Rolle" />
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Beschreibung (optional)"
              value={optDesc}
              onChange={(e) => setOptDesc(e.target.value)}
              maxLength={200}
            />
            <Button type="button" variant="secondary" onClick={addOption}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {options.length > 0 ? (
            <ul className="grid gap-1">
              {options.map((o) => (
                <li
                  key={o.emoji}
                  className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2 text-xs"
                >
                  <span>
                    {o.emoji} → <strong>{o.role_name}</strong>
                    {o.description ? ` · ${o.description}` : ""}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setOptions(options.filter((x) => x.emoji !== o.emoji))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button disabled={!canSave || save.isPending} onClick={() => save.mutate()}>
            <Send className="mr-2 h-4 w-4" />
            {editId ? "Aktualisieren" : "Posten"}
          </Button>
          {editId ? (
            <Button variant="ghost" onClick={reset}>
              Abbrechen
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-2">
        {isLoading ? <p className="text-xs text-muted-foreground">Lade …</p> : null}
        {(data?.panels ?? []).map((p) => {
          const opts = Array.isArray(p.options) ? (p.options as Option[]) : [];
          return (
            <div
              key={p.id}
              className="flex items-start justify-between gap-3 rounded-xl border border-border/60 bg-card/40 p-3"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{p.title}</p>
                <p className="text-xs text-muted-foreground">
                  #{p.channel_name} · {opts.map((o) => `${o.emoji} ${o.role_name}`).join(" · ")}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => {
                    setEditId(p.id);
                    setChannelId(p.channel_id);
                    setTitle(p.title);
                    setBody(p.body ?? "");
                    setOptions(opts);
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate(p.id)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
