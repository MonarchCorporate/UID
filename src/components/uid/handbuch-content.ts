/**
 * Redaktionelle Inhalte der öffentlichen Funktionsübersicht (/handbuch).
 * Bewusst statisch: die Seite soll ohne Anmeldung und ohne Datenbankabfragen
 * serverseitig gerendert ausgeliefert werden.
 */

export type Audience = "Mitglied" | "Orgaleitung" | "Admin";
export type Surface = "Backoffice" | "Discord" | "Website";

export type HandbuchPoint = {
  title: string;
  text: string;
  audience: Audience[];
  surface: Surface;
};

export type HandbuchChapter = {
  id: string;
  nr: string;
  title: string;
  short: string;
  intro: string;
  points: HandbuchPoint[];
};

export const HANDBUCH_METRICS = [
  { value: "6", label: "Backoffice-Bereiche", hint: "Operationen, Flotte, Crafting, Logistik, Handel, Orga" },
  { value: "10+", label: "Discord-Funktionen", hint: "Rollen, Kanäle, Ankündigungen, Bewerbungen, Gewinnspiele" },
  { value: "24/7", label: "Automatisierung", hint: "Rollenabgleich, Aktivitätstracking, Ziehungen, Preisdaten" },
] as const;

export const HANDBUCH_INTRO = [
  "Die United Imperial Dominion ist eine Community unabhängiger Star-Citizen-Organisationen.",
  "Das Backoffice ist das gemeinsame Werkzeug dieser Community – nicht das Oberkommando einer einzelnen Organisation.",
];

