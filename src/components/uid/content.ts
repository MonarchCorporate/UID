export const UID_NAME = "United Imperial Dominion";
export const UID_CLAIM = "Gemeinsam stärker. Strategisch vereint.";
export const UID_MOTTO = "Independent Organizations. United Purpose. Imperial Strength.";
export const UID_DISCORD = "https://discord.gg/";

export const intro = [
  "Die United Imperial Dominion, kurz UID, ist eine Community unabhängiger Organisationen innerhalb des Star-Citizen-Universums.",
  "Unser Ziel ist es, unabhängige Organisationen miteinander zu verbinden, Ressourcen zu bündeln und komplexe Operationen gemeinsam erfolgreich durchzuführen.",
  "Dabei bleibt jede Mitgliedsorganisation eigenständig. Die UID übernimmt keine Kontrolle über ihre Mitglieder, sondern schafft eine gemeinsame strategische Struktur, in der Kooperation, Koordination und gegenseitige Unterstützung freiwillig ermöglicht werden.",
];

export const communityGoals = [
  "Das Star-Citizen-Universum stellt Organisationen vor Herausforderungen, die allein nur schwer oder mit unverhältnismäßig hohem Aufwand zu bewältigen sind.",
  "Großangelegte militärische Operationen, umfangreiche Handelsketten, industrielle Projekte, logistische Einsätze oder die Sicherung ganzer Gebiete erfordern Personal, Schiffe, Informationen und eine verlässliche Koordination.",
  "Die United Imperial Dominion bringt Organisationen mit unterschiedlichen Fähigkeiten zusammen und ermöglicht ihnen, gemeinsam größere Ziele zu erreichen.",
];

export const missionIntro = [
  "Die UID schafft ein stabiles Netzwerk aus spezialisierten Organisationen, die bei Bedarf gemeinsam handeln.",
  "Wir verbinden militärische Einheiten, Handelsorganisationen, Industrieverbände, Logistikgruppen, medizinische Dienste, Bergungsunternehmen, Forschungsteams und weitere spezialisierte Gemeinschaften.",
  "Durch abgestimmte Strukturen und eine gemeinsame Einsatzplanung entstehen Möglichkeiten, die einer einzelnen Organisation oft nicht zur Verfügung stehen.",
];

export const missionPoints = [
  "Zusammenarbeit über Organisationen hinweg zu fördern",
  "Ressourcen und Fähigkeiten effizient zu bündeln",
  "komplexe Operationen gemeinsam zu planen",
  "Mitgliedsorganisationen bei großen Vorhaben zu unterstützen",
  "gemeinsame Interessen und Einsatzgebiete zu schützen",
  "langfristige Partnerschaften zwischen Organisationen aufzubauen",
];

export const whatIsUid = [
  "Die United Imperial Dominion ist keine übergeordnete Organisation mit Weisungsbefugnis.",
  "Sie ist ein freiwilliger Community unabhängiger Star-Citizen-Organisationen.",
];

export const orgKeeps = [
  "ihre eigene Führung",
  "ihre eigene Identität",
  "ihre internen Strukturen",
  "ihre Mitglieder",
  "ihre Ausrichtung",
  "ihre eigenen Ziele und Entscheidungen",
];

export const whatIsUidOutro = [
  "Die UID stellt den Rahmen für gemeinsame Projekte und Operationen bereit.",
  "Mitgliedsorganisationen können sich an Einsätzen beteiligen, wenn diese zu ihren Interessen, Ressourcen und Spezialisierungen passen.",
  "Die Zusammenarbeit ist freiwillig: Niemand ist anderen Mitgliedern oder Organisationen verpflichtet.",
  "Sie basiert auf Vertrauen, Verlässlichkeit und gegenseitigem Respekt.",
];

export const noObligations = [
  "Die Mitgliedschaft in der United Imperial Dominion erzeugt keine Verpflichtungen gegenüber anderen Mitgliedern oder Organisationen.",
  "Jede Teilnahme an Einsätzen, Projekten oder gemeinsamen Aktionen erfolgt freiwillig und kann jederzeit ohne Konsequenzen beendet werden.",
];

