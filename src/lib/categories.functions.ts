import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { userHasOrgPerm } from "./org-perms.server";

const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Farbe muss #RRGGBB sein");

export type MissionCategory = {
  id: string;
  org_id: string;
  name: string;
  color: string;
  sort_order: number;
};

async function getCurrentOrgId(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("orgs")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ org_id: z.string().uuid().optional() }).parse(i ?? {}))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships } = await supabaseAdmin
      .from("org_members")
      .select("org_id")
      .eq("user_id", context.userId);
    let orgIds = (memberships ?? []).map((m) => m.org_id as string);
    if (data.org_id) orgIds = orgIds.filter((id) => id === data.org_id);
    if (orgIds.length === 0) return { categories: [] as MissionCategory[] };
    const { data: rows, error } = await supabaseAdmin
      .from("mission_categories")
      .select("id, org_id, name, color, sort_order")
      .in("org_id", orgIds)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { categories: (rows ?? []) as MissionCategory[] };
  });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      org_id: z.string().uuid().optional(),
      name: z.string().trim().min(1).max(60),
      color: colorSchema,
      sort_order: z.number().int().min(0).max(999).optional().default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const orgId = data.org_id ?? (await getCurrentOrgId());
    if (!orgId) throw new Error("Keine Orga gefunden");
    await assertOrgOfficer(supabaseAdmin, orgId, context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("mission_categories")
      .insert({ org_id: orgId, name: data.name, color: data.color, sort_order: data.sort_order })
      .select("id, org_id, name, color, sort_order")
      .single();
    if (error || !row) throw new Error(error?.message || "Anlegen fehlgeschlagen");
    return row as MissionCategory;
  });

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(60),
      color: colorSchema,
      sort_order: z.number().int().min(0).max(999).optional().default(0),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("mission_categories")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) throw new Error("Kategorie nicht gefunden");
    await assertOrgOfficer(supabaseAdmin, existing.org_id as string, context.userId);
    const { error } = await supabaseAdmin
      .from("mission_categories")
      .update({ name: data.name, color: data.color, sort_order: data.sort_order })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("mission_categories")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!existing) return { ok: true };
    await assertOrgOfficer(supabaseAdmin, existing.org_id as string, context.userId);
    const { error } = await supabaseAdmin.from("mission_categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertOrgOfficer(admin: any, orgId: string, userId: string) {
  const ok = await userHasOrgPerm(admin, userId, orgId, "calendar.manage");
  if (!ok) throw new Error("Keine Berechtigung – benötigt 'Kalender & Kategorien verwalten'.");
}