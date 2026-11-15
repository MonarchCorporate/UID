import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { ComponentShop } from "@/lib/ship-components-sync.server";

export type ComponentCategory = "weapons" | "systems" | "missiles" | "propulsion";

export type ComponentListItem = {
  item_ref: string;
  wiki_uuid: string;
  name: string;
  manufacturer_name: string | null;
  category: string;
  classification_label: string | null;
  size: number | null;
  grade: string | null;
  image_url: string | null;
  min_price_buy: number | null;
  shop_count: number;
  has_blueprint: boolean;
  blueprint_id: string | null;
};

export type ComponentDetail = {
  item_ref: string;
  wiki_uuid: string;
  name: string;
  slug: string | null;
  manufacturer_name: string | null;
  manufacturer_code: string | null;
  category: string;
  classification: string | null;
  classification_label: string | null;
  type_label: string | null;
  sub_type_label: string | null;
  size: number | null;
  grade: string | null;
  item_class: string | null;
  description: Record<string, string> | null;
  image_url: string | null;
  web_url: string | null;
  shops: ComponentShop[];
  min_price_buy: number | null;
  last_synced_at: string | null;
  blueprint: { id: string; item_name: string } | null;
  stats: StatGroup[];
  used_in: Array<{
    blueprint_id: string;
    item_name: string;
    qty: number;
    unit: string | null;
  }>;
  my_inventory: Array<{
    id: string;
    qty: number;
    qty_reserved: number;
    unit: "pcs" | "scu";
    quality: number | null;
    location_name: string | null;
    visibility: string;
    updated_at: string;
  }>;
  org_stock: Array<{
    id: string;
    org_id: string;
    org_name: string | null;
    qty: number;
    unit: string;
    quality: number | null;
    locked: boolean;
    updated_at: string;
  }>;
  mapping: {
    has_catalog: boolean;
    has_wiki_uuid: boolean;
    has_blueprint: boolean;
    unmapped_same_name: number;
    used_in_count: number;
    my_inventory_stacks: number;
    org_stock_rows: number;
  };
};

export type StatLine = { label: string; value: string };
export type StatGroup = { label: string; items: StatLine[] };

function statLine(
  label: string,
  value: string | number | boolean | null | undefined,
  unit = "",
): StatLine | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "boolean") {
    return { label, value: value ? "Ja" : "Nein" };
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    const v = value.toLocaleString("de-DE", { maximumFractionDigits: 2 });
    return { label, value: unit ? `${v} ${unit}` : v };
  }
  return { label, value: unit ? `${value} ${unit}` : value };
}

