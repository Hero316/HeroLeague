-- ===========================================================================
-- Hero League – Phase: Web-Push (Handy-Benachrichtigungen) + Einstellungen.
-- Einmalig im Neon SQL-Editor ausführen. Additiv & gefahrlos wiederholbar.
-- ===========================================================================

-- Ein Push-Abo je Gerät/Browser eines Nutzers (endpoint ist eindeutig).
CREATE TABLE IF NOT EXISTS push_subscriptions (
  endpoint   TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- Benachrichtigungs-Einstellungen je Nutzer, z.B.
-- { "muteWeekends": true, "muteUntil": "2026-08-20" }.
ALTER TABLE users ADD COLUMN IF NOT EXISTS notify_prefs JSONB NOT NULL DEFAULT '{}';