export const autonomy = [
  "Die Mitgliedschaft in der United Imperial Dominion bedeutet keine Aufgabe der eigenen Identität.",
  "Sie schafft auch keine Verpflichtungen gegenüber anderen Mitgliedern oder Organisationen.",
  "Die UID greift nicht in die alltägliche Führung ihrer Mitgliedsorganisationen ein.",
  "Interne Ränge, Regeln und Strukturen bleiben vollständig bei der jeweiligen Organisation.",
  "Gemeinsame Vorgaben gelten ausschließlich für Operationen, Projekte und Bereiche, an denen eine Organisation freiwillig teilnimmt.",
  "Die UID versteht sich als verbindende strategische Ebene und nicht als übergeordnete Kontrolleinheit.",
];

export type Domain = {
  id: string;
  n: string;
  title: string;
  lead: string[];
  bullets?: string[];
  outro?: string[];
};

export const domains: Domain[] = [
  {
    id: "militaer",
    n: "01",
    title: "Militärische Operationen",
    lead: [
      "Gemeinsame Flottenverbände ermöglichen die Durchführung großer offensiver und defensiver Operationen.",
      "Mitgliedsorganisationen können spezialisierte Einheiten bereitstellen, darunter:",
    ],
    bullets: [
      "Kampfschiffe",
      "Trägerverbände",
      "Bodentruppen",
      "Aufklärungseinheiten",
      "Eskorten",
      "Sicherheitskräfte",
      "Einsatzleitungen",
    ],
    outro: [
      "Durch eine abgestimmte Kommandostruktur können auch große Verbände effizient eingesetzt werden.",
    ],
  },
  {
    id: "handel",
    n: "02",
    title: "Handel und Versorgung",
    lead: [
      "Große Handelsoperationen benötigen mehr als einzelne Frachtschiffe.",
      "Die UID verbindet Händler, Logistiker, Sicherheitskräfte und Informationsnetzwerke zu leistungsfähigen Versorgungsketten.",
      "Gemeinsam können Mitgliedsorganisationen:",
    ],
    bullets: [
      "größere Warenmengen transportieren",
      "Konvois organisieren",
      "Handelsrouten absichern",
      "Versorgungspunkte aufbauen",
      "Material für gemeinsame Operationen bereitstellen",
      "auf Marktveränderungen reagieren",
    ],
  },
  {
    id: "industrie",
    n: "03",
    title: "Industrie und Ressourcenabbau",
    lead: [
      "Bergbau, Raffination, Produktion und Transport bilden die Grundlage großer industrieller Vorhaben.",
      "Innerhalb der UID können Organisationen ihre Produktionsketten miteinander verbinden.",
      "Eine Organisation übernimmt beispielsweise den Abbau, eine weitere die Raffination und eine andere den Transport oder die Absicherung.",
      "So entstehen vollständige Wertschöpfungsketten über Organisationen hinweg.",
    ],
  },
  {
    id: "logistik",
    n: "04",
    title: "Logistik",
    lead: [
      "Keine große Operation funktioniert ohne eine verlässliche Logistik.",
      "Die UID koordiniert bei Bedarf:",
    ],
    bullets: [
      "Treibstoffversorgung",
      "Munitionsnachschub",
      "Materialtransporte",
      "Flottenversorgung",
      "Reparaturkapazitäten",
      "medizinische Unterstützung",
      "Bergung und Rückführung",
    ],
    outro: [
      "Unsere Logistikstrukturen sollen sicherstellen, dass gemeinsame Operationen auch über längere Zeiträume aufrechterhalten werden können.",
    ],
  },
  {
    id: "aufklaerung",
    n: "05",
    title: "Erkundung und Aufklärung",
    lead: [
      "Informationen entscheiden über den Erfolg einer Mission.",
      "Erkundungs- und Aufklärungsorganisationen innerhalb der UID unterstützen die Community durch:",
    ],
    bullets: [
      "Gebietserkundung",
      "Kartierung",
      "Aufklärung feindlicher Bewegungen",
      "Suche nach Ressourcen",
      "Identifikation sicherer Routen",
      "Sammlung strategischer Informationen",
    ],
    outro: [
      "Diese Erkenntnisse können allen beteiligten Organisationen einen entscheidenden Vorteil verschaffen.",
    ],
  },
  {
    id: "medizin",
    n: "06",
    title: "Medizin und Rettung",
    lead: [
      "Bei gefährlichen Einsätzen müssen Rettung und medizinische Versorgung von Beginn an eingeplant werden.",
      "Spezialisierte Mitgliedsorganisationen können medizinische Schiffe, Rettungsteams und Evakuierungseinheiten bereitstellen.",
      "Dadurch erhalten gemeinsame Verbände eine professionelle Absicherung für Notfälle und Verluste.",
    ],
  },
  {
    id: "bergung",
    n: "07",
    title: "Bergung und Wiederherstellung",
    lead: [
      "Nach einer Schlacht oder einem industriellen Zwischenfall bleiben oft wertvolle Ressourcen, beschädigte Schiffe und verlorene Fracht zurück.",
      "Bergungsorganisationen unterstützen die UID bei:",
    ],
    bullets: [
      "der Sicherung von Wracks",
      "der Rückgewinnung von Materialien",
      "der Bergung verlorener Fracht",
      "der Unterstützung beschädigter Schiffe",
      "der Wiederherstellung von Einsatzbereitschaft",
    ],
  },
];

