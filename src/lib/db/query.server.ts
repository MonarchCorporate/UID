// A supabase-js compatible query builder on top of MariaDB/MySQL.
//
// It implements the subset of the PostgREST API this app uses — select with
// embedded relations, filters, ordering, ranges, counts, single/maybeSingle,
// insert/upsert/update/delete with returning — and enforces the row-level
// security policies translated from Postgres (policies.gen.ts) for user and
// anonymous clients. The service-role client bypasses RLS, as before.
import { randomBytes, randomUUID } from "node:crypto";
import type { PoolConnection, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { getPool, withTransaction, type Executor } from "./pool.server";
import { POLICIES } from "./policies.gen";
import { TABLES } from "./schema.gen";
import { parseInList, parseLogicTree, parseSelect, type Cond, type SelectItem } from "./postgrest";
import type { ColumnMeta, DbError, DbResult, DbRole, ForeignKey, TableMeta } from "./types";
import { fromDb, toDb, toDbFilter } from "./values";
import { bumpTable } from "./changes.server";

type Row = Record<string, unknown>;
type Cmd = "SELECT" | "INSERT" | "UPDATE" | "DELETE";

export class DbQueryError extends Error {
  constructor(
    public code: string,
    message: string,
    public details: string | null = null,
    public hint: string | null = null,
    public status = 400,
  ) {
    super(message);
  }
}

const q = (id: string) => "`" + id.replace(/`/g, "``") + "`";
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function tableMeta(table: string): TableMeta {
  const m = TABLES[table];
  if (!m) {
    throw new DbQueryError(
      "PGRST205",
      `Could not find the table 'public.${table}' in the schema cache`,
      null,
      null,
      404,
    );
  }
  return m;
}

function colMeta(meta: TableMeta, table: string, col: string): ColumnMeta {
  const c = meta.columns[col];
  if (!c) throw new DbQueryError("42703", `column ${table}.${col} does not exist`);
  return c;
}

// ---------------------------------------------------------------- RLS ---

function uidLiteral(role: DbRole): string {
  if (role.kind !== "user") return "NULL";
  if (!UUID_RE.test(role.userId)) throw new DbQueryError("42501", "invalid user id");
  return `'${role.userId.toLowerCase()}'`;
}

/** SQL boolean expression a row must satisfy for `cmd`, or null (no RLS). */
export function rlsUsing(table: string, cmd: Cmd, role: DbRole): string | null {
  if (role.kind === "service") return null;
  if (!POLICIES[table] && !TABLES[table]?.pk) return "FALSE";
  const roleName = role.kind === "user" ? "authenticated" : "anon";
  const pols = (POLICIES[table] ?? []).filter(
    (p) =>
      (p.cmd === cmd || p.cmd === "ALL") &&
      (p.roles.includes(roleName) || p.roles.includes("public")) &&
      p.using,
  );
  if (!pols.length) return "FALSE";
  const uid = uidLiteral(role);
  return "(" + pols.map((p) => "(" + p.using!.replaceAll("{{uid}}", uid) + ")").join(" OR ") + ")";
}

/** WITH CHECK expression for new rows (INSERT/UPDATE), or null (no RLS). */
function rlsCheck(table: string, cmd: "INSERT" | "UPDATE", role: DbRole): string | null {
  if (role.kind === "service") return null;
  const roleName = role.kind === "user" ? "authenticated" : "anon";
  const pols = (POLICIES[table] ?? []).filter(
    (p) => (p.cmd === cmd || p.cmd === "ALL") && (p.roles.includes(roleName) || p.roles.includes("public")),
  );
  const exprs = pols.map((p) => p.check ?? (cmd === "UPDATE" ? p.using : null)).filter(Boolean) as string[];
  if (!exprs.length) return "FALSE";
  const uid = uidLiteral(role);
  return "(" + exprs.map((e) => "(" + e.replaceAll("{{uid}}", uid) + ")").join(" OR ") + ")";
}

/** Evaluate a WITH CHECK expression against full new-row values. */
async function assertCheck(exec: Executor, table: string, meta: TableMeta, check: string | null, rows: Row[]) {
  if (check === null) return;
  const cols = Object.keys(meta.columns);
  for (const row of rows) {
    const sel = cols.map((c) => `? AS ${q(c)}`).join(", ");
    const params = cols.map((c) => toDb(meta.columns[c], row[c]));
    const [res] = await exec.query<RowDataPacket[]>(
      `SELECT COALESCE((${check}), FALSE) AS ok FROM (SELECT ${sel}) AS ${q(table)}`,
      params,
    );
    if (!res[0] || !Number(res[0].ok)) {
      throw new DbQueryError("42501", `new row violates row-level security policy for table "${table}"`, null, null, 403);
    }
  }
}

// ------------------------------------------------------------ filters ---

type Built = { sql: string; params: unknown[] };

function condToSql(table: string, meta: TableMeta, c: Cond): Built {
  if (c.type === "raw") return { sql: c.sql, params: c.params };
  if (c.type === "and" || c.type === "or") {
    if (!c.items.length) return { sql: c.type === "and" ? "TRUE" : "FALSE", params: [] };
    const parts = c.items.map((i) => condToSql(table, meta, i));
    const sql = "(" + parts.map((p) => p.sql).join(c.type === "and" ? " AND " : " OR ") + ")";
    return { sql: c.not ? `NOT ${sql}` : sql, params: parts.flatMap((p) => p.params) };
  }
  let colName = c.col;
  let jsonPath: string | null = null;
  const arrow = colName.match(/^(\w+)->>?(\w+)$/);
  if (arrow) {
    colName = arrow[1];
    jsonPath = arrow[2];
  }
  const cm = colMeta(meta, table, colName);
  let col = `${q(table)}.${q(colName)}`;
  let fcm: ColumnMeta | undefined = cm;
  if (jsonPath) {
    col = `JSON_UNQUOTE(JSON_EXTRACT(${col}, '$.${jsonPath}'))`;
    fcm = undefined;
  }
  if (!jsonPath && (cm.kind === "text" || cm.kind === "enum") && (c.op === "eq" || c.op === "neq")) {
    // keep binary comparison
  }
  const v = (x: unknown) => {
    const out = toDbFilter(fcm, x);
    return fcm?.kind === "uuid" && typeof out === "string" ? out.toLowerCase() : out;
  };
  let sql: string;
  const params: unknown[] = [];
  switch (c.op) {
    case "eq":
      sql = `${col} = ?`;
      params.push(v(c.value));
      break;
    case "neq":
      sql = `${col} <> ?`;
      params.push(v(c.value));
      break;
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const op = { gt: ">", gte: ">=", lt: "<", lte: "<=" }[c.op];
      sql = `${col} ${op} ?`;
      params.push(v(c.value));
      break;
    }
    case "like":
      sql = `${col} LIKE ?`;
      params.push(String(c.value).replace(/\*/g, "%"));
      break;
    case "ilike":
      sql = `LOWER(${col}) LIKE LOWER(?)`;
      params.push(String(c.value).replace(/\*/g, "%"));
      break;
    case "is": {
      const val = c.value === null ? "null" : String(c.value).toLowerCase();
      if (val === "null") sql = `${col} IS NULL`;
      else if (val === "true") sql = `${col} IS TRUE`;
      else if (val === "false") sql = `${col} IS FALSE`;
      else sql = `${col} IS NULL`;
      break;
    }
    case "in": {
      const list = Array.isArray(c.value) ? c.value : parseInList(String(c.value));
      if (!list.length) sql = "FALSE";
      else {
        sql = `${col} IN (${list.map(() => "?").join(", ")})`;
        params.push(...list.map(v));
      }
      break;
    }
    case "cs": {
      // contains (arrays / jsonb)
      const val = typeof c.value === "string" && c.value.startsWith("{")
        ? JSON.stringify(c.value.slice(1, -1).split(",").filter(Boolean))
        : JSON.stringify(c.value);
      sql = `JSON_CONTAINS(${col}, ?)`;
      params.push(val);
      break;
    }
    case "ov": {
      const list = Array.isArray(c.value) ? c.value : parseInList(String(c.value).replace(/^\{|\}$/g, ""));
      sql = list.length ? "(" + list.map(() => `JSON_CONTAINS(${col}, JSON_QUOTE(?))`).join(" OR ") + ")" : "FALSE";
      params.push(...list);
      break;
    }
    default:
      throw new DbQueryError("PGRST100", `unsupported filter operator "${c.op}"`);
  }
  return { sql: c.not ? `NOT (${sql})` : sql, params };
}

function whereSql(table: string, meta: TableMeta, conds: Cond[], rls: string | null): Built {
  const parts = conds.map((c) => condToSql(table, meta, c));
  const sqls = parts.map((p) => p.sql);
  if (rls) sqls.push(rls);
  return {
    sql: sqls.length ? " WHERE " + sqls.join(" AND ") : "",
    params: parts.flatMap((p) => p.params),
  };
}

type Order = { col: string; ascending: boolean; nullsFirst: boolean; refTable?: string };

function orderSql(table: string, meta: TableMeta, orders: Order[]): string {
  const own = orders.filter((o) => !o.refTable);
  if (!own.length) return "";
  return (
    " ORDER BY " +
    own
      .map((o) => {
        const cm = colMeta(meta, table, o.col);
        const col = `${q(table)}.${q(o.col)}`;
        const coll = cm.kind === "text" ? " COLLATE utf8mb4_unicode_ci" : "";
        return `(${col} IS NULL) ${o.nullsFirst ? "DESC" : "ASC"}, ${col}${coll} ${o.ascending ? "ASC" : "DESC"}`;
      })
      .join(", ")
  );
}

// ------------------------------------------------------------ embeds ----

type Relation = { kind: "one"; fk: ForeignKey; target: string } | { kind: "many"; fk: ForeignKey; target: string };

function resolveRelation(parent: string, item: Extract<SelectItem, { type: "embed" }>): Relation {
  const pmeta = tableMeta(parent);
  const rel = item.rel;
  const hint = item.hint;
  // alias:fk_column(...)
  if (pmeta.columns[rel]) {
    const fk = pmeta.fks.find((f) => f.cols.length === 1 && f.cols[0] === rel);
    if (!fk) throw new DbQueryError("PGRST200", `Could not find a relationship for '${rel}' on '${parent}'`);
    return { kind: "one", fk, target: fk.ref === "auth_users" ? "auth_users" : fk.ref };
  }
  if (!TABLES[rel]) {
    throw new DbQueryError("PGRST200", `Could not find a relationship between '${parent}' and '${rel}' in the schema cache`);
  }
  const matchHint = (f: ForeignKey) => !hint || f.name === hint || f.cols.includes(hint);
  const one = pmeta.fks.filter((f) => f.ref === rel && matchHint(f));
  if (one.length) return { kind: "one", fk: one[0], target: rel };
  const many = tableMeta(rel).fks.filter((f) => f.ref === parent && matchHint(f));
  if (many.length) return { kind: "many", fk: many[0], target: rel };
  throw new DbQueryError("PGRST200", `Could not find a relationship between '${parent}' and '${rel}' in the schema cache`);
}

type EmbedOpts = { orders: Order[]; limits: Record<string, number> };

/** Columns that must be fetched for `items` on `table` (incl. FK keys for embeds). */
function neededColumns(table: string, items: SelectItem[]): string[] {
  const meta = tableMeta(table);
  const cols = new Set<string>();
  for (const it of items) {
    if (it.type === "star") Object.keys(meta.columns).forEach((c) => cols.add(c));
    else if (it.type === "col") {
      colMeta(meta, table, it.name);
      cols.add(it.name);
    } else {
      const r = resolveRelation(table, it);
      if (r.kind === "one") r.fk.cols.forEach((c) => cols.add(c));
      else r.fk.refcols.forEach((c) => cols.add(c));
    }
  }
  return [...cols];
}

function convertRow(meta: TableMeta, raw: Row): Row {
  const out: Row = {};
  for (const [k, v] of Object.entries(raw)) out[k] = fromDb(meta.columns[k], v);
  return out;
}

async function resolveEmbeds(
  exec: Executor,
  role: DbRole,
  table: string,
  items: SelectItem[],
  rows: Row[],
  opts: EmbedOpts,
  path = "",
): Promise<Row[]> {
  const embeds = items.filter((i): i is Extract<SelectItem, { type: "embed" }> => i.type === "embed");
  let result = rows;
  for (const e of embeds) {
    const r = resolveRelation(table, e);
    const target = r.target;
    const tmeta = tableMeta(target);
    const childPath = path ? `${path}.${e.alias}` : e.alias;
    const keyCol = r.kind === "one" ? r.fk.cols[0] : r.fk.refcols[0];
    const matchCol = r.kind === "one" ? r.fk.refcols[0] : r.fk.cols[0];
    const keys = [...new Set(result.map((row) => row[keyCol]).filter((v) => v !== null && v !== undefined))];
    let children: Row[] = [];
    if (keys.length) {
      const fetchCols = new Set(neededColumns(target, e.children));
      fetchCols.add(matchCol);
      const rls = target === "auth_users" ? (role.kind === "service" ? null : "FALSE") : rlsUsing(target, "SELECT", role);
      const where = whereSql(target, tmeta, [{ type: "cond", col: matchCol, op: "in", value: keys, not: false }], rls);
      const ord = orderSql(target, tmeta, opts.orders.filter((o) => o.refTable === childPath).map((o) => ({ ...o, refTable: undefined })));
      const [raw] = await exec.query<RowDataPacket[]>(
        `SELECT ${[...fetchCols].map((c) => `${q(target)}.${q(c)}`).join(", ")} FROM ${q(target)}${where.sql}${ord}`,
        where.params,
      );
      children = (raw as Row[]).map((x) => convertRow(tmeta, x));
      children = await resolveEmbeds(exec, role, target, e.children, children, opts, childPath);
    }
    const limit = opts.limits[childPath];
    const groups = new Map<unknown, Row[]>();
    for (const c of children) {
      const k = c[matchCol];
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(c);
    }
    for (const row of result) {
      const g = groups.get(row[keyCol]) ?? [];
      const projected = g.map((c) => project(target, e.children, c));
      row[`__embed_${e.alias}`] =
        r.kind === "one" ? (projected[0] ?? null) : limit !== undefined ? projected.slice(0, limit) : projected;
    }
    if (e.inner) {
      result = result.filter((row) => {
        const v = row[`__embed_${e.alias}`];
        return Array.isArray(v) ? v.length > 0 : v !== null;
      });
    }
  }
  return result;
}

function project(table: string, items: SelectItem[], row: Row): Row {
  const meta = tableMeta(table);
  const out: Row = {};
  for (const it of items) {
    if (it.type === "star") for (const c of Object.keys(meta.columns)) out[c] = row[c] ?? null;
    else if (it.type === "col") out[it.alias] = row[it.name] ?? null;
    else out[it.alias] = row[`__embed_${it.alias}`] ?? null;
  }
  return out;
}

// --------------------------------------------------------- mutations ----

function fillDefaults(meta: TableMeta, row: Row, role: DbRole): { row: Row; filled: Set<string> } {
  const out: Row = { ...row };
  const filled = new Set<string>();
  for (const [name, c] of Object.entries(meta.columns)) {
    if (out[name] !== undefined || !c.default) continue;
    const d = c.default;
    if ("fn" in d) {
      if (d.fn === "uuid") out[name] = randomUUID();
      else if (d.fn === "hex12") out[name] = randomBytes(12).toString("hex");
      else if (d.fn === "uid") out[name] = role.kind === "user" ? role.userId : null;
      else if (d.fn === "now") out[name] = new Date().toISOString();
    } else {
      out[name] = structuredClone(d.value);
    }
    filled.add(name);
  }
  return { row: out, filled };
}

function validateColumns(table: string, meta: TableMeta, row: Row) {
  for (const k of Object.keys(row)) {
    if (!meta.columns[k]) {
      throw new DbQueryError("PGRST204", `Could not find the '${k}' column of '${table}' in the schema cache`);
    }
  }
}

async function checkAppUniques(exec: Executor, table: string, meta: TableMeta, rows: Row[], excludePk?: Row[]) {
  for (const u of meta.appUniques ?? []) {
    for (const row of rows) {
      const applies = Object.entries(u.where).every(([c, vals]) => vals.some((v) => v === row[c]));
      if (!applies || u.cols.some((c) => row[c] === null || row[c] === undefined)) continue;
      const conds = [
        ...u.cols.map((c) => `${q(c)} = ?`),
        ...Object.entries(u.where).map(([c, vals]) => `${q(c)} IN (${vals.map(() => "?").join(",")})`),
      ];
      const params: unknown[] = [
        ...u.cols.map((c) => toDbFilter(meta.columns[c], row[c])),
        ...Object.entries(u.where).flatMap(([c, vals]) => vals.map((v) => toDbFilter(meta.columns[c], v))),
      ];
      const self = excludePk?.find((p) => meta.pk.every((k) => p[k] === row[k])) ?? (meta.pk.every((k) => row[k] !== undefined) ? row : null);
      if (self) {
        conds.push("NOT (" + meta.pk.map((k) => `${q(k)} = ?`).join(" AND ") + ")");
        params.push(...meta.pk.map((k) => toDbFilter(meta.columns[k], self[k])));
      }
      const [res] = await exec.query<RowDataPacket[]>(`SELECT 1 FROM ${q(table)} WHERE ${conds.join(" AND ")} LIMIT 1`, params);
      if (res.length) {
        throw new DbQueryError("23505", `duplicate key value violates unique constraint "${u.message}"`, null, null, 409);
      }
    }
  }
}

// Replacements for the few non-trivial Postgres triggers.
async function beforeInsertHook(exec: Executor, table: string, row: Row) {
  if (table === "user_ships" && (row.org_id === null || row.org_id === undefined) && row.user_id) {
    const [res] = await exec.query<RowDataPacket[]>("SELECT org_id FROM org_members WHERE user_id = ?", [row.user_id]);
    if (res.length === 1) row.org_id = res[0].org_id;
  }
}

async function afterInsertHook(exec: Executor, table: string, row: Row) {
  if (table === "orgs" && row.owner_id) {
    await exec.query(
      "INSERT IGNORE INTO org_members (org_id, user_id, role, joined_at, permissions) VALUES (?, ?, 'owner', UTC_TIMESTAMP(6), '[]')",
      [row.id, row.owner_id],
    );
  }
  if (table === "auth_users") {
    const meta = (typeof row.raw_user_meta_data === "object" && row.raw_user_meta_data) || {};
    const m = meta as Record<string, string>;
    const local = String(row.email ?? "").split("@")[0];
    await exec.query(
      "INSERT IGNORE INTO profiles (id, callsign, display_name, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))",
      [row.id, m.callsign ?? local, m.display_name ?? m.callsign ?? local],
    );
  }
}

// ------------------------------------------------------- error mapping --

export function mapError(e: unknown): DbError & { status: number } {
  if (e instanceof DbQueryError) {
    return { message: e.message, code: e.code, details: e.details, hint: e.hint, status: e.status };
  }
  const err = e as { errno?: number; code?: string; sqlMessage?: string; message?: string };
  const msg = err.sqlMessage ?? err.message ?? String(e);
  switch (err.errno) {
    case 1062: {
      const key = msg.match(/for key '(?:[^.']+\.)?([^']+)'/)?.[1] ?? "unique";
      return { code: "23505", message: `duplicate key value violates unique constraint "${key}"`, details: msg, hint: null, status: 409 };
    }
    case 1451:
    case 1452:
    case 1216:
    case 1217:
      return { code: "23503", message: `violates foreign key constraint: ${msg}`, details: msg, hint: null, status: 409 };
    case 1048:
    case 1364: {
      const col = msg.match(/'([^']+)'/)?.[1] ?? "?";
      return { code: "23502", message: `null value in column "${col}" violates not-null constraint`, details: msg, hint: null, status: 400 };
    }
    case 1406:
      return { code: "22001", message: `value too long: ${msg}`, details: msg, hint: null, status: 400 };
    case 1265:
    case 1366:
    case 1292:
      return { code: "22P02", message: `invalid input value: ${msg}`, details: msg, hint: null, status: 400 };
    case 3819:
    case 4025:
      return { code: "23514", message: `check constraint violated: ${msg}`, details: msg, hint: null, status: 400 };
  }
  console.error("[db] unexpected error", e);
  return { code: "XX000", message: msg, details: null, hint: null, status: 500 };
}

