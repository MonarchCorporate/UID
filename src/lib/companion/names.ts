// Readable names for Star Citizen internal identifiers (ship/item classes,
// location codes). Port of the companion's names.js – keep in sync.
/* eslint-disable */


const MAKERS: Record<string, string> = {
  AEGS: 'Aegis', ANVL: 'Anvil', AOPOA: 'Aopoa', ARGO: 'Argo', BANU: 'Banu', CNOU: 'C.O.', CRUS: 'Crusader',
  DRAK: 'Drake', ESPR: 'Esperia', GAMA: 'Gatac', GRIN: 'Greycat', KRIG: 'Kruger', MISC: 'MISC', MRAI: 'Mirai',
  ORIG: 'Origin', RSI: 'RSI', TMBL: 'Tumbril', VNCL: 'Vanduul', XIAN: 'Aopoa', XNAA: 'Aopoa', CRSD: 'Crusader',
};

// item manufacturer prefixes (lower case in class names)
const ITEM_MAKERS: Record<string, string> = {
  behr: 'Behring', crlf: 'CureLife', grin: 'Greycat', gmni: 'Gemini', klwe: 'Klaus & Werner', ksar: 'Kastak Arms',
  apar: 'Apocalypse Arms', hdgw: 'Hedeby', lbco: 'Lightning Bolt', sasu: 'Sakura Sun', cds: 'Clark Defense',
  rrs: 'Roussimoff', vgl: 'Virgil', doom: 'Doomsday', qrt: 'Quirinus', tmbl: 'Tumbril', rsi: 'RSI', misc: 'MISC',
  crus: 'Crusader', drak: 'Drake', anvl: 'Anvil', aegs: 'Aegis', orig: 'Origin', argo: 'Argo', banu: 'Banu',
  gama: 'Gatac', mrai: 'Mirai', espr: 'Esperia', cnou: 'C.O.', kgtc: 'Kel-To', hrst: 'Hurston', basl: 'Basilisk',
  ccc: 'CC\'s Conversions', stor: 'Stor*All', nvx: 'NovaPack', ammo: '',
};

const PLACES: Record<string, string> = {
  Stanton1: 'Hurston', Stanton2: 'Crusader', Stanton3: 'ArcCorp', Stanton4: 'microTech',
  Stanton1_Lorville: 'Lorville', Stanton2_Orison: 'Orison', Stanton3_Area18: 'Area18', Stanton4_NewBabbage: 'New Babbage',
  Stanton1_L1: 'HUR-L1', Stanton1_L2: 'HUR-L2', Stanton1_L3: 'HUR-L3', Stanton1_L4: 'HUR-L4', Stanton1_L5: 'HUR-L5',
  Stanton2_L1: 'CRU-L1', Stanton2_L4: 'CRU-L4', Stanton2_L5: 'CRU-L5',
  Stanton3_L1: 'ARC-L1', Stanton3_L2: 'ARC-L2', Stanton3_L3: 'ARC-L3', Stanton3_L4: 'ARC-L4', Stanton3_L5: 'ARC-L5',
  Stanton4_L1: 'MIC-L1', Stanton4_L2: 'MIC-L2', Stanton4_L3: 'MIC-L3', Stanton4_L4: 'MIC-L4', Stanton4_L5: 'MIC-L5',
  RR_HUR_LEO: 'Everus Harbor', RR_CRU_LEO: 'Seraphim Station', RR_ARC_LEO: 'Baijini Point', RR_MIC_LEO: 'Port Tressler',
  Stanton1a: 'Arial', Stanton1b: 'Aberdeen', Stanton1c: 'Magda', Stanton1d: 'Ita',
  Stanton2a: 'Cellin', Stanton2b: 'Daymar', Stanton2c: 'Yela',
  Stanton3a: 'Lyria', Stanton3b: 'Wala', Stanton4a: 'Calliope', Stanton4b: 'Clio', Stanton4c: 'Euterpe',
  GrimHex: 'GrimHEX', GrimHEX: 'GrimHEX', Pyro: 'Pyro', Nyx: 'Nyx', Levski: 'Levski', Nyx_Levski: 'Levski',
  RR_ARC_L1: 'ARC-L1 Wide Forest Station', RR_ARC_L2: 'ARC-L2 Livewire Station', RR_ARC_L3: 'ARC-L3 Modern Express Station',
  RR_ARC_L4: 'ARC-L4 Faithful Dream Station', RR_ARC_L5: 'ARC-L5 Yellow Core Station',
  RR_CRU_L1: 'CRU-L1 Ambitious Dream Station', RR_CRU_L4: 'CRU-L4 Shallow Fields Station', RR_CRU_L5: 'CRU-L5 Beautiful Glen Station',
  RR_HUR_L1: 'HUR-L1 Green Glade Station', RR_HUR_L2: 'HUR-L2 Faithful Glen Station', RR_HUR_L3: 'HUR-L3 Thundering Express Station',
  RR_HUR_L4: 'HUR-L4 Melodic Fields Station', RR_HUR_L5: 'HUR-L5 High Course Station',
  RR_MIC_L1: 'MIC-L1 Shallow Frontier Station', RR_MIC_L2: 'MIC-L2 Long Forest Station', RR_MIC_L3: 'MIC-L3 Endless Odyssey Station',
  RR_MIC_L4: 'MIC-L4 Red Crossroads Station', RR_MIC_L5: 'MIC-L5 Modern Icarus Station',
  TheCollectorAsteroid_Stanton2: 'Wikelo Emporium (Crusader)', PrisonMine_Stanton1b: 'Klescher Rehabilitation (Aberdeen)',
  Nyx_Kaboos: 'Kaboos', INVALID_LOCATION_ID: 'Unbekannter Ort',
};