function statGroup(
  label: string,
  items: Array<StatLine | null>,
): StatGroup | null {
  const filtered = items.filter((x): x is StatLine => !!x);
  return filtered.length ? { label, items: filtered } : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function buildComponentStats(raw: any, type: string | null): StatGroup[] {
  if (!raw || typeof raw !== "object") return [];
  const durability = raw.durability ?? null;
  const distortion = raw.distortion ?? null;
  const emission = raw.emission ?? null;
  const groups: Array<StatGroup | null> = [];

  switch (type) {
    case "PowerPlant": {
      const pp = raw.power_plant ?? {};
      let gen: number | null = null;
      const states = raw.resource_network?.states ?? [];
      for (const st of states) {
        for (const d of st.deltas ?? []) {
          if (d.type === "Generation" && d.resource === "Power") gen = d.rate;
        }
      }
      const usage = raw.resource_network?.usage ?? {};
      groups.push(
        statGroup("Energieerzeugung", [
          statLine("Energieerzeugung", gen, "P/s"),
          statLine("Power-Segment-Erzeugung", pp.power_segment_generation),
          statLine("Max. Power-Verbrauch", usage.power?.max),
          statLine("Max. Kühlmittel-Verbrauch", usage.coolant?.max),
        ]),
      );
      break;
    }
    case "Shield": {
      const sh = raw.shield ?? {};
      groups.push(
        statGroup("Schild", [
          statLine("Max. HP", sh.max_health),
          statLine("Regeneration", sh.regen_rate, "HP/s"),
          statLine("Regenerationszeit", sh.regen_time, "s"),
          statLine("Down Time", sh.down_time, "s"),
        ]),
      );
      break;
    }
    case "Cooler": {
      const c = raw.cooler ?? {};
      groups.push(
        statGroup("Kühler", [
          statLine("Kühlrate", c.cooling_rate),
          statLine("Kühlmittel-Segment-Erzeugung", c.coolant_segment_generation),
          statLine("IR-Unterdrückung", c.suppression_ir_factor),
          statLine("Wärme-Unterdrückung", c.suppression_heat_factor),
        ]),
      );
      break;
    }
    case "QuantumDrive": {
      const qd = raw.quantum_drive ?? {};
      const modes = Array.isArray(qd.modes) ? qd.modes : [];
      const m =
        modes.find((x: any) => x.type === "normal_jump") ?? modes[0] ?? null;
      if (m) {
        groups.push(
          statGroup("Quantum-Antrieb", [
            statLine(
              "Geschwindigkeit",
              m.drive_speed_formatted ?? m.drive_speed,
            ),
            statLine(
              "Engage-Geschwindigkeit",
              m.engage_speed_formatted ?? m.engage_speed,
            ),
            statLine("Spool-Up", m.spool_up_time, "s"),
            statLine("Cooldown", m.cooldown_time, "s"),
            statLine(
              "Stage 1 Beschleunigung",
              m.stage_one_accel_rate_formatted,
            ),
            statLine(
              "Stage 2 Beschleunigung",
              m.stage_two_accel_rate_formatted,
            ),
          ]),
        );
      }
      break;
    }
    case "MainThruster": {
      const t = raw.thruster ?? {};
      groups.push(
        statGroup("Triebwerk", [
          statLine(
            "Schubkraft",
            t.thrust_capacity ?? t.performance?.thrust_capacity,
            "N",
          ),
          statLine(
            "Treibstoffverbrauch / 10k N",
            t.fuel_burn_per_10k_newton,
          ),
          statLine("Rolle", t.role ?? t.type),
        ]),
      );
      break;
    }
    case "FlightController": {
      const f = raw.flight_controller ?? {};
      groups.push(
        statGroup("Flugkontrolle", [
          statLine("SCM-Geschwindigkeit", f.scm_speed, "m/s"),
          statLine("Max. Geschwindigkeit", f.max_speed, "m/s"),
          statLine("Pitch", f.pitch, "°/s"),
          statLine("Yaw", f.yaw, "°/s"),
          statLine("Roll", f.roll, "°/s"),
          statLine("Pitch (Boost)", f.pitch_boosted, "°/s"),
          statLine("Yaw (Boost)", f.yaw_boosted, "°/s"),
          statLine("Roll (Boost)", f.roll_boosted, "°/s"),
        ]),
      );
      break;
    }
    case "Radar": {
      const r = raw.radar ?? {};
      groups.push(
        statGroup("Radar", [
          statLine("Cooldown", r.cooldown, "s"),
          statLine("Sensitivität (IR)", r.sensitivity?.infrared),
          statLine("Sensitivität (EM)", r.sensitivity?.electromagnetic),
          statLine("Sensitivität (XS)", r.sensitivity?.cross_section),
        ]),
      );
      break;
    }
    case "WeaponGun":
    case "WeaponDefensive":
    case "Turret": {
      const w = raw.vehicle_weapon ?? {};
      const mode = Array.isArray(w.modes) ? w.modes[0] ?? {} : {};
      groups.push(
        statGroup("Waffe", [
          statLine("Typ", w.type),
          statLine("Reichweite", w.range, "m"),
          statLine(
            "Geschossgeschwindigkeit",
            w.ammunition?.speed,
            "m/s",
          ),
          statLine("Magazin", w.capacity),
          statLine(
            "Feuerrate",
            w.rpm ?? mode.rounds_per_minute,
            "Schuss/min",
          ),
          statLine("Schaden pro Schuss", w.damage_per_shot),
          statLine("Alpha-Schaden gesamt", w.damage?.alpha_total),
          statLine("Burst-Schaden", w.damage?.burst),
          statLine("Max. DPS", w.damage?.max),
        ]),
      );
      if (w.heat) {
        groups.push(
          statGroup("Hitze", [
            statLine("Hitze pro Schuss", w.heat.per_shot),
            statLine("Kühlung / s", w.heat.cooling_per_second),
            statLine(
              "Überhitzungs-Cooldown",
              w.heat.overheat_cooldown,
              "s",
            ),
            statLine(
              "Max. Schüsse vor Überhitzung",
              w.heat.overheat_max_shots,
            ),
          ]),
        );
      }
      break;
    }
    case "Missile": {
      const m = raw.missile ?? {};
      const dmg = Array.isArray(m.damages) ? m.damages[0] : null;
      groups.push(
        statGroup("Rakete", [
          statLine("Geschwindigkeit", m.speed ?? m.flight?.speed, "m/s"),
          statLine("Reichweite", m.flight?.range, "m"),
          statLine("Lebenszeit", m.flight?.max_lifetime, "s"),
          statLine("Schaden", dmg?.damage),
          statLine("Schadenstyp", dmg?.name),
          statLine("Lock-Zeit", m.delays?.lock_time, "s"),
          statLine("Arm-Zeit", m.delays?.arm_time, "s"),
        ]),
      );
      break;
    }
    case "MissileLauncher": {
      const r = raw.missile_rack ?? {};
      groups.push(
        statGroup("Raketen-Rack", [
          statLine("Raketengröße", r.missile_size),
          statLine("Raketenanzahl", r.missile_count),
        ]),
      );
      break;
    }
  }

  groups.push(
    statGroup("Haltbarkeit", [
      statLine("HP", durability?.health),
      statLine(
        "Reparierbar",
        durability?.repairable == null ? null : !!durability.repairable,
      ),
      statLine(
        "Bergungsfähig",
        durability?.salvageable == null ? null : !!durability.salvageable,
      ),
    ]),
  );

  groups.push(
    statGroup("Distortion", [
      statLine("Max. Distortion", distortion?.max),
      statLine("Decay Rate", distortion?.decay_rate, "/s"),
      statLine("Shutdown-Zeit", distortion?.shutdown_time, "s"),
    ]),
  );

  groups.push(
    statGroup("Signatur", [
      statLine("EM Min", emission?.em_min),
      statLine("EM Max", emission?.em_max),
      statLine("IR", emission?.ir),
    ]),
  );

  groups.push(
    statGroup("Allgemein", [statLine("Masse", raw.mass, "kg")]),
  );

  return groups.filter((g): g is StatGroup => !!g);
}
/* eslint-enable @typescript-eslint/no-explicit-any */

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("id")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Nur Admins.");
}

