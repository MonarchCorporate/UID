import { z } from "zod";
import type { OrgBranding } from "@/lib/orgs.functions";
import { resolveBranding } from "@/lib/org-branding";

/* ------------------------------------------------------------------ *
 * Block-Modell für den Landingpage-Builder
 * ------------------------------------------------------------------ */

export const BLOCK_TYPES = [
  "container",
  "hero",
  "text",
  "features",
  "stats",
  "gallery",
  "quote",
  "cta",
  "divider",
  "timeline",
  "logos",
  "faq",
  "countdown",
  "video",
  "bento",
  "team",
  "pricing",
  "shape",
  "banner",
  "fleet",
  "calendar",
  "shop",
  "join",
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const ANIMATIONS = [
  "none",
  "fade-up",
  "fade-in",
  "scale-in",
  "slide-left",
  "slide-right",
  "blur-in",
  "zoom-out",
  "flip-up",
] as const;
export type BlockAnimation = (typeof ANIMATIONS)[number];

export const BACKGROUNDS = [
  "none",
  "dark",
  "accent",
  "grid",
  "stars",
  "gradient",
  "glow",
  "image",
] as const;
export type BlockBackground = (typeof BACKGROUNDS)[number];

export const HOVER_FX = ["none", "lift", "glow", "tilt"] as const;
export type BlockHoverFx = (typeof HOVER_FX)[number];

/** Darstellungsvarianten für das Orga-Logo in Hero-/Banner-Blöcken. */
export const LOGO_SIZES = ["sm", "md", "lg", "xl"] as const;
export type LogoSize = (typeof LOGO_SIZES)[number];
export const LOGO_STYLES = ["plain", "ring", "glow", "badge"] as const;
export type LogoStyle = (typeof LOGO_STYLES)[number];
export const LOGO_POSITIONS = ["above", "beside", "behind"] as const;
export type LogoPosition = (typeof LOGO_POSITIONS)[number];
/** Kontrast-Backplate hinter dem Logo – „auto" entscheidet nach Layout/Hintergrund. */
export const LOGO_CONTRASTS = ["auto", "light", "dark", "none"] as const;
export type LogoContrast = (typeof LOGO_CONTRASTS)[number];

export const LOGO_SIZE_PX: Record<LogoSize, number> = {
  sm: 56,
  md: 88,
  lg: 132,
  xl: 184,
};

/** Untergrenze für die automatische (responsive) Skalierung je Größenstufe. */
export const LOGO_MIN_PX: Record<LogoSize, number> = {
  sm: 40,
  md: 56,
  lg: 76,
  xl: 96,
};

/**
 * Responsive Größe: skaliert zwischen Mindest- und Zielgröße mit der Viewport-Breite,
 * damit Logos in engen Layouts (Spalten, Mobil) nicht überlaufen.
 */
export function logoSizeCss(size: LogoSize, auto = true): string {
  const px = LOGO_SIZE_PX[size] ?? LOGO_SIZE_PX.md;
  if (!auto) return `${px}px`;
  const min = LOGO_MIN_PX[size] ?? LOGO_MIN_PX.md;
  return `clamp(${min}px, ${Math.round(px / 8)}vw, ${px}px)`;
}

export const PADDINGS = ["none", "sm", "md", "lg", "xl"] as const;
export const WIDTHS = ["narrow", "normal", "wide", "full"] as const;
export const ALIGNMENTS = ["left", "center", "right"] as const;

/** Basisraster des Builders (px). Alle Spacing-Werte rasten hierauf ein. */
export const GRID_SIZE = 8;
/** Magnetische Spacing-Stops (entsprechen den Presets none…xl). */
export const PAD_SNAPS = [0, 32, 56, 80, 112, 144, 176, 224] as const;
export const PADDING_PX: Record<(typeof PADDINGS)[number], number> = {
  none: 0,
  sm: 32,
  md: 56,
  lg: 80,
  xl: 112,
};

/** Rastert einen Wert auf GRID_SIZE und zieht ihn magnetisch auf nahe Stops. */
export function snapSpacing(value: number, magnet = true): number {
  const v = Math.max(0, Math.min(400, Math.round(value)));
  const grid = Math.round(v / GRID_SIZE) * GRID_SIZE;
  if (!magnet) return grid;
  const near = PAD_SNAPS.find((s) => Math.abs(s - v) <= GRID_SIZE);
  return near ?? grid;
}

export type BlockBase = {
  id: string;
  type: BlockType;
  hidden?: boolean;
  anchor?: string;
  anim?: BlockAnimation;
  animDelay?: number;
  bg?: BlockBackground;
  padding?: (typeof PADDINGS)[number];
  width?: (typeof WIDTHS)[number];
  /** Feinjustierte Abstände (px, auf 8er-Raster) – überschreiben `padding`. */
  padTop?: number;
  padBottom?: number;
  /** Ausrichtung der Inhaltsspalte innerhalb des Blocks. */
  alignX?: (typeof ALIGNMENTS)[number];
  /** Hintergrundbild (nur bei bg = "image"). */
  bgImageUrl?: string;
  /** Abdunklung des Hintergrundbildes in Prozent. */
  bgOverlay?: number;
  /** Sanfter Parallax-Effekt für das Hintergrundbild. */
  parallax?: boolean;
  /** Versatz der Kind-Animationen in ms (0 = aus). */
  stagger?: number;
  /** Hover-Effekt für Karten innerhalb des Blocks. */
  hoverFx?: BlockHoverFx;
};

export type HeroBlock = BlockBase & {
  type: "hero";
  tag?: string;
  title: string;
  animatedTitle?: boolean;
  subtitle?: string;
  imageUrl?: string;
  showLogo?: boolean;
  logoSize?: LogoSize;
  logoStyle?: LogoStyle;
  logoPosition?: LogoPosition;
  /** Kontrast-Hintergrund hinter dem Logo (Lesbarkeit auf Bildern). */
  logoContrast?: LogoContrast;
  /** Automatische, viewport-abhängige Größenanpassung (Default: an). */
  logoAutoSize?: boolean;
  height?: "auto" | "half" | "full";
  starfield?: boolean;
  primaryLabel?: string;
  primaryUrl?: string;
  secondaryLabel?: string;
  secondaryUrl?: string;
};

export type TextBlock = BlockBase & {
  type: "text";
  tag?: string;
  title?: string;
  body?: string;
  align?: "left" | "center";
  imageUrl?: string;
  imageSide?: "left" | "right";
};

export type FeaturesBlock = BlockBase & {
  type: "features";
  tag?: string;
  title?: string;
  subtitle?: string;
  columns?: 2 | 3 | 4;
  items: { title: string; text: string; icon?: string }[];
};

export type StatsBlock = BlockBase & {
  type: "stats";
  items: { value: string; label: string }[];
};

export type GalleryBlock = BlockBase & {
  type: "gallery";
  title?: string;
  columns?: 2 | 3 | 4;
  items: { url: string; caption?: string }[];
};

export type QuoteBlock = BlockBase & {
  type: "quote";
  text: string;
  author?: string;
};

export type CtaBlock = BlockBase & {
  type: "cta";
  title: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
};

export type DividerBlock = BlockBase & {
  type: "divider";
  style?: "scanline" | "line" | "space";
};

export type SectionBlock = BlockBase & {
  type: "fleet" | "calendar" | "shop";
  tag?: string;
  title?: string;
  subtitle?: string;
  cta?: string;
  limit?: number;
};

export type JoinBlock = BlockBase & {
  type: "join";
  tag?: string;
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
  bullets?: string[];
};

export type TimelineBlock = BlockBase & {
  type: "timeline";
  tag?: string;
  title?: string;
  items: { date: string; title: string; text: string }[];
};

export type LogosBlock = BlockBase & {
  type: "logos";
  title?: string;
  marquee?: boolean;
  grayscale?: boolean;
  items: { url: string; alt?: string; link?: string }[];
};

export type FaqBlock = BlockBase & {
  type: "faq";
  tag?: string;
  title?: string;
  items: { q: string; a: string }[];
};

export type CountdownBlock = BlockBase & {
  type: "countdown";
  tag?: string;
  title?: string;
  subtitle?: string;
  target?: string;
  expiredText?: string;
};

export type VideoBlock = BlockBase & {
  type: "video";
  title?: string;
  url?: string;
  caption?: string;
  aspect?: "16/9" | "21/9" | "4/3";
};

export type BentoBlock = BlockBase & {
  type: "bento";
  tag?: string;
  title?: string;
  items: {
    title: string;
    text?: string;
    imageUrl?: string;
    link?: string;
    size?: "sm" | "lg";
  }[];
};

export type TeamBlock = BlockBase & {
  type: "team";
  tag?: string;
  title?: string;
  columns?: 2 | 3 | 4;
  items: { name: string; role?: string; imageUrl?: string; link?: string }[];
};

export type PricingBlock = BlockBase & {
  type: "pricing";
  tag?: string;
  title?: string;
  items: {
    name: string;
    price?: string;
    period?: string;
    features?: string;
    buttonLabel?: string;
    buttonUrl?: string;
    featured?: boolean;
  }[];
};

export type ShapeBlock = BlockBase & {
  type: "shape";
  style?: "wave" | "slant" | "curve" | "gradient";
  flip?: boolean;
  height?: number;
};

export type BannerBlock = BlockBase & {
  type: "banner";
  tag?: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  overlay?: number;
  height?: "sm" | "md" | "lg";
  buttonLabel?: string;
  buttonUrl?: string;
  /** Orga-Logo groß als Wasserzeichen hinter dem Text. */
  logoWatermark?: boolean;
  /** Deckkraft des Wasserzeichens in Prozent. */
  logoOpacity?: number;
};

/** Eine Spalte innerhalb eines Containers. Breite in Prozent (stufenlos). */
export type ContainerColumn = {
  id: string;
  /** Breitenanteil in Prozent – alle Spalten eines Containers ergeben 100. */
  width: number;
  /** Innenabstand der Spalte in px. */
  pad?: number;
  bg?: "none" | "card" | "dark" | "accent";
  blocks: PageBlock[];
};

export type ContainerBlock = BlockBase & {
  type: "container";
  columns: ContainerColumn[];
  /** Abstand zwischen den Spalten in px. */
  gap?: number;
  alignY?: "start" | "center" | "end" | "stretch";
  /** Spalten auf schmalen Breiten untereinander stapeln. */
  stack?: boolean;
};

export type PageBlock =
  | ContainerBlock
  | HeroBlock
  | TextBlock
  | FeaturesBlock
  | StatsBlock
  | GalleryBlock
  | QuoteBlock
  | CtaBlock
  | DividerBlock
  | SectionBlock
  | JoinBlock
  | TimelineBlock
  | LogosBlock
  | FaqBlock
  | CountdownBlock
  | VideoBlock
  | BentoBlock
  | TeamBlock
  | PricingBlock
  | ShapeBlock
  | BannerBlock;

export type PageEffects = {
  starfield?: boolean;
  cursorGlow?: boolean;
  scrollProgress?: boolean;
};

export type OrgPage = {
  version: 2;
  blocks: PageBlock[];
  effects?: PageEffects;
};

export const MAX_BLOCKS = 40;
/**
 * Verschachtelungstiefe von Containern (0 = Seitenebene). Praktisch unbegrenzt,
 * der Wert dient nur als Notbremse gegen Endlosstrukturen.
 */
export const MAX_DEPTH = 12;
export const MAX_COLUMNS = 6;

/* ----------------------------- Validierung ----------------------------- */

const url = (max = 500) =>
  z
    .string()
    .max(max)
    .refine(
      (v) => v === "" || v.startsWith("/") || /^https:\/\//.test(v),
      "Nur https-URLs oder interne Pfade",
    )
    .optional();

const baseShape = {
  id: z.string().min(1).max(40),
  hidden: z.boolean().optional(),
  anchor: z
    .string()
    .max(40)
    .regex(/^[a-z0-9-]*$/i, "Nur Buchstaben, Zahlen und -")
    .optional(),
  anim: z.enum(ANIMATIONS).optional(),
  animDelay: z.number().int().min(0).max(2000).optional(),
  bg: z.enum(BACKGROUNDS).optional(),
  padding: z.enum(PADDINGS).optional(),
  width: z.enum(WIDTHS).optional(),
  padTop: z.number().int().min(0).max(400).optional(),
  padBottom: z.number().int().min(0).max(400).optional(),
  alignX: z.enum(ALIGNMENTS).optional(),
  bgImageUrl: url(),
  bgOverlay: z.number().int().min(0).max(100).optional(),
  parallax: z.boolean().optional(),
  stagger: z.number().int().min(0).max(400).optional(),
  hoverFx: z.enum(HOVER_FX).optional(),
};

const containerSchema = z.object({
  ...baseShape,
  type: z.literal("container"),
  gap: z.number().int().min(0).max(96).optional(),
  alignY: z.enum(["start", "center", "end", "stretch"]).optional(),
  stack: z.boolean().optional(),
  columns: z
    .array(
      z.object({
        id: z.string().max(40),
        width: z.number().min(5).max(100),
        pad: z.number().int().min(0).max(96).optional(),
        bg: z.enum(["none", "card", "dark", "accent"]).optional(),
        blocks: z.array(z.lazy((): z.ZodTypeAny => blockSchema)).max(MAX_BLOCKS),
      }),
    )
    .min(1)
    .max(MAX_COLUMNS),
});

const blockSchema: z.ZodTypeAny = z.discriminatedUnion("type", [
  containerSchema,
  z.object({
    ...baseShape,
    type: z.literal("hero"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120),
    animatedTitle: z.boolean().optional(),
    subtitle: z.string().max(400).optional(),
    imageUrl: url(),
    showLogo: z.boolean().optional(),
    logoSize: z.enum(LOGO_SIZES).optional(),
    logoStyle: z.enum(LOGO_STYLES).optional(),
    logoPosition: z.enum(LOGO_POSITIONS).optional(),
    logoContrast: z.enum(LOGO_CONTRASTS).optional(),
    logoAutoSize: z.boolean().optional(),
    height: z.enum(["auto", "half", "full"]).optional(),
    starfield: z.boolean().optional(),
    primaryLabel: z.string().max(40).optional(),
    primaryUrl: url(),
    secondaryLabel: z.string().max(40).optional(),
    secondaryUrl: url(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("text"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    body: z.string().max(6000).optional(),
    align: z.enum(["left", "center"]).optional(),
    imageUrl: url(),
    imageSide: z.enum(["left", "right"]).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("features"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    subtitle: z.string().max(300).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    items: z
      .array(
        z.object({
          title: z.string().max(80).default(""),
          text: z.string().max(400).default(""),
          icon: z.string().max(30).optional(),
        }),
      )
      .max(12),
  }),
  z.object({
    ...baseShape,
    type: z.literal("stats"),
    items: z
      .array(
        z.object({
          value: z.string().max(20).default(""),
          label: z.string().max(60).default(""),
        }),
      )
      .max(6),
  }),
  z.object({
    ...baseShape,
    type: z.literal("gallery"),
    title: z.string().max(120).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    items: z
      .array(
        z.object({
          url: z.string().max(500),
          caption: z.string().max(120).optional(),
        }),
      )
      .max(12),
  }),
  z.object({
    ...baseShape,
    type: z.literal("quote"),
    text: z.string().max(600),
    author: z.string().max(80).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("cta"),
    title: z.string().max(120),
    text: z.string().max(400).optional(),
    buttonLabel: z.string().max(40).optional(),
    buttonUrl: url(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("divider"),
    style: z.enum(["scanline", "line", "space"]).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.enum(["fleet", "calendar", "shop"]),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    subtitle: z.string().max(300).optional(),
    cta: z.string().max(40).optional(),
    limit: z.number().int().min(1).max(24).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("join"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    text: z.string().max(600).optional(),
    buttonLabel: z.string().max(40).optional(),
    buttonUrl: url(),
    bullets: z.array(z.string().max(120)).max(8).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("timeline"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    items: z
      .array(
        z.object({
          date: z.string().max(40).default(""),
          title: z.string().max(80).default(""),
          text: z.string().max(400).default(""),
        }),
      )
      .max(12),
  }),
  z.object({
    ...baseShape,
    type: z.literal("logos"),
    title: z.string().max(120).optional(),
    marquee: z.boolean().optional(),
    grayscale: z.boolean().optional(),
    items: z
      .array(
        z.object({
          url: z.string().max(500).default(""),
          alt: z.string().max(80).optional(),
          link: z.string().max(500).optional(),
        }),
      )
      .max(16),
  }),
  z.object({
    ...baseShape,
    type: z.literal("faq"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    items: z
      .array(
        z.object({
          q: z.string().max(160).default(""),
          a: z.string().max(1200).default(""),
        }),
      )
      .max(16),
  }),
  z.object({
    ...baseShape,
    type: z.literal("countdown"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    subtitle: z.string().max(300).optional(),
    target: z.string().max(40).optional(),
    expiredText: z.string().max(120).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("video"),
    title: z.string().max(120).optional(),
    url: z.string().max(500).optional(),
    caption: z.string().max(200).optional(),
    aspect: z.enum(["16/9", "21/9", "4/3"]).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("bento"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    items: z
      .array(
        z.object({
          title: z.string().max(80).default(""),
          text: z.string().max(300).optional(),
          imageUrl: z.string().max(500).optional(),
          link: z.string().max(500).optional(),
          size: z.enum(["sm", "lg"]).optional(),
        }),
      )
      .max(10),
  }),
  z.object({
    ...baseShape,
    type: z.literal("team"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    items: z
      .array(
        z.object({
          name: z.string().max(80).default(""),
          role: z.string().max(80).optional(),
          imageUrl: z.string().max(500).optional(),
          link: z.string().max(500).optional(),
        }),
      )
      .max(12),
  }),
  z.object({
    ...baseShape,
    type: z.literal("pricing"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120).optional(),
    items: z
      .array(
        z.object({
          name: z.string().max(60).default(""),
          price: z.string().max(30).optional(),
          period: z.string().max(30).optional(),
          features: z.string().max(600).optional(),
          buttonLabel: z.string().max(40).optional(),
          buttonUrl: z.string().max(500).optional(),
          featured: z.boolean().optional(),
        }),
      )
      .max(4),
  }),
  z.object({
    ...baseShape,
    type: z.literal("shape"),
    style: z.enum(["wave", "slant", "curve", "gradient"]).optional(),
    flip: z.boolean().optional(),
    height: z.number().int().min(20).max(300).optional(),
  }),
  z.object({
    ...baseShape,
    type: z.literal("banner"),
    tag: z.string().max(40).optional(),
    title: z.string().max(120),
    subtitle: z.string().max(400).optional(),
    imageUrl: url(),
    overlay: z.number().int().min(0).max(100).optional(),
    height: z.enum(["sm", "md", "lg"]).optional(),
    buttonLabel: z.string().max(40).optional(),
    buttonUrl: url(),
    logoWatermark: z.boolean().optional(),
    logoOpacity: z.number().int().min(0).max(100).optional(),
  }),
]);

export const pageSchema = z.object({
  version: z.literal(2),
  blocks: z.array(blockSchema).max(MAX_BLOCKS),
  effects: z
    .object({
      starfield: z.boolean().optional(),
      cursorGlow: z.boolean().optional(),
      scrollProgress: z.boolean().optional(),
    })
    .optional(),
});

/* ------------------------------- Helpers ------------------------------- */

let counter = 0;
export function newBlockId() {
  counter += 1;
  return `b${Date.now().toString(36)}${counter.toString(36)}`;
}

export const BLOCK_META: Record<
  BlockType,
  { label: string; description: string; dynamic?: boolean }
> = {
  container: { label: "Container", description: "Spalten-Layout für weitere Elemente" },
  hero: { label: "Hero", description: "Großer Kopfbereich mit Titel & Buttons" },
  text: { label: "Textabschnitt", description: "Überschrift, Text, optionales Bild" },
  features: { label: "Feature-Karten", description: "Karten mit Titel und Text" },
  stats: { label: "Statistiken", description: "Zahlen mit Beschriftung" },
  gallery: { label: "Galerie", description: "Bilder als Raster" },
  quote: { label: "Zitat", description: "Großes Statement" },
  cta: { label: "CTA-Banner", description: "Aufruf mit Button" },
  divider: { label: "Trenner", description: "Scanline, Linie oder Abstand" },
  fleet: { label: "Flotte", description: "Schiffe der Orga", dynamic: true },
  calendar: { label: "Kalender", description: "Kommende Einsätze", dynamic: true },
  shop: { label: "Shop", description: "Angebote aus dem Orgalager", dynamic: true },
  join: { label: "Beitritt", description: "Mitglied-werden-Bereich" },
  timeline: { label: "Timeline", description: "Meilensteine als Verlauf" },
  logos: { label: "Logos / Partner", description: "Logo-Leiste, optional als Laufschrift" },
  faq: { label: "FAQ", description: "Aufklappbare Fragen & Antworten" },
  countdown: { label: "Countdown", description: "Countdown auf ein Datum" },
  video: { label: "Video", description: "YouTube, Vimeo oder MP4" },
  bento: { label: "Kacheln (Bento)", description: "Asymmetrisches Kachelraster" },
  team: { label: "Team", description: "Karten mit Avatar, Name, Rolle" },
  pricing: { label: "Pakete", description: "Preis-/Paketkarten mit CTA" },
  shape: { label: "Trennoptik", description: "Welle, Schräge, Kurve, Verlauf" },
  banner: { label: "Rich-Banner", description: "Vollbreites Bild mit Text-Overlay" },
};

export function createBlock(
  type: BlockType,
  opts?: { columns?: number; widths?: number[] },
): PageBlock {
  const id = newBlockId();
  const base = { id, anim: "fade-up" as BlockAnimation, padding: "lg" as const };
  switch (type) {
    case "container": {
      const n = Math.min(MAX_COLUMNS, Math.max(1, opts?.columns ?? 2));
      return {
        ...base,
        type: "container",
        padding: "md",
        gap: 24,
        alignY: "stretch",
        stack: true,
        columns: Array.from({ length: n }, (_, i) => ({
          id: newBlockId(),
          width: opts?.widths?.[i] ?? Math.round((100 / n) * 100) / 100,
          blocks: [],
        })),
      };
    }
    case "hero":
      return {
        ...base,
        type: "hero",
        tag: "Star Citizen",
        title: "Willkommen",
        animatedTitle: true,
        subtitle: "Gemeinsam das Universum erleben.",
        showLogo: true,
        logoSize: "lg",
        logoStyle: "glow",
        logoPosition: "above",
        starfield: true,
        height: "half",
        bg: "stars",
        primaryLabel: "Discord beitreten",
        primaryUrl: "",
      };
    case "text":
      return {
        ...base,
        type: "text",
        tag: "Über uns",
        title: "Wer wir sind",
        body: "Erzähl hier eure Geschichte.",
        align: "left",
      };
    case "features":
      return {
        ...base,
        type: "features",
        title: "Was uns ausmacht",
        columns: 3,
        items: [
          { title: "Gemeinsam", text: "Regelmäßige Einsätze mit der Community." },
          { title: "Frei", text: "Kein Zwang, keine Pflichttermine." },
          { title: "Erfahren", text: "Hilfe für Einsteiger und Veteranen." },
        ],
      };
    case "stats":
      return {
        ...base,
        type: "stats",
        items: [
          { value: "120", label: "Mitglieder" },
          { value: "48", label: "Schiffe" },
          { value: "24/7", label: "Aktiv" },
        ],
      };
    case "gallery":
      return { ...base, type: "gallery", columns: 3, items: [] };
    case "quote":
      return {
        ...base,
        type: "quote",
        text: "Jenseits der Systeme. Jenseits der Grenzen.",
        author: "",
      };
    case "cta":
      return {
        ...base,
        type: "cta",
        title: "Bereit für den nächsten Einsatz?",
        text: "Komm auf unseren Discord und flieg mit.",
        buttonLabel: "Jetzt beitreten",
        buttonUrl: "",
        bg: "accent",
      };
    case "divider":
      return { ...base, type: "divider", style: "scanline", padding: "none", anim: "none" };
    case "fleet":
      return {
        ...base,
        type: "fleet",
        tag: "Fleet",
        title: "Flotte",
        subtitle: "Alle registrierten Schiffe unserer Mitglieder.",
        cta: "Alle Schiffe",
        limit: 8,
      };
    case "calendar":
      return {
        ...base,
        type: "calendar",
        tag: "Calendar",
        title: "Nächste Einsätze",
        subtitle: "Öffentliche Einsätze und Events.",
        cta: "Kalender",
        limit: 5,
      };
    case "shop":
      return {
        ...base,
        type: "shop",
        tag: "Shop",
        title: "Aus dem Shop",
        subtitle: "Aktuelle Angebote aus unserem Orgalager.",
        cta: "Zum Shop",
        limit: 6,
      };
    case "join":
      return {
        ...base,
        type: "join",
        tag: "Membership",
        title: "Mitglied werden",
        text: "Wir freuen uns über neue Piloten.",
        buttonLabel: "Discord",
        buttonUrl: "",
        bullets: ["Kein Zwang", "Offene Einsätze", "Hilfsbereite Community"],
      };
    case "timeline":
      return {
        ...base,
        type: "timeline",
        tag: "History",
        title: "Unser Weg",
        stagger: 90,
        items: [
          { date: "2023", title: "Gründung", text: "Die ersten Piloten finden zusammen." },
          { date: "2024", title: "Erste Flotte", text: "Der Hangar füllt sich." },
          { date: "Heute", title: "Gemeinsam unterwegs", text: "Regelmäßige Einsätze im Verse." },
        ],
      };
    case "logos":
      return {
        ...base,
        type: "logos",
        title: "Partner & Community",
        marquee: true,
        grayscale: true,
        items: [],
      };
    case "faq":
      return {
        ...base,
        type: "faq",
        tag: "FAQ",
        title: "Häufige Fragen",
        stagger: 70,
        items: [
          { q: "Wie trete ich bei?", a: "Komm auf unseren Discord und melde dich kurz." },
          { q: "Gibt es Pflichttermine?", a: "Nein – du fliegst mit, wann du magst." },
        ],
      };
    case "countdown":
      return {
        ...base,
        type: "countdown",
        tag: "Next Op",
        title: "Nächster Großeinsatz",
        subtitle: "Seid rechtzeitig im Hangar.",
        target: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 16),
        expiredText: "Es geht los!",
        bg: "gradient",
      };
    case "video":
      return {
        ...base,
        type: "video",
        title: "Unser Trailer",
        url: "",
        aspect: "16/9",
      };
    case "bento":
      return {
        ...base,
        type: "bento",
        tag: "Highlights",
        title: "Was uns ausmacht",
        stagger: 80,
        hoverFx: "lift",
        items: [
          {
            title: "Große Einsätze",
            text: "Koordinierte Operationen mit der ganzen Orga.",
            size: "lg",
          },
          { title: "Bergbau", text: "Gemeinsame Mining-Runs." },
          { title: "Handel", text: "Profitable Routen im Verbund." },
          { title: "Rettung", text: "Medical Response rund um die Uhr.", size: "lg" },
        ],
      };
    case "team":
      return {
        ...base,
        type: "team",
        tag: "Crew",
        title: "Unser Team",
        columns: 4,
        stagger: 70,
        hoverFx: "glow",
        items: [
          { name: "Pilot 1", role: "Fleet Commander" },
          { name: "Pilot 2", role: "Quartermaster" },
          { name: "Pilot 3", role: "Ops Officer" },
        ],
      };
    case "pricing":
      return {
        ...base,
        type: "pricing",
        tag: "Ränge",
        title: "Mitgliedschaften",
        stagger: 90,
        items: [
          {
            name: "Freelancer",
            price: "frei",
            features: "Zugang zum Discord\nOffene Einsätze",
            buttonLabel: "Beitreten",
          },
          {
            name: "Mitglied",
            price: "frei",
            features: "Orgalager\nEinsatzplanung\nFlottenzugang",
            buttonLabel: "Beitreten",
            featured: true,
          },
        ],
      };
    case "shape":
      return {
        ...base,
        type: "shape",
        style: "wave",
        height: 90,
        padding: "none",
        anim: "none",
        width: "full",
      };
    case "banner":
      return {
        ...base,
        type: "banner",
        tag: "Verse",
        title: "Jenseits der Systeme",
        subtitle: "Wir fliegen dorthin, wo die Karten enden.",
        imageUrl: "",
        overlay: 55,
        height: "md",
        parallax: true,
        width: "full",
        padding: "none",
      };
  }
}

/**
 * Baut aus der klassischen Branding-Konfiguration (v1) eine Blockliste,
 * damit bestehende Seiten 1:1 im Builder weiterbearbeitet werden können.
 */
export function migrateBrandingToPage(
  branding: OrgBranding | null | undefined,
  org: { name: string },
): OrgPage {
  const b = resolveBranding(branding, org);
  const blocks: PageBlock[] = [];

  blocks.push({
    id: newBlockId(),
    type: "hero",
    tag: undefined,
    title: b.heroTitle,
    animatedTitle: true,
    subtitle: b.heroSubtitle,
    imageUrl: b.heroImageUrl ?? undefined,
    showLogo: b.showLogo,
    starfield: true,
    height: "half",
    bg: "stars",
    padding: "xl",
    anim: "fade-up",
    primaryLabel: b.heroCtaLabel ?? undefined,
    primaryUrl: b.heroCtaUrl ?? undefined,
  });

  if (b.aboutText) {
    blocks.push({
      id: newBlockId(),
      type: "text",
      title: b.aboutTitle,
      body: b.aboutText,
      align: "left",
      anim: "fade-up",
      padding: "lg",
    });
  }

  if (b.highlights.length > 0) {
    blocks.push({
      id: newBlockId(),
      type: "features",
      columns: 3,
      items: b.highlights,
      anim: "fade-up",
      padding: "lg",
    });
  }

  for (const s of b.sections) {
    blocks.push({
      id: newBlockId(),
      type: s.key,
      hidden: !s.enabled,
      tag: s.tag,
      title: s.title,
      subtitle: s.subtitle,
      cta: s.cta,
      limit: s.key === "calendar" ? 5 : s.key === "shop" ? 6 : 8,
      anim: "fade-up",
      padding: "lg",
    });
  }

  return {
    version: 2,
    blocks,
    effects: { starfield: true, cursorGlow: true, scrollProgress: true },
  };
}

/* ---------------------------- Baum-Operationen ---------------------------- */

/**
 * Pfad zu einem Block: ungerade Länge, abwechselnd Blockindex und Spaltenindex.
 * `[2]` = dritter Block der Seite, `[2, 1, 0]` = erster Block in Spalte 2 davon.
 * Ein Elternpfad (gerade Länge) adressiert eine Blockliste: `[]` = Seitenebene.
 */
export type BlockPath = number[];

export function isContainer(b: PageBlock): b is ContainerBlock {
  return b.type === "container";
}

/** Blockliste an einem Elternpfad (gerade Länge) lesen. */
export function listAt(blocks: PageBlock[], parent: BlockPath): PageBlock[] {
  let list = blocks;
  for (let i = 0; i < parent.length; i += 2) {
    const b = list[parent[i]];
    if (!b || !isContainer(b)) return [];
    list = b.columns[parent[i + 1]]?.blocks ?? [];
  }
  return list;
}

/** Blockliste an einem Elternpfad unveränderlich ersetzen. */
export function mapListAt(
  blocks: PageBlock[],
  parent: BlockPath,
  fn: (list: PageBlock[]) => PageBlock[],
): PageBlock[] {
  if (parent.length === 0) return fn(blocks);
  const [bi, ci, ...rest] = parent;
  return blocks.map((b, i) => {
    if (i !== bi || !isContainer(b)) return b;
    return {
      ...b,
      columns: b.columns.map((col, j) =>
        j === ci ? { ...col, blocks: mapListAt(col.blocks, rest, fn) } : col,
      ),
    };
  });
}

export function blockAtPath(blocks: PageBlock[], path: BlockPath): PageBlock | null {
  if (path.length === 0) return null;
  const parent = path.slice(0, -1);
  return listAt(blocks, parent)[path[path.length - 1]] ?? null;
}

/** Pfad eines Blocks anhand seiner ID suchen. */
export function findPath(
  blocks: PageBlock[],
  id: string,
  prefix: BlockPath = [],
): BlockPath | null {
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.id === id) return [...prefix, i];
    if (isContainer(b)) {
      for (let c = 0; c < b.columns.length; c++) {
        const hit = findPath(b.columns[c].blocks, id, [...prefix, i, c]);
        if (hit) return hit;
      }
    }
  }
  return null;
}

export function findBlock(blocks: PageBlock[], id: string): PageBlock | null {
  const p = findPath(blocks, id);
  return p ? blockAtPath(blocks, p) : null;
}

/** Block per ID unveränderlich verändern (rekursiv). */
export function patchById(
  blocks: PageBlock[],
  id: string,
  patch: Record<string, unknown>,
): PageBlock[] {
  return blocks.map((b) => {
    if (b.id === id) return { ...b, ...patch } as PageBlock;
    if (isContainer(b))
      return {
        ...b,
        columns: b.columns.map((c) => ({ ...c, blocks: patchById(c.blocks, id, patch) })),
      };
    return b;
  });
}

export function removeById(blocks: PageBlock[], id: string): PageBlock[] {
  return blocks
    .filter((b) => b.id !== id)
    .map((b) =>
      isContainer(b)
        ? { ...b, columns: b.columns.map((c) => ({ ...c, blocks: removeById(c.blocks, id) })) }
        : b,
    );
}

/** Tiefe Kopie mit frischen IDs. */
export function cloneBlock(b: PageBlock): PageBlock {
  if (isContainer(b))
    return {
      ...b,
      id: newBlockId(),
      columns: b.columns.map((c) => ({
        ...c,
        id: newBlockId(),
        blocks: c.blocks.map(cloneBlock),
      })),
    };
  return { ...b, id: newBlockId() };
}

/** Anzahl aller Blöcke inkl. verschachtelter. */
export function countBlocks(blocks: PageBlock[]): number {
  return blocks.reduce(
    (n, b) => n + 1 + (isContainer(b) ? countBlocks(b.columns.flatMap((c) => c.blocks)) : 0),
    0,
  );
}

/** Verschachtelungstiefe eines Elternpfads (0 = Seitenebene). */
export function depthOf(parent: BlockPath): number {
  return parent.length / 2;
}

/** Spaltenbreiten normalisieren, sodass die Summe 100 ergibt. */
export function normalizeWidths(cols: ContainerColumn[]): ContainerColumn[] {
  const sum = cols.reduce((s, c) => s + (c.width || 0), 0) || 1;
  return cols.map((c) => ({ ...c, width: Math.round(((c.width || 0) / sum) * 10000) / 100 }));
}

/** Alle Blöcke inkl. verschachtelter als flache Liste. */
export function flattenBlocks(blocks: PageBlock[]): PageBlock[] {
  return blocks.flatMap((b) =>
    isContainer(b) ? [b, ...flattenBlocks(b.columns.flatMap((c) => c.blocks))] : [b],
  );
}

/** Ein Eintrag der Ebenen-Navigation (Breadcrumb). */
export type BlockTrailItem = {
  id: string;
  type: BlockType;
  /** Spaltenindex innerhalb des Containers, über den es weitergeht. */
  column?: number;
  depth: number;
};

/**
 * Kette aller Vorfahren bis zum Block am Pfad – für die Breadcrumb-Navigation
 * durch beliebig tief verschachtelte Container.
 */
export function blockTrail(blocks: PageBlock[], path: BlockPath): BlockTrailItem[] {
  const trail: BlockTrailItem[] = [];
  let list = blocks;
  for (let i = 0; i < path.length; i += 2) {
    const b = list[path[i]];
    if (!b) break;
    const col = path[i + 1];
    trail.push({ id: b.id, type: b.type, column: col, depth: i / 2 });
    if (col === undefined || !isContainer(b)) break;
    list = b.columns[col]?.blocks ?? [];
  }
  return trail;
}
