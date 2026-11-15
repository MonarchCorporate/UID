import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { DiscordEmbed } from "@/lib/discord.server";

export type ApplicationFieldType = "text" | "textarea" | "select" | "boolean" | "number";

export type ApplicationField = {
  id: string;
  field_key: string;
  label: string;
  help: string | null;
  placeholder: string | null;
  field_type: ApplicationFieldType;
  required: boolean;
  options: string[];
  sort_order: number;
  active: boolean;
};

export type ApplicationSettings = {
  id: string;
  enabled: boolean;
  channel_id: string | null;
  channel_name: string | null;
  embed_title: string;
  embed_color: number;
  ping_role_id: string | null;
  intro_text: string;
  success_text: string;
};

export type ApplicationStatus = "open" | "accepted" | "rejected";

export type ApplicationRow = {
  id: string;
  user_id: string;
  discord_user_id: string | null;
  answers: Record<string, unknown>;
  status: ApplicationStatus;
  channel_id: string | null;
  message_id: string | null;
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
};

const DEFAULT_SETTINGS: Omit<ApplicationSettings, "id"> = {
  enabled: true,
  channel_id: null,
  channel_name: null,
  embed_title: "Neue Bewerbung",
  embed_color: 3447003,
  ping_role_id: null,
  intro_text: "",
  success_text: "Danke! Deine Bewerbung wurde übermittelt.",
};

export async function loadSettings(): Promise<ApplicationSettings> {
  const { data } = await supabaseAdmin
    .from("membership_application_settings")
    .select(
      "id, enabled, channel_id, channel_name, embed_title, embed_color, ping_role_id, intro_text, success_text",
    )
    .eq("singleton", true)
    .maybeSingle();
  if (data) return data as ApplicationSettings;
  const { data: created } = await supabaseAdmin
    .from("membership_application_settings")
    .insert({ singleton: true })
    .select(
      "id, enabled, channel_id, channel_name, embed_title, embed_color, ping_role_id, intro_text, success_text",
    )
    .single();
  return (created as ApplicationSettings) ?? { id: "", ...DEFAULT_SETTINGS };
}

export async function loadFields(onlyActive: boolean): Promise<ApplicationField[]> {
  let q = supabaseAdmin
    .from("membership_application_fields")
    .select(
      "id, field_key, label, help, placeholder, field_type, required, options, sort_order, active",
    )
    .order("sort_order")
    .order("created_at");
  if (onlyActive) q = q.eq("active", true);
  const { data } = await q;
  return ((data ?? []) as ApplicationField[]).map((f) => ({
    ...f,
    options: Array.isArray(f.options) ? (f.options as string[]) : [],
  }));
}

/** Validates raw answers against the configured fields and returns clean values. */
export function validateAnswers(
  fields: ApplicationField[],
  answers: Record<string, unknown>,
): Record<string, string> {
  const clean: Record<string, string> = {};
  for (const f of fields) {
    const raw = answers[f.field_key];
    let value = "";
    if (f.field_type === "boolean") {
      value = raw === true || raw === "true" ? "Ja" : "Nein";
      if (f.required && value !== "Ja") {
        throw new Error(`„${f.label}“ muss bestätigt werden.`);
      }
    } else {
      value = typeof raw === "string" ? raw.trim() : raw == null ? "" : String(raw).trim();
      if (f.required && !value) throw new Error(`„${f.label}“ ist ein Pflichtfeld.`);
      if (value.length > 1800) throw new Error(`„${f.label}“ ist zu lang (max. 1800 Zeichen).`);
      if (f.field_type === "number" && value && Number.isNaN(Number(value))) {
        throw new Error(`„${f.label}“ muss eine Zahl sein.`);
      }
      if (f.field_type === "select" && value && !f.options.includes(value)) {
        throw new Error(`„${f.label}“ enthält eine ungültige Auswahl.`);
      }
    }
    clean[f.field_key] = value;
  }
  return clean;
}

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  open: "Offen",
  accepted: "Angenommen",
  rejected: "Abgelehnt",
};

const STATUS_COLOR: Record<ApplicationStatus, number> = {
  open: 0,
  accepted: 0x2ecc71,
  rejected: 0xe74c3c,
};

export function buildApplicationEmbed(input: {
  settings: ApplicationSettings;
  fields: ApplicationField[];
  answers: Record<string, string>;
  applicant: { callsign: string | null; rsiHandle: string | null; discordUserId: string | null };
  status: ApplicationStatus;
  createdAt: string;
}): DiscordEmbed {
  const { settings, fields, answers, applicant, status } = input;
  const name =
    applicant.rsiHandle || applicant.callsign || "Unbekannter Bewerber";
  const lines: DiscordEmbed["fields"] = [
    {
      name: "Bewerber",
      value: applicant.discordUserId ? `<@${applicant.discordUserId}> (${name})` : name,
      inline: false,
    },
    { name: "Status", value: STATUS_LABEL[status], inline: true },
  ];
  for (const f of fields) {
    const v = answers[f.field_key];
    if (!v) continue;
    lines.push({ name: f.label.slice(0, 250), value: v.slice(0, 1000), inline: false });
  }
  return {
    title: settings.embed_title || "Neue Bewerbung",
    color: STATUS_COLOR[status] || settings.embed_color,
    fields: lines,
    timestamp: input.createdAt,
  };
}

export async function applicantInfo(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("callsign, display_name, rsi_handle, discord_user_id")
    .eq("id", userId)
    .maybeSingle();
  return {
    callsign: (data?.callsign as string | null) ?? (data?.display_name as string | null) ?? null,
    rsiHandle: (data?.rsi_handle as string | null) ?? null,
    discordUserId: (data?.discord_user_id as string | null) ?? null,
  };
}

/** True when the linked Discord account is a member of the guild. */
export async function isOnDiscord(discordUserId: string | null): Promise<{ onServer: boolean; error: string | null }> {
  if (!discordUserId) return { onServer: false, error: null };
  try {
    const { fetchMemberRoles } = await import("@/lib/discord.server");
    const roles = await fetchMemberRoles(discordUserId);
    return { onServer: roles !== null, error: null };
  } catch (err) {
    return { onServer: false, error: err instanceof Error ? err.message : String(err) };
  }
}