export const jointOps = [
  "Das Herzstück der United Imperial Dominion sind organisationsübergreifende Operationen.",
  "Diese können von der UID selbst oder von einer Mitgliedsorganisation vorgeschlagen werden.",
  "Nach der Vorstellung eines Vorhabens können sich passende Organisationen freiwillig beteiligen und ihre verfügbaren Kräfte anmelden.",
  "Anschließend werden Aufgaben, Zuständigkeiten und Ressourcen koordiniert.",
];

export const opComponents = [
  "einer Organisation für die Einsatzleitung",
  "mehreren militärischen Verbänden",
  "einer Logistikorganisation",
  "Handels- oder Transportschiffen",
  "medizinischen Einheiten",
  "Bergungs- und Reparaturteams",
  "Aufklärern und Informationsdiensten",
];

export const poolingIntro = [
  "Nicht jede Organisation muss über sämtliche Schiffe, Spieler oder Fähigkeiten verfügen.",
  "Durch die UID erhalten Mitgliedsorganisationen Zugang zu einem Netzwerk, in dem fehlende Kapazitäten durch Partner ergänzt werden können.",
];

export const poolingQuestions = [
  "Eine militärische Organisation benötigt Transportkapazitäten?",
  "Eine Handelsorganisation benötigt eine Eskorte?",
  "Ein Industrieprojekt braucht zusätzliche Bergbauschiffe?",
  "Eine große Flotte benötigt medizinische und logistische Unterstützung?",
];

export const benefits = [
  {
    title: "Größere Einsatzmöglichkeiten",
    body: "Mitglieder können an Operationen teilnehmen, die allein nicht oder nur schwer durchführbar wären.",
  },
  {
    title: "Zugang zu spezialisierten Partnern",
    body: "Organisationen erhalten Kontakt zu verlässlichen Gruppen aus verschiedenen Tätigkeitsbereichen.",
  },
  {
    title: "Effizientere Ressourcennutzung",
    body: "Schiffe, Personal, Informationen und Infrastruktur können bei gemeinsamen Einsätzen gezielt kombiniert werden.",
  },
  {
    title: "Strategischer Informationsaustausch",
    body: "Relevante Informationen über Bedrohungen, Handelsmöglichkeiten, Ressourcen oder Einsatzgebiete können innerhalb der Community geteilt werden.",
  },
  {
    title: "Gegenseitige Unterstützung",
    body: "Mitgliedsorganisationen können bei Angriffen, Engpässen oder umfangreichen Projekten Unterstützung anfragen.",
  },
  {
    title: "Gemeinsame Präsenz",
    body: "Durch koordinierte Verbände entsteht eine deutlich stärkere Präsenz im Star-Citizen-Universum.",
  },
];

export const platformIntro = [
  "Mitgliedsorganisationen erhalten Zugang zum Backoffice der UID — einer vollständigen Verwaltungsplattform für Organisationen im Verse.",
  "Alles läuft an einem Ort: Einsatzplanung, Lagerhaltung, Produktion, Handel und die eigene öffentliche Präsenz.",
];

