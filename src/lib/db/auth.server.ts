// Own session handling (replaces Supabase Auth / GoTrue).
//
// Access tokens are short-lived HS256 JWTs signed with AUTH_JWT_SECRET;
// refresh tokens and one-time login tokens are random strings stored as
// SHA-256 hashes in `auth_tokens`.
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool.server";
import { fromDbTimestamp, toDbTimestamp } from "./values";

const ACCESS_TTL_S = 60 * 60; // 1 hour
const REFRESH_TTL_S = 60 * 60 * 24 * 60; // 60 days, sliding
const MAGIC_TTL_S = 60 * 10; // 10 minutes

function secret(): Buffer {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error("AUTH_JWT_SECRET is not configured (min. 32 characters).");
  }
  return Buffer.from(s, "utf8");
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

export type Claims = { sub: string; email: string | null; role: "authenticated"; iat: number; exp: number; aud: string };

export function signAccessToken(userId: string, email: string | null): { token: string; exp: number } {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + ACCESS_TTL_S;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: userId, email, role: "authenticated", aud: "authenticated", iat: now, exp }));
  const sig = b64url(createHmac("sha256", secret()).update(`${header}.${payload}`).digest());
  return { token: `${header}.${payload}.${sig}`, exp };
}

export function verifyAccessToken(token: string | null | undefined): Claims | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const expected = createHmac("sha256", secret()).update(`${parts[0]}.${parts[1]}`).digest();
  const given = Buffer.from(parts[2].replace(/-/g, "+").replace(/_/g, "/"), "base64");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const claims = JSON.parse(Buffer.from(parts[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as Claims;
    if (!claims.sub || typeof claims.exp !== "number" || claims.exp < Math.floor(Date.now() / 1000)) return null;
    return claims;
  } catch {
    return null;
  }
}

export function bearerFrom(request: Request | undefined | null): string | null {
  const h = request?.headers?.get("authorization");
  if (!h || !h.startsWith("Bearer ")) return null;
  return h.slice(7).trim() || null;
}

// ------------------------------------------------------------- users ----

export type AuthUser = {
  id: string;
  aud: string;
  role: string;
  email: string | null;
  email_confirmed_at: string | null;
  last_sign_in_at: string | null;
  banned_until: string | null;
  created_at: string;
  updated_at: string;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
};

function toUser(r: RowDataPacket): AuthUser {
  const parse = (v: unknown) => {
    try {
      return typeof v === "string" ? JSON.parse(v) : (v ?? {});
    } catch {
      return {};
    }
  };
  return {
    id: r.id,
    aud: "authenticated",
    role: "authenticated",
    email: r.email,
    email_confirmed_at: fromDbTimestamp(r.email_confirmed_at),
    last_sign_in_at: fromDbTimestamp(r.last_sign_in_at),
    banned_until: fromDbTimestamp(r.banned_until),
    created_at: fromDbTimestamp(r.created_at)!,
    updated_at: fromDbTimestamp(r.updated_at)!,
    user_metadata: parse(r.raw_user_meta_data),
    app_metadata: { provider: "discord", providers: ["discord"], ...parse(r.raw_app_meta_data) },
  };
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT * FROM auth_users WHERE id = ?", [id]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function getUserByEmail(email: string): Promise<AuthUser | null> {
  const [rows] = await getPool().query<RowDataPacket[]>("SELECT * FROM auth_users WHERE email = ?", [email.toLowerCase()]);
  return rows[0] ? toUser(rows[0]) : null;
}

export async function listUsers(page = 1, perPage = 50): Promise<AuthUser[]> {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT * FROM auth_users ORDER BY created_at ASC LIMIT ? OFFSET ?",
    [perPage, (page - 1) * perPage],
  );
  return rows.map(toUser);
}

export async function createUser(input: {
  email?: string;
  password?: string;
  email_confirm?: boolean;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
}): Promise<AuthUser> {
  const email = input.email?.trim().toLowerCase() ?? null;
  if (email && (await getUserByEmail(email))) {
    const e = new Error("A user with this email address has already been registered");
    (e as Error & { code?: string; status?: number }).code = "email_exists";
    (e as Error & { status?: number }).status = 422;
    throw e;
  }
  const id = randomUUID();
  const meta = input.user_metadata ?? {};
  const local = (email ?? "").split("@")[0];
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `INSERT INTO auth_users (id, email, encrypted_password, raw_user_meta_data, raw_app_meta_data, email_confirmed_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))`,
      [
        id,
        email,
        input.password ? await bcrypt.hash(input.password, 10) : null,
        JSON.stringify(meta),
        JSON.stringify(input.app_metadata ?? {}),
        input.email_confirm ? toDbTimestamp(new Date()) : null,
      ],
    );
    // replaces the handle_new_user() trigger
    await conn.query(
      "INSERT IGNORE INTO profiles (id, callsign, display_name, created_at, updated_at) VALUES (?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))",
      [id, (meta.callsign as string) ?? local, (meta.display_name as string) ?? (meta.callsign as string) ?? local],
    );
    await conn.commit();
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
  return (await getUserById(id))!;
}

