import type { OrgBranding } from "@/lib/orgs.functions";

export type LandingSectionKey = "fleet" | "calendar" | "shop";

export const LANDING_SECTIONS: {
  key: LandingSectionKey;
  label: string;
  defaultTag: string;
  defaultTitle: string;
  defaultSubtitle: string;
  defaultCta: string;
}[] = [
  {
    key: "fleet",
    label: "Flotte",
    defaultTag: "Fleet",
    defaultTitle: "Flotte",
    defaultSubtitle: "Alle registrierten Schiffe unserer Mitglieder.",
    defaultCta: "Alle Schiffe",
  },
  {
    key: "calendar",
    label: "Kalender",
    defaultTag: "Calendar",
    defaultTitle: "Nächste Einsätze",
    defaultSubtitle: "Öffentliche Einsätze und Events.",
    defaultCta: "Kalender",
  },
  {
    key: "shop",
    label: "Shop",
    defaultTag: "Shop",
    defaultTitle: "Aus dem Shop",
    defaultSubtitle: "Aktuelle Angebote aus unserem Orgalager.",
    defaultCta: "Zum Shop",
  },
];

export const SECTION_ORDER_DEFAULT: LandingSectionKey[] = [
  "fleet",
  "calendar",
  "shop",
];

export type ResolvedSection = {
  key: LandingSectionKey;
  label: string;
  enabled: boolean;
  tag: string;
  title: string;
  subtitle: string;
  cta: string;
};

export type ResolvedBranding = {
  primary: string;
  accent: string;
  logoUrl: string | null;
  showLogo: boolean;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string | null;
  heroCtaLabel: string | null;
  heroCtaUrl: string | null;
  aboutTitle: string;
  aboutText: string | null;
  highlights: { title: string; text: string }[];
  sections: ResolvedSection[];
  discordUrl: string | null;
  rsiUrl: string | null;
  websiteUrl: string | null;
  footerNote: string | null;
};

function clean(v?: string | null): string | null {
  const s = (v ?? "").trim();
  return s.length > 0 ? s : null;
}

/** Legacy `show_*` flags map onto the newer per-section `enabled` field. */
function sectionEnabled(b: OrgBranding, key: LandingSectionKey): boolean {
  const explicit = b.sections?.[key]?.enabled;
  if (typeof explicit === "boolean") return explicit;
  if (key === "fleet") return b.show_fleet !== false;
  if (key === "calendar") return b.show_calendar !== false;
  return b.show_shop !== false;
}

/**
 * Normalises the stored branding JSON into a fully-populated landing page
 * config. Missing values fall back to the shared template defaults so
 * existing orgs keep their current look.
 */
export function resolveBranding(
  b: OrgBranding | null | undefined,
  org: { name: string },
): ResolvedBranding {
  const br: OrgBranding = b ?? {};
  const order = (br.section_order ?? SECTION_ORDER_DEFAULT).filter(
    (k): k is LandingSectionKey =>
      SECTION_ORDER_DEFAULT.includes(k as LandingSectionKey),
  );
  for (const k of SECTION_ORDER_DEFAULT) if (!order.includes(k)) order.push(k);

  const sections: ResolvedSection[] = order.map((key) => {
    const def = LANDING_SECTIONS.find((s) => s.key === key)!;
    const cfg = br.sections?.[key] ?? {};
    return {
      key,
      label: def.label,
      enabled: sectionEnabled(br, key),
      tag: clean(cfg.tag) ?? def.defaultTag,
      title: clean(cfg.title) ?? def.defaultTitle,
      subtitle: clean(cfg.subtitle) ?? def.defaultSubtitle,
      cta: clean(cfg.cta) ?? def.defaultCta,
    };
  });

  return {
    primary: br.primary ?? "#FFBF00",
    accent: br.accent ?? "#3b82f6",
    logoUrl: clean(br.logo_url),
    showLogo: br.show_logo !== false,
    heroTitle: clean(br.hero_title) ?? org.name,
    heroSubtitle:
      clean(br.hero_subtitle) ??
      "Star Citizen Community · gemeinsame Einsätze, Flotte und Orga-Handel.",
    heroImageUrl: clean(br.hero_image_url),
    heroCtaLabel: clean(br.hero_cta_label),
    heroCtaUrl: clean(br.hero_cta_url),
    aboutTitle: clean(br.about_title) ?? "Über uns",
    aboutText: clean(br.about_md),
    highlights: (br.highlights ?? [])
      .map((h) => ({
        title: (h?.title ?? "").trim(),
        text: (h?.text ?? "").trim(),
      }))
      .filter((h) => h.title.length > 0 || h.text.length > 0)
      .slice(0, 6),
    sections,
    discordUrl: clean(br.discord_url),
    rsiUrl: clean(br.rsi_url),
    websiteUrl: clean(br.website_url),
    footerNote: clean(br.footer_note),
  };
}