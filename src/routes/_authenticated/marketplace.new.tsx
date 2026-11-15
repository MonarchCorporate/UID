import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ListingForm } from "@/components/marketplace/ListingForm";

export const Route = createFileRoute("/_authenticated/marketplace/new")({
  head: () => ({ meta: [{ title: "Neuer Eintrag – Schwarzes Brett" }] }),
  component: NewListingPage,
});

function NewListingPage() {
  const nav = useNavigate();
  return (
    <PageShell
      eyebrow="Schwarzes Brett"
      title="Neuer Eintrag"
      description="Auftrag, Suchanfrage, Verkauf oder Tausch inserieren."
    >
      <div className="mx-auto max-w-3xl border border-brand/10 bg-background/40 p-6">
        <ListingForm onSaved={(id) => nav({ to: "/marketplace/$id", params: { id } })} />
      </div>
    </PageShell>
  );
}
