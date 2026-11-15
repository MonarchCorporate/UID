import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { ORG_PERM_KEYS, mergePerms, rolePresetPerms, type OrgPerm } from "@/lib/org-perms";
import { pageSchema, type OrgPage } from "@/lib/page-blocks";

export type OrgRole = "member" | "quartermaster" | "treasurer" | "officer" | "owner";

export type OrgSummary = {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  owner_id: string;
  branding: OrgBranding;
  my_role: OrgRole;
  my_permissions: OrgPerm[];
  my_custom_role_id: string | null;
  member_count: number;
  created_at: string;
};

export type OrgMember = {
  user_id: string;
  role: OrgRole;
  joined_at: string;
  callsign: string | null;
  display_name: string | null;
  permissions: OrgPerm[];
  custom_role_id: string | null;
  custom_role_name: string | null;
  custom_role_color: string | null;
};

export type OrgCustomRole = {
  id: string;
  org_id: string;
  name: string;
  color: string | null;
  permissions: OrgPerm[];
  created_at: string;
  updated_at: string;
};

export type OrgBranding = {
  primary?: string;
  accent?: string;
  logo_url?: string | null;
  show_logo?: boolean;
  hero_title?: string;
  hero_subtitle?: string;
  hero_image_url?: string | null;
  hero_cta_label?: string;
  hero_cta_url?: string;
  about_title?: string;
  about_md?: string;
  highlights?: { title: string; text: string }[];
  sections?: Partial<
    Record<
      "fleet" | "calendar" | "shop",
      {
        enabled?: boolean;
        tag?: string;
        title?: string;
        subtitle?: string;
        cta?: string;
      }
    >
  >;
  section_order?: ("fleet" | "calendar" | "shop")[];
  discord_url?: string;
  rsi_url?: string;
  website_url?: string;
  footer_note?: string;
  show_fleet?: boolean;
  show_calendar?: boolean;
  show_shop?: boolean;
  /** Sichtbar in der öffentlichen Orga-Übersicht (Default: true). */
  show_in_overview?: boolean;
  /** Block-basierte Landingpage aus dem Page-Builder (v2). */
  page?: OrgPage;
};

export type AdminOrgSummary = {
  id: string;
  slug: string;
  name: string;
  tag: string | null;
  rsi_sid: string | null;
  owner_id: string;
  owner_callsign: string | null;
  is_active: boolean;
  member_count: number;
  branding: OrgBranding;
  created_at: string;
};

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(32)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "Nur Kleinbuchstaben, Zahlen und -");

