import { createFileRoute, useNavigate, useParams, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { getListing } from "@/lib/marketplace.functions";
import { PageShell } from "@/components/layout/PageShell";
import { ListingForm } from "@/components/marketplace/ListingForm";

export const Route = createFileRoute("/_authenticated/marketplace/$id/edit")({
  component: EditListingPage,
});

function EditListingPage() {
  const { id } = useParams({ from: "/_authenticated/marketplace/$id/edit" });
  const nav = useNavigate();
  const fn = useServerFn(getListing);
  const q = useQuery({ queryKey: ["marketplace", id], queryFn: () => fn({ data: { id } }) });

  if (q.isLoading) return <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm text-red-400">Nicht gefunden</div>;
  const l = q.data.listing;
  if (!l.is_owner) return <div className="p-6 text-sm text-red-400">Kein Zugriff</div>;

  return (
    <PageShell eyebrow="Schwarzes Brett" title="Eintrag bearbeiten">
      <Link
        to="/marketplace/$id"
        params={{ id }}
        className="mb-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground hover:text-brand"
      >
        <ArrowLeft className="h-3 w-3" /> Zurück
      </Link>
      <div className="mx-auto max-w-3xl border border-brand/10 bg-background/40 p-6">
        <ListingForm
          listingId={l.id}
          initial={{
            type: l.type,
            scope: l.scope,
            org_id: l.org_id,
            title: l.title,
            description: l.description,
            category: l.category ?? "",
            price_auec: l.price_auec != null ? String(l.price_auec) : "",
            quantity: l.quantity != null ? String(l.quantity) : "",
            unit: l.unit ?? "",
            trade_offer: l.trade_offer ?? "",
            trade_want: l.trade_want ?? "",
            location: l.location ?? "",
            image_urls: l.image_urls,
            expires_at: l.expires_at ? new Date(l.expires_at) : undefined,
          }}
          onSaved={(nid) => nav({ to: "/marketplace/$id", params: { id: nid } })}
        />
      </div>
    </PageShell>
  );
}
