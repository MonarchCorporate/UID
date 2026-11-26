// Readable names for Star Citizen internal identifiers (ship/item classes,
// location codes). Port of the companion's names.js.
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
  GrimHex: 'GrimHEX', Pyro: 'Pyro', Nyx: 'Nyx', Levski: 'Levski',
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

export function placeName(code: unknown): string {
  let s = String(code || '').trim();
  if (!s) return '';
  if (PLACES[s]) return PLACES[s];
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
