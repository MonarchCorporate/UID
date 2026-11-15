// Browser client. Keeps the small part of the supabase-js API the UI uses
// (auth session handling, file upload, realtime-style change notifications)
// but talks to this app's own server instead of Supabase.
//
// All data queries run on the server (server functions); see src/lib/db.

type User = {
  id: string;
  email: string | null;
  user_metadata: Record<string, unknown>;
  app_metadata: Record<string, unknown>;
  [k: string]: unknown;
};

export type Session = {
  access_token: string;
  refresh_token: string;
  token_type: "bearer";
  expires_in: number;
  expires_at: number;
  user: User;
};

type AuthEvent = "INITIAL_SESSION" | "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED";
type Listener = (event: AuthEvent, session: Session | null) => void;

const STORAGE_KEY = "uid-auth-session";
const isBrowser = typeof window !== "undefined";

function readStored(): Session | null {
  if (!isBrowser) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function writeStored(s: Session | null) {
  if (!isBrowser) return;
  try {
    if (s) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable */
  }
}

let session: Session | null = readStored();
const listeners = new Set<Listener>();
let refreshing: Promise<Session | null> | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;

function emit(event: AuthEvent) {
  for (const l of listeners) {
    try {
      l(event, session);
    } catch (e) {
      console.error(e);
    }
  }
}

function scheduleRefresh() {
  if (!isBrowser) return;
  clearTimeout(refreshTimer);
  if (!session) return;
  const ms = Math.max(5_000, session.expires_at * 1000 - Date.now() - 60_000);
  refreshTimer = setTimeout(() => {
    void doRefresh();
  }, ms);
}

function setSession(s: Session | null, event: AuthEvent) {
  session = s;
  writeStored(s);
  scheduleRefresh();
  emit(event);
}

async function post<T>(url: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(json.error || `HTTP ${res.status}`), { status: res.status });
  return json;
}

