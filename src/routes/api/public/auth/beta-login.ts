import { createFileRoute } from "@tanstack/react-router";
import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { createMagicToken, createUser } from "@/lib/db/auth.server";
import { getPool } from "@/lib/db/pool.server";

// Email/password login for beta testers. Only active when BETA_LOGIN=on
// (meant for beta.uid.sc until Discord OAuth is configured there).
// Registration additionally requires BETA_INVITE_CODE if it is set.
const enabled = () => process.env.BETA_LOGIN === "on";
const hits = new Map<string, { n: number; reset: number }>();
function limited(ip: string): boolean {
  const now = Date.now();
  const h = hits.get(ip);
  if (!h || h.reset < now) {
    hits.set(ip, { n: 1, reset: now + 15 * 60_000 });
    return false;
  }
  h.n += 1;
  return h.n > 20;
}

export const Route = createFileRoute("/api/public/auth/beta-login")({
  server: {
    handlers: {
      GET: async () => Response.json({ enabled: enabled(), invite: !!process.env.BETA_INVITE_CODE }),
      POST: async ({ request }) => {
        if (!enabled()) return Response.json({ error: "Nicht verfügbar" }, { status: 404 });
        const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
        if (limited(ip)) return Response.json({ error: "Zu viele Versuche – bitte später erneut" }, { status: 429 });
        const b = (await request.json().catch(() => ({}))) as Record<string, string>;
        const email = String(b.email ?? "").trim().toLowerCase();
        const password = String(b.password ?? "");
        if (!/^\S+@\S+\.\S+$/.test(email) || password.length < 10) {
          return Response.json({ error: "E-Mail und Passwort (mind. 10 Zeichen) angeben" }, { status: 400 });
        }
        const pool = getPool();
        let userId: string;
        if (b.mode === "register") {
          const invite = process.env.BETA_INVITE_CODE;
          if (invite && String(b.invite ?? "").trim() !== invite) return Response.json({ error: "Einladungscode falsch" }, { status: 403 });
          const name = String(b.name ?? "").trim().slice(0, 60) || email.split("@")[0];
          try {
            const u = await createUser({ email, password, email_confirm: true, user_metadata: { callsign: name, display_name: name } });
            userId = u.id;
          } catch (e) {
            console.error("[beta-login] register failed:", (e as Error).message);
            return Response.json({ error: (e as Error).message.includes("already") ? "E-Mail bereits registriert" : "Registrierung fehlgeschlagen" }, { status: 409 });
          }
          const admins = (process.env.BETA_ADMIN_EMAILS ?? "").toLowerCase().split(/[,\s]+/).filter(Boolean);
          if (admins.includes(email)) {
            await pool.query("INSERT IGNORE INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, 'admin', UTC_TIMESTAMP(6))", [randomUUID(), userId]);
          }
        } else {
          const [rows] = await pool.query<RowDataPacket[]>("SELECT id, encrypted_password FROM auth_users WHERE email = ?", [email]);
          const row = rows[0];
          if (!row?.encrypted_password || !(await bcrypt.compare(password, String(row.encrypted_password)))) {
            return Response.json({ error: "E-Mail oder Passwort falsch" }, { status: 401 });
          }
          userId = String(row.id);
        }
        return Response.json({ token_hash: await createMagicToken(userId) });
      },
    },
  },
});
