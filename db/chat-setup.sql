-- ===========================================================================
-- Hero League – Phase 3: Interner Chat (Gruppen, DMs, Threads, Anhänge).
-- Einmalig im Neon SQL-Editor ausführen. Additiv & gefahrlos wiederholbar.
-- Baut auf der Team-Zusammenarbeit (collab-setup.sql) auf.
-- ===========================================================================

-- Unterhaltungen: 'group' (benannte Gruppe) oder 'dm' (1:1). Bei DMs sorgt
-- dm_key ("kleinereId|größereId") dafür, dass es je Paar nur EINE DM gibt.
-- updated_at = Zeitpunkt der letzten Nachricht (für die Sortierung der Liste).
CREATE TABLE IF NOT EXISTS conversations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('group','dm')),
  title      TEXT NOT NULL DEFAULT '',
  dm_key     TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_dm ON conversations(dm_key) WHERE dm_key IS NOT NULL;

-- Mitglieder einer Unterhaltung. last_read_at trägt den ungelesen-Zähler.
CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id         TEXT NOT NULL,
  user_name       TEXT NOT NULL DEFAULT '',
  last_read_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conv_members_user ON conversation_members(user_id);

-- Nachrichten. parent_id != NULL ⇒ Antwort in einem Thread (wie Slack).
-- attach_type/attach_id/attach_title: optional angehängtes Ticket oder Aufgabe
-- (Titel als Schnappschuss, damit die Anzeige nie bricht).
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  parent_id       TEXT REFERENCES messages(id) ON DELETE CASCADE,
  author_id       TEXT NOT NULL,
  author_name     TEXT NOT NULL DEFAULT '',
  body            TEXT NOT NULL DEFAULT '',
  attach_type     TEXT CHECK (attach_type IN ('ticket','task')),
  attach_id       TEXT,
  attach_title    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_parent ON messages(parent_id);