export const platformBenefits = [
  {
    n: "01",
    title: "Eigene Landingpage",
    body: "Jede Organisation erhält eine eigene öffentliche Seite mit Logo, Farben, Flotte, Eventkalender und Shop — gestaltbar über einen Seiten-Editor mit Live-Vorschau, Containern und fertigen Elementen. Kein externes Hosting nötig.",
  },
  {
    n: "02",
    title: "Orga-Verwaltung",
    body: "Mitglieder, Ränge und feingranulare Rechte verwalten, Verantwortlichkeiten sauber verteilen und den Überblick über die gesamte Organisation behalten.",
  },
  {
    n: "03",
    title: "Inventar & Orgalager",
    body: "Persönliches Inventar und Orgalager mit Halter, Standort und Qualität pro Position. Bestände lassen sich sperren, freigeben, anfragen und in Echtzeit nachverfolgen.",
  },
  {
    n: "04",
    title: "Orga-Shop & Bestellungen",
    body: "Bestände zum Verkauf freigeben, Reservierungen automatisch auf konkrete Lagerpositionen buchen und Bestellungen über einen klaren Statusworkflow mit Historie abwickeln.",
  },
  {
    n: "05",
    title: "Einsatzplanung & Boardcomputer",
    body: "Einsätze sofort starten oder als Event planen, Teilnehmer und Schiffe koordinieren — inklusive Boardcomputer pro Schiff mit Stationen, Crew und Fracht.",
  },
  {
    n: "06",
    title: "Integrierter Voice-Chat",
    body: "Voice-Kanäle pro Einsatz und pro Schiff auf Knopfdruck, mit Push-to-Talk und Voice-Aktivierung — Gruppenkommunikation ohne Umwege.",
  },
  {
    n: "07",
    title: "Handel & Routenplaner",
    body: "Aktuelle Rohstoffpreise, Terminalübersichten, Routenplaner mit Filtern und ein Verkaufsplaner, der zeigt, wo sich die eigene Ladung am besten verkaufen lässt.",
  },
  {
    n: "08",
    title: "Crafting & Farm-Listen",
    body: "Blueprints, Materialien, Qualitäten und Bezugsquellen an einem Ort — mit teilbaren Farm-Listen, die den Materialbedarf mehrerer Spieler bündeln.",
  },
  {
    n: "09",
    title: "Flotte & Loadout-Editor",
    body: "Schiffskatalog mit Vergleich, Orga- und Mitgliederflotten sowie ein Loadout-Editor mit Werks-Loadouts und Live-Berechnung von Bewaffnung und Komponenten.",
  },
];

export const structure = [
  {
    title: "Dominion Council",
    body: [
      "Der Dominion Council bildet das zentrale strategische Gremium der UID.",
      "In ihm sind die Mitgliedsorganisationen vertreten. Der Rat bespricht gemeinsame Ziele, größere Operationen, neue Partnerschaften und strategische Entwicklungen.",
    ],
  },
  {
    title: "Strategic Command",
    body: [
      "Das Strategic Command übernimmt die Planung und Koordination organisationsübergreifender Operationen.",
      "Es erstellt keine dauerhaften Vorgaben für die Mitgliedsorganisationen, sondern koordiniert ausschließlich gemeinsame Einsätze.",
    ],
  },
  {
    title: "Operational Divisions",
    body: [
      "Für verschiedene Tätigkeitsbereiche können spezialisierte Abteilungen geschaffen werden.",
      "Die jeweiligen Bereiche werden gemeinsam mit den spezialisierten Mitgliedsorganisationen aufgebaut.",
    ],
  },
];

export const divisions = [
  "Defense Command",
  "Industrial Command",
  "Logistics Command",
  "Trade Command",
  "Exploration Command",
  "Medical Command",
  "Intelligence Command",
];

export const principles = [
  { title: "Loyalität", body: "Vereinbarungen und gemeinsame Entscheidungen müssen verlässlich eingehalten werden." },
  { title: "Respekt", body: "Jede Mitgliedsorganisation wird unabhängig von ihrer Größe und Spezialisierung respektiert." },
  { title: "Eigenständigkeit", body: "Die interne Souveränität jeder Organisation bleibt erhalten." },
  { title: "Zusammenarbeit", body: "Gemeinsame Ziele stehen bei gemeinsamen Operationen über individuellen Interessen." },
  { title: "Verlässlichkeit", body: "Zugesagte Kräfte und Ressourcen müssen im vereinbarten Umfang bereitgestellt werden." },
  { title: "Diskretion", body: "Interne Informationen und strategische Planungen dürfen nicht ohne Freigabe weitergegeben werden." },
  { title: "Professionalität", body: "Gemeinsame Operationen werden vorbereitet, strukturiert und mit klaren Zuständigkeiten durchgeführt." },
];

