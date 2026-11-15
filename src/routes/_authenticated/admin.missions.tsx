import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Trash2, ExternalLink, ArrowLeft } from "lucide-react";
import { adminListAllMissions, adminDeleteMission } from "@/lib/missions.functions";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/admin/missions")({
  component: AdminMissionsPage,
});

function AdminMissionsPage() {
  const listFn = useServerFn(adminListAllMissions);
  const deleteFn = useServerFn(adminDeleteMission);
  const qc = useQueryClient();
  const [toDelete, setToDelete] = useState<{ id: string; title: string } | null>(null);

  const q = useQuery({
    queryKey: ["admin", "all-missions"],
    queryFn: () => listFn(),
  });

  const delMut = useMutation({
    mutationFn: (mission_id: string) => deleteFn({ data: { mission_id } }),
    onSuccess: () => {
      toast.success("Einsatz gelöscht");
      setToDelete(null);
      qc.invalidateQueries({ queryKey: ["admin", "all-missions"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Fehler"),
  });

  const missions = q.data ?? [];

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
          <Link to="/admin" className="mb-4 inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-brand">
            <ArrowLeft className="h-3 w-3" /> Admin
          </Link>
          <h1 className="font-display text-4xl">Einsätze</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Alle Einsätze im System. Als Admin kannst du jeden Einsatz löschen.
          </p>

          <div className="mt-8 border border-brand/20">
            {q.isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">Lade Einsätze…</div>
            ) : missions.length === 0 ? (
              <div className="p-6 text-sm text-muted-foreground">Keine Einsätze vorhanden.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-brand/5 text-left font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Titel</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Leader</th>
                    <th className="px-3 py-2">Start</th>
                    <th className="px-3 py-2">Erstellt</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {missions.map((m) => (
                    <tr key={m.id} className="border-t border-brand/10">
                      <td className="px-3 py-2">
                        <Link to="/ops/$slug" params={{ slug: m.slug }} className="inline-flex items-center gap-1 hover:text-brand">
                          {m.title} <ExternalLink className="h-3 w-3" />
                        </Link>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        {m.status}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{m.leader_name ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {m.starts_at ? new Date(m.starts_at).toLocaleString() : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(m.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setToDelete({ id: m.id, title: m.title })}
                          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Einsatz löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              „{toDelete?.title}" wird endgültig gelöscht, inklusive aller Schiffe, Stationen, Teilnehmer und Voice-Kanäle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => toDelete && delMut.mutate(toDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}