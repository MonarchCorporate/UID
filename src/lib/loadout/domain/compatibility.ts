import type { CatalogComponent, Hardpoint, ShipInfo } from "./types";

export interface CompatibilityContext {
  hardpoint: Hardpoint;
  ship?: ShipInfo | null;
  version?: string | null;
}

/**
 * Pure compatibility rule. Reads:
 * - allowedTypes / category
 * - size range
 * - required / excluded tags
 * - version guard
 * - ship restriction tags
 *
 * Missing metadata errs on the permissive side so a partially-typed catalog
 * entry stays usable; explicit mismatches are rejected.
 */
export function isCompatible(
  component: CatalogComponent,
  ctx: CompatibilityContext,
): boolean {
  const { hardpoint, ship, version } = ctx;

  // Category
  if (component.category && hardpoint.category) {
    if (component.category.toLowerCase() !== hardpoint.category.toLowerCase()) {
      return false;
    }
  }

  // Allowed types (classification labels such as "Missile Rack", "Torpedo", ...)
  if (hardpoint.allowedTypes && hardpoint.allowedTypes.length > 0) {
    const label = (component.classification_label ?? "").toLowerCase();
    const ok = hardpoint.allowedTypes.some((t) => t.toLowerCase() === label);
    if (!ok) return false;
  }

  // Size range (strict — matches the current Erkul-style behaviour)
  const size = component.size ?? null;
  if (hardpoint.minSize != null && size != null && size < hardpoint.minSize) return false;
  if (hardpoint.maxSize != null && size != null && size > hardpoint.maxSize) return false;

  // Version
  if (version && component.version && component.version !== version) return false;

  // Tags
  const compTags: string[] = ((component as unknown as { tags?: string[] }).tags ?? []).map((t) =>
    t.toLowerCase(),
  );
  if (hardpoint.requiredTags?.length) {
    for (const t of hardpoint.requiredTags) {
      if (!compTags.includes(t.toLowerCase())) return false;
    }
  }
  if (hardpoint.excludedTags?.length) {
    for (const t of hardpoint.excludedTags) {
      if (compTags.includes(t.toLowerCase())) return false;
    }
  }

  // Ship-level restrictions
  if (ship?.restrictedTags?.length) {
    for (const t of ship.restrictedTags) {
      if (compTags.includes(t.toLowerCase())) return false;
    }
  }

  return true;
}

export function getCompatibleComponents(
  hardpoint: Hardpoint,
  components: CatalogComponent[],
  ship?: ShipInfo | null,
  version?: string | null,
): CatalogComponent[] {
  const ctx: CompatibilityContext = { hardpoint, ship, version };
  return components.filter((c) => isCompatible(c, ctx));
}