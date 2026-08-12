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
  -- Kader: Array von { "name": string, "imageUrl": string?, "number": number? }
  -- number = feste Trikotnummer (optional). JSONB → keine Schema-Migration nötig.
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
  -- Spielort/Halle des Spieltag-Abends (z.B. "Halle Königsfeld"), optional.
  venue           TEXT,
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
  -- Bester Spieler je Team (max. einer pro Team): Array von { "playerName": string, "teamId": string }
  -- Fließt in die Ballon-d'Or-Spielerwertung ein.
  best_players    JSONB NOT NULL DEFAULT '[]',
  -- Torwart je Team (max. einer pro Team): Array von { "playerName": string, "teamId": string }
  -- Je Spiel gespeichert; bei „zu null" Punkte für den Goldenen Handschuh.
  goalkeepers     JSONB NOT NULL DEFAULT '[]',
  live_started_at TEXT,
  -- Spieldauer in Minuten für den Live-Countdown (vom Schiedsrichtermodus beim
  -- Anpfiff gesetzt). NULL ⇒ klassische hochzählende Live-Minute.
  duration_minutes INTEGER,
  -- Zeitstempel, seit dem der Countdown pausiert ist (Schiedsrichter). NULL ⇒
  -- läuft. Beim Fortsetzen wird live_started_at um die Pausendauer verschoben.
  paused_at       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_matches_season ON matches(season_id);
CREATE INDEX idx_matches_matchday ON matches(matchday);
-- Ein Import-Spiel (Spiel-ID) darf je Saison nur einmal existieren – Basis für den Upsert.
CREATE UNIQUE INDEX idx_matches_import_ref ON matches(season_id, import_ref) WHERE import_ref IS NOT NULL;

-- Generische Key/Value-Ablage für Website-Einstellungen (JSONB-Blob je key).
-- Bekannte keys: twitch, social, hero, countdown, news, event, highlights,
-- roster, partners (globale Partner-/Sponsoren-Logos), team-sponsors
-- (Trikot-Sponsoren je Team: { teamId: Sponsor[] }). Wird beim ersten Speichern
-- über api/twitch.ts?resource=... automatisch per Upsert angelegt.
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

-- Anonyme Besucherzählung (Live-Anzeige + Ø pro Tag/Woche/Monat im Backoffice).
-- Kein Personenbezug: nur eine zufällige, im Browser erzeugte Besucher-ID plus
-- Datum/Zeitstempel. Eine Zeile pro Besucher & Tag; last_seen = letzter Heartbeat.
-- Wird von api/_lib/analytics.ts bei Bedarf automatisch angelegt (CREATE IF NOT EXISTS).
CREATE TABLE visits (
  visitor_id TEXT NOT NULL,
  day        DATE NOT NULL,
  last_seen  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (visitor_id, day)
);
CREATE INDEX idx_visits_last_seen ON visits(last_seen);

-- Backoffice-Benutzer (passwortloser Login per E-Mail-Code).
-- superadmin: darf alles · match_admin: Spiele/Live/Ticker pflegen ·
-- referee: nur Schiedsrichtermodus (Spiele pfeifen + Abend-Aufstellung).
-- permissions: zusätzliche, frei kombinierbare Rechte (Array von Strings, z.B.
-- ["manage_tickets"]) UNABHÄNGIG von der Basis-Rolle. So kann jemand mehrere
-- Admin-Rechte haben (z.B. Spiel-Admin + Tickets bearbeiten). Super-Admin = alles.
CREATE TABLE users (
  id          TEXT PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL DEFAULT '',
  role        TEXT NOT NULL DEFAULT 'match_admin' CHECK (role IN ('superadmin', 'match_admin', 'referee', 'ticket_manager', 'team_member')),
  permissions JSONB NOT NULL DEFAULT '[]',
  -- Profil: Avatar-Blob-URL (leer = Initialen) und Präsenz-Status.
  avatar_url  TEXT NOT NULL DEFAULT '',
  status      TEXT NOT NULL DEFAULT 'online',
  -- Benachrichtigungs-Einstellungen (z.B. { muteWeekends, muteUntil }).
  notify_prefs JSONB NOT NULL DEFAULT '{}',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
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

-- ===========================================================================
-- Team-Zusammenarbeit: Tickets, Aufgaben-Board, Benachrichtigungen
-- created_by/author_id sind bewusst OHNE Fremdschlüssel auf users (der
-- Master-Passwort-Zugang hat die synthetische id 'bootstrap', die es in users
-- nicht gibt). Anzeigenamen werden als Schnappschuss (*_name) mitgespeichert,
-- damit die Anzeige auch bei gelöschten Nutzern nie bricht.
-- ===========================================================================

-- Tickets (Verbesserungs-/Fehler-Meldungen aus dem Team). images = Array von
-- Screenshot-URLs (Vercel Blob).
CREATE TABLE tickets (
  id               TEXT PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  priority         TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('niedrig','mittel','hoch','dringend')),
  status           TEXT NOT NULL DEFAULT 'offen'  CHECK (status IN ('offen','in_bearbeitung','erledigt','abgelehnt')),
  category         TEXT NOT NULL DEFAULT '',
  images           JSONB NOT NULL DEFAULT '[]',
  created_by       TEXT NOT NULL,
  created_by_name  TEXT NOT NULL DEFAULT '',
  assigned_to      TEXT,
  assigned_to_name TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_status ON tickets(status);

-- Kommentare/Threads zu Tickets
CREATE TABLE ticket_comments (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  images      JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- Aufgaben (Wochen-/Tagesplanung, Monday-Style). due_date = konkreter Tag,
-- iso_week = z.B. '2026-W33' (Wochenansicht). Beides optional.
CREATE TABLE tasks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  notes           TEXT NOT NULL DEFAULT '',
  due_date        DATE,
  iso_week        TEXT,
  status          TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('leer','offen','in_bearbeitung','erledigt','abgebrochen')),
  priority        TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('niedrig','mittel','hoch','dringend')),
  created_by      TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tasks_week ON tasks(iso_week);
