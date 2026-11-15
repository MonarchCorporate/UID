/**
 * Compressed inline share links for loadouts.
 *
 * Encodes the minimal payload (ship slug + slot list) into a URL-safe
 * lz-string so it can be shared without persisting a build server-side.
 * This is used by /l/$data and complements the persistent /loadout/$token
 * links.
 */
import LZString from "lz-string";

export interface InlineSlot {
  k: string; // slot_key
  n: string | null; // hardpoint_name (compact)
  c: string | null; // category
  s: number | null; // size
  r: string | null; // item_ref
}

export interface InlinePayload {
  v: 1;
  slug: string;
  name?: string;
  desc?: string;
  slots: InlineSlot[];
}

export function encodeLoadout(p: InlinePayload): string {
  const json = JSON.stringify(p);
  return LZString.compressToEncodedURIComponent(json);
}

export function decodeLoadout(raw: string): InlinePayload | null {
  try {
    const json = LZString.decompressFromEncodedURIComponent(raw);
    if (!json) return null;
    const parsed = JSON.parse(json) as InlinePayload;
    if (!parsed || parsed.v !== 1 || typeof parsed.slug !== "string" || !Array.isArray(parsed.slots)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}