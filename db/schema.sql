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

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