CREATE INDEX idx_tasks_due ON tasks(due_date);

-- Zuweisung mehrerer Personen zu einer Aufgabe (user_name als Schnappschuss).
CREATE TABLE task_assignees (
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, user_id)
);

-- Kommentare/Threads zu Aufgaben
CREATE TABLE task_comments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id);

-- In-App-Benachrichtigungen (Erwähnungen, Zuweisungen, neue Kommentare).
-- user_id = Empfänger. ref_type/ref_id verweisen auf das Ticket bzw. die Aufgabe.
CREATE TABLE notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref_type   TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

-- ===========================================================================
-- Phase 3: Interner Chat (Gruppen, DMs, Threads, Ticket-/Aufgaben-Anhänge)
-- ===========================================================================
CREATE TABLE conversations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('group','dm')),
  title      TEXT NOT NULL DEFAULT '',
  avatar_url TEXT NOT NULL DEFAULT '', -- Gruppen-Profilbild (Blob-URL); DMs leer
  dm_key     TEXT,               -- DMs: "kleinereId|größereId", je Paar eindeutig
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now() -- letzte Nachricht (Sortierung)
);
CREATE UNIQUE INDEX idx_conversations_dm ON conversations(dm_key) WHERE dm_key IS NOT NULL;

CREATE TABLE conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  user_name       TEXT NOT NULL DEFAULT '',
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conv_members_user ON conversation_members(user_id);

-- parent_id != NULL ⇒ Thread-Antwort. attach_* = optionales Ticket/Aufgabe.
CREATE TABLE messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_id       TEXT REFERENCES messages(id) ON DELETE CASCADE,
  author_id       TEXT NOT NULL,
  author_name     TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  attach_type     TEXT CHECK (attach_type IN ('ticket','task','file','audio')),
  attach_id       TEXT,        -- ticket/task: Entity-ID
  attach_title    TEXT,        -- Titel bzw. Dateiname
  attach_url      TEXT,        -- file/audio: Blob-URL
  attach_mime     TEXT,        -- file: MIME-Typ
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX idx_messages_parent ON messages(parent_id);

-- Chat-Präsenz: echter Online-Status per Heartbeat + „tippt gerade".
-- Bewusst ephemer (kein historischer Verlauf) – ein Eintrag pro Nutzer.
-- last_seen  = letzter Heartbeat (online, wenn jünger als ~35 s).
-- typing_conv = Unterhaltung, in der gerade getippt wird (NULL = nirgends).
-- typing_at   = Zeitpunkt des letzten Tipp-Signals (aktiv, wenn jünger als ~6 s).
CREATE TABLE chat_presence (
  user_id     TEXT PRIMARY KEY,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  typing_conv TEXT,
  typing_at   TIMESTAMPTZ,
  typing_name TEXT
);
CREATE INDEX idx_chat_presence_seen ON chat_presence(last_seen);

-- Web-Push-Abos (ein Eintrag je Gerät/Browser).
CREATE TABLE push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_push_user ON push_subscriptions(user_id);
