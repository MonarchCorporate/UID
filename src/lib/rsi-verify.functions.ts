import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  bioContainsCode,
  fetchRsiProfile,
  generateVerifyCode,
  parseRsiHandle,
  RsiNotFoundError,
  RsiUnavailableError,
} from "./rsi-verify.server";
import { logAudit } from "./audit.server";
import { scanAndAssignRsiOrgs, type RsiOrgScan } from "./rsi-orgs.server";

const CODE_TTL_MIN = 60;
const MAX_ATTEMPTS = 10;

type RsiState = {
  rsi_handle: string | null;
  rsi_verified_at: string | null;
  rsi_verify_code: string | null;
  rsi_verify_code_expires_at: string | null;
};

async function loadState(userId: string): Promise<RsiState> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("rsi_handle, rsi_verified_at")
    .eq("id", userId)
    .maybeSingle();
  const { data: codeRow } = await supabaseAdmin
    .from("rsi_verification_codes")
    .select("code, expires_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    rsi_handle: data?.rsi_handle ?? null,
    rsi_verified_at: data?.rsi_verified_at ?? null,
    rsi_verify_code: codeRow?.code ?? null,
    rsi_verify_code_expires_at: codeRow?.expires_at ?? null,
  };
}

export const getMyRsiStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const state = await loadState(context.userId);
    const expired =
      !state.rsi_verify_code_expires_at ||
      new Date(state.rsi_verify_code_expires_at).getTime() < Date.now();
    return {
      handle: state.rsi_handle,
      verifiedAt: state.rsi_verified_at,
      pendingCode: state.rsi_verified_at || expired ? null : state.rsi_verify_code,
      codeExpiresAt: state.rsi_verified_at ? null : state.rsi_verify_code_expires_at,
    };
  });

export const startRsiVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ handle: z.string().trim().min(1).max(200) }).parse(i))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const state = await loadState(userId);
    if (state.rsi_verified_at) {
      throw new Error(
        "Dein RSI-Account ist bereits verifiziert. Hebe zuerst die Verknüpfung auf.",
      );
    }
    const handle = parseRsiHandle(data.handle);
    if (!handle) {
      throw new Error(
        "Ungültiger Star-Citizen-Handle. Erlaubt sind 3–60 Zeichen (Buchstaben, Zahlen, _ und -).",
      );
    }

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("rsi_handle", handle)
      .not("rsi_verified_at", "is", null)
      .maybeSingle();
    if (taken && taken.id !== userId) {
      throw new Error("Dieser RSI-Handle ist bereits mit einem anderen Konto verknüpft.");
    }

    const code = generateVerifyCode();
    const expires = new Date(Date.now() + CODE_TTL_MIN * 60_000).toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        rsi_handle: handle,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    const { error: codeError } = await supabaseAdmin
      .from("rsi_verification_codes")
      .upsert(
        { user_id: userId, code, expires_at: expires, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (codeError) throw new Error(codeError.message);

    return { handle, code, expiresAt: expires };
  });

