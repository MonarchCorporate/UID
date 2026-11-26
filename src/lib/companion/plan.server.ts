// Session plan: what a player wants to get in this session.
import type { RowDataPacket } from "mysql2/promise";
import { q, q1, run, sqlDate } from "./db.server";
import { itemName } from "./names";

const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);
const int = (v: unknown, d: number) => (Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : d);

export async function planList(userId: string) {
  const rows = await q<RowDataPacket>("SELECT * FROM companion_plan WHERE user_id = ? ORDER BY done ASC, position ASC, id ASC", [userId]);
  return rows.map((r) => ({
    id: Number(r.id), title: String(r.title), item_name: r.item_name ? String(r.item_name) : null,
    quantity: Number(r.quantity), got: Number(r.got), location: r.location ? String(r.location) : null,
    notes: r.notes ? String(r.notes) : null, done: !!r.done, position: Number(r.position),
    display_name: r.item_name ? itemName(r.item_name) : String(r.title),
  }));
}

export async function planApply(userId: string, b: Record<string, unknown>) {
  const op = String(b.op ?? "add");
  const now = sqlDate();
  if (op === "add") {
    const title = clip(b.title || b.item_name, 150);
    if (!title) throw new Error("Was soll auf den Plan?");
    const pos = await q1<RowDataPacket>("SELECT COALESCE(MAX(position), 0) AS p FROM companion_plan WHERE user_id = ?", [userId]);
    await run(
      "INSERT INTO companion_plan (user_id, title, item_name, quantity, location, notes, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [userId, title, clip(b.item_name || title, 150), Math.max(1, int(b.quantity, 1)), clip(b.location, 150) || null, clip(b.notes, 300) || null, Number(pos?.p ?? 0) + 1, now],
    );
    return;
  }
  if (op === "clear_done") {
    await run("DELETE FROM companion_plan WHERE user_id = ? AND done = 1", [userId]);
    return;
  }
  const it = await q1<RowDataPacket>("SELECT * FROM companion_plan WHERE id = ? AND user_id = ?", [int(b.id, 0), userId]);
  if (!it) throw Object.assign(new Error("Eintrag nicht gefunden"), { status: 404 });
  switch (op) {
    case "toggle": {
      const done = !it.done;
      await run("UPDATE companion_plan SET done = ?, done_at = ?, got = ? WHERE id = ?", [done ? 1 : 0, done ? now : null, done ? Math.max(Number(it.got), Number(it.quantity)) : Math.min(Number(it.got), Number(it.quantity) - 1), it.id]);
      break;
    }
    case "up":
    case "down": {
      const other = await q1<RowDataPacket>(
        `SELECT * FROM companion_plan WHERE user_id = ? AND done = ? AND position ${op === "up" ? "<" : ">"} ? ORDER BY position ${op === "up" ? "DESC" : "ASC"} LIMIT 1`,
        [userId, it.done, it.position],
      );
      if (other) {
        await run("UPDATE companion_plan SET position = ? WHERE id = ?", [other.position, it.id]);
        await run("UPDATE companion_plan SET position = ? WHERE id = ?", [it.position, other.id]);
      }
      break;
    }
    case "delete":
      await run("DELETE FROM companion_plan WHERE id = ?", [it.id]);
      break;
    default:
      throw new Error("Unbekannte Aktion");
  }
}
