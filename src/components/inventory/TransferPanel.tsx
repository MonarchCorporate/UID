import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listMyTransfers,
  respondInventoryTransfer,
  searchTransferRecipients,
  sendInventoryItem,
} from "@/lib/inventory-transfers.functions";
import type { InventoryItem } from "@/lib/inventory.functions";
import { formatQty } from "@/lib/units";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ArrowDownLeft, ArrowUpRight, Check, X, Send } from "lucide-react";

export function useTransfersQuery() {
  const fn = useServerFn(listMyTransfers);
  return useQuery({
    queryKey: ["inventory-transfers"],
    queryFn: () => fn(),
  });
}

/** Incoming / outgoing pending transfers. */
export function TransfersPanel() {
  const qc = useQueryClient();
  const q = useTransfersQuery();
  const respondFn = useServerFn(respondInventoryTransfer);

  const respondM = useMutation({
    mutationFn: (p: { id: string; action: "accept" | "decline" | "cancel" }) =>
      respondFn({ data: p }),
    onSuccess: (_r, p) => {
      toast.success(
        p.action === "accept"
          ? "Sendung angenommen"
          : p.action === "decline"
            ? "Sendung abgelehnt"
            : "Sendung zurückgezogen",
      );
      qc.invalidateQueries({ queryKey: ["inventory-transfers"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const transfers = q.data?.transfers ?? [];
  if (transfers.length === 0) return null;
  const incoming = transfers.filter((t) => t.direction === "in");
  const outgoing = transfers.filter((t) => t.direction === "out");

  return (
    <div className="space-y-3">
      {incoming.length > 0 && (
        <section className="border border-brand/20 bg-background/60 p-4">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-brand">
            <ArrowDownLeft className="h-3 w-3" /> Eingehende Sendungen
            <Badge variant="outline">{incoming.length}</Badge>
          </div>
          <div className="space-y-2">
            {incoming.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-brand/10 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-sm">
                    {t.item_name} · {formatQty(t.qty, t.unit)}
                    {t.quality != null ? ` · Q${t.quality}` : ""}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    von {t.counterpart_name ?? "unbekannt"}
                    {t.note ? ` · ${t.note}` : ""}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    disabled={respondM.isPending}
                    onClick={() =>
                      respondM.mutate({ id: t.id, action: "accept" })
                    }
                  >
                    <Check className="mr-1 h-3 w-3" /> Annehmen
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive"
                    disabled={respondM.isPending}
                    onClick={() =>
                      respondM.mutate({ id: t.id, action: "decline" })
                    }
                  >
                    <X className="mr-1 h-3 w-3" /> Ablehnen
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {outgoing.length > 0 && (
        <section className="border border-brand/10 bg-background/40 p-4">
          <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            <ArrowUpRight className="h-3 w-3" /> Gesendet – offen
            <Badge variant="outline">{outgoing.length}</Badge>
          </div>
          <div className="space-y-2">
            {outgoing.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 border border-brand/10 px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate font-display text-sm">
                    {t.item_name} · {formatQty(t.qty, t.unit)}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                    an {t.counterpart_name ?? "unbekannt"} · wartet auf Annahme
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={respondM.isPending}
                  onClick={() => respondM.mutate({ id: t.id, action: "cancel" })}
                >
                  Zurückziehen
                </Button>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/** Dialog to send (part of) a stack to another org member. */
export function SendItemDialog({
  open,
  onOpenChange,
  item,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: InventoryItem;
}) {
  const qc = useQueryClient();
  const searchFn = useServerFn(searchTransferRecipients);
  const sendFn = useServerFn(sendInventoryItem);
  const [term, setTerm] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const [qty, setQty] = useState<number>(item.qty_available);
  const [note, setNote] = useState("");

  const peopleQ = useQuery({
    queryKey: ["transfer-recipients", term],
    queryFn: () => searchFn({ data: { q: term || undefined } }),
    enabled: open,
  });

  const sendM = useMutation({
    mutationFn: () =>
      sendFn({
        data: {
          item_id: item.id,
          to_user_id: target!,
          qty,
          note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Sendung erstellt – wartet auf Annahme");
      onOpenChange(false);
      setTarget(null);
      setNote("");
      qc.invalidateQueries({ queryKey: ["inventory"] });
      qc.invalidateQueries({ queryKey: ["inventory-transfers"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const people = peopleQ.data?.people ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{item.item_name} senden</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Empfänger (Orgamitglied)</Label>
            <Input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Callsign oder RSI-Handle suchen"
            />
            <div className="max-h-40 space-y-1 overflow-y-auto border border-brand/10 p-1">
              {people.length === 0 && (
                <div className="p-2 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                  keine mitglieder gefunden
                </div>
              )}
              {people.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTarget(p.id)}
                  className={
                    "flex w-full items-center justify-between px-2 py-1 text-left text-sm " +
                    (target === p.id ? "bg-brand/20" : "hover:bg-brand/10")
                  }
                >
                  <span>{p.rsi_handle || p.callsign || "—"}</span>
                  {target === p.id && <Check className="h-3 w-3" />}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label>Menge (max. {formatQty(item.qty_available, item.unit)})</Label>
            <Input
              type="number"
              min={0}
              max={item.qty_available}
              step="any"
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
            />
          </div>
          <div className="space-y-1">
            <Label>Notiz (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            disabled={
              !target || qty <= 0 || qty > item.qty_available || sendM.isPending
            }
            onClick={() => sendM.mutate()}
          >
            <Send className="mr-2 h-4 w-4" /> Senden
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}