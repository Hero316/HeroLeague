# Hero League

Fußballliga-Plattform: öffentliche Website mit Tabelle, Spielplan, Torschützenliste und Statistiken plus geschütztem Admin-Backoffice für den kompletten Spielbetrieb.

**Stack:** React (Vite) · Vercel Functions (`api/`) · Neon Postgres · Vercel Blob (Bilder) · Login per Cookie

> Tabelle, Torschützenliste und alle Statistiken werden **automatisch** aus den eingetragenen Ergebnissen berechnet — nichts davon wird manuell gepflegt.

---

## 🧭 Zuerst verstehen: Es gibt zwei Wege, etwas zu ändern

| | **1. Inhalte** | **2. Code / Design** |
|---|---|---|
| Was? | Vereine, Ergebnisse, Torschützen, Kader, Spieler des Monats, Twitch | Aussehen, neue Funktionen, Fehler beheben |
| Wie? | Im **Admin-Backoffice** unter `/admin` | Mit einem **KI-Editor** (Claude Code / Cursor) + GitHub |
| Risiko? | Praktisch keins | Nur wenn man die Regeln unten ignoriert |

**Wer nur Ergebnisse pflegt, braucht Weg 2 nie.** Einfach einloggen und eintragen.

---

## 1. Inhalte pflegen (kein Code nötig)

Auf der Website unten auf **„Admin-Bereich"** klicken oder direkt `…/admin` öffnen und mit dem Admin-Passwort einloggen. Dort kannst du:

- **Ergebnisse eintragen:** Tore per **+ / −**, Status (`geplant` / `live` / `beendet`), Torschützen + Vorlagengeber. Ein Spiel lässt sich „LIVE" stellen und wie ein Live-Ticker Tor für Tor hochzählen.
- **Spielplan verwalten:** Spiele anlegen (Spieltag, Teams, Datum, Uhrzeit) und löschen.
- **Vereine** anlegen, bearbeiten (Name, Kürzel, Farbe, Wappen-Emoji, Logo) und löschen.
- **Kader** pflegen: Spieler mit optionalem Foto (Fotos poppen auf der Website per Klick groß auf).
- **Spieler des Monats** küren — auch automatisch per „Aus Monatsdaten berechnen".
- **Twitch:** Kanal eintragen und den Live-Schalter umlegen → Banner erscheint/​verschwindet auf der Startseite.
- **Neue Saison starten:** die alte Saison wird archiviert (über den Saison-Umschalter weiter einsehbar), Vereine bleiben erhalten.

---

## 2. Am Code / Design arbeiten (mit KI)

### Werkzeug
Du brauchst einen **KI-Code-Editor** — such dir eins aus:
- **VS Code** + Claude-Code-Erweiterung (braucht ein Claude-Abo), **oder**
- **Cursor** (KI-Editor, bringt die Modelle direkt mit) — für Einsteiger oft am einfachsten.

Beide können Dateien ändern **und** die Git-Schritte per Knopf erledigen. Ein Terminal ist nicht zwingend nötig. Diese Datei und `CLAUDE.md` liest die KI automatisch und hält sich an die Sicherheitsregeln.

