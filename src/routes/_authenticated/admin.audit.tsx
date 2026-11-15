import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ScrollText, ShieldCheck, Users, Clock, Ban, Search } from "lucide-react";
import { PageShell, SectionHeader } from "@/components/layout/PageShell";
import { listAuditLog, getAccessOverview } from "@/lib/audit.functions";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/admin/audit")({
  component: AdminAuditPage,
  head: () => ({
    meta: [
      { title: "Audit-Log & Zugriffe – Administration" },
      {
        name: "description",
        content:
          "Nachvollziehen, welche Änderungen in der Organisation vorgenommen wurden und wer wann zuletzt zugegriffen hat.",
      },
      { property: "og:title", content: "Audit-Log & Zugriffe – Administration" },
      {
        property: "og:description",
        content: "Änderungsprotokoll und Zugriffsübersicht für App-Admins.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmt = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

function actionTone(action: string) {
  if (/banned|removed|revoked|deleted/.test(action)) return "destructive" as const;
  if (/created|granted|added/.test(action)) return "default" as const;
  return "secondary" as const;
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: number | string;
}) {
  return (
    <Card className="glass-card">
      <CardContent className="flex items-center gap-3 p-4">
        <span className="rounded-xl bg-brand/10 p-2 text-brand">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <div className="text-xl font-semibold leading-tight">{value}</div>
          <div className="truncate text-xs text-muted-foreground">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdminAuditPage() {
  const auditFn = useServerFn(listAuditLog);
  const accessFn = useServerFn(getAccessOverview);

  const [search, setSearch] = useState("");
  const [action, setAction] = useState("all");
  const [days, setDays] = useState("30");
  const [userSearch, setUserSearch] = useState("");

  const auditQ = useQuery({
    queryKey: ["audit-log", search, action, days],
    queryFn: () =>
      auditFn({
        data: {
          search: search.trim() || undefined,
          action: action === "all" ? undefined : action,
          days: Number(days),
          limit: 300,
        },
      }),
  });

  const accessQ = useQuery({ queryKey: ["access-overview"], queryFn: () => accessFn() });

  const users = useMemo(() => {
    const list = accessQ.data?.users ?? [];
    const q = userSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.email ?? "").toLowerCase().includes(q) ||
        u.orgs.some((o) => o.toLowerCase().includes(q)),
    );
  }, [accessQ.data, userSearch]);

  const stats = accessQ.data?.stats;

  return (
    <PageShell
      eyebrow="Administration"
      title="Audit-Log & Zugriffe"
      description="Nachvollziehen, wer welche Änderungen vorgenommen hat – und wer zuletzt auf die Organisation zugegriffen hat."
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Stat icon={Users} label="Accounts gesamt" value={stats?.total ?? "—"} />
        <Stat icon={ShieldCheck} label="App-Admins" value={stats?.admins ?? "—"} />
        <Stat icon={Clock} label="Aktiv (24 h)" value={stats?.active24h ?? "—"} />
        <Stat icon={Clock} label="Aktiv (7 Tage)" value={stats?.active7d ?? "—"} />
        <Stat icon={Ban} label="Gesperrt" value={stats?.banned ?? "—"} />
      </div>

      <Tabs defaultValue="audit" className="space-y-6">
        <TabsList>
          <TabsTrigger value="audit">Änderungen</TabsTrigger>
          <TabsTrigger value="access">Zugriffe</TabsTrigger>
        </TabsList>

        <TabsContent value="audit" className="space-y-4">
          <SectionHeader
            icon={ScrollText}
            title="Änderungsprotokoll"
            subtitle="Alle protokollierten Admin- und Orga-Aktionen"
          />
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Suche nach Aktion, Person oder Objekt…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Aktion" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle Aktionen</SelectItem>
                {(auditQ.data?.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Letzte 24 h</SelectItem>
                <SelectItem value="7">7 Tage</SelectItem>
                <SelectItem value="30">30 Tage</SelectItem>
                <SelectItem value="90">90 Tage</SelectItem>
                <SelectItem value="365">1 Jahr</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Zeitpunkt</TableHead>
                  <TableHead className="w-[160px]">Person</TableHead>
                  <TableHead className="w-[220px]">Aktion</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead className="w-[140px]">Orga</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center font-mono text-xs text-muted-foreground">
                      // lade protokoll…
                    </TableCell>
                  </TableRow>
                )}
                {!auditQ.isLoading && (auditQ.data?.entries.length ?? 0) === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-sm text-muted-foreground">
                      Keine Einträge im gewählten Zeitraum.
                    </TableCell>
                  </TableRow>
                )}
                {(auditQ.data?.entries ?? []).map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(e.created_at)}
                    </TableCell>
                    <TableCell className="text-sm">{e.actor_label ?? "System"}</TableCell>
                    <TableCell>
                      <Badge variant={actionTone(e.action)} className="font-mono text-[11px]">
                        {e.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      <div>{e.summary ?? "—"}</div>
                      {e.entity_id && (
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {e.entity_type}: {e.entity_id}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {e.org_name ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="access" className="space-y-4">
          <SectionHeader
            icon={ShieldCheck}
            title="Zugriffsübersicht"
            subtitle="Letzte Anmeldungen, Rollen und Orga-Zugehörigkeiten"
          />
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Nach Person, E-Mail oder Orga suchen…"
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
            />
          </div>
          <Card className="glass-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Person</TableHead>
                  <TableHead className="w-[220px]">E-Mail</TableHead>
                  <TableHead className="w-[160px]">Letzter Zugriff</TableHead>
                  <TableHead className="w-[140px]">Login-Methode</TableHead>
                  <TableHead>Orgas</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accessQ.isLoading && (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center font-mono text-xs text-muted-foreground">
                      // lade zugriffe…
                    </TableCell>
                  </TableRow>
                )}
                {users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="text-sm font-medium">{u.name}</TableCell>
                    <TableCell className="truncate text-xs text-muted-foreground">
                      {u.email ?? "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {fmt(u.lastSignInAt)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.providers || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {u.orgs.length ? u.orgs.join(", ") : "—"}
                    </TableCell>
                    <TableCell className="space-x-1">
                      {u.isAdmin && <Badge variant="default">Admin</Badge>}
                      {u.banned && <Badge variant="destructive">Gesperrt</Badge>}
                      {!u.isAdmin && !u.banned && (
                        <Badge variant="secondary">Aktiv</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}
