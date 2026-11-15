import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listPublicOrgMissions } from "@/lib/public-org.functions";
import { MissionCalendarView } from "@/components/calendar/MissionCalendarView";
import { Route as OrgRoute } from "./$slug";

export const Route = createFileRoute("/o/$slug/kalender")({
  head: ({ params }) => ({
    meta: [
      { title: `Kalender · ${params.slug}` },
      { property: "og:title", content: `Kalender · ${params.slug}` },
    ],
  }),
  component: OrgKalenderPage,
});

function OrgKalenderPage() {
  const { org } = OrgRoute.useLoaderData();
  const fn = useServerFn(listPublicOrgMissions);
  const q = useQuery({
    queryKey: ["public-org-missions", org.slug],
    queryFn: () => fn({ data: { slug: org.slug } }),
  });

  return (
    <main className="mx-auto max-w-6xl px-6 pt-16">
      <div className="mb-8">
        <div className="mb-2 inline-block p-1 border border-brand/30">
          <div className="border border-brand/10 px-4 py-1 font-mono text-[10px] uppercase tracking-[0.3em] text-brand">
            // Calendar
          </div>
        </div>
        <h1 className="font-display text-5xl tracking-tight">Einsatzkalender</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Alle öffentlichen Einsätze von {org.name}.
        </p>
      </div>
      {q.isLoading ? (
        <div className="p-12 text-center font-mono text-xs text-muted-foreground">// lade…</div>
      ) : (
        <MissionCalendarView events={q.data?.missions ?? []} />
      )}
    </main>
  );
}