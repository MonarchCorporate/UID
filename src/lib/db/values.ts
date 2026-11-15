// Conversions between JS values (as supabase-js/PostgREST delivers them)
// and the MariaDB storage representation.
import type { ColumnMeta } from "./types";

const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** Any date-ish input -> 'YYYY-MM-DD HH:MM:SS.ffffff' in UTC. */
export function toDbTimestamp(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "string") {
    // keep microseconds if present
    const m = v.match(
      /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,6}))?)?(Z|[+-]\d{2}(?::?\d{2})?)?$/,
    );
    if (m && (!m[8] || m[8] === "Z" || /^\+00:?(00)?$/.test(m[8]))) {
      const frac = (m[7] ?? "").padEnd(6, "0");
      return `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6] ?? "00"}.${frac}`;
    }
  }
  const d = v instanceof Date ? v : new Date(v as string | number);
  if (Number.isNaN(d.getTime())) throw new Error(`invalid input syntax for type timestamp: "${String(v)}"`);
  return (
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ` +
    `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}000`
  );
}

/** 'YYYY-MM-DD HH:MM:SS.ffffff' (UTC) -> PostgREST style '...T...+00:00'. */
export function fromDbTimestamp(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v);
  const [date, time = "00:00:00"] = s.split(" ");
  let [hms, frac] = time.split(".");
  frac = (frac ?? "").replace(/0+$/, "");
  return `${date}T${hms}${frac ? "." + frac : ""}+00:00`;
}

export function toDb(col: ColumnMeta | undefined, v: unknown): unknown {
  if (v === undefined) return null;
  if (v === null) return null;
  if (!col) return v;
  switch (col.kind) {
    case "bool":
      if (typeof v === "string") return v === "true" || v === "t" || v === "1" ? 1 : 0;
      return v ? 1 : 0;
    case "json":
    case "array":
      return JSON.stringify(v);
    case "ts":
      return toDbTimestamp(v);
    case "int":
    case "bigint":
    case "num":
      if (typeof v === "boolean") return v ? 1 : 0;
      return v;
    default:
      if (typeof v === "object") return JSON.stringify(v);
      return v;
  }
}

/** Value used inside a filter (eq/in/...) — scalars only. */
export function toDbFilter(col: ColumnMeta | undefined, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (!col) return v;
  if (col.kind === "bool") {
    if (v === true || v === "true" || v === "t" || v === 1 || v === "1") return 1;
    return 0;
  }
  if (col.kind === "ts") return toDbTimestamp(v);
  if (col.kind === "json" || col.kind === "array") return typeof v === "string" ? v : JSON.stringify(v);
  return v;
}

export function fromDb(col: ColumnMeta | undefined, v: unknown): unknown {
  if (v === null || v === undefined) return null;
  if (!col) return v;
  switch (col.kind) {
    case "bool":
      return v === 1 || v === "1" || v === true;
    case "json":
    case "array":
      if (typeof v !== "string") return v;
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    case "ts":
      return fromDbTimestamp(v);
    case "int":
    case "bigint":
    case "num":
      return typeof v === "string" ? Number(v) : v;
    default:
      return Buffer.isBuffer(v) ? v.toString("utf8") : v;
  }
}