/* ============================================================
 * listShipComponents — Karten-Grid
 * ============================================================ */
export const listShipComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        category: z
          .enum(["weapons", "systems", "missiles", "propulsion"])
          .nullish(),
        search: z.string().max(120).nullish(),
        sizes: z.array(z.number().int().min(0).max(20)).max(20).nullish(),
        onlyWithBlueprint: z.boolean().nullish(),
      })
      .nullish()
      .transform((v) => v ?? {})
      .parse(input),
  )
  .handler(async ({ data }) => {
    const PAGE = 1000;
    const rows: Array<Record<string, unknown>> = [];
    for (let from = 0; ; from += PAGE) {
      let q = supabaseAdmin
        .from("ship_components_catalog")
        .select(
          "item_ref,wiki_uuid,name,manufacturer_name,category,classification_label,size,grade,image_url,min_price_buy,shops",
        )
        .order("name", { ascending: true })
        .range(from, from + PAGE - 1);
      if (data.category) q = q.eq("category", data.category);
      if (data.sizes && data.sizes.length > 0) q = q.in("size", data.sizes);
      if (data.search && data.search.trim().length > 0) {
        const s = data.search.trim().replace(/[%,]/g, " ");
        q = q.or(`name.ilike.%${s}%,manufacturer_name.ilike.%${s}%`);
      }
      const { data: page, error } = await q;
      if (error) throw new Error(error.message);
      rows.push(...((page ?? []) as Array<Record<string, unknown>>));
      if (!page || page.length < PAGE) break;
      if (from + PAGE >= 10000) break; // safety stop
    }

    // Blueprint lookup keyed by output_uuid (= wiki_uuid of the component)
    const uuids = (rows ?? []).map((r) => r.wiki_uuid).filter(Boolean) as string[];
    const bpByUuid = new Map<string, { id: string; item_name: string }>();
    if (uuids.length > 0) {
      const { data: bps } = await supabaseAdmin
        .from("blueprints")
        .select("id,item_name,output_uuid")
        .in("output_uuid", uuids);
      for (const bp of bps ?? []) {
        const key = bp.output_uuid as string;
        if (!bpByUuid.has(key))
          bpByUuid.set(key, {
            id: bp.id as string,
            item_name: bp.item_name as string,
          });
      }
    }

    const items: ComponentListItem[] = (rows ?? []).map((r) => {
      const bp = bpByUuid.get(r.wiki_uuid as string) ?? null;
      const shops = (r.shops as ComponentShop[] | null) ?? [];
      return {
        item_ref: r.item_ref as string,
        wiki_uuid: r.wiki_uuid as string,
        name: r.name as string,
        manufacturer_name: (r.manufacturer_name as string | null) ?? null,
        category: r.category as string,
        classification_label: (r.classification_label as string | null) ?? null,
        size: (r.size as number | null) ?? null,
        grade: (r.grade as string | null) ?? null,
        image_url: (r.image_url as string | null) ?? null,
        min_price_buy: (r.min_price_buy as number | null) ?? null,
        shop_count: shops.length,
        has_blueprint: !!bp,
        blueprint_id: bp?.id ?? null,
      };
    });

    let filtered = items;
    if (data.onlyWithBlueprint) filtered = items.filter((i) => i.has_blueprint);
    return filtered;
  });

