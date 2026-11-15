import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function getAdmin() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export function randomSlug(len = 10): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  let out = "";
  for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

export function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function verifyParticipant(
  missionId: string,
  token: string,
): Promise<{ participantId: string; missionId: string }> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from("mission_participants")
    .select("id, mission_id")
    .eq("mission_id", missionId)
    .eq("token", token)
    .maybeSingle();
  if (error || !data) throw new Error("Nicht autorisiert für diesen Einsatz");
  return { participantId: data.id, missionId: data.mission_id };
}