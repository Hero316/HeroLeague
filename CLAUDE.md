# CLAUDE.md — Arbeitsanweisung für KI-Assistenten

Diese Datei wird von Claude Code / Cursor automatisch gelesen. **Halte dich an die Regeln unten** — die Person, die dich bedient, ist evtl. kein Entwickler und verlässt sich darauf, dass du nichts kaputt machst.

Projekt: **Hero League** — Fußballliga-Plattform (öffentliche Website + geschütztes Admin-Backoffice).

---

## ⛔ Sicherheitsregeln (IMMER einhalten)

1. **Niemals direkt auf `main` arbeiten.** `main` ist die **LIVE-Website**. Es gibt genau zwei dauerhafte Branches:
   - **`main`** = Production (live)
   - **`staging`** = Entwicklung & Test — **hier wird gearbeitet**
   ```bash
   git checkout staging && git pull   # neuesten Stand holen
   # ... ändern, committen, auf staging pushen
   ```
   Keine neuen dauerhaften Branches anlegen. Nur für riskante Experimente darf ausnahmsweise ein kurzlebiger Branch von `staging` erstellt werden, der danach wieder gelöscht wird.
2. **Vor jedem Commit prüfen, dass alles baut** — beides muss fehlerfrei durchlaufen:
   ```bash
   npm run lint      # TypeScript-Check
   npm run build     # Produktions-Build
   ```
   Läuft es nicht durch: **nicht committen**, erst den Fehler beheben.
3. **Getestet wird auf der Staging-Preview-URL** (Vercel deployt jeden Push auf `staging` automatisch auf dieselbe URL) — **nie** direkt auf der Live-Seite.
4. **Keine Secrets committen.** `.env`, `.env.local`, Passwörter, Tokens bleiben lokal (stehen in `.gitignore`). Committe niemals echte Zugangsdaten.
5. **Bei riskanten Aktionen STOPP und nachfragen:** Daten löschen, `--force`, `git reset --hard`, Force-Push, `db:setup --force` (löscht die ganze Datenbank), Dateien/Verzeichnisse entfernen.
6. Nach der Arbeit: committen und **auf `staging`** (nicht `main`) pushen. Den Merge `staging → main` (= Live-Gang) bestätigt ein Mensch über einen Pull Request auf GitHub.

---

## Inhalt ≠ Code — sehr wichtig

- **Inhalte** (Vereine, Ergebnisse, Torschützen, Kader, Spieler des Monats, Twitch-Kanal) werden über das **Admin-Backoffice unter `/admin`** gepflegt — **nicht im Code.** Baue dafür **kein** neues/zusätzliches CMS und lege dafür keine Datendateien an.
- **Code-Änderungen** sind nur: Layout, neue Funktionen, Bugfixes.
- **Website-Texte** (Hero, Footer, Navigation) stehen bewusst fest im Code unter `src/components/` und werden dort geändert.
- Tabelle, Torschützenliste und Statistiken werden **automatisch aus den Ergebnissen berechnet** — niemals manuell befüllen oder eine parallele „gespeicherte Tabelle" einführen.

---

## Spontane Events / Sonder-Events (Testspieltag & Co.)

Für **zeitlich begrenzte Sonder-Aktionen** (z.B. Testspieltag) gibt es einen eigenen **Event-Modus** — bewusst getrennt vom Liga-Betrieb.

- **Datenhaltung:** Ein **Archiv** aller Testspiele (`EventArchive = { activeId, events: EventConfig[] }`) steckt in **einem** Settings-Eintrag (`settings`-Tabelle, key `event`) und wird über den bestehenden Endpunkt `api/twitch.ts` via **`/api/twitch?resource=event`** (GET/POST) gelesen/geschrieben. Vergangene Testspiele bleiben gespeichert (wie Saisons); `activeId` bestimmt, welches sichtbar ist (null = keins). **Keinen neuen `api/`-Endpunkt anlegen** — Vercel-Hobby erlaubt nur **12 Serverless-Funktionen** (aktuell genau 12 ausgeschöpft!). Neue Endpunkte immer in eine bestehende Datei per `?resource=...` einhängen.
- **Isolation:** Das Event beeinflusst **niemals** die echte Liga (keine Kader, keine Liga-Tabelle, keine Liga-Statistiken). Event-Tabelle wird rein namensbasiert aus den Event-Ergebnissen berechnet (`src/lib/eventStandings.ts`).
- **An/Aus:** Schalter im Admin unter „Testspiel / Event". `active:false` ⇒ Website ist komplett normal (kein Banner, kein Menüpunkt). Ergebnisse werden dort auch gepflegt (wie im Original).
- **Anzeige:** `EventBanner` (Startseite, oben), farbiger Navbar-Menüpunkt, eigene Seite unter **`/testspiel`** (`EventPage`: Tabelle + Spielplan + Abend-Statistiken). Eigene Magenta/Gold-Farbwelt (`#E6238E`).
- **Neues Event einrichten:** Im Admin „Neues Testspiel" anlegen (oder in `api/twitch.ts` `DEFAULT_EVENT` als Vorlage nutzen). Teams, Blöcke, Zeiten, Paarungen füllen — der Nutzer schickt PDF/Excel, daraus die `matches` bauen. Danach im Admin aktivieren. Alte Events bleiben zum Vergleich erhalten (Testspiel 1, 2, …).
- **Komplett entfernen:** Auf Wunsch des Nutzers das Event-Feature wieder ausbauen (Banner/Menü/Route/Endpunkt-Zweig) — dann ist die Seite wieder wie zuvor.

