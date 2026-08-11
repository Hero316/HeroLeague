-- ===========================================================================
-- Hero League – Team-Zusammenarbeit: einmalig im Neon SQL-Editor ausführen.
-- Additiv & sicher: legt nur neue Tabellen an und erweitert die Rollenliste.
-- Bestehende Daten bleiben unberührt. (NICHT `npm run db:setup` – das ist
-- destruktiv.) Mehrfaches Ausführen ist dank IF NOT EXISTS unkritisch.
-- ===========================================================================

-- 1) Neue Rolle 'ticket_manager' erlauben ----------------------------------
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('superadmin','match_admin','referee','ticket_manager'));

-- 2) Tickets ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS tickets (
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
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);

CREATE TABLE IF NOT EXISTS ticket_comments (
  id          TEXT PRIMARY KEY,
  ticket_id   TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  images      JSONB NOT NULL DEFAULT '[]',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ticket_comments_ticket ON ticket_comments(ticket_id);

-- 3) Aufgaben-Board ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS tasks (
  id              TEXT PRIMARY KEY,
  title           TEXT NOT NULL,
  notes           TEXT NOT NULL DEFAULT '',
  due_date        DATE,
  iso_week        TEXT,
  status          TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('leer','offen','in_bearbeitung','erledigt','abgebrochen')),
  created_by      TEXT NOT NULL,
  created_by_name TEXT NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_tasks_week ON tasks(iso_week);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);

CREATE TABLE IF NOT EXISTS task_assignees (
  task_id   TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id   TEXT NOT NULL,
  user_name TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (task_id, user_id)
);

CREATE TABLE IF NOT EXISTS task_comments (
  id          TEXT PRIMARY KEY,
  task_id     TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id   TEXT NOT NULL,
  author_name TEXT NOT NULL DEFAULT '',
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- 4) Benachrichtigungen -----------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  kind       TEXT NOT NULL,
  ref_type   TEXT NOT NULL,
  ref_id     TEXT NOT NULL,
  body       TEXT NOT NULL DEFAULT '',
  is_read    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
