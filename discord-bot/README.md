# UID Discord Gateway Bot

Dauerhaft laufender Bot, der die Discord-Gateway-Verbindung hält (Bot wird
dadurch **online/grün**) und Sprachkanal-Aktivität ans Backoffice meldet.
Gesteuert wird er komplett aus dem Backoffice unter
**Admin → Discord-Aktivität**.

Die nötigen Werte (`DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `HOOK_SECRET`) sind
bereits im Lovable-Projekt als Secrets hinterlegt. Wenn du den Bot schon vorher
auf Railway laufen hattest, kopiere diese drei Werte aus dem alten Service in den
neuen (siehe Schritt 3).


## Deployment auf Railway

1. Auf [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**
   und dieses Repository auswählen.
2. In den Service-Einstellungen **Root Directory** auf `discord-bot` setzen.
   (Railway erkennt Node automatisch, `npm start` startet den Bot.)
3. Unter **Variables** eintragen:

   | Variable | Wert |
   | --- | --- |
   | `DISCORD_BOT_TOKEN` | Bot-Token aus dem Discord Developer Portal |
   | `DISCORD_GUILD_ID` | ID des Discord-Servers (Rechtsklick auf Server → ID kopieren) |
   | `BACKOFFICE_URL` | `https://uid.sc` |
   | `HOOK_SECRET` | derselbe Wert wie das Backoffice-Secret `HOOK_SECRET` |
   | `TRACK_MESSAGES` | optional `true` (zählt nur Metadaten, keine Inhalte) |
   | `PRESENCE_TEXT` | optional, Startstatus des Bots |

4. Im Discord Developer Portal → **Bot** die Privileged Intents
   **Server Members Intent** und (nur bei `TRACK_MESSAGES=true`)
   **Message Content Intent** ist *nicht* nötig – es werden keine Inhalte gelesen.
5. Deploy starten. Nach ~1 Minute zeigt das Backoffice unter
   **Admin → Discord-Aktivität** den Status „Online".

## Lokaler Test

```bash
cd discord-bot
npm install
DISCORD_BOT_TOKEN=... DISCORD_GUILD_ID=... BACKOFFICE_URL=https://uid.sc HOOK_SECRET=... npm start
```

## Was getrackt wird

- Beitritt/Verlassen/Wechsel von Sprachkanälen inkl. Dauer pro Sitzung
- Alle 30 s ein Abgleich der tatsächlich verbundenen Nutzer (robust gegen Neustarts)
- Optional Nachrichten-Ereignisse (Nutzer, Kanal, Zeitpunkt, Länge – **kein Inhalt**)
## Aktivitäts-Tracking

Der Bot zählt Sprachzeit, Nachrichten und Reaktionen (nur Metadaten, keine Inhalte).
Dafür müssen im Discord Developer Portal die Privileged Intents **Server Members** aktiv sein;
Nachrichten- und Reaktions-Events benötigen kein Message-Content-Intent.
Mit `TRACK_MESSAGES=false` lässt sich das Zählen von Nachrichten/Reaktionen abschalten.
