import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db';
import { requireAdmin } from '../_lib/auth';
import { badRequest, isOptionalScore, isScorersArray, isStatus } from '../_lib/validate';

const updateMatch = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  const { homeScore, awayScore, status, scorers } = req.body ?? {};

  if (homeScore !== undefined && !isOptionalScore(homeScore)) return badRequest(res, 'Ungültiges Heim-Ergebnis.');
  if (awayScore !== undefined && !isOptionalScore(awayScore)) return badRequest(res, 'Ungültiges Auswärts-Ergebnis.');
  if (status !== undefined && !isStatus(status)) return badRequest(res, 'Ungültiger Status.');
  if (scorers !== undefined && !isScorersArray(scorers)) return badRequest(res, 'Ungültiges Torschützen-Format.');

  const rows = await sql`
    SELECT id, season_id AS "seasonId", matchday, home_team_id AS "homeTeamId",
           away_team_id AS "awayTeamId", home_score AS "homeScore", away_score AS "awayScore",
           status, date, time, scorers, live_started_at AS "liveStartedAt"
    FROM matches WHERE id = ${id}
  `;
  if (rows.length === 0) return res.status(404).json({ error: 'Spiel nicht gefunden.' });

  const match = rows[0];

  if (scorers !== undefined) {
    const validTeamIds = [match.homeTeamId, match.awayTeamId];
    if (!scorers.every((s: { teamId: string }) => validTeamIds.includes(s.teamId))) {
      return badRequest(res, 'Torschützen müssen zu einem der beiden Teams gehören.');
    }
    match.scorers = scorers;
  }
  if (homeScore !== undefined) match.homeScore = homeScore;
  if (awayScore !== undefined) match.awayScore = awayScore;
  if (status !== undefined) {
    match.status = status;
    if (status === 'live') {
      if (!match.liveStartedAt) match.liveStartedAt = new Date().toISOString();
    } else {
      match.liveStartedAt = null;
    }
  }

  await sql`
    UPDATE matches
    SET home_score = ${match.homeScore}, away_score = ${match.awayScore}, status = ${match.status},
        scorers = ${JSON.stringify(match.scorers ?? [])}::jsonb, live_started_at = ${match.liveStartedAt}
    WHERE id = ${id}
  `;

  return res.json(match);
});

const deleteMatch = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  const rows = await sql`DELETE FROM matches WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) return res.status(404).json({ error: 'Spiel nicht gefunden.' });
  return res.json({ ok: true });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'PUT') return updateMatch(req, res);
    if (req.method === 'DELETE') return deleteMatch(req, res);
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/matches/[id]:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
