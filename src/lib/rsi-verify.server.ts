const RSI_BASE = "https://robertsspaceindustries.com/en/citizens";

const HANDLE_RE = /^[A-Za-z0-9_-]{3,60}$/;

/** Extrahiert den RSI-Handle aus einer Eingabe oder einem Profil-Link. */
export function parseRsiHandle(input: string): string | null {
  let value = input.trim();
  if (!value) return null;
  const urlMatch = value.match(/citizens\/([^/?#\s]+)/i);
  if (urlMatch) value = urlMatch[1];
  value = value.replace(/^@/, "").trim();
  return HANDLE_RE.test(value) ? value : null;
}

/** Erzeugt einen einmaligen Verifizierungscode. */
export function generateVerifyCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return `UID-${out}`;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCharCode(Number(d)));
}

export class RsiUnavailableError extends Error {}
export class RsiNotFoundError extends Error {}

export type RsiProfile = {
  /** Bio-Text der RSI-Profilseite. */
  bio: string;
  /** Alle auf der Seite gefundenen Orga-SIDs (Haupt-Orga + Affiliates), UPPERCASE. */
  sids: string[];
};

/** Eine auf der RSI-Organisationsseite gefundene Orga. */
export type RsiOrg = {
  sid: string;
  name: string;
  main: boolean;
  rank: string | null;
};

const RSI_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Cache-Control": "no-cache",
} as const;

/** Ergebnis eines RSI-Seitenabrufs – entweder Original-HTML oder Text-Fallback. */
type RsiPage = { text: string; markdown: boolean };

/** Text-Proxy als Fallback, wenn RSI unsere Server-IP mit 403 blockt. */
const RSI_TEXT_PROXY = "https://r.jina.ai/";

async function fetchDirect(url: string): Promise<{ html?: string; reason: string }> {
  let lastReason = "unbekannt";
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 700));
    let res: Response;
    try {
      res = await fetch(url, {
        headers: RSI_HEADERS,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
    } catch (err) {
      lastReason = err instanceof Error ? err.name || err.message : String(err);
      console.error(`[rsi] fetch failed (${url}) attempt ${attempt + 1}:`, lastReason);
      continue;
    }
    if (res.status === 404) throw new RsiNotFoundError("RSI-Profil wurde nicht gefunden.");
    if (res.ok) return { html: await res.text(), reason: "ok" };
    lastReason = `HTTP ${res.status}`;
    console.error(`[rsi] bad status (${url}) attempt ${attempt + 1}: ${res.status}`);
    if (res.status === 403 || res.status === 401) break;
  }
  return { reason: lastReason };
}

/** Weitere Proxys, falls RSI direkt blockt und der Text-Proxy ausfällt. */
type Fallback = {
  name: string;
  build: (url: string) => string;
  headers?: Record<string, string>;
  /** true => Antwort ist Markdown/Text statt HTML */
  markdown: boolean;
};

/** Eigener Bot-Proxy (Railway) – wird bevorzugt genutzt, wenn konfiguriert. */
function botProxyFallback(): Fallback | null {
  const base = (process.env["RSI_PROXY_URL"] ?? "").replace(/\/+$/, "");
  const secret = process.env["HOOK_SECRET"] ?? "";
  if (!base || !secret) return null;
  return {
    name: "botproxy",
    build: (u) => `${base}/rsi?url=${encodeURIComponent(u)}`,
    headers: { authorization: `Bearer ${secret}` },
    markdown: false,
  };
}

