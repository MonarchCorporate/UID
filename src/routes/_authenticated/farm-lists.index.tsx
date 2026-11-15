import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Sprout, Users, Crown, CheckCircle2, Archive, MailQuestion, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listFarmLists, respondFarmListInvite, updateFarmList, deleteFarmList } from "@/lib/farm-lists.functions";
import { PageShell, StatusBadge } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { LoadingScreen } from "@/components/ui/loading-screen";

export const Route = createFileRoute("/_authenticated/farm-lists/")({
  component: FarmListsIndex,
});

function FarmListsIndex() {
  const fn = useServerFn(listFarmLists);
  const q = useQuery({ queryKey: ["farm-lists"], queryFn: () => fn() });
  const qc = useQueryClient();
  const respondFn = useServerFn(respondFarmListInvite);
  const respond = useMutation({
    mutationFn: (v: { list_id: string; accept: boolean }) => respondFn({ data: v }),
    onSuccess: (r) => {
      toast.success(r.joined ? "Einladung angenommen" : "Einladung abgelehnt");
      qc.invalidateQueries({ queryKey: ["farm-lists"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (q.isLoading) {
    return (
      <PageShell eyebrow="Farm Lists" title="Farm-Listen" description="Geteilte Sammellisten für Crafting-Materialien.">
        <LoadingScreen label="Lade Listen" cards={3} />
      </PageShell>
    );
  }

  const lists = q.data?.lists ?? [];
  const invitations = q.data?.invitations ?? [];
  const mine = lists.filter((l) => l.is_owner);
  const shared = lists.filter((l) => !l.is_owner);

  return (
    <PageShell
      eyebrow="Farm Lists"
      title="Farm-Listen"
      description="Sammle mehrere Blueprints in einer Liste, sieh den Materialbedarf auf einen Blick und farme im Team."
      actions={
        <Button asChild>
          <Link to="/farm-lists/new"><Plus className="mr-1 h-4 w-4" /> Neue Liste</Link>
        </Button>
      }
    >
      {invitations.length > 0 && (
        <Section title="Offene Einladungen" icon={<MailQuestion className="h-4 w-4 text-amber-400" />}>
          <div className="space-y-2">
            {invitations.map((inv) => (
              <div
                key={inv.list_id}
                className="flex flex-wrap items-center justify-between gap-3 border border-amber-400/25 bg-amber-400/[0.04] p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-base">{inv.list_name}</span>
                    <StatusBadge tone="amber">Pending</StatusBadge>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    von {inv.owner_callsign ?? "—"} · Rolle {inv.role === "editor" ? "Editor" : "Viewer"}
                  </div>
                  {inv.description && (
                    <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{inv.description}</div>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ list_id: inv.list_id, accept: true })}
                  >
                    Beitreten
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={respond.isPending}
                    onClick={() => respond.mutate({ list_id: inv.list_id, accept: false })}
                  >
                    Ablehnen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Meine Listen" icon={<Crown className="h-4 w-4 text-brand" />}>
        {mine.length === 0 ? (
          <Empty>Noch keine eigene Liste. Erstelle eine neue.</Empty>
        ) : (
          <Grid>{mine.map((l) => <ListCard key={l.id} list={l} />)}</Grid>
        )}
      </Section>

      <Section title="Mit mir geteilt" icon={<Users className="h-4 w-4 text-muted-foreground" />}>
        {shared.length === 0 ? (
          <Empty>Es wurden noch keine Listen mit dir geteilt.</Empty>
        ) : (
          <Grid>{shared.map((l) => <ListCard key={l.id} list={l} />)}</Grid>
        )}
      </Section>
    </PageShell>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

function Empty({ children }: { children: React.ReactNode }) {
  return <div className="border border-brand/10 p-8 text-center font-mono text-xs text-muted-foreground">// {children}</div>;
}

type ListSummary = NonNullable<Awaited<ReturnType<typeof listFarmLists>>>["lists"][number];

function ListCard({ list }: { list: ListSummary }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(updateFarmList);
  const deleteFn = useServerFn(deleteFarmList);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["farm-lists"] });
  const setStatus = useMutation({
    mutationFn: (status: "active" | "completed" | "archived") => updateFn({ data: { id: list.id, status } }),
    onSuccess: () => { toast.success("Status aktualisiert"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: () => deleteFn({ data: { id: list.id } }),
    onSuccess: () => { toast.success("Liste gelöscht"); invalidate(); },
    onError: (e) => toast.error((e as Error).message),
  });

  const statusBadge =
    list.status === "active" ? (
      <StatusBadge tone="emerald" icon={Sprout}>Aktiv</StatusBadge>
    ) : list.status === "completed" ? (
      <StatusBadge tone="brand" icon={CheckCircle2}>Fertig</StatusBadge>
    ) : (
      <StatusBadge tone="slate" icon={Archive}>Archiv</StatusBadge>
    );

  return (
    <div className="flex flex-col border border-brand/15 bg-background/60 transition-colors hover:border-brand/40">
    <Link
      to="/farm-lists/$id"
      params={{ id: list.id }}
      className="group flex flex-1 flex-col gap-3 p-4 transition-colors hover:bg-brand/[0.03]"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg leading-tight">{list.name}</div>
          {list.description && (
            <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{list.description}</div>
          )}
        </div>
        {statusBadge}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          <span>Fortschritt</span>
          <span className="tabular-nums text-foreground">{list.progress_pct}%</span>
        </div>
        <Progress value={list.progress_pct} className="h-1.5" />
      </div>

      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        <span>{list.blueprint_count} BP · {list.material_count} Materialien</span>
        <span>{list.is_owner ? "Du" : list.owner_callsign ?? "—"}</span>
      </div>
    </Link>
    {list.can_manage && (
      <div className="flex flex-wrap items-center gap-2 border-t border-brand/10 p-2">
        {list.status !== "completed" ? (
          <Button size="sm" variant="ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate("completed")}>
            <CheckCircle2 className="mr-1 h-4 w-4" /> Abschließen
          </Button>
        ) : (
          <Button size="sm" variant="ghost" disabled={setStatus.isPending} onClick={() => setStatus.mutate("active")}>
            <Sprout className="mr-1 h-4 w-4" /> Reaktivieren
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto text-rose-300 hover:text-rose-200"
          disabled={del.isPending}
          onClick={() => (confirmDelete ? del.mutate() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
        >
          <Trash2 className="mr-1 h-4 w-4" /> {confirmDelete ? "Wirklich löschen?" : "Löschen"}
        </Button>
      </div>
    )}
    </div>
  );
}