export const suitableOrgs = [
  "militärische Organisationen",
  "Sicherheitsunternehmen",
  "Handelsorganisationen",
  "Transport- und Logistikgruppen",
  "Bergbauorganisationen",
  "Industrieverbände",
  "medizinische Organisationen",
  "Bergungsunternehmen",
  "Erkundungsorganisationen",
  "Rollenspielorganisationen",
  "gemischte Organisationen",
];

export const membershipChecks = [
  "Tätigkeitsbereiche und Spezialisierungen",
  "Größe und Aktivität",
  "vorhandene Schiffe und Kapazitäten",
  "interne Struktur",
  "bisherige Erfahrungen",
  "Erwartungen an die Community",
  "mögliche Beiträge zu gemeinsamen Operationen",
];

export const smallOrgs = [
  "Nicht jede Organisation verfügt über eine große Flotte oder hunderte Mitglieder.",
  "Auch kleinere spezialisierte Gruppen können einen entscheidenden Beitrag leisten.",
  "Ein erfahrenes Rettungsteam, eine verlässliche Aufklärungseinheit, ein einzelner schwerer Frachter oder eine spezialisierte Kampfgruppe können den Erfolg einer gesamten Operation beeinflussen.",
  "Die Stärke der UID entsteht nicht allein durch Größe.",
  "Sie entsteht durch die Kombination unterschiedlicher Fähigkeiten.",
];

export const finaleIntro = [
  "Das Star-Citizen-Universum ist zu groß und zu komplex, um jede Herausforderung allein zu bewältigen.",
  "Die United Imperial Dominion vereint Organisationen, die bereit sind, über die Grenzen ihrer eigenen Gemeinschaft hinauszudenken.",
];

export const finaleLines = [
  "Wir schaffen Verbindungen.",
  "Wir bündeln Ressourcen.",
  "Wir koordinieren Flotten.",
  "Wir sichern Handelswege.",
  "Wir errichten industrielle Strukturen.",
  "Wir reagieren gemeinsam auf Bedrohungen.",
];

export const joinQuestions = [
  "Eure Organisation sucht verlässliche Partner für größere Vorhaben?",
  "Ihr möchtet an organisationsübergreifenden Operationen teilnehmen?",
  "Ihr verfügt über Fähigkeiten, Schiffe oder Ressourcen, die innerhalb einer strategischen Community eingesetzt werden können?",
];

export const joinOutro = [
  "Dann nehmt Kontakt mit uns auf und stellt eure Organisation vor.",
  "Gemeinsam erreichen wir, was allein unmöglich erscheint.",
];

export const backofficeShowcaseIntro = [
  "Die UID bietet mehr als eine Community — sie bietet ein leistungsfähiges Backoffice, das den Alltag einer Star-Citizen-Organisation erheblich vereinfacht.",
  "Egal ob Einsatzplanung, Lagerhaltung, Handel, Kommunikation oder öffentliche Präsentation: Alle Werkzeuge laufen an einem zentralen Ort und sind speziell auf die Bedürfnisse von Organisationen im Verse ausgerichtet.",
];

export const backofficeWhyJoin = [
  "Eigenständigkeit bleibt erhalten — eure Organisation bleibt eure Organisation",
  "Kein externes Hosting oder Technik-Know-how nötig",
  "Alle Mitglieder arbeiten in einer einheitlichen, sicheren Umgebung",
  "Discord-Integration erleichtert Kommunikation und Verwaltung",
  "Features wachsen mit der Community und den Bedürfnissen der Mitgliedsorgas",
];