const RSI_FALLBACKS: Fallback[] = [
  {
    name: "jina",
    build: (u) => `${RSI_TEXT_PROXY}${u}`,
    headers: { Accept: "text/plain", "X-Return-Format": "markdown" },
    markdown: true,
  },
  {
    name: "allorigins",
    build: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
    headers: RSI_HEADERS,
    markdown: false,
  },
  {
    name: "codetabs",
    build: (u) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(u)}`,
    markdown: false,
  },
  {
    name: "corsproxy",
    build: (u) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
    headers: RSI_HEADERS,
    markdown: false,
  },
];

/** Prüft, ob der abgerufene Text tatsächlich eine RSI-Profilseite ist. */
function looksLikeRsiPage(text: string): boolean {
  if (text.trim().length < 200) return false;
  return /robertsspaceindustries|Spectrum Identification|entry bio|citizen-record|Star Citizen/i.test(
    text,
  );
}

/**
 * Lädt eine RSI-Seite. RSI beantwortet Anfragen aus Serverumgebungen häufig mit
 * 403 (Bot-Schutz) – dann werden nacheinander mehrere Proxys probiert.
 */
async function fetchRsiPage(url: string): Promise<RsiPage> {
  const direct = await fetchDirect(url);
  if (direct.html) return { text: direct.html, markdown: false };

  const reasons: string[] = [`direkt: ${direct.reason}`];
  const bot = botProxyFallback();
  for (const fb of bot ? [bot, ...RSI_FALLBACKS] : RSI_FALLBACKS) {
    try {
      const res = await fetch(fb.build(url), {
        headers: fb.headers,
        redirect: "follow",
        signal: AbortSignal.timeout(25_000),
      });
      const text = res.ok ? await res.text() : "";
      if (res.ok && looksLikeRsiPage(text)) {
        // HTML erkennen, auch wenn der Proxy als "markdown" markiert ist.
        const isHtml = /<div class="(entry bio|box-content org)/i.test(text);
        console.log(`[rsi] fallback ok via ${fb.name} (${url})`);
        return { text, markdown: isHtml ? false : fb.markdown };
      }
      reasons.push(`${fb.name}: HTTP ${res.status}`);
      console.error(`[rsi] fallback ${fb.name} bad (${url}): ${res.status}`);
    } catch (err) {
      const reason = err instanceof Error ? err.name || err.message : String(err);
      reasons.push(`${fb.name}: ${reason}`);
      console.error(`[rsi] fallback ${fb.name} failed (${url}):`, reason);
    }
  }

  throw new RsiUnavailableError(
    `RSI ist derzeit nicht erreichbar (${reasons.join(" | ")}) – bitte später erneut versuchen.`,
  );
}



/** Liest Orgas (SID, Name, Rang) aus dem HTML der /organizations-Seite. */
export function extractRsiOrgs(html: string): RsiOrg[] {
  const out: RsiOrg[] = [];
  const seen = new Set<string>();
  const parts = html.split(/<div class="box-content org /i).slice(1);
  for (const part of parts) {
    const chunk = part.slice(0, 4000);
    const main = /^main\b/i.test(part);
    const sid =
      chunk
        .match(
          /Spectrum Identification \(SID\)<\/span>\s*<strong[^>]*>([^<]+)<\/strong>/i,
        )?.[1]
        ?.trim()
        .toUpperCase() ??
      chunk.match(/href="\/orgs\/([A-Za-z0-9_-]{1,20})"/i)?.[1]?.toUpperCase() ??
      null;
    if (!sid || seen.has(sid)) continue;
    const rawName =
      chunk.match(/<a href="\/orgs\/[^"]+" class="value">([\s\S]*?)<\/a>/i)?.[1] ?? sid;
    const rank =
      chunk
        .match(/Organization rank<\/span>\s*<strong[^>]*>([^<]*)<\/strong>/i)?.[1]
        ?.trim() || null;
    seen.add(sid);
    out.push({
      sid,
      name: decodeEntities(rawName.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim() || sid,
      main,
      rank,
    });
  }
  return out;
}

/** Liest Orgas aus dem Markdown-Text des Fallback-Proxys. */
export function extractRsiOrgsFromMarkdown(md: string): RsiOrg[] {
  const out: RsiOrg[] = [];
  const seen = new Set<string>();
  const affIdx = md.search(/Affiliated organi[sz]ations?/i);
  const re = /Spectrum Identification \(SID\)\s*\*\*\s*([A-Za-z0-9_-]{1,20})\s*\*\*/gi;
  for (const m of md.matchAll(re)) {
    const sid = m[1].toUpperCase();
    if (seen.has(sid)) continue;
    seen.add(sid);
    const idx = m.index ?? 0;
    const before = md.slice(Math.max(0, idx - 2000), idx);
    const nameMatch = [
      ...before.matchAll(
        /\[([^\]\n]+)\]\((?:https:\/\/robertsspaceindustries\.com)?\/orgs\/([A-Za-z0-9_-]+)\)/gi,
      ),
    ]
      .filter((x) => x[2].toUpperCase() === sid && !/^!?\[?Image\s?\d*\]?$/i.test(x[1]))
      .pop();
    const rank =
      md.slice(idx, idx + 600).match(/Organization rank\s*\*\*([^*]*)\*\*/i)?.[1]?.trim() ||
      null;
    out.push({
      sid,
      name: (nameMatch?.[1] ?? sid).trim(),
      main: affIdx >= 0 ? idx < affIdx : out.length === 0,
      rank,
    });
  }
  return out;
}

/**
 * Lädt https://robertsspaceindustries.com/en/citizens/<handle>/organizations
 * und liefert alle sichtbaren Orgas des Spielers.
 */
export async function fetchRsiOrganizations(handle: string): Promise<RsiOrg[]> {
  const page = await fetchRsiPage(`${RSI_BASE}/${encodeURIComponent(handle)}/organizations`);
  return page.markdown
    ? extractRsiOrgsFromMarkdown(page.text)
    : extractRsiOrgs(page.text);
}

/** Lädt die öffentliche RSI-Profilseite und liefert Bio-Text + Orga-SIDs. */
export async function fetchRsiProfile(handle: string): Promise<RsiProfile> {
  const page = await fetchRsiPage(`${RSI_BASE}/${encodeURIComponent(handle)}`);
  if (page.markdown) {
    // Im Fallback liegt kein HTML vor – der Seitentext genügt für die Code-Prüfung.
    const text = page.text.replace(/\s+/g, " ").trim();
    return { bio: text, sids: extractOrgSids(page.text) };
  }

  const block = page.text.match(
    /<div class="entry bio">[\s\S]*?<div class="value">([\s\S]*?)<\/div>/i,
  );
  const raw = block?.[1] ?? "";
  const bio = decodeEntities(raw.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
  return { bio, sids: extractOrgSids(page.text) };
}

/** Liest alle Orga-SIDs aus HTML oder Markdown einer RSI-Seite. */
export function extractOrgSids(html: string): string[] {
  const found = new Set<string>();
  for (const m of html.matchAll(/\/orgs\/([A-Za-z0-9_-]{1,20})/g)) {
    found.add(m[1].toUpperCase());
  }
  for (const m of html.matchAll(
    /Spectrum Identification \(SID\)(?:<\/span>\s*<strong[^>]*>|\s*\*\*)\s*([A-Za-z0-9_-]{1,20})/gi,
  )) {
    const v = m[1].trim();
    if (v) found.add(v.toUpperCase());
  }
  return [...found];
}


/** Rückwärtskompatibler Helper: nur der Bio-Text. */
export async function fetchRsiBio(handle: string): Promise<string> {
  return (await fetchRsiProfile(handle)).bio;
}

/** Prüft, ob der Code (case-insensitive) in der Bio steht. */
export function bioContainsCode(bio: string, code: string): boolean {
  return bio.toUpperCase().includes(code.toUpperCase());
}