const brandingSchema = z
  .object({
    primary: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    accent: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    logo_url: z
      .string()
      .max(500)
      .refine((v) => v.startsWith("/") || /^https?:\/\//.test(v), "URL oder Pfad erwartet")
      .nullable()
      .optional(),
    show_logo: z.boolean().optional(),
    hero_title: z.string().max(120).optional(),
    hero_subtitle: z.string().max(240).optional(),
    hero_image_url: z
      .string()
      .max(500)
      .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Nur https-URLs")
      .nullable()
      .optional(),
    hero_cta_label: z.string().max(40).optional(),
    hero_cta_url: z
      .string()
      .max(500)
      .refine((v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v), "Nur https-URLs")
      .optional(),
    about_title: z.string().max(80).optional(),
    about_md: z.string().max(4000).optional(),
    highlights: z
      .array(
        z.object({
          title: z.string().max(60).default(""),
          text: z.string().max(300).default(""),
        }),
      )
      .max(6)
      .optional(),
    sections: z
      .record(
        z.enum(["fleet", "calendar", "shop"]),
        z
          .object({
            enabled: z.boolean().optional(),
            tag: z.string().max(30).optional(),
            title: z.string().max(80).optional(),
            subtitle: z.string().max(240).optional(),
            cta: z.string().max(40).optional(),
          })
          .strict(),
      )
      .optional(),
    section_order: z
      .array(z.enum(["fleet", "calendar", "shop"]))
      .max(3)
      .optional(),
    discord_url: z
      .string()
      .max(300)
      .refine((v) => v === "" || /^https:\/\//.test(v), "Nur https-URLs")
      .optional(),
    rsi_url: z
      .string()
      .max(300)
      .refine((v) => v === "" || /^https:\/\//.test(v), "Nur https-URLs")
      .optional(),
    website_url: z
      .string()
      .max(300)
      .refine((v) => v === "" || /^https:\/\//.test(v), "Nur https-URLs")
      .optional(),
    footer_note: z.string().max(200).optional(),
    show_fleet: z.boolean().optional(),
    show_calendar: z.boolean().optional(),
    show_shop: z.boolean().optional(),
    show_in_overview: z.boolean().optional(),
    page: pageSchema.optional(),
  })
  .strict();

/** Lists every org the current user is a member of. */
export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: memberships, error } = await supabaseAdmin
      .from("org_members")
      .select(
        "org_id, role, permissions, custom_role_id, org_custom_roles:custom_role_id(permissions), orgs:org_id(id, slug, name, tag, owner_id, branding, created_at)",
      )
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    const orgIds = (memberships ?? []).map((m) => m.org_id as string);
    if (orgIds.length === 0) return { orgs: [] as OrgSummary[] };
    const { data: counts } = await supabaseAdmin
      .from("org_members")
      .select("org_id")
      .in("org_id", orgIds);
    const countMap = new Map<string, number>();
    for (const c of counts ?? []) {
      const k = c.org_id as string;
      countMap.set(k, (countMap.get(k) ?? 0) + 1);
    }
    const orgs: OrgSummary[] = (memberships ?? [])
      .map((m) => {
        const o = m.orgs as {
          id: string;
          slug: string;
          name: string;
          tag: string | null;
          owner_id: string;
          branding: OrgBranding | null;
          created_at: string;
        } | null;
        if (!o) return null;
        const customPerms =
          (m.org_custom_roles as { permissions: string[] } | null)?.permissions ?? [];
        return {
          id: o.id,
          slug: o.slug,
          name: o.name,
          tag: o.tag,
          owner_id: o.owner_id,
          branding: (o.branding ?? {}) as OrgBranding,
          my_role: m.role as OrgRole,
          my_permissions: mergePerms(m.permissions as string[] | null, customPerms),
          my_custom_role_id: (m.custom_role_id as string | null) ?? null,
          member_count: countMap.get(o.id) ?? 1,
          created_at: o.created_at,
        };
      })
      .filter((x): x is OrgSummary => !!x)
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    return { orgs };
  });

/** Creates a new org with the current user as owner. */
export const createOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        slug: slugSchema,
        name: z.string().trim().min(2).max(80),
        tag: z.string().trim().max(10).optional().nullable(),
        rsi_sid: z.string().trim().max(20).optional().nullable(),
        owner_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Nur App-Admins dürfen Orgas anlegen.");
    const ownerId = data.owner_id ?? context.userId;
    const { data: row, error } = await supabaseAdmin
      .from("orgs")
      .insert({
        slug: data.slug,
        name: data.name,
        tag: data.tag ?? null,
        rsi_sid: data.rsi_sid ? data.rsi_sid.toUpperCase() : null,
        owner_id: ownerId,
      })
      .select("id, slug")
      .single();
    if (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error(`Slug "${data.slug}" ist bereits vergeben.`);
      throw new Error(error.message);
    }
    // Owner-Mitgliedschaft anlegen (Trigger orgs_handle_new sollte das schon tun,
    // wir stellen ON CONFLICT DO NOTHING sicher).
    await supabaseAdmin
      .from("org_members")
      .upsert(
        { org_id: row.id as string, user_id: ownerId, role: "owner" },
        { onConflict: "org_id,user_id" },
      );
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: row.id as string,
      action: "org.created",
      entityType: "org",
      entityId: row.id as string,
      summary: `Orga "${data.name}" (${data.slug}) angelegt`,
    });
    return { id: row.id as string, slug: row.slug as string };
  });

