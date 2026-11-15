import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { ArrowLeft, Pencil, Trash2, Send, HandshakeIcon } from "lucide-react";
import { toast } from "sonner";
import {
  getListing,
  claimListing,
  updateClaimStatus,
  deleteListing,
  listMessages,
  postMessage,
  signMarketplaceImage,
} from "@/lib/marketplace.functions";
import { PageShell } from "@/components/layout/PageShell";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketplace/$id/")({
  component: ListingDetail,
});

const TYPE_LABEL: Record<string, string> = {
  auftrag: "Auftrag",
  suche: "Suche",
  verkauf: "Verkauf",
  tausch: "Tausch",
};
const STATUS_LABEL: Record<string, string> = {
  offen: "Offen",
  angenommen: "Angenommen",
  in_lieferung: "In Lieferung",
  abgeschlossen: "Abgeschlossen",
  storniert: "Storniert",
  abgelaufen: "Abgelaufen",
};

function ListingDetail() {
  const { id } = useParams({ from: "/_authenticated/marketplace/$id/" });
  const nav = useNavigate();
  const qc = useQueryClient();
  const getFn = useServerFn(getListing);
  const claimFn = useServerFn(claimListing);
  const updClaim = useServerFn(updateClaimStatus);
  const delFn = useServerFn(deleteListing);
  const msgListFn = useServerFn(listMessages);
  const msgPostFn = useServerFn(postMessage);

  const q = useQuery({ queryKey: ["marketplace", id], queryFn: () => getFn({ data: { id } }) });
  const msgs = useQuery({
    queryKey: ["marketplace", id, "messages"],
    queryFn: () => msgListFn({ data: { listing_id: id } }),
    refetchInterval: 15000,
  });

  const [claimNote, setClaimNote] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [msg, setMsg] = useState("");
  const [confirmDel, setConfirmDel] = useState(false);
  const [showCancel, setShowCancel] = useState(false);

  const claimMut = useMutation({
    mutationFn: () => claimFn({ data: { listing_id: id, note: claimNote || undefined } }),
    onSuccess: () => {
      toast.success("Angenommen");
      setClaimNote("");
      qc.invalidateQueries({ queryKey: ["marketplace", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const claimStatusMut = useMutation({
    mutationFn: (payload: { claim_id: string; status: "in_lieferung" | "geliefert" | "abgeschlossen" | "storniert"; cancel_reason?: string }) =>
      updClaim({ data: payload }),
    onSuccess: () => {
      toast.success("Status aktualisiert");
      setShowCancel(false);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["marketplace", id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMut = useMutation({
    mutationFn: () => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Gelöscht");
      nav({ to: "/marketplace" });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const postMut = useMutation({
    mutationFn: () => msgPostFn({ data: { listing_id: id, body: msg.trim() } }),
    onSuccess: () => {
      setMsg("");
      msgs.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (q.isLoading) return <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm text-red-400">Nicht gefunden</div>;

  const l = q.data.listing;
  const claim = l.active_claim;
  const isOwner = l.is_owner;
  const isClaimant = claim && claim.claimed_by !== l.created_by; // best-effort; server enforces

  return (
    <PageShell
      eyebrow="Schwarzes Brett"
      title={l.title}
      actions={
        isOwner ? (
          <Button asChild size="sm" variant="outline">
            <Link to="/marketplace/$id/edit" params={{ id }}>
              <Pencil className="mr-1 h-3 w-3" /> Bearbeiten
            </Link>
          </Button>
        ) : undefined
      }
    >
      <Link
        to="/marketplace"
        className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-3 w-3" /> Zurück
      </Link>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <div className="border border-brand/10 bg-background/40 p-5">
            <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em]">
              <span className="border border-brand/40 px-2 py-0.5 text-brand">{TYPE_LABEL[l.type]}</span>
              <span className="border border-white/10 px-2 py-0.5 text-muted-foreground">{STATUS_LABEL[l.status]}</span>
              {l.category && <span className="border border-white/10 px-2 py-0.5 text-muted-foreground">{l.category}</span>}
              {l.location && <span className="border border-white/10 px-2 py-0.5 text-muted-foreground">📍 {l.location}</span>}
              <span className="ml-auto text-muted-foreground">von {l.creator_name}</span>
            </div>

            {l.description && (
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{l.description}</p>
            )}

            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              {l.price_auec != null && (
                <KV k={l.type === "auftrag" ? "Belohnung" : "Preis"} v={`${l.price_auec.toLocaleString("de-DE")} aUEC`} />
              )}
              {l.quantity != null && (
                <KV k="Menge" v={`${l.quantity}${l.unit ? ` ${l.unit}` : ""}`} />
              )}
              {l.expires_at && (
                <KV k="Läuft ab" v={format(new Date(l.expires_at), "PPP", { locale: de })} />
              )}
              {l.trade_offer && <KV k="Biete" v={l.trade_offer} />}
              {l.trade_want && <KV k="Suche" v={l.trade_want} />}
            </div>

            {l.image_urls.length > 0 && (
              <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-3">
                {l.image_urls.map((p) => (
                  <SignedImg key={p} path={p} />
                ))}
              </div>
            )}

            {isOwner && (
              <div className="mt-4 flex gap-2 border-t border-brand/10 pt-4">
                <Button asChild variant="outline" size="sm">
                  <Link to="/marketplace/$id/edit" params={{ id }}>
                    <Pencil className="mr-1 h-3 w-3" /> Bearbeiten
                  </Link>
                </Button>
                <Button variant="outline" size="sm" onClick={() => setConfirmDel(true)}>
                  <Trash2 className="mr-1 h-3 w-3" /> Löschen
                </Button>
              </div>
            )}
          </div>

          {/* Kommentar-Thread */}
          <div className="border border-brand/10 bg-background/40 p-5">
            <div className="mb-3 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              // Nachrichten
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {(msgs.data?.messages ?? []).map((m) => (
                <div key={m.id} className="border-l-2 border-brand/30 pl-3">
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    {m.author_name} · {format(new Date(m.created_at), "dd.MM. HH:mm", { locale: de })}
                  </div>
                  <div className="whitespace-pre-wrap text-sm">{m.body}</div>
                </div>
              ))}
              {(msgs.data?.messages ?? []).length === 0 && (
                <div className="font-mono text-[10px] text-muted-foreground">// keine nachrichten</div>
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <Textarea
                rows={2}
                maxLength={2000}
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Nachricht schreiben…"
              />
              <Button
                type="button"
                onClick={() => msg.trim() && postMut.mutate()}
                disabled={!msg.trim() || postMut.isPending}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Aktions-Seitenleiste */}
        <div className="space-y-4">
          <div className="border border-brand/10 bg-background/40 p-5">
            <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
              // Status
            </div>
            <div className="font-display text-lg">{STATUS_LABEL[l.status]}</div>
            {claim && (
              <div className="mt-2 border-t border-brand/10 pt-2 text-xs">
                <div className="text-muted-foreground">Bearbeiter:</div>
                <div className="font-display">{claim.claimant_name}</div>
                {claim.note && <div className="mt-1 text-muted-foreground">"{claim.note}"</div>}
              </div>
            )}
          </div>

          {/* Actions */}
          {!isOwner && l.status === "offen" && !claim && (
            <div className="space-y-2 border border-brand/10 bg-background/40 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                // Annehmen
              </div>
              <Textarea
                rows={2}
                maxLength={500}
                placeholder="Notiz (optional)"
                value={claimNote}
                onChange={(e) => setClaimNote(e.target.value)}
              />
              <Button className="w-full" onClick={() => claimMut.mutate()} disabled={claimMut.isPending}>
                <HandshakeIcon className="mr-1 h-4 w-4" />
                {claimMut.isPending ? "…" : "Auftrag annehmen"}
              </Button>
            </div>
          )}

          {claim && (
            <div className="space-y-2 border border-brand/10 bg-background/40 p-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
                // Abwicklung
              </div>
              <ClaimActions
                status={claim.status}
                isOwner={isOwner}
                isClaimant={!!isClaimant}
                onChange={(status) => claimStatusMut.mutate({ claim_id: claim.id, status })}
                onCancel={() => setShowCancel(true)}
                pending={claimStatusMut.isPending}
              />
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={confirmDel} onOpenChange={setConfirmDel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eintrag löschen?</AlertDialogTitle>
            <AlertDialogDescription>
              Der Eintrag „{l.title}" wird inkl. Annahmen und Nachrichten endgültig entfernt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Abbrechen</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => delMut.mutate()}
              disabled={delMut.isPending}
              className="bg-red-500/90 text-white hover:bg-red-500"
            >
              Löschen
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCancel} onOpenChange={setShowCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Annahme stornieren?</AlertDialogTitle>
            <AlertDialogDescription>
              Bitte gib einen Grund an. Der Eintrag wird wieder auf „Offen" gesetzt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            rows={3}
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder="Grund"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Zurück</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                claim &&
                claimStatusMut.mutate({
                  claim_id: claim.id,
                  status: "storniert",
                  cancel_reason: cancelReason || undefined,
                })
              }
              className="bg-red-500/90 text-white hover:bg-red-500"
            >
              Stornieren
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageShell>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">{k}</div>
      <div className="text-sm">{v}</div>
    </div>
  );
}

function ClaimActions({
  status,
  isOwner,
  isClaimant,
  onChange,
  onCancel,
  pending,
}: {
  status: "angenommen" | "in_lieferung" | "geliefert" | "abgeschlossen" | "storniert";
  isOwner: boolean;
  isClaimant: boolean;
  onChange: (status: "in_lieferung" | "geliefert" | "abgeschlossen" | "storniert") => void;
  onCancel: () => void;
  pending: boolean;
}) {
  const canAct = isOwner || isClaimant || true; // server ist source of truth
  if (!canAct) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {status === "angenommen" && (
        <Button size="sm" onClick={() => onChange("in_lieferung")} disabled={pending}>
          In Lieferung
        </Button>
      )}
      {(status === "angenommen" || status === "in_lieferung") && (
        <Button size="sm" onClick={() => onChange("geliefert")} disabled={pending}>
          Geliefert
        </Button>
      )}
      {(status === "geliefert" || status === "in_lieferung") && (
        <Button size="sm" onClick={() => onChange("abgeschlossen")} disabled={pending}>
          Abschließen
        </Button>
      )}
      {(status === "angenommen" || status === "in_lieferung") && (
        <Button size="sm" variant="outline" onClick={onCancel} disabled={pending}>
          Stornieren
        </Button>
      )}
    </div>
  );
}

function SignedImg({ path }: { path: string }) {
  const signFn = useServerFn(signMarketplaceImage);
  const q = useQuery({
    queryKey: ["mp-img", path],
    queryFn: () => signFn({ data: { path } }),
    staleTime: 55 * 60 * 1000,
  });
  return (
    <div className="aspect-square overflow-hidden border border-brand/15 bg-background/40">
      {q.data?.url ? (
        <img src={q.data.url} alt="" className={cn("h-full w-full object-cover")} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-muted-foreground">…</div>
      )}
    </div>
  );
}
