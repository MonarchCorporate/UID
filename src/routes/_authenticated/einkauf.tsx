import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/layout/PageShell";
import { ShopBrowser } from "@/components/shop/ShopBrowser";

export const Route = createFileRoute("/_authenticated/einkauf")({
  head: () => ({
    meta: [
      { title: "Shop – United Imperial Dominion" },
      {
        name: "description",
        content: "Verfügbare Items der Orgas direkt im Dashboard reservieren.",
      },
      { property: "og:title", content: "Shop – United Imperial Dominion" },
      {
        property: "og:description",
        content: "Verfügbare Items der Orgas direkt im Dashboard reservieren.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: DashboardShopPage,
});

function DashboardShopPage() {
  return (
    <PageShell
      eyebrow="Bereiche"
      title="Shop"
      description="Verfügbare Items der Orgas. Reserviert wird direkt hier — die Übergabe erfolgt Ingame nach Rücksprache mit der Lagerverwaltung."
    >
      <ShopBrowser />
    </PageShell>
  );
}