/** App-Admin: lists ALL orgs in the system with basic stats. */
export const listAllOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    let query = supabaseAdmin
      .from("orgs")
      .select("id, slug, name, tag, rsi_sid, owner_id, is_active, branding, created_at")
      .order("created_at", { ascending: true });
    if (!isAdmin) {
      // Nicht-Admin: nur Orgas, in denen ich Owner oder Officer bin.
      const { data: mem } = await supabaseAdmin
        .from("org_members")
        .select("org_id")
        .eq("user_id", context.userId)
        .in("role", ["owner", "officer"]);
      const ids = (mem ?? []).map((m) => m.org_id as string);
      if (ids.length === 0) return { orgs: [] as AdminOrgSummary[] };
      query = query.in("id", ids);
    }
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const orgIds = (rows ?? []).map((r) => r.id as string);
    const ownerIds = Array.from(new Set((rows ?? []).map((r) => r.owner_id as string)));
    const [{ data: counts }, { data: owners }] = await Promise.all([
      supabaseAdmin.from("org_members").select("org_id").in("org_id", orgIds),
      supabaseAdmin.from("profiles").select("id, callsign").in("id", ownerIds),
    ]);
    const countMap = new Map<string, number>();
    for (const c of counts ?? []) {
      const k = c.org_id as string;
      countMap.set(k, (countMap.get(k) ?? 0) + 1);
    }
    const ownerMap = new Map<string, string | null>();
    for (const o of owners ?? [])
      ownerMap.set(o.id as string, (o.callsign as string | null) ?? null);
    const orgs: AdminOrgSummary[] = (rows ?? []).map((r) => ({
      id: r.id as string,
      slug: r.slug as string,
      name: r.name as string,
      tag: (r.tag as string | null) ?? null,
      rsi_sid: (r.rsi_sid as string | null) ?? null,
      owner_id: r.owner_id as string,
      owner_callsign: ownerMap.get(r.owner_id as string) ?? null,
      is_active: (r.is_active as boolean) ?? true,
      member_count: countMap.get(r.id as string) ?? 0,
      branding: (r.branding as OrgBranding | null) ?? {},
      created_at: r.created_at as string,
    }));
    return { orgs };
  });

/** App-Admin: update slug / name / tag / active / branding of any org. */
export const adminUpdateOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        slug: slugSchema.optional(),
        name: z.string().trim().min(2).max(80).optional(),
        tag: z.string().trim().max(10).nullable().optional(),
        rsi_sid: z.string().trim().max(20).nullable().optional(),
        is_active: z.boolean().optional(),
        branding: brandingSchema.optional(),
        owner_id: z.string().uuid().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) {
      // Owner / Officer der Ziel-Orga dürfen Name/Tag/Branding pflegen,
      // aber weder Slug, Aktiv-Flag noch Owner ändern.
      const { data: mem } = await supabaseAdmin
        .from("org_members")
        .select("role")
        .eq("org_id", data.id)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (mem?.role as string | null) ?? null;
      if (role !== "owner" && role !== "officer") {
        throw new Error("Keine Berechtigung für diese Orga.");
      }
      if (data.slug !== undefined || data.is_active !== undefined || data.owner_id !== undefined) {
        throw new Error("Slug, Aktiv-Flag und Owner-Wechsel sind App-Admins vorbehalten.");
      }
    }
    type OrgPatch = {
      slug?: string;
      name?: string;
      tag?: string | null;
      rsi_sid?: string | null;
      is_active?: boolean;
      branding?: OrgBranding;
      owner_id?: string;
    };
    const patch: OrgPatch = {};
    if (data.slug !== undefined) patch.slug = data.slug;
    if (data.name !== undefined) patch.name = data.name;
    if (data.tag !== undefined) patch.tag = data.tag ? data.tag.toUpperCase() : null;
    if (data.rsi_sid !== undefined)
      patch.rsi_sid = data.rsi_sid ? data.rsi_sid.toUpperCase() : null;
    if (data.is_active !== undefined) patch.is_active = data.is_active;
    if (data.branding !== undefined) {
      // merge in current branding to avoid wiping fields
      const { data: cur } = await supabaseAdmin
        .from("orgs")
        .select("branding")
        .eq("id", data.id)
        .maybeSingle();
      const merged = {
        ...((cur?.branding as OrgBranding | null) ?? {}),
        ...data.branding,
      };
      patch.branding = merged;
    }
    if (data.owner_id !== undefined) {
      patch.owner_id = data.owner_id;
      // stelle sicher, dass neuer Owner Mitglied und als owner geflaggt ist
      await supabaseAdmin
        .from("org_members")
        .upsert(
          { org_id: data.id, user_id: data.owner_id, role: "owner" },
          { onConflict: "org_id,user_id" },
        );
    }
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin.from("orgs").update(patch).eq("id", data.id);
    if (error) {
      if ((error as { code?: string }).code === "23505")
        throw new Error(`Slug "${patch.slug}" ist bereits vergeben.`);
      throw new Error(error.message);
    }
    return { ok: true };
  });

