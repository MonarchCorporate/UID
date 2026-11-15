import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { BadgeCheck, Copy, ExternalLink } from "lucide-react";
import {
  confirmRsiVerification,
  getMyRsiStatus,
  startRsiVerification,
  unlinkRsiAccount,
} from "@/lib/rsi-verify.functions";

export function RsiVerifyCard() {
  const qc = useQueryClient();
  const fetchStatus = useServerFn(getMyRsiStatus);
  const startFn = useServerFn(startRsiVerification);
  const confirmFn = useServerFn(confirmRsiVerification);
  const unlinkFn = useServerFn(unlinkRsiAccount);

  const { data: status, isLoading } = useQuery({
    queryKey: ["my-rsi-status"],
    queryFn: () => fetchStatus(),
  });

  const [handle, setHandle] = useState("");
  const [copied, setCopied] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  useEffect(() => {
    if (status?.handle) setHandle(status.handle);
  }, [status?.handle]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["my-rsi-status"] });
    qc.invalidateQueries({ queryKey: ["my-profile"] });
    qc.invalidateQueries({ queryKey: ["onboarding-status"] });
  };

  const start = useMutation({
    mutationFn: () => startFn({ data: { handle } }),
    onSuccess: invalidate,
  });
  const confirm = useMutation({
    mutationFn: () => confirmFn(),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ["my-orgs"] });
    },
  });
  const unlink = useMutation({
    mutationFn: () => unlinkFn(),
    onSuccess: () => {
      setConfirmUnlink(false);
      setHandle("");
      invalidate();
    },
  });

  const verified = Boolean(status?.verifiedAt);
  const code = status?.pendingCode ?? null;
  const error = (start.error ?? confirm.error ?? unlink.error) as Error | undefined;
  const assigned = confirm.data?.orgs ?? [];

  return (
    <div className="border border-brand/20 p-6">
      <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
        // RSI-Account
      </h2>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Lade…</p>
      ) : verified ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3 border border-brand/10 bg-background/40 p-4">
            <BadgeCheck className="h-5 w-5 text-brand" />
            <div className="min-w-0 flex-1">
              <div className="text-sm">
                Verifiziert als <span className="text-brand">{status?.handle}</span>
              </div>
              <div className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
                seit {new Date(status!.verifiedAt!).toLocaleString("de-DE")}
              </div>
            </div>
            <a
              href={`https://robertsspaceindustries.com/en/citizens/${status?.handle}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 border border-brand/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10"
            >
              RSI-Profil <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <p className="text-xs text-muted-foreground">
            Du kannst den Code jetzt wieder aus deiner RSI-Bio entfernen.
          </p>
          {assigned.length > 0 && (
            <div className="space-y-1 border border-brand/10 bg-background/40 p-4">
              {assigned.map((o) => (
                <div key={o.org_id} className="text-xs">
                  <span className="text-brand">{o.org_name}</span>{" "}
                  <span className="font-mono text-[10px] text-muted-foreground">
                    [{o.sid}]
                  </span>{" "}
                  {o.joined ? "– Mitgliedschaft angelegt" : "– bereits Mitglied"}
                  {o.discord_roles.length > 0 && (
                    <span className="text-muted-foreground">
                      {" "}
                      · Discord-Rollen: {o.discord_roles.join(", ")}
                    </span>
                  )}
                  {o.discord_error && (
                    <span className="text-destructive"> · {o.discord_error}</span>
                  )}
                </div>
              ))}
            </div>
          )}
          {confirmUnlink ? (
            <div className="flex items-center gap-3">
              <button
                onClick={() => unlink.mutate()}
                disabled={unlink.isPending}
                className="border border-destructive px-4 py-1.5 text-[10px] uppercase tracking-[0.3em] text-destructive hover:bg-destructive/10 disabled:opacity-40"
              >
                Wirklich aufheben
              </button>
              <button
                onClick={() => setConfirmUnlink(false)}
                className="text-xs text-muted-foreground hover:underline"
              >
                Abbrechen
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmUnlink(true)}
              className="text-xs text-destructive hover:underline"
            >
              Verknüpfung aufheben
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Verifiziere deinen Star-Citizen-Account: Gib deinen Handle ein, erzeuge einen
            Code, trage ihn in die <span className="text-brand/80">Bio</span> deines
            RSI-Profils ein und klicke anschließend auf „Jetzt verifizieren“.
          </p>

          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={handle}
              onChange={(e) => setHandle(e.target.value)}
              placeholder="Star-Citizen-Handle oder RSI-Link"
              className="flex-1 border border-brand/20 bg-background/50 px-4 py-2 focus:border-brand focus:outline-none"
            />
            <button
              onClick={() => start.mutate()}
              disabled={!handle.trim() || start.isPending}
              className="border border-brand bg-brand px-5 py-2 text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/80 disabled:opacity-50"
            >
              {start.isPending ? "Erzeuge…" : code ? "Neuen Code" : "Code erzeugen"}
            </button>
          </div>

          {code && (
            <div className="space-y-3 border border-brand/10 bg-background/40 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <code className="border border-brand/30 px-3 py-1.5 font-mono text-sm tracking-[0.2em] text-brand">
                  {code}
                </code>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(code);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="inline-flex items-center gap-1 border border-brand/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-brand hover:bg-brand/10"
                >
                  <Copy className="h-3 w-3" /> {copied ? "Kopiert" : "Kopieren"}
                </button>
                <a
                  href="https://robertsspaceindustries.com/en/account/profile"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.3em] text-brand hover:underline"
                >
                  Bio bearbeiten <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="text-xs text-muted-foreground">
                Gültig bis{" "}
                {status?.codeExpiresAt
                  ? new Date(status.codeExpiresAt).toLocaleTimeString("de-DE")
                  : "–"}
                . Trage den Code in deine RSI-Bio ein und speichere dein Profil.
              </p>
              <button
                onClick={() => confirm.mutate()}
                disabled={confirm.isPending}
                className="border border-brand bg-brand px-5 py-2 text-[10px] uppercase tracking-[0.3em] text-primary-foreground hover:bg-brand/80 disabled:opacity-50"
              >
                {confirm.isPending ? "Prüfe RSI-Profil…" : "Jetzt verifizieren"}
              </button>
            </div>
          )}
        </div>
      )}

      {error && <p className="mt-3 text-xs text-destructive">{error.message}</p>}
    </div>
  );
}
