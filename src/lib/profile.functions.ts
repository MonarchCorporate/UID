import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { syncFleetyardsForUser, parseFleetyardsUsername } from "./fleetyards-sync.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: ships }] = await Promise.all([
      // Sensitive columns (fleetyards_*/discord ids) are not readable by the
      // `authenticated` role anymore; own profile is fetched server-side.
      supabaseAdmin.from("profiles").select("*").eq("id", userId).maybeSingle(),
      supabase.from("user_ships").select("*").order("created_at", { ascending: false }),
    ]);
    return { profile, ships: ships ?? [] };
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      callsign: z.string().min(1).max(40),
      display_name: z.string().max(80).optional().nullable(),
      status_text: z.string().max(140).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // Verifizierte User tragen zwingend ihren RSI-Handle als Callsign und
    // Anzeigename – Änderungen daran werden ignoriert.
    const { data: me } = await supabase
      .from("profiles")
      .select("rsi_handle, rsi_verified_at")
      .eq("id", userId)
      .maybeSingle();
    const locked =
      !!me?.rsi_verified_at && !!me?.rsi_handle ? (me.rsi_handle as string) : null;
    const { error } = await supabase
      .from("profiles")
      .update({
        callsign: locked ?? data.callsign,
        display_name: locked ?? data.display_name ?? null,
        ...(data.status_text !== undefined
          ? { status_text: data.status_text?.trim() || null }
          : {}),
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const AVATAR_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export const uploadMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        contentType: z.enum(["image/png", "image/jpeg", "image/webp", "image/gif"]),
        // base64 payload without data-url prefix
        base64: z.string().min(1).max(4_000_000),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const bytes = Buffer.from(data.base64, "base64");
    if (bytes.byteLength > 2 * 1024 * 1024) {
      throw new Error("Bild ist zu groß (max. 2 MB).");
    }
    const ext = AVATAR_EXT[data.contentType];
    const filename = `avatar-${Date.now()}.${ext}`;

    const { data: existing } = await supabaseAdmin.storage
      .from("avatars")
      .list(userId);

    const { error: upErr } = await supabaseAdmin.storage
      .from("avatars")
      .upload(`${userId}/${filename}`, bytes, {
        contentType: data.contentType,
        upsert: true,
      });
    if (upErr) throw new Error(upErr.message);

    const url = `/api/public/avatar/${userId}/${filename}`;
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: url })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    const stale = (existing ?? [])
      .map((f) => `${userId}/${f.name}`)
      .filter((p) => p !== `${userId}/${filename}`);
    if (stale.length) await supabaseAdmin.storage.from("avatars").remove(stale);

    return { ok: true, avatar_url: url };
  });

export const removeMyAvatar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: existing } = await supabaseAdmin.storage
      .from("avatars")
      .list(userId);
    if (existing?.length) {
      await supabaseAdmin.storage
        .from("avatars")
        .remove(existing.map((f) => `${userId}/${f.name}`));
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ avatar_url: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const addMyShip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      ship_slug: z.string().max(120).optional().nullable(),
      ship_name: z.string().min(1).max(120),
      manufacturer: z.string().max(120).optional().nullable(),
      custom_name: z.string().max(80).optional().nullable(),
      location: z.string().max(120).optional().nullable(),
      notes: z.string().max(500).optional().nullable(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_ships").insert({
      user_id: userId,
      ship_slug: data.ship_slug ?? null,
      ship_name: data.ship_name,
      manufacturer: data.manufacturer ?? null,
      custom_name: data.custom_name ?? null,
      location: data.location ?? null,
      notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMyShip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({
      id: z.string().uuid(),
      custom_name: z.string().max(80).nullable().optional(),
      location: z.string().max(120).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
    }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: {
      custom_name?: string | null;
      location?: string | null;
      notes?: string | null;
    } = {};
    if (data.custom_name !== undefined) patch.custom_name = data.custom_name;
    if (data.location !== undefined) patch.location = data.location;
    if (data.notes !== undefined) patch.notes = data.notes;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabase
      .from("user_ships")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMyShip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.from("user_ships").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setFleetyardsUsername = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z.object({ input: z.string().trim().max(200) }).parse(i),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const username = data.input ? parseFleetyardsUsername(data.input) : null;
    if (data.input && !username) {
      throw new Error("Ungültiger Fleetyards-Benutzername oder -Link");
    }
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        fleetyards_username: username,
        fleetyards_last_error: null,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);

    if (!username) {
      // user cleared the link → remove auto-imported ships
      await supabaseAdmin
        .from("user_ships")
        .delete()
        .eq("user_id", userId)
        .eq("source", "fleetyards");
      return { ok: true, synced: 0, username: null };
    }

    const result = await syncFleetyardsForUser(userId, username);
    return { ok: true, ...result, username };
  });

export const syncMyFleetyards = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("fleetyards_username")
      .eq("id", userId)
      .maybeSingle();
    const username = profile?.fleetyards_username;
    if (!username) throw new Error("Kein Fleetyards-Benutzer hinterlegt");
    const result = await syncFleetyardsForUser(userId, username);
    return { ok: true, ...result, username };
  });