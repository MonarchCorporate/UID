import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  Area,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ComposedChart,

} from "recharts";
import {
  listTreasuryEntries,
  createTreasuryEntry,
  deleteTreasuryEntry,
  updateTreasuryEntry,
  createTreasuryRequest,
  listTreasuryRequests,
  reviewTreasuryRequest,
  cancelTreasuryRequest,
  listTreasuryCategories,
  type TreasuryEntry,
  type TreasurySummary,
  type TreasuryRequest,
  type TreasuryCategory,
} from "@/lib/org-treasury.functions";
import { listOrgMembers, listMyOrgs } from "@/lib/orgs.functions";
import { useCurrentOrgId } from "./orga";
import { PageHint } from "@/components/orga/PageHint";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TreasuryDiscordSettings } from "@/components/orga/TreasuryDiscordSettings";
import { TreasuryCategorySettings } from "@/components/orga/TreasuryCategorySettings";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Trash2,
  Pencil,
  ArrowDown,
  ArrowUp,
  Wrench,
  Receipt,
  Download,
  TrendingUp,
  TrendingDown,
  Search,
  Check,
  X as XIcon,
  Send,
  Clock,
} from "lucide-react";

type NewEntry = {
  org_id: string;
  kind: "deposit" | "withdraw" | "expense" | "adjust";
  amount_auec: number;
  player_id?: string | null;
  description?: string | null;
  category?: string | null;
};

export const Route = createFileRoute("/_authenticated/orga/kasse")({
  component: TreasuryPage,
});

const TR = ["owner", "officer", "treasurer"];

const KIND_META = {
  deposit: { label: "Einzahlung", icon: ArrowDown, color: "text-emerald-400" },
  withdraw: { label: "Auszahlung", icon: ArrowUp, color: "text-rose-400" },
  expense: { label: "Ausgabe", icon: Receipt, color: "text-rose-300" },
  adjust: { label: "Korrektur", icon: Wrench, color: "text-amber-300" },
} as const;

const PIE_COLORS = [
  "#22d3ee",
  "#a78bfa",
  "#f59e0b",
  "#34d399",
  "#f472b6",
  "#60a5fa",
  "#fb7185",
  "#facc15",
];

function fmt(n: number) {
  return `${Math.round(n).toLocaleString("de-DE")} aUEC`;
}

function fmtCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(0)}k`;
  return String(Math.round(n));
}

function monthLabel(key: string) {
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString("de-DE", { month: "short", year: "2-digit" });
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function downloadCsv(name: string, rows: (string | number | null)[][]) {
  const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function TreasuryPage() {
  const [orgId] = useCurrentOrgId();
  const orgsFn = useServerFn(listMyOrgs);
  const listFn = useServerFn(listTreasuryEntries);
  const memFn = useServerFn(listOrgMembers);
  const createFn = useServerFn(createTreasuryEntry);
  const delFn = useServerFn(deleteTreasuryEntry);
  const updateFn = useServerFn(updateTreasuryEntry);
  const catFn = useServerFn(listTreasuryCategories);
  const qc = useQueryClient();

  const orgsQ = useQuery({ queryKey: ["my-orgs"], queryFn: () => orgsFn() });
  const me = orgsQ.data?.orgs.find((o) => o.id === orgId);
  const roleCanBook = me
    ? TR.includes(me.my_role) || (me.my_permissions ?? []).includes("treasury.manage")
    : false;

  const q = useQuery({
    queryKey: ["org-treasury", orgId],
    queryFn: () => listFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });
  const canBook = q.data?.canBook ?? roleCanBook;
  const canSeePlayers = q.data?.canSeePlayers ?? false;
  const canBotConfig =
    me?.my_role === "owner" ||
    (me?.my_permissions ?? []).includes("treasury.discord");
  const memQ = useQuery({
    queryKey: ["org-members", orgId],
    queryFn: () => memFn({ data: { org_id: orgId! } }),
    enabled: !!orgId && canSeePlayers,
  });
  const catQ = useQuery({
    queryKey: ["treasury-categories", orgId],
    queryFn: () => catFn({ data: { org_id: orgId! } }),
    enabled: !!orgId,
  });
  const definedCategories = catQ.data?.categories ?? [];

  const createM = useMutation({
    mutationFn: (v: NewEntry) => createFn({ data: v }),
    onSuccess: () => {
      toast.success("Buchung angelegt");
      qc.invalidateQueries({ queryKey: ["org-treasury"] });
      setOpen(false);
      setAmount("");
      setDesc("");
      setCategory("");
      setPlayerId("");
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const delM = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Buchung gelöscht");
      qc.invalidateQueries({ queryKey: ["org-treasury"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const updateM = useMutation({
    mutationFn: (v: EditPayload) => updateFn({ data: v }),
    onSuccess: () => {
      toast.success("Buchung aktualisiert");
      qc.invalidateQueries({ queryKey: ["org-treasury"] });
      setEditEntry(null);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<keyof typeof KIND_META>("deposit");
  const [amount, setAmount] = useState("");
  const [playerId, setPlayerId] = useState<string>("");
  const [desc, setDesc] = useState("");
  const [category, setCategory] = useState("");
  const [editEntry, setEditEntry] = useState<TreasuryEntry | null>(null);

  if (!orgId)
    return (
      <p className="text-sm text-muted-foreground">Keine Orga ausgewählt.</p>
    );

  const entries = q.data?.entries ?? [];
  const summary = q.data?.summary as TreasurySummary | undefined;
  const needsPlayer = kind === "deposit" || kind === "withdraw";
  const categoryNames = Array.from(
    new Set([
      ...definedCategories.map((c) => c.name),
      ...(summary?.perCategory.map((c) => c.category) ?? []),
    ]),
  );
  const categoryColors: Record<string, string> = Object.fromEntries(
    definedCategories.map((c) => [c.name, c.color]),
  );

  const monthDelta = summary
    ? summary.currentMonth.net - summary.previousMonth.net
    : 0;

  return (
    <div className="space-y-4">
      {/* KPI header */}
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard label="Saldo" value={summary ? fmt(summary.balance) : "—"} accent="text-brand" />
        <KpiCard
          label="Einzahlungen gesamt"
          value={summary ? fmt(summary.totals.deposit) : "—"}
          accent="text-emerald-300"
        />
        <KpiCard
          label="Ausgaben gesamt"
          value={summary ? fmt(summary.totals.expense + summary.totals.withdraw) : "—"}
          accent="text-rose-300"
        />
        <KpiCard
          label="Netto akt. Monat"
          value={summary ? fmt(summary.currentMonth.net) : "—"}
          accent={summary && summary.currentMonth.net >= 0 ? "text-emerald-300" : "text-rose-300"}
          hint={
            summary
              ? `${monthDelta >= 0 ? "▲" : "▼"} ${fmt(Math.abs(monthDelta))} vs. Vormonat`
              : undefined
          }
          hintIcon={monthDelta >= 0 ? TrendingUp : TrendingDown}
      />
    </div>


    <div className="flex items-center justify-between">
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-brand/70">
          // treasury
        </div>
        {canBook && (
          <BookingDialog
            open={open}
            setOpen={setOpen}
            kind={kind}
            setKind={setKind}
            amount={amount}
            setAmount={setAmount}
            playerId={playerId}
            setPlayerId={setPlayerId}
            desc={desc}
            setDesc={setDesc}
            category={category}
            setCategory={setCategory}
            needsPlayer={needsPlayer}
            members={memQ.data?.members ?? []}
            categories={definedCategories}
            onSave={() =>
              createM.mutate({
                org_id: orgId,
                kind,
                amount_auec: Number(amount),
                player_id: needsPlayer ? playerId : null,
                description: desc || null,
                category: category || null,
              })
            }
            saving={createM.isPending}
          />
        )}
      </div>

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2 md:w-auto md:grid-cols-none md:flex">
          <TabsTrigger value="overview">Übersicht</TabsTrigger>
          <TabsTrigger value="requests">Anfragen</TabsTrigger>
          {canSeePlayers && <TabsTrigger value="entries">Buchungen</TabsTrigger>}
          {canSeePlayers && <TabsTrigger value="members">Auswertung</TabsTrigger>}
          {canSeePlayers && <TabsTrigger value="categories">Kategorien</TabsTrigger>}
          {(canBotConfig || canBook) && (
            <TabsTrigger value="bot">Einstellungen</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab
            summary={summary}
            entries={entries}
            categoryColors={categoryColors}
            categoryNames={categoryNames}
          />
        </TabsContent>

        <TabsContent value="requests">
          <RequestsTab orgId={orgId} canReviewFallback={canBook} />
        </TabsContent>

        {canSeePlayers && (
          <>
            <TabsContent value="entries">
              <EntriesTab
                entries={entries}
                categories={categoryNames}
                members={memQ.data?.members ?? []}
                canBook={canBook}
                canSeePlayers
                onDelete={(id) => delM.mutate(id)}
                onEdit={(e) => setEditEntry(e)}
              />
            </TabsContent>

            <TabsContent value="members">
              <MembersTab summary={summary} entries={entries} />
            </TabsContent>

            <TabsContent value="categories">
              <CategoriesTab summary={summary} categoryColors={categoryColors} />
            </TabsContent>
          </>
        )}

        {(canBotConfig || canBook) && (
          <TabsContent value="bot" className="space-y-4">
            <TreasuryCategorySettings orgId={orgId} />
            {canBotConfig && <TreasuryDiscordSettings orgId={orgId} />}
          </TabsContent>
        )}
      </Tabs>

      {editEntry && (
        <EditEntryDialog
          entry={editEntry}
          members={memQ.data?.members ?? []}
          categories={definedCategories}
          onClose={() => setEditEntry(null)}
          onSave={(v) => updateM.mutate(v)}
          saving={updateM.isPending}
        />
      )}
    </div>
  );
}

type EditPayload = {
  id: string;
  kind: "deposit" | "withdraw" | "expense" | "adjust";
  amount_auec: number;
  player_id: string | null;
  description: string | null;
  category: string | null;
  booked_at?: string;
};

function EditEntryDialog({
  entry,
  members,
  categories,
  onClose,
  onSave,
  saving,
}: {
  entry: TreasuryEntry;
  members: Array<{ user_id: string; callsign: string | null }>;
  categories: TreasuryCategory[];
  onClose: () => void;
  onSave: (v: EditPayload) => void;
  saving: boolean;
}) {
  const [kind, setKind] = useState<TreasuryEntry["kind"]>(entry.kind);
  const [amount, setAmount] = useState(String(entry.amount_auec));
  const [playerId, setPlayerId] = useState(entry.player_id ?? "");
  const [desc, setDesc] = useState(entry.description ?? "");
  const [category, setCategory] = useState(entry.category ?? "");
  const [when, setWhen] = useState(() => {
    const d = new Date(entry.booked_at);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  });
  const needsPlayer = kind === "deposit" || kind === "withdraw";
  const usable = categories.filter((c) => {
    if (c.kind === "both") return true;
    if (c.kind === "deposit") return kind === "deposit" || kind === "adjust";
    return kind === "withdraw" || kind === "expense" || kind === "adjust";
  });

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buchung bearbeiten</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Art</Label>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as TreasuryEntry["kind"])}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Betrag (aUEC)</Label>
              <Input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-1">
            <Label>Buchungsdatum</Label>
            <Input
              type="datetime-local"
              value={when}
              onChange={(e) => setWhen(e.target.value)}
            />
          </div>
          {needsPlayer && (
            <div className="grid gap-1">
              <Label>Spieler</Label>
              <Select value={playerId} onValueChange={setPlayerId}>
                <SelectTrigger><SelectValue placeholder="Mitglied wählen" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.callsign ?? m.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1">
            <Label>Kategorie (optional)</Label>
            <Select
              value={category || "__none"}
              onValueChange={(v) => setCategory(v === "__none" ? "" : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Kategorie wählen" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Keine Kategorie</SelectItem>
                {usable.map((c) => (
                  <SelectItem key={c.id} value={c.name}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 rounded-full border border-white/20"
                        style={{ backgroundColor: c.color }}
                      />
                      {c.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1">
            <Label>Notiz (optional)</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Abbrechen</Button>
          <Button
            disabled={
              !amount ||
              Number.isNaN(Number(amount)) ||
              (needsPlayer && !playerId) ||
              saving
            }
            onClick={() =>
              onSave({
                id: entry.id,
                kind,
                amount_auec: Number(amount),
                player_id: needsPlayer ? playerId : null,
                description: desc.trim() || null,
                category: category || null,
                ...(when ? { booked_at: new Date(when).toISOString() } : {}),
              })
            }
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({
  label,
  value,
  accent,
  hint,
  hintIcon: HintIcon,
}: {
  label: string;
  value: string;
  accent?: string;
  hint?: string;
  hintIcon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card className="border-brand/10">
      <CardHeader className="pb-1">
        <CardTitle className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className={`font-display text-2xl ${accent ?? ""}`}>{value}</div>
        {hint && (
          <div className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
            {HintIcon && <HintIcon className="h-3 w-3" />}
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ---------------- Overview ---------------- */

function OverviewTab({
  summary,
  entries,
  categoryColors,
  categoryNames,
}: {
  summary?: TreasurySummary;
  entries: TreasuryEntry[];
  categoryColors: Record<string, string>;
  categoryNames: string[];
}) {
  if (!summary) return <EmptyState text="Lade Auswertung…" />;

  const [range, setRange] = useState<"3" | "6" | "12" | "all">("12");
  const [chartType, setChartType] = useState<"stacked" | "grouped" | "line" | "area">("stacked");

  const allMonths = summary.perMonth.map((m) => ({ ...m, label: monthLabel(m.month) }));
  const monthData = useMemo(() => {
    if (range === "all") return allMonths;
    const n = Number(range);
    return allMonths.slice(-n);
  }, [allMonths, range]);

  const rangeLabel = {
    "3": "letzten 3 Monate",
    "6": "letzten 6 Monate",
    "12": "letzten 12 Monate",
    all: "gesamter Zeitraum",
  }[range];

  const catData = summary.perCategory.slice(0, 8);

  const isBarLike = chartType === "stacked" || chartType === "grouped";
  const isAreaLike = chartType === "area";

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Card className="min-w-0 lg:col-span-2 border-brand/10 bg-gradient-to-br from-card to-card/95 overflow-hidden">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div className="space-y-0.5">
            <CardTitle className="text-sm font-semibold tracking-wide">Monatsverlauf</CardTitle>
            <p className="text-xs text-muted-foreground">Ein- und Auszahlungen der {rangeLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="hidden sm:flex items-center gap-3 text-[10px] font-medium text-white">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-chart-4 shadow-[0_0_10px_var(--chart-4)]" />
                Einzahlungen
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-chart-1 shadow-[0_0_10px_var(--chart-1)]" />
                Ausgaben
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-chart-5 shadow-[0_0_10px_var(--chart-5)]" />
                Auszahlungen
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-chart-2 shadow-[0_0_10px_var(--chart-2)]" />
                Netto
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Select value={range} onValueChange={(v) => setRange(v as typeof range)}>
                <SelectTrigger className="h-8 w-28 text-xs bg-card/50 border-brand/10">
                  <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 Monate</SelectItem>
                  <SelectItem value="6">6 Monate</SelectItem>
                  <SelectItem value="12">12 Monate</SelectItem>
                  <SelectItem value="all">Gesamt</SelectItem>
                </SelectContent>
              </Select>
              <Select value={chartType} onValueChange={(v) => setChartType(v as typeof chartType)}>
                <SelectTrigger className="h-8 w-32 text-xs bg-card/50 border-brand/10">
                  <TrendingUp className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stacked">Gestapelt</SelectItem>
                  <SelectItem value="grouped">Gruppiert</SelectItem>
                  <SelectItem value="line">Linien</SelectItem>
                  <SelectItem value="area">Fläche</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {monthData.length === 0 ? (
            <EmptyState text="Noch keine Buchungen." />
          ) : (
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthData} margin={{ top: 10, right: 10, bottom: 0, left: -10 }}>
                  <defs>
                    <linearGradient id="depositGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id="withdrawGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={1} />
                      <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.75} />
                    </linearGradient>
                    <linearGradient id="netArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="depositArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-4)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-4)" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="expenseArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.04} />
                    </linearGradient>
                    <linearGradient id="withdrawArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-5)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--chart-5)" stopOpacity={0.04} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.25} vertical={false} strokeDasharray="4 4" />
                  <XAxis
                    dataKey="label"
                    stroke="hsl(var(--border))"
                    tick={{ fill: "#ffffff", fontSize: 12, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={{ stroke: "hsl(var(--border))", strokeOpacity: 0.5 }}
                    dy={10}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="hsl(var(--border))"
                    tick={{ fill: "#ffffff", fontSize: 12, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtCompact}
                    width={55}
                    domain={[0, "dataMax"]}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="hsl(var(--border))"
                    tick={{ fill: "#ffffff", fontSize: 12, fontWeight: 600 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={fmtCompact}
                    width={55}
                    domain={["dataMin", "dataMax"]}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload || payload.length === 0) return null;
                      return (
                        <div className="rounded-lg border border-brand/20 bg-card/95 p-3 shadow-xl backdrop-blur-sm">
                          <div className="mb-2 text-xs font-semibold text-foreground">{label}</div>
                          <div className="space-y-1">
                            {payload.map((p, i) => (
                              <div key={i} className="flex items-center justify-between gap-4 text-xs">
                                <span className="flex items-center gap-1.5 text-muted-foreground">
                                  <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                                  {p.name}
                                </span>
                                <span className="font-mono font-medium text-foreground">{fmt(Number(p.value))}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }}
                  />
                  {isBarLike && (
                      <Bar
                        key="bar-deposit"
                        yAxisId="left"
                        dataKey="deposit"
                        name="Einzahlungen"
                        stackId={chartType === "stacked" ? "volume" : undefined}
                        fill="url(#depositGrad)"
                        radius={chartType === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                        barSize={chartType === "stacked" ? 28 : 14}
                      />
                  )}
                  {isBarLike && (
                      <Bar
                        key="bar-expense"
                        yAxisId="left"
                        dataKey="expense"
                        name="Ausgaben"
                        stackId={chartType === "stacked" ? "volume" : undefined}
                        fill="url(#expenseGrad)"
                        radius={chartType === "stacked" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                        barSize={chartType === "stacked" ? 28 : 14}
                      />
                  )}
                  {isBarLike && (
                      <Bar
                        key="bar-withdraw"
                        yAxisId="left"
                        dataKey="withdraw"
                        name="Auszahlungen"
                        stackId={chartType === "stacked" ? "volume" : undefined}
                        fill="url(#withdrawGrad)"
                        radius={chartType === "stacked" ? [4, 4, 0, 0] : [4, 4, 0, 0]}
                        barSize={chartType === "stacked" ? 28 : 14}
                      />
                  )}
                  {chartType === "line" && (
                    <Line key="line-deposit" yAxisId="left" type="monotone" dataKey="deposit" name="Einzahlungen" stroke="var(--chart-4)" strokeWidth={3} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-4)" }} activeDot={{ r: 5 }} />
                  )}
                  {chartType === "line" && (
                    <Line key="line-expense" yAxisId="left" type="monotone" dataKey="expense" name="Ausgaben" stroke="var(--chart-1)" strokeWidth={3} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-1)" }} activeDot={{ r: 5 }} />
                  )}
                  {chartType === "line" && (
                    <Line key="line-withdraw" yAxisId="left" type="monotone" dataKey="withdraw" name="Auszahlungen" stroke="var(--chart-5)" strokeWidth={3} dot={{ r: 3, strokeWidth: 0, fill: "var(--chart-5)" }} activeDot={{ r: 5 }} />
                  )}
                  {isAreaLike && (
                    <Area key="area-deposit" yAxisId="left" type="monotone" dataKey="deposit" name="Einzahlungen" stroke="var(--chart-4)" strokeWidth={3} fill="url(#depositArea)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                  )}
                  {isAreaLike && (
                    <Area key="area-expense" yAxisId="left" type="monotone" dataKey="expense" name="Ausgaben" stroke="var(--chart-1)" strokeWidth={3} fill="url(#expenseArea)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                  )}
                  {isAreaLike && (
                    <Area key="area-withdraw" yAxisId="left" type="monotone" dataKey="withdraw" name="Auszahlungen" stroke="var(--chart-5)" strokeWidth={3} fill="url(#withdrawArea)" dot={false} activeDot={{ r: 5, strokeWidth: 0 }} />
                  )}
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="net"
                    name="Netto"
                    stroke="var(--chart-2)"
                    strokeWidth={3}
                    fill="url(#netArea)"
                    dot={{ r: 4, strokeWidth: 2, stroke: "var(--background)", fill: "var(--chart-2)" }}
                    activeDot={{ r: 6, strokeWidth: 0 }}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="net"
                    name="Netto"
                    stroke="var(--chart-2)"
                    strokeWidth={3}
                    dot={false}
                    activeDot={false}
                    legendType="none"
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>


      <Card className="border-brand/10">
        <CardHeader>
          <CardTitle className="text-sm">Kategorien (Einnahmen)</CardTitle>
        </CardHeader>
        <CardContent>
          {catData.filter((c) => c.deposit > 0).length === 0 ? (
            <EmptyState text="Keine Kategorien vergeben." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData.filter((c) => c.deposit > 0)}
                    dataKey="deposit"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {catData.filter((c) => c.deposit > 0).map((c, i) => (
                      <Cell
                        key={c.category}
                        fill={categoryColors[c.category] ?? PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#ffffff" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-brand/10">
        <CardHeader>
          <CardTitle className="text-sm">Kategorien (Ausgaben)</CardTitle>
        </CardHeader>
        <CardContent>
          {catData.filter((c) => c.expense > 0).length === 0 ? (
            <EmptyState text="Keine Ausgaben-Kategorien vergeben." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={catData.filter((c) => c.expense > 0)}
                    dataKey="expense"
                    nameKey="category"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {catData.filter((c) => c.expense > 0).map((c, i) => (
                      <Cell
                        key={c.category}
                        fill={categoryColors[c.category] ?? PIE_COLORS[(i + 3) % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmt(v)}
                    contentStyle={{
                      background: "hsl(var(--background))",
                      border: "1px solid hsl(var(--border))",
                      fontSize: 12,
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: "#ffffff" }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="min-w-0 lg:col-span-2">
        <EntriesTab
          entries={entries}
          categories={categoryNames}
          members={[]}
          canBook={false}
          canSeePlayers={false}
          onDelete={() => {}}
        />
      </div>
    </div>
  );
}

/* ---------------- Entries ---------------- */

type EntryFilter = {
  range: "7" | "30" | "month" | "quarter" | "year" | "all";
  kind: "all" | keyof typeof KIND_META;
  player: string;
  category: string;
  q: string;
};

function rangeStart(range: EntryFilter["range"]): Date | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "7") return new Date(now.getTime() - 7 * 86400_000);
  if (range === "30") return new Date(now.getTime() - 30 * 86400_000);
  if (range === "month")
    return new Date(now.getFullYear(), now.getMonth(), 1);
  if (range === "quarter") {
    const qStart = Math.floor(now.getMonth() / 3) * 3;
    return new Date(now.getFullYear(), qStart, 1);
  }
  if (range === "year") return new Date(now.getFullYear(), 0, 1);
  return null;
}

function EntriesTab({
  entries,
  categories,
  members,
  canBook,
  canSeePlayers,
  onDelete,
  onEdit,
}: {
  entries: TreasuryEntry[];
  categories: string[];
  members: Array<{ user_id: string; callsign: string | null }>;
  canBook: boolean;
  canSeePlayers: boolean;
  onDelete: (id: string) => void;
  onEdit?: (entry: TreasuryEntry) => void;
}) {
  const [f, setF] = useState<EntryFilter>({
    range: "all",
    kind: "all",
    player: "all",
    category: "all",
    q: "",
  });

  const filtered = useMemo(() => {
    const start = rangeStart(f.range);
    const qLower = f.q.trim().toLowerCase();
    return entries.filter((e) => {
      if (start && new Date(e.booked_at) < start) return false;
      if (f.kind !== "all" && e.kind !== f.kind) return false;
      if (f.player !== "all" && e.player_id !== f.player) return false;
      if (f.category !== "all" && e.category !== f.category) return false;
      if (qLower) {
        const hay = `${e.description ?? ""} ${e.category ?? ""} ${e.player_callsign ?? ""} ${e.booked_by_callsign ?? ""}`.toLowerCase();
        if (!hay.includes(qLower)) return false;
      }
      return true;
    });
  }, [entries, f]);

  const exportCsv = () => {
    const rows: (string | number | null)[][] = canSeePlayers
      ? [
          ["Datum", "Art", "Betrag", "Spieler", "Kategorie", "Notiz", "Gebucht von"],
          ...filtered.map((e) => [
            new Date(e.booked_at).toISOString(),
            KIND_META[e.kind].label,
            e.amount_auec,
            e.player_callsign ?? "",
            e.category ?? "",
            e.description ?? "",
            e.booked_by_callsign ?? "",
          ]),
        ]
      : [
          ["Datum", "Art", "Kategorie", "Betrag", "Notiz"],
          ...filtered.map((e) => [
            new Date(e.booked_at).toISOString(),
            KIND_META[e.kind].label,
            e.category ?? "",
            e.amount_auec,
            e.description ?? "",
          ]),
        ];
    downloadCsv(`kasse-buchungen-${Date.now()}.csv`, rows);
  };

  return (
    <Card className="border-brand/10">
      <CardHeader className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">
            Buchungen · {filtered.length} / {entries.length}
          </CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="mr-1 h-3 w-3" /> CSV
          </Button>
        </div>
        <div className={`grid gap-2 ${canSeePlayers ? "md:grid-cols-5" : "md:grid-cols-4"}`}>
          <Select
            value={f.range}
            onValueChange={(v) => setF({ ...f, range: v as EntryFilter["range"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Letzte 7 Tage</SelectItem>
              <SelectItem value="30">Letzte 30 Tage</SelectItem>
              <SelectItem value="month">Aktueller Monat</SelectItem>
              <SelectItem value="quarter">Aktuelles Quartal</SelectItem>
              <SelectItem value="year">Aktuelles Jahr</SelectItem>
              <SelectItem value="all">Alle</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={f.kind}
            onValueChange={(v) => setF({ ...f, kind: v as EntryFilter["kind"] })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Arten</SelectItem>
              {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map((k) => (
                <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {canSeePlayers && (
          <Select value={f.player} onValueChange={(v) => setF({ ...f, player: v })}>
            <SelectTrigger><SelectValue placeholder="Spieler" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Spieler</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.callsign ?? m.user_id.slice(0, 8)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          )}
          <Select value={f.category} onValueChange={(v) => setF({ ...f, category: v })}>
            <SelectTrigger><SelectValue placeholder="Kategorie" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle Kategorien</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={f.q}
              onChange={(e) => setF({ ...f, q: e.target.value })}
              placeholder="Suchen…"
              className="pl-7"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        {filtered.length === 0 && (
          <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
            Keine Buchungen für den Filter.
          </div>
        )}
        {filtered.map((e) => {
          const meta = KIND_META[e.kind];
          const Icon = meta.icon;
          if (!canSeePlayers) {
            return (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 border border-brand/10 bg-background/40 px-3 py-2"
              >
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center justify-center min-w-[3.5rem]">
                    <span className="text-[10px] font-medium text-foreground">
                      {new Date(e.booked_at).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" })}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {new Date(e.booked_at).toLocaleDateString("de-DE", { year: "2-digit" })}
                    </span>
                  </div>
                  <Icon className={`h-4 w-4 ${meta.color}`} />
                  <div className="text-sm">
                    <span className={meta.color}>{meta.label}</span>
                    {e.category && (
                      <span className="ml-2 text-xs text-muted-foreground">[{e.category}]</span>
                    )}
                  </div>
                </div>
                <span className={`font-mono text-sm ${meta.color}`}>
                  {fmt(Math.abs(e.amount_auec))}
                </span>
              </div>
            );
          }
          return (
            <div
              key={e.id}
              className="flex items-center gap-3 border border-brand/10 bg-background/40 px-3 py-2"
            >
              <Icon className={`h-4 w-4 ${meta.color}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm">
                  <span className={meta.color}>{meta.label}</span>
                  {e.player_callsign && (
                    <> · <span className="font-medium">{e.player_callsign}</span></>
                  )}
                  {e.category && (
                    <span className="ml-2 text-xs text-muted-foreground">[{e.category}]</span>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {new Date(e.booked_at).toLocaleString("de-DE")}
                  {canSeePlayers && <> · gebucht von {e.booked_by_callsign ?? "—"}</>}
                  {e.description && <> · {e.description}</>}
                </div>
              </div>
              <span className={`font-mono text-sm ${meta.color}`}>
                {fmt(Math.abs(e.amount_auec))}
              </span>
              {canBook && (
                <>
                  {onEdit && (
                    <Button size="sm" variant="ghost" onClick={() => onEdit(e)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  )}
                <Button size="sm" variant="ghost" onClick={() => onDelete(e.id)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
                </>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* ---------------- Members ---------------- */

type MemberRange = "7" | "30" | "month" | "quarter" | "year" | "all";
type MemberSort = "deposited" | "withdrawn" | "net" | "count" | "last";

type MemberRow = TreasurySummary["perPlayer"][number] & {
  lastAtDate?: Date;
};

function rangeStartDate(range: MemberRange): Date {
  const now = new Date();
  switch (range) {
    case "7": return new Date(now.getTime() - 7 * 86400_000);
    case "30": return new Date(now.getTime() - 30 * 86400_000);
    case "month": return new Date(now.getFullYear(), now.getMonth(), 1);
    case "quarter": {
      const q = Math.floor(now.getMonth() / 3) * 3;
      return new Date(now.getFullYear(), q, 1);
    }
    case "year": return new Date(now.getFullYear(), 0, 1);
    case "all": return new Date(0);
  }
}

function rangeLabel(range: MemberRange) {
  return {
    "7": "Letzte 7 Tage",
    "30": "Letzte 30 Tage",
    "month": "Aktueller Monat",
    "quarter": "Aktuelles Quartal",
    "year": "Aktuelles Jahr",
    "all": "Gesamter Zeitraum",
  }[range];
}

function computePerPlayer(rows: TreasuryEntry[], start: Date) {
  const map = new Map<
    string,
    { deposited: number; withdrawn: number; count: number; last_at: string | null; callsign: string | null }
  >();
  for (const e of rows) {
    const d = new Date(e.booked_at);
    if (d < start) continue;
    if (!e.player_id || (e.kind !== "deposit" && e.kind !== "withdraw")) continue;
    const prev = map.get(e.player_id) ?? {
      deposited: 0,
      withdrawn: 0,
      count: 0,
      last_at: null,
      callsign: e.player_callsign,
    };
    if (e.kind === "deposit") prev.deposited += Math.abs(e.amount_auec);
    if (e.kind === "withdraw") prev.withdrawn += Math.abs(e.amount_auec);
    prev.count += 1;
    if (!prev.last_at || e.booked_at > prev.last_at) prev.last_at = e.booked_at;
    prev.callsign = e.player_callsign ?? prev.callsign;
    map.set(e.player_id, prev);
  }
  return Array.from(map.entries())
    .map(([user_id, v]) => ({
      user_id,
      callsign: v.callsign,
      deposited: v.deposited,
      withdrawn: v.withdrawn,
      net: v.deposited - v.withdrawn,
      count: v.count,
      last_at: v.last_at,
    }))
    .sort((a, b) => b.deposited - a.deposited || b.net - a.net);
}

function MembersTab({
  summary,
  entries,
}: {
  summary?: TreasurySummary;
  entries: TreasuryEntry[];
}) {
  const [range, setRange] = useState<MemberRange>("all");
  const [sort, setSort] = useState<MemberSort>("deposited");
  if (!summary) return <EmptyState text="Lade Auswertung…" />;

  const rows = useMemo(() => {
    if (range === "all") return summary.perPlayer;
    return computePerPlayer(entries, rangeStartDate(range));
  }, [entries, summary, range]);

  const sorted = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      if (sort === "last") return (b.last_at ?? "").localeCompare(a.last_at ?? "");
      return (b[sort] as number) - (a[sort] as number);
    });
    return next;
  }, [rows, sort]);

  const maxDeposited = Math.max(1, ...rows.map((r) => r.deposited));

  const exportCsv = () => {
    downloadCsv(
      `kasse-mitglieder-${range}-${Date.now()}.csv`,
      [
        ["Callsign", "Eingezahlt", "Ausgezahlt", "Netto", "Buchungen", "Letzte Buchung"],
        ...sorted.map((r) => [
          r.callsign ?? r.user_id,
          r.deposited,
          r.withdrawn,
          r.net,
          r.count,
          r.last_at ?? "",
        ]),
      ],
    );
  };

  return (
    <div className="space-y-4">
      <Card className="border-brand/10">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm font-semibold tracking-wide">Spieler-Auswertung</CardTitle>
            <p className="text-xs text-muted-foreground">Eingezahlt, ausgezahlt und letzte Aktivität</p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={range} onValueChange={(v) => setRange(v as MemberRange)}>
              <SelectTrigger className="h-8 w-40 text-xs bg-card/50 border-brand/10">
                <Clock className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Letzte 7 Tage</SelectItem>
                <SelectItem value="30">Letzte 30 Tage</SelectItem>
                <SelectItem value="month">Aktueller Monat</SelectItem>
                <SelectItem value="quarter">Aktuelles Quartal</SelectItem>
                <SelectItem value="year">Aktuelles Jahr</SelectItem>
                <SelectItem value="all">Gesamter Zeitraum</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" variant="outline" onClick={exportCsv}>
              <Download className="mr-1 h-3 w-3" /> CSV
            </Button>
          </div>
        </CardHeader>
      </Card>

      {sorted.length === 0 ? (
        <EmptyState text="Keine Buchungen im gewählten Zeitraum." />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {sorted.slice(0, 3).map((r, i) => (
            <Card
              key={r.user_id}
              className={`relative overflow-hidden border-brand/10 bg-gradient-to-br ${
                i === 0
                  ? "from-amber-500/10 to-card"
                  : i === 1
                  ? "from-slate-300/10 to-card"
                  : "from-amber-700/10 to-card"
              }`}
            >
              <div className="absolute right-3 top-3 text-2xl font-display opacity-20">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
              </div>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {i + 1}. Platz · {rangeLabel(range)}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="font-display text-lg">{r.callsign ?? r.user_id.slice(0, 8)}</div>
                <div className="flex items-end justify-between">
                  <div className="space-y-0.5">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Eingezahlt</div>
                    <div className="font-mono text-xl text-emerald-300">{fmt(r.deposited)}</div>
                  </div>
                  {r.last_at && (
                    <div className="text-right text-[10px] text-muted-foreground">
                      zuletzt<br />{new Date(r.last_at).toLocaleDateString("de-DE")}
                    </div>
                  )}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-black/30">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-300"
                    style={{ width: `${Math.max(5, (r.deposited / maxDeposited) * 100)}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{r.count} Buchungen</span>
                  <span className={r.net >= 0 ? "text-emerald-300" : "text-rose-300"}>Netto {fmt(r.net)}</span>
                </div>
              </CardContent>
            </Card>
          ))}

          <Card className="lg:col-span-3 border-brand/10">
            <CardHeader>
              <CardTitle className="text-sm">Rangliste</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-12">#</TableHead>
                    <TableHead>Spieler</TableHead>
                    <SortHead label="Eingezahlt" k="deposited" sort={sort} setSort={setSort} align="right" />
                    <SortHead label="Ausgezahlt" k="withdrawn" sort={sort} setSort={setSort} align="right" />
                    <SortHead label="Netto" k="net" sort={sort} setSort={setSort} align="right" />
                    <SortHead label="Buchungen" k="count" sort={sort} setSort={setSort} align="right" />
                    <SortHead label="Letzte" k="last" sort={sort} setSort={setSort} align="right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map((r, i) => {
                    const rank = i + 1;
                    const share = (r.deposited / maxDeposited) * 100;
                    return (
                      <TableRow key={r.user_id} className="group">
                        <TableCell className="py-2">
                          <span
                            className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold ${
                              rank === 1
                                ? "bg-amber-500/20 text-amber-300"
                                : rank === 2
                                ? "bg-slate-300/15 text-slate-300"
                                : rank === 3
                                ? "bg-amber-700/20 text-amber-400"
                                : "bg-brand/10 text-muted-foreground"
                            }`}
                          >
                            {rank}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <div className="font-medium">{r.callsign ?? r.user_id.slice(0, 8)}</div>
                          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-black/30 sm:hidden">
                            <div
                              className="h-full rounded-full bg-emerald-500/70"
                              style={{ width: `${Math.max(5, share)}%` }}
                            />
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono text-emerald-300">{fmt(r.deposited)}</TableCell>
                        <TableCell className="py-2 text-right font-mono text-rose-300">{fmt(r.withdrawn)}</TableCell>
                        <TableCell className={`py-2 text-right font-mono ${r.net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                          {fmt(r.net)}
                        </TableCell>
                        <TableCell className="py-2 text-right font-mono">{r.count}</TableCell>
                        <TableCell className="py-2 text-right font-mono text-xs text-muted-foreground">
                          {r.last_at ? new Date(r.last_at).toLocaleDateString("de-DE") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

function SortHead({
  label,
  k,
  sort,
  setSort,
  align,
}: {
  label: string;
  k: MemberSort;
  sort: MemberSort;
  setSort: (s: MemberSort) => void;
  align?: "right";
}) {
  return (
    <TableHead className={align === "right" ? "text-right" : ""}>
      <button
        onClick={() => setSort(k)}
        className={`hover:text-brand ${sort === k ? "text-brand" : ""}`}
      >
        {label} {sort === k && "↓"}
      </button>
    </TableHead>
  );
}

/* ---------------- Categories ---------------- */

function CategoriesTab({
  summary,
  categoryColors,
}: {
  summary?: TreasurySummary;
  categoryColors: Record<string, string>;
}) {
  if (!summary) return <EmptyState text="Lade Auswertung…" />;
  const cats = summary.perCategory;
  if (cats.length === 0)
    return <EmptyState text="Noch keine Kategorien vergeben." />;

  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-2">
      <Card className="border-brand/10">
        <CardHeader>
          <CardTitle className="text-sm">Einnahmen vs. Ausgaben pro Kategorie</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cats}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="category" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={fmtCompact} />
                <Tooltip
                  formatter={(v: number) => fmt(v)}
                  contentStyle={{
                    background: "hsl(var(--background))",
                    border: "1px solid hsl(var(--border))",
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="deposit" name="Einnahmen" fill="#34d399" />
                <Bar dataKey="expense" name="Ausgaben" fill="#f87171" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card className="border-brand/10">
        <CardHeader>
          <CardTitle className="text-sm">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Kategorie</TableHead>
                <TableHead className="text-right">Einnahmen</TableHead>
                <TableHead className="text-right">Ausgaben</TableHead>
                <TableHead className="text-right">Netto</TableHead>
                <TableHead className="text-right">Anzahl</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cats.map((c) => {
                const net = c.deposit - c.expense;
                return (
                  <TableRow key={c.category}>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-white/20"
                          style={{
                            backgroundColor: categoryColors[c.category] ?? "#64748b",
                          }}
                        />
                        {c.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono text-emerald-300">{fmt(c.deposit)}</TableCell>
                    <TableCell className="text-right font-mono text-rose-300">{fmt(c.expense)}</TableCell>
                    <TableCell className={`text-right font-mono ${net >= 0 ? "text-emerald-300" : "text-rose-300"}`}>
                      {fmt(net)}
                    </TableCell>
                    <TableCell className="text-right font-mono">{c.count}</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

/* ---------------- Booking Dialog ---------------- */

function BookingDialog({
  open,
  setOpen,
  kind,
  setKind,
  amount,
  setAmount,
  playerId,
  setPlayerId,
  desc,
  setDesc,
  category,
  setCategory,
  needsPlayer,
  members,
  categories,
  onSave,
  saving,
}: {
  open: boolean;
  setOpen: (b: boolean) => void;
  kind: keyof typeof KIND_META;
  setKind: (k: keyof typeof KIND_META) => void;
  amount: string;
  setAmount: (s: string) => void;
  playerId: string;
  setPlayerId: (s: string) => void;
  desc: string;
  setDesc: (s: string) => void;
  category: string;
  setCategory: (s: string) => void;
  needsPlayer: boolean;
  members: Array<{ user_id: string; callsign: string | null }>;
  categories: TreasuryCategory[];
  onSave: () => void;
  saving: boolean;
}) {
  const usable = categories.filter((c) => {
    if (c.kind === "both") return true;
    if (c.kind === "deposit") return kind === "deposit" || kind === "adjust";
    return kind === "withdraw" || kind === "expense" || kind === "adjust";
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-3 w-3" /> Neue Buchung
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buchung anlegen</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1">
              <Label>Art</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as keyof typeof KIND_META)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_META) as Array<keyof typeof KIND_META>).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_META[k].label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1">
              <Label>Betrag (aUEC)</Label>
              <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
          </div>
          {needsPlayer && (
            <div className="grid gap-1">
              <Label>Spieler</Label>
              <Select value={playerId} onValueChange={setPlayerId}>
                <SelectTrigger><SelectValue placeholder="Mitglied wählen" /></SelectTrigger>
                <SelectContent>
                  {members.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.callsign ?? m.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="grid gap-1">
            <Label>Kategorie (optional)</Label>
            {usable.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Noch keine Kategorien angelegt — unter „Einstellungen" definierbar.
              </p>
            ) : (
              <Select
                value={category || "__none"}
                onValueChange={(v) => setCategory(v === "__none" ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Kategorie wählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Keine Kategorie</SelectItem>
                  {usable.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      <span className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full border border-white/20"
                          style={{ backgroundColor: c.color }}
                        />
                        {c.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
          <div className="grid gap-1">
            <Label>Notiz (optional)</Label>
            <Textarea value={desc} onChange={(e) => setDesc(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Abbrechen</Button>
          <Button
            disabled={
              !amount ||
              Number.isNaN(Number(amount)) ||
              (needsPlayer && !playerId) ||
              saving
            }
            onClick={onSave}
          >
            Speichern
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="border border-dashed border-brand/20 p-10 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

/* ---------------- Requests ---------------- */

const REQ_STATUS_META: Record<
  TreasuryRequest["status"],
  { label: string; className: string }
> = {
  pending: { label: "Offen", className: "border-amber-500/40 text-amber-300" },
  approved: { label: "Angenommen", className: "border-emerald-500/40 text-emerald-300" },
  rejected: { label: "Abgelehnt", className: "border-rose-500/40 text-rose-300" },
  cancelled: { label: "Zurückgezogen", className: "border-muted text-muted-foreground" },
};

function RequestsTab({
  orgId,
  canReviewFallback,
}: {
  orgId: string;
  canReviewFallback: boolean;
}) {
  const listFn = useServerFn(listTreasuryRequests);
  const createFn = useServerFn(createTreasuryRequest);
  const reviewFn = useServerFn(reviewTreasuryRequest);
  const cancelFn = useServerFn(cancelTreasuryRequest);
  const qc = useQueryClient();

  const q = useQuery({
    queryKey: ["org-treasury-requests", orgId],
    queryFn: () => listFn({ data: { org_id: orgId } }),
    enabled: !!orgId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["org-treasury-requests", orgId] });
    qc.invalidateQueries({ queryKey: ["org-treasury", orgId] });
  };

  const createM = useMutation({
    mutationFn: (v: {
      kind: "deposit" | "withdraw";
      amount_auec: number;
      reason?: string | null;
      category?: string | null;
    }) => createFn({ data: { org_id: orgId, ...v } }),
    onSuccess: () => {
      toast.success("Anfrage gesendet");
      setAmount("");
      setReason("");
      setCategory("");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const reviewM = useMutation({
    mutationFn: (v: { id: string; action: "approve" | "reject"; note?: string | null }) =>
      reviewFn({ data: v }),
    onSuccess: (_r, v) => {
      toast.success(v.action === "approve" ? "Anfrage angenommen und gebucht" : "Anfrage abgelehnt");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const cancelM = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Anfrage zurückgezogen");
      invalidate();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [kind, setKind] = useState<"deposit" | "withdraw">("deposit");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [category, setCategory] = useState("");

  const canReview = q.data?.canReview ?? canReviewFallback;
  const requests = q.data?.requests ?? [];
  const pending = requests.filter((r) => r.status === "pending");
  const history = requests.filter((r) => r.status !== "pending").slice(0, 50);
  const reasonRequired = kind === "withdraw";
  const amountNum = Number(amount);
  const canSubmit =
    !!amount &&
    !Number.isNaN(amountNum) &&
    amountNum > 0 &&
    (!reasonRequired || reason.trim().length > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
      <Card className="border-brand/10">
        <CardHeader>
          <CardTitle className="text-sm">Neue Anfrage</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Tabs value={kind} onValueChange={(v) => setKind(v as "deposit" | "withdraw")}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="deposit">
                <ArrowDown className="mr-1 h-3 w-3" /> Einzahlung
              </TabsTrigger>
              <TabsTrigger value="withdraw">
                <ArrowUp className="mr-1 h-3 w-3" /> Auszahlung
              </TabsTrigger>
            </TabsList>
          </Tabs>
          <div className="grid gap-1">
            <Label>Betrag (aUEC)</Label>
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label>Kategorie (optional)</Label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div className="grid gap-1">
            <Label>
              Begründung{reasonRequired ? "" : " (optional)"}
            </Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                kind === "deposit"
                  ? "z. B. Beute vom Salvage-Run"
                  : "z. B. Kauf einer FR-66 für den Einsatz"
              }
              rows={3}
            />
          </div>
          <div className="text-[10px] text-muted-foreground">
            {kind === "deposit"
              ? "Deine Einzahlung wird erst gebucht, wenn ein Berechtigter sie bestätigt."
              : "Deine Auszahlung wird nach Freigabe aus der Kasse gebucht."}
          </div>
          <Button
            className="w-full"
            disabled={!canSubmit || createM.isPending}
            onClick={() =>
              createM.mutate({
                kind,
                amount_auec: amountNum,
                reason: reason.trim() || null,
                category: category.trim() || null,
              })
            }
          >
            <Send className="mr-1 h-3 w-3" /> Anfrage senden
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card className="border-brand/10">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-amber-300" />
              Offene Anfragen · {pending.length}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {pending.length === 0 && (
              <EmptyState text="Keine offenen Anfragen." />
            )}
            {pending.map((r) => (
              <RequestRow
                key={r.id}
                r={r}
                canReview={canReview}
                onApprove={() => reviewM.mutate({ id: r.id, action: "approve" })}
                onReject={() => {
                  const note = window.prompt("Grund der Ablehnung (optional)") ?? "";
                  reviewM.mutate({ id: r.id, action: "reject", note: note || null });
                }}
                onCancel={() => cancelM.mutate(r.id)}
                busy={reviewM.isPending || cancelM.isPending}
              />
            ))}
          </CardContent>
        </Card>

        {history.length > 0 && (
          <Card className="border-brand/10">
            <CardHeader>
              <CardTitle className="text-sm">Verlauf</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.map((r) => (
                <RequestRow key={r.id} r={r} canReview={false} historical />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function RequestRow({
  r,
  canReview,
  onApprove,
  onReject,
  onCancel,
  busy,
  historical,
}: {
  r: TreasuryRequest;
  canReview: boolean;
  onApprove?: () => void;
  onReject?: () => void;
  onCancel?: () => void;
  busy?: boolean;
  historical?: boolean;
}) {
  const meta = KIND_META[r.kind];
  const Icon = meta.icon;
  const status = REQ_STATUS_META[r.status];
  return (
    <div className="flex flex-wrap items-start gap-3 border border-brand/10 bg-background/40 px-3 py-2">
      <Icon className={`mt-0.5 h-4 w-4 ${meta.color}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className={meta.color}>{meta.label}</span>
          <span className="font-medium">{r.player_callsign ?? r.player_id.slice(0, 8)}</span>
          <span className={`border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${status.className}`}>
            {status.label}
          </span>
          {r.category && (
            <span className="text-xs text-muted-foreground">[{r.category}]</span>
          )}
        </div>
        {r.reason && (
          <div className="mt-1 text-xs text-muted-foreground">{r.reason}</div>
        )}
        <div className="mt-1 text-[10px] text-muted-foreground">
          {new Date(r.created_at).toLocaleString("de-DE")}
          {r.reviewed_at && (
            <>
              {" · "}
              geprüft {new Date(r.reviewed_at).toLocaleString("de-DE")}
              {r.reviewed_by_callsign ? ` von ${r.reviewed_by_callsign}` : ""}
            </>
          )}
          {r.review_note && <> · „{r.review_note}"</>}
        </div>
      </div>
      <span className={`font-mono text-sm ${meta.color}`}>
        {fmt(r.amount_auec)}
      </span>
      {!historical && r.status === "pending" && (
        <div className="flex items-center gap-1">
          {canReview && onApprove && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onApprove} title="Annehmen & buchen">
              <Check className="h-3 w-3 text-emerald-300" />
            </Button>
          )}
          {canReview && onReject && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onReject} title="Ablehnen">
              <XIcon className="h-3 w-3 text-rose-300" />
            </Button>
          )}
          {onCancel && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={onCancel} title="Zurückziehen">
              <Trash2 className="h-3 w-3" />
            </Button>
          )}
        </div>
      )}
    </div>
  );
}