export const backofficeHighlights = [
  {
    n: "01",
    title: "Eigene Landingpage",
    body: "Öffentliche Präsenz mit Logo, Farben, Flotte, Eventkalender und Shop — direkt aus dem Backoffice heraus verwaltbar.",
  },
  {
    n: "02",
    title: "Einsatzplanung",
    body: "Missionen als Lobby oder Event planen, Teilnehmer und Schiffe koordinieren, öffentliche Events im Kalender veröffentlichen.",
  },
  {
    n: "03",
    title: "Orgalager & Inventar",
    body: "Bestände mit Halter, Standort und Qualität erfassen. Sperren, anfragen, bestellen und in Echtzeit nachverfolgen.",
  },
  {
    n: "04",
    title: "Voice-Chat & Boardcomputer",
    body: "Voice-Kanäle pro Einsatz und Schiff auf Knopfdruck, plus Boardcomputer mit Crew, Stationen und Fracht.",
  },
  {
    n: "05",
    title: "Handel & Routenplaner",
    body: "Aktuelle Rohstoffpreise, Terminal-Filter, Verkaufsplaner und ein Routenplaner mit individuellen Einstellungen.",
  },
  {
    n: "06",
    title: "Flotte & Loadout-Editor",
    body: "Orga- und Mitgliederflotten verwalten, Schiffe vergleichen und Loadouts mit Live-Berechnung konfigurieren.",
  },
];

export const backofficeDemoIntro = {
  eyebrow: "10 // Live-Demo",
  title: "Backoffice ausprobieren",
  body: "Klicke dich durch einen kurzen Beispiel-Einsatz und sieh, wie Einsatzplanung, Lager, Handel, Flotte und Voice-Chat zusammenspielen.",
  orgName: "Int. Corporation",
  orgRole: "Admin",
  greetingName: "Kommandant",
};

export const backofficeDemoMission = {
  title: "Aegis Retaliator Konvoi",
  date: "Heute, 20:30 Uhr",
  objective: "Bergung und Eskorte in Aaron’s Halo",
  ships: [
    { name: "Aegis Retaliator Base", pilot: "Commander", role: "Einsatzleitung / Eskorte" },
    { name: "Caterpillar", pilot: "Logistics", role: "Fracht / Bergung" },
    { name: "Vanguard Warden", pilot: "Wingman", role: "Jäger-Eskorte" },
  ],
  materials: [
    { name: "Quantum Fuel", qty: 600, unit: "L", requested: false },
    { name: "Med-Gel", qty: 40, unit: "Einheiten", requested: false },
    { name: "Ammunition S5", qty: 1200, unit: "Schuss", requested: false },
  ],
  route: {
    from: "HUR-L3",
    to: "Aaron’s Halo Belt Alpha",
    distance: "4.2 Mkm",
    profit: "~ 142 000 aUEC",
  },
};

/**
 * Gemeinsame Beispieldaten für die Backoffice-Demo.
 * Einsatz, Orgalager, Handelsrouten und Voice referenzieren dieselben
 * Schiffe, Squads und Materialien, damit alles konsistent bleibt.
 */
export const backofficeDemoSquads = [
  {
    id: "alpha",
    name: "Squad Alpha · Eskorte",
    lead: "Commander",
    ships: [
      { id: "reta", name: "Aegis Retaliator Base", pilot: "Commander", role: "Einsatzleitung" },
      { id: "warden", name: "Vanguard Warden", pilot: "Wingman", role: "Jäger-Eskorte" },
    ],
  },
  {
    id: "bravo",
    name: "Squad Bravo · Bergung",
    lead: "Logistics",
    ships: [
      { id: "cat", name: "Caterpillar", pilot: "Logistics", role: "Fracht / Bergung" },
      { id: "vulture", name: "Drake Vulture", pilot: "Salvor", role: "Salvage" },
    ],
  },
] as const;

/** Stationen innerhalb eines Schiffes — jede Station ist ein eigener Voice-Kanal. */
export const backofficeDemoStations: Record<string, { id: string; name: string; crew: string }[]> = {
  reta: [
    { id: "reta-cockpit", name: "Cockpit", crew: "Commander" },
    { id: "reta-turret", name: "Turrets", crew: "Gunner Vex" },
    { id: "reta-eng", name: "Engineering", crew: "Tech Rhen" },
  ],
  warden: [{ id: "warden-cockpit", name: "Cockpit", crew: "Wingman" }],
  cat: [
    { id: "cat-cockpit", name: "Cockpit", crew: "Logistics" },
    { id: "cat-cargo", name: "Frachtdeck", crew: "Loader Kay" },
  ],
  vulture: [{ id: "vulture-cockpit", name: "Cockpit", crew: "Salvor" }],
};

