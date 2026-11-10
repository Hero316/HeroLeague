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
   Läuft es nicht durch: **nicht committen**, erst den Fehler beheben. (Einzige Ausnahme bei lint: der bekannte alte Fehler `scripts/import-schedule.ts: Cannot find module 'xlsx'` – siehe „Zwei Personen arbeiten gleichzeitig".)
3. **Getestet wird auf der Staging-Preview-URL** (Vercel deployt jeden Push auf `staging` automatisch auf dieselbe URL) — **nie** direkt auf der Live-Seite.
4. **Keine Secrets committen.** `.env`, `.env.local`, Passwörter, Tokens bleiben lokal (stehen in `.gitignore`). Committe niemals echte Zugangsdaten.
5. **Bei riskanten Aktionen STOPP und nachfragen:** Daten löschen, `--force`, `git reset --hard`, Force-Push, `db:setup --force` (löscht die ganze Datenbank), Dateien/Verzeichnisse entfernen.
6. Nach der Arbeit: committen und **auf `staging`** (nicht `main`) pushen, dann über einen Pull Request `staging → main` live schalten (siehe „Live-Gang" und „Zwei Personen arbeiten gleichzeitig").

---

## 👥 Zwei Personen arbeiten gleichzeitig (Maik & Elias) — IMMER einhalten

An der Website arbeiten **Maik und Elias gleichzeitig** mit Claude (GitHub: `Hero316`). Beide pushen auf `staging` und schalten über einen PR `staging → main` selbst live. Damit keine Crashes entstehen:

1. **Vor Arbeitsbeginn den neuesten Stand holen** – nie auf einem alten Stand anfangen:
   ```bash
   git fetch origin && git checkout staging && git pull origin staging
   ```
2. **Vor jedem Push nochmal holen:**
   ```bash
   git pull --no-rebase origin staging
   ```
   Konflikte sauber zusammenführen, dabei **nichts vom anderen wegwerfen**. Danach `npm run lint` und `npm run build`. Der Build muss fehlerfrei sein. Bei lint ist **nur** der bekannte Fehler `scripts/import-schedule.ts: Cannot find module 'xlsx'` erlaubt (alt, betrifft die Website nicht). Jeder andere Fehler heißt: **nicht pushen.**
3. **Niemals Force-Push, kein `git reset --hard` auf `staging` oder `main`** – das kann die Arbeit des anderen löschen.
4. **Vor jedem Live-Gang prüfen, was auf `staging` liegt und noch nicht live ist:**
   ```bash
   git fetch origin && git log origin/main..origin/staging --format="%h %s"
   ```
   Achtung: Bei beiden steht als Autor „Claude" – also am Commit-Titel und an den eigenen Commits **dieser Sitzung** erkennen, was von dir ist. Liegt dort etwas, das nicht von dir aus dieser Sitzung stammt: **nicht einfach mit live schalten**, sondern den Nutzer dieser Sitzung fragen: „Auf staging liegt noch eine Änderung, die nicht von mir ist und nicht live ist: [Titel]. Soll die mit?"
5. **Fertige Änderungen sofort live schalten**, damit auf `staging` nie lange halbfertige Sachen liegen, die der andere aus Versehen mitschickt.
6. **Vor größeren Umbauten nachfragen**, ob der andere (Maik bzw. Elias) gerade an derselben Stelle arbeitet – besonders bei Statistik-Seite, Startseite, Statistik-Center/Tracking und Rechnungen. **Änderungen an der Datenbank** (neue Tabellen oder Spalten in `api/_lib/ensure.ts` bzw. `db/schema.sql`) **immer vorher absprechen.**
7. **Neue Dateien in `api/` sind erlaubt.** Wir haben Vercel Pro, die Live-Seite läuft bereits mit 21 Funktionen.
8. **Nach dem Merge des PRs `staging` auf `main` nachziehen:**
   ```bash
   git fetch origin main && git merge --ff-only origin/main && git push origin staging
   ```
   Erst „ist live" melden, wenn das Production-Deployment auf Vercel `success` zeigt (Prüfung siehe „Live-Gang" ganz unten).

---

## Inhalt ≠ Code — sehr wichtig

- **Inhalte** (Vereine, Ergebnisse, Torschützen, Kader, Spieler des Monats, Twitch-Kanal) werden über das **Admin-Backoffice unter `/admin`** gepflegt — **nicht im Code.** Baue dafür **kein** neues/zusätzliches CMS und lege dafür keine Datendateien an.
- **Code-Änderungen** sind nur: Layout, neue Funktionen, Bugfixes.
- **Website-Texte** (Hero, Footer, Navigation) stehen bewusst fest im Code unter `src/components/` und werden dort geändert.
- Tabelle, Torschützenliste und Statistiken werden **automatisch aus den Ergebnissen berechnet** — niemals manuell befüllen oder eine parallele „gespeicherte Tabelle" einführen.