export const confirmRsiVerification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(
        "rsi_handle, rsi_verified_at, rsi_verify_attempts, rsi_verify_attempt_window",
      )
      .eq("id", userId)
      .maybeSingle();

    if (!profile) throw new Error("Profil nicht gefunden.");
    if (profile.rsi_verified_at) {
      return { ok: true, handle: profile.rsi_handle, verifiedAt: profile.rsi_verified_at };
    }
    const { data: codeRow } = await supabaseAdmin
      .from("rsi_verification_codes")
      .select("code, expires_at")
      .eq("user_id", userId)
      .maybeSingle();
    const handle = profile.rsi_handle;
    const code = codeRow?.code ?? null;
    if (!handle || !code) {
      throw new Error("Erzeuge zuerst einen Verifizierungscode.");
    }
    if (
      !codeRow?.expires_at ||
      new Date(codeRow.expires_at).getTime() < Date.now()
    ) {
      throw new Error("Der Code ist abgelaufen. Bitte erzeuge einen neuen Code.");
    }

    // Rate-Limit: max. MAX_ATTEMPTS Versuche pro Stunde
    const windowStart = profile.rsi_verify_attempt_window
      ? new Date(profile.rsi_verify_attempt_window).getTime()
      : 0;
    const freshWindow = Date.now() - windowStart > 60 * 60_000;
    const attempts = freshWindow ? 0 : (profile.rsi_verify_attempts ?? 0);
    if (attempts >= MAX_ATTEMPTS) {
      throw new Error("Zu viele Versuche. Bitte warte eine Stunde und versuche es erneut.");
    }
    await supabaseAdmin
      .from("profiles")
      .update({
        rsi_verify_attempts: attempts + 1,
        rsi_verify_attempt_window: freshWindow
          ? new Date().toISOString()
          : (profile.rsi_verify_attempt_window ?? new Date().toISOString()),
      })
      .eq("id", userId);

    let bio: string;
    let sids: string[] = [];
    try {
      const p = await fetchRsiProfile(handle);
      bio = p.bio;
      sids = p.sids;
    } catch (err) {
      if (err instanceof RsiNotFoundError || err instanceof RsiUnavailableError) {
        throw new Error(err.message);
      }
      throw new Error("RSI-Profil konnte nicht geprüft werden.");
    }

    if (!bioContainsCode(bio, code)) {
      throw new Error(
        `Der Code "${code}" wurde nicht in der Bio von "${handle}" gefunden. Trage ihn ein, speichere dein RSI-Profil und versuche es erneut.`,
      );
    }

    const { data: taken } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("rsi_handle", handle)
      .not("rsi_verified_at", "is", null)
      .maybeSingle();
    if (taken && taken.id !== userId) {
      throw new Error("Dieser RSI-Handle ist bereits mit einem anderen Konto verknüpft.");
    }

    const verifiedAt = new Date().toISOString();
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        rsi_verified_at: verifiedAt,
        rsi_verify_attempts: 0,
        rsi_verify_attempt_window: null,
        rsi_org_sids: sids,
        // Der RSI-Handle ist gleichzeitig das Callsign im Backoffice.
        callsign: handle,
        // ... und ebenso der Anzeigename – beides bleibt fest verknüpft.
        display_name: handle,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("rsi_verification_codes").delete().eq("user_id", userId);

    await logAudit({
      actorUserId: userId,
      action: "rsi.verified",
      entityType: "profile",
      entityId: userId,
      summary: `RSI-Account "${handle}" verifiziert`,
      metadata: { handle, sids },
    });

    let scan: RsiOrgScan = { found: [], assigned: [], unavailable: [], sids: [] };
    try {
      scan = await scanAndAssignRsiOrgs(userId, handle);
    } catch {
      /* Orga-Scan darf die Verifizierung nicht blockieren. */
    }

    try {
      const { applyRsiVerifiedDiscord } = await import("./rsi-discord.server");
      await applyRsiVerifiedDiscord(userId, handle);
    } catch {
      /* Discord-Aktionen dürfen die Verifizierung nicht blockieren. */
    }

    return {
      ok: true,
      handle,
      verifiedAt,
      sids: [...new Set([...sids, ...scan.sids])],
      orgs: scan.assigned,
      unavailable: scan.unavailable,
    };
  });

export const unlinkRsiAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const state = await loadState(userId);
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({
        rsi_handle: null,
        rsi_verified_at: null,
      })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("rsi_verification_codes").delete().eq("user_id", userId);
    await logAudit({
      actorUserId: userId,
      action: "rsi.unlinked",
      entityType: "profile",
      entityId: userId,
      summary: `RSI-Verknüpfung${state.rsi_handle ? ` "${state.rsi_handle}"` : ""} aufgehoben`,
    });
    return { ok: true };
  });
