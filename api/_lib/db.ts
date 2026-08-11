import { neon } from '@neondatabase/serverless';
import type { AppUser, Match, Player, Season, Team } from '../../src/types';

export const sql = neon(process.env.DATABASE_URL!);

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
  const rows = await sql`
    SELECT id, name, short_name AS "shortName", logo_color AS "logoColor",
           logo_icon AS "logoIcon", logo_url AS "logoUrl", spielerliste
    FROM teams ORDER BY name
  `;
  return rows.map((r) => ({ ...r, spielerliste: normalizeRoster(r.spielerliste) })) as Team[];
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
  const rows = await sql`
    SELECT id, label, is_current AS "isCurrent" FROM seasons ORDER BY created_at
  `;
  return rows as Season[];
}

export async function getCurrentSeason(): Promise<Season | null> {
  const rows = await sql`
    SELECT id, label, is_current AS "isCurrent" FROM seasons WHERE is_current = true LIMIT 1
  `;
  return (rows[0] as Season) ?? null;
}

const USER_COLS = `id, email, name, role, COALESCE(permissions, '[]'::jsonb) AS permissions,
  COALESCE(avatar_url, '') AS "avatarUrl", COALESCE(status, 'online') AS status, is_active AS "isActive"`;

function mapUser(r: Record<string, unknown>): AppUser {
  return { ...r, permissions: Array.isArray(r.permissions) ? r.permissions : [] } as AppUser;
}

export async function getUsers(): Promise<AppUser[]> {
  const rows = await sql.query(`SELECT ${USER_COLS} FROM users ORDER BY created_at`);
  return (rows as Record<string, unknown>[]).map(mapUser);
}

export async function getUserByEmail(email: string): Promise<AppUser | null> {
  const rows = await sql.query(`SELECT ${USER_COLS} FROM users WHERE email = $1 LIMIT 1`, [email.trim().toLowerCase()]);
  const list = rows as Record<string, unknown>[];
  return list[0] ? mapUser(list[0]) : null;
}
