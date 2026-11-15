import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UidPage } from "@/components/uid/UidPage";

export const Route = createFileRoute("/auth/discord")({
  ssr: false,
  validateSearch: (
    s: Record<string, unknown>,
  ): { token_hash?: string; error?: string } => ({
    ...(typeof s.token_hash === "string" && s.token_hash
      ? { token_hash: s.token_hash }
      : {}),
    ...(typeof s.error === "string" && s.error ? { error: s.error } : {}),
  }),
  component: DiscordFinishPage,
});

function DiscordFinishPage() {
  const { token_hash, error } = Route.useSearch();
  const navigate = useNavigate();
  const [message, setMessage] = useState<string | null>(error || null);
  const startedRef = useRef(false);

  // Ziel nach dem Login: z. B. das öffentliche Bewerbungsformular.
  const nextTarget = () => {
    try {
      const t = sessionStorage.getItem("post_login_redirect");
      sessionStorage.removeItem("post_login_redirect");
      if (t && t.startsWith("/")) return t;
    } catch {
      /* ignore */
    }
    return "/onboarding";
  };

  useEffect(() => {
    if (!token_hash || error) return;
    // Nur einmal ausführen: der Token ist einmalig, ein zweiter Versuch
    // (z. B. durch erneutes Rendern) würde „link is invalid" melden.
    if (startedRef.current) return;
    startedRef.current = true;

    void (async () => {
      const { error: err } = await supabase.auth.verifyOtp({
        token_hash,
        type: "email",
      });
      if (!err) {
        navigate({ to: nextTarget() });
        return;
      }
      // Falls der Token bereits eingelöst wurde, existiert die Sitzung trotzdem.
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        navigate({ to: nextTarget() });
        return;
      }
      setMessage(err.message);
    })();
  }, [token_hash, error, navigate]);

  return (
    <UidPage backdrop="aurora" seed={7311}>
      <div className="mx-auto flex max-w-md flex-col px-6 pt-24 pb-24 text-center">
        <h1 className="font-display text-2xl tracking-tight">
          {message ? "Anmeldung fehlgeschlagen" : "Discord-Anmeldung…"}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">
          {message ?? "Dein Konto wird verbunden und deine Orgas werden zugeordnet."}
        </p>
        {message && (
          <a
            href="/login"
            className="mt-8 font-mono text-[10px] uppercase tracking-[0.3em] text-brand hover:underline"
          >
            ← Zurück zum Login
          </a>
        )}
      </div>
    </UidPage>
  );
}
