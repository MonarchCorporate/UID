import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bot, Loader2, RefreshCw, Save, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  getTreasuryDiscordSettings,
  saveTreasuryDiscordSettings,
  sendTreasuryDiscordPreview,
} from "@/lib/org-treasury.functions";

type Form = {
  channel_id: string | null;
  channel_name: string | null;
  post_deposits: boolean;
  deposits_show_name: boolean;
  post_withdrawals: boolean;
  withdrawals_show_name: boolean;
  post_monthly: boolean;
  monthly_day: number;
  monthly_hour: number;
};

const EMPTY: Form = {
  channel_id: null,
  channel_name: null,
  post_deposits: false,
  deposits_show_name: true,
  post_withdrawals: false,
  withdrawals_show_name: false,
  post_monthly: false,
  monthly_day: 1,
  monthly_hour: 10,
};

function Row({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-sm font-medium">{title}</div>
        <p className="text-xs text-muted-foreground">{hint}</p>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

export function TreasuryDiscordSettings({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getTreasuryDiscordSettings);
  const saveFn = useServerFn(saveTreasuryDiscordSettings);
  const previewFn = useServerFn(sendTreasuryDiscordPreview);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["treasury-discord", orgId],
    queryFn: () => getFn({ data: { org_id: orgId } }),
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const [form, setForm] = useState<Form>(EMPTY);
  useEffect(() => {
    const s = q.data?.settings;
    if (s) {
      setForm({
        channel_id: s.channel_id,
        channel_name: s.channel_name,
        post_deposits: s.post_deposits,
        deposits_show_name: s.deposits_show_name,
        post_withdrawals: s.post_withdrawals,
        withdrawals_show_name: s.withdrawals_show_name,
        post_monthly: s.post_monthly,
        monthly_day: s.monthly_day,
        monthly_hour: s.monthly_hour,
      });
    }
  }, [q.data]);

  const saveM = useMutation({
    mutationFn: () => saveFn({ data: { org_id: orgId, ...form } }),
    onSuccess: () => {
      toast.success("Bot-Einstellungen gespeichert");
      qc.invalidateQueries({ queryKey: ["treasury-discord", orgId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const previewM = useMutation({
    mutationFn: (type: "deposit" | "withdraw" | "monthly") =>
      previewFn({ data: { org_id: orgId, type } }),
    onSuccess: () => toast.success("Musternachricht gesendet"),
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Lade Bot-Einstellungen…
      </div>
    );
  }
  if (!q.data?.canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Dir fehlt die Berechtigung „Kassen-Discord-Updates konfigurieren“.
      </p>
    );
  }

  const channels = q.data.channels;
  const set = <K extends keyof Form>(k: K, v: Form[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="space-y-4">
      <Card className="border-white/10 bg-white/[0.04] backdrop-blur">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4 text-brand" /> Discord-Updates zur Orgakasse
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Channel</Label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => q.refetch()}
                disabled={q.isFetching}
              >
                <RefreshCw
                  className={`mr-1.5 h-3.5 w-3.5 ${q.isFetching ? "animate-spin" : ""}`}
                />
                Channels aktualisieren
              </Button>
            </div>
            {channels.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Für deine Orga ist noch kein Discord-Channel freigegeben. Ein
                App-Admin muss zuerst Channels für die Orga freigeben.
              </p>
            ) : (
              <Select
                value={form.channel_id ?? ""}
                onValueChange={(v) => {
                  const ch = channels.find((c) => c.channel_id === v);
                  setForm((f) => ({
                    ...f,
                    channel_id: v,
                    channel_name: ch?.channel_name ?? null,
                  }));
                }}
              >
                <SelectTrigger className="max-w-sm">
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
            )}
            {q.data.syncError ? (
              <p className="text-xs text-amber-400">
                Discord-Abgleich fehlgeschlagen: {q.data.syncError}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground">
                Die Liste wird bei jedem Öffnen live mit Discord abgeglichen.
              </p>
            )}
          </div>

          <Row
            title="Neue Einzahlungen posten"
            hint="Der Bot meldet jede neue Einzahlung mit Betrag, Kategorie und aktuellem Saldo."
          >
            <div className="flex items-center gap-2">
              <Switch
                checked={form.post_deposits}
                onCheckedChange={(v) => set("post_deposits", v)}
              />
              <span className="text-xs text-muted-foreground">aktiv</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.deposits_show_name}
                onCheckedChange={(v) => set("deposits_show_name", v)}
                disabled={!form.post_deposits}
              />
              <span className="text-xs text-muted-foreground">Spielername</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => previewM.mutate("deposit")}
              disabled={previewM.isPending}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Muster
            </Button>
          </Row>

          <Row
            title="Neue Auszahlungen & Ausgaben posten"
            hint="Meldet Auszahlungen an Mitglieder sowie Orga-Ausgaben."
          >
            <div className="flex items-center gap-2">
              <Switch
                checked={form.post_withdrawals}
                onCheckedChange={(v) => set("post_withdrawals", v)}
              />
              <span className="text-xs text-muted-foreground">aktiv</span>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={form.withdrawals_show_name}
                onCheckedChange={(v) => set("withdrawals_show_name", v)}
                disabled={!form.post_withdrawals}
              />
              <span className="text-xs text-muted-foreground">Spielername</span>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => previewM.mutate("withdraw")}
              disabled={previewM.isPending}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Muster
            </Button>
          </Row>

          <Row
            title="Monatliche Auswertung"
            hint="Einmal im Monat postet der Bot Einnahmen, Ausgaben, Netto und Saldo — inklusive Diagramm als Bild."
          >
            <div className="flex items-center gap-2">
              <Switch
                checked={form.post_monthly}
                onCheckedChange={(v) => set("post_monthly", v)}
              />
              <span className="text-xs text-muted-foreground">aktiv</span>
            </div>
            <Select
              value={String(form.monthly_day)}
              onValueChange={(v) => set("monthly_day", Number(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                  <SelectItem key={d} value={String(d)}>
                    {d}. Tag
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={String(form.monthly_hour)}
              onValueChange={(v) => set("monthly_hour", Number(v))}
            >
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 24 }, (_, i) => i).map((h) => (
                  <SelectItem key={h} value={String(h)}>
                    {String(h).padStart(2, "0")}:00 UTC
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              onClick={() => previewM.mutate("monthly")}
              disabled={previewM.isPending}
            >
              <Send className="mr-1.5 h-3.5 w-3.5" /> Muster
            </Button>
          </Row>

          <div className="flex justify-end">
            <Button onClick={() => saveM.mutate()} disabled={saveM.isPending}>
              {saveM.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-4 w-4" />
              )}
              Speichern
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Musternachrichten werden mit dem Hinweis „Musternachricht“ in den
            gewählten Channel gepostet. Speichere Änderungen, bevor du eine
            Musternachricht sendest.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
