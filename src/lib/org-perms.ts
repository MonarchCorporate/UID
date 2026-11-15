export type OrgPerm =
  | "orders.view"
  | "orders.review"
  | "warehouse.requests.review"
  | "warehouse.manage"
  | "warehouse.hold"
  | "treasury.manage"
  | "treasury.report"
  | "treasury.discord"
  | "members.manage"
  | "missions.manage"
  | "voice.manage"
  | "calendar.manage"
  | "marketplace.moderate"
  | "branding.manage"
  | "fleet.manage"
  | "discord.post"
  | "discord.roles"
  | "settings.manage";

export const ORG_PERMS: { key: OrgPerm; label: string; hint: string }[] = [
  { key: "orders.view", label: "Bestellungen einsehen", hint: "Sieht alle Orga-Bestellungen (nicht nur eigene)." },
  { key: "orders.review", label: "Bestellungen prüfen & annehmen", hint: "Status setzen, annehmen, ablehnen, als erfüllt markieren." },
  { key: "warehouse.requests.review", label: "Lager-Anfragen annehmen", hint: "Anfragen von Mitgliedern auf Freigabe entscheiden." },
  { key: "warehouse.manage", label: "Lager verwalten", hint: "Einlagern, sperren, entnehmen, Freigaben erstellen." },
  { key: "warehouse.hold", label: "Orgabestand halten dürfen", hint: "Kann im Orgalager als aktueller Halter eines Items eingetragen werden." },
  { key: "treasury.manage", label: "Kasse verwalten", hint: "Buchungen anlegen und löschen." },
  { key: "treasury.report", label: "Kassen-Auswertung einsehen", hint: "Sieht die namentliche Spieler-Auswertung der Orgakasse (nur Lesen)." },
  { key: "treasury.discord", label: "Kassen-Discord-Updates konfigurieren", hint: "Legt fest, ob und wo der Bot Kassen-Updates postet, und kann Musternachrichten senden." },
  { key: "members.manage", label: "Mitglieder & Rollen verwalten", hint: "Rollen und Berechtigungen anderer Mitglieder bearbeiten." },
  { key: "missions.manage", label: "Einsätze verwalten (Admin)", hint: "Alle Einsätze bearbeiten, starten, löschen, Teilnehmer & Stationen zuweisen." },
  { key: "voice.manage", label: "Voice & Squadleads verwalten", hint: "Channels anlegen/löschen, Squadleads ernennen, Broadcast-Rechte steuern." },
  { key: "calendar.manage", label: "Kalender & Kategorien verwalten", hint: "Einsatz-Kategorien erstellen, Farben & Sortierung ändern." },
  { key: "marketplace.moderate", label: "Schwarzes Brett moderieren", hint: "Fremde Anzeigen bearbeiten oder löschen." },
  { key: "branding.manage", label: "Landingpage & Branding gestalten", hint: "Öffentliche Orga-Seite bearbeiten: Texte, Farben, Logo, Sektionen." },
  { key: "fleet.manage", label: "Orgaflotte verwalten", hint: "Flottenquelle wählen und Fleetyards-Sync der Orga auslösen." },
  { key: "discord.post", label: "Discord-Nachrichten posten", hint: "In den freigegebenen Discord-Channels Nachrichten und Event-Ankündigungen veröffentlichen." },
  { key: "discord.roles", label: "Discord-Rollen verwalten", hint: "Eigene Discord-Rollen anlegen, bearbeiten, löschen und freigegebene Rollen an Mitglieder vergeben." },
  { key: "settings.manage", label: "Orga-Einstellungen verwalten", hint: "Name, Tag, Farben, Logo und Benachrichtigungen der Orga." },
];

export const ORG_PERM_KEYS = ORG_PERMS.map((p) => p.key) as OrgPerm[];

/** Merge and dedupe permission arrays; keeps only known perms. */
export function mergePerms(
  ...arrays: (string[] | null | undefined)[]
): OrgPerm[] {
  const set = new Set<string>();
  for (const a of arrays) for (const p of a ?? []) set.add(p);
  const known = ORG_PERM_KEYS as string[];
  return Array.from(set).filter((k): k is OrgPerm => known.includes(k));
}

export function rolePresetPerms(role: string): OrgPerm[] {
  switch (role) {
    case "owner":
    case "officer":
      return [...ORG_PERM_KEYS];
    case "quartermaster":
      return ["orders.view", "orders.review", "warehouse.requests.review", "warehouse.manage", "warehouse.hold"];
    case "treasurer":
      return ["treasury.manage", "treasury.report", "treasury.discord", "orders.view"];
    default:
      return [];
  }
}

export function hasPerm(
  role: string | null | undefined,
  perms: string[] | null | undefined,
  perm: OrgPerm,
): boolean {
  if (role === "owner") return true;
  return !!perms?.includes(perm);
}

/**
 * Effective permissions for a member: explicitly assigned permissions win.
 * Only when a member has no explicit permissions at all do we fall back to
 * the role preset (legacy members created before per-role permissions).
 */
export function effectiveOrgPerms(
  role: string | null | undefined,
  perms: string[] | null | undefined,
): OrgPerm[] {
  if (role === "owner") return [...ORG_PERM_KEYS];
  const explicit = mergePerms(perms);
  if (explicit.length > 0) return explicit;
  return rolePresetPerms(role ?? "");
}

export function hasPermLegacy(
  role: string | null | undefined,
  perms: string[] | null | undefined,
  perm: OrgPerm,
): boolean {
  if (role === "owner") return true;
  return !!perms?.includes(perm);
}