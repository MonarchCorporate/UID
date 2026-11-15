import { createFileRoute, Link } from "@tanstack/react-router";
import { Users, Ship, Wrench, Radio, RefreshCw, Layers, ScrollText, MessageSquare, Activity, Gift } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";

export const Route = createFileRoute("/_authenticated/admin/")({
  component: AdminIndexPage,
});

const groups = [
  {
    group: "Organisationen",
    icon: Layers,
    subtitle: "Orgaübergreifende Verwaltung",
    items: [
      {
        title: "Orga-Verwaltung",
        desc: "Alle Orgas anlegen, Name, Tag, Branding & Slug pflegen.",
        to: "/admin/orgs",
        icon: Layers,
      },
      {
        title: "Discord-Anbindung",
        desc: "Discord-Rollen auf Orgas mappen und Mitgliedschaften synchronisieren.",
        to: "/admin/discord",
        icon: MessageSquare,
      },
      {
        title: "Discord-Aktivität",
        desc: "Sprachzeiten, aktive Kanäle und Steuerung des Dauer-Bots.",
        to: "/admin/discord-aktivitaet",
        icon: Activity,
      },
      {
        title: "Gewinnspiele",
        desc: "Gewinnspiele anlegen, Lose aus Discord-Aktivität prüfen und Gewinner ziehen.",
        to: "/admin/gewinnspiele",
        icon: Gift,
      },
    ],
  },
  {
    group: "Benutzer & Einsätze",
    icon: Users,
    subtitle: "Zugänge, Rollen und Operations",
    items: [
      {
        title: "Benutzerverwaltung",
        desc: "Accounts anlegen, Rollen vergeben, Zugänge sperren.",
        to: "/admin/users",
        icon: Users,
      },
      {
        title: "Audit-Log & Zugriffe",
        desc: "Änderungen nachvollziehen und Zugriffe in der Organisation prüfen.",
        to: "/admin/audit",
        icon: ScrollText,
      },
      {
        title: "Einsätze",
        desc: "Alle Einsätze anzeigen und löschen.",
        to: "/admin/missions",
        icon: Radio,
      },
    ],
  },
  {
    group: "Daten & Kataloge",
    icon: RefreshCw,
    subtitle: "Stammdaten und Synchronisierung",
    items: [
      {
        title: "Schiffskatalog",
        desc: "Stammdaten und Beschreibungen pflegen.",
        to: "/admin/ship-catalog",
        icon: Ship,
      },
      {
        title: "Global Loadouts",
        desc: "Default-Loadouts pro Schiff bearbeiten.",
        to: "/admin/global-loadouts",
        icon: Wrench,
      },
      {
        title: "Datenquellen aktualisieren",
        desc: "Items, Blueprints, Missionen, Komponenten & Schiffe.",
        to: "/admin/sync",
        icon: RefreshCw,
      },
    ],
  },
] as const;

function AdminIndexPage() {
  return (
    <PageShell
      eyebrow="Administration"
      title="Admin"
      description="Zentrale Verwaltung für Organisationen, Benutzer und Stammdaten."
    >
      {groups.map((g) => (
        <section key={g.group} className="space-y-4">
          <SectionHeader icon={g.icon} title={g.group} subtitle={g.subtitle} />
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {g.items.map((c) => (
              <Link
                key={c.to}
                to={c.to}
                className="focus-ring group rounded-2xl border border-brand/15 bg-card/40 p-5 transition hover:border-brand/50 hover:bg-card/70"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-brand/25 bg-brand/10 text-brand">
                    <c.icon className="h-4 w-4" />
                  </span>
                  <h2 className="font-display text-base leading-tight group-hover:text-brand">
                    {c.title}
                  </h2>
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{c.desc}</p>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
