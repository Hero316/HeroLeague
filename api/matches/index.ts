import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCurrentSeason, getMatches, sql } from '../_lib/db.js';
import { requireStaff } from '../_lib/auth.js';
import { badRequest, isDateString, isNonEmptyString, isTimeString } from '../_lib/validate.js';

const createMatch = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const { matchday, homeTeamId, awayTeamId, date, time, venue } = req.body ?? {};

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
  if (venue !== undefined && typeof venue !== 'string') return badRequest(res, 'Ungültiger Spielort.');
  const venueValue = typeof venue === 'string' && venue.trim() ? venue.trim() : null;

  const teams = await sql`SELECT id FROM teams WHERE id IN (${homeTeamId}, ${awayTeamId})`;
  if (teams.length !== 2) return badRequest(res, 'Mindestens ein Team existiert nicht.');

  // Ziel-Saison: explizit übergeben (z.B. eine Entwurf-Saison beim Vorbereiten),
  // sonst die aktuelle/live Saison wie bisher.
  const bodySeasonId = (req.body ?? {}).seasonId;
  let season: { id: string } | null;
  if (isNonEmptyString(bodySeasonId)) {
    const rows = await sql`SELECT id FROM seasons WHERE id = ${bodySeasonId} LIMIT 1`;
    if (rows.length === 0) return badRequest(res, 'Ziel-Saison existiert nicht.');
    season = { id: rows[0].id as string };
  } else {
    season = await getCurrentSeason();
  }
  if (!season) return res.status(500).json({ error: 'Keine aktive Saison vorhanden.' });

  // Ort gilt pro Spieltag: ohne Eingabe den bereits am Spieltag hinterlegten Ort übernehmen
  let finalVenue = venueValue;
  if (!finalVenue) {
    const existing = await sql`
      SELECT venue FROM matches
      WHERE season_id = ${season.id} AND matchday = ${matchday} AND venue IS NOT NULL AND venue <> ''
      LIMIT 1
    `;
    finalVenue = (existing[0]?.venue as string) ?? null;
  }

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
    venue: finalVenue,
    scorers: [],
  };

  await sql`
    INSERT INTO matches (id, season_id, matchday, home_team_id, away_team_id, home_score, away_score, status, date, time, venue, scorers)
    VALUES (${match.id}, ${match.seasonId}, ${match.matchday}, ${match.homeTeamId}, ${match.awayTeamId}, null, null, ${match.status}, ${match.date}, ${match.time}, ${match.venue}, '[]'::jsonb)
  `;

  // Wurde ein Ort eingegeben, gilt er für den ganzen Spieltag → auf die übrigen Spiele übernehmen
  if (venueValue) {
    await sql`
      UPDATE matches SET venue = ${venueValue}
      WHERE season_id = ${season.id} AND matchday = ${matchday} AND id <> ${match.id}
    `;
  }

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
