import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPublicMissions } from "@/lib/missions.functions";
import { MissionCalendarView } from "@/components/calendar/MissionCalendarView";
import { UidPage, UidPageHeader, uidBtn } from "@/components/uid/UidPage";

const title = "Einsatzkalender — United Imperial Dominion";
const description =
  "Alle öffentlichen Einsätze der UID-Community: Termine einsehen und freiwillig einschreiben.";

export const Route = createFileRoute("/kalender")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: PublicKalenderPage,
});

function PublicKalenderPage() {
  const fn = useServerFn(listPublicMissions);
  const q = useQuery({ queryKey: ["public-missions"], queryFn: () => fn() });

  return (
    <UidPage backdrop="stars" seed={2401}>
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-24">
        <UidPageHeader
          label="Ops // Kalender"
          title="Einsatzkalender"
          intro="Alle öffentlichen Einsätze der Community-Organisationen. Angemeldete Piloten können sich freiwillig einschreiben — auch über Organisationen hinweg."
          actions={
            <>
              <Link to="/dashboard" className={uidBtn}>
                Zum Backoffice
              </Link>
              <Link to="/home2/operationen" className={uidBtn}>
                Operationen
              </Link>
            </>
          }
        />
        <div className="mt-12">
          {q.isLoading ? (
            <div className="border border-border p-12 text-center font-mono text-xs text-muted-foreground">
              // lade…
            </div>
          ) : (
            <MissionCalendarView
              events={q.data?.missions ?? []}
              defaultView="list"
              signup={{
                signedIn: !!q.data?.viewer_signed_in,
                queryKey: ["public-missions"],
              }}
            />
          )}
        </div>
      </section>
    </UidPage>
  );
}
