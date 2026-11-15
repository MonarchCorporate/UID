import { cn } from "@/lib/utils";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  CheckCircle,
  HelpCircle,
  ListTodo,
  ShieldAlert,
  Sprout,
  UserPlus,
  XCircle,
} from "lucide-react";
import {
  previewFarmListInvite,
  joinFarmListByInvite,
} from "@/lib/farm-lists.functions";
import { PageShell, StatusBadge } from "@/components/layout/PageShell";
import { LoadingScreen } from "@/components/ui/loading-screen";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/farm-lists/join/$token")({
  component: JoinFarmListPage,
});

function JoinFarmListPage() {
  const { token } = Route.useParams();
  const nav = useNavigate();
  const previewFn = useServerFn(previewFarmListInvite);
  const joinFn = useServerFn(joinFarmListByInvite);

  const q = useQuery({
    queryKey: ["farm-list-invite", token],
    queryFn: () => previewFn({ data: { token } }),
    retry: false,
  });

  const join = useMutation({
    mutationFn: () => joinFn({ data: { token } }),
    onSuccess: (r) => {
      toast.success("Du bist der Liste beigetreten");
      nav({ to: "/farm-lists/$id", params: { id: r.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) {
    return (
      <PageShell title="Einladung wird geprüft…">
        <LoadingScreen cards={1} />
      </PageShell>
    );
  }

  if (q.isError || !q.data) {
    return (
      <PageShell
        eyebrow="Farm-Listen"
        title="Einladung ungültig"
        description="Der Link kann nicht verwendet werden."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/farm-lists">
              <ArrowLeft className="mr-1.5 h-4 w-4" />
              Zu meinen Listen
            </Link>
          </Button>
        }
      >
        <InvalidInviteState error={q.error as Error | null} />
      </PageShell>
    );
  }

  const info = q.data;

  if (info.is_owner || info.already_member) {
    return (
      <PageShell
        eyebrow="Farm-Liste"
        title={info.name}
        description={info.description ?? undefined}
        actions={
          <Button asChild size="sm">
            <Link to="/farm-lists/$id" params={{ id: info.id }}>
              Liste öffnen
            </Link>
          </Button>
        }
      >
        <div className="border border-brand/10 p-6 font-mono text-xs text-muted-foreground">
          // Du bist bereits {info.is_owner ? "Ersteller" : "Mitglied"} dieser Liste.
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell
      eyebrow={`Eingeladen von ${info.owner_callsign ?? "—"}`}
      title={
        <span className="flex items-center gap-3">
          {info.name}
          <StatusBadge tone={info.role === "editor" ? "brand" : "slate"} icon={Sprout}>
            {info.role === "editor" ? "Editor" : "Viewer"}
          </StatusBadge>
        </span>
      }
      description={info.description ?? "Tritt der Farm-Liste bei, um Beiträge einzutragen."}
      actions={
        <Button asChild variant="outline" size="sm">
          <Link to="/farm-lists">
            <ArrowLeft className="mr-1 h-4 w-4" /> Abbrechen
          </Link>
        </Button>
      }
    >
      <div className="border border-brand/10 p-6 space-y-4">
        <p className="text-sm text-muted-foreground">
          Du wirst der Liste als{" "}
          <span className="text-foreground font-medium">
            {info.role === "editor" ? "Editor" : "Viewer"}
          </span>{" "}
          beitreten.
          {info.role === "editor"
            ? " Du kannst Blueprints, Beiträge und Status pflegen."
            : " Du kannst die Liste einsehen, aber nicht bearbeiten."}
        </p>
        <Button size="lg" disabled={join.isPending} onClick={() => join.mutate()}>
          <UserPlus className="mr-2 h-4 w-4" />
          {join.isPending ? "Trete bei…" : "Liste beitreten"}
        </Button>
      </div>
    </PageShell>
  );
}

function InvalidInviteState({ error }: { error: Error | null }) {
  const message = (error?.message ?? "").toLowerCase();
  const isDisabled = message.includes("deaktiviert") || message.includes("ungültig");

  return (
    <div className="space-y-6">
      {/* Status panel */}
      <div className="border border-rose-500/30 bg-rose-500/5 p-6 md:p-8">
        <div className="relative flex flex-col items-start gap-5 md:flex-row md:items-center">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center border border-rose-500/30 bg-rose-500/10 text-rose-400">
            <ShieldAlert className="h-7 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-rose-400">
              // Zugriff verweigert
            </div>
            <h2 className="mt-1 font-display text-2xl text-foreground">
              Dieser Einladungslink ist nicht gültig
            </h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              {error?.message ??
                "Der Link ist ungültig, abgelaufen oder wurde vom Ersteller deaktiviert."}
            </p>
          </div>
          {isDisabled && (
            <StatusBadge tone="rose" icon={XCircle}>
              Deaktiviert
            </StatusBadge>
          )}
        </div>
      </div>

      {/* Reason + action cards */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="border border-brand/10 bg-background/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-brand" />
            <h3 className="font-display text-lg">Mögliche Ursachen</h3>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <Reason icon={XCircle}>
              Der Ersteller hat den Link deaktiviert oder durch einen neuen ersetzt.
            </Reason>
            <Reason icon={XCircle}>Der Link wurde unvollständig oder falsch kopiert.</Reason>
            <Reason icon={XCircle}>Du bist bereits Mitglied dieser Farm-Liste.</Reason>
            <Reason icon={XCircle}>Die Liste wurde gelöscht oder archiviert.</Reason>
          </ul>
        </div>

        <div className="border border-brand/10 bg-background/40 p-5">
          <div className="mb-4 flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <h3 className="font-display text-lg">So kommst du weiter</h3>
          </div>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <Reason icon={CheckCircle} tone="emerald">
              Prüfe, ob der Link vollständig in die Adressleiste eingefügt wurde.
            </Reason>
            <Reason icon={CheckCircle} tone="emerald">
              Bitte den Ersteller, dir einen neuen Link zu schicken.
            </Reason>
            <Reason icon={CheckCircle} tone="emerald">
              Schaue in deinen Farm-Listen, ob du der Liste bereits beigetreten bist.
            </Reason>
          </ul>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild size="lg">
          <Link to="/farm-lists">
            <ListTodo className="mr-2 h-4 w-4" />
            Meine Farm-Listen
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/dashboard">Zum Dashboard</Link>
        </Button>
        <Button asChild variant="ghost" size="lg">
          <Link to="/">Zur Startseite</Link>
        </Button>
      </div>
    </div>
  );
}

function Reason({
  children,
  icon: Icon,
  tone = "rose",
}: {
  children: React.ReactNode;
  icon: React.ElementType;
  tone?: "rose" | "emerald";
}) {
  const color = tone === "emerald" ? "text-emerald-400" : "text-rose-400";
  return (
    <li className="flex items-start gap-2.5">
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", color)} />
      <span>{children}</span>
    </li>
  );
}
