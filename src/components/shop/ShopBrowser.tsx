import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, ShoppingCart } from "lucide-react";
import {
  listPublicShopGroups,
  createShopReservationGroup,
  type PublicShopGroup,
} from "@/lib/shop.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useRealtimeInvalidate } from "@/hooks/useRealtimeInvalidate";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ShopBrowser() {
  const fn = useServerFn(listPublicShopGroups);
  const q = useQuery({ queryKey: ["public-shop"], queryFn: () => fn() });
  useRealtimeInvalidate(
    [
      { table: "org_warehouse", invalidate: [["public-shop"]] },
      { table: "shop_reservations", invalidate: [["public-shop"]] },
      { table: "shop_reservation_allocations", invalidate: [["public-shop"]] },
    ],
    "public-shop",
  );
  const [filter, setFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState<string>("all");
  const [buy, setBuy] = useState<PublicShopGroup | null>(null);

  const items = q.data?.groups ?? [];
  const orgs = useMemo(() => {
    const m = new Map<string, string>();
    for (const i of items) if (i.org_id) m.set(i.org_id, i.org_name ?? i.org_tag ?? "Orga");
    return Array.from(m.entries());
  }, [items]);

  const filtered = useMemo(() => {
    let list = items;
    if (orgFilter !== "all") list = list.filter((i) => i.org_id === orgFilter);
    if (filter.trim()) {
      const f = filter.toLowerCase();
      list = list.filter(
        (i) =>
          i.item_name.toLowerCase().includes(f) ||
          (i.category ?? "").toLowerCase().includes(f),
      );
    }
    return list;
  }, [items, filter, orgFilter]);

  return (
    <div>
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Item oder Kategorie…"
              className="pl-8"
            />
          </div>
          <select
            value={orgFilter}
            onChange={(e) => setOrgFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
          >
            <option value="all">Alle Orgas</option>
            {orgs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Lade Angebote…</p>
        ) : filtered.length === 0 ? (
          <div className="border border-dashed border-brand/20 p-10 text-center font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
            // keine angebote
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((i) => (
              <div
                key={i.key}
                className="flex flex-col rounded-xl border border-white/5 bg-white/[0.02] p-4"
              >
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold">{i.item_name}</h3>
                  {i.position_count > 1 && (
                    <Badge variant="outline" className="text-[10px]">
                      {i.position_count} Positionen
                    </Badge>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {i.org_tag ? `[${i.org_tag}] ` : ""}
                  {i.org_name ?? "Orga"}
                  {i.category && ` · ${i.category}`}
                </div>
                {i.sale_note && (
                  <p className="mt-2 text-xs italic text-muted-foreground">
                    „{i.sale_note}"
                  </p>
                )}
                <div className="mt-3 flex items-end justify-between">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {i.available_qty} {i.unit} verfügbar
                    </div>
                    <div className="text-lg font-semibold text-brand">
                      {i.min_unit_price === i.max_unit_price
                        ? i.min_unit_price.toLocaleString("de-DE")
                        : `${i.min_unit_price.toLocaleString("de-DE")}–${i.max_unit_price.toLocaleString("de-DE")}`}{" "}
                      <span className="text-xs text-muted-foreground">
                        aUEC / {i.unit}
                      </span>
                    </div>
                  </div>
                  <Button size="sm" onClick={() => setBuy(i)}>
                    <ShoppingCart className="mr-1 h-3 w-3" /> Reservieren
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

      <BuyDialog
        item={buy}
        onClose={() => setBuy(null)}
        onDone={() => setBuy(null)}
      />
    </div>
  );
}

function BuyDialog({
  item,
  onClose,
  onDone,
}: {
  item: PublicShopGroup | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const qc = useQueryClient();
  const reserveFn = useServerFn(createShopReservationGroup);
  const [qty, setQty] = useState("1");
  const [ingame, setIngame] = useState("");
  const [discord, setDiscord] = useState("");
  const [note, setNote] = useState("");

  const mut = useMutation({
    mutationFn: () =>
      reserveFn({
        data: {
          org_id: item!.org_id,
          item_ref: item!.item_ref,
          item_name: item!.item_name,
          qty: Number(qty),
          buyer_ingame_name: ingame.trim(),
          buyer_discord_name: discord.trim(),
          buyer_note: note.trim() || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Reservierung erstellt. Die Orga meldet sich bei dir.");
      qc.invalidateQueries({ queryKey: ["public-shop"] });
      setQty("1");
      setIngame("");
      setDiscord("");
      setNote("");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const n = Number(qty);
  const priceRange = item
    ? item.min_unit_price === item.max_unit_price
      ? `${item.min_unit_price.toLocaleString("de-DE")} aUEC`
      : `${item.min_unit_price.toLocaleString("de-DE")}–${item.max_unit_price.toLocaleString("de-DE")} aUEC`
    : "";
  const estMin = item ? n * item.min_unit_price : 0;
  const estMax = item ? n * item.max_unit_price : 0;
  const valid =
    !!item &&
    n > 0 &&
    n <= item.available_qty &&
    ingame.trim().length >= 2 &&
    discord.trim().length >= 2;

  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reservieren · {item?.item_name}</DialogTitle>
        </DialogHeader>
        {item && (
          <div className="space-y-3">
            <div className="rounded-md border border-white/5 bg-white/[0.02] p-3 text-xs">
              <div>
                Preis pro {item.unit}:{" "}
                <span className="font-mono text-brand">{priceRange}</span>
              </div>
              <div>
                Verfügbar: {item.available_qty} {item.unit}
              </div>
              <div className="mt-1 border-t border-white/5 pt-1">
                Gesamt ca.:{" "}
                <span className="font-mono text-brand">
                  {estMin === estMax
                    ? `${estMin.toLocaleString("de-DE")} aUEC`
                    : `${estMin.toLocaleString("de-DE")}–${estMax.toLocaleString("de-DE")} aUEC`}
                </span>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="qty">Menge</Label>
              <Input
                id="qty"
                type="number"
                min={1}
                max={item.available_qty}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ig">Ingame-Name</Label>
              <Input
                id="ig"
                value={ingame}
                onChange={(e) => setIngame(e.target.value)}
                maxLength={40}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="dc">Discord-Name</Label>
              <Input
                id="dc"
                value={discord}
                onChange={(e) => setDiscord(e.target.value)}
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="nt">Nachricht (optional)</Label>
              <Textarea
                id="nt"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Abbrechen
          </Button>
          <Button
            disabled={!valid || mut.isPending}
            onClick={() => mut.mutate()}
          >
            Reservieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}