> Dieser Arbeitsbereich („dieser Chat") ist ausdrücklich **für solche spontanen Event-Aktionen** gedacht: schnell ein Event einbauen, aktivieren, nach dem Tag wieder ausschalten/entfernen.

---

## Stack & lokale Entwicklung

- **Frontend:** React + TypeScript + Vite + Tailwind CSS v4 (`src/`)
- **Backend:** Vercel Serverless Functions (`api/`, ein Endpunkt pro Datei)
- **Datenbank:** Neon Postgres, angesprochen mit `@neondatabase/serverless` über **einfaches SQL** (bewusst **kein ORM**)
- **Bilder:** Vercel Blob (`@vercel/blob`)
- **Login:** Ein Admin-Passwort + signierter HTTP-only-Cookie (`jose`)

Starten (Frontend **und** API zusammen):
```bash
npx vercel dev        # http://localhost:3000
```
`npm run dev` allein startet nur das Frontend **ohne** API — für echtes Testen immer `vercel dev`.

Erstes Setup / Env-Variablen holen: `npx vercel link` → `npx vercel env pull .env.local`.

---

## Wo ändere ich was?

| Aufgabe | Ort |
|---|---|
| UI / Aussehen / Komponenten | `src/components/` |
| Seiten-Zusammenbau, Routing, App-State | `src/App.tsx` |
| Datentypen (TS-Interfaces) | `src/types.ts` |
| API-Endpunkt (lesen/schreiben) | `api/<name>.ts` bzw. `api/<name>/[id].ts` |
| Gemeinsame Server-Logik | `api/_lib/` (`db.ts`, `auth.ts`, `validate.ts`, `seed.ts`, `league.ts`) |
| Tabellen-/Statistik-Berechnung | `src/lib/standings.ts` und `api/_lib/league.ts` |
| Datenbankschema | `db/schema.sql` |

---

## Konventionen (an den bestehenden Code halten)

- **UI-Sprache ist Deutsch.** Neue Texte in der Oberfläche auf Deutsch.
- **Jeder schreibende API-Endpunkt muss serverseitig geschützt sein** — mit `requireAdmin(...)` aus `api/_lib/auth.ts` umschließen. Niemals einen Schreib-Endpunkt ohne diesen Schutz anlegen.
- **Eingaben validieren** mit den Helfern aus `api/_lib/validate.ts`.
- **API-Antworten camelCase** (in den SQL-SELECTs wird per Alias gemappt, siehe `api/_lib/db.ts`) — die Frontend-Typen bleiben unverändert.
- **Schema-Änderung:** `db/schema.sql` anpassen **und** das passende `ALTER TABLE` von Hand im Neon SQL-Editor ausführen (bewusst kein Migrations-Framework).
- Neue ESM-Imports in `api/` mit **`.js`-Endung** schreiben (z.B. `from './_lib/db.js'`) — Vercel-Node-Runtime.
- Wenige Abhängigkeiten. Vor dem Hinzufügen einer neuen Library überlegen, ob es ohne geht.

---

## Nach einer Änderung: Checkliste

1. `npm run lint` und `npm run build` grün?
2. Lokal mit `vercel dev` ausprobiert?
3. Auf **`staging`** committen und pushen (nicht `main`).
4. Staging-Preview-URL öffnen und die konkrete Änderung dort real durchklicken.
5. Erst wenn das passt: über einen Pull Request `staging → main` mergen (macht ein Mensch) — damit geht es live.
