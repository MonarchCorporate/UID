// File storage (replaces Supabase Storage). Objects live in the MySQL table
// `storage_objects`; access rules mirror the former storage policies.
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import process from "node:process";
import type { RowDataPacket } from "mysql2/promise";
import { getPool } from "./pool.server";
import type { DbRole } from "./types";
import { fromDbTimestamp } from "./values";

type Op = "read" | "insert" | "update" | "delete";
type StorageError = { message: string; statusCode: string; name: string };

const err = (message: string, statusCode = "400"): StorageError => ({ message, statusCode, name: "StorageApiError" });

/** Mirrors the storage.objects RLS policies of the old Supabase project. */
async function allowed(role: DbRole, bucket: string, op: Op, name: string): Promise<boolean> {
  if (role.kind === "service") return true;
  const uid = role.kind === "user" ? role.userId : null;
  const isAdmin = async () => {
    if (!uid) return false;
    const [r] = await getPool().query<RowDataPacket[]>(
      "SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1",
      [uid],
    );
    return r.length > 0;
  };
  const firstFolder = name.split("/")[0];
  switch (bucket) {
    case "org-branding":
      if (op === "read") return true;
      return isAdmin();
    case "ship-images":
      if (op === "read") return !!uid;
      return isAdmin();
    case "marketplace-images": {
      if (!uid) return false;
      if (op === "insert" || op === "delete") return firstFolder === uid;
      if (op === "update") return false;
      if (firstFolder === uid || (await isAdmin())) return true;
      const [r] = await getPool().query<RowDataPacket[]>(
        `SELECT 1 FROM marketplace_listings l
          WHERE (JSON_CONTAINS(l.image_urls, JSON_QUOTE(?)) OR l.image_urls LIKE ?)
            AND (l.created_by = ? OR l.scope = 'allianz' OR l.org_id IS NULL
                 OR EXISTS (SELECT 1 FROM org_members m WHERE m.org_id = l.org_id AND m.user_id = ?))
          LIMIT 1`,
        [name, `%${name.replace(/[%_]/g, (c) => "\\" + c)}"%`, uid, uid],
      );
      return r.length > 0;
    }
    default:
      return false; // e.g. avatars: service role only
  }
}

async function toBuffer(body: unknown): Promise<Buffer> {
  if (Buffer.isBuffer(body)) return body;
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (body instanceof ArrayBuffer) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body, "utf8");
  if (body && typeof (body as Blob).arrayBuffer === "function") {
    return Buffer.from(await (body as Blob).arrayBuffer());
  }
  throw new Error("Unsupported upload body");
}

function signingKey() {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s) throw new Error("AUTH_JWT_SECRET is not configured");
  return "storage:" + s;
}

export function signStoragePath(bucket: string, path: string, expiresAt: number): string {
  return createHmac("sha256", signingKey()).update(`${bucket}\n${path}\n${expiresAt}`).digest("hex");
}