function parseBanDuration(d: string): Date | null {
  if (d === "none") return null;
  const m = d.match(/^(\d+)(h|m|s)$/);
  if (!m) throw new Error(`invalid ban_duration: ${d}`);
  const mult = { h: 3600, m: 60, s: 1 }[m[2] as "h" | "m" | "s"];
  return new Date(Date.now() + Number(m[1]) * mult * 1000);
}

export async function updateUserById(
  id: string,
  attrs: {
    email?: string;
    password?: string;
    email_confirm?: boolean;
    ban_duration?: string;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  },
): Promise<AuthUser> {
  const existing = await getUserById(id);
  if (!existing) throw Object.assign(new Error("User not found"), { status: 404, code: "user_not_found" });
  const sets: string[] = [];
  const params: unknown[] = [];
  if (attrs.email !== undefined) {
    sets.push("email = ?");
    params.push(attrs.email.trim().toLowerCase());
  }
  if (attrs.password !== undefined) {
    sets.push("encrypted_password = ?");
    params.push(await bcrypt.hash(attrs.password, 10));
  }
  if (attrs.email_confirm) {
    sets.push("email_confirmed_at = COALESCE(email_confirmed_at, UTC_TIMESTAMP(6))");
  }
  if (attrs.ban_duration !== undefined) {
    sets.push("banned_until = ?");
    const until = parseBanDuration(attrs.ban_duration);
    params.push(until ? toDbTimestamp(until) : null);
    if (until) await getPool().query("DELETE FROM auth_tokens WHERE user_id = ? AND kind = 'refresh'", [id]);
  }
  if (attrs.user_metadata !== undefined) {
    sets.push("raw_user_meta_data = ?");
    params.push(JSON.stringify({ ...existing.user_metadata, ...attrs.user_metadata }));
  }
  if (attrs.app_metadata !== undefined) {
    sets.push("raw_app_meta_data = ?");
    params.push(JSON.stringify({ ...existing.app_metadata, ...attrs.app_metadata }));
  }
  if (sets.length) {
    await getPool().query(`UPDATE auth_users SET ${sets.join(", ")} WHERE id = ?`, [...params, id]);
  }
  return (await getUserById(id))!;
}

export async function deleteUser(id: string): Promise<void> {
  await getPool().query("DELETE FROM auth_users WHERE id = ?", [id]);
}

// ---------------------------------------------------------- sessions ----

export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: AuthUser;
};

async function storeToken(kind: "magic" | "refresh", userId: string, ttl: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getPool().query(
    "INSERT INTO auth_tokens (token_hash, kind, user_id, expires_at) VALUES (?, ?, ?, ?)",
    [sha256(token), kind, userId, toDbTimestamp(new Date(Date.now() + ttl * 1000))],
  );
  return token;
}

/** Consume a one-time token; returns its user id or null. */
async function consumeToken(kind: "magic" | "refresh", token: string): Promise<string | null> {
  const hash = sha256(token);
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const [rows] = await conn.query<RowDataPacket[]>(
      "SELECT user_id FROM auth_tokens WHERE token_hash = ? AND kind = ? AND expires_at > UTC_TIMESTAMP(6) FOR UPDATE",
      [hash, kind],
    );
    await conn.query("DELETE FROM auth_tokens WHERE token_hash = ?", [hash]);
    await conn.commit();
    return rows[0]?.user_id ?? null;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}

export async function createMagicToken(userId: string): Promise<string> {
  await getPool().query("DELETE FROM auth_tokens WHERE expires_at < UTC_TIMESTAMP(6)");
  return storeToken("magic", userId, MAGIC_TTL_S);
}

async function issueSession(userId: string): Promise<Session> {
  const user = await getUserById(userId);
  if (!user) throw Object.assign(new Error("User not found"), { status: 404 });
  if (user.banned_until && new Date(user.banned_until).getTime() > Date.now()) {
    throw Object.assign(new Error("User is banned"), { status: 403, code: "user_banned" });
  }
  const { token, exp } = signAccessToken(user.id, user.email);
  const refresh = await storeToken("refresh", user.id, REFRESH_TTL_S);
  return {
    access_token: token,
    refresh_token: refresh,
    token_type: "bearer",
    expires_in: exp - Math.floor(Date.now() / 1000),
    expires_at: exp,
    user,
  };
}

export async function verifyMagicToken(token: string): Promise<Session> {
  const userId = await consumeToken("magic", token);
  if (!userId) throw Object.assign(new Error("Email link is invalid or has expired"), { status: 403, code: "otp_expired" });
  await getPool().query("UPDATE auth_users SET last_sign_in_at = UTC_TIMESTAMP(6) WHERE id = ?", [userId]);
  return issueSession(userId);
}

export async function refreshSession(refreshToken: string): Promise<Session> {
  const userId = await consumeToken("refresh", refreshToken);
  if (!userId) throw Object.assign(new Error("Invalid Refresh Token"), { status: 400, code: "refresh_token_not_found" });
  return issueSession(userId);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await getPool().query("DELETE FROM auth_tokens WHERE token_hash = ?", [sha256(refreshToken)]);
}
