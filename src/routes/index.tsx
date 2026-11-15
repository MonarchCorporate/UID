import { createFileRoute } from "@tanstack/react-router";
import { UidNav } from "@/components/uid/UidNav";
import { UidFooter } from "@/components/uid/UidFooter";
import { UidHomeSections } from "@/components/uid/UidHomeSections";

const title = "United Imperial Dominion — Community unabhängiger Star-Citizen-Organisationen";
const description =
  "Die UID ist eine Community unabhängiger Star-Citizen-Organisationen: gemeinsame Operationen, gebündelte Ressourcen, volle Eigenständigkeit, keine Verpflichtungen.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="uid-theme min-h-screen overflow-x-hidden">
      <UidNav />
      <main className="pt-18">
        <UidHomeSections />
      </main>
      <UidFooter />
    </div>
  );
}
