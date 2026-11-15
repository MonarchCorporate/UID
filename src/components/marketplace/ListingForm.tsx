import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { CalendarIcon, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { createListing, updateListing, signMarketplaceImage } from "@/lib/marketplace.functions";
import { listMyOrgs } from "@/lib/orgs.functions";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export type ListingType = "auftrag" | "suche" | "verkauf" | "tausch";
export type ListingScope = "intern" | "allianz";

export type ListingFormValues = {
  type: ListingType;
  scope: ListingScope;
  org_id: string | null;
  title: string;
  description: string;
  category: string;
  price_auec: string;
  quantity: string;
  unit: string;
  trade_offer: string;
  trade_want: string;
  location: string;
  image_urls: string[];
  expires_at?: Date;
};

const TYPES: { value: ListingType; label: string; hint: string }[] = [
  { value: "auftrag", label: "Auftrag", hint: "Ich biete einen Auftrag mit Belohnung." },
  { value: "suche", label: "Suchanfrage", hint: "Ich suche eine Ware und biete Preis." },
  { value: "verkauf", label: "Verkauf", hint: "Ich verkaufe eine Ware." },
  { value: "tausch", label: "Tausch", hint: "Ich biete X gegen Y." },
];

export function ListingForm({
  initial,
  listingId,
  onSaved,
}: {
  initial?: Partial<ListingFormValues>;
  listingId?: string;
  onSaved: (id: string) => void;
}) {
  const [v, setV] = useState<ListingFormValues>({
    type: initial?.type ?? "auftrag",
    scope: initial?.scope ?? "allianz",
    org_id: initial?.org_id ?? null,
    title: initial?.title ?? "",
    description: initial?.description ?? "",
    category: initial?.category ?? "",
    price_auec: initial?.price_auec ?? "",
    quantity: initial?.quantity ?? "",
    unit: initial?.unit ?? "",
    trade_offer: initial?.trade_offer ?? "",
    trade_want: initial?.trade_want ?? "",
    location: initial?.location ?? "",
    image_urls: initial?.image_urls ?? [],
    expires_at: initial?.expires_at,
  });
  const [uploading, setUploading] = useState(false);
  const orgsFn = useServerFn(listMyOrgs);
  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn({}) });
  const myOrgs = orgsQ.data?.orgs ?? [];

  const signFn = useServerFn(signMarketplaceImage);
  const createFn = useServerFn(createListing);
  const updateFn = useServerFn(updateListing);

  const mut = useMutation({
    mutationFn: async () => {
      const payload = {
        type: v.type,
        scope: v.scope,
        org_id: v.scope === "intern" ? v.org_id : null,
        title: v.title.trim(),
        description: v.description.trim(),
        category: v.category.trim() || null,
        price_auec: v.price_auec ? Number(v.price_auec) : null,
        quantity: v.quantity ? Number(v.quantity) : null,
        unit: v.unit.trim() || null,
        trade_offer: v.trade_offer.trim() || null,
        trade_want: v.trade_want.trim() || null,
        location: v.location.trim() || null,
        image_urls: v.image_urls,
        expires_at: v.expires_at ? v.expires_at.toISOString() : null,
      };
      if (listingId) {
        await updateFn({ data: { ...payload, id: listingId } });
        return listingId;
      }
      const r = await createFn({ data: payload });
      return r.id;
    },
    onSuccess: (id) => {
      toast.success(listingId ? "Aktualisiert" : "Eintrag erstellt");
      onSaved(id);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    if (v.image_urls.length + files.length > 6) {
      toast.error("Maximal 6 Bilder");
      return;
    }
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Nicht eingeloggt");
      const newPaths: string[] = [];
      for (const file of Array.from(files)) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${uid}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage
          .from("marketplace-images")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (error) throw error;
        newPaths.push(path);
      }
      setV((p) => ({ ...p, image_urls: [...p.image_urls, ...newPaths] }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload fehlgeschlagen");
    } finally {
      setUploading(false);
    }
  }

  const isTrade = v.type === "tausch";

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (!v.title.trim()) return;
        if (v.scope === "intern" && !v.org_id) {
          toast.error("Bitte Organisation auswählen");
          return;
        }
        mut.mutate();
      }}
    >
      <div>
        <Label className="mb-2 block">Typ</Label>
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {TYPES.map((t) => (
            <button
              type="button"
              key={t.value}
              onClick={() => setV((p) => ({ ...p, type: t.value }))}
              className={cn(
                "border p-3 text-left transition-colors",
                v.type === t.value
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-brand/15 hover:border-brand/40",
              )}
            >
              <div className="font-display text-sm">{t.label}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{t.hint}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Sichtbarkeit</Label>
        <div className="grid gap-2 md:grid-cols-2">
          {[
            {
              value: "intern" as const,
              label: "Orga-intern",
              hint: "Nur Mitglieder deiner Organisation sehen den Eintrag.",
            },
            {
              value: "allianz" as const,
              label: "Orgaübergreifend",
              hint: "Alle Organisationen in der Community sehen den Eintrag.",
            },
          ].map((s) => (
            <button
              type="button"
              key={s.value}
              onClick={() =>
                setV((p) => ({
                  ...p,
                  scope: s.value,
                  org_id:
                    s.value === "intern" && !p.org_id && myOrgs.length === 1
                      ? myOrgs[0]!.id
                      : p.org_id,
                }))
              }
              className={cn(
                "border p-3 text-left transition-colors",
                v.scope === s.value
                  ? "border-brand bg-brand/10 text-brand"
                  : "border-brand/15 hover:border-brand/40",
              )}
            >
              <div className="font-display text-sm">{s.label}</div>
              <div className="mt-1 text-[10px] text-muted-foreground">{s.hint}</div>
            </button>
          ))}
        </div>
        {v.scope === "intern" && (
          <div className="mt-3 space-y-2">
            <Label htmlFor="org">Organisation *</Label>
            {myOrgs.length === 0 ? (
              <p className="text-xs text-red-400">
                Du bist in keiner Organisation – bitte orgaübergreifend inserieren.
              </p>
            ) : (
              <select
                id="org"
                className="w-full border border-brand/20 bg-background/50 px-3 py-2 text-sm focus:border-brand focus:outline-none"
                value={v.org_id ?? ""}
                onChange={(e) => setV((p) => ({ ...p, org_id: e.target.value || null }))}
              >
                <option value="">– auswählen –</option>
                {myOrgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="title">Titel *</Label>
        <Input
          id="title"
          required
          maxLength={140}
          value={v.title}
          onChange={(e) => setV((p) => ({ ...p, title: e.target.value }))}
          placeholder="Kurz & prägnant"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="desc">Beschreibung</Label>
        <Textarea
          id="desc"
          rows={5}
          maxLength={4000}
          value={v.description}
          onChange={(e) => setV((p) => ({ ...p, description: e.target.value }))}
          placeholder="Details, Anforderungen, Treffpunkt…"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="cat">Kategorie</Label>
          <Input
            id="cat"
            maxLength={64}
            value={v.category}
            onChange={(e) => setV((p) => ({ ...p, category: e.target.value }))}
            placeholder="z.B. Transport, Salvage, Mining"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc">Ort / System</Label>
          <Input
            id="loc"
            maxLength={120}
            value={v.location}
            onChange={(e) => setV((p) => ({ ...p, location: e.target.value }))}
            placeholder="z.B. Stanton / Area 18"
          />
        </div>
      </div>

      {!isTrade && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="price">
              {v.type === "auftrag" ? "Belohnung (aUEC)" : "Preis (aUEC)"}
            </Label>
            <Input
              id="price"
              type="number"
              min={0}
              value={v.price_auec}
              onChange={(e) => setV((p) => ({ ...p, price_auec: e.target.value }))}
              placeholder="z.B. 250000"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="qty">Menge</Label>
            <Input
              id="qty"
              type="number"
              min={0}
              step="any"
              value={v.quantity}
              onChange={(e) => setV((p) => ({ ...p, quantity: e.target.value }))}
              placeholder="z.B. 42"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="unit">Einheit</Label>
            <Input
              id="unit"
              maxLength={16}
              value={v.unit}
              onChange={(e) => setV((p) => ({ ...p, unit: e.target.value }))}
              placeholder="SCU / Stück"
            />
          </div>
        </div>
      )}

      {isTrade && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="offer">Ich biete</Label>
            <Textarea
              id="offer"
              rows={3}
              maxLength={500}
              value={v.trade_offer}
              onChange={(e) => setV((p) => ({ ...p, trade_offer: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="want">Ich suche</Label>
            <Textarea
              id="want"
              rows={3}
              maxLength={500}
              value={v.trade_want}
              onChange={(e) => setV((p) => ({ ...p, trade_want: e.target.value }))}
            />
          </div>
        </div>
      )}

      <div className="space-y-2">
        <Label>Ablaufdatum (optional)</Label>
        <div className="flex gap-2">
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className={cn(
                  "flex flex-1 items-center gap-2 border border-brand/20 bg-background/50 px-4 py-2 text-left text-sm focus:border-brand focus:outline-none",
                  !v.expires_at && "text-muted-foreground",
                )}
              >
                <CalendarIcon className="h-4 w-4" />
                {v.expires_at
                  ? format(v.expires_at, "PP", { locale: de })
                  : "Kein Ablauf gesetzt"}
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={v.expires_at}
                onSelect={(d) => setV((p) => ({ ...p, expires_at: d ?? undefined }))}
                initialFocus
                locale={de}
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          {v.expires_at && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setV((p) => ({ ...p, expires_at: undefined }))}
            >
              Reset
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Bilder (max. 6)</Label>
        <div className="flex flex-wrap gap-2">
          {v.image_urls.map((path) => (
            <ImageThumb
              key={path}
              path={path}
              onRemove={() =>
                setV((p) => ({ ...p, image_urls: p.image_urls.filter((x) => x !== path) }))
              }
            />
          ))}
          {v.image_urls.length < 6 && (
            <label className="flex h-24 w-24 cursor-pointer flex-col items-center justify-center border border-dashed border-brand/30 text-brand/70 hover:border-brand hover:text-brand">
              <Upload className="h-5 w-5" />
              <span className="mt-1 text-[10px] uppercase tracking-[0.2em]">
                {uploading ? "…" : "Upload"}
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => uploadFiles(e.target.files)}
              />
            </label>
          )}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-brand/10 pt-4">
        <Button type="submit" disabled={mut.isPending || !v.title.trim() || uploading}>
          {mut.isPending ? "Speichere…" : listingId ? "Speichern" : "Eintrag erstellen"}
        </Button>
      </div>
    </form>
  );
}

function ImageThumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  return <SignedImageThumb path={path} onRemove={onRemove} />;
}

function SignedImageThumb({ path, onRemove }: { path: string; onRemove: () => void }) {
  const signFn = useServerFn(signMarketplaceImage);
  const [url, setUrl] = useState<string | null>(null);
  if (!url) {
    signFn({ data: { path } })
      .then((r) => setUrl(r.url))
      .catch(() => setUrl(null));
  }
  return (
    <div className="relative h-24 w-24 overflow-hidden border border-brand/20 bg-background/40">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
          …
        </div>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="absolute right-1 top-1 rounded bg-black/70 p-0.5 text-white hover:bg-red-500"
        aria-label="Bild entfernen"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
