import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { Monitor, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UidPage } from "@/components/uid/UidPage";
import { Button } from "@/components/ui/button";
import { approveCompanionPairing, getCompanionPairing } from "@/lib/companion.functions";

// Opened by the desktop companion: confirms the device for the logged-in user.
export const Route = createFileRoute("/companion/pair/$code")({
  ssr: false,
  component: PairPage,
});

type Pairing = Awaited<ReturnType<typeof getCompanionPairing>>;

function PairPage() {
  const { code } = Route.useParams();
  const navigate = useNavigate();
  const getFn = useServerFn(getCompanionPairing);
  const approveFn = useServerFn(approveCompanionPairing);
  const [pairing, setPairing] = useState<Pairing | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        try { sessionStorage.setItem("post_login_redirect", `/companion/pair/${code}`); } catch { /* ignore */ }
        navigate({ to: "/login" });
        return;
      }
      try { setPairing(await getFn({ data: { code } })); } catch (e) { setError((e as Error).message); }
    })();
  }, [code, getFn, navigate]);

  const approve = async () => {
    setBusy(true);
    try { await approveFn({ data: { code } }); setDone(true); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <UidPage>
      <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl border border-brand/30 bg-brand/10 text-brand"><Monitor className="h-7 w-7" /></span>
        <h1 className="font-display text-3xl">Companion verbinden</h1>
        {error && <p className="text-sm text-red-300">{error}</p>}
        {!error && pairing === undefined && <p className="text-sm text-muted-foreground">Lade …</p>}
        {!error && pairing === null && <p className="text-sm text-muted-foreground">Code nicht gefunden. Der Companion zeigt automatisch einen neuen Code an.</p>}
        {!error && pairing && !done && pairing.status === "pending" && (
          <>
            <p className="text-muted-foreground">Der Companion auf <b className="text-foreground">{pairing.device}</b> möchte sich mit deinem Konto verbinden.</p>
            <div className="rounded-xl border border-dashed border-brand/50 bg-brand/5 px-6 py-3 font-mono text-2xl tracking-[0.2em] text-brand">{pairing.code}</div>
            <p className="text-xs text-muted-foreground">Vergleiche den Code mit dem im Overlay.</p>
            <Button size="lg" onClick={approve} disabled={busy}>Verbinden</Button>
          </>
        )}
        {!error && pairing && !done && pairing.status === "expired" && <p className="text-sm text-muted-foreground">Dieser Code ist abgelaufen. Der Companion zeigt automatisch einen neuen.</p>}
        {!error && pairing && !done && pairing.status !== "pending" && pairing.status !== "expired" && <p className="text-sm text-muted-foreground">Dieser Code wurde bereits verwendet – der Companion ist verbunden.</p>}
        {done && (
          <>
            <CheckCircle2 className="h-10 w-10 text-emerald-400" />
            <p>Verbunden. Der Companion übernimmt jetzt automatisch – du kannst dieses Fenster schließen.</p>
            <Link to="/companion" className="text-brand hover:underline">Zur Companion-Übersicht →</Link>
          </>
        )}
      </div>
    </UidPage>
  );
}