export const backofficeDemoStock = [
  {
    name: "Quantum Fuel",
    qty: "600 L",
    holder: "Logistics",
    loc: "HUR-L3 · Hangar 4",
    q: "A",
    ship: "Caterpillar",
  },
  {
    name: "Med-Gel",
    qty: "40 Stk",
    holder: "Medic",
    loc: "HUR-L3 · Hangar 4",
    q: "B",
    ship: "Aegis Retaliator Base",
  },
  {
    name: "Ammunition S5",
    qty: "1 200 Schuss",
    holder: "Commander",
    loc: "HUR-L3 · Hangar 4",
    q: "A",
    ship: "Vanguard Warden",
  },
  {
    name: "Salvage RMC",
    qty: "96 SCU",
    holder: "Salvor",
    loc: "Aaron’s Halo · Drake Vulture",
    q: "A",
    ship: "Drake Vulture",
  },
];

export const backofficeDemoRoutes = [
  {
    commodity: "Salvage RMC",
    from: "Aaron’s Halo Belt Alpha",
    to: "ARC-L1",
    profit: "142 000",
    scu: 96,
    ship: "Caterpillar",
  },
  {
    commodity: "Quantum Fuel",
    from: "HUR-L3",
    to: "Aaron’s Halo Belt Alpha",
    profit: "18 400",
    scu: 24,
    ship: "Caterpillar",
  },
  {
    commodity: "Konstruktionsmaterial",
    from: "Everus Harbor",
    to: "Baijini Point",
    profit: "74 900",
    scu: 96,
    ship: "Drake Vulture",
  },
];
/**
 * Detaildaten der Demo-Schiffe – spiegeln die Felder wider, die "Meine Flotte"
 * im echten Backoffice aus Katalog + Hangar-Eintrag zusammenführt.
 */
export const backofficeDemoShipDetails: Record<
  string,
  {
    manufacturer: string;
    code: string;
    classification: string;
    size: string;
    crew: string;
    length: string;
    cargo: string;
    location: string;
    notes: string;
    source: "fleetyards" | "manuell";
    customName?: string;
    image: string;
    focus: string;
    crewRange: string;
    pledge: string;
    status: string;
    description: string;
  }
