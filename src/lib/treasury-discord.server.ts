/**
 * Discord notifications for the org treasury: booking posts and the monthly
 * report (embed + generated chart image).
 */
import { createHmac } from "node:crypto";
import { postEmbed, type DiscordEmbed } from "@/lib/discord.server";

export type TreasuryDiscordSettings = {
  org_id: string;
  channel_id: string | null;
  channel_name: string | null;
  post_deposits: boolean;
  deposits_show_name: boolean;
  post_withdrawals: boolean;
  withdrawals_show_name: boolean;
  post_monthly: boolean;
  monthly_day: number;
  monthly_hour: number;
  last_monthly_posted_at: string | null;
};

export const DEFAULT_TREASURY_DISCORD_SETTINGS: Omit<
  TreasuryDiscordSettings,
  "org_id"
> = {
  channel_id: null,
  channel_name: null,
  post_deposits: false,
  deposits_show_name: true,
  post_withdrawals: false,
  withdrawals_show_name: false,
  post_monthly: false,
  monthly_day: 1,
  monthly_hour: 10,
  last_monthly_posted_at: null,
};

const BRAND_COLOR = 0x3ba9ff;
const GREEN = 0x34d399;
const RED = 0xf87171;

export function fmtAuec(n: number): string {
  return `${new Intl.NumberFormat("de-DE").format(Math.round(n))} aUEC`;
}

export function monthKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-");
  const names = [
    "Jan", "Feb", "Mär", "Apr", "Mai", "Jun",
    "Jul", "Aug", "Sep", "Okt", "Nov", "Dez",
  ];
  return `${names[Number(m) - 1] ?? m} ${y}`;
}

/** Signature that makes the public chart image URL unguessable. */
export function chartToken(orgId: string, month: string): string {
  const secret = process.env["HOOK_SECRET"];
  if (!secret) {
    throw new Error("HOOK_SECRET is not configured on the server.");
  }
  return createHmac("sha256", secret).update(`${orgId}:${month}`).digest("hex").slice(0, 32);
}

export function verifyChartToken(orgId: string, month: string, token: string): boolean {
  let expected: string;
  try {
    expected = chartToken(orgId, month);
  } catch {
    return false;
  }
  if (token.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return diff === 0;
}

export function chartImageUrl(baseUrl: string, orgId: string, month: string): string {
  const u = new URL("/api/public/treasury-chart", baseUrl);
  u.searchParams.set("org", orgId);
  u.searchParams.set("m", month);
  u.searchParams.set("t", chartToken(orgId, month));
  return u.toString();
}

type AdminClient = Awaited<
  typeof import("@/integrations/supabase/client.server")
>["supabaseAdmin"];

export async function loadTreasuryDiscordSettings(
  db: AdminClient,
  orgId: string,
): Promise<TreasuryDiscordSettings> {
  const { data } = await db
    .from("org_treasury_discord_settings")
    .select("*")
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) return { org_id: orgId, ...DEFAULT_TREASURY_DISCORD_SETTINGS };
  return {
    org_id: orgId,
    channel_id: (data.channel_id as string) ?? null,
    channel_name: (data.channel_name as string) ?? null,
    post_deposits: !!data.post_deposits,
    deposits_show_name: !!data.deposits_show_name,
    post_withdrawals: !!data.post_withdrawals,
    withdrawals_show_name: !!data.withdrawals_show_name,
    post_monthly: !!data.post_monthly,
    monthly_day: Number(data.monthly_day ?? 1),
    monthly_hour: Number(data.monthly_hour ?? 10),
    last_monthly_posted_at: (data.last_monthly_posted_at as string) ?? null,
  };
}

/** Confirms the channel is still released for this org. */
async function assertReleasedChannel(
  db: AdminClient,
  orgId: string,
  channelId: string,
): Promise<string> {
  const { data } = await db
    .from("discord_org_channels")
    .select("channel_id, channel_name")
    .eq("org_id", orgId)
    .eq("channel_id", channelId)
    .maybeSingle();
  if (!data) throw new Error("Der gewählte Channel ist für deine Orga nicht (mehr) freigegeben.");
  return (data.channel_name as string) ?? channelId;
}

export type TreasuryStats = {
  balance: number;
  months: { month: string; deposit: number; out: number; net: number }[];
  monthTotals: { deposit: number; withdraw: number; expense: number; net: number };
  prevTotals: { deposit: number; withdraw: number; expense: number; net: number };
  topCategories: { category: string; expense: number; deposit: number }[];
  entryCount: number;
};

function signOf(kind: string, amount: number): number {
  if (kind === "deposit") return Math.abs(amount);
  if (kind === "withdraw" || kind === "expense") return -Math.abs(amount);
  return amount;
}

