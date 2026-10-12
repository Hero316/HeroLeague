import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCurrentSeason, getMatches, getTeams, sql } from './_lib/db.js';
import { calculatePlayers } from './_lib/league.js';
import { rowPlayed } from './_lib/played.js';

// Einsätze, die laut (veröffentlichtem) Tracking NICHT gespielt wurden: „Spielt
// nicht" bzw. Feldspieler ohne eine einzige Aktion. Nur live geschaltete
// Spieltage/Spiele – ein laufendes Tracking verändert die Spiele-Zahl nicht.
async function notPlayedKeys(seasonId: string | undefined): Promise<Set<string>> {
  const out = new Set<string>();
  if (!seasonId) return out;
  try {
    const live = (await sql`SELECT value FROM settings WHERE key = 'tracking-live'`)[0]?.value as { days?: unknown } | undefined;
    const all = Array.isArray(live?.days) ? (live!.days as unknown[]).filter((d): d is string => typeof d === 'string') : [];
    const days = all.filter((d) => d.startsWith(`s:${seasonId}:`));
    const matchIds = all.filter((d) => d.startsWith('match:')).map((d) => d.slice('match:'.length));
    if (days.length === 0 && matchIds.length === 0) return out;
    const rows = (await sql`
      SELECT match_id AS "matchId", team_id AS "teamId", player_name AS "playerName", role, counts
      FROM match_player_stats
      WHERE day_key = ANY(${days}::text[])
         OR (match_id = ANY(${matchIds}::text[]) AND day_key LIKE ${'s:' + seasonId + ':%'})`) as {
      matchId: string;
      teamId: string;
      playerName: string;
      role: string;
      counts: unknown;
    }[];
    for (const r of rows) if (!rowPlayed(r.role, r.counts)) out.add(`${r.matchId}::${r.teamId}::${r.playerName}`);
  } catch {
    /* ohne Tracking-Daten zählt wie bisher die Anwesenheit */
  }
  return out;
}

// Spielerstatistiken, abgeleitet aus den Spielen einer Saison (Default: aktive Saison)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Nicht unterstützt' });
    res.setHeader('Cache-Control', 'no-store');

    const [teams, matches, currentSeason] = await Promise.all([getTeams(), getMatches(), getCurrentSeason()]);
    const seasonId = typeof req.query.season === 'string' && req.query.season ? req.query.season : currentSeason?.id;
    const seasonMatches = seasonId ? matches.filter((m) => m.seasonId === seasonId) : matches;

    return res.json(calculatePlayers(teams, seasonMatches, await notPlayedKeys(seasonId)));
  } catch (err) {
    console.error('Fehler in /api/players:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
