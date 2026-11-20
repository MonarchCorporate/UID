// In-process job scheduler (replaces the pg_cron jobs of the old database).
// Each job calls one of the /api/public/hooks/* endpoints with the hook secret.
// A row in `app_jobs` makes sure a time slot runs only once, even if several
// app instances are running.
import type { ResultSetHeader } from "mysql2/promise";
import { getPool } from "@/lib/db/pool.server";
import { toDbTimestamp } from "@/lib/db/values";

type Job = { name: string; path: string; minute: number; hour: number | "*"; body?: unknown };

// Times are UTC, same as the former pg_cron schedules.
const JOBS: Job[] = [
  { name: "sync-ship-catalog-daily", path: "sync-ship-catalog", minute: 0, hour: 2 },
  { name: "sync-ship-components-daily", path: "sync-ship-components", minute: 30, hour: 2 },
  { name: "sync-idcp-fleet-daily", path: "sync-fleet", minute: 0, hour: 3 },
  { name: "sync-user-fleetyards-daily", path: "sync-user-fleetyards", minute: 30, hour: 3 },
  { name: "sync-wiki-items-daily", path: "sync-wiki-items", minute: 0, hour: 4 },
  { name: "sync-wiki-blueprints-daily", path: "sync-wiki-blueprints", minute: 0, hour: 4 },
  { name: "sync-sccrafter-daily", path: "sync-sccrafter", minute: 30, hour: 4 },
  // Liefen bei Lovable nie automatisch – jetzt täglich nach den Katalog-Syncs
  { name: "sync-ship-prices-daily", path: "sync-ship-prices", minute: 0, hour: 5 },
  { name: "sync-stock-loadouts-wiki-daily", path: "sync-stock-loadouts-wiki", minute: 15, hour: 5 },
  { name: "giveaways-tick", path: "giveaways-tick", minute: 5, hour: "*", body: { source: "cron" } },
  { name: "treasury-monthly-tick", path: "treasury-monthly", minute: 5, hour: "*" },
];

/** Start of the most recent slot (UTC) at or before `now` for this job. */
function lastSlot(job: Job, now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), job.minute));
  if (job.hour === "*") {
    if (d > now) d.setUTCHours(d.getUTCHours() - 1);
  } else {
    d.setUTCHours(job.hour);
    if (d > now) d.setUTCDate(d.getUTCDate() - 1);
  }
  return d;
}

function baseUrl(): string {
  const port = process.env.PORT;
  if (port) return `http://127.0.0.1:${port}`;
  return (process.env.PUBLIC_SITE_URL || "https://uid.sc").replace(/\/+$/, "");
}

async function runJob(job: Job) {
  const secret = process.env.HOOK_SECRET;
  if (!secret) return "skipped: HOOK_SECRET not set";
  const res = await fetch(`${baseUrl()}/api/public/hooks/${job.path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify(job.body ?? {}),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  return `HTTP ${res.status}`;
}

async function tick() {
  const now = new Date();
  for (const job of JOBS) {
    const slot = lastSlot(job, now);
    // only fire within 10 minutes after the slot (no catch-up storms after downtime)
    if (now.getTime() - slot.getTime() > 10 * 60 * 1000) continue;
    try {
      await getPool().query("INSERT IGNORE INTO app_jobs (name) VALUES (?)", [job.name]);
      const [claim] = await getPool().query<ResultSetHeader>(
        "UPDATE app_jobs SET last_run_at = ?, last_status = 'running' WHERE name = ? AND (last_run_at IS NULL OR last_run_at < ?)",
        [toDbTimestamp(slot), job.name, toDbTimestamp(slot)],
      );
      if (claim.affectedRows !== 1) continue;
      runJob(job)
        .then((status) => getPool().query("UPDATE app_jobs SET last_status = ? WHERE name = ?", [status, job.name]))
        .catch((e) =>
          getPool().query("UPDATE app_jobs SET last_status = ? WHERE name = ?", [`error: ${String(e).slice(0, 200)}`, job.name]),
        );
    } catch (e) {
      console.error(`[scheduler] ${job.name}:`, e);
    }
  }
}

let started = false;
export function startScheduler() {
  if (started || process.env.DISABLE_SCHEDULER === "1") return;
  started = true;
  setTimeout(() => void tick(), 20_000);
  setInterval(() => void tick(), 60_000).unref?.();
}