/** Aggregated, name-free treasury numbers used by the monthly report + chart. */
export async function computeTreasuryStats(
  db: AdminClient,
  orgId: string,
  targetMonth: string,
): Promise<TreasuryStats> {
  const { data: rows } = await db
    .from("org_treasury_entries")
    .select("kind, amount_auec, category, booked_at")
    .eq("org_id", orgId)
    .order("booked_at", { ascending: true })
    .limit(5000);

  const perMonth = new Map<string, { deposit: number; out: number; net: number }>();
  const cats = new Map<string, { expense: number; deposit: number }>();
  const empty = { deposit: 0, withdraw: 0, expense: 0, net: 0 };
  const monthTotals = { ...empty };
  const prevTotals = { ...empty };
  const [ty, tm] = targetMonth.split("-").map(Number);
  const prevMonth = monthKey(new Date(Date.UTC(ty!, (tm ?? 1) - 2, 1)));
  let balance = 0;
  let entryCount = 0;

  for (const r of rows ?? []) {
    const kind = r.kind as string;
    const amount = Number(r.amount_auec ?? 0);
    const signed = signOf(kind, amount);
    balance += signed;
    const key = monthKey(new Date(r.booked_at as string));
    const m = perMonth.get(key) ?? { deposit: 0, out: 0, net: 0 };
    if (kind === "deposit") m.deposit += Math.abs(amount);
    else if (kind === "withdraw" || kind === "expense") m.out += Math.abs(amount);
    m.net += signed;
    perMonth.set(key, m);

    const bucket =
      key === targetMonth ? monthTotals : key === prevMonth ? prevTotals : null;
    if (bucket) {
      if (kind === "deposit") bucket.deposit += Math.abs(amount);
      else if (kind === "withdraw") bucket.withdraw += Math.abs(amount);
      else if (kind === "expense") bucket.expense += Math.abs(amount);
      bucket.net += signed;
      if (key === targetMonth) {
        entryCount += 1;
        const cat = (r.category as string) || "Ohne Kategorie";
        const c = cats.get(cat) ?? { expense: 0, deposit: 0 };
        if (kind === "deposit") c.deposit += Math.abs(amount);
        else if (kind === "withdraw" || kind === "expense") c.expense += Math.abs(amount);
        cats.set(cat, c);
      }
    }
  }

  const months = Array.from(perMonth.entries())
    .map(([month, v]) => ({ month, ...v }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .filter((m) => m.month <= targetMonth)
    .slice(-6);

  return {
    balance,
    months,
    monthTotals,
    prevTotals,
    topCategories: Array.from(cats.entries())
      .map(([category, v]) => ({ category, ...v }))
      .sort((a, b) => b.expense + b.deposit - (a.expense + a.deposit))
      .slice(0, 5),
    entryCount,
  };
}

/** QuickChart config for the monthly chart, rendered by our own image route. */
export function monthlyChartConfig(stats: TreasuryStats) {
  const labels = stats.months.map((m) => monthLabel(m.month));
  return {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Einnahmen",
          backgroundColor: "rgba(52,211,153,0.85)",
          data: stats.months.map((m) => Math.round(m.deposit)),
        },
        {
          label: "Ausgaben",
          backgroundColor: "rgba(248,113,113,0.85)",
          data: stats.months.map((m) => Math.round(m.out)),
        },
        {
          label: "Netto",
          type: "line",
          borderColor: "rgba(59,169,255,1)",
          backgroundColor: "rgba(59,169,255,0.2)",
          borderWidth: 3,
          fill: false,
          data: stats.months.map((m) => Math.round(m.net)),
        },
      ],
    },
    options: {
      plugins: {
        legend: { labels: { fontColor: "#e5e7eb" } },
        datalabels: { display: false },
      },
      scales: {
        xAxes: [{ ticks: { fontColor: "#e5e7eb" }, gridLines: { color: "rgba(255,255,255,0.08)" } }],
        yAxes: [{ ticks: { fontColor: "#e5e7eb" }, gridLines: { color: "rgba(255,255,255,0.08)" } }],
      },
    },
  };
}

export type BookingPostInput = {
  kind: "deposit" | "withdraw" | "expense" | "adjust";
  amount: number;
  playerName?: string | null;
  description?: string | null;
  category?: string | null;
  balance: number;
  sample?: boolean;
};

const KIND_LABEL: Record<BookingPostInput["kind"], string> = {
  deposit: "Neue Einzahlung",
  withdraw: "Neue Auszahlung",
  expense: "Neue Ausgabe",
  adjust: "Korrekturbuchung",
};

export function buildBookingEmbed(
  orgName: string,
  input: BookingPostInput,
  showName: boolean,
): DiscordEmbed {
  const isIn = input.kind === "deposit";
  const fields: DiscordEmbed["fields"] = [
    { name: "Betrag", value: `${isIn ? "+" : "−"}${fmtAuec(Math.abs(input.amount))}`, inline: true },
    { name: "Saldo", value: fmtAuec(input.balance), inline: true },
    {
      name: "Mitglied",
      value: showName ? (input.playerName || "Unbekannt") : "Ein Mitglied",
      inline: true,
    },
  ];
  if (input.category) fields.push({ name: "Kategorie", value: input.category, inline: true });
  if (input.description)
    fields.push({ name: "Notiz", value: input.description.slice(0, 400), inline: false });
  return {
    title: `${isIn ? "💰" : "📤"} ${KIND_LABEL[input.kind]}${input.sample ? " (Musternachricht)" : ""}`,
    description: `Orgakasse **${orgName}**`,
    color: isIn ? GREEN : RED,
    fields,
    footer: { text: input.sample ? "Beispiel — keine echte Buchung" : "Orgakasse" },
    timestamp: new Date().toISOString(),
  };
}

