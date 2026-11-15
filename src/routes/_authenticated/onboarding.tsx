import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Building2, Check, Loader2, MessagesSquare, RefreshCw } from "lucide-react";
import { getOnboardingStatus, recheckOrgAssignment } from "@/lib/onboarding.functions";
import { RsiVerifyCard } from "@/components/profile/RsiVerifyCard";

export const Route = createFileRoute("/_authenticated/onboarding")({
  component: OnboardingPage,
});

const DISCORD_INVITE = "https://discord.gg/QMvCtbjyqe";

function OnboardingPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getOnboardingStatus);
  const recheckFn = useServerFn(recheckOrgAssignment);

  const statusQ = useQuery({
    queryKey: ["onboarding-status"],
    queryFn: () => fetchStatus(),
    // Solange der Discord-Beitritt fehlt, automatisch weiter prüfen.
    refetchInterval: (q) => (q.state.data?.discordOnServer ? false : 8000),
  });
  const s = statusQ.data;

  const recheck = useMutation({
    mutationFn: () => recheckFn(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["onboarding-status"] });
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
  });

  const stepDiscord = !!s?.discordOnServer;
  const stepRsi = !!s?.rsiVerified;
  const stepOrg = (s?.orgs.length ?? 0) > 0;

  // Sobald die RSI-Verifizierung steht, Rollen + Orga automatisch vergeben.
  const autoRan = useRef(false);
  useEffect(() => {
    if (!stepRsi || stepOrg || autoRan.current || recheck.isPending) return;
    autoRan.current = true;
    recheck.mutate();
  }, [stepRsi, stepOrg, recheck]);

  const grantedRoles = (recheck.data?.assigned ?? []).flatMap((o) => o.discord_roles);
  const joinedOrgs = recheck.data?.assigned ?? [];
  const unavailableOrgs = recheck.data?.unavailable ?? [];

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      <header className="space-y-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.35em] text-brand/70">
          // Zugang einrichten
        </p>
        <h1 className="font-display text-2xl tracking-tight">Willkommen an Bord</h1>
        <p className="text-sm text-muted-foreground">
          Drei Schritte bis zum vollen Portalzugang: Discord, RSI-Verifizierung und
          Orga-Zuordnung.
        </p>
      </header>

      {statusQ.isLoading || !s ? (
        <div className="flex items-center gap-3 rounded-2xl border border-brand/20 bg-card/40 p-6 text-sm text-muted-foreground backdrop-blur-xl">
          <Loader2 className="h-4 w-4 animate-spin" /> Status wird geprüft…
        </div>
      ) : (
        <>
          <Step
            index={1}
            title="Discord-Server"
            icon={<MessagesSquare className="h-4 w-4" />}
            done={stepDiscord}
            active
          >
            {stepDiscord ? (
              <p className="text-sm text-muted-foreground">
                Du bist Mitglied auf unserem Discord-Server.
              </p>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Wir konnten dich auf unserem Discord-Server nicht finden. Tritt bei und
                  prüfe anschließend erneut.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={DISCORD_INVITE}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full bg-brand px-5 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-brand-foreground hover:opacity-90"
                  >
                    Zum Discord-Server
                  </a>
                  <RecheckButton
                    pending={statusQ.isFetching}
                    onClick={() => statusQ.refetch()}
                  />
                </div>
                {s.discordError && (
                  <p className="text-xs text-destructive">{s.discordError}</p>
                )}
              </div>
            )}
          </Step>

          <Step
            index={2}
            title="RSI-Account verifizieren"
            icon={<BadgeCheck className="h-4 w-4" />}
            done={stepRsi}
            active={stepDiscord}
          >
            {stepRsi ? (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Verifiziert als <span className="text-brand">{s.rsiHandle}</span> – dein
                  Handle ist jetzt auch dein Discord-Nickname und dein Callsign.
                </p>
                {grantedRoles.length > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Vergebene Discord-Rollen:{" "}
                    <span className="text-brand">{grantedRoles.join(", ")}</span>
                  </p>
                )}
              </div>
            ) : stepDiscord ? (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Nach der Verifizierung erhältst du automatisch deine Discord-Rollen; dein
                  RSI-Handle wird als Callsign und Discord-Nickname übernommen.
                </p>
                <RsiVerifyCard />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Erst Schritt 1 abschließen.
              </p>
            )}
          </Step>

          <Step
            index={3}
            title="Orga-Zuordnung"
            icon={<Building2 className="h-4 w-4" />}
            done={stepOrg}
            active={stepRsi}
          >
            {stepOrg ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Du bist zugeordnet:{" "}
                  <span className="text-brand">
                    {s.orgs.map((o) => o.name).join(", ")}
                  </span>
                  . Die Discord-Standardrollen wurden vergeben.
                </p>
                <OrgScanSummary joined={joinedOrgs} unavailable={unavailableOrgs} />
                <RecheckButton
                  pending={recheck.isPending}
                  onClick={() => recheck.mutate()}
                />
                <button
                  type="button"
                  onClick={() => navigate({ to: "/dashboard" })}
                  className="rounded-full bg-brand px-6 py-2.5 font-mono text-[10px] uppercase tracking-[0.25em] text-brand-foreground hover:opacity-90"
                >
                  Zum Portal
                </button>
              </div>
            ) : stepRsi ? (
              <div className="space-y-4">
                <OrgScanSummary joined={joinedOrgs} unavailable={unavailableOrgs} />
                <p className="text-sm text-muted-foreground">
                  Deine Organisation ist im System noch nicht registriert
                  {s.sids.length > 0 && (
                    <>
                      {" "}
                      (gefundene SIDs:{" "}
                      <span className="font-mono text-brand/80">
                        {s.sids.join(", ")}
                      </span>
                      )
                    </>
                  )}
                  . Wende dich im Discord an das Council oder an deine Orgaführung, damit
                  deine Orga eingetragen wird.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={DISCORD_INVITE}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-brand/40 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-brand hover:bg-brand/10"
                  >
                    Discord öffnen
                  </a>
                  <RecheckButton
                    pending={recheck.isPending}
                    onClick={() => recheck.mutate()}
                  />
                </div>
                {recheck.error && (
                  <p className="text-xs text-destructive">
                    {(recheck.error as Error).message}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Erst die RSI-Verifizierung abschließen.
              </p>
            )}
          </Step>
        </>
      )}
    </div>
  );
}

function RecheckButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-full border border-brand/30 px-5 py-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground hover:border-brand/60 hover:text-foreground disabled:opacity-50"
    >
      <RefreshCw className={`h-3 w-3 ${pending ? "animate-spin" : ""}`} />
      Erneut prüfen
    </button>
  );
}

function OrgScanSummary({
  joined,
  unavailable,
}: {
  joined: { org_name: string; sid: string; joined: boolean; discord_roles: string[] }[];
  unavailable: { sid: string; name: string; main: boolean }[];
}) {
  if (joined.length === 0 && unavailable.length === 0) return null;
  return (
    <div className="space-y-3 rounded-xl border border-brand/20 bg-background/40 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand/70">
        // RSI-Orga-Scan
      </p>
      {joined.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">Im Backoffice beigetreten:</p>
          <ul className="space-y-1 text-sm">
            {joined.map((o) => (
              <li key={o.sid} className="text-foreground">
                <span className="text-brand">{o.org_name}</span>{" "}
                <span className="font-mono text-xs text-muted-foreground">({o.sid})</span>
                {o.discord_roles.length > 0 && (
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    · Discord-Rollen: {o.discord_roles.join(", ")}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {unavailable.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            Nicht Teil der UID – hier erfolgt keine Zuordnung:
          </p>
          <ul className="space-y-1 text-sm">
            {unavailable.map((o) => (
              <li key={o.sid} className="text-muted-foreground">
                {o.name}{" "}
                <span className="font-mono text-xs">({o.sid})</span>
                {o.main && <span className="text-xs"> · Haupt-Orga</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function Step({
  index,
  title,
  icon,
  done,
  active,
  children,
}: {
  index: number;
  title: string;
  icon: React.ReactNode;
  done: boolean;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`rounded-2xl border p-6 backdrop-blur-xl transition ${
        done
          ? "border-brand/40 bg-card/50"
          : active
            ? "border-brand/25 bg-card/40"
            : "border-border/40 bg-card/20 opacity-60"
      }`}
    >
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex size-8 items-center justify-center rounded-full text-xs ${
            done ? "bg-brand text-brand-foreground" : "border border-brand/30 text-brand"
          }`}
        >
          {done ? <Check className="h-4 w-4" /> : index}
        </div>
        <h2 className="flex items-center gap-2 font-display text-base tracking-tight">
          {icon} {title}
        </h2>
      </div>
      {children}
    </section>
  );
}