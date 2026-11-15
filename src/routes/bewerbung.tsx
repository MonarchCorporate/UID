import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, LogIn, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UidPage, UidPageHeader, uidBtn } from "@/components/uid/UidPage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getApplicationForm, submitApplication } from "@/lib/membership-apply.functions";

const DISCORD_INVITE = "https://discord.gg/QMvCtbjyqe";

const STATUS_TEXT: Record<string, string> = {
  open: "Deine Bewerbung liegt zur Prüfung vor.",
  accepted: "Deine Bewerbung wurde angenommen.",
  rejected: "Deine Bewerbung wurde abgelehnt. Du kannst dich erneut bewerben.",
};

const title = "Beitreten — United Imperial Dominion";
const description =
  "Melde dich an oder bewirb dich mit deiner Organisation für eine Mitgliedschaft im Community United Imperial Dominion.";

export const Route = createFileRoute("/bewerbung")({
  ssr: false,
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ApplicationPage,
});

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-4 border border-brand/20 bg-card/40 p-6 backdrop-blur-sm">{children}</div>
  );
}

function ApplicationPage() {
  const qc = useQueryClient();
  const formFn = useServerFn(getApplicationForm);
  const submitFn = useServerFn(submitApplication);

  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setAuthed(!!data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => subscription.unsubscribe();
  }, []);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["membership-apply-form"],
    queryFn: () => formFn(),
    enabled: authed === true,
  });

  const [answers, setAnswers] = useState<Record<string, string | boolean>>({});
  const [done, setDone] = useState<string | null>(null);

  const submitM = useMutation({
    mutationFn: () => submitFn({ data: { answers } }),
    onSuccess: (r) => {
      setDone(r.successText);
      if (r.postError) toast.warning(`Gespeichert, Discord: ${r.postError}`);
      qc.invalidateQueries({ queryKey: ["membership-apply-form"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startDiscord = () => {
    try {
      sessionStorage.setItem("post_login_redirect", "/bewerbung");
    } catch {
      /* ignore */
    }
    window.location.href = "/api/public/auth/discord/start";
  };

  const s = data?.settings;
  const app = data?.application as
    | { id: string; status: string; review_note: string | null; created_at: string }
    | null
    | undefined;
  const pending = app && (app.status === "open" || app.status === "accepted");

  return (
    <UidPage backdrop="aurora" seed={4207}>
      <div className="mx-auto max-w-3xl px-6 pt-20 pb-24">
        <UidPageHeader
          label="Mitgliedschaft"
          title="Beitreten"
          intro="Wähle, wie du der UID beitreten möchtest: Melde dich an, um das Backoffice zu nutzen, oder bewirb dich mit deiner Organisation."
        />

        <Tabs defaultValue="login" className="mt-10">
          <TabsList className="w-full">
            <TabsTrigger value="login" className="flex-1 gap-2">
              <LogIn className="h-4 w-4" /> Einloggen
            </TabsTrigger>
            <TabsTrigger value="apply" className="flex-1 gap-2">
              <ShieldCheck className="h-4 w-4" /> Bewerbe dich mit deiner Orga
            </TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-6">
            {authed === false && (
              <Panel>
                <h2 className="font-display text-lg tracking-tight">Mit Discord anmelden</h2>
                <p className="text-sm text-muted-foreground">
                  Die UID nutzt Discord als einzigen Login. Tritt unserem Server bei oder melde dich
                  direkt an, um zum Backoffice zu gelangen.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a className={uidBtn} href={DISCORD_INVITE} target="_blank" rel="noreferrer">
                    Discord beitreten
                  </a>
                  <button type="button" className={uidBtn} onClick={startDiscord}>
                    Mit Discord anmelden
                  </button>
                </div>
              </Panel>
            )}

            {authed === true && (
              <Panel>
                <h2 className="font-display text-lg tracking-tight">Du bist angemeldet</h2>
                <p className="text-sm text-muted-foreground">
                  Du kannst das Backoffice nutzen oder dich für eine Mitgliedschaft bewerben.
                </p>
                <div className="flex flex-wrap gap-3">
                  <Button asChild>
                    <Link to="/dashboard">Zum Backoffice</Link>
                  </Button>
                  <Button variant="secondary" onClick={() => supabase.auth.signOut()}>
                    Abmelden
                  </Button>
                </div>
              </Panel>
            )}
          </TabsContent>

          <TabsContent value="apply" className="space-y-6">
            {authed === false && (
              <Panel>
                <h2 className="font-display text-lg tracking-tight">Zuerst anmelden</h2>
                <p className="text-sm text-muted-foreground">
                  Um dich mit deiner Organisation zu bewerben, melde dich bitte im Tab „Einloggen“
                  mit Discord an.
                </p>
                <button type="button" className={uidBtn} onClick={startDiscord}>
                  Mit Discord anmelden
                </button>
              </Panel>
            )}

            {authed === true && isLoading && (
            <p className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
              Formular wird geladen…
            </p>
          )}

          {authed === true && !isLoading && !s?.enabled && (
            <Panel>
              <p className="text-sm text-muted-foreground">Bewerbungen sind derzeit deaktiviert.</p>
            </Panel>
          )}

          {authed === true && s?.enabled && !data?.discordOnServer && (
            <Panel>
              <h2 className="font-display text-lg tracking-tight">Schritt 1 — Discord beitreten</h2>
              <p className="text-sm text-muted-foreground">
                {data?.discordLinked
                  ? "Wir konnten dich noch nicht auf unserem Discord-Server finden. Tritt bei und prüfe erneut."
                  : "Dein Konto ist noch nicht mit Discord verknüpft. Melde dich per Discord an und tritt dem Server bei."}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button asChild>
                  <a href={DISCORD_INVITE} target="_blank" rel="noreferrer">
                    <ExternalLink className="mr-2 h-4 w-4" /> Discord beitreten
                  </a>
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => qc.invalidateQueries({ queryKey: ["membership-apply-form"] })}
                  disabled={isFetching}
                >
                  <RefreshCw className="mr-2 h-4 w-4" /> Erneut prüfen
                </Button>
              </div>
              {data?.discordError && (
                <p className="text-xs text-destructive">Discord: {data.discordError}</p>
              )}
            </Panel>
          )}

          {authed === true && s?.enabled && data?.discordOnServer && (done || pending) && (
            <Panel>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-brand" />
                <h2 className="font-display text-lg tracking-tight">Bewerbung eingegangen</h2>
              </div>
              <p className="text-sm text-muted-foreground">
                {done ?? STATUS_TEXT[app?.status ?? "open"]}
              </p>
              {app?.review_note && (
                <p className="text-sm text-muted-foreground">Anmerkung: {app.review_note}</p>
              )}
            </Panel>
          )}

          {authed === true && s?.enabled && data?.discordOnServer && !done && !pending && (
            <Panel>
              <h2 className="font-display text-lg tracking-tight">Schritt 2 — Formular</h2>
              {s.intro_text && <p className="text-sm text-muted-foreground">{s.intro_text}</p>}
              {app?.status === "rejected" && app.review_note && (
                <p className="text-sm text-muted-foreground">Letzte Anmerkung: {app.review_note}</p>
              )}

              {(data?.fields ?? []).map((f) => (
                <div key={f.id} className="space-y-1.5">
                  <Label>
                    {f.label}
                    {f.required && <span className="text-brand"> *</span>}
                  </Label>
                  {f.field_type === "textarea" && (
                    <Textarea
                      rows={4}
                      placeholder={f.placeholder ?? ""}
                      value={(answers[f.field_key] as string) ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [f.field_key]: e.target.value })}
                    />
                  )}
                  {(f.field_type === "text" || f.field_type === "number") && (
                    <Input
                      type={f.field_type === "number" ? "number" : "text"}
                      placeholder={f.placeholder ?? ""}
                      value={(answers[f.field_key] as string) ?? ""}
                      onChange={(e) => setAnswers({ ...answers, [f.field_key]: e.target.value })}
                    />
                  )}
                  {f.field_type === "select" && (
                    <Select
                      value={(answers[f.field_key] as string) ?? ""}
                      onValueChange={(v) => setAnswers({ ...answers, [f.field_key]: v })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Bitte wählen" />
                      </SelectTrigger>
                      <SelectContent>
                        {f.options.map((o) => (
                          <SelectItem key={o} value={o}>
                            {o}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  {f.field_type === "boolean" && (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={answers[f.field_key] === true}
                        onCheckedChange={(c) => setAnswers({ ...answers, [f.field_key]: c })}
                      />
                      <span className="text-sm text-muted-foreground">Ja</span>
                    </div>
                  )}
                  {f.help && <p className="text-xs text-muted-foreground">{f.help}</p>}
                </div>
              ))}

              <Button onClick={() => submitM.mutate()} disabled={submitM.isPending}>
                <Send className="mr-2 h-4 w-4" /> Bewerbung absenden
              </Button>
            </Panel>
          )}
          </TabsContent>
        </Tabs>
      </div>
    </UidPage>
  );
}
