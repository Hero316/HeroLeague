import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCurrentSeason, getMatches, sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { badRequest, isDateString, isNonEmptyString, isTimeString } from '../_lib/validate.js';

const createMatch = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { matchday, homeTeamId, awayTeamId, date, time } = req.body ?? {};

  if (typeof matchday !== 'number' || !Number.isInteger(matchday) || matchday < 1 || matchday > 99) {
    return badRequest(res, 'Ungültiger Spieltag (1–99).');
  }
  if (!isNonEmptyString(homeTeamId) || !isNonEmptyString(awayTeamId)) {
    return badRequest(res, 'Heim- und Auswärtsteam sind Pflichtfelder.');
  }
  if (homeTeamId === awayTeamId) {
    return badRequest(res, 'Ein Team kann nicht gegen sich selbst spielen.');
  }
  if (!isDateString(date)) return badRequest(res, 'Ungültiges Datum (JJJJ-MM-TT).');
  if (!isTimeString(time)) return badRequest(res, 'Ungültige Uhrzeit (HH:MM).');

  const teams = await sql`SELECT id FROM teams WHERE id IN (${homeTeamId}, ${awayTeamId})`;
  if (teams.length !== 2) return badRequest(res, 'Mindestens ein Team existiert nicht.');

  const season = await getCurrentSeason();
  if (!season) return res.status(500).json({ error: 'Keine aktive Saison vorhanden.' });

  const match = {
    id: `m-${Date.now()}`,
    seasonId: season.id,
    matchday,
    homeTeamId,
    awayTeamId,
    homeScore: null,
    awayScore: null,
    status: 'geplant' as const,
    date,
    time,
    scorers: [],
  };

  await sql`
    INSERT INTO matches (id, season_id, matchday, home_team_id, away_team_id, home_score, away_score, status, date, time, scorers)
    VALUES (${match.id}, ${match.seasonId}, ${match.matchday}, ${match.homeTeamId}, ${match.awayTeamId}, null, null, ${match.status}, ${match.date}, ${match.time}, '[]'::jsonb)
  `;

  return res.json(match);
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await getMatches());
    }
    if (req.method === 'POST') {
      return createMatch(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/matches:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