// ------------------------------------------------------------ builder ---

type Action = "select" | "insert" | "upsert" | "update" | "delete";

export class QueryBuilder<T = any> implements PromiseLike<DbResult<T>> {
  private action: Action = "select";
  private selectStr: string | null = null;
  private returning = false;
  private conds: Cond[] = [];
  private orders: Order[] = [];
  private limitN: number | null = null;
  private offsetN = 0;
  private embedLimits: Record<string, number> = {};
  private singleMode: "single" | "maybe" | null = null;
  private countMode: string | null = null;
  private head = false;
  private payload: Row | Row[] | null = null;
  private upsertOpts: { onConflict?: string; ignoreDuplicates?: boolean; defaultToNull?: boolean } = {};
  private shouldThrow = false;

  constructor(
    private table: string,
    private role: DbRole,
    private exec?: Executor,
  ) {}

  // ---- shape
  select(columns?: string, opts?: { count?: string; head?: boolean }) {
    if (this.action === "select") {
      this.selectStr = columns ?? "*";
      if (opts?.count) this.countMode = opts.count;
      if (opts?.head) this.head = true;
    } else {
      this.returning = true;
      this.selectStr = columns ?? "*";
    }
    return this;
  }
  insert(values: Row | Row[], opts?: { count?: string; defaultToNull?: boolean }) {
    this.action = "insert";
    this.payload = values;
    if (opts?.count) this.countMode = opts.count;
    this.upsertOpts.defaultToNull = opts?.defaultToNull;
    return this;
  }
  upsert(values: Row | Row[], opts?: { onConflict?: string; ignoreDuplicates?: boolean; count?: string; defaultToNull?: boolean }) {
    this.action = "upsert";
    this.payload = values;
    this.upsertOpts = { ...opts };
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  update(values: Row, opts?: { count?: string }) {
    this.action = "update";
    this.payload = values;
    if (opts?.count) this.countMode = opts.count;
    return this;
  }
  delete(opts?: { count?: string }) {
    this.action = "delete";
    if (opts?.count) this.countMode = opts.count;
    return this;
  }

  // ---- filters
  private add(col: string, op: string, value: unknown, not = false) {
    this.conds.push({ type: "cond", col, op, value, not });
    return this;
  }
  eq(col: string, v: unknown) { return this.add(col, "eq", v); }
  neq(col: string, v: unknown) { return this.add(col, "neq", v); }
  gt(col: string, v: unknown) { return this.add(col, "gt", v); }
  gte(col: string, v: unknown) { return this.add(col, "gte", v); }
  lt(col: string, v: unknown) { return this.add(col, "lt", v); }
  lte(col: string, v: unknown) { return this.add(col, "lte", v); }
  like(col: string, v: string) { return this.add(col, "like", v); }
  ilike(col: string, v: string) { return this.add(col, "ilike", v); }
  is(col: string, v: unknown) { return this.add(col, "is", v); }
  in(col: string, v: unknown[]) { return this.add(col, "in", v); }
  contains(col: string, v: unknown) { return this.add(col, "cs", v); }
  overlaps(col: string, v: unknown) { return this.add(col, "ov", v); }
  match(obj: Row) {
    for (const [k, v] of Object.entries(obj)) this.add(k, "eq", v);
    return this;
  }
  not(col: string, op: string, v: unknown) {
    const value = op === "in" && typeof v === "string" ? parseInList(v) : v;
    return this.add(col, op, value, true);
  }
  filter(col: string, op: string, v: unknown) {
    let not = false;
    let o = op;
    if (o.startsWith("not.")) {
      not = true;
      o = o.slice(4);
    }
    const value = o === "in" && typeof v === "string" ? parseInList(v) : v;
    return this.add(col, o, value, not);
  }
  or(expr: string, opts?: { foreignTable?: string; referencedTable?: string }) {
    if (opts?.foreignTable || opts?.referencedTable) {
      throw new DbQueryError("PGRST100", "or() on embedded resources is not supported");
    }
    this.conds.push({ type: "or", not: false, items: parseLogicTree(expr) });
    return this;
  }

  // ---- modifiers
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean; foreignTable?: string; referencedTable?: string }) {
    const ascending = opts?.ascending ?? true;
    this.orders.push({
      col,
      ascending,
      nullsFirst: opts?.nullsFirst ?? !ascending,
      refTable: opts?.referencedTable ?? opts?.foreignTable,
    });
    return this;
  }
  limit(n: number, opts?: { foreignTable?: string; referencedTable?: string }) {
    const ref = opts?.referencedTable ?? opts?.foreignTable;
    if (ref) this.embedLimits[ref] = n;
    else this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.offsetN = from;
    this.limitN = to - from + 1;
    return this;
  }
  single() {
    this.singleMode = "single";
    return this;
  }
  maybeSingle() {
    this.singleMode = "maybe";
    return this;
  }
  abortSignal(_s: unknown) { return this; }
  returns<U>() { return this as unknown as QueryBuilder<U>; }
  throwOnError() {
    this.shouldThrow = true;
    return this;
  }

  then<R1 = DbResult<T>, R2 = never>(
    onfulfilled?: ((value: DbResult<T>) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private async run(): Promise<DbResult<T>> {
    try {
      const { rows, count } = await this.execute();
      let data: unknown = rows;
      if (this.head) data = null;
      if (this.singleMode && rows) {
        if (rows.length === 1) data = rows[0];
        else if (rows.length === 0 && this.singleMode === "maybe") data = null;
        else {
          throw new DbQueryError(
            "PGRST116",
            "JSON object requested, multiple (or no) rows returned",
            `The result contains ${rows.length} rows`,
            null,
            406,
          );
        }
      }
      if (rows === null && this.action !== "select") data = null;
      return { data: data as T, error: null, count, status: 200, statusText: "OK" };
    } catch (e) {
      const err = mapError(e);
      if (this.shouldThrow) throw Object.assign(new Error(err.message), err);
      const { status, ...rest } = err;
      return { data: null as T, error: rest, count: null, status, statusText: "Error" };
    }
  }

  private async execute(): Promise<{ rows: Row[] | null; count: number | null }> {
    const meta = tableMeta(this.table);
    if ((this.table === "auth_users" || this.table === "storage_objects") && this.role.kind !== "service") {
      throw new DbQueryError("42501", `permission denied for table ${this.table}`, null, null, 403);
    }
    switch (this.action) {
      case "select":
        return this.doSelect(this.exec ?? getPool(), meta);
      case "insert":
      case "upsert":
        return this.withConn((c) => this.doInsert(c, meta));
      case "update":
        return this.withConn((c) => this.doUpdate(c, meta));
      case "delete":
        return this.withConn((c) => this.doDelete(c, meta));
    }
  }

  private async withConn<R>(fn: (c: PoolConnection) => Promise<R>): Promise<R> {
    if (this.exec && "beginTransaction" in this.exec && !("getConnection" in this.exec)) {
      return fn(this.exec as PoolConnection);
    }
    return withTransaction(fn);
  }

  private async doSelect(exec: Executor, meta: TableMeta, extraConds: Cond[] = [], forcedRls?: string | null) {
    const items = parseSelect(this.selectStr);
    const cols = neededColumns(this.table, items);
    const rls = forcedRls !== undefined ? forcedRls : rlsUsing(this.table, "SELECT", this.role);
    const where = whereSql(this.table, meta, [...this.conds, ...extraConds], rls);
    let count: number | null = null;
    if (this.countMode) {
      const [c] = await exec.query<RowDataPacket[]>(`SELECT COUNT(*) AS n FROM ${q(this.table)}${where.sql}`, where.params);
      count = Number(c[0].n);
    }
    if (this.head) return { rows: [], count };
    let sql = `SELECT ${cols.map((c) => `${q(this.table)}.${q(c)}`).join(", ")} FROM ${q(this.table)}${where.sql}`;
    sql += orderSql(this.table, meta, this.orders);
    if (this.limitN !== null) sql += ` LIMIT ${Math.max(0, Math.floor(this.limitN))}`;
    if (this.offsetN) sql += `${this.limitN === null ? " LIMIT 18446744073709551615" : ""} OFFSET ${Math.floor(this.offsetN)}`;
    const [raw] = await exec.query<RowDataPacket[]>(sql, where.params);
    let rows = (raw as Row[]).map((r) => convertRow(meta, r));
    rows = await resolveEmbeds(exec, this.role, this.table, items, rows, { orders: this.orders, limits: this.embedLimits });
    return { rows: rows.map((r) => project(this.table, items, r)), count };
  }

  /** Re-read rows by primary key (for RETURNING). */
  private async readBack(exec: Executor, meta: TableMeta, keys: Row[], keyCols: string[]): Promise<Row[]> {
    if (!this.returning || !keys.length) return [];
    const ors: Cond = {
      type: "or",
      not: false,
      items: keys.map((k) => ({
        type: "and" as const,
        not: false,
        items: keyCols.map((c) => ({ type: "cond" as const, col: c, op: "eq", value: k[c], not: false })),
      })),
    };
    const saved = { conds: this.conds, limitN: this.limitN, offsetN: this.offsetN, countMode: this.countMode, head: this.head };
    this.conds = [];
    this.limitN = null;
    this.offsetN = 0;
    this.countMode = null;
    this.head = false;
    try {
      const { rows } = await this.doSelect(exec, meta, [ors]);
      // keep input order
      const index = (r: Row) => keys.findIndex((k) => keyCols.every((c) => String(k[c]).toLowerCase() === String(r[c]).toLowerCase()));
      return keyCols.every((c) => parseSelect(this.selectStr).some((i) => i.type === "star" || (i.type === "col" && i.name === c)))
        ? rows.sort((a, b) => index(a) - index(b))
        : rows;
    } finally {
      Object.assign(this, saved);
    }
  }

  private async doInsert(conn: PoolConnection, meta: TableMeta) {
    const input = Array.isArray(this.payload) ? this.payload : [this.payload ?? {}];
    if (!input.length) return { rows: this.returning ? [] : null, count: 0 };
    const isUpsert = this.action === "upsert";
    const conflictCols = isUpsert
      ? (this.upsertOpts.onConflict ? this.upsertOpts.onConflict.split(",").map((s) => s.trim()) : meta.pk)
      : meta.pk;
    const keysUnion = new Set<string>();
    input.forEach((r) => Object.keys(r).forEach((k) => keysUnion.add(k)));
    const rows: Row[] = [];
    const provided: Set<string>[] = [];
    for (const r of input) {
      validateColumns(this.table, meta, r);
      const normalized: Row = {};
      for (const k of keysUnion) normalized[k] = r[k];
      const { row } = fillDefaults(meta, normalized, this.role);
      await beforeInsertHook(conn, this.table, row);
      rows.push(row);
      provided.push(new Set(Object.keys(r).filter((k) => r[k] !== undefined)));
    }
    const allCols = Object.keys(meta.columns).filter((c) => rows.some((r) => r[c] !== undefined));
    // RLS
    if (this.role.kind !== "service") {
      for (const row of rows) {
        let existing: Row | null = null;
        if (isUpsert) {
          const where = conflictCols.map((c) => `${q(c)} = ?`).join(" AND ");
          const [ex] = await conn.query<RowDataPacket[]>(
            `SELECT * FROM ${q(this.table)} WHERE ${where} LIMIT 1`,
            conflictCols.map((c) => toDbFilter(meta.columns[c], row[c])),
          );
          existing = ex[0] ? convertRow(meta, ex[0] as Row) : null;
        }
        if (existing) {
          if (this.upsertOpts.ignoreDuplicates) continue;
          const using = rlsUsing(this.table, "UPDATE", this.role);
          const [ok] = await conn.query<RowDataPacket[]>(
            `SELECT 1 FROM ${q(this.table)} WHERE ${conflictCols.map((c) => `${q(c)} = ?`).join(" AND ")} AND ${using ?? "TRUE"}`,
            conflictCols.map((c) => toDbFilter(meta.columns[c], row[c])),
          );
          if (!ok.length) {
            throw new DbQueryError("42501", `new row violates row-level security policy (USING expression) for table "${this.table}"`, null, null, 403);
          }
          const merged = { ...existing };
          for (const k of Object.keys(row)) if (provided[rows.indexOf(row)].has(k)) merged[k] = row[k];
          await assertCheck(conn, this.table, meta, rlsCheck(this.table, "UPDATE", this.role), [merged]);
        } else {
          await assertCheck(conn, this.table, meta, rlsCheck(this.table, "INSERT", this.role), [row]);
        }
      }
    }
    await checkAppUniques(conn, this.table, meta, isUpsert ? [] : rows);
    let affected = 0;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const params: unknown[] = [];
      const values = chunk
        .map((r) => {
          params.push(...allCols.map((c) => toDb(meta.columns[c], r[c])));
          return "(" + allCols.map(() => "?").join(", ") + ")";
        })
        .join(", ");
      let sql = `INSERT INTO ${q(this.table)} (${allCols.map(q).join(", ")}) VALUES ${values}`;
      if (isUpsert) {
        const updatable = [...keysUnion].filter((c) => !conflictCols.includes(c));
        if (this.upsertOpts.ignoreDuplicates || !updatable.length) {
          sql += ` ON DUPLICATE KEY UPDATE ${q(conflictCols[0])} = ${q(conflictCols[0])}`;
        } else {
          sql += ` ON DUPLICATE KEY UPDATE ${updatable.map((c) => `${q(c)} = VALUES(${q(c)})`).join(", ")}`;
        }
      }
      const [res] = await conn.query<ResultSetHeader>(sql, params);
      affected += res.affectedRows;
    }
    for (const row of rows) await afterInsertHook(conn, this.table, row);
    if (affected) bumpTable(this.table);
    const keyCols = isUpsert ? conflictCols : meta.pk;
    const out = await this.readBack(conn, meta, rows, keyCols);
    return { rows: this.returning ? out : null, count: this.countMode ? rows.length : null };
  }

  /** Rows (primary keys + full values) targeted by an UPDATE/DELETE. */
  private async targetRows(conn: PoolConnection, meta: TableMeta, cmd: "UPDATE" | "DELETE"): Promise<Row[]> {
    let rls: string | null = null;
    if (this.role.kind !== "service") {
      const a = rlsUsing(this.table, cmd, this.role);
      const b = rlsUsing(this.table, "SELECT", this.role);
      rls = `${a} AND ${b}`;
    }
    const where = whereSql(this.table, meta, this.conds, rls);
    let sql = `SELECT * FROM ${q(this.table)}${where.sql}${orderSql(this.table, meta, this.orders)}`;
    if (this.limitN !== null) sql += ` LIMIT ${Math.floor(this.limitN)}`;
    sql += " FOR UPDATE";
    const [raw] = await conn.query<RowDataPacket[]>(sql, where.params);
    return (raw as Row[]).map((r) => convertRow(meta, r));
  }

  private pkWhere(meta: TableMeta, rows: Row[]): Built {
    const params: unknown[] = [];
    if (meta.pk.length === 1) {
      const c = meta.pk[0];
      rows.forEach((r) => params.push(toDbFilter(meta.columns[c], r[c])));
      return { sql: `${q(c)} IN (${rows.map(() => "?").join(", ")})`, params };
    }
    const sql = rows
      .map((r) => {
        meta.pk.forEach((c) => params.push(toDbFilter(meta.columns[c], r[c])));
        return "(" + meta.pk.map((c) => `${q(c)} = ?`).join(" AND ") + ")";
      })
      .join(" OR ");
    return { sql: `(${sql})`, params };
  }

  private async doUpdate(conn: PoolConnection, meta: TableMeta) {
    const patch = (this.payload ?? {}) as Row;
    validateColumns(this.table, meta, patch);
    const setCols = Object.keys(patch).filter((k) => patch[k] !== undefined);
    const targets = await this.targetRows(conn, meta, "UPDATE");
    if (!targets.length || !setCols.length) {
      return { rows: this.returning ? [] : null, count: this.countMode ? 0 : null };
    }
    const newRows = targets.map((r) => ({ ...r, ...patch }));
    await assertCheck(conn, this.table, meta, rlsCheck(this.table, "UPDATE", this.role), newRows);
    if (setCols.some((c) => (meta.appUniques ?? []).some((u) => u.cols.includes(c) || c in u.where))) {
      await checkAppUniques(conn, this.table, meta, newRows, targets);
    }
    const CHUNK = 500;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const chunk = targets.slice(i, i + CHUNK);
      const pk = this.pkWhere(meta, chunk);
      await conn.query(
        `UPDATE ${q(this.table)} SET ${setCols.map((c) => `${q(c)} = ?`).join(", ")} WHERE ${pk.sql}`,
        [...setCols.map((c) => toDb(meta.columns[c], patch[c])), ...pk.params],
      );
    }
    bumpTable(this.table);
    const keys = newRows.map((r) => Object.fromEntries(meta.pk.map((c) => [c, r[c]])));
    const out = await this.readBack(conn, meta, keys, meta.pk);
    return { rows: this.returning ? out : null, count: this.countMode ? targets.length : null };
  }

  private async doDelete(conn: PoolConnection, meta: TableMeta) {
    const targets = await this.targetRows(conn, meta, "DELETE");
    if (!targets.length) return { rows: this.returning ? [] : null, count: this.countMode ? 0 : null };
    let out: Row[] = [];
    if (this.returning) {
      const items = parseSelect(this.selectStr);
      const withEmbeds = await resolveEmbeds(conn, this.role, this.table, items, targets.map((r) => ({ ...r })), {
        orders: this.orders,
        limits: this.embedLimits,
      });
      out = withEmbeds.map((r) => project(this.table, items, r));
    }
    const CHUNK = 500;
    for (let i = 0; i < targets.length; i += CHUNK) {
      const pk = this.pkWhere(meta, targets.slice(i, i + CHUNK));
      await conn.query(`DELETE FROM ${q(this.table)} WHERE ${pk.sql}`, pk.params);
    }
    bumpTable(this.table);
    return { rows: this.returning ? out : null, count: this.countMode ? targets.length : null };
  }
}