async function doRefresh(): Promise<Session | null> {
  if (!session) return null;
  if (refreshing) return refreshing;
  const current = session;
  refreshing = (async () => {
    try {
      const s = await post<Session>("/api/public/auth/refresh", { refresh_token: current.refresh_token });
      setSession(s, "TOKEN_REFRESHED");
      return s;
    } catch (e) {
      const status = (e as { status?: number }).status;
      // Another tab may have rotated the token already.
      const stored = readStored();
      if (stored && stored.refresh_token !== current.refresh_token) {
        session = stored;
        scheduleRefresh();
        return stored;
      }
      if (status && status >= 400 && status < 500) setSession(null, "SIGNED_OUT");
      return session;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function currentSession(): Promise<Session | null> {
  if (!session) return null;
  if (session.expires_at * 1000 - Date.now() < 30_000) return doRefresh();
  return session;
}

if (isBrowser) {
  scheduleRefresh();
  window.addEventListener("storage", (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readStored();
    const had = !!session;
    session = next;
    scheduleRefresh();
    emit(next ? (had ? "TOKEN_REFRESHED" : "SIGNED_IN") : "SIGNED_OUT");
  });
}

const auth = {
  async getSession() {
    return { data: { session: await currentSession() }, error: null };
  },
  async getUser() {
    const s = await currentSession();
    if (!s) return { data: { user: null }, error: { message: "Auth session missing!", status: 400, name: "AuthSessionMissingError" } };
    try {
      const res = await fetch("/api/public/auth/user", { headers: { authorization: `Bearer ${s.access_token}` } });
      if (!res.ok) return { data: { user: null }, error: { message: `HTTP ${res.status}`, status: res.status, name: "AuthApiError" } };
      const { user } = (await res.json()) as { user: User };
      return { data: { user }, error: null };
    } catch (e) {
      return { data: { user: null }, error: { message: String(e), status: 0, name: "AuthRetryableFetchError" } };
    }
  },
  onAuthStateChange(cb: Listener) {
    listeners.add(cb);
    queueMicrotask(() => {
      void currentSession().then((s) => {
        if (listeners.has(cb)) cb("INITIAL_SESSION", s);
      });
    });
    return { data: { subscription: { id: String(Math.random()), unsubscribe: () => listeners.delete(cb) } } };
  },
  async verifyOtp(params: { token_hash: string; type?: string }) {
    try {
      const s = await post<Session>("/api/public/auth/verify", { token_hash: params.token_hash });
      setSession(s, "SIGNED_IN");
      return { data: { session: s, user: s.user }, error: null };
    } catch (e) {
      return { data: { session: null, user: null }, error: { message: (e as Error).message, status: (e as { status?: number }).status ?? 400, name: "AuthApiError" } };
    }
  },
  async refreshSession() {
    const s = await doRefresh();
    return { data: { session: s, user: s?.user ?? null }, error: null };
  },
  async signOut() {
    const s = session;
    setSession(null, "SIGNED_OUT");
    if (s) {
      try {
        await post("/api/public/auth/logout", { refresh_token: s.refresh_token });
      } catch {
        /* ignore */
      }
    }
    return { error: null };
  },
};

const storage = {
  from(bucket: string) {
    return {
      async upload(path: string, file: Blob, opts?: { upsert?: boolean; contentType?: string; cacheControl?: string }) {
        const s = await currentSession();
        const form = new FormData();
        form.set("bucket", bucket);
        form.set("path", path);
        form.set("upsert", opts?.upsert ? "true" : "false");
        if (opts?.contentType) form.set("contentType", opts.contentType);
        form.set("file", file);
        const res = await fetch("/api/public/storage-upload", {
          method: "POST",
          headers: s ? { authorization: `Bearer ${s.access_token}` } : {},
          body: form,
        });
        const json = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message: string } };
        if (!res.ok || json.error) {
          return { data: null, error: { message: json.error?.message ?? `HTTP ${res.status}`, statusCode: String(res.status) } };
        }
        return { data: json.data as { path: string; id: string; fullPath: string }, error: null };
      },
    };
  },
};

// ---- change notifications (replacement for Supabase Realtime) ----------

type Handler = { table: string; cb: (payload: unknown) => void };
type Channel = {
  name: string;
  handlers: Handler[];
  on: (event: string, filter: { table?: string }, cb: (payload: unknown) => void) => Channel;
  subscribe: (cb?: (status: string) => void) => Channel;
  unsubscribe: () => Promise<"ok">;
};

const channels = new Set<Channel>();
const lastVersions = new Map<string, string>();
let pollTimer: ReturnType<typeof setTimeout> | undefined;
const POLL_MS = 5_000;

async function poll() {
  pollTimer = undefined;
  const tables = [...new Set([...channels].flatMap((c) => c.handlers.map((h) => h.table)))];
  if (!tables.length) return;
  if (isBrowser && document.visibilityState === "visible") {
    try {
      const res = await fetch(`/api/public/realtime?tables=${encodeURIComponent(tables.join(","))}`);
      if (res.ok) {
        const versions = (await res.json()) as Record<string, string>;
        for (const [t, v] of Object.entries(versions)) {
          const prev = lastVersions.get(t);
          lastVersions.set(t, v);
          if (prev !== undefined && prev !== v) {
            for (const c of channels) for (const h of c.handlers) if (h.table === t) h.cb({ table: t, eventType: "*" });
          }
        }
      }
    } catch {
      /* offline – try again later */
    }
  }
  if (channels.size) pollTimer = setTimeout(poll, POLL_MS);
}

function channel(name: string): Channel {
  const ch: Channel = {
    name,
    handlers: [],
    on(_event, filter, cb) {
      if (filter?.table) ch.handlers.push({ table: filter.table, cb });
      return ch;
    },
    subscribe(cb) {
      if (!isBrowser) return ch;
      channels.add(ch);
      if (!pollTimer) pollTimer = setTimeout(poll, 0);
      cb?.("SUBSCRIBED");
      return ch;
    },
    async unsubscribe() {
      channels.delete(ch);
      return "ok";
    },
  };
  return ch;
}

// ---- table queries (executed server-side with the user's permissions) ---

function restQuery(table: string) {
  const calls: { m: string; a: unknown[] }[] = [];
  const builder: Record<string, unknown> = {};
  const methods = [
    "select", "insert", "upsert", "update", "delete", "eq", "neq", "gt", "gte", "lt", "lte", "like", "ilike",
    "is", "in", "contains", "overlaps", "match", "not", "filter", "or", "order", "limit", "range", "single",
    "maybeSingle",
  ];
  for (const m of methods) {
    builder[m] = (...a: unknown[]) => {
      calls.push({ m, a });
      return builder;
    };
  }
  builder.returns = () => builder;
  builder.abortSignal = () => builder;
  builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    (async () => {
      const s = await currentSession();
      const res = await fetch("/api/public/rest", {
        method: "POST",
        headers: { "content-type": "application/json", ...(s ? { authorization: `Bearer ${s.access_token}` } : {}) },
        body: JSON.stringify({ table, calls }),
      });
      return res.json();
    })().then(resolve, reject);
  return builder as any;
}

export const supabase = {
  auth,
  storage,
  channel,
  async removeChannel(ch: Channel) {
    channels.delete(ch);
    return "ok" as const;
  },
  from(table: string) {
    return restQuery(table);
  },
};
