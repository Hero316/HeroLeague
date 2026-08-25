import { neon } from '@neondatabase/serverless';
import type { AppUser, AdminPermission, UserRole, UserStatus, Match, Player, Season, Team } from '../../src/types';

export const sql = neon(process.env.DATABASE_URL!);

// Selbstheilendes Liga-Schema: Entwurf-Saisons (seasons.draft) und
// Team↔Saison-Zugehörigkeit (teams.season_ids). Schneller Vorab-Check
// überspringt alles, wenn schon vorhanden. Der Backfill ordnet bestehende
// Teams ALLEN bisherigen (nicht-Entwurf) Saisons zu, damit sich an den
// heutigen Ansichten NICHTS ändert (Season 1 bleibt exakt wie vorher).
let leagueEnsured = false;
export async function ensureLeagueSchema(): Promise<void> {
  if (leagueEnsured) return;
  try {
    await sql`SELECT draft FROM seasons LIMIT 1`;
    await sql`SELECT season_ids FROM teams LIMIT 1`;
    leagueEnsured = true;
    return;
  } catch {
    /* Spalte fehlt -> unten anlegen */
  }
  leagueEnsured = true;
  try {
    await sql`ALTER TABLE seasons ADD COLUMN IF NOT EXISTS draft BOOLEAN NOT NULL DEFAULT false`;
    await sql`ALTER TABLE teams ADD COLUMN IF NOT EXISTS season_ids JSONB NOT NULL DEFAULT '[]'::jsonb`;
    await sql`UPDATE teams SET season_ids = (
      SELECT COALESCE(jsonb_agg(id), '[]'::jsonb) FROM seasons WHERE draft = false
    ) WHERE season_ids = '[]'::jsonb OR season_ids IS NULL`;
  } catch (err) {
    console.error('ensureLeagueSchema:', err);
  }
}

// Kader-Einträge können aus älteren Datenständen noch reine Strings sein
export function normalizeRoster(roster: unknown): Player[] {
  if (!Array.isArray(roster)) return [];
  return roster
    .map((entry) => {
      if (typeof entry === 'string') return { name: entry };
      if (entry && typeof entry === 'object' && typeof (entry as Player).name === 'string') {
        const p = entry as Player;
        const num = typeof p.number === 'number' && Number.isFinite(p.number) ? Math.trunc(p.number) : undefined;
        return {
          name: p.name,
          ...(p.imageUrl ? { imageUrl: p.imageUrl } : {}),
          ...(num !== undefined && num >= 0 ? { number: num } : {}),
          ...(p.captain === true ? { captain: true } : {}),
          ...(p.goalkeeper === true ? { goalkeeper: true } : {}),
        };
      }
      return null;
    })
    .filter((p): p is Player => p !== null && p.name.trim().length > 0);
}

export async function getTeams(): Promise<Team[]> {
  await ensureLeagueSchema();
  const rows = await sql`
    SELECT id, name, short_name AS "shortName", logo_color AS "logoColor",
           logo_icon AS "logoIcon", logo_url AS "logoUrl", spielerliste,
           season_ids AS "seasonIds"
    FROM teams ORDER BY name
  `;
  return rows.map((r) => ({
    ...r,
    spielerliste: normalizeRoster(r.spielerliste),
    seasonIds: Array.isArray(r.seasonIds) ? r.seasonIds.filter((x: unknown): x is string => typeof x === 'string') : [],
  })) as Team[];
}

export async function getMatches(): Promise<Match[]> {
  const rows = await sql`
    SELECT id, season_id AS "seasonId", matchday, home_team_id AS "homeTeamId",
           away_team_id AS "awayTeamId", home_score AS "homeScore", away_score AS "awayScore",
           status, date, time, venue, field, slot, import_ref AS "importRef",
           scorers, absentees, best_players AS "bestPlayers", goalkeepers,
           live_started_at AS "liveStartedAt", duration_minutes AS "durationMinutes",
           paused_at AS "pausedAt"
    FROM matches ORDER BY matchday, date, time, id
  `;
  return rows as Match[];
}

export async function getSeasons(): Promise<Season[]> {
  await ensureLeagueSchema();
  const rows = await sql`
    SELECT id, label, is_current AS "isCurrent", draft FROM seasons ORDER BY created_at
  `;
  return rows.map((r) => ({ ...r, draft: r.draft === true })) as Season[];
}

export async function getCurrentSeason(): Promise<Season | null> {
  const rows = await sql`
    SELECT id, label, is_current AS "isCurrent" FROM seasons WHERE is_current = true LIMIT 1
  `;
  return (rows[0] as Season) ?? null;
}

// Aus dem kompletten Zeilen-JSON einen AppUser bauen. Bewusst über to_jsonb,
// damit fehlende (noch nicht migrierte) Spalten wie avatar_url/status/
// permissions/notify_prefs NICHT die ganze Abfrage crashen – sie fallen einfach
// auf sinnvolle Standardwerte zurück. So funktioniert Login/Team/Chat auch,
// bevor die Migration durch ist.
function userFromJson(j: Record<string, unknown>): AppUser {
  // Alt-Rolle „ticket_manager" gibt es nicht mehr → wie Team-Mitglied behandeln.
  const raw = typeof j.role === 'string' ? j.role : '';
  const role: UserRole = raw === 'ticket_manager' ? 'team_member' : ((raw as UserRole) || 'match_admin');
  return {
    id: String(j.id),
    email: typeof j.email === 'string' ? j.email : '',
    name: typeof j.name === 'string' ? j.name : '',
    role,
    permissions: Array.isArray(j.permissions) ? (j.permissions as AdminPermission[]) : [],
    avatarUrl: typeof j.avatar_url === 'string' ? j.avatar_url : '',
    status: typeof j.status === 'string' ? (j.status as UserStatus) : 'online',
    isActive: j.is_active !== false,
  };
}

export async function getUsers(): Promise<AppUser[]> {
  const rows = await sql`SELECT to_jsonb(u) AS j FROM users u ORDER BY created_at`;
  return rows.map((r) => userFromJson((r as { j: Record<string, unknown> }).j));
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await sql`SELECT to_jsonb(u) AS j FROM users u WHERE email = ${email.trim().toLowerCase()} LIMIT 1`;
  return rows[0] ? userFromJson((rows[0] as { j: Record<string, unknown> }).j) : null;
}