> = {
  reta: {
    image: "https://api.fleetyards.net/files/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6IjZkOGIzMTcyLTQzNTItNDgyNi1iMmJmLWIzMzAzM2IwMzAxYSIsInB1ciI6ImJsb2JfaWQifX0=--552a6f418a70899953b62e3480d6211691d6a98c/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJ3ZWJwIiwicmVzaXplX3RvX2xpbWl0IjpbMjAwMCwyMDAwXSwic2F2ZXIiOnsicXVhbGl0eSI6ODJ9fSwicHVyIjoidmFyaWF0aW9uIn19--9e4dde4ede53ae8d7aaa76291a526d5899d4a0fa/Aegis_RETALIATIOR_Base-86dcd2a1-fc57-4201-b03d-1e50bc60adf8-daab816c-65a7-48aa-9fdb-fbf96c00ab97.jpg/",
    focus: "Modular Gunship",
    crewRange: "4\u20137",
    pledge: "$175",
    status: "Flugbereit",
    description: "Einer der st\u00e4rksten Warbirds der UEE Navy: Der Retaliator wurde von Grund auf entwickelt, um gegnerische Capital Ships auszuschalten. Die Basisversion l\u00e4sst sich mit Modulen auf Kampf- oder Utility-Eins\u00e4tze umr\u00fcsten.",
    manufacturer: "Aegis Dynamics",
    code: "AEGS",
    classification: "Bomber",
    size: "Large",
    crew: "6",
    length: "61,0 m",
    cargo: "48 SCU",
    location: "HUR-L3 · Hangar 4",
    notes: "Einsatzleitung – Torpedobucht auf Fracht umgebaut.",
    source: "fleetyards",
    customName: "Iron Verdict",
  },
  warden: {
    image: "https://api.fleetyards.net/files/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6ImVmYzk4OTAyLTI4NGItNDQ4Ni05Mjc1LWRhZTc4NTcyNTIwNiIsInB1ciI6ImJsb2JfaWQifX0=--5840f1d71c5ca402981e5238a809aa953ce63608/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJ3ZWJwIiwicmVzaXplX3RvX2xpbWl0IjpbMjAwMCwyMDAwXSwic2F2ZXIiOnsicXVhbGl0eSI6ODJ9fSwicHVyIjoidmFyaWF0aW9uIn19--9e4dde4ede53ae8d7aaa76291a526d5899d4a0fa/ILW__0026_14_Vanguard-Warden-f67a38b7-407b-4f2d-86f4-a9a47a491efc-ed6c3954-1f77-440c-a248-748519b29a1d.jpg/",
    focus: "Heavy Fighter",
    crewRange: "2",
    pledge: "$260",
    status: "Flugbereit",
    description: "Der A3G Vanguard Warden ist einer der vielseitigsten Langstreckenj\u00e4ger von Aegis Dynamics. Schwerer Rahmen, harte Bewaffnung \u2013 an vorderster Front jeder Angriffsoperation ein Biest.",
    manufacturer: "Aegis Dynamics",
    code: "AEGS",
    classification: "Heavy Fighter",
    size: "Medium",
    crew: "2",
    length: "24,0 m",
    cargo: "8 SCU",
    location: "HUR-L3 · Hangar 4",
    notes: "Eskorte, Loadout auf Langstrecke getrimmt.",
    source: "fleetyards",
  },
  cat: {
    image: "https://api.fleetyards.net/files/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6IjdmNDMyMjhiLWI3ZWItNDZmYi1hMzk0LWQ0OGE3NWZmYzM1MiIsInB1ciI6ImJsb2JfaWQifX0=--fe4926187f26a9b10f0165a0405ac8b7629c386a/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJ3ZWJwIiwicmVzaXplX3RvX2xpbWl0IjpbMjAwMCwyMDAwXSwic2F2ZXIiOnsicXVhbGl0eSI6ODJ9fSwicHVyIjoidmFyaWF0aW9uIn19--9e4dde4ede53ae8d7aaa76291a526d5899d4a0fa/Drake_Caterpillar_MoreBleed_Flip_opt-bf168a17-2996-4fc8-ad14-db74e0ac6f4d.jpg/",
    focus: "Heavy Freight",
    crewRange: "2\u20134",
    pledge: "$330",
    status: "Flugbereit",
    description: "Die Caterpillar von Drake Interplanetary ist ein zuverl\u00e4ssiges Multi-Role-Schiff: modularer Frachter, der weder bei Bewaffnung noch bei Anpassbarkeit spart.",
    manufacturer: "Drake Interplanetary",
    code: "DRAK",
    classification: "Transporter",
    size: "Large",
    crew: "5",
    length: "111,0 m",
    cargo: "576 SCU",
    location: "Area18 · IO-North",
    notes: "Frachtmodul für Bergungsgut reserviert.",
    source: "fleetyards",
  },
  vulture: {
    image: "https://api.fleetyards.net/files/representations/redirect/eyJfcmFpbHMiOnsiZGF0YSI6IjFiZjM3MmY3LTllNmEtNGJkNC05NjY4LTk0ZjljYTU4MThmNSIsInB1ciI6ImJsb2JfaWQifX0=--de59e18ba01916e0b8a8fc585e58750b403b8aaf/eyJfcmFpbHMiOnsiZGF0YSI6eyJmb3JtYXQiOiJ3ZWJwIiwicmVzaXplX3RvX2xpbWl0IjpbMjAwMCwyMDAwXSwic2F2ZXIiOnsicXVhbGl0eSI6ODJ9fSwicHVyIjoidmFyaWF0aW9uIn19--9e4dde4ede53ae8d7aaa76291a526d5899d4a0fa/Star_Citizen_Drake_Vulture_KF02_Lasers_16_9-83e2f281-3c05-442e-9047-2a6270862887-3ede6a98-e012-4e17-812a-9bdfa726f487.jpg/",
    focus: "Light Salvage",
    crewRange: "1",
    pledge: "$175",
    status: "Flugbereit",
    description: "Rauer, robuster Bergungsj\u00e4ger von Drake: Wracks aufrei\u00dfen, Materialien abtragen und sich im gro\u00dfen Nichts eine eigene Nische schaffen.",
    manufacturer: "Drake Interplanetary",
    code: "DRAK",
    classification: "Salvage",
    size: "Small",
    crew: "1",
    length: "38,0 m",
    cargo: "12 SCU",
    location: "—",
    notes: "",
    source: "manuell",
  },
};