/* ============================================================
 * getShipComponent — Detailseite
 * ============================================================ */
export const getShipComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ ref: z.string().min(1).max(255) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("ship_components_catalog")
      .select("*")
      .eq("item_ref", data.ref)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Schiffskomponente nicht gefunden.");

    let blueprint: ComponentDetail["blueprint"] = null;
    if (row.wiki_uuid) {
      const { data: bp } = await supabaseAdmin
        .from("blueprints")
        .select("id,item_name")
        .eq("output_uuid", row.wiki_uuid as string)
        .limit(1)
        .maybeSingle();
      if (bp)
        blueprint = {
          id: bp.id as string,
          item_name: bp.item_name as string,
        };
    }

    const ref = row.item_ref as string;

    // used_in: blueprints referencing this component as material
    const { data: usedInRaw } = await supabaseAdmin
      .from("blueprint_components")
      .select("blueprint_id,qty,unit,item_name")
      .eq("item_ref", ref)
      .limit(500);
    const bpIds = Array.from(
      new Set((usedInRaw ?? []).map((r) => r.blueprint_id as string)),
    );
    const bpNameMap = new Map<string, string>();
    if (bpIds.length) {
      const { data: bpRows } = await supabaseAdmin
        .from("blueprints")
        .select("id,item_name")
        .in("id", bpIds);
      for (const b of bpRows ?? [])
        bpNameMap.set(b.id as string, b.item_name as string);
    }
    const usedInAgg = new Map<
      string,
      { blueprint_id: string; item_name: string; qty: number; unit: string | null }
    >();
    for (const r of usedInRaw ?? []) {
      const id = r.blueprint_id as string;
      const prev = usedInAgg.get(id);
      const qty = Number(r.qty ?? 0);
      if (prev) prev.qty += qty;
      else
        usedInAgg.set(id, {
          blueprint_id: id,
          item_name: bpNameMap.get(id) ?? (r.item_name as string) ?? "?",
          qty,
          unit: (r.unit as string | null) ?? null,
        });
    }
    const used_in = Array.from(usedInAgg.values()).sort((a, b) =>
      a.item_name.localeCompare(b.item_name),
    );

    // Personal inventory (auth user)
    const { userId } = context;
    const { data: myInv } = await supabaseAdmin
      .from("inventory_items")
      .select(
        "id,qty,qty_reserved,unit,quality,location_id,visibility,updated_at",
      )
      .eq("owner_id", userId)
      .eq("item_ref", ref)
      .order("updated_at", { ascending: false });
    const locIds = Array.from(
      new Set(
        (myInv ?? [])
          .map((r) => r.location_id)
          .filter((x): x is string => !!x),
      ),
    );
    const locMap = new Map<string, string>();
    if (locIds.length) {
      const { data: locs } = await supabaseAdmin
        .from("inventory_locations")
        .select("id,name")
        .in("id", locIds);
      for (const l of locs ?? []) locMap.set(l.id as string, l.name as string);
    }

    // Unmapped inventory with same name (mapping gap)
    const { count: unmappedSameName } = await supabaseAdmin
      .from("inventory_items")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", userId)
      .is("item_ref", null)
      .ilike("item_name", row.name as string);

    // Org warehouse stock in caller's orgs
    const { data: myOrgs } = await supabaseAdmin
      .from("org_members")
      .select("org_id")
      .eq("user_id", userId);
    const orgIds = (myOrgs ?? []).map((o) => o.org_id as string);
    let orgStock: ComponentDetail["org_stock"] = [];
    if (orgIds.length) {
      const { data: wh } = await supabaseAdmin
        .from("org_warehouse")
        .select("id,org_id,qty,unit,quality,locked,updated_at")
        .eq("item_ref", ref)
        .in("org_id", orgIds);
      const { data: orgs } = await supabaseAdmin
        .from("orgs")
        .select("id,name")
        .in("id", orgIds);
      const orgNameMap = new Map<string, string>();
      for (const o of orgs ?? [])
        orgNameMap.set(o.id as string, o.name as string);
      orgStock = (wh ?? []).map((r) => ({
        id: r.id as string,
        org_id: r.org_id as string,
        org_name: orgNameMap.get(r.org_id as string) ?? null,
        qty: Number(r.qty ?? 0),
        unit: (r.unit as string) ?? "pcs",
        quality: (r.quality as number | null) ?? null,
        locked: !!r.locked,
        updated_at: r.updated_at as string,
      }));
    }

    // Check catalog presence for mapping status
    const { data: catRow } = await supabaseAdmin
      .from("inventory_item_catalog")
      .select("item_ref,wiki_uuid")
      .eq("item_ref", ref)
      .maybeSingle();

    const detail: ComponentDetail = {
      item_ref: row.item_ref as string,
      wiki_uuid: row.wiki_uuid as string,
      name: row.name as string,
      slug: (row.slug as string | null) ?? null,
      manufacturer_name: (row.manufacturer_name as string | null) ?? null,
      manufacturer_code: (row.manufacturer_code as string | null) ?? null,
      category: row.category as string,
      classification: (row.classification as string | null) ?? null,
      classification_label: (row.classification_label as string | null) ?? null,
      type_label: (row.type_label as string | null) ?? null,
      sub_type_label: (row.sub_type_label as string | null) ?? null,
      size: (row.size as number | null) ?? null,
      grade: (row.grade as string | null) ?? null,
      item_class: (row.item_class as string | null) ?? null,
      description: (row.description as Record<string, string> | null) ?? null,
      image_url: (row.image_url as string | null) ?? null,
      web_url: (row.web_url as string | null) ?? null,
      shops: (row.shops as ComponentShop[] | null) ?? [],
      min_price_buy: (row.min_price_buy as number | null) ?? null,
      last_synced_at: (row.last_synced_at as string | null) ?? null,
      blueprint,
      stats: buildComponentStats(
        (row as { raw?: unknown }).raw ?? null,
        (row as { type?: string | null }).type ?? null,
      ),
      used_in,
      my_inventory: (myInv ?? []).map((r) => ({
        id: r.id as string,
        qty: Number(r.qty ?? 0),
        qty_reserved: Number(r.qty_reserved ?? 0),
        unit: ((r.unit as string) ?? "pcs") as "pcs" | "scu",
        quality: (r.quality as number | null) ?? null,
        location_name: r.location_id
          ? locMap.get(r.location_id as string) ?? null
          : null,
        visibility: (r.visibility as string) ?? "private",
        updated_at: r.updated_at as string,
      })),
      org_stock: orgStock,
      mapping: {
        has_catalog: !!catRow,
        has_wiki_uuid: !!row.wiki_uuid,
        has_blueprint: !!blueprint,
        unmapped_same_name: unmappedSameName ?? 0,
        used_in_count: used_in.length,
        my_inventory_stacks: (myInv ?? []).length,
        org_stock_rows: orgStock.length,
      },
    };
    return detail;
  });

/* ============================================================
 * syncShipComponents — admin
 * ============================================================ */
export const syncShipComponents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);
    const { syncAllShipComponents } = await import(
      "@/lib/ship-components-sync.server"
    );
    return await syncAllShipComponents();
  });

/* ============================================================
 * refreshShipComponent — admin, einzelnes Item
 * ============================================================ */
export const refreshShipComponent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ wiki_uuid: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { refreshOneShipComponent } = await import(
      "@/lib/ship-components-sync.server"
    );
    const row = await refreshOneShipComponent(data.wiki_uuid);
    return { ok: true, name: row.name };
  });

/* ============================================================
 * getShipComponentsStats — fürs Index-Header
 * ============================================================ */
export const getShipComponentsStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { count, error } = await supabaseAdmin
      .from("ship_components_catalog")
      .select("item_ref", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    const { data: latest } = await supabaseAdmin
      .from("ship_components_catalog")
      .select("last_synced_at")
      .order("last_synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      total: count ?? 0,
      last_synced_at: (latest?.last_synced_at as string | null) ?? null,
    };
  });