---

## Spontane Events / Sonder-Events (Testspieltag & Co.)

Für **zeitlich begrenzte Sonder-Aktionen** (z.B. Testspieltag) gibt es einen eigenen **Event-Modus** — bewusst getrennt vom Liga-Betrieb.

- **Datenhaltung:** Ein **Archiv** aller Testspiele (`EventArchive = { activeId, events: EventConfig[] }`) steckt in **einem** Settings-Eintrag (`settings`-Tabelle, key `event`) und wird über den bestehenden Endpunkt `api/twitch.ts` via **`/api/twitch?resource=event`** (GET/POST) gelesen/geschrieben. Vergangene Testspiele bleiben gespeichert (wie Saisons); `activeId` bestimmt, welches sichtbar ist (null = keins).
- **Isolation:** Das Event beeinflusst **niemals** die echte Liga (keine Kader, keine Liga-Tabelle, keine Liga-Statistiken). Event-Tabelle wird rein namensbasiert aus den Event-Ergebnissen berechnet (`src/lib/eventStandings.ts`).
- **An/Aus:** Schalter im Admin unter „Testspiel / Event". `active:false` ⇒ Website ist komplett normal (kein Banner, kein Menüpunkt). Ergebnisse werden dort auch gepflegt (wie im Original).
- **Anzeige:** `EventBanner` (Startseite, oben), farbiger Navbar-Menüpunkt, eigene Seite unter **`/testspiel`** (`EventPage`: Tabelle + Spielplan + Abend-Statistiken). Eigene Magenta/Gold-Farbwelt (`#E6238E`).
- **Neues Event einrichten:** Im Admin „Neues Testspiel" anlegen (oder in `api/twitch.ts` `DEFAULT_EVENT` als Vorlage nutzen). Teams, Blöcke, Zeiten, Paarungen füllen — der Nutzer schickt PDF/Excel, daraus die `matches` bauen. Danach im Admin aktivieren. Alte Events bleiben zum Vergleich erhalten (Testspiel 1, 2, …).
- **Komplett entfernen:** Auf Wunsch des Nutzers das Event-Feature wieder ausbauen (Banner/Menü/Route/Endpunkt-Zweig) — dann ist die Seite wieder wie zuvor.

