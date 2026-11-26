import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UidPage } from "@/components/uid/UidPage";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/dashboard" });
    });
    return () => subscription.unsubscribe();
  }, [navigate]);

  return (
    <UidPage backdrop="aurora" seed={5150}>
      <div className="mx-auto flex max-w-md flex-col px-6 pt-20 pb-24">
        <div className="mb-6 inline-block self-start p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // Access Terminal
          </div>
        </div>
        <h1 className="mb-4 font-display text-3xl tracking-tight">Anmelden</h1>
        <p className="mb-8 text-sm text-muted-foreground">
          Der Zugang läuft ausschließlich über Discord. Du brauchst kein Passwort – melde dich mit
          deinem Discord-Konto an.
        </p>

        <a
          href="/api/public/auth/discord/start"
          className="flex items-center justify-center gap-3 border border-[#5865F2]/60 bg-[#5865F2]/10 py-3 text-[10px] uppercase tracking-[0.3em] text-foreground transition hover:bg-[#5865F2]/25"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="h-4 w-4 fill-current text-[#5865F2]">
            <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.7.4 2.8 1 4 1.7a13.5 13.5 0 0 0-11.3-.4c.4-.2.9-.4 1.4-.6.6-.3 1.3-.5 2-.7L11 3a19.8 19.8 0 0 0-4.9 1.4C3 9.3 2.2 14 2.6 18.6A19.9 19.9 0 0 0 8.6 21l.8-1.2c-1-.4-2-.9-2.9-1.6l.7-.5a14.2 14.2 0 0 0 12.1 0l.7.5c-.9.7-1.9 1.2-2.9 1.6l.8 1.2a19.9 19.9 0 0 0 6-2.4c.5-5.3-.8-10-3.6-14.2ZM9 15.5c-1.1 0-2.1-1.1-2.1-2.4S7.8 10.6 9 10.6s2.1 1.1 2.1 2.5S10.1 15.5 9 15.5Zm6 0c-1.1 0-2.1-1.1-2.1-2.4s1-2.5 2.1-2.5 2.1 1.1 2.1 2.5-.9 2.4-2.1 2.4Z" />
          </svg>
          Mit Discord anmelden
        </a>

        <BetaLogin />

        <Link to="/" className="mt-8 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand">
          ← Zurück
        </Link>
      </div>
    </UidPage>
  );
}
/** Email/password login for beta testers (only shown when the server enables it). */
function BetaLogin() {
  const [info, setInfo] = useState<{ enabled: boolean; invite: boolean } | null>(null);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [form, setForm] = useState({ email: "", password: "", name: "", invite: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch("/api/public/auth/beta-login").then((r) => r.json()).then(setInfo).catch(() => setInfo(null));
  }, []);
  if (!info?.enabled) return null;
  const submit = async (e: { preventDefault(): void }) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/public/auth/beta-login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...form, mode }) });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Anmeldung fehlgeschlagen");
      window.location.href = `/auth/discord?token_hash=${encodeURIComponent(d.token_hash)}`;
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const field = "w-full border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-brand";
  return (
    <form onSubmit={submit} className="mt-8 space-y-3 border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-amber-300">Beta-Zugang</div>
      <p className="text-xs text-muted-foreground">Nur auf der Beta: Anmeldung mit E-Mail und Passwort, bis Discord hier eingerichtet ist.</p>
      {mode === "register" && <input className={field} placeholder="Name / Callsign" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />}
      <input className={field} type="email" required placeholder="E-Mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
      <input className={field} type="password" required minLength={10} placeholder="Passwort (mind. 10 Zeichen)" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
      {mode === "register" && info.invite && <input className={field} required placeholder="Einladungscode" value={form.invite} onChange={(e) => setForm({ ...form, invite: e.target.value })} />}
      {error && <p className="text-xs text-red-300">{error}</p>}
      <button disabled={busy} className="w-full border border-brand/60 bg-brand/10 py-2.5 text-[10px] uppercase tracking-[0.3em] hover:bg-brand/25">{mode === "login" ? "Anmelden" : "Konto anlegen"}</button>
      <button type="button" className="w-full text-center text-xs text-muted-foreground hover:text-brand" onClick={() => setMode(mode === "login" ? "register" : "login")}>
        {mode === "login" ? "Noch kein Beta-Konto? Registrieren" : "Schon registriert? Anmelden"}
      </button>
    </form>
  );
}
