# token-stats

Zeigt in Claude Code den Token-Verbrauch: **Heute · 7 Tage · 30 Tage · Gesamt**.

- **Neuer Chat:** Über dem Eingabefeld steht eine Karte mit den vier Zahlen, bis zur ersten Nachricht.
- **`/tokens`:** öffnet die Details. Eine Tabelle zeigt Input, Output, Cache neu, Cache lesen und Antworten, dazu kommen ein Balkendiagramm der letzten 30 Tage und ein Button „Aktualisieren".
- **`/tokens basis 50Mrd 14.10.2026`:** übernimmt einen früheren Gesamtwert als Startwert. Gesamt ist dann dieser Wert plus alles ab dem Folgetag. `/tokens basis aus` entfernt ihn.
- **`/tokens karte`:** blendet die Karte wieder ein.

Gezählt wird aus den lokalen Verläufen (`~/.claude/projects/**/*.jsonl`) **dieses Geräts**. Ein
Hauptbuch (`~/.claude/token-stats/ledger.json`) behält die Summen, auch wenn Claude Code alte Verläufe
löscht. Eine Antwort, die in mehreren Verläufen steht, zählt einmal.

## Voraussetzungen

- Claude Code (Desktop-App oder CLI) ab Version **2.1.295**. Das Plugin nutzt die Function-Hooks-API (Early Access).
- **Node.js** im `PATH`. Das Zählskript `scripts/scan.mjs` läuft mit `node`.

## Installation

### Windows, mit Skript (empfohlen)

ZIP entpacken, im entpackten Ordner `token-stats` eine PowerShell öffnen:

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

Das Skript macht zwei Dinge:
- Es kopiert das Plugin nach `%USERPROFILE%\.claude\mods\token-stats`.
- Es trägt diesen Ordner in `%USERPROFILE%\.claude\settings.json` unter `env.CLAUDE_CODE_PLUGIN_DIRS` ein. Vorhandene Einträge bleiben erhalten, und vorher legt es `settings.json.bak` an.

Danach die Claude-Desktop-App neu starten bzw. eine neue Session öffnen.

### Von Hand (Windows, macOS, Linux)

1. Den Ordner `token-stats` nach `~/.claude/mods/token-stats` kopieren.
2. In `~/.claude/settings.json` ergänzen (bei mehreren Ordnern mit `;` unter Windows bzw. `:` unter macOS/Linux trennen):

   ```json
   { "env": { "CLAUDE_CODE_PLUGIN_DIRS": "C:\\Users\\<name>\\.claude\\mods\\token-stats" } }
   ```

3. Neue Session starten.

### Als Plugin über die CLI (Alternative)

Der Ordner ist zugleich ein lokaler Marketplace. Im Terminal:

```
claude plugin marketplace add <Pfad>/token-stats
claude plugin install token-stats@token-stats-local
```

Ein so installiertes Plugin lädt auch in den Sessions der Desktop-App.

## Deinstallation

- `CLAUDE_CODE_PLUGIN_DIRS` aus `settings.json` entfernen, falls es nur auf dieses Plugin zeigt (oder `settings.json.bak` zurückspielen).
- Den Ordner `~/.claude/mods/token-stats` löschen.
- Optional auch `~/.claude/token-stats/` löschen, dort liegt das Hauptbuch.

## Prüfen

```
claude plugin validate <Pfad>/token-stats
claude plugin test <Pfad>/token-stats
```
