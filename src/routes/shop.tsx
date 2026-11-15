import { createFileRoute } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { UidPage } from "@/components/uid/UidPage";
import { ShopBrowser } from "@/components/shop/ShopBrowser";

export const Route = createFileRoute("/shop")({
  head: () => ({
    meta: [
      { title: "Shop — Monarch Royal Command" },
      {
        name: "description",
        content:
          "Öffentlicher Orga-Shop: Rohstoffe, Komponenten und Ausrüstung reservieren.",
      },
      { property: "og:title", content: "Shop — Monarch Royal Command" },
      {
        property: "og:description",
        content:
          "Öffentlicher Orga-Shop: Rohstoffe, Komponenten und Ausrüstung reservieren.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PublicShopPage,
});

function PublicShopPage() {
  return (
    <UidPage backdrop="grid" seed={3305}>
      <div className="mx-auto max-w-6xl px-6 pt-16 pb-20">
        <div className="mb-8">
          <div className="mb-2 inline-block p-1 border border-brand/30">
            <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
              // marketplace
            </div>
          </div>
          <h1 className="flex items-center gap-3 text-4xl font-bold text-foreground">
            <Store className="h-8 w-8 text-brand" /> Orga-Shop
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Verfügbare Items der Orgas. Reserviert wird direkt hier — die
            Übergabe erfolgt Ingame nach Rücksprache mit der Lagerverwaltung.
          </p>
        </div>
        <ShopBrowser />
      </div>
    </UidPage>
  );
}
