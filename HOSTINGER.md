# Betrieb auf Hostinger

Die Website läuft als Node.js-App im Hostinger-Cloud-Paket der Domain `uid.sc`.
Die Datenbank ist eine MySQL/MariaDB-Datenbank im selben Paket. Lovable und
Supabase werden nicht mehr benötigt.

## Aufbau

| Teil | Wo |
| --- | --- |
| App (SSR + API) | Hostinger Node.js, Build aus GitHub `MonarchCorporate/UID` (Auto-Deploy bei jedem Push auf den eingestellten Branch) |
| Datenbank | Hostinger MySQL `u589352494_uid`, Schema wird beim Start automatisch angelegt (`db/mysql/schema.sql`) |
| Dateien (Avatare, Logos, Marktplatz-Bilder) | Tabelle `storage_objects` in derselben Datenbank |
| Login | Discord-OAuth → eigene Sitzungen (`src/lib/db/auth.server.ts`) |
| Geplante Jobs (Syncs, Gewinnspiele, Monatsbericht) | im Node-Prozess, `src/lib/scheduler.server.ts` (UTC-Zeiten wie vorher bei pg_cron) |
| Discord-Gateway-Bot | separat (Railway), siehe `discord-bot/README.md`, `BACKOFFICE_URL=https://uid.sc` |

## Umgebungsvariablen (hPanel → Website → Node.js → Umgebungsvariablen)

Bereits gesetzt: `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`,
`AUTH_JWT_SECRET`, `HOOK_SECRET`, `PUBLIC_SITE_URL`, `IMPORT_TOKEN` (nur für die
Datenübernahme, danach löschen).

Noch einzutragen (Werte aus dem Discord Developer Portal bzw. LiveKit):

| Variable | Zweck |
| --- | --- |
| `DISCORD_CLIENT_ID` | Discord-Anwendung (OAuth-Login) |
| `DISCORD_CLIENT_SECRET` | Discord-Anwendung (OAuth-Login) |
| `DISCORD_BOT_TOKEN` | Bot-Aktionen (Rollen, Channels, Posts) |
| `DISCORD_GUILD_ID` | ID des Discord-Servers |
| `DISCORD_INVITE_URL` | optional, Einladungslink |
| `DISCORD_REDIRECT_URI` / `DISCORD_REDIRECT_URIS` | optional, Standard: `https://uid.sc/api/public/auth/discord/callback` |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Sprachkanäle in Einsätzen/Boards |

Wichtig: Über die Hostinger-API können Variablen nur komplett ersetzt werden
(Werte sind maskiert). Einzelne Werte daher im hPanel bearbeiten.
`NODE_ENV=production` **nicht** setzen – sonst installiert npm die
Build-Werkzeuge nicht und der Build schlägt fehl.

## Entwicklung

```bash
npm install
npm run build
DB_HOST=127.0.0.1 DB_NAME=uid DB_USER=uid DB_PASSWORD=… AUTH_JWT_SECRET=… npm start
```

Schema ändern: `db/pg/*.json` bzw. die Generatoren in `db/tools/` anpassen und
`python3 db/tools/gen_schema.py && python3 db/tools/gen_policies.py` ausführen.

## Wartungsmodus / Coming soon

Standardmäßig **aktiv**: Alle Seiten zeigen die Coming-Soon-Seite (HTTP 503),
Bot-Hooks und Bilder laufen weiter (`src/lib/maintenance.server.ts`).

- Abschalten: Umgebungsvariable `MAINTENANCE_MODE=off` im hPanel setzen.
- Vorschau für das Team trotz Wartung: einmal `https://uid.sc/?preview=<KEY>`
  öffnen (setzt ein Cookie für 30 Tage), `?preview=off` beendet die Vorschau.
  `<KEY>` = Umgebungsvariable `MAINTENANCE_KEY` (falls gesetzt).