### ⭐ Die drei goldenen Regeln
1. **Niemals direkt auf `main` arbeiten.** `main` = die echte, öffentliche Website. Immer zuerst einen **neuen Branch** anlegen (die KI macht das für dich, wenn du es ihr sagst).
2. **Immer erst auf der Vorschau testen.** Jeder Push auf einen Branch erzeugt bei Vercel automatisch eine **eigene Test-URL („Preview")**. Dort ausprobieren — nicht auf der Live-Seite.
3. **Erst wenn es auf der Vorschau passt**, wird es nach `main` übernommen (= geht live). Das bestätigt ein Mensch mit einem „Pull Request" auf GitHub.

### Der typische Ablauf
```
1. Neuesten Stand holen        → git pull
2. Neuen Branch anlegen        → z.B. "banner-farbe-aendern"
3. Mit der KI die Änderung machen
4. Prüfen, dass es baut        → npm run lint  &&  npm run build
5. Committen + auf den Branch pushen
6. Vercel-Vorschau-URL öffnen und die Änderung real durchklicken
7. Passt? → auf GitHub Pull Request nach main mergen → live
```

### Wenn doch mal etwas kaputtgeht
Kein Drama: Im **Vercel-Projekt → Deployments** kann man per Klick auf **„Rollback"** sofort die letzte funktionierende Version wieder live schalten.

---

## 👥 Zu zweit arbeiten

**GitHub ist die „Wahrheit". Jeder Rechner ist nur eine Kopie.** Deshalb gilt immer:

- **Bevor du anfängst:** `git pull` (holt die Änderungen des anderen).
- **Wenn du fertig bist:** committen + `git push`.

Ändert ihr verschiedene Dateien, fügt Git das automatisch zusammen. Ändert ihr *dieselbe Stelle gleichzeitig*, gibt es einen „Merge-Konflikt" — den löst die KI in Sekunden. Am saubersten bleibt es, wenn jeder auf **eigenen Branches** arbeitet und über Pull Requests zusammenführt.

---

## ⚙️ Einmalige technische Einrichtung

> Nur beim Aufsetzen auf einem neuen Vercel-Konto nötig.

1. **Vercel-Projekt:** Repo auf [vercel.com](https://vercel.com) importieren (Framework „Vite" wird automatisch erkannt).
2. **Datenbank:** Vercel-Projekt → *Storage* → *Create Database* → **Neon** verbinden. `DATABASE_URL` wird automatisch gesetzt.
3. **Bild-Speicher:** *Storage* → *Create* → **Blob** verbinden. `BLOB_READ_WRITE_TOKEN` wird automatisch gesetzt.
4. **Env-Variablen** (Settings → Environment Variables, alle Umgebungen):
   - `ADMIN_PASSWORD` – langes Passwort für den Admin-Login
   - `SESSION_SECRET` – erzeugen mit `openssl rand -base64 32`
5. **Lokal verbinden und Datenbank befüllen:**
   ```bash
   npm install
   npx vercel login
   npx vercel link
   npx vercel env pull .env.local
   npm run db:setup        # legt Tabellen an + Demo-Daten
   ```

---

## 🖥️ Befehle

```bash
npx vercel dev                # Frontend + API zusammen → http://localhost:3000
npm run lint                  # TypeScript-Check (vor jedem Commit)
npm run build                 # Produktions-Build (vor jedem Commit)
npm run db:setup -- --force   # ⚠️ Datenbank KOMPLETT auf Demo-Daten zurücksetzen (löscht alles!)
```

`npm run dev` allein startet nur das Frontend **ohne** API — zum echten Testen immer `npx vercel dev`.

---

## 🧹 Demo-Daten entfernen (für den echten Start)

Die Datenbank startet mit 10 Demo-Vereinen und 25 Demo-Spielen. Für den echten Betrieb:

1. Im Admin-Panel eine **neue Saison starten** — der Spielplan startet leer.
2. Die Demo-Vereine unter *Club & Kader bearbeiten* löschen und die echten Vereine anlegen.

---

## 📁 Projektstruktur

```
api/                  Vercel Functions (ein Endpunkt pro Datei)
  _lib/               Gemeinsame Server-Logik (DB, Auth, Validierung, Seed)
db/schema.sql         Datenbankschema (Neon Postgres)
scripts/setup-db.ts   Einmaliges DB-Setup + Seed
src/                  React-Frontend (Vite)
  components/         UI-Komponenten
  lib/                Frontend-Helfer (API-Client, Tabellenlogik)
vercel.json           SPA-Rewrite für Client-Routen (/admin, /verein/...)
CLAUDE.md             Regeln für KI-Assistenten (Claude Code / Cursor)
```

**Hinweise für Änderungen:**
- Schreibende API-Endpunkte sind serverseitig durch den Session-Cookie geschützt (`api/_lib/auth.ts` → `requireAdmin`).
- Schema-Änderungen: `db/schema.sql` anpassen und das `ALTER TABLE` manuell im Neon SQL-Editor ausführen (bewusst kein Migrations-Framework).
- Website-Texte (Hero, Footer, Navigation) sind bewusst im Code (`src/components/`) und werden dort gepflegt.
