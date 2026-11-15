// Factory for supabase-js compatible clients backed by MySQL.
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import * as auth from "./auth.server";
import { getPool } from "./pool.server";
import { mapError, QueryBuilder } from "./query.server";
import { storageBucket } from "./storage.server";
import type { DbResult, DbRole } from "./types";

type RpcArgs = Record<string, unknown>;

const ok = <T>(data: T): DbResult<T> => ({ data, error: null, count: null, status: 200, statusText: "OK" });

async function exists(sql: string, params: unknown[]): Promise<boolean> {
  const [r] = await getPool().query<RowDataPacket[]>(sql, params);
  return r.length > 0;
}

// Postgres functions that the app calls via .rpc()
const RPC: Record<string, (args: RpcArgs, role: DbRole) => Promise<unknown>> = {
  async has_role(a) {
    return exists("SELECT 1 FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1", [a._user_id, a._role]);
  },
  async has_org_perm(a) {
    if (await exists("SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [a._user])) return true;
    return exists(
      "SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND (role = 'owner' OR JSON_CONTAINS(permissions, JSON_QUOTE(?))) LIMIT 1",
      [a._org, a._user, a._perm],
    );
  },
  async has_org_role(a) {
    const roles = (a._roles as string[]) ?? [];
    if (!roles.length) return false;
    return exists(
      `SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? AND role IN (${roles.map(() => "?").join(",")}) LIMIT 1`,
      [a._org, a._user, ...roles],
    );
  },
  async is_org_member(a) {
    return exists("SELECT 1 FROM org_members WHERE org_id = ? AND user_id = ? LIMIT 1", [a._org, a._user]);
  },
  async shares_org_with(a) {
    return exists(
      "SELECT 1 FROM org_members x JOIN org_members y ON x.org_id = y.org_id WHERE x.user_id = ? AND y.user_id = ? LIMIT 1",
      [a._a, a._b],
    );
  },
  async crypt_password(a) {
    // Postgres used crypt(pwd, gen_salt('bf', 10)); bcrypt hashes are compatible.
    return [{ hash: await bcrypt.hash(String(a.pwd ?? ""), 10) }];
  },
  async verify_mission_password(a) {
    const [r] = await getPool().query<RowDataPacket[]>("SELECT password_hash FROM missions WHERE id = ?", [a._mission_id]);
    if (!r.length) return false;
    const hash = r[0].password_hash as string | null;
    if (!hash) return true;
    return bcrypt.compare(String(a._password ?? ""), hash.replace(/^\$2a\$/, "$2b$")).catch(() => false);
  },
  async current_org_id() {
    const [r] = await getPool().query<RowDataPacket[]>("SELECT id FROM orgs ORDER BY created_at ASC LIMIT 1");
    return r[0]?.id ?? null;
  },
  async org_id_from_slug(a) {
    const [r] = await getPool().query<RowDataPacket[]>("SELECT id FROM orgs WHERE slug = ? AND is_active = 1", [a._slug]);
    return r[0]?.id ?? null;
  },
};

function authError(e: unknown) {
  const x = e as { message?: string; status?: number; code?: string };
  return { message: x.message ?? String(e), status: x.status ?? 500, code: x.code ?? "unexpected_failure", name: "AuthApiError" };
}

export type DbClient = ReturnType<typeof createDbClient>;

export function createDbClient(role: DbRole) {
  return {
    role,
    from<T = any>(table: string) {
      return new QueryBuilder<T>(table, role);
    },
    schema(_name: string) {
      return this;
    },
    async rpc<T = any>(name: string, args: RpcArgs = {}): Promise<DbResult<T>> {
      const fn = RPC[name];
      if (!fn) {
        return {
          data: null as T,
          error: { message: `Could not find the function public.${name}`, code: "PGRST202", details: null, hint: null },
          count: null,
          status: 404,
          statusText: "Not Found",
        };
      }
      try {
        return ok((await fn(args, role)) as T);
      } catch (e) {
        const { status, ...error } = mapError(e);
        return { data: null as T, error, count: null, status, statusText: "Error" };
      }
    },
    storage: {
      from(bucket: string) {
        return storageBucket(role, bucket);
      },
    },
    channel(_name: string) {
      const ch = { on: () => ch, subscribe: () => ch, unsubscribe: async () => "ok" };
      return ch;
    },
    async removeChannel(_c: unknown) {
      return "ok";
    },
    auth: {
      async getUser(token?: string) {
        const claims = auth.verifyAccessToken(token ?? null);
        if (!claims) return { data: { user: null }, error: authError({ message: "Invalid JWT", status: 401, code: "bad_jwt" }) };
        const user = await auth.getUserById(claims.sub);
        return user
          ? { data: { user }, error: null }
          : { data: { user: null }, error: authError({ message: "User not found", status: 404 }) };
      },
      async getClaims(token?: string) {
        const claims = auth.verifyAccessToken(token ?? null);
        if (!claims) return { data: null, error: authError({ message: "Invalid JWT", status: 401, code: "bad_jwt" }) };
        return { data: { claims, header: { alg: "HS256" }, signature: "" }, error: null };
      },
      admin: {
        async createUser(attrs: Parameters<typeof auth.createUser>[0]) {
          if (role.kind !== "service") return { data: { user: null }, error: authError({ message: "not allowed", status: 403 }) };
          try {
            return { data: { user: await auth.createUser(attrs) }, error: null };
          } catch (e) {
            return { data: { user: null }, error: authError(e) };
          }
        },
        async updateUserById(id: string, attrs: Parameters<typeof auth.updateUserById>[1]) {
          if (role.kind !== "service") return { data: { user: null }, error: authError({ message: "not allowed", status: 403 }) };
          try {
            return { data: { user: await auth.updateUserById(id, attrs) }, error: null };
          } catch (e) {
            return { data: { user: null }, error: authError(e) };
          }
        },
        async getUserById(id: string) {
          if (role.kind !== "service") return { data: { user: null }, error: authError({ message: "not allowed", status: 403 }) };
          const user = await auth.getUserById(id);
          return user ? { data: { user }, error: null } : { data: { user: null }, error: authError({ message: "User not found", status: 404 }) };
        },
        async listUsers(opts?: { page?: number; perPage?: number }) {
          if (role.kind !== "service") return { data: { users: [] }, error: authError({ message: "not allowed", status: 403 }) };
          return { data: { users: await auth.listUsers(opts?.page ?? 1, opts?.perPage ?? 50), aud: "authenticated" }, error: null };
        },
        async deleteUser(id: string) {
          if (role.kind !== "service") return { data: null, error: authError({ message: "not allowed", status: 403 }) };
          await auth.deleteUser(id);
          return { data: {}, error: null };
        },
        async generateLink(opts: { type: string; email: string }) {
          if (role.kind !== "service") return { data: null, error: authError({ message: "not allowed", status: 403 }) };
          if (opts.type !== "magiclink") return { data: null, error: authError({ message: `unsupported link type ${opts.type}`, status: 400 }) };
          const user = await auth.getUserByEmail(opts.email);
          if (!user) return { data: null, error: authError({ message: "User not found", status: 404, code: "user_not_found" }) };
          const token = await auth.createMagicToken(user.id);
          return {
            data: {
              user,
              properties: { hashed_token: token, action_link: "", email_otp: "", redirect_to: "", verification_type: "magiclink" },
            },
            error: null,
          };
        },
      },
    },
  };
}

let serviceClient: DbClient | undefined;
/** Service-role client: bypasses row-level security (server only). */
export function getServiceClient(): DbClient {
  if (!serviceClient) serviceClient = createDbClient({ kind: "service" });
  return serviceClient;
}
