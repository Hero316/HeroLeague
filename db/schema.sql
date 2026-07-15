-- Hero League – Datenbankschema für Neon Postgres
-- Anwenden mit: npm run db:setup (oder manuell im Neon SQL-Editor)

CREATE TABLE seasons (
  id         TEXT PRIMARY KEY,
  label      TEXT NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teams (
  id           TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  short_name   TEXT NOT NULL,
  logo_color   TEXT NOT NULL DEFAULT '#3B82F6',
  logo_icon    TEXT NOT NULL DEFAULT '⚽',
  logo_url     TEXT NOT NULL DEFAULT '',
  -- Kader: Array von { "name": string, "imageUrl": string? }
  spielerliste JSONB NOT NULL DEFAULT '[]',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE matches (
  id              TEXT PRIMARY KEY,
  season_id       TEXT NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  matchday        INTEGER NOT NULL,
  home_team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  away_team_id    TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  home_score      INTEGER,
  away_score      INTEGER,
  status          TEXT NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant', 'live', 'beendet')),
  date            TEXT NOT NULL,
  time            TEXT NOT NULL,
  -- Feld/Platz (z.B. 1 oder 2) und Zeitfenster im Ligaabend – aus dem Excel-Import.
  -- Nullable: manuell angesetzte Spiele brauchen diese Werte nicht.
  field           INTEGER,
  slot            INTEGER,
  -- Referenz auf die Spiel-ID aus der Import-Datei (z.B. "HL-001"), je Saison eindeutig.
  -- Ermöglicht wiederholbaren Import, ohne bereits eingetragene Ergebnisse zu überschreiben.
  import_ref      TEXT,
  -- Torschützen: Array von { "playerName": string, "teamId": string, "assistName": string? }
  scorers         JSONB NOT NULL DEFAULT '[]',
  -- Abwesende Kaderspieler: Array von { "playerName": string, "teamId": string }
  -- Fehlt ein Spieler hier, gilt er als eingesetzt (Rückwärtskompatibilität)
  absentees       JSONB NOT NULL DEFAULT '[]',
  live_started_at TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matches_season ON matches(season_id);
CREATE INDEX idx_matches_matchday ON matches(matchday);
-- Ein Import-Spiel (Spiel-ID) darf je Saison nur einmal existieren – Basis für den Upsert.
CREATE UNIQUE INDEX idx_matches_import_ref ON matches(season_id, import_ref) WHERE import_ref IS NOT NULL;

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Backoffice-Benutzer (passwortloser Login per E-Mail-Code).
-- superadmin: darf alles · match_admin: nur Spiele/Live/Ticker pflegen.
CREATE TABLE users (
  id         TEXT PRIMARY KEY,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT NOT NULL DEFAULT '',
  role       TEXT NOT NULL DEFAULT 'match_admin' CHECK (role IN ('superadmin', 'match_admin')),
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Einmal-Login-Codes (gehasht, mit Ablauf und Fehlversuchszähler)
CREATE TABLE login_codes (
  email      TEXT NOT NULL,
  code_hash  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_codes_email ON login_codes(email);
