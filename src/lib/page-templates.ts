import {
  createBlock,
  newBlockId,
  type BannerBlock,
  type BentoBlock,
  type ContainerBlock,
  type FaqBlock,
  type FeaturesBlock,
  type HeroBlock,
  type JoinBlock,
  type OrgPage,
  type PageBlock,
  type QuoteBlock,
  type SectionBlock,
  type StatsBlock,
  type TeamBlock,
  type TextBlock,
  type TimelineBlock,
} from "@/lib/page-blocks";

/* ------------------------------------------------------------------ *
 * Fertig gestaltete Landingpage-Vorlagen
 *
 * Jede Vorlage liefert eine komplette Seite plus ein passendes Farbpaar.
 * Alle Blöcke arbeiten ausschließlich mit den CSS-Variablen `--brand` und
 * `--brand-accent`, damit spätere Farbänderungen überall greifen.
 * ------------------------------------------------------------------ */

export type TemplateId =
  | "command-deck"
  | "split-signal"
  | "minimal-brief"
  | "trade-hub"
  | "fleet-showcase"
  | "recruitment"
  | "orga-portrait"
  | "crew-dossier"
  | "chapters-magazine"
  | "chapters-timeline"
  | "chapters-zigzag"
  | "chapters-onepager";

/** Grobe Struktur-Skizze für die Miniaturvorschau in der Galerie. */
export type PreviewRow =
  | { kind: "hero"; logo: "lg" | "md" | "side" }
  | { kind: "bars"; count: number }
  | { kind: "cards"; count: number }
  | { kind: "split" }
  | { kind: "wide" }
  | { kind: "line" };

export type PageTemplate = {
  id: TemplateId;
  name: string;
  description: string;
  /** Kurze Stichworte für die Galerie-Karte. */
  tags: string[];
  colors: { primary: string; accent: string };
  preview: PreviewRow[];
  build: (org: { name: string }) => OrgPage;
};

/* ------------------------------- Helfer -------------------------------- */

type Patch<T> = Partial<Omit<T, "id" | "type">>;

function block<T extends PageBlock>(type: T["type"], patch: Patch<T> = {}): T {
  return { ...(createBlock(type) as T), ...(patch as object) } as T;
}

function hero(patch: Patch<HeroBlock>): HeroBlock {
  return block<HeroBlock>("hero", patch);
}

function column(width: number, blocks: PageBlock[], pad = 24) {
  return { id: newBlockId(), width, pad, blocks };
}

function container(
  columns: ReturnType<typeof column>[],
  patch: Patch<ContainerBlock> = {},
): ContainerBlock {
  return {
    ...(createBlock("container") as ContainerBlock),
    ...(patch as object),
    columns,
  } as ContainerBlock;
}

function divider(style: "scanline" | "line" | "space" = "scanline"): PageBlock {
  return block("divider", { style } as Patch<PageBlock>);
}

const EFFECTS_CINEMATIC = { starfield: true, cursorGlow: true, scrollProgress: true };
const EFFECTS_CALM = { starfield: false, cursorGlow: false, scrollProgress: true };

