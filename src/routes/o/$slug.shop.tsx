import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, ShoppingCart } from "lucide-react";
import { listPublicOrgShop, type PublicOrgShopGroup } from "@/lib/public-org.functions";
import { createShopReservationGroup } from "@/lib/shop.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRealtimeInvalidate } from "@/hooks/useRealtimeInvalidate";
import { Route as OrgRoute } from "./$slug";

export const Route = createFileRoute("/o/$slug/shop")({
  head: ({ params }) => ({
    meta: [
      { title: `Shop · ${params.slug}` },
      { property: "og:title", content: `Shop · ${params.slug}` },
    ],
  }),
  component: OrgShopPage,
});

function OrgShopPage() {
  const { org } = OrgRoute.useLoaderData();
  const fn = useServerFn(listPublicOrgShop);
  const q = useQuery({
    queryKey: ["public-org-shop", org.slug],
    queryFn: () => fn({ data: { slug: org.slug } }),
  });
  useRealtimeInvalidate(
    [
      { table: "org_warehouse", invalidate: [["public-org-shop", org.slug]] },
      { table: "shop_reservations", invalidate: [["public-org-shop", org.slug]] },
      { table: "shop_reservation_allocations", invalidate: [["public-org-shop", org.slug]] },
    ],
    `public-org-shop-${org.slug}`,
  );
  const [filter, setFilter] = useState("");
  const [cat, setCat] = useState("all");
  const [buy, setBuy] = useState<PublicOrgShopGroup | null>(null);

  const items = q.data?.groups ?? [];
  const cats = useMemo(() => {
    const s = new Set<string>();
    for (const i of items) if (i.category) s.add(i.category);
    return Array.from(s).sort((a, b) => a.localeCompare(b, "de"));
  }, [items]);
  const filtered = useMemo(() => {
    let l = items;
    if (cat !== "all") l = l.filter((i) => (i.category ?? "") === cat);
    if (filter.trim()) {
      const f = filter.toLowerCase();
      l = l.filter(
        (i) =>
          i.item_name.toLowerCase().includes(f) ||
          (i.category ?? "").toLowerCase().includes(f),
      );
    }
    return l;
  }, [items, filter, cat]);

  return (
    <main className="mx-auto max-w-6xl px-6 pt-16">
      <div className="mb-8">
        <div className="mb-2 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // marketplace
          </div>
        </div>
        <h1 className="font-display text-5xl tracking-tight">Orga-Shop</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Verfügbare Items von {org.name}. Reserviert wird direkt hier – die
          Übergabe erfolgt Ingame.
        </p>
      </div>

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
          value={cat}
          onChange={(e) => setCat(e.target.value)}
          className="h-9 rounded-md border border-input bg-transparent px-2 text-sm"
        >
          <option value="all">Alle Kategorien</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
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
              {i.category && (
                <div className="text-[11px] text-muted-foreground">{i.category}</div>
              )}
              {i.sale_note && (
                <p className="mt-2 text-xs italic text-muted-foreground">„{i.sale_note}"</p>
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
                    <span className="text-xs text-muted-foreground">aUEC / {i.unit}</span>
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
        orgId={org.id}
        item={buy}
        onClose={() => setBuy(null)}
        onDone={() => setBuy(null)}
      />
    </main>
  );
}

function BuyDialog({
  orgId,
  item,
  onClose,
  onDone,
}: {
  orgId: string;
  item: PublicOrgShopGroup | null;
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
          org_id: orgId,
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
      qc.invalidateQueries({ queryKey: ["public-org-shop"] });
      setQty("1");
      setIngame("");
      setDiscord("");
      setNote("");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const n = Number(qty);
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
                Verfügbar: {item.available_qty} {item.unit}
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
          <Button disabled={!valid || mut.isPending} onClick={() => mut.mutate()}>
            Reservieren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}