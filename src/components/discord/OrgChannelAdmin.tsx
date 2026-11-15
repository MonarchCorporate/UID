import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Hash, Save } from "lucide-react";
import { SectionHeader } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getDiscordChannelState,
  setOrgDiscordChannels,
} from "@/lib/discord.functions";

type Draft = Record<
  string,
  {
    selected: boolean;
    allowMentions: boolean;
    allowHere: boolean;
    allowRoleMentions: boolean;
  }
>;

/**
 * App-Admin-Bereich: legt fest, in welchen Discord-Channels eine Orga
 * aus dem Backoffice heraus posten darf.
 */
export function OrgChannelAdmin() {
  const qc = useQueryClient();
  const stateFn = useServerFn(getDiscordChannelState);
  const saveFn = useServerFn(setOrgDiscordChannels);

  const { data, isLoading } = useQuery({
    queryKey: ["discord-channels"],
    queryFn: () => stateFn(),
  });

  const [orgId, setOrgId] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);

  const current: Draft = useMemo(() => {
    const base: Draft = {};
    for (const c of data?.channels ?? []) {
      const a = (data?.assignments ?? []).find(
        (x) => x.org_id === orgId && x.channel_id === c.id,
      );
      base[c.id] = {
        selected: !!a,
        allowMentions: !!a?.allow_mentions,
        allowHere: !!a?.allow_here,
        allowRoleMentions: !!a?.allow_role_mentions,
      };
    }
    return base;
  }, [data, orgId]);

  const value = draft ?? current;

  const set = (id: string, patch: Partial<Draft[string]>) =>
    setDraft({ ...value, [id]: { ...value[id], ...patch } });

  const saveM = useMutation({
    mutationFn: () =>
      saveFn({
        data: {
          org_id: orgId,
          channels: (data?.channels ?? [])
            .filter((c) => value[c.id]?.selected)
            .map((c) => ({
              channel_id: c.id,
              channel_name: c.name,
              allow_mentions: !!value[c.id]?.allowMentions,
              allow_here: !!value[c.id]?.allowHere,
              allow_role_mentions: !!value[c.id]?.allowRoleMentions,
            })),
        },
      }),
    onSuccess: () => {
      setDraft(null);
      toast.success("Channel-Freigaben gespeichert.");
      qc.invalidateQueries({ queryKey: ["discord-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const countFor = (id: string) =>
    (data?.assignments ?? []).filter((a) => a.org_id === id).length;

  return (
    <section className="space-y-4">
      <SectionHeader
        icon={Hash}
        title="Channel-Freigaben"
        subtitle="Bestimmt, in welchen Channels eine Orga mit dem Bot posten darf."
      />

      {data?.error && (
        <p className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          {data.error}
        </p>
      )}

      <div className="space-y-4 rounded-2xl border border-brand/15 bg-card/40 p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <Select
              value={orgId}
              onValueChange={(v) => {
                setOrgId(v);
                setDraft(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Organisation wählen" />
              </SelectTrigger>
              <SelectContent>
                {(data?.orgs ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.name}
                    {o.tag ? ` [${o.tag}]` : ""} · {countFor(o.id)} Channel
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => saveM.mutate()} disabled={!orgId || saveM.isPending}>
            <Save className="mr-2 h-4 w-4" />
            {saveM.isPending ? "Speichere…" : "Freigaben speichern"}
          </Button>
        </div>

        {isLoading && <p className="font-mono text-xs text-muted-foreground">// lade…</p>}

        {orgId && (
          <div className="max-h-[420px] space-y-1 overflow-auto rounded-xl border border-brand/10 p-2">
            {(data?.channels ?? []).map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-brand/5"
              >
                <label className="flex min-w-0 items-center gap-3">
                  <Checkbox
                    checked={!!value[c.id]?.selected}
                    onCheckedChange={(v) => set(c.id, { selected: !!v })}
                  />
                  <span className="truncate text-sm">
                    <span className="text-muted-foreground">
                      {c.parentName ? `${c.parentName} / ` : ""}
                    </span>
                    #{c.name}
                  </span>
                </label>
                <div className="flex shrink-0 flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      @everyone
                    </span>
                    <Switch
                      checked={!!value[c.id]?.allowMentions}
                      disabled={!value[c.id]?.selected}
                      onCheckedChange={(v) => set(c.id, { allowMentions: v })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      @here
                    </span>
                    <Switch
                      checked={!!value[c.id]?.allowHere}
                      disabled={!value[c.id]?.selected}
                      onCheckedChange={(v) => set(c.id, { allowHere: v })}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      Orga-Rolle
                    </span>
                    <Switch
                      checked={!!value[c.id]?.allowRoleMentions}
                      disabled={!value[c.id]?.selected}
                      onCheckedChange={(v) => set(c.id, { allowRoleMentions: v })}
                    />
                  </div>
                </div>
              </div>
            ))}
            {(data?.channels ?? []).length === 0 && !isLoading && (
              <p className="p-3 text-sm text-muted-foreground">Keine Textchannels gefunden.</p>
            )}
          </div>
        )}

        {!orgId && !isLoading && (
          <p className="text-sm text-muted-foreground">
            Wähle eine Organisation, um ihre Channels festzulegen.
          </p>
        )}
      </div>
    </section>
  );
}