const CATEGORIES: [string, string, RegExp][] = [
  ['ruestung', 'Rüstung', /(armor|armour|helmet|_core_|_arms_|_legs_|backpack)/i],
  ['kleidung', 'Kleidung', /(undersuit|shirt|pants|jacket|boots|shoes|gloves|hat_|_hat|glasses|coat|vest)/i],
  ['munition', 'Munition', /(_mag_|magazine|ammo|_battery|grenade)/i],
  ['waffen', 'Waffen', /(rifle|pistol|smg|lmg|shotgun|sniper|launcher|knife|railgun|_gun_|ksar_|behr_|gmni_|klwe_|hdgw_|apar_|volt_)/i],
  ['medizin', 'Medizin', /(medpen|medgun|healing|med_|hemozal|adrenaline|detox|resurgera)/i],
  ['werkzeug', 'Werkzeug', /(multitool|tractor|salvage|mining_|cutter|tool_|flare|glowstick)/i],
  ['komponenten', 'Schiffskomponenten', /(cooler|shield|powerplant|power_plant|quantumdrive|qdrv|_qd_|radar|missile|torpedo|turret)/i],
  ['nahrung', 'Nahrung & Getränke', /(food|drink|burrito|sandwich|water|juice|bar_|noodle|pizza|coffee|beer)/i],
  ['fracht', 'Fracht & Rohstoffe', /(scu|ore|cargo|commodity|crate|box_)/i],
];
const CATEGORY_LABEL: Record<string, string> = { sonstiges: 'Sonstiges' };
CATEGORIES.forEach(function (c) { CATEGORY_LABEL[c[0]] = c[1]; });

export function stripId(s: unknown): string {
  return String(s || '').replace(/_\d{9,}$/, '');
}

function titleWords(parts: string[]): string {
  return parts
    .filter(Boolean)
    .map(function (w: string) {
      if (/^(mk\d+|s\d+|[a-z]\d+[a-z]*|\d+[a-z]*)$/i.test(w)) return w.toUpperCase().replace(/^MK/, 'Mk');
      if (w.length <= 5 && /[A-Z]/.test(w) && w === w.toUpperCase()) return w;
      return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    })
    .join(' ');
}

export function shipName(cls: unknown): string {
  let s = stripId(cls);
  if (!s) return '';
  let parts = s.split('_');
  let maker = MAKERS[parts[0].toUpperCase()];
  if (maker) parts = parts.slice(1);
  return ((maker ? maker + ' ' : '') + titleWords(parts)).trim();
}

const PSS: Record<number, string> = { 1: "People's Service Station Alpha" };

export function placeName(code: unknown): string {
  let s = String(code || '').trim();
  if (!s) return '';
  if (PLACES[s]) return PLACES[s];
  let jp = /^RR_JP_([A-Z][a-z]+)([A-Z][a-z]+)$/.exec(s); // jump point stations, e.g. RR_JP_StantonPyro
  if (jp) return jp[2] + ' Gateway (' + jp[1] + ')';
  let rr = /^RR_([A-Z]{3})_L(\d)$/.exec(s);
  if (rr) return rr[1] + '-L' + rr[2];
  let pyro = /^RR_P(\d)_LEO$/.exec(s);
  if (pyro) return 'Pyro ' + pyro[1] + ' Station';
  let op = /^Outpost_(PAF|OLP)_[A-Za-z0-9]+_([A-Za-z]+)(?:_(\d))?$/.exec(s);
  if (op) return op[2] + ' ' + op[1] + (op[3] && op[1] === 'PAF' ? '-' + (['', 'I', 'II', 'III', 'IV', 'V'][Number(op[3])] || op[3]) : '');
  // People's Service Stations in Nyx; the code names the asteroid belt (Keeger), not the station
  const pss = /^AsteroidClusterBase_Nyx_Social_[A-Za-z]+_(\d+)$/.exec(s);
  if (pss) return PSS[Number(pss[1])] || "People's Service Station " + Number(pss[1]) + ' (Nyx)';
  let m = /^(Stanton\d[a-d]?)_(.+)$/.exec(s);
  if (m) {
    let parent = PLACES[m[1]];
    let rest = PLACES[s] || titleWords(m[2].replace(/([a-z])([A-Z])/g, '$1_$2').split('_'));
    return parent ? rest + ' (' + parent + ')' : rest;
  }
  for (let k in PLACES) {
    if (s.indexOf(k + '_') === 0) return PLACES[k] + ' – ' + titleWords(s.slice(k.length + 1).split('_'));
  }
  return titleWords(s.replace(/([a-z])([A-Z])/g, '$1_$2').split('_'));
}

export function itemName(cls: unknown): string {
  let s = stripId(cls);
  if (!s) return '';
  if (/\s/.test(s)) return s; // already a readable name (manual entry)
  let parts = s.split('_');
  let maker = ITEM_MAKERS[parts[0].toLowerCase()];
  if (maker !== undefined && parts.length > 1) return ((maker ? maker + ' ' : '') + titleWords(parts.slice(1).filter(function (p: string) { return !/^0?\d$/.test(p); }))).trim();
  return titleWords(parts.filter(function (p: string) { return !/^0?\d$/.test(p); })) || s;
}

export function itemCategory(cls: unknown): string {
  let s = String(cls || '');
  for (let i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i][2].test(s)) return CATEGORIES[i][0];
  return 'sonstiges';
}

export function containerName(type: string, name: string): string {
  if (type === 'ship') return shipName(name) || name;
  if (type === 'location') return placeName(name) || name;
  return name;
}


export const categoryLabel = (c: string): string => CATEGORY_LABEL[c] || c;
export const CONTAINER_TYPES: Record<string, string> = { location: 'Ort', ship: 'Schiff', body: 'Am Körper', other: 'Sonstiges' };