/* ------------------------------ Vorlagen ------------------------------- */

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "command-deck",
    name: "Command Deck",
    description:
      "Cinematischer Vollbild-Hero mit leuchtendem Logo, Kennzahlen, Flotte und Einsatzkalender.",
    tags: ["Cinematisch", "Logo groß", "Alles drin"],
    colors: { primary: "#22d3ee", accent: "#f59e0b" },
    preview: [
      { kind: "hero", logo: "lg" },
      { kind: "bars", count: 3 },
      { kind: "cards", count: 3 },
      { kind: "wide" },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CINEMATIC,
      blocks: [
        hero({
          tag: "Star Citizen Organisation",
          title: org.name,
          subtitle:
            "Koordinierte Operationen, eine gewachsene Flotte und eine Community, die zusammen fliegt.",
          height: "full",
          padding: "xl",
          bg: "stars",
          starfield: true,
          showLogo: true,
          logoSize: "xl",
          logoStyle: "glow",
          logoPosition: "above",
          alignX: "center",
          animatedTitle: true,
          primaryLabel: "Discord beitreten",
          secondaryLabel: "Unsere Flotte",
          secondaryUrl: "#flotte",
        }),
        block<StatsBlock>("stats", {
          bg: "dark",
          padding: "md",
          stagger: 80,
          items: [
            { value: "120", label: "Piloten" },
            { value: "48", label: "Schiffe im Hangar" },
            { value: "24/7", label: "Aktiv im Verse" },
          ],
        }),
        block<TextBlock>("text", {
          tag: "Briefing",
          title: `Das ist ${org.name}`,
          body: "Wir sind eine Organisation aus Piloten, die das Verse gemeinsam erkunden – von Bergbau über Handel bis zu großen Flottenoperationen. Erzähl hier eure Geschichte, eure Werte und wofür ihr steht.",
          align: "left",
          padding: "lg",
        }),
        block<BentoBlock>("bento", {
          tag: "Einsatzbereiche",
          title: "Was bei uns läuft",
          bg: "grid",
          padding: "lg",
          hoverFx: "lift",
          stagger: 80,
        }),
        divider(),
        block<SectionBlock>("fleet", {
          anchor: "flotte",
          bg: "none",
          padding: "lg",
          limit: 8,
        }),
        block<SectionBlock>("calendar", { bg: "gradient", padding: "lg", limit: 5 }),
        block<BannerBlock>("banner", {
          tag: "Recruiting",
          title: "Flieg mit uns",
          subtitle: "Offene Türen, keine Pflichttermine – nur gute Einsätze.",
          height: "lg",
          logoWatermark: true,
          logoOpacity: 12,
          buttonLabel: "Jetzt beitreten",
          padding: "lg",
        }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "split-signal",
    name: "Split Signal",
    description:
      "Zweispaltiger Hero mit Logo neben dem Titel, Bento-Highlights und kompaktem Shop-Bereich.",
    tags: ["Zweispaltig", "Logo seitlich", "Modern"],
    colors: { primary: "#60a5fa", accent: "#fbbf24" },
    preview: [
      { kind: "hero", logo: "side" },
      { kind: "split" },
      { kind: "cards", count: 4 },
      { kind: "bars", count: 2 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CINEMATIC,
      blocks: [
        hero({
          tag: "Signal empfangen",
          title: org.name,
          subtitle: "Eine Orga, ein Ziel: gemeinsam mehr erreichen als allein.",
          height: "half",
          padding: "xl",
          bg: "glow",
          starfield: false,
          showLogo: true,
          logoSize: "xl",
          logoStyle: "ring",
          logoPosition: "beside",
          animatedTitle: true,
          primaryLabel: "Discord",
          secondaryLabel: "Mehr erfahren",
          secondaryUrl: "#ueber-uns",
        }),
        container(
          [
            column(58, [
              block<TextBlock>("text", {
                anchor: "ueber-uns",
                tag: "Über uns",
                title: "Wer wir sind",
                body: "Beschreibe hier eure Organisation: Wie ihr entstanden seid, was euch antreibt und welche Art von Piloten bei euch gut aufgehoben ist.",
                padding: "none",
                anim: "slide-right",
              }),
            ]),
            column(42, [
              block<StatsBlock>("stats", {
                padding: "none",
                anim: "slide-left",
                items: [
                  { value: "120", label: "Mitglieder" },
                  { value: "48", label: "Schiffe" },
                  { value: "12", label: "Ops / Monat" },
                ],
              }),
            ]),
          ],
          { padding: "lg", gap: 40, alignY: "center" },
        ),
        block<BentoBlock>("bento", {
          tag: "Highlights",
          title: "Unsere Schwerpunkte",
          padding: "lg",
          bg: "grid",
          hoverFx: "tilt",
          stagger: 80,
        }),
        divider("line"),
        block<SectionBlock>("shop", { padding: "lg", limit: 6 }),
        block<SectionBlock>("calendar", { padding: "lg", bg: "dark", limit: 5 }),
        block("cta", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "minimal-brief",
    name: "Minimal Brief",
    description:
      "Ruhig und reduziert: zentriertes Logo, viel Weißraum, ein starker Text und der Kalender.",
    tags: ["Reduziert", "Ruhig", "Schnell"],
    colors: { primary: "#94a3b8", accent: "#38bdf8" },
    preview: [
      { kind: "hero", logo: "md" },
      { kind: "line" },
      { kind: "wide" },
      { kind: "bars", count: 2 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CALM,
      blocks: [
        hero({
          tag: "",
          title: org.name,
          subtitle: "Weniger Lärm. Mehr Flugzeit.",
          height: "half",
          padding: "xl",
          bg: "none",
          starfield: false,
          animatedTitle: false,
          showLogo: true,
          logoSize: "lg",
          logoStyle: "plain",
          logoPosition: "above",
          alignX: "center",
          primaryLabel: "Discord",
          secondaryLabel: "",
        }),
        divider("line"),
        block<TextBlock>("text", {
          tag: "Über uns",
          title: "Kurz gesagt",
          body: "Zwei bis drei Absätze reichen: Wer ihr seid, was ihr spielt und wie man euch erreicht.",
          align: "center",
          padding: "lg",
          width: "narrow",
        }),
        block<FeaturesBlock>("features", {
          title: "",
          columns: 3,
          padding: "lg",
          width: "normal",
          stagger: 70,
        }),
        block<SectionBlock>("calendar", { padding: "lg", limit: 4 }),
        block<JoinBlock>("join", { padding: "lg", bg: "dark" }),
      ],
    }),
  },
  {
    id: "trade-hub",
    name: "Trade Hub",
    description:
      "Für Handels- und Versorger-Orgas: Shop im Fokus, Logo als Wasserzeichen im Banner.",
    tags: ["Shop", "Handel", "Logo als Wasserzeichen"],
    colors: { primary: "#34d399", accent: "#fbbf24" },
    preview: [
      { kind: "hero", logo: "md" },
      { kind: "cards", count: 3 },
      { kind: "wide" },
      { kind: "bars", count: 3 },
    ],
    build: (org) => ({
      version: 2,
      effects: { starfield: false, cursorGlow: true, scrollProgress: true },
      blocks: [
        hero({
          tag: "Trade & Supply",
          title: org.name,
          subtitle: "Waren, Rohstoffe und Ausrüstung – direkt aus unserem Orgalager.",
          height: "half",
          padding: "xl",
          bg: "gradient",
          starfield: false,
          showLogo: true,
          logoSize: "lg",
          logoStyle: "badge",
          logoPosition: "above",
          animatedTitle: true,
          primaryLabel: "Zum Angebot",
          primaryUrl: "#shop",
          secondaryLabel: "Kontakt",
        }),
        block<FeaturesBlock>("features", {
          tag: "Service",
          title: "Warum bei uns kaufen",
          columns: 3,
          padding: "lg",
          stagger: 70,
          items: [
            { title: "Faire Preise", text: "Direkt aus dem Lager, ohne Zwischenhändler." },
            { title: "Schnelle Lieferung", text: "Übergabe an der Station eurer Wahl." },
            { title: "Verlässlich", text: "Feste Ansprechpartner für jede Bestellung." },
          ],
        }),
        block<SectionBlock>("shop", {
          anchor: "shop",
          padding: "lg",
          bg: "grid",
          limit: 9,
        }),
        block<BannerBlock>("banner", {
          tag: "Auftrag",
          title: "Etwas Spezielles gesucht?",
          subtitle: "Sag uns, was du brauchst – wir besorgen oder fertigen es.",
          height: "md",
          logoWatermark: true,
          logoOpacity: 14,
          buttonLabel: "Anfrage stellen",
          padding: "lg",
        }),
        block<FaqBlock>("faq", { padding: "lg" }),
        block("cta", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "fleet-showcase",
    name: "Fleet Showcase",
    description:
      "Die Flotte im Rampenlicht: großes Banner mit Logo, Schiffsübersicht, Galerie und Team.",
    tags: ["Flotte", "Bildstark", "Team"],
    colors: { primary: "#7dd3fc", accent: "#fb923c" },
    preview: [
      { kind: "hero", logo: "lg" },
      { kind: "wide" },
      { kind: "cards", count: 4 },
      { kind: "bars", count: 3 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CINEMATIC,
      blocks: [
        hero({
          tag: "Hangar",
          title: org.name,
          subtitle: "Von der Aurora bis zum Kapitalschiff – das fliegen wir.",
          height: "full",
          padding: "xl",
          bg: "stars",
          starfield: true,
          showLogo: true,
          logoSize: "xl",
          logoStyle: "ring",
          logoPosition: "above",
          alignX: "center",
          animatedTitle: true,
          primaryLabel: "Flotte ansehen",
          primaryUrl: "#flotte",
          secondaryLabel: "Discord",
        }),
        block<SectionBlock>("fleet", {
          anchor: "flotte",
          padding: "lg",
          bg: "none",
          limit: 12,
        }),
        divider(),
        block("gallery", { padding: "lg", columns: 3 } as Patch<PageBlock>),
        block<TimelineBlock>("timeline", { padding: "lg", bg: "dark" }),
        block<TeamBlock>("team", { padding: "lg", columns: 4 }),
        block<SectionBlock>("calendar", { padding: "lg", limit: 5 }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "recruitment",
    name: "Recruitment",
    description:
      "Auf Neuzugänge ausgelegt: klarer Call-to-Action, Vorteile, FAQ und Countdown zum Einsatz.",
    tags: ["Recruiting", "CTA", "FAQ"],
    colors: { primary: "#a78bfa", accent: "#22d3ee" },
    preview: [
      { kind: "hero", logo: "side" },
      { kind: "cards", count: 3 },
      { kind: "wide" },
      { kind: "bars", count: 2 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CINEMATIC,
      blocks: [
        hero({
          tag: "Wir rekrutieren",
          title: `${org.name} sucht dich`,
          subtitle: "Egal ob Frischling oder Veteran – bei uns findest du deinen Platz im Verse.",
          height: "half",
          padding: "xl",
          bg: "glow",
          starfield: true,
          showLogo: true,
          logoSize: "lg",
          logoStyle: "glow",
          logoPosition: "beside",
          animatedTitle: true,
          primaryLabel: "Jetzt bewerben",
          secondaryLabel: "Was wir bieten",
          secondaryUrl: "#vorteile",
        }),
        block<FeaturesBlock>("features", {
          anchor: "vorteile",
          tag: "Vorteile",
          title: "Das bekommst du bei uns",
          columns: 3,
          padding: "lg",
          bg: "grid",
          stagger: 70,
          hoverFx: "lift",
        }),
        block("countdown", { padding: "lg" }),
        block<TextBlock>("text", {
          tag: "Ablauf",
          title: "So läuft der Beitritt",
          body: "1. Komm auf unseren Discord.\n2. Kurzes Kennenlernen mit einem Officer.\n3. Erster gemeinsamer Einsatz – danach bist du dabei.",
          align: "left",
          padding: "lg",
          width: "narrow",
        }),
        block<FaqBlock>("faq", { padding: "lg" }),
        block<BannerBlock>("banner", {
          tag: "Bereit?",
          title: "Dein Hangarplatz wartet",
          subtitle: "Melde dich – der Rest ergibt sich beim Fliegen.",
          height: "lg",
          logoWatermark: true,
          logoOpacity: 16,
          buttonLabel: "Discord beitreten",
          padding: "lg",
        }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
];

/* --------------------- Vorlagen mit Textplatzhaltern -------------------- */

PAGE_TEMPLATES.push(
  {
    id: "orga-portrait",
    name: "Orga-Portrait",
    description:
      "Vorstellungsseite mit fertigen Abschnitten: Über uns, Unsere Organisation, Unsere Crew und Unsere Tätigkeit – inklusive Textplatzhaltern.",
    tags: ["Über uns", "Crew", "Tätigkeit", "Textvorlagen"],
    colors: { primary: "#38bdf8", accent: "#f59e0b" },
    preview: [
      { kind: "hero", logo: "lg" },
      { kind: "split" },
      { kind: "cards", count: 3 },
      { kind: "bars", count: 3 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CINEMATIC,
      blocks: [
        hero({
          tag: "Wer wir sind",
          title: org.name,
          subtitle:
            "Eine Organisation, vier Kapitel: unsere Geschichte, unsere Struktur, unsere Crew und unsere tägliche Arbeit im Verse.",
          height: "half",
          padding: "xl",
          bg: "stars",
          starfield: true,
          showLogo: true,
          logoSize: "xl",
          logoStyle: "glow",
          logoPosition: "above",
          alignX: "center",
          animatedTitle: true,
          primaryLabel: "Discord beitreten",
          secondaryLabel: "Über uns",
          secondaryUrl: "#ueber-uns",
        }),
        block<TextBlock>("text", {
          anchor: "ueber-uns",
          tag: "01 // Über uns",
          title: "Über uns",
          body: `[Kurzvorstellung] ${org.name} wurde von einer Handvoll Piloten gegründet, die … [Gründungsgeschichte in 2–3 Sätzen].\n\n[Werte] Uns verbindet … [z. B. Fairness, Zuverlässigkeit, Spaß am gemeinsamen Fliegen].\n\n[Für wen wir da sind] Bei uns sind … [Neulinge, Veteranen, Gelegenheitsspieler] richtig aufgehoben.`,
          align: "left",
          padding: "lg",
          width: "narrow",
        }),
        block<StatsBlock>("stats", {
          padding: "md",
          bg: "dark",
          stagger: 80,
          items: [
            { value: "[Jahr]", label: "Gegründet" },
            { value: "[00]", label: "Mitglieder" },
            { value: "[00]", label: "Schiffe" },
            { value: "[DE/EN]", label: "Sprache" },
          ],
        }),
        divider("line"),
        block<TextBlock>("text", {
          anchor: "organisation",
          tag: "02 // Struktur",
          title: "Unsere Organisation",
          body: `[Aufbau] Wir gliedern uns in … [Abteilungen / Divisionen / Geschwader].\n\n[Führung] Entscheidungen trifft … [Rat, Orgaleitung, Officer-Runde].\n\n[Mitmachen] Jedes Mitglied kann … [Aufgaben übernehmen, Einsätze leiten, Abteilungen vorschlagen].`,
          align: "left",
          padding: "lg",
          width: "narrow",
        }),
        block<FeaturesBlock>("features", {
          tag: "Abteilungen",
          title: "So sind wir aufgestellt",
          columns: 3,
          padding: "lg",
          bg: "grid",
          stagger: 70,
          hoverFx: "lift",
          items: [
            { title: "[Abteilung 1]", text: "[Kurzbeschreibung: Aufgaben, Ansprechpartner, wann ihr aktiv seid.]" },
            { title: "[Abteilung 2]", text: "[Kurzbeschreibung: Aufgaben, Ansprechpartner, wann ihr aktiv seid.]" },
            { title: "[Abteilung 3]", text: "[Kurzbeschreibung: Aufgaben, Ansprechpartner, wann ihr aktiv seid.]" },
          ],
        }),
        block<TimelineBlock>("timeline", {
          tag: "Chronik",
          title: "Unsere Meilensteine",
          padding: "lg",
          items: [
            { date: "[Datum]", title: "[Gründung]", text: "[Was ist passiert? 1–2 Sätze.]" },
            { date: "[Datum]", title: "[Erste große Operation]", text: "[Was ist passiert? 1–2 Sätze.]" },
            { date: "[Datum]", title: "[Heute]", text: "[Wo steht ihr aktuell?]" },
          ],
        }),
        divider(),
        block<TextBlock>("text", {
          anchor: "crew",
          tag: "03 // Menschen",
          title: "Unsere Crew",
          body: `[Einleitung] Hinter ${org.name} stehen … [Beschreibe eure Community in 2–3 Sätzen: Herkunft, Spielzeiten, Umgangston].`,
          align: "left",
          padding: "lg",
          width: "narrow",
        }),
        block<TeamBlock>("team", {
          tag: "Crew",
          title: "Wer euch empfängt",
          columns: 4,
          padding: "lg",
          bg: "dark",
          stagger: 70,
          items: [
            { name: "[Handle]", role: "[Orgaleitung]" },
            { name: "[Handle]", role: "[Officer / Einsatzleitung]" },
            { name: "[Handle]", role: "[Recruiting]" },
            { name: "[Handle]", role: "[Logistik / Technik]" },
          ],
        }),
        block<QuoteBlock>("quote", {
          text: "[Zitat eines Mitglieds: Was macht die Crew für dich besonders?]",
          author: "[Handle, Rolle]",
          padding: "lg",
        }),
        divider("line"),
        block<TextBlock>("text", {
          anchor: "taetigkeit",
          tag: "04 // Einsatzprofil",
          title: "Unsere Tätigkeit",
          body: `[Schwerpunkte] Im Alltag machen wir vor allem … [Bergbau, Handel, Salvage, Sicherheit, Erkundung].\n\n[Rhythmus] Unsere Einsätze finden … [wöchentlich, spontan, an festen Tagen] statt.\n\n[Mitfliegen] Teilnehmen kann … [jedes Mitglied ohne Anmeldung / nach Eintrag im Kalender].`,
          align: "left",
          padding: "lg",
          width: "narrow",
        }),
        block<BentoBlock>("bento", {
          tag: "Tätigkeitsfelder",
          title: "Das machen wir im Verse",
          padding: "lg",
          bg: "grid",
          hoverFx: "lift",
          stagger: 80,
          items: [
            { title: "[Tätigkeit 1]", text: "[Was genau macht ihr dabei? Für wen ist das interessant?]", size: "lg" },
            { title: "[Tätigkeit 2]", text: "[Kurzbeschreibung.]" },
            { title: "[Tätigkeit 3]", text: "[Kurzbeschreibung.]" },
            { title: "[Tätigkeit 4]", text: "[Kurzbeschreibung.]" },
          ],
        }),
        block<SectionBlock>("calendar", { padding: "lg", limit: 5 }),
        block<BannerBlock>("banner", {
          tag: "Kontakt",
          title: "[Lust mitzufliegen?]",
          subtitle: "[Schreib uns auf Discord – wir melden uns meist am selben Abend.]",
          height: "lg",
          logoWatermark: true,
          logoOpacity: 14,
          buttonLabel: "Discord beitreten",
          padding: "lg",
        }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "crew-dossier",
    name: "Crew-Dossier",
    description:
      "Kompaktes Dossier: die vier Kapitel Über uns, Organisation, Crew und Tätigkeit nebeneinander in ruhigen Spalten.",
    tags: ["Über uns", "Dossier", "Ruhig", "Textvorlagen"],
    colors: { primary: "#a3b8cc", accent: "#38bdf8" },
    preview: [
      { kind: "hero", logo: "side" },
      { kind: "split" },
      { kind: "cards", count: 4 },
      { kind: "line" },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CALM,
      blocks: [
        hero({
          tag: "Dossier",
          title: org.name,
          subtitle: "[Ein Satz, der eure Orga auf den Punkt bringt.]",
          height: "half",
          padding: "xl",
          bg: "glow",
          starfield: false,
          showLogo: true,
          logoSize: "lg",
          logoStyle: "ring",
          logoPosition: "beside",
          animatedTitle: false,
          primaryLabel: "Discord",
          secondaryLabel: "Über uns",
          secondaryUrl: "#ueber-uns",
        }),
        container(
          [
            column(52, [
              block<TextBlock>("text", {
                anchor: "ueber-uns",
                tag: "Über uns",
                title: "Über uns",
                body: `[Wer wir sind] …\n\n[Wie wir entstanden sind] …\n\n[Was uns wichtig ist] …`,
                padding: "none",
                anim: "slide-right",
              }),
            ]),
            column(48, [
              block<TextBlock>("text", {
                anchor: "organisation",
                tag: "Unsere Organisation",
                title: "Unsere Organisation",
                body: `[Struktur] …\n\n[Rollen & Verantwortung] …\n\n[Regeln in Kurzform] …`,
                padding: "none",
                anim: "slide-left",
              }),
            ]),
          ],
          { padding: "lg", gap: 40, alignY: "start" },
        ),
        divider("line"),
        block<TextBlock>("text", {
          anchor: "crew",
          tag: "Unsere Crew",
          title: "Unsere Crew",
          body: `[Beschreibt eure Mitglieder: Spielzeiten, Sprache, Umgangston, wie ihr Neulinge einarbeitet.]`,
          align: "center",
          padding: "lg",
          width: "narrow",
        }),
        block<TeamBlock>("team", {
          columns: 3,
          padding: "lg",
          stagger: 70,
          items: [
            { name: "[Handle]", role: "[Rolle]" },
            { name: "[Handle]", role: "[Rolle]" },
            { name: "[Handle]", role: "[Rolle]" },
          ],
        }),
        divider("line"),
        block<TextBlock>("text", {
          anchor: "taetigkeit",
          tag: "Unsere Tätigkeit",
          title: "Unsere Tätigkeit",
          body: `[Womit verbringt ihr eure Abende im Verse? Nennt 3–5 Schwerpunkte und wie man mitmacht.]`,
          align: "center",
          padding: "lg",
          width: "narrow",
        }),
        block<FeaturesBlock>("features", {
          columns: 4,
          padding: "lg",
          bg: "dark",
          stagger: 70,
          items: [
            { title: "[Tätigkeit 1]", text: "[Kurzbeschreibung.]" },
            { title: "[Tätigkeit 2]", text: "[Kurzbeschreibung.]" },
            { title: "[Tätigkeit 3]", text: "[Kurzbeschreibung.]" },
            { title: "[Tätigkeit 4]", text: "[Kurzbeschreibung.]" },
          ],
        }),
        block<FaqBlock>("faq", {
          tag: "Fragen",
          title: "Häufige Fragen",
          padding: "lg",
          items: [
            { q: "[Muss ich feste Zeiten einhalten?]", a: "[Antwort.]" },
            { q: "[Brauche ich ein bestimmtes Schiff?]", a: "[Antwort.]" },
            { q: "[Wie läuft der Beitritt ab?]", a: "[Antwort.]" },
          ],
        }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
);

/* ---------- Weitere Layout-Stile mit denselben vier Kapiteln ------------ */

const CH = {
  about: {
    anchor: "ueber-uns",
    title: "Über uns",
    body: `[Wer wir sind] …\n\n[Unsere Geschichte] …\n\n[Was uns wichtig ist] …`,
  },
  org: {
    anchor: "organisation",
    title: "Unsere Organisation",
    body: `[Struktur & Abteilungen] …\n\n[Führung & Entscheidungen] …\n\n[Regeln in Kurzform] …`,
  },
  crew: {
    anchor: "crew",
    title: "Unsere Crew",
    body: `[Wer fliegt mit? Spielzeiten, Sprache, Umgangston, Einarbeitung von Neulingen.]`,
  },
  work: {
    anchor: "taetigkeit",
    title: "Unsere Tätigkeit",
    body: `[Schwerpunkte] …\n\n[Einsatzrhythmus] …\n\n[So macht man mit] …`,
  },
};

const teamItems = (n: number) =>
  Array.from({ length: n }, () => ({ name: "[Handle]", role: "[Rolle]" }));

const workItems = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    title: `[Tätigkeit ${i + 1}]`,
    text: "[Kurzbeschreibung: Was macht ihr dabei und für wen ist es interessant?]",
  }));

PAGE_TEMPLATES.push(
  {
    id: "chapters-magazine",
    name: "Kapitel · Magazin",
    description:
      "Die vier Kapitel als Magazin-Layout: breite Bento-Kacheln, großzügige Typo und ein Logo-Wasserzeichen.",
    tags: ["Über uns", "Magazin", "Bento", "Textvorlagen"],
    colors: { primary: "#f472b6", accent: "#38bdf8" },
    preview: [
      { kind: "hero", logo: "md" },
      { kind: "wide" },
      { kind: "cards", count: 2 },
      { kind: "bars", count: 2 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CALM,
      blocks: [
        hero({
          tag: "Magazin",
          title: org.name,
          subtitle: "[Ein Satz als Aufmacher – worum geht es bei euch?]",
          height: "half",
          padding: "xl",
          bg: "gradient",
          showLogo: true,
          logoSize: "lg",
          logoStyle: "badge",
          logoPosition: "above",
          alignX: "left",
          primaryLabel: "Discord beitreten",
          secondaryLabel: "Über uns",
          secondaryUrl: "#ueber-uns",
        }),
        block<TextBlock>("text", {
          ...CH.about,
          tag: "Kapitel 01",
          align: "left",
          padding: "xl",
          width: "wide",
        }),
        block<BentoBlock>("bento", {
          anchor: CH.org.anchor,
          tag: "Kapitel 02",
          title: CH.org.title,
          padding: "lg",
          bg: "grid",
          hoverFx: "tilt",
          stagger: 80,
          items: [
            { title: "[Führung]", text: "[Wer trifft Entscheidungen und wie?]", size: "lg" },
            { title: "[Abteilung 1]", text: "[Aufgaben & Ansprechpartner.]" },
            { title: "[Abteilung 2]", text: "[Aufgaben & Ansprechpartner.]" },
            { title: "[Regeln]", text: "[Die drei wichtigsten Grundsätze.]" },
          ],
        }),
        divider("line"),
        block<TextBlock>("text", {
          ...CH.crew,
          tag: "Kapitel 03",
          align: "left",
          padding: "lg",
          width: "wide",
        }),
        block<TeamBlock>("team", {
          columns: 4,
          padding: "lg",
          bg: "dark",
          stagger: 60,
          items: teamItems(4),
        }),
        block<QuoteBlock>("quote", {
          text: "[Zitat aus der Crew – warum fliegt man bei euch mit?]",
          author: "[Handle, Rolle]",
          padding: "lg",
        }),
        block<TextBlock>("text", {
          ...CH.work,
          tag: "Kapitel 04",
          align: "left",
          padding: "lg",
          width: "wide",
        }),
        block<FeaturesBlock>("features", {
          columns: 2,
          padding: "lg",
          bg: "grid",
          hoverFx: "lift",
          stagger: 70,
          items: workItems(4),
        }),
        block<BannerBlock>("banner", {
          tag: "Kontakt",
          title: "[Mitfliegen?]",
          subtitle: "[Schreib uns – wir antworten meist am selben Abend.]",
          height: "lg",
          logoWatermark: true,
          logoOpacity: 12,
          buttonLabel: "Discord beitreten",
          padding: "lg",
        }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "chapters-timeline",
    name: "Kapitel · Chronik",
    description:
      "Erzählende Variante: die vier Kapitel entlang eines Zeitstrahls mit Kennzahlen und Crew-Galerie.",
    tags: ["Über uns", "Chronik", "Erzählend", "Textvorlagen"],
    colors: { primary: "#22d3ee", accent: "#a78bfa" },
    preview: [
      { kind: "hero", logo: "lg" },
      { kind: "bars", count: 4 },
      { kind: "line" },
      { kind: "cards", count: 3 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CINEMATIC,
      blocks: [
        hero({
          tag: "Chronik",
          title: org.name,
          subtitle: "[Von der Gründung bis heute – unsere Geschichte in vier Kapiteln.]",
          height: "half",
          padding: "xl",
          bg: "stars",
          starfield: true,
          showLogo: true,
          logoSize: "xl",
          logoStyle: "glow",
          logoPosition: "above",
          alignX: "center",
          animatedTitle: true,
          primaryLabel: "Discord beitreten",
          secondaryLabel: "Über uns",
          secondaryUrl: "#ueber-uns",
        }),
        block<TextBlock>("text", {
          ...CH.about,
          tag: "Kapitel 01",
          align: "center",
          padding: "lg",
          width: "narrow",
        }),
        block<TimelineBlock>("timeline", {
          tag: "Kapitel 02",
          title: CH.org.title,
          anchor: CH.org.anchor,
          padding: "lg",
          items: [
            { date: "[Jahr]", title: "[Gründung]", text: "[Wie alles begann.]" },
            { date: "[Jahr]", title: "[Struktur entsteht]", text: "[Abteilungen, Rollen, Regeln.]" },
            { date: "[Jahr]", title: "[Wachstum]", text: "[Was sich verändert hat.]" },
            { date: "[Heute]", title: "[Wo wir stehen]", text: "[Aktueller Stand & Ziele.]" },
          ],
        }),
        block<StatsBlock>("stats", {
          padding: "md",
          bg: "dark",
          stagger: 80,
          items: [
            { value: "[Jahr]", label: "Gegründet" },
            { value: "[00]", label: "Mitglieder" },
            { value: "[00]", label: "Schiffe" },
            { value: "[00]", label: "Einsätze / Monat" },
          ],
        }),
        divider(),
        block<TextBlock>("text", {
          ...CH.crew,
          tag: "Kapitel 03",
          align: "center",
          padding: "lg",
          width: "narrow",
        }),
        block<TeamBlock>("team", {
          columns: 3,
          padding: "lg",
          stagger: 70,
          items: teamItems(6),
        }),
        divider("line"),
        block<TextBlock>("text", {
          ...CH.work,
          tag: "Kapitel 04",
          align: "center",
          padding: "lg",
          width: "narrow",
        }),
        block<FeaturesBlock>("features", {
          columns: 3,
          padding: "lg",
          bg: "grid",
          hoverFx: "glow",
          stagger: 70,
          items: workItems(3),
        }),
        block<SectionBlock>("calendar", { padding: "lg", limit: 5 }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "chapters-zigzag",
    name: "Kapitel · Zickzack",
    description:
      "Jedes Kapitel als zweispaltiger Abschnitt mit wechselnder Leserichtung – ruhig, klar und gut scanbar.",
    tags: ["Über uns", "Zweispaltig", "Zickzack", "Textvorlagen"],
    colors: { primary: "#34d399", accent: "#f59e0b" },
    preview: [
      { kind: "hero", logo: "side" },
      { kind: "split" },
      { kind: "split" },
      { kind: "cards", count: 4 },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CALM,
      blocks: [
        hero({
          tag: "Portrait",
          title: org.name,
          subtitle: "[Kurzbeschreibung eurer Orga in einem Satz.]",
          height: "half",
          padding: "xl",
          bg: "glow",
          showLogo: true,
          logoSize: "lg",
          logoStyle: "ring",
          logoPosition: "beside",
          primaryLabel: "Discord beitreten",
          secondaryLabel: "Über uns",
          secondaryUrl: "#ueber-uns",
        }),
        container(
          [
            column(55, [
              block<TextBlock>("text", {
                ...CH.about,
                tag: "01",
                padding: "none",
                anim: "slide-right",
              }),
            ]),
            column(45, [
              block<StatsBlock>("stats", {
                padding: "none",
                stagger: 80,
                items: [
                  { value: "[Jahr]", label: "Gegründet" },
                  { value: "[00]", label: "Mitglieder" },
                  { value: "[DE/EN]", label: "Sprache" },
                  { value: "[00]", label: "Schiffe" },
                ],
              }),
            ]),
          ],
          { padding: "lg", gap: 48, alignY: "center" },
        ),
        divider("line"),
        container(
          [
            column(45, [
              block<FeaturesBlock>("features", {
                columns: 2,
                padding: "none",
                stagger: 70,
                hoverFx: "lift",
                items: [
                  { title: "[Abteilung 1]", text: "[Aufgaben & Ansprechpartner.]" },
                  { title: "[Abteilung 2]", text: "[Aufgaben & Ansprechpartner.]" },
                  { title: "[Abteilung 3]", text: "[Aufgaben & Ansprechpartner.]" },
                ],
              }),
            ]),
            column(55, [
              block<TextBlock>("text", {
                ...CH.org,
                tag: "02",
                padding: "none",
                anim: "slide-left",
              }),
            ]),
          ],
          { padding: "lg", gap: 48, alignY: "center" },
        ),
        divider("line"),
        container(
          [
            column(55, [
              block<TextBlock>("text", {
                ...CH.crew,
                tag: "03",
                padding: "none",
                anim: "slide-right",
              }),
            ]),
            column(45, [
              block<QuoteBlock>("quote", {
                text: "[Zitat eines Mitglieds über die Crew.]",
                author: "[Handle, Rolle]",
                padding: "none",
              }),
            ]),
          ],
          { padding: "lg", gap: 48, alignY: "center" },
        ),
        block<TeamBlock>("team", {
          columns: 4,
          padding: "lg",
          bg: "dark",
          stagger: 60,
          items: teamItems(4),
        }),
        divider("line"),
        container(
          [
            column(45, [
              block<BentoBlock>("bento", {
                padding: "none",
                hoverFx: "lift",
                stagger: 70,
                items: [
                  { title: "[Tätigkeit 1]", text: "[Kurzbeschreibung.]", size: "lg" },
                  { title: "[Tätigkeit 2]", text: "[Kurzbeschreibung.]" },
                  { title: "[Tätigkeit 3]", text: "[Kurzbeschreibung.]" },
                ],
              }),
            ]),
            column(55, [
              block<TextBlock>("text", {
                ...CH.work,
                tag: "04",
                padding: "none",
                anim: "slide-left",
              }),
            ]),
          ],
          { padding: "lg", gap: 48, alignY: "center" },
        ),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
  {
    id: "chapters-onepager",
    name: "Kapitel · Kompakt",
    description:
      "Alles auf einer kurzen Seite: die vier Kapitel knapp gehalten, ideal für schnelle Vorstellung und Recruiting.",
    tags: ["Über uns", "Kompakt", "Recruiting", "Textvorlagen"],
    colors: { primary: "#60a5fa", accent: "#e879f9" },
    preview: [
      { kind: "hero", logo: "md" },
      { kind: "cards", count: 4 },
      { kind: "bars", count: 2 },
      { kind: "wide" },
    ],
    build: (org) => ({
      version: 2,
      effects: EFFECTS_CALM,
      blocks: [
        hero({
          tag: "Kurzprofil",
          title: org.name,
          subtitle: "[Wer ihr seid, was ihr macht – in einem Satz.]",
          height: "auto",
          padding: "lg",
          bg: "dark",
          showLogo: true,
          logoSize: "md",
          logoStyle: "plain",
          logoPosition: "above",
          alignX: "center",
          primaryLabel: "Discord beitreten",
        }),
        block<FeaturesBlock>("features", {
          tag: "Überblick",
          title: "Unsere vier Kapitel",
          columns: 4,
          padding: "lg",
          bg: "grid",
          stagger: 60,
          hoverFx: "lift",
          items: [
            { title: "Über uns", text: "[Ein bis zwei Sätze zu eurer Geschichte.]" },
            { title: "Unsere Organisation", text: "[Struktur, Führung, Regeln in Kürze.]" },
            { title: "Unsere Crew", text: "[Wer fliegt mit, wann seid ihr aktiv?]" },
            { title: "Unsere Tätigkeit", text: "[Eure Schwerpunkte im Verse.]" },
          ],
        }),
        block<TextBlock>("text", {
          ...CH.about,
          tag: "01",
          align: "center",
          padding: "md",
          width: "narrow",
        }),
        block<TextBlock>("text", {
          ...CH.org,
          tag: "02",
          align: "center",
          padding: "md",
          width: "narrow",
        }),
        block<TextBlock>("text", {
          ...CH.crew,
          tag: "03",
          align: "center",
          padding: "md",
          width: "narrow",
        }),
        block<TeamBlock>("team", {
          columns: 3,
          padding: "md",
          stagger: 60,
          items: teamItems(3),
        }),
        block<TextBlock>("text", {
          ...CH.work,
          tag: "04",
          align: "center",
          padding: "md",
          width: "narrow",
        }),
        block<FaqBlock>("faq", {
          tag: "Fragen",
          title: "Häufige Fragen",
          padding: "lg",
          items: [
            { q: "[Wie läuft der Beitritt ab?]", a: "[Antwort.]" },
            { q: "[Gibt es feste Zeiten?]", a: "[Antwort.]" },
            { q: "[Brauche ich ein bestimmtes Schiff?]", a: "[Antwort.]" },
          ],
        }),
        block<BannerBlock>("banner", {
          tag: "Kontakt",
          title: "[Bereit für den ersten Flug?]",
          subtitle: "[Meldet euch auf Discord.]",
          height: "md",
          logoWatermark: true,
          logoOpacity: 12,
          buttonLabel: "Discord beitreten",
          padding: "lg",
        }),
        block<JoinBlock>("join", { padding: "lg" }),
      ],
    }),
  },
);

export function getTemplate(id: TemplateId): PageTemplate | undefined {
  return PAGE_TEMPLATES.find((t) => t.id === id);
}