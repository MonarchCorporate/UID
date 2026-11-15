/**
 * Vordefinierte Star-Citizen-Lagerorte für den Location-Picker in Inventar &
 * Orgalager. Reine Frontend-Daten – wenn ein Nutzer einen Preset auswählt,
 * wird bei Bedarf on-the-fly ein Eintrag in `inventory_locations` mit
 * `source='preset'` + `preset_key` angelegt (siehe `ensurePresetLocation`).
 */
export type SCLocationKind =
  | "Stadt"
  | "Raumstation"
  | "Rest Stop (Lagrange)"
  | "Jump Gate Station"
  | "Distribution Center"
  | "Outpost"
  | "Sonderort";

export type SCLocationPreset = {
  key: string; // stabil, z. B. "stanton:area18"
  name: string; // Anzeigename
  system: string; // Stanton | Pyro | Sonstige
  kind: SCLocationKind;
};

function make(
  system: string,
  kind: SCLocationKind,
  entries: Array<[string, string]>, // [slug, name]
): SCLocationPreset[] {
  return entries.map(([slug, name]) => ({
    key: `${system.toLowerCase()}:${slug}`,
    name,
    system,
    kind,
  }));
}

export const SC_LOCATIONS: SCLocationPreset[] = [
  // ── Stanton ────────────────────────────────────────────────
  ...make("Stanton", "Stadt", [
    ["area18", "Area18 (ArcCorp)"],
    ["lorville", "Lorville (Hurston)"],
    ["new-babbage", "New Babbage (microTech)"],
    ["orison", "Orison (Crusader)"],
  ]),
  ...make("Stanton", "Raumstation", [
    ["baijini-point", "Baijini Point (ArcCorp)"],
    ["everus-harbor", "Everus Harbor (Hurston)"],
    ["port-tressler", "Port Tressler (microTech)"],
    ["seraphim-station", "Seraphim Station (Crusader)"],
    ["port-olisar", "Port Olisar"],
    ["grim-hex", "GrimHEX (Yela)"],
  ]),
  ...make("Stanton", "Rest Stop (Lagrange)", [
    ["arc-l1", "ARC-L1 Wide Forest Station"],
    ["arc-l2", "ARC-L2 Livewire Station"],
    ["arc-l4", "ARC-L4 Faithful Dream Station"],
    ["arc-l5", "ARC-L5 Yellow Core Station"],
    ["cru-l1", "CRU-L1 Ambitious Dream Station"],
    ["cru-l4", "CRU-L4 Shallow Fields Station"],
    ["cru-l5", "CRU-L5 Beautiful Glen Station"],
    ["hur-l1", "HUR-L1 Green Glade Station"],
    ["hur-l2", "HUR-L2 Faithful Glen Station"],
    ["hur-l3", "HUR-L3 Thundering Express Station"],
    ["hur-l4", "HUR-L4 Melodic Fields Station"],
    ["hur-l5", "HUR-L5 High Course Station"],
    ["mic-l1", "MIC-L1 Shallow Frontier Station"],
    ["mic-l2", "MIC-L2 Long Forest Station"],
    ["mic-l3", "MIC-L3 Endless Odyssey Station"],
    ["mic-l4", "MIC-L4 Red Crossroads Station"],
    ["mic-l5", "MIC-L5 Modern Icarus Station"],
  ]),
  ...make("Stanton", "Jump Gate Station", [
    ["pyro-gateway", "Pyro Gateway"],
    ["magnus-gateway", "Magnus Gateway"],
    ["terra-gateway", "Terra Gateway"],
  ]),
  ...make("Stanton", "Distribution Center", [
    ["dc-brio", "Brio's Breaker Yard"],
    ["dc-greycat", "Greycat Stanton I"],
    ["dc-shubin-mic", "Shubin Interstellar (microTech)"],
    ["dc-arccorp-141", "ArcCorp Mining Area 141"],
  ]),
  ...make("Stanton", "Outpost", [
    ["hdms-perlman", "HDMS-Perlman (Hurston)"],
    ["hdms-anderson", "HDMS-Anderson (Hurston)"],
    ["hdms-edmond", "HDMS-Edmond (Hurston)"],
    ["hdms-hahn", "HDMS-Hahn (Hurston)"],
    ["hdms-lathan", "HDMS-Lathan (Hurston)"],
    ["hdms-norgaard", "HDMS-Norgaard (Hurston)"],
    ["hdms-oparei", "HDMS-Oparei (Hurston)"],
    ["hdms-pinewood", "HDMS-Pinewood (Hurston)"],
    ["hdms-ryder", "HDMS-Ryder (Hurston)"],
    ["hdms-stanhope", "HDMS-Stanhope (Hurston)"],
    ["hdms-thedus", "HDMS-Thedus (Hurston)"],
    ["hdms-woodruff", "HDMS-Woodruff (Hurston)"],
    ["arccorp-mining-045", "ArcCorp Mining Area 045 (Wala)"],
    ["arccorp-mining-048", "ArcCorp Mining Area 048 (Lyria)"],
    ["arccorp-mining-056", "ArcCorp Mining Area 056 (Aberdeen)"],
    ["arccorp-mining-057", "ArcCorp Mining Area 057 (Magda)"],
    ["arccorp-mining-061", "ArcCorp Mining Area 061 (Wala)"],
    ["arccorp-mining-141", "ArcCorp Mining Area 141 (Lyria)"],
    ["arccorp-mining-157", "ArcCorp Mining Area 157 (Daymar)"],
    ["shubin-sal2", "Shubin Mining SAL-2 (Lyria)"],
    ["shubin-sal5", "Shubin Mining SAL-5 (Lyria)"],
    ["shubin-sm0-10", "Shubin Mining SM0-10 (Aberdeen)"],
    ["shubin-sm0-13", "Shubin Mining SM0-13 (Aberdeen)"],
    ["shubin-sm0-18", "Shubin Mining SM0-18 (Aberdeen)"],
    ["shubin-sm0-22", "Shubin Mining SM0-22 (Magda)"],
    ["deakins-research", "Deakins Research (Yela)"],
    ["kudre-ore", "Kudre Ore (Daymar)"],
    ["nuen-waste", "Nuen Waste Management (Daymar)"],
    ["bountiful-harvest", "Bountiful Harvest Hydroponics (Daymar)"],
    ["rayari-anvik", "Rayari Anvik (Calliope)"],
    ["rayari-cantwell", "Rayari Cantwell (Calliope)"],
    ["rayari-deltana", "Rayari Deltana (Calliope)"],
    ["rayari-kaltag", "Rayari Kaltag (Calliope)"],
    ["rayari-mcgrath", "Rayari McGrath (Calliope)"],
    ["shubin-sm-c6", "Shubin Mining SMCa-6 (Calliope)"],
    ["shubin-sm-c8", "Shubin Mining SMCa-8 (Calliope)"],
    ["shubin-smca-13", "Shubin Mining SMCa-13 (Clio)"],
    ["shubin-smca-6", "Shubin Mining SMCa-6 (Clio)"],
    ["new-babbage-interchange", "New Babbage Interchange"],
    ["reclamation-disposal", "Reclamation and Disposal Orinth"],
    ["locheed-space", "Locheed Space Ecology"],
    ["ashburn", "Ashburn"],
    ["benson-mining-outpost", "Benson Mining Outpost (Yela)"],
    ["stella-fortuna", "Stella Fortuna (Cellin)"],
    ["gallete-family-farms", "Gallete Family Farms (Cellin)"],
    ["hickes-research", "Hickes Research (Cellin)"],
    ["nt-999-xx", "NT-999-XX (Cellin)"],
    ["shady-glen-farms", "Shady Glen Farms (Cellin)"],
    ["tram-myers-mining", "Tram & Myers Mining (Cellin)"],
  ]),

  // ── Pyro ───────────────────────────────────────────────────
  ...make("Pyro", "Raumstation", [
    ["ruin-station", "Ruin Station"],
    ["checkmate", "Checkmate"],
    ["endgame", "Endgame"],
    ["gaslight", "Gaslight"],
    ["rats-nest", "Rat's Nest"],
    ["starlight-service", "Starlight Service Station"],
    ["patch-city", "Patch City"],
    ["orbituary", "Orbituary"],
  ]),
  ...make("Pyro", "Outpost", [
    ["bloom", "Bloom (Pyro V)"],
    ["ashland", "Ashland"],
    ["rods-fuel", "Rod's Fuel 'N Supplies"],
    ["dudley-daughters", "Dudley & Daughters"],
    ["shepherds-rest", "Shepherd's Rest"],
    ["ghost-hollow", "Ghost Hollow"],
    ["chawla-beach", "Chawla's Beach"],
    ["fallow-fields", "Fallow Fields"],
    ["ferron-exchange", "Ferron Exchange"],
    ["last-landings", "Last Landings"],
    ["outpost-54", "Outpost 54"],
    ["outpost-anderson", "Anderson Outpost"],
    ["megumi-refueling", "Megumi Refueling"],
  ]),

  // ── Sonderorte ─────────────────────────────────────────────
  // ── Nyx ────────────────────────────────────────────────────
  ...make("Nyx", "Stadt", [["levski", "Levski (Delamar)"]]),
  ...make("Nyx", "Outpost", [
    ["delamar-nt-999-xxii", "NT-999-XXII (Delamar)"],
  ]),

  ...make("Sonstige", "Sonderort", [
    ["im-schiff", "Im Schiff"],
    ["im-rucksack", "Beim Spieler (Rucksack)"],
    ["im-hangar", "Persönlicher Hangar"],
    ["unbekannt", "Unbekannt / unterwegs"],
  ]),
];

export function findPresetByKey(key: string): SCLocationPreset | undefined {
  return SC_LOCATIONS.find((p) => p.key === key);
}