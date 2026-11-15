/** Deterministic slug from a human name: lowercase, ASCII, `-` separated. */
export function slugify(input: string): string {
  return (input ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // strip combining diacritics
    .replace(/ß/g, "ss")
    .replace(/[×x]/gi, "x")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32)
    .replace(/-+$/g, "");
}

export const SLUG_REGEX = /^[a-z0-9][a-z0-9-]*$/;

/** Returns a human-readable reason a slug is invalid, or null when it's fine. */
export function validateSlugFormat(slug: string): string | null {
  if (!slug) return "Slug fehlt.";
  if (slug.length < 2) return "Mindestens 2 Zeichen.";
  if (slug.length > 32) return "Maximal 32 Zeichen.";
  if (!SLUG_REGEX.test(slug))
    return "Nur Kleinbuchstaben, Zahlen und Bindestriche.";
  return null;
}