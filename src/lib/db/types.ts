export type ColumnKind =
  | "uuid"
  | "text"
  | "json"
  | "array"
  | "bool"
  | "int"
  | "bigint"
  | "num"
  | "ts"
  | "enum";

export type ColumnDefault = { fn: "now" | "uuid" | "uid" | "hex12" } | { value: unknown };

export type ColumnMeta = {
  kind: ColumnKind;
  nullable: boolean;
  enum?: string;
  elem?: string;
  default?: ColumnDefault;
};

export type ForeignKey = { name: string; cols: string[]; ref: string; refcols: string[] };

export type AppUnique = { cols: string[]; where: Record<string, unknown[]>; message: string };

export type TableMeta = {
  pk: string[];
  columns: Record<string, ColumnMeta>;
  uniques: string[][];
  appUniques: AppUnique[];
  fks: ForeignKey[];
};

export type Policy = {
  name: string;
  cmd: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "ALL";
  roles: string[];
  permissive: boolean;
  using: string | null;
  check: string | null;
};

/** PostgREST-compatible error shape (what supabase-js returns). */
export type DbError = {
  message: string;
  code: string;
  details: string | null;
  hint: string | null;
};

export type DbResult<T = any> = {
  data: T;
  error: DbError | null;
  count: number | null;
  status: number;
  statusText: string;
};

/** Who is running a query: the service role (bypasses RLS), a signed-in
 *  user (RLS as "authenticated"), or an anonymous visitor (RLS as "anon"). */
export type DbRole = { kind: "service" } | { kind: "user"; userId: string } | { kind: "anon" };
