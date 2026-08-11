-- ===========================================================================
-- Hero League – Phase: Rolle "team_member" (nur Team-Bereich) erlauben.
-- Einmalig im Neon SQL-Editor ausführen. Gefahrlos wiederholbar.
-- ===========================================================================
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('superadmin','match_admin','referee','ticket_manager','team_member'));
