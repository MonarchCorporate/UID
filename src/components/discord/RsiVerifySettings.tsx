import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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
  getRsiVerifyDiscordSettings,
  setRsiVerifyDiscordSettings,
} from "@/lib/rsi-discord.functions";
import { getDiscordAdminState } from "@/lib/discord.functions";

/**
 * App-Admin: Was passiert auf Discord, sobald ein Nutzer seinen RSI-Account
 * verifiziert hat (Umbenennen auf den Handle, "Verifiziert"-Rolle).
 */
export function RsiVerifySettings() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getRsiVerifyDiscordSettings);
  const saveFn = useServerFn(setRsiVerifyDiscordSettings);
  const stateFn = useServerFn(getDiscordAdminState);

  const { data } = useQuery({ queryKey: ["rsi-verify-discord"], queryFn: () => loadFn() });
  const { data: state } = useQuery({ queryKey: ["discord-admin"], queryFn: () => stateFn() });

  const [renameEnabled, setRenameEnabled] = useState(true);
  const [roleEnabled, setRoleEnabled] = useState(true);
  const [roleId, setRoleId] = useState<string>("");

  useEffect(() => {
    if (!data) return;
    setRenameEnabled(data.renameEnabled);
    setRoleEnabled(data.roleEnabled);
    setRoleId(data.roleId ?? "");
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({ data: { renameEnabled, roleEnabled, roleId: roleId || null } }),
    onSuccess: () => {
      toast.success("Einstellungen gespeichert.");
      qc.invalidateQueries({ queryKey: ["rsi-verify-discord"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4 rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Auf RSI-Handle umbenennen</Label>
          <p className="text-xs text-muted-foreground">
            Der Discord-Nickname wird nach der Verifizierung auf den RSI-Handle gesetzt.
          </p>
        </div>
        <Switch checked={renameEnabled} onCheckedChange={setRenameEnabled} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label>Rolle „Verifiziert" vergeben</Label>
          <p className="text-xs text-muted-foreground">
            Nach erfolgreicher RSI-Verifizierung erhält das Mitglied diese Rolle.
          </p>
        </div>
        <Switch checked={roleEnabled} onCheckedChange={setRoleEnabled} />
      </div>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Discord-Rolle</Label>
        <Select value={roleId} onValueChange={setRoleId} disabled={!roleEnabled}>
          <SelectTrigger className="w-72">
            <SelectValue placeholder="Rolle wählen" />
          </SelectTrigger>
          <SelectContent>
            {(state?.roles ?? []).map((r) => (
              <SelectItem key={r.id} value={r.id}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Button onClick={() => save.mutate()} disabled={save.isPending}>
        {save.isPending ? "Speichern…" : "Speichern"}
      </Button>
    </div>
  );
}