/** Checks whether a slug is free (format valid + not taken). */
export const checkOrgSlugAvailable = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ slug: z.string(), excludeOrgId: z.string().uuid().optional() }).parse(input),
  )
  .handler(async ({ data }) => {
    const parsed = slugSchema.safeParse(data.slug);
    if (!parsed.success) {
      return { available: false, reason: "invalid" as const };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("orgs").select("id").eq("slug", parsed.data).limit(1);
    if (data.excludeOrgId) q = q.neq("id", data.excludeOrgId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return {
      available: (rows?.length ?? 0) === 0,
      reason: (rows?.length ?? 0) === 0 ? null : ("taken" as const),
    };
  });

/** Public/authenticated: resolve org by slug (returns branding + membership info). */
export const getOrgBySlug = createServerFn({ method: "GET" })
  .inputValidator((input) => z.object({ slug: slugSchema }).parse(input))
  .handler(async ({ data }) => {
    const { createClient } = await import("@supabase/supabase-js");
    const url = process.env.SUPABASE_URL!;
    const key = process.env.SUPABASE_PUBLISHABLE_KEY!;
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const h = new Headers(init?.headers);
          if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`)
            h.delete("Authorization");
          h.set("apikey", key);
          return fetch(input, { ...init, headers: h });
        },
      },
    });
    const { data: row, error } = await client
      .from("orgs")
      .select("id, slug, name, tag, branding, is_active")
      .eq("slug", data.slug)
      .eq("is_active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { org: null };
    return {
      org: {
        id: row.id as string,
        slug: row.slug as string,
        name: row.name as string,
        tag: (row.tag as string | null) ?? null,
        branding: (row.branding as OrgBranding | null) ?? {},
      },
    };
  });

/**
 * Landingpage/Branding einer Orga speichern.
 * Zugriff: App-Admin, Owner der Orga oder Mitglied mit `branding.manage`.
 */
export const updateOrgBranding = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ org_id: z.string().uuid(), branding: brandingSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed } = await supabaseAdmin.rpc("has_org_perm", {
      _user: context.userId,
      _org: data.org_id,
      _perm: "branding.manage",
    });
    if (!allowed) {
      const { data: mem } = await supabaseAdmin
        .from("org_members")
        .select("role")
        .eq("org_id", data.org_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (mem?.role as string | null) ?? null;
      if (role !== "owner" && role !== "officer") {
        throw new Error("Keine Berechtigung für diese Orga.");
      }
    }

    const { data: cur } = await supabaseAdmin
      .from("orgs")
      .select("branding")
      .eq("id", data.org_id)
      .maybeSingle();
    const merged: OrgBranding = {
      ...((cur?.branding as OrgBranding | null) ?? {}),
      ...data.branding,
    };
    const { error } = await supabaseAdmin
      .from("orgs")
      .update({ branding: merged })
      .eq("id", data.org_id);
    if (error) throw new Error(error.message);
    return { ok: true, branding: merged };
  });

/** Upload a logo image for an org into the private `org-branding`
 *  bucket and update branding.logo_url to the public read-through route. */
export const uploadOrgLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        filename: z.string().trim().min(1).max(120),
        content_type: z
          .string()
          .regex(/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i, "Nur Bilddateien"),
        // base64 (without data: prefix), <= ~5 MB after decode
        data_base64: z.string().min(4).max(8_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed } = await supabaseAdmin.rpc("has_org_perm", {
      _user: context.userId,
      _org: data.org_id,
      _perm: "branding.manage",
    });
    if (!allowed) {
      const { data: mem } = await supabaseAdmin
        .from("org_members")
        .select("role")
        .eq("org_id", data.org_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (mem?.role as string | null) ?? null;
      if (role !== "owner" && role !== "officer") {
        throw new Error("Keine Berechtigung für diese Orga.");
      }
    }

    const bytes = Buffer.from(data.data_base64, "base64");
    if (bytes.byteLength === 0) throw new Error("Leere Datei.");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Datei zu groß (max. 5 MB).");

    const extFromMime: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
    };
    const ext =
      extFromMime[data.content_type.toLowerCase()] ??
      (data.filename.split(".").pop() || "png").toLowerCase();
    const key = `${data.org_id}/logo-${Date.now()}.${ext}`;

    // Cleanup: alte Logos in diesem Ordner entfernen (best effort).
    const { data: existing } = await supabaseAdmin.storage
      .from("org-branding")
      .list(data.org_id, { limit: 100 });
    const toRemove = (existing ?? [])
      .filter((f) => f.name.startsWith("logo-"))
      .map((f) => `${data.org_id}/${f.name}`)
      .filter((p) => p !== key);
    if (toRemove.length > 0) {
      await supabaseAdmin.storage.from("org-branding").remove(toRemove);
    }

    const { error: upErr } = await supabaseAdmin.storage.from("org-branding").upload(key, bytes, {
      contentType: data.content_type,
      upsert: true,
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message);

    const logoUrl = `/api/public/org-logo/${key}`;

    const { data: cur } = await supabaseAdmin
      .from("orgs")
      .select("branding")
      .eq("id", data.org_id)
      .maybeSingle();
    const merged: OrgBranding = {
      ...((cur?.branding as OrgBranding | null) ?? {}),
      logo_url: logoUrl,
    };
    const { error: updErr } = await supabaseAdmin
      .from("orgs")
      .update({ branding: merged })
      .eq("id", data.org_id);
    if (updErr) throw new Error(updErr.message);

    return { logo_url: logoUrl };
  });

/** Upload a content image (page builder) into the `org-branding` bucket.
 *  Unlike the logo upload this keeps every file and only returns the URL. */
export const uploadOrgImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        filename: z.string().trim().min(1).max(120),
        content_type: z
          .string()
          .regex(/^image\/(png|jpe?g|webp|gif|svg\+xml)$/i, "Nur Bilddateien"),
        data_base64: z.string().min(4).max(8_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: allowed } = await supabaseAdmin.rpc("has_org_perm", {
      _user: context.userId,
      _org: data.org_id,
      _perm: "branding.manage",
    });
    if (!allowed) {
      const { data: mem } = await supabaseAdmin
        .from("org_members")
        .select("role")
        .eq("org_id", data.org_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      const role = (mem?.role as string | null) ?? null;
      if (role !== "owner" && role !== "officer") {
        throw new Error("Keine Berechtigung für diese Orga.");
      }
    }

    const bytes = Buffer.from(data.data_base64, "base64");
    if (bytes.byteLength === 0) throw new Error("Leere Datei.");
    if (bytes.byteLength > 5 * 1024 * 1024) throw new Error("Datei zu groß (max. 5 MB).");

    const extFromMime: Record<string, string> = {
      "image/png": "png",
      "image/jpeg": "jpg",
      "image/jpg": "jpg",
      "image/webp": "webp",
      "image/gif": "gif",
      "image/svg+xml": "svg",
    };
    const ext =
      extFromMime[data.content_type.toLowerCase()] ??
      (data.filename.split(".").pop() || "png").toLowerCase();
    const key = `${data.org_id}/media-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 8)}.${ext}`;

    const { error: upErr } = await supabaseAdmin.storage.from("org-branding").upload(key, bytes, {
      contentType: data.content_type,
      upsert: true,
      cacheControl: "3600",
    });
    if (upErr) throw new Error(upErr.message);

    return { url: `/api/public/org-logo/${key}` };
  });

/** Updates name & tag of an org. App-admin, owner/officer or `settings.manage`. */
export const updateOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        name: z.string().trim().min(2).max(80),
        tag: z
          .string()
          .trim()
          .max(10)
          .regex(/^[A-Za-z0-9-]*$/, "Nur Buchstaben, Zahlen und -")
          .optional()
          .nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userHasOrgPerm } = await import("@/lib/org-perms.server");
    let allowed = await userHasOrgPerm(
      supabaseAdmin,
      context.userId,
      data.org_id,
      "settings.manage",
    );
    if (!allowed) {
      const { data: mem } = await supabaseAdmin
        .from("org_members")
        .select("role")
        .eq("org_id", data.org_id)
        .eq("user_id", context.userId)
        .maybeSingle();
      allowed = mem?.role === "owner" || mem?.role === "officer";
    }
    if (!allowed) throw new Error("Keine Berechtigung, diese Orga zu bearbeiten.");
    const { error } = await supabaseAdmin
      .from("orgs")
      .update({ name: data.name, tag: data.tag?.toUpperCase() || null })
      .eq("id", data.org_id);
    if (error) throw new Error(error.message);
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "org.settings_updated",
      entityType: "org",
      entityId: data.org_id,
      summary: `Orga-Stammdaten geändert (Name: ${data.name})`,
      metadata: { tag: data.tag ?? null },
    });
    return { ok: true };
  });

/** Lists members of an org (caller must be a member). */
export const listOrgMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: meRow } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!meRow) {
      const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
        _user_id: context.userId,
        _role: "admin",
      });
      if (!isAdmin) throw new Error("Kein Mitglied dieser Orga.");
    }
    const { data: rows, error } = await supabaseAdmin
      .from("org_members")
      .select(
        "user_id, role, joined_at, permissions, custom_role_id, org_custom_roles:custom_role_id(id, name, color, permissions)",
      )
      .eq("org_id", data.org_id);
    if (error) throw new Error(error.message);
    const userIds = (rows ?? []).map((r) => r.user_id as string);
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, callsign, display_name")
      .in("id", userIds);
    const profileMap = new Map<string, { callsign: string | null; display_name: string | null }>();
    for (const p of profiles ?? [])
      profileMap.set(p.id as string, {
        callsign: (p.callsign as string) ?? null,
        display_name: (p.display_name as string) ?? null,
      });
    const members: OrgMember[] = (rows ?? []).map((r) => {
      const cr = r.org_custom_roles as {
        id: string;
        name: string;
        color: string | null;
        permissions: string[];
      } | null;
      return {
        user_id: r.user_id as string,
        role: r.role as OrgRole,
        joined_at: r.joined_at as string,
        callsign: profileMap.get(r.user_id as string)?.callsign ?? null,
        display_name: profileMap.get(r.user_id as string)?.display_name ?? null,
        permissions: mergePerms(r.permissions as string[] | null, cr?.permissions),
        custom_role_id: (r.custom_role_id as string | null) ?? null,
        custom_role_name: cr?.name ?? null,
        custom_role_color: cr?.color ?? null,
      };
    });
    members.sort((a, b) => (a.callsign ?? "").localeCompare(b.callsign ?? "", "de"));
    return { members };
  });

/** Owner/officer changes another member's role. */
export const setMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        user_id: z.string().uuid(),
        role: z.enum(["member", "quartermaster", "treasurer", "officer", "owner"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("org_members")
      .select("role")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const canManage = isAdmin || (me && ["owner", "officer"].includes(me.role as string));
    if (!canManage) throw new Error("Nur Owner/Officer oder App-Admins dürfen Rollen ändern.");
    if (data.role === "owner" && !isAdmin && me?.role !== "owner")
      throw new Error("Nur der Owner darf den Owner-Status vergeben.");
    const { error } = await supabaseAdmin
      .from("org_members")
      .update({ role: data.role, permissions: rolePresetPerms(data.role) })
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "org.member_role_changed",
      entityType: "org_member",
      entityId: data.user_id,
      summary: `Rolle auf "${data.role}" gesetzt`,
    });
    return { ok: true };
  });

/** Owner/members.manage/App-Admin sets granular permissions of a member. */
export const setMemberPermissions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        user_id: z.string().uuid(),
        permissions: z.array(z.enum(ORG_PERM_KEYS as [OrgPerm, ...OrgPerm[]])),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    const { data: me } = await supabaseAdmin
      .from("org_members")
      .select("role, permissions")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const canManage =
      isAdmin ||
      me?.role === "owner" ||
      ((me?.permissions as string[] | null) ?? []).includes("members.manage");
    if (!canManage) throw new Error("Keine Berechtigung, Rechte zu vergeben.");
    const { data: target } = await supabaseAdmin
      .from("org_members")
      .select("role")
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (!target) throw new Error("Mitglied nicht gefunden.");
    if (target.role === "owner") throw new Error("Owner hat implizit alle Berechtigungen.");
    const uniq = Array.from(new Set(data.permissions));
    const { error } = await supabaseAdmin
      .from("org_members")
      .update({ permissions: uniq })
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "org.member_permissions_changed",
      entityType: "org_member",
      entityId: data.user_id,
      summary: `Berechtigungen aktualisiert (${uniq.length})`,
      metadata: { permissions: uniq },
    });
    return { ok: true };
  });

/** Add a member by callsign. */
export const addMemberByCallsign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        callsign: z.string().trim().min(1).max(80),
        role: z.enum(["member", "quartermaster", "treasurer", "officer"]).default("member"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("org_members")
      .select("role")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin && (!me || !["owner", "officer"].includes(me.role as string)))
      throw new Error("Nur Owner/Officer oder App-Admins dürfen Mitglieder hinzufügen.");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .ilike("callsign", data.callsign)
      .maybeSingle();
    if (!profile) throw new Error("Kein User mit diesem Callsign.");
    const { error } = await supabaseAdmin.from("org_members").insert({
      org_id: data.org_id,
      user_id: profile.id as string,
      role: data.role,
    });
    if (error) throw new Error(error.message);
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: "org.member_added",
      entityType: "org_member",
      entityId: profile.id as string,
      summary: `${data.callsign} als ${data.role} hinzugefügt`,
    });
    // Passende Discord-Rollen vergeben, damit die Zuordnung beim nächsten
    // Login-Check bestehen bleibt.
    const { grantOrgDiscordRoles } = await import("@/lib/org-discord-roles.server");
    const granted = await grantOrgDiscordRoles(profile.id as string, data.org_id).catch(
      () => ({ granted: [] as string[], error: null as string | null }),
    );
    return { ok: true, discord_roles: granted.granted, discord_error: granted.error };
  });

/** Remove member (owner/officer only; cannot remove the owner). */
export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ org_id: z.string().uuid(), user_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("org_members")
      .select("role")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    const isSelf = data.user_id === context.userId;
    const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isSelf && !isAdmin && (!me || !["owner", "officer"].includes(me.role as string)))
      throw new Error("Nur Owner/Officer oder App-Admins dürfen Mitglieder entfernen.");
    const { data: target } = await supabaseAdmin
      .from("org_members")
      .select("role")
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id)
      .maybeSingle();
    if (target?.role === "owner" && !isAdmin)
      throw new Error("Den Owner kann man nicht entfernen.");
    const { error } = await supabaseAdmin
      .from("org_members")
      .delete()
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    const { logAudit } = await import("@/lib/audit.server");
    await logAudit({
      actorUserId: context.userId,
      orgId: data.org_id,
      action: isSelf ? "org.member_left" : "org.member_removed",
      entityType: "org_member",
      entityId: data.user_id,
      summary: isSelf ? "Orga verlassen" : "Mitglied entfernt",
    });
    // Mit der Orga verknüpfte Discord-Rollen wieder abziehen.
    const { removeOrgDiscordRoles } = await import("@/lib/org-discord-roles.server");
    const res = await removeOrgDiscordRoles(data.user_id, data.org_id).catch(() => ({
      removed: [] as string[],
      error: null as string | null,
    }));
    return { ok: true, discord_removed: res.removed, discord_error: res.error };
  });
// ==================== Custom Roles ====================

async function assertCanManageRoles(userId: string, orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: isAdmin } = await supabaseAdmin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (isAdmin) return;
  const { data: me } = await supabaseAdmin
    .from("org_members")
    .select("role, permissions, org_custom_roles:custom_role_id(permissions)")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!me) throw new Error("Kein Mitglied dieser Orga.");
  if (me.role === "owner") return;
  const customPerms = (me.org_custom_roles as { permissions: string[] } | null)?.permissions ?? [];
  const eff = mergePerms(me.permissions as string[] | null, customPerms);
  if (!eff.includes("members.manage")) throw new Error("Keine Berechtigung, Rollen zu verwalten.");
}

/** Lists all custom roles of an org (member-only). */
export const listOrgCustomRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ org_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", data.org_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!me) throw new Error("Kein Mitglied dieser Orga.");
    const { data: rows, error } = await supabaseAdmin
      .from("org_custom_roles")
      .select("*")
      .eq("org_id", data.org_id)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      roles: (rows ?? []).map((r) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        name: r.name as string,
        color: (r.color as string | null) ?? null,
        permissions: ((r.permissions as string[] | null) ?? []) as OrgPerm[],
        created_at: r.created_at as string,
        updated_at: r.updated_at as string,
      })) as OrgCustomRole[],
    };
  });

/** Create or update a custom role. */
export const upsertOrgCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        org_id: z.string().uuid(),
        name: z.string().trim().min(1).max(60),
        color: z
          .string()
          .trim()
          .regex(/^#[0-9a-fA-F]{6}$/, "Farbe im Format #rrggbb")
          .nullable()
          .optional(),
        permissions: z.array(z.enum(ORG_PERM_KEYS as [OrgPerm, ...OrgPerm[]])),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageRoles(context.userId, data.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const uniq = Array.from(new Set(data.permissions));
    if (data.id) {
      const { error } = await supabaseAdmin
        .from("org_custom_roles")
        .update({ name: data.name, color: data.color ?? null, permissions: uniq })
        .eq("id", data.id)
        .eq("org_id", data.org_id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: row, error } = await supabaseAdmin
      .from("org_custom_roles")
      .insert({
        org_id: data.org_id,
        name: data.name,
        color: data.color ?? null,
        permissions: uniq,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: row.id as string };
  });

/** Delete a custom role. Members holding it revert to base perms. */
export const deleteOrgCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ org_id: z.string().uuid(), id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageRoles(context.userId, data.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("org_custom_roles")
      .delete()
      .eq("id", data.id)
      .eq("org_id", data.org_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Assign (or clear) a custom role for a member. */
export const setMemberCustomRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        org_id: z.string().uuid(),
        user_id: z.string().uuid(),
        custom_role_id: z.string().uuid().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageRoles(context.userId, data.org_id);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.custom_role_id) {
      const { data: role } = await supabaseAdmin
        .from("org_custom_roles")
        .select("id")
        .eq("id", data.custom_role_id)
        .eq("org_id", data.org_id)
        .maybeSingle();
      if (!role) throw new Error("Rolle gehört nicht zu dieser Orga.");
    }
    const { error } = await supabaseAdmin
      .from("org_members")
      .update({ custom_role_id: data.custom_role_id })
      .eq("org_id", data.org_id)
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
