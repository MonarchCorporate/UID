# UID Companion (Desktop-Overlay) – Anbindung

Der Companion (`public/downloads/uid-companion.exe`, Quellcode in `MonarchCorporate/project-starcitizen/client`)
liest die `Game.log` von Star Citizen, zeigt ein Overlay im Spiel und schreibt seine Daten in diese Website.

## Ablauf

1. Spieler lädt `/downloads/uid-companion.exe` (Link auf der Seite **Companion**) und startet sie.
2. Der Companion holt einen Code (`POST /api/public/companion/pair/start`) und öffnet `/companion/pair/<CODE>`.
3. Der angemeldete Spieler klickt **Verbinden**; der Companion erhält sein Geräte-Token (`pair/poll`).
4. Ab dann sendet er Events an `POST /api/public/companion/ingest` (`Authorization: Bearer uidc_…`).

## Was wohin geschrieben wird

| Game.log-Ereignis | Ziel in der Website |
|---|---|
| Einlagern / Entnehmen / Verschieben, Shop-Kauf | `inventory_items` + `inventory_locations` (Lagerorte mit `preset_key = sc:<location|ship|body>:<Name>`, Quelle `companion`) → Seite **Inventar** |
| Schiff gesteuert | `user_ships` (Quelle `companion`, Standort) → **Meine Flotte** |
| „Received Blueprint: …“ | `user_blueprint_collection` (Abgleich über den Namen im Blueprint-Katalog) |
| Contracts angenommen/abgeschlossen/… | `companion_contracts` → **Companion → Aufträge** |
| Login, Shard, Ort, Schiff | `companion_live`, `companion_sessions` |
| alle Events | `companion_events` (Verlauf) |

Stationen aus der Game.log werden den festen Lagerorten der Website zugeordnet (`src/data/sc-locations.ts`,
z. B. `RR_CRU_L1` → `stanton:cru-l1`, siehe `src/lib/companion/presets.ts`); das eigene Inventar landet bei
„Beim Spieler (Rucksack)“. So fallen erkannte und manuell gewählte Orte zusammen.

Die Log-Muster sind gegen die echten Star-Citizen-4.10-Beispielzeilen des MIT-lizenzierten Projekts
[SC-Game-log-Parser](https://github.com/CasualAlacrity/SC-Game-log-Parser) getestet; Ortsnamen-Regeln stammen
zusätzlich aus [sc-inventory-tracker](https://github.com/Aurelius-Draco/sc-inventory-tracker) (MIT).

Items werden über den Klassennamen aus dem Wiki-Sync (`raw.class_name` im Item-Katalog) zugeordnet, Schiffe über
Herstellerkürzel + Namen im `ship_catalog`. Was nicht zugeordnet werden kann, wird mit lesbarem Namen angelegt.

Die Companion-Tabellen (`companion_*`, `mining_spots`) legt `src/lib/companion/db.server.ts` beim ersten Zugriff an.

## Overlay-Daten

`GET /api/public/companion/<…>` mit Geräte-Token: `overview`, `suggest`, `plan` (GET/POST), `contracts`,
`trade?location=` (was am aktuellen Ort gekauft/verkauft werden kann + bester Gegenort), `routes?scu=&budget=&from=`,
`mining` (Erze mit besten Verkaufspreisen aus UEX + von der Organisation gepflegte Abbauorte).
Marktdaten kommen von der UEX-Corp-API (wie die Handel-Seiten), zwei Minuten zwischengespeichert.

## Neue Companion-Version veröffentlichen

```bash
# im Repo project-starcitizen
OUT=/pfad/zu/UID/public/downloads scripts/build-companion.sh 0.7.0
# dann hier committen und pushen – der Companion bietet das Update automatisch an
```

## Beta-Login

Auf `beta.uid.sc` gibt es zusätzlich einen Login per E-Mail/Passwort (`/api/public/auth/beta-login`), nur wenn
`BETA_LOGIN=on` gesetzt ist. Registrierung braucht `BETA_INVITE_CODE` (falls gesetzt); E-Mails in
`BETA_ADMIN_EMAILS` (Komma-getrennt) erhalten bei der Registrierung die Admin-Rolle.