export function buildMonthlyEmbed(
  orgName: string,
  month: string,
  stats: TreasuryStats,
  imageUrl: string | null,
  sample = false,
): DiscordEmbed {
  const out = stats.monthTotals.withdraw + stats.monthTotals.expense;
  const delta = stats.monthTotals.net - stats.prevTotals.net;
  const fields: DiscordEmbed["fields"] = [
    { name: "Einnahmen", value: fmtAuec(stats.monthTotals.deposit), inline: true },
    { name: "Ausgaben & Auszahlungen", value: fmtAuec(out), inline: true },
    {
      name: "Netto",
      value: `${stats.monthTotals.net >= 0 ? "+" : "−"}${fmtAuec(Math.abs(stats.monthTotals.net))}`,
      inline: true,
    },
    { name: "Aktuelles Saldo", value: `**${fmtAuec(stats.balance)}**`, inline: true },
    { name: "Buchungen", value: String(stats.entryCount), inline: true },
    {
      name: "vs. Vormonat",
      value: `${delta >= 0 ? "▲" : "▼"} ${fmtAuec(Math.abs(delta))}`,
      inline: true,
    },
  ];
  if (stats.topCategories.length) {
    fields.push({
      name: "Top-Kategorien",
      value: stats.topCategories
        .map((c) => `• ${c.category}: ${fmtAuec(c.deposit + c.expense)}`)
        .join("\n"),
      inline: false,
    });
  }
  return {
    title: `📊 Kassenbericht ${monthLabel(month)}${sample ? " (Musternachricht)" : ""}`,
    description: `Monatsauswertung der Orgakasse **${orgName}**`,
    color: BRAND_COLOR,
    fields,
    ...(imageUrl ? { image: { url: imageUrl } } : {}),
    footer: { text: sample ? "Beispiel — automatisches Monatsupdate" : "Automatisches Monatsupdate" },
    timestamp: new Date().toISOString(),
  };
}

async function orgName(db: AdminClient, orgId: string): Promise<string> {
  const { data } = await db.from("orgs").select("name").eq("id", orgId).maybeSingle();
  return (data?.name as string) ?? "Orga";
}

/** Posts a booking notification; never throws into the booking flow. */
export async function postTreasuryBooking(
  db: AdminClient,
  orgId: string,
  input: BookingPostInput,
): Promise<void> {
  try {
    const s = await loadTreasuryDiscordSettings(db, orgId);
    if (!s.channel_id) return;
    const isIn = input.kind === "deposit";
    if (isIn && !s.post_deposits) return;
    if (!isIn && !s.post_withdrawals) return;
    await assertReleasedChannel(db, orgId, s.channel_id);
    const showName = isIn ? s.deposits_show_name : s.withdrawals_show_name;
    await postEmbed(s.channel_id, buildBookingEmbed(await orgName(db, orgId), input, showName));
  } catch (e) {
    console.error("[treasury-discord] booking post failed", e);
  }
}

/** Resolves the player name and posts a booking notification. Never throws. */
export async function announceBooking(
  db: AdminClient,
  orgId: string,
  input: {
    kind: BookingPostInput["kind"];
    amount: number;
    playerId?: string | null;
    description?: string | null;
    category?: string | null;
  },
): Promise<void> {
  try {
    const s = await loadTreasuryDiscordSettings(db, orgId);
    if (!s.channel_id) return;
    const isIn = input.kind === "deposit";
    if (isIn ? !s.post_deposits : !s.post_withdrawals) return;
    let playerName: string | null = null;
    if (input.playerId) {
      const { data } = await db
        .from("profiles")
        .select("callsign, rsi_handle")
        .eq("id", input.playerId)
        .maybeSingle();
      playerName =
        ((data?.rsi_handle as string | null) || (data?.callsign as string | null)) ?? null;
    }
    const stats = await computeTreasuryStats(db, orgId, monthKey(new Date()));
    await postTreasuryBooking(db, orgId, {
      kind: input.kind,
      amount: input.amount,
      playerName,
      description: input.description ?? null,
      category: input.category ?? null,
      balance: stats.balance,
    });
  } catch (e) {
    console.error("[treasury-discord] announce failed", e);
  }
}

/** Posts the monthly report for the given month; throws on failure. */
export async function postTreasuryMonthly(
  db: AdminClient,
  orgId: string,
  month: string,
  baseUrl: string | null,
  sample = false,
): Promise<void> {
  const s = await loadTreasuryDiscordSettings(db, orgId);
  if (!s.channel_id) throw new Error("Kein Discord-Channel gewählt.");
  await assertReleasedChannel(db, orgId, s.channel_id);
  const stats = await computeTreasuryStats(db, orgId, month);
  const image = baseUrl ? chartImageUrl(baseUrl, orgId, month) : null;
  await postEmbed(
    s.channel_id,
    buildMonthlyEmbed(await orgName(db, orgId), month, stats, image, sample),
  );
}
