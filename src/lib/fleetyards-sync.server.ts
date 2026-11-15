import { supabaseAdmin } from "@/integrations/supabase/client.server";

const BASE = "https://api.fleetyards.net/v1";

type ApiItem = {
  model?: {
    name?: string;
    slug?: string;
    manufacturer?: { name?: string | null; code?: string | null } | null;
  };
  name?: string | null; // custom name
};

/**
 * Accepts a raw username or a Fleetyards URL like
 * https://fleetyards.net/hangar/<user> or .../users/<user>
 * and returns the lowercased username, or null if it can't be parsed.
 */
export function parseFleetyardsUsername(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  let candidate = trimmed;
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const url = new URL(trimmed);
      const parts = url.pathname.split("/").filter(Boolean);
      // patterns: /hangar/<user>, /users/<user>, /<user>
      const idx = parts.findIndex((p) => p === "hangar" || p === "users");
      candidate = idx >= 0 ? parts[idx + 1] ?? "" : parts[parts.length - 1] ?? "";
    }
  } catch {
    // fall through, treat as raw
  }
  candidate = candidate.replace(/^@/, "").split(/[?#/]/)[0];
  if (!/^[a-zA-Z0-9_.-]{1,64}$/.test(candidate)) return null;
  return candidate.toLowerCase();
}

async function fetchAllVehicles(username: string) {
  const perPage = 100;
  const items: ApiItem[] = [];
  for (let page = 1; page <= 20; page++) {
    const res = await fetch(
      `${BASE}/public/hangars/${encodeURIComponent(username)}?perPage=${perPage}&page=${page}`,
      { headers: { accept: "application/json" } },
    );
    if (res.status === 404) {
      throw new Error(
        "Fleetyards-Hangar nicht gefunden oder nicht öffentlich. Stelle deinen Hangar auf öffentlich.",
      );
    }
    if (!res.ok) {
      throw new Error(`Fleetyards API ${res.status}`);
    }
    const payload = (await res.json()) as ApiItem[] | { items?: ApiItem[] };
    const batch: ApiItem[] = Array.isArray(payload)
      ? payload
      : Array.isArray(payload.items)
        ? payload.items
        : [];
    if (batch.length === 0) break;
    items.push(...batch);
    if (batch.length < perPage) break;
  }
  return items;
}

export async function syncFleetyardsForUser(userId: string, username: string) {
  try {
    const items = await fetchAllVehicles(username);
    const rows = items
      .map((it) => {
        const m = it.model;
        if (!m?.name) return null;
        return {
          user_id: userId,
          ship_slug: m.slug ?? null,
          ship_name: m.name,
          manufacturer: m.manufacturer?.name ?? null,
          custom_name: it.name && it.name.trim() ? it.name.trim().slice(0, 80) : null,
          source: "fleetyards" as const,
        };
      })
      .filter((r): r is NonNullable<typeof r> => !!r);

    // Replace existing fleetyards-imported ships for this user
    const { error: delErr } = await supabaseAdmin
      .from("user_ships")
      .delete()
      .eq("user_id", userId)
      .eq("source", "fleetyards");
    if (delErr) throw new Error(delErr.message);

    if (rows.length > 0) {
      const { error: insErr } = await supabaseAdmin.from("user_ships").insert(rows);
      if (insErr) throw new Error(insErr.message);
    }

    await supabaseAdmin
      .from("profiles")
      .update({
        fleetyards_last_sync: new Date().toISOString(),
        fleetyards_last_error: null,
      })
      .eq("id", userId);

    return { synced: rows.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await supabaseAdmin
      .from("profiles")
      .update({
        fleetyards_last_sync: new Date().toISOString(),
        fleetyards_last_error: message,
      })
      .eq("id", userId);
    throw new Error(message);
  }
}

export async function syncAllFleetyards() {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id, fleetyards_username")
    .not("fleetyards_username", "is", null);
  if (error) throw new Error(error.message);

  let ok = 0;
  let failed = 0;
  for (const row of data ?? []) {
    const username = row.fleetyards_username as string | null;
    if (!username) continue;
    try {
      await syncFleetyardsForUser(row.id as string, username);
      ok++;
    } catch {
      failed++;
    }
  }
  return { processed: (data ?? []).length, ok, failed };
}