export function verifyStorageSignature(bucket: string, path: string, expiresAt: number, sig: string): boolean {
  if (!Number.isFinite(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return false;
  const expected = Buffer.from(signStoragePath(bucket, path, expiresAt), "hex");
  const given = Buffer.from(sig, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function readObject(bucket: string, path: string) {
  const [rows] = await getPool().query<RowDataPacket[]>(
    "SELECT content, content_type, cache_control, updated_at FROM storage_objects WHERE bucket_id = ? AND name = ?",
    [bucket, path],
  );
  return rows[0] as { content: Buffer; content_type: string | null; cache_control: string | null; updated_at: string } | undefined;
}

export function storageBucket(role: DbRole, bucket: string) {
  return {
    async upload(
      path: string,
      body: unknown,
      opts?: { contentType?: string; upsert?: boolean; cacheControl?: string },
    ) {
      try {
        const name = path.replace(/^\/+/, "");
        const [ex] = await getPool().query<RowDataPacket[]>(
          "SELECT id FROM storage_objects WHERE bucket_id = ? AND name = ?",
          [bucket, name],
        );
        if (ex.length && !opts?.upsert) return { data: null, error: err("The resource already exists", "409") };
        if (!(await allowed(role, bucket, ex.length ? "update" : "insert", name))) {
          return { data: null, error: err("new row violates row-level security policy", "403") };
        }
        const buf = await toBuffer(body);
        const contentType =
          opts?.contentType ?? ((body as Blob)?.type || "application/octet-stream");
        const id = ex[0]?.id ?? randomUUID();
        await getPool().query(
          `INSERT INTO storage_objects (id, bucket_id, name, owner, content_type, size, cache_control, content, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(6), UTC_TIMESTAMP(6))
           ON DUPLICATE KEY UPDATE content = VALUES(content), content_type = VALUES(content_type),
             size = VALUES(size), cache_control = VALUES(cache_control), updated_at = UTC_TIMESTAMP(6)`,
          [id, bucket, name, role.kind === "user" ? role.userId : null, contentType, buf.length, opts?.cacheControl ?? null, buf],
        );
        return { data: { id, path: name, fullPath: `${bucket}/${name}` }, error: null };
      } catch (e) {
        return { data: null, error: err(e instanceof Error ? e.message : String(e), "500") };
      }
    },

    async download(path: string) {
      const name = path.replace(/^\/+/, "");
      if (!(await allowed(role, bucket, "read", name))) return { data: null, error: err("Object not found", "404") };
      const obj = await readObject(bucket, name);
      if (!obj) return { data: null, error: err("Object not found", "404") };
      const blob = new Blob([new Uint8Array(obj.content)], { type: obj.content_type ?? "application/octet-stream" });
      return { data: blob, error: null };
    },

    async remove(paths: string[]) {
      const removed: unknown[] = [];
      for (const p of paths) {
        const name = p.replace(/^\/+/, "");
        if (!(await allowed(role, bucket, "delete", name))) continue;
        const [rows] = await getPool().query<RowDataPacket[]>(
          "SELECT id, name, created_at, updated_at, size, content_type FROM storage_objects WHERE bucket_id = ? AND name = ?",
          [bucket, name],
        );
        if (!rows.length) continue;
        await getPool().query("DELETE FROM storage_objects WHERE id = ?", [rows[0].id]);
        removed.push({ ...rows[0], bucket_id: bucket });
      }
      return { data: removed, error: null };
    },

    async list(prefix = "", opts?: { limit?: number; offset?: number; search?: string }) {
      const folder = prefix.replace(/^\/+|\/+$/g, "");
      const like = folder ? `${folder.replace(/[%_\\]/g, (c) => "\\" + c)}/%` : "%";
      const [rows] = await getPool().query<RowDataPacket[]>(
        "SELECT id, name, size, content_type, created_at, updated_at FROM storage_objects WHERE bucket_id = ? AND name LIKE ? ORDER BY name",
        [bucket, like],
      );
      const seen = new Set<string>();
      const out: unknown[] = [];
      for (const r of rows) {
        const rest = folder ? String(r.name).slice(folder.length + 1) : String(r.name);
        if (!(await allowed(role, bucket, "read", r.name))) continue;
        const slash = rest.indexOf("/");
        if (slash >= 0) {
          const dir = rest.slice(0, slash);
          if (!seen.has(dir)) {
            seen.add(dir);
            out.push({ name: dir, id: null, updated_at: null, created_at: null, last_accessed_at: null, metadata: null });
          }
          continue;
        }
        if (opts?.search && !rest.toLowerCase().includes(opts.search.toLowerCase())) continue;
        out.push({
          name: rest,
          id: r.id,
          created_at: fromDbTimestamp(r.created_at),
          updated_at: fromDbTimestamp(r.updated_at),
          last_accessed_at: fromDbTimestamp(r.updated_at),
          metadata: { size: Number(r.size), mimetype: r.content_type },
        });
      }
      const offset = opts?.offset ?? 0;
      return { data: out.slice(offset, offset + (opts?.limit ?? 100)), error: null };
    },

    async createSignedUrl(path: string, expiresIn: number) {
      const name = path.replace(/^\/+/, "");
      if (!(await allowed(role, bucket, "read", name))) return { data: null, error: err("Object not found", "404") };
      const exp = Math.floor(Date.now() / 1000) + Math.max(1, Math.floor(expiresIn));
      const sig = signStoragePath(bucket, name, exp);
      const signedUrl = `/api/public/storage/${encodeURIComponent(bucket)}/${name.split("/").map(encodeURIComponent).join("/")}?exp=${exp}&sig=${sig}`;
      return { data: { signedUrl, path: name }, error: null };
    },

    async createSignedUrls(paths: string[], expiresIn: number) {
      const data = [];
      for (const p of paths) {
        const r = await this.createSignedUrl(p, expiresIn);
        data.push({ path: p, signedUrl: r.data?.signedUrl ?? null, error: r.error?.message ?? null });
      }
      return { data, error: null };
    },

    getPublicUrl(path: string) {
      const name = path.replace(/^\/+/, "");
      return {
        data: {
          publicUrl: `/api/public/storage/${encodeURIComponent(bucket)}/${name.split("/").map(encodeURIComponent).join("/")}`,
        },
      };
    },
  };
}