> Dieser Arbeitsbereich („dieser Chat") ist ausdrücklich **für solche spontanen Event-Aktionen** gedacht: schnell ein Event einbauen, aktivieren, nach dem Tag wieder ausschalten/entfernen.

---

## Rechnungen (Buchhaltung) — nicht anfassen ohne Grund

- Season-Buchungen werden per Rechnung bezahlt. Jede Rechnung/Stornorechnung liegt **einmal** im Archiv (Tabelle `invoices`: eingefrorene Daten + fertige PDF). Code: `api/_lib/invoiceArchive.ts` (Nummern, Archiv), `api/_lib/invoicePdf.ts` (PDF), `api/_lib/invoice.ts` (Vorlage/E-Mail).
- **Rechnungen nie löschen oder nachträglich ändern.** Korrektur nur per Stornorechnung (eigene Nummer aus demselben Nummernkreis), danach ggf. neue Rechnung.
- Nummernvergabe passiert atomar in **einer** SQL-Anweisung (Zähler `settings.season_booking.invoice.nextNo`) – nicht in mehrere Schritte aufteilen, sonst drohen doppelte Nummern oder Lücken. Testbuchungen bekommen `TEST-…` und ziehen keine echte Nummer.

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
- **Keine Füll- und Erklärtexte in der Oberfläche.** Keine Zeilen wie „10 Spiele · zum Wischen“, keine Status-/Info-Pillen über Überschriften („Season läuft · jeder kann mitmachen“), keine beschreibenden Untertitel, die nur wiederholen, was man sieht. Nur Texte, die der Nutzer ausdrücklich will oder die echte Information tragen (Ergebnis, Datum, Zeit).
- **Jeder schreibende API-Endpunkt muss serverseitig geschützt sein** — mit `requireAdmin(...)` aus `api/_lib/auth.ts` umschließen. Niemals einen Schreib-Endpunkt ohne diesen Schutz anlegen.
- **Eingaben validieren** mit den Helfern aus `api/_lib/validate.ts`.
- **API-Antworten camelCase** (in den SQL-SELECTs wird per Alias gemappt, siehe `api/_lib/db.ts`) — die Frontend-Typen bleiben unverändert.
- **Schema-Änderung:** `db/schema.sql` anpassen **und** das passende `ALTER TABLE` von Hand im Neon SQL-Editor ausführen (bewusst kein Migrations-Framework).
- Neue ESM-Imports in `api/` mit **`.js`-Endung** schreiben (z.B. `from './_lib/db.js'`) — Vercel-Node-Runtime.
- Wenige Abhängigkeiten. Vor dem Hinzufügen einer neuen Library überlegen, ob es ohne geht.
- **Handy-Zurück IMMER von Anfang an einbauen.** Jede Ebene, die per React-State geöffnet wird (Modal, Detail-Panel, aufgeklappte Spieler-/Spielansicht, Overlay), MUSS `useBackClose(offen, () => schließen())` aus `src/lib/backStack.ts` bekommen — sonst verlässt die Zurück-Geste/-Taste am iPhone/Android gleich die ganze Seite. Sichtbare Zurück-/X-Knöpfe rufen `goBackLayer()` (oder setzen den State auf zu; `useBackClose` räumt den History-Eintrag selbst auf). Reine URL-Routen (`navigateTo`) brauchen das nicht – da funktioniert „Zurück" ohnehin.
- **Kein horizontales Überlaufen am Handy.** Karten-/Listen-Grids brauchen eine feste Basis-Spalte (`grid-cols-1`, nicht nur `grid`), Flex-Kinder mit langem Text `min-w-0` + `truncate`, fixe Elemente `shrink-0`, Button-Reihen `flex-wrap`. Faustregel: alles muss bei 360 px Breite passen.
- **iOS Safe-Area IMMER beachten (Notch/Dynamic Island/Statusleiste).** Jedes Element, das **ganz oben** an der Seite klebt – ein Seiten-Kopf, eine `sticky top-0`/`fixed top-0`-Leiste, ein oberer Zurück-/X-Knopf – MUSS oben um die Safe-Area gepolstert sein, sonst verschwindet es am iPhone hinter der Statusleiste und ist nicht antippbar. Konkret: `paddingTop: 'calc(env(safe-area-inset-top) + <Basisabstand>)'` bzw. Tailwind `pt-[calc(env(safe-area-inset-top)+0.75rem)]`. Die geteilte `Navbar` macht das bereits; **eigenständige Vollbild-Seiten OHNE Navbar** (z. B. Tippspiel, Schiedsrichter-Modus, Chat, Overlays) müssen es selbst tun. Unten analog `env(safe-area-inset-bottom)` für fixierte Fuß-Leisten. `viewport-fit=cover` ist gesetzt. **Vor jedem Commit gedanklich durchgehen: Steht oben/unten am Rand etwas Klickbares? → Safe-Area geprüft?**

---

## Nach einer Änderung: Checkliste

1. `npm run lint` und `npm run build` grün? (Bei lint ist nur der bekannte `xlsx`-Fehler erlaubt.)
2. Lokal mit `vercel dev` ausprobiert?
3. Auf **`staging`** committen, vor dem Push `git pull --no-rebase origin staging`, dann pushen (nicht `main`).
4. Staging-Preview-URL öffnen und die konkrete Änderung dort real durchklicken.
5. Erst wenn das passt: prüfen, ob auf `staging` fremde, noch nicht live geschaltete Commits liegen (Regel 4 unter „Zwei Personen arbeiten gleichzeitig"), dann Pull Request `staging → main` erstellen und mergen — damit geht es live.

### Live-Gang (so arbeitet der Nutzer)

- Der Nutzer möchte, dass **du selbst live schaltest**: PR `staging → main` erstellen und mergen, danach `staging` per Fast-Forward auf `main` nachziehen (`git fetch origin main && git merge --ff-only origin/main && git push origin staging`).
- **Vercel deployt nach jedem Merge auf `main` automatisch in Production.** Den Nutzer NICHT bitten, manuell „Create Deployment“ zu klicken.
- Stattdessen selbst prüfen, ob es live ist: `gh api "repos/Hero316/HeroLeague/deployments?sha=<merge-sha>&environment=Production"` → Status der Deployment-ID abfragen (`…/deployments/<id>/statuses`, `state: success`). Erst wenn das `success` ist, „ist live“ melden. Nur wenn dort nach einigen Minuten nichts kommt oder `failure` steht, den Nutzer informieren.
