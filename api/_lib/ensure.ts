import { sql } from './db.js';

// Selbstheilendes Schema: legt Tabellen/Spalten der Team-Zusammenarbeit bei
// Bedarf an. Schneller Vorab-Check überspringt alles, wenn schon vorhanden
// (also praktisch kostenlos im Normalbetrieb). Jeder DDL-Befehl ist einzeln
// fehlertolerant. Läuft je Serverless-Instanz höchstens einmal DDL.

let ensured = false;

async function run(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error('ensureSchema-Befehl:', err);
  }
}

export async function ensureSchema(): Promise<void> {
  if (ensured) return;

  // Schneller Check: sind die wichtigsten neuen Objekte schon da? Dann fertig.
  try {
    await sql`SELECT avatar_url, status, permissions, notify_prefs FROM users LIMIT 1`;
    await sql`SELECT 1 FROM tickets LIMIT 1`;
    await sql`SELECT priority, end_date, start_time, type FROM tasks LIMIT 1`;
    // WICHTIG: hier die NEUE Spalte mitprüfen (nicht nur die Tabelle!). Sonst
    // denkt der Schnell-Check, alles sei da, und überspringt das ALTER, das die
    // Spalte anlegt – die Chat-Abfrage bricht dann und die Liste kommt leer.
    await sql`SELECT avatar_url FROM conversations LIMIT 1`;
    await sql`SELECT 1 FROM push_subscriptions LIMIT 1`;
    // Neue Präsenz-Tabelle mitprüfen, sonst überspringt der Schnell-Check das
    // Anlegen auf bereits bestehenden Datenbanken.
    await sql`SELECT 1 FROM chat_presence LIMIT 1`;
    // Reaktionen + Bearbeitet/Gelöscht (WhatsApp-Funktionen) mitprüfen.
    await sql`SELECT edited_at, deleted_at FROM messages LIMIT 1`;
    await sql`SELECT 1 FROM message_reactions LIMIT 1`;
    // Thread-Lesestand (ungelesene Thread-Antworten) mitprüfen.
    await sql`SELECT 1 FROM thread_reads LIMIT 1`;
    // Abstimmungen (Umfragen im Chat) mitprüfen – WICHTIG, damit auf bereits
    // bestehenden Datenbanken die Poll-Tabellen UND die erweiterte
    // attach_type-Prüfung ('poll') unten nachgezogen werden.
    await sql`SELECT 1 FROM polls LIMIT 1`;
    // Ideen-Bereich (Brainstorm) mitprüfen.
    await sql`SELECT 1 FROM ideas LIMIT 1`;
    // Medien-Anhänge im Ideen-Brainstorm (Bild/Video/Datei/Audio) mitprüfen.
    await sql`SELECT attach_type FROM idea_comments LIMIT 1`;
    // Volle Chat-Funktionen im Brainstorm: Bearbeitet/Gelöscht + Reaktionen
    // mitprüfen, sonst überspringt der Schnell-Check das Anlegen auf bereits
    // bestehenden Datenbanken.
    await sql`SELECT edited_at, deleted_at FROM idea_comments LIMIT 1`;
    await sql`SELECT 1 FROM idea_comment_reactions LIMIT 1`;
    // Volle Chat-Funktionen im Aufgaben-Verlauf (wie im Chat/bei den Ideen):
    // Anhänge + Bearbeitet/Gelöscht + Reaktionen + Lesestand mitprüfen.
    await sql`SELECT attach_type, edited_at, deleted_at FROM task_comments LIMIT 1`;
    await sql`SELECT 1 FROM task_comment_reactions LIMIT 1`;
    await sql`SELECT 1 FROM task_reads LIMIT 1`;
    // Benannte Links („Link-Tasten") mitprüfen.
    await sql`SELECT links FROM tasks LIMIT 1`;
    ensured = true;
    return;
  } catch {
    /* etwas fehlt -> unten anlegen */
  }
  ensured = true;

  // --- KRITISCH zuerst: Nutzer-Spalten (Login/Team/Chat hängen daran) -------
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'`);
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`);
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'online'`);
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs JSONB NOT NULL DEFAULT '{}'`);

  // --- Tabellen ----------------------------------------------------------
  await run(sql`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'mittel', status TEXT NOT NULL DEFAULT 'offen',
    category TEXT NOT NULL DEFAULT '', images JSONB NOT NULL DEFAULT '[]',
    created_by TEXT NOT NULL, created_by_name TEXT NOT NULL DEFAULT '',
    assigned_to TEXT, assigned_to_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE TABLE IF NOT EXISTS ticket_comments (
    id TEXT PRIMARY KEY, ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
    images JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE TABLE IF NOT EXISTS tasks (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '',
    due_date DATE, iso_week TEXT, status TEXT NOT NULL DEFAULT 'offen', priority TEXT NOT NULL DEFAULT 'mittel',
    created_by TEXT NOT NULL, created_by_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'mittel'`);
  // Google-Kalender-Stil: Enddatum (Mehrtages-Balken) + Uhrzeiten (Tagesansicht).
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_date DATE`);
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_time TEXT`);
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS end_time TEXT`);
  // Termin/Aufgabe/beides.
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'termin'`);
  await run(sql`CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '', PRIMARY KEY (task_id, user_id))`);
  await run(sql`CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  // Voller Chat im Aufgaben-Verlauf (wie im Chat/bei den Ideen): Medien-Anhänge
  // (Bild/Video/Datei = 'file', 'audio'), Bearbeiten (edited_at), Für-alle-löschen
  // (deleted_at) und Emoji-Reaktionen (eine pro Nutzer & Beitrag, Tippen togglet).
  await run(sql`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS attach_type TEXT`);
  await run(sql`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS attach_url TEXT`);
  await run(sql`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS attach_mime TEXT`);
  await run(sql`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS attach_title TEXT`);
  await run(sql`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
  await run(sql`ALTER TABLE task_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await run(sql`CREATE TABLE IF NOT EXISTS task_comment_reactions (
    comment_id TEXT NOT NULL REFERENCES task_comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (comment_id, user_id))`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_task_comment_reactions_c ON task_comment_reactions(comment_id)`);
  // Lesestand je Aufgabe & Nutzer (für den „ungelesen"-Zähler im Aufgaben-Tab,
  // wie bei Chat/Ideen). Fehlt eine Zeile, gilt der Erstellzeitpunkt als Basis.
  await run(sql`CREATE TABLE IF NOT EXISTS task_reads (
    user_id TEXT NOT NULL, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, task_id))`);
  await run(sql`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    is_read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);
  await run(sql`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL, title TEXT NOT NULL DEFAULT '', avatar_url TEXT NOT NULL DEFAULT '', dm_key TEXT,
    created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`);
  await run(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_conversations_dm ON conversations(dm_key) WHERE dm_key IS NOT NULL`);
  await run(sql`CREATE TABLE IF NOT EXISTS conversation_members (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '',
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (conversation_id, user_id))`);
  await run(sql`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    attach_type TEXT, attach_id TEXT, attach_title TEXT, attach_url TEXT, attach_mime TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attach_url TEXT`);
  await run(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attach_mime TEXT`);
  // WhatsApp-Funktionen: Bearbeiten (edited_at) + Löschen für alle (deleted_at).
  await run(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
  await run(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`);
  // Emoji-Reaktionen: eine Reaktion pro Nutzer & Nachricht (Tippen ersetzt/togglet).
  await run(sql`CREATE TABLE IF NOT EXISTS message_reactions (
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (message_id, user_id))`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_message_reactions_msg ON message_reactions(message_id)`);
  // Thread-Lesestand: pro Nutzer & Thread (Eltern-Nachricht) der letzte Blick.
  await run(sql`CREATE TABLE IF NOT EXISTS thread_reads (
    user_id TEXT NOT NULL, parent_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (user_id, parent_id))`);
  // Abstimmungen (Umfragen wie bei WhatsApp): eine Nachricht mit
  // attach_type='poll' trägt die Abstimmung; Frage/Einstellungen in polls,
  // Antwortmöglichkeiten in poll_options, Stimmen in poll_votes. Optional kann
  // ein Ticket/Aufgabe/Termin verlinkt sein (ref_type/ref_id/ref_title).
  await run(sql`CREATE TABLE IF NOT EXISTS polls (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    question TEXT NOT NULL,
    multiple BOOLEAN NOT NULL DEFAULT false,
    anonymous BOOLEAN NOT NULL DEFAULT false,
    ref_type TEXT, ref_id TEXT, ref_title TEXT,
    created_by TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_polls_message ON polls(message_id)`);
  await run(sql`CREATE TABLE IF NOT EXISTS poll_options (
    id TEXT PRIMARY KEY,
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    text TEXT NOT NULL, position INT NOT NULL DEFAULT 0)`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_poll_options_poll ON poll_options(poll_id)`);
  await run(sql`CREATE TABLE IF NOT EXISTS poll_votes (
    poll_id TEXT NOT NULL REFERENCES polls(id) ON DELETE CASCADE,
    option_id TEXT NOT NULL REFERENCES poll_options(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (option_id, user_id))`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_poll_votes_poll ON poll_votes(poll_id)`);

  await run(sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`);
  // Chat-Präsenz (echter Online-Status + „tippt gerade"). Ephemer.
  await run(sql`CREATE TABLE IF NOT EXISTS chat_presence (
    user_id TEXT PRIMARY KEY, last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
    typing_conv TEXT, typing_at TIMESTAMPTZ, typing_name TEXT)`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_chat_presence_seen ON chat_presence(last_seen)`);

  // --- Ideen (Brainstorm) -------------------------------------------------
  await run(sql`CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'offen',
    created_by TEXT NOT NULL, created_by_name TEXT NOT NULL DEFAULT '',
    linked_task_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE TABLE IF NOT EXISTS idea_members (
    idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '',
    last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (idea_id, user_id))`);
  await run(sql`CREATE TABLE IF NOT EXISTS idea_comments (
    id TEXT PRIMARY KEY, idea_id TEXT NOT NULL REFERENCES ideas(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_idea_comments_idea ON idea_comments(idea_id, created_at)`);
  // Chat-artiger Brainstorm: Medien-Anhänge (Bild/Video/Datei = 'file', 'audio').
  await run(sql`ALTER TABLE idea_comments ADD COLUMN IF NOT EXISTS attach_type TEXT`);
  await run(sql`ALTER TABLE idea_comments ADD COLUMN IF NOT EXISTS attach_url TEXT`);
  await run(sql`ALTER TABLE idea_comments ADD COLUMN IF NOT EXISTS attach_mime TEXT`);
  await run(sql`ALTER TABLE idea_comments ADD COLUMN IF NOT EXISTS attach_title TEXT`);
  // Volle Chat-Funktionen im Brainstorm: Bearbeiten (edited_at) + Für-alle-löschen
  // (deleted_at) + Emoji-Reaktionen (eine pro Nutzer & Beitrag, Tippen togglet).
  await run(sql`ALTER TABLE idea_comments ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ`);
  await run(sql`ALTER TABLE idea_comments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
  await run(sql`CREATE TABLE IF NOT EXISTS idea_comment_reactions (
    comment_id TEXT NOT NULL REFERENCES idea_comments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (comment_id, user_id))`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_idea_comment_reactions_c ON idea_comment_reactions(comment_id)`);

  // --- Benannte Links („Link-Tasten") auf Aufgaben/Terminen, Tickets, Ideen --
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'`);
  await run(sql`ALTER TABLE tickets ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'`);
  await run(sql`ALTER TABLE ideas ADD COLUMN IF NOT EXISTS links JSONB NOT NULL DEFAULT '[]'`);

  // --- Constraints ganz zuletzt (unkritisch; nur für Rollen-/Anhang-Checks) -
  await run(sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await run(sql`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin','match_admin','referee','ticket_manager','team_member'))`);
  await run(sql`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_attach_type_check`);
  await run(sql`ALTER TABLE messages ADD CONSTRAINT messages_attach_type_check CHECK (attach_type IN ('ticket','task','file','audio','poll'))`);
}
