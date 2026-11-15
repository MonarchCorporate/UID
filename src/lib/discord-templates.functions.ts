import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAppAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (!isAdmin) throw new Error("Nur App-Admins dürfen Discord-Vorlagen verwalten.");
  return supabaseAdmin;
}

export type TemplateChannel = {
  name: string;
  kind: "text" | "voice";
  visibility: "public" | "private";
};

export type CategoryTemplate = {
  id: string;
  name: string;
  description: string | null;
  source_category_name: string | null;
  channels: TemplateChannel[];
  created_at: string;
};

export type DiscordTemplateState = {
  error: string | null;
  templates: CategoryTemplate[];
  categories: { id: string; name: string }[];
  roles: { id: string; name: string; color: number }[];
  orgs: { id: string; name: string; tag: string | null }[];
};

const channelSchema = z.object({
  name: z.string().min(1).max(90),
  kind: z.enum(["text", "voice"]),
  visibility: z.enum(["public", "private"]).default("public"),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toChannels(raw: any): TemplateChannel[] {
  const parsed = z.array(channelSchema).safeParse(raw);
  return parsed.success ? parsed.data : [];
}

/** Everything the template admin panel needs. */
export const getDiscordTemplateState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DiscordTemplateState> => {
    const supabaseAdmin = await assertAppAdmin(context.userId);

    let categories: { id: string; name: string }[] = [];
    let roles: { id: string; name: string; color: number }[] = [];
    let error: string | null = null;
    try {
      const { fetchGuildCategories, fetchGuildRoles } = await import("@/lib/discord.server");
      const [cats, rs] = await Promise.all([fetchGuildCategories(), fetchGuildRoles()]);
      categories = cats.map((c) => ({ id: c.id, name: c.name }));
      roles = rs.map((r) => ({ id: r.id, name: r.name, color: r.color }));
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const [{ data: templates }, { data: orgs }] = await Promise.all([
      supabaseAdmin
        .from("discord_category_templates")
        .select("id, name, description, source_category_name, channels, created_at")
        .order("name"),
      supabaseAdmin.from("orgs").select("id, name, tag").order("name"),
    ]);

    return {
      error,
      categories,
      roles,
      orgs: orgs ?? [],
      templates: (templates ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        source_category_name: t.source_category_name,
        channels: toChannels(t.channels),
        created_at: t.created_at,
      })),
    };
  });

/** Saves a template — either copied from a live category or defined manually. */
export const saveDiscordCategoryTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(300).optional(),
        source_category_id: z.string().min(1).optional(),
        channels: z.array(channelSchema).max(50).optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);

    let channels: TemplateChannel[] = data.channels ?? [];
    let sourceName: string | null = null;

    if (data.source_category_id) {
      const { fetchGuildCategories, fetchCategoryChannels } = await import(
        "@/lib/discord.server"
      );
      const cats = await fetchGuildCategories();
      const cat = cats.find((c) => c.id === data.source_category_id);
      if (!cat) throw new Error("Kategorie wurde auf dem Discord nicht gefunden.");
      sourceName = cat.name;
      const live = await fetchCategoryChannels(cat.id);
      channels = live.map((c) => ({
        name: c.name,
        kind: c.type === 2 ? ("voice" as const) : ("text" as const),
        visibility: "public" as const,
      }));
    }

    if (channels.length === 0) {
      throw new Error("Die Vorlage enthält keine Channels.");
    }

    const { data: row, error } = await supabaseAdmin
      .from("discord_category_templates")
      .insert({
        name: data.name,
        description: data.description ?? null,
        source_category_id: data.source_category_id ?? null,
        source_category_name: sourceName,
        channels,
        created_by: context.userId,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { id: row.id, channels: channels.length };
  });

/** Updates the channel list / meta of an existing template. */
export const updateDiscordCategoryTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        description: z.string().trim().max(300).nullable().optional(),
        channels: z.array(channelSchema).min(1).max(50),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("discord_category_templates")
      .update({
        name: data.name,
        description: data.description ?? null,
        channels: data.channels,
      })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDiscordCategoryTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);
    await supabaseAdmin.from("discord_category_templates").delete().eq("id", data.id);
    return { ok: true };
  });

/**
 * Creates a new Discord category from a template: category + all channels,
 * optional role-based visibility and optional release to an org.
 */
export const applyDiscordCategoryTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((i) =>
    z
      .object({
        template_id: z.string().uuid(),
        category_name: z.string().trim().min(2).max(90),
        visibility: z.enum(["public", "private"]).default("public"),
        role_ids: z.array(z.string().min(1)).max(50).default([]),
        org_id: z.string().uuid().optional(),
      })
      .parse(i),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await assertAppAdmin(context.userId);

    const { data: tpl, error: tplErr } = await supabaseAdmin
      .from("discord_category_templates")
      .select("id, name, channels")
      .eq("id", data.template_id)
      .maybeSingle();
    if (tplErr) throw new Error(tplErr.message);
    if (!tpl) throw new Error("Vorlage nicht gefunden.");

    const channels = toChannels(tpl.channels);
    if (channels.length === 0) throw new Error("Die Vorlage enthält keine Channels.");
    if (data.visibility === "private" && data.role_ids.length === 0) {
      throw new Error("Für eine private Kategorie muss mindestens eine Rolle gewählt werden.");
    }

    const { createGuildCategory, createGuildChannel, applyChannelVisibility } = await import(
      "@/lib/discord.server"
    );

    const category = await createGuildCategory({
      name: data.category_name,
      visibility: data.visibility,
      roleIds: data.role_ids,
    });

    const created: { id: string; name: string; kind: "text" | "voice" }[] = [];
    for (const ch of channels) {
      const made = await createGuildChannel({
        name: ch.name,
        parentId: category.id,
        kind: ch.kind,
      });
      // Channels inherit the category rights; only explicitly private ones get overwrites.
      if (ch.visibility === "private" && data.role_ids.length > 0) {
        await applyChannelVisibility(made.id, "private", data.role_ids);
      }
      created.push({ id: made.id, name: made.name, kind: ch.kind });
    }

    if (data.org_id) {
      await supabaseAdmin
        .from("discord_org_categories")
        .delete()
        .eq("org_id", data.org_id)
        .eq("category_id", category.id);
      await supabaseAdmin.from("discord_org_categories").insert({
          org_id: data.org_id,
          category_id: category.id,
          category_name: category.name,
          can_create: true,
          can_rename: true,
          can_delete: false,
          max_channels: Math.max(10, created.length + 5),
      });
      await supabaseAdmin.from("discord_managed_channels").insert(
        created.map((c) => ({
          org_id: data.org_id!,
          category_id: category.id,
          channel_id: c.id,
          channel_name: c.name,
          kind: c.kind,
          visibility: data.visibility,
          visible_role_ids: data.visibility === "private" ? data.role_ids : [],
          created_by: context.userId,
        })),
      );
    }

    return { category_id: category.id, channels: created.length };
  });
