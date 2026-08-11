import { sql } from './db.js';

// Selbstheilendes Schema: legt die Tabellen/Spalten der Team-Zusammenarbeit
// (Tickets, Aufgaben, Chat, Profile, Push) bei Bedarf automatisch an. Damit
// funktioniert alles auch, wenn eine (Produktions-)Datenbank noch nicht per
// db/*.sql migriert wurde. Alles additiv (IF NOT EXISTS) und harmlos.
// Läuft nur einmal je Serverless-Instanz (Guard). Jeder Befehl ist einzeln
// fehlertolerant, damit ein Fehler (z.B. Constraint) den Rest nicht blockiert.

let ensured = false;

// Einen DDL-Befehl ausführen, Fehler nur loggen (nicht werfen).
async function run(p: Promise<unknown>): Promise<void> {
  try {
    await p;
  } catch (err) {
    console.error('ensureSchema-Befehl fehlgeschlagen:', err);
  }
}

export async function ensureSchema(): Promise<void> {
  if (ensured) return;
  ensured = true;

  // --- Tabellen zuerst (Reihenfolge wegen Fremdschlüsseln) -----------------
  await run(sql`CREATE TABLE IF NOT EXISTS tickets (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('niedrig','mittel','hoch','dringend')),
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('offen','in_bearbeitung','erledigt','abgelehnt')),
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
    due_date DATE, iso_week TEXT,
    status TEXT NOT NULL DEFAULT 'offen' CHECK (status IN ('leer','offen','in_bearbeitung','erledigt','abgebrochen')),
    priority TEXT NOT NULL DEFAULT 'mittel' CHECK (priority IN ('niedrig','mittel','hoch','dringend')),
    created_by TEXT NOT NULL, created_by_name TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`ALTER TABLE tasks ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'mittel'`);
  await run(sql`CREATE TABLE IF NOT EXISTS task_assignees (
    task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL, user_name TEXT NOT NULL DEFAULT '', PRIMARY KEY (task_id, user_id))`);
  await run(sql`CREATE TABLE IF NOT EXISTS task_comments (
    id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    author_id TEXT NOT NULL, author_name TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE TABLE IF NOT EXISTS notifications (
    id TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL,
    ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
    is_read BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read)`);
  await run(sql`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('group','dm')),
    title TEXT NOT NULL DEFAULT '', dm_key TEXT, created_by TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(), updated_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
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
  await run(sql`CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at)`);
  await run(sql`CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
  await run(sql`CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id)`);

  // --- Nachträgliche Spalten (bei älteren Tabellenständen) ------------------
  await run(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attach_url TEXT`);
  await run(sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS attach_mime TEXT`);
  await run(sql`ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_attach_type_check`);
  await run(sql`ALTER TABLE messages ADD CONSTRAINT messages_attach_type_check CHECK (attach_type IN ('ticket','task','file','audio'))`);

  // --- Nutzer-Spalten (Profile, Rechte, Benachrichtigungen) ----------------
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'`);
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT ''`);
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'online'`);
  await run(sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs JSONB NOT NULL DEFAULT '{}'`);
  await run(sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`);
  await run(sql`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('superadmin','match_admin','referee','ticket_manager','team_member'))`);
}
