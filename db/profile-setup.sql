-- ===========================================================================
-- Hero League – Phase: Profile (Avatar + Status). Einmalig im Neon SQL-Editor
-- ausführen. Additiv & gefahrlos wiederholbar.
-- avatar_url: öffentliche Blob-URL des Profilbilds (leer = Initialen).
-- status: Präsenz (online | away | busy | vacation | out).
-- ===========================================================================
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'online';