export const HANDBUCH_CHAPTERS: HandbuchChapter[] = [
  {
    id: "zugang",
    nr: "01",
    title: "Zugang & Onboarding",
    short: "Zugang",
    intro:
      "Der Einstieg läuft vollständig über Discord. Wer dem Server beigetreten ist und seinen Star-Citizen-Account verifiziert, wird automatisch der passenden Organisation innerhalb der Community zugeordnet.",
    points: [
      {
        title: "Anmeldung per Discord",
        text: "Kein zusätzliches Passwort: Die Anmeldung im Backoffice erfolgt über den Discord-Account. Wer nicht auf dem Server ist, bekommt direkt den Einladungslink.",
        audience: ["Mitglied"],
        surface: "Website",
      },
      {
        title: "RSI-Verifizierung über die Bio",
        text: "Das System erzeugt einen einmaligen Code. Dieser wird kurz in die Bio des RSI-Profils eingetragen und automatisch geprüft – danach ist der Handle fest mit dem Account verknüpft.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Automatische Orga-Zuordnung über die SID",
        text: "Beim Verifizieren werden die Organisationen des RSI-Profils gelesen. Ist die SID im System registriert, entsteht die Mitgliedschaft samt Discord-Rollen automatisch.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Umbenennung und Verifiziert-Rolle",
        text: "Nach erfolgreicher Verifizierung wird der Discord-Nickname auf den RSI-Handle gesetzt und die Rolle „Verifiziert“ vergeben. Beides ist im Adminbereich konfigurierbar.",
        audience: ["Mitglied", "Admin"],
        surface: "Discord",
      },
      {
        title: "Bewerbung um eine Mitgliedschaft",
        text: "Wer noch keiner Organisation in der Community angehört, füllt das öffentliche Bewerbungsformular aus. Die Bewerbung landet als Nachricht im zuständigen Discord-Kanal; die Entscheidung wird dort zurückgemeldet.",
        audience: ["Mitglied"],
        surface: "Website",
      },
      {
        title: "Mitgliedschaft bleibt an die Discord-Rolle gekoppelt",
        text: "Verliert jemand die zugehörige Rolle auf Discord oder wird im Backoffice aus der Organisation entfernt, endet der Zugang zu den Orga-Bereichen automatisch.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Discord",
      },
    ],
  },
  {
    id: "operationen",
    nr: "02",
    title: "Einsätze & Operationen",
    short: "Einsätze",
    intro:
      "Von der Planung bis zum Funkverkehr: Einsätze werden im Backoffice erstellt, auf Discord angekündigt und live koordiniert.",
    points: [
      {
        title: "Einsätze planen",
        text: "Titel, Beschreibung, Startzeitpunkt über Kalenderauswahl, Kategorie und Treffpunkt. Einsätze sind entweder öffentlich oder durch ein Passwort geschützt.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Lobby und Start",
        text: "Ein neuer Einsatz bleibt zunächst Entwurf beziehungsweise Lobby. Erst wenn die Leitung „Einsatz starten“ drückt, läuft er offiziell.",
        audience: ["Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Kalender intern und öffentlich",
        text: "Farbige Kategorien pro Organisation, ein interner Einsatzkalender und ein öffentlicher Eventkalender auf der Website. Pro Einsatz ist einstellbar, ob er im Kalender erscheint und ob die Teilnehmerzahl sichtbar ist. Die Teilnahme an Einsätzen bleibt freiwillig.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Website",
      },
      {
        title: "Boardcomputer",
        text: "Schiffe, Stationen und Besatzung zuweisen, Ladung erfassen und den Status der Schiffe während der Operation nachhalten.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Sprachkanäle im Backoffice",
        text: "Pro Einsatz und pro Schiff lassen sich Sprachgruppen per Knopfdruck erstellen – mit Push-to-Talk oder Sprachsteuerung, direkt im Browser.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Ankündigung als Discord-Embed",
        text: "Ein Einsatz kann als eingebettete Nachricht in den Discord gepostet werden. Die Teilnehmerzahl in der Nachricht aktualisiert sich automatisch.",
        audience: ["Orgaleitung"],
        surface: "Discord",
      },
      {
        title: "Meine Einsätze",
        text: "Jedes Mitglied sieht die eigenen Anmeldungen und selbst erstellten Einsätze gebündelt an einer Stelle.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
    ],
  },
  {
    id: "flotte",
    nr: "03",
    title: "Flotte & Schiffe",
    short: "Flotte",
    intro:
      "Die eigene Hangar-Übersicht, die Orgaflotte und ein vollständiger Schiffskatalog inklusive Ausrüstungsplaner.",
    points: [
      {
        title: "Meine Flotte",
        text: "Eigene Schiffe pflegen, mit Bild, Eckdaten und Verfügbarkeit für Einsätze.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Orgaflotte",
        text: "Die gebündelte Flotte der Organisation – auch auf der öffentlichen Orga-Seite darstellbar.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Website",
      },
      {
        title: "Schiffskatalog mit Vergleich",
        text: "Alle Schiffe mit Werten, Bildern und Filtern. Mehrere Schiffe lassen sich im direkten Vergleich nebeneinander betrachten.",
        audience: ["Mitglied"],
        surface: "Website",
      },
      {
        title: "Loadout-Editor",
        text: "Waffen, Schilde, Kühler, Triebwerke und Quantum-Antriebe konfigurieren, mit Live-Berechnung von Feuerkraft, Energie, Kühlung und Signatur.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Loadouts teilen",
        text: "Jede Konfiguration lässt sich als Link teilen – ideal, um Setups vor einem Einsatz abzustimmen.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
    ],
  },
  {
    id: "crafting",
    nr: "04",
    title: "Crafting & Material",
    short: "Crafting",
    intro:
      "Von der Blueprint bis zum fertigen Bauteil: Materialbedarf berechnen, gemeinsam farmen und den eigenen Bestand im Blick behalten.",
    points: [
      {
        title: "Blueprints und Materialbedarf",
        text: "Alle Baupläne mit Zutatenlisten. Materialien sind anklickbar und zeigen, woher man sie bekommt.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Crafting-Rechner",
        text: "Berechnet den Bedarf für beliebige Stückzahlen und erkennt automatisch die höchste eingelagerte Qualität. Optional werden nur Qualitäten vorgeschlagen, die tatsächlich vorhanden sind.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Farmlisten",
        text: "Gemeinsame Sammel-Listen mit zusammengerechnetem Materialbedarf. Mitglieder der eigenen Organisation können eingeladen werden und die Einladung im Backoffice annehmen.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Persönliches Inventar",
        text: "Eigene Bestände nach Lagerort erfassen – inklusive gesammelter Blueprints, die per Auswahl hinzugefügt werden.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Fundorte und Scanner-Frequenzen",
        text: "Zu jedem Material die passenden Fundorte sowie die Frequenz für den Bordscanner.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
    ],
  },
  {
    id: "logistik",
    nr: "05",
    title: "Orga-Logistik",
    short: "Logistik",
    intro:
      "Das Orgalager ist die gemeinsame Materialbasis der jeweiligen Organisation: transparent für alle Mitglieder, kontrolliert durch das Orgateam.",
    points: [
      {
        title: "Orgalager einsehen",
        text: "Alle Mitglieder sehen den kompletten Bestand inklusive Menge, Einheit, Lagerort und Verwahrer.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Sperren und freigeben",
        text: "Das Orgateam kann Positionen sperren. Gesperrtes bleibt sichtbar, ist aber nicht anfragbar.",
        audience: ["Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Anfragen und Freigaben",
        text: "Mitglieder fragen nicht gesperrte Positionen an, die Leitung gibt frei, lehnt ab oder bucht die Ausgabe.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Bestellungen",
        text: "Bestellungen aus dem Orgalager mit Mengen, Status und Nachverfolgung – ideal für Bauaufträge und Ausrüstung.",
        audience: ["Mitglied", "Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "Öffentlicher Orga-Shop",
        text: "Zum Verkauf freigegebene Bestände erscheinen im öffentlichen Shop der Organisation; Käufer reservieren mit Ingame- und Discord-Namen.",
        audience: ["Orgaleitung"],
        surface: "Website",
      },
      {
        title: "Orgakasse",
        text: "Einzahlungen, Auszahlungen und Ausgaben dokumentieren, Anträge stellen und freigeben.",
        audience: ["Orgaleitung"],
        surface: "Backoffice",
      },
    ],
  },
  {
    id: "handel",
    nr: "06",
    title: "Handel & Marktplatz",
    short: "Handel",
    intro:
      "Aktuelle Wirtschaftsdaten aus dem Verse plus ein interner Marktplatz für Angebote, Gesuche und Aufträge.",
    points: [
      {
        title: "Rohstoffpreise",
        text: "Aktuelle Kauf- und Verkaufspreise pro Station, laufend über UEX aktualisiert.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Routenplaner",
        text: "Berechnet lohnende Handelsrouten anhand von Frachtkapazität und Budget – mit optionalen Filtern, etwa nur Stationen oder bestimmte Systeme.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Marktplatz",
        text: "Interne Angebote, Gesuche, Aufträge und Tauschgeschäfte mit Bildern, Nachrichten und Statusverfolgung bis zur Übergabe.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
    ],
  },
  {
    id: "discordbot",
    nr: "07",
    title: "Discord-Bot",
    short: "Discord-Bot",
    intro:
      "Der Bot verbindet Backoffice und Discord der Community: Er vergibt Rollen, baut Kanalstrukturen und postet Nachrichten – gesteuert aus dem Backoffice, ohne Serverkenntnisse.",
    points: [
      {
        title: "Rollen mit Organisationen verknüpfen",
        text: "Jede Discord-Rolle kann einer Organisation zugeordnet werden. Wer die Rolle hat, ist im Backoffice Mitglied dieser Organisation.",
        audience: ["Admin"],
        surface: "Discord",
      },
      {
        title: "Leitungsrolle",
        text: "Pro Organisation gibt es eine Leitungsrolle mit vollen Verwaltungsrechten für die eigene Discord-Kategorie.",
        audience: ["Admin", "Orgaleitung"],
        surface: "Discord",
      },
      {
        title: "Eigene Rollen anlegen und vergeben",
        text: "Organisationen können eigene Rollen erstellen, bearbeiten und an ihre Mitglieder vergeben.",
        audience: ["Orgaleitung"],
        surface: "Discord",
      },
      {
        title: "Kategorien und Kanäle verwalten",
        text: "Kanäle in der eigenen Kategorie anlegen, umbenennen und löschen. Admins können ganze Kategorien inklusive Inhalt entfernen.",
        audience: ["Orgaleitung", "Admin"],
        surface: "Discord",
      },
      {
        title: "Kategorie-Vorlagen",
        text: "Admins hinterlegen Standardstrukturen, die für neue Organisationen in der Community mit einem Klick ausgerollt werden.",
        audience: ["Admin"],
        surface: "Discord",
      },
      {
        title: "Bot-Nachrichten",
        text: "Eingebettete Nachrichten mit Titel, Text, Bild, Farbe und optionalem Ping in jeden freigegebenen Kanal senden, nachträglich bearbeiten oder löschen.",
        audience: ["Admin", "Orgaleitung"],
        surface: "Discord",
      },
      {
        title: "Reaktions-Rollen",
        text: "Nachricht mit Emoji-zu-Rolle-Zuordnung posten: Wer reagiert, erhält die Rolle automatisch, beim Entfernen wird sie wieder entzogen.",
        audience: ["Admin"],
        surface: "Discord",
      },
      {
        title: "Bewerbungen im Discord",
        text: "Eingehende Bewerbungen erscheinen als übersichtliche Nachricht im gewünschten Kanal, mit Ping der zuständigen Rolle und Statusrückmeldung nach der Entscheidung.",
        audience: ["Admin", "Orgaleitung"],
        surface: "Discord",
      },
    ],
  },
  {
    id: "aktivitaet",
    nr: "08",
    title: "Aktivität & Gewinnspiele",
    short: "Gewinnspiele",
    intro:
      "Der Bot misst die Aktivität auf dem Server. Aus dieser Aktivität entstehen Lose für Gewinnspiele – Teilnahme immer freiwillig.",
    points: [
      {
        title: "Aktivität zählen",
        text: "Zeit in Sprachkanälen, geschriebene Nachrichten und Reaktionen ergeben Punkte. Nachrichten zählen nur ab zehn Zeichen und mit zehn Sekunden Abstand, damit Spam nichts bringt.",
        audience: ["Mitglied"],
        surface: "Discord",
      },
      {
        title: "Lose statt Zufall",
        text: "Aus den Punkten werden Lose berechnet. Wer aktiver war, hat mehr Chancen – der Stand ist jederzeit einsehbar.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Teilnahme per Reaktion",
        text: "Der Bot setzt ein ✅ unter die Ankündigung. Nur wer darauf klickt, kommt in den Lostopf; ein erneuter Klick meldet wieder ab.",
        audience: ["Mitglied"],
        surface: "Discord",
      },
      {
        title: "Gewinnspiele verwalten",
        text: "Zeitraum, Preise, Anzahl der Gewinner und Ankündigungskanal festlegen. Die Ziehung läuft automatisch, die Gewinner werden bekannt gegeben.",
        audience: ["Admin"],
        surface: "Backoffice",
      },
    ],
  },
  {
    id: "rollen",
    nr: "09",
    title: "Rollen & Berechtigungen",
    short: "Rollen",
    intro:
      "Drei Ebenen bestimmen, wer was darf. Rechte werden serverseitig geprüft – sichtbar ist immer nur, wofür man berechtigt ist.",
    points: [
      {
        title: "Mitglied",
        text: "Einsätze sehen und daran teilnehmen, eigene Flotte und Inventar pflegen, Crafting und Farmlisten nutzen, Orgalager einsehen und anfragen, Marktplatz und Handelsdaten nutzen.",
        audience: ["Mitglied"],
        surface: "Backoffice",
      },
      {
        title: "Orgaleitung",
        text: "Zusätzlich: Einsätze und Kategorien verwalten, Lager sperren und freigeben, Bestellungen und Kasse führen, Discord-Kanäle und Rollen der eigenen Organisation verwalten, Ankündigungen posten.",
        audience: ["Orgaleitung"],
        surface: "Backoffice",
      },
      {
        title: "App-Admin",
        text: "Zusätzlich: Organisationen und Benutzer verwalten, Rollen-Zuordnungen und Kategorie-Vorlagen pflegen, Bot-Einstellungen, Bewerbungsformular, Reaktions-Rollen und Gewinnspiele steuern.",
        audience: ["Admin"],
        surface: "Backoffice",
      },
    ],
  },
];

export const HANDBUCH_FAQ = [
  {
    q: "Warum muss ich meinen RSI-Account verifizieren?",
    a: "Die Verifizierung stellt sicher, dass Ingame-Name und Account zusammenpassen. Nur so kann die Organisation innerhalb der Community automatisch über die SID zugeordnet werden und niemand kann sich als jemand anderes ausgeben.",
  },
  {
    q: "Wie komme ich in eine Organisation?",
    a: "Entweder automatisch: Ist die SID deiner RSI-Organisation im System registriert, entsteht die Mitgliedschaft direkt nach der Verifizierung. Oder über eine Bewerbung – dann entscheidet die jeweilige Orgaleitung im Discord.",
  },
  {
    q: "Warum sehe ich keine Lose im Gewinnspiel?",
    a: "Lose entstehen erst ab einer gewissen Aktivität und nur für verifizierte Accounts. Außerdem musst du auf der Ankündigung mit ✅ reagieren, um teilzunehmen.",
  },
  {
    q: "Was passiert, wenn ich meine Discord-Rolle verliere?",
    a: "Die Mitgliedschaft bleibt so lange bestehen, bis die zugehörige Rolle auf Discord entzogen wird oder die Leitung dich im Backoffice entfernt. Danach entfallen die Orga-Bereiche automatisch.",
  },
  {
    q: "Kostet das Backoffice etwas?",
    a: "Nein. Es ist ein Community-Werkzeug der United Imperial Dominion und für alle Mitglieder der angeschlossenen Organisationen kostenfrei.",
  },
  {
    q: "Bin ich anderen Mitgliedern verpflichtet?",
    a: "Nein. Die Mitgliedschaft in der UID-Community erzeugt keine Verpflichtungen. Jede Teilnahme an Einsätzen, Projekten oder gemeinsamen Aktionen ist freiwillig.",
  },
  {
    q: "Ist das Backoffice offiziell von Cloud Imperium?",
    a: "Nein. Es ist ein inoffizielles Fan-Projekt rund um Star Citizen und steht in keiner Verbindung zu Cloud Imperium Games.",
  },
] as const;
