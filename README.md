# Hero League

Fußballliga-Plattform: öffentliche Website mit Tabelle, Spielplan, Torschützenliste und Statistiken plus geschütztem Admin-Backoffice für den kompletten Spielbetrieb.

**Stack:** React (Vite) · Vercel Functions (`api/`) · Neon Postgres · Vercel Blob (Bilder) · Session-Login per Cookie

Tabelle, Torschützenliste und alle Statistiken werden **automatisch** aus den eingetragenen Ergebnissen berechnet — nichts davon wird manuell gepflegt.

## Was der Admin kann (`/admin`)

- Ergebnisse eintragen: Tore, Status (`geplant`/`live`/`beendet`), Torschützen + Vorlagengeber
- Spielplan verwalten: Spiele anlegen (Spieltag, Teams, Datum, Uhrzeit) und löschen
- Vereine anlegen, bearbeiten (Name, Kürzel, Farbe, Wappen-Emoji, Logo) und löschen
- Kader pflegen: Spieler mit optionalem Foto
- Spieler des Monats für die Startseite küren
- Neue Saison starten: alte Saison wird archiviert (über Saison-Umschalter weiter einsehbar), Vereine bleiben

## Einmalige Einrichtung

1. **Vercel-Projekt**: Repo auf [vercel.com](https://vercel.com) importieren (Framework "Vite" wird automatisch erkannt).
2. **Datenbank**: Im Vercel-Projekt → *Storage* → *Create Database* → **Neon** verbinden. `DATABASE_URL` wird automatisch gesetzt.
3. **Bild-Speicher**: *Storage* → *Create* → **Blob** verbinden. `BLOB_READ_WRITE_TOKEN` wird automatisch gesetzt.
4. **Env-Variablen** (Settings → Environment Variables, alle Umgebungen):
   - `ADMIN_PASSWORD` – langes Passwort für den Admin-Login
   - `SESSION_SECRET` – erzeugen mit `openssl rand -base64 32`
5. **Lokal verbinden und Datenbank befüllen**:
   ```bash
   npm install
   npx vercel login
   npx vercel link
   npx vercel env pull .env.local
   npm run db:setup        # legt Tabellen an + Demo-Daten
   ```

## Entwickeln

```bash
npx vercel dev
```

Startet Frontend **und** API zusammen auf http://localhost:3000. (`npm run dev` allein startet nur das Frontend ohne API.)

Weitere Befehle:

- `npm run lint` – TypeScript-Check
- `npm run build` – Produktions-Build
- `npm run db:setup -- --force` – Datenbank **komplett** auf Demo-Daten zurücksetzen (löscht alles!)

## Deployment

Jeder Push auf einen Branch erzeugt ein Preview-Deployment, Merge auf `main` deployt in die Produktion. Eigene Domain: Vercel-Projekt → Settings → Domains.

## Demo-Daten entfernen

Die Datenbank startet mit 10 Demo-Vereinen und 25 Demo-Spielen (Saison 2026/27). Für den echten Betrieb:

1. Im Admin-Panel eine **neue Saison starten** (z.B. mit echtem Saison-Label) — der Spielplan startet leer.
2. Die Demo-Vereine unter *Club & Kader bearbeiten* löschen und die echten Vereine anlegen.

## Projektstruktur

```
api/                  Vercel Functions (ein Endpunkt pro Datei)
  _lib/               Gemeinsame Server-Logik (DB, Auth, Validierung, Seed)
db/schema.sql         Datenbankschema (Neon Postgres)
scripts/setup-db.ts   Einmaliges DB-Setup + Seed
src/                  React-Frontend (Vite)
  components/         UI-Komponenten
  lib/                Frontend-Helfer (API-Client, Tabellenlogik)
vercel.json           SPA-Rewrite für Client-Routen (/admin, /verein/...)
```

**Hinweise für Änderungen:**
- Schreibende API-Endpunkte sind serverseitig durch den Session-Cookie geschützt (`api/_lib/auth.ts` → `requireAdmin`).
- Schema-Änderungen: `db/schema.sql` anpassen und das `ALTER TABLE` manuell im Neon SQL-Editor ausführen (bewusst kein Migrations-Framework).
- Website-Texte (Hero, Footer, Navigation) sind bewusst im Code (`src/components/`) und werden dort gepflegt.
