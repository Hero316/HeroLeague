import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from '../_lib/db.js';
import { requireMatchWrite, requireStaff } from '../_lib/auth.js';
import {
  badRequest,
  isAbsenteesArray,
  isBestPlayersArray,
  isGoalkeepersArray,
  isDateString,
  isNonEmptyString,
  isOptionalScore,
  isScorersArray,
  isStatus,
  isTimeString,
} from '../_lib/validate.js';

const updateMatch = requireMatchWrite(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  const { homeScore, awayScore, status, scorers, absentees, bestPlayers, goalkeepers, matchday, date, time, homeTeamId, awayTeamId, venue, durationMinutes, pausedAt } =
    req.body ?? {};

  if (homeScore !== undefined && !isOptionalScore(homeScore)) return badRequest(res, 'Ungültiges Heim-Ergebnis.');
  if (awayScore !== undefined && !isOptionalScore(awayScore)) return badRequest(res, 'Ungültiges Auswärts-Ergebnis.');
  if (status !== undefined && !isStatus(status)) return badRequest(res, 'Ungültiger Status.');
  if (scorers !== undefined && !isScorersArray(scorers)) return badRequest(res, 'Ungültiges Torschützen-Format.');
  if (absentees !== undefined && !isAbsenteesArray(absentees)) return badRequest(res, 'Ungültiges Abwesenheits-Format.');
  if (bestPlayers !== undefined && !isBestPlayersArray(bestPlayers)) return badRequest(res, 'Ungültiges Format für „Bester Spieler".');
  if (goalkeepers !== undefined && !isGoalkeepersArray(goalkeepers)) return badRequest(res, 'Ungültiges Torwart-Format.');
  if (matchday !== undefined && (!Number.isInteger(matchday) || matchday < 1 || matchday > 99)) {
    return badRequest(res, 'Ungültiger Spieltag (1–99).');
  }
  if (date !== undefined && !isDateString(date)) return badRequest(res, 'Ungültiges Datum (JJJJ-MM-TT).');
  if (time !== undefined && !isTimeString(time)) return badRequest(res, 'Ungültige Uhrzeit (HH:MM).');
  if (homeTeamId !== undefined && !isNonEmptyString(homeTeamId)) return badRequest(res, 'Ungültiges Heimteam.');
  if (awayTeamId !== undefined && !isNonEmptyString(awayTeamId)) return badRequest(res, 'Ungültiges Auswärtsteam.');
  if (venue !== undefined && venue !== null && typeof venue !== 'string') return badRequest(res, 'Ungültiger Spielort.');
  if (
    durationMinutes !== undefined &&
    durationMinutes !== null &&
    (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 120)
  ) {
    return badRequest(res, 'Ungültige Spieldauer (1–120 Minuten).');
  }
  if (pausedAt !== undefined && pausedAt !== null && (typeof pausedAt !== 'string' || Number.isNaN(Date.parse(pausedAt)))) {
    return badRequest(res, 'Ungültiger Pause-Zeitstempel.');
  }

  const rows = await sql`
    SELECT id, season_id AS "seasonId", matchday, home_team_id AS "homeTeamId",
           away_team_id AS "awayTeamId", home_score AS "homeScore", away_score AS "awayScore",
           status, date, time, venue, scorers, absentees, best_players AS "bestPlayers",
           goalkeepers, live_started_at AS "liveStartedAt", duration_minutes AS "durationMinutes",
           paused_at AS "pausedAt"
    FROM matches WHERE id = ${id}
  `;
  if (rows.length === 0) return res.status(404).json({ error: 'Spiel nicht gefunden.' });

  const match = rows[0];

  // Zielteams bestimmen (geänderte oder bestehende) und prüfen
  const nextHome = homeTeamId !== undefined ? homeTeamId : match.homeTeamId;
  const nextAway = awayTeamId !== undefined ? awayTeamId : match.awayTeamId;
  const teamsChanged = nextHome !== match.homeTeamId || nextAway !== match.awayTeamId;
  if (nextHome === nextAway) return badRequest(res, 'Ein Team kann nicht gegen sich selbst spielen.');
  if (teamsChanged) {
    const teamRows = await sql`SELECT id FROM teams WHERE id IN (${nextHome}, ${nextAway})`;
    if (teamRows.length !== 2) return badRequest(res, 'Mindestens ein Team existiert nicht.');
  }

  const validTeamIds = [nextHome, nextAway];
  if (scorers !== undefined) {
    if (!scorers.every((s: { teamId: string }) => validTeamIds.includes(s.teamId))) {
      return badRequest(res, 'Torschützen müssen zu einem der beiden Teams gehören.');
    }
    match.scorers = scorers;
  }
  if (absentees !== undefined) {
    if (!absentees.every((a: { teamId: string }) => validTeamIds.includes(a.teamId))) {
      return badRequest(res, 'Abwesende müssen zu einem der beiden Teams gehören.');
    }
    match.absentees = absentees;
  }
  if (bestPlayers !== undefined) {
    if (!bestPlayers.every((b: { teamId: string }) => validTeamIds.includes(b.teamId))) {
      return badRequest(res, 'Bester Spieler muss zu einem der beiden Teams gehören.');
    }
    if (
      bestPlayers.filter((b: { teamId: string }) => b.teamId === nextHome).length > 1 ||
      bestPlayers.filter((b: { teamId: string }) => b.teamId === nextAway).length > 1
    ) {
      return badRequest(res, 'Pro Team ist nur ein bester Spieler erlaubt.');
    }
    match.bestPlayers = bestPlayers;
  }
  if (goalkeepers !== undefined) {
    if (!goalkeepers.every((g: { teamId: string }) => validTeamIds.includes(g.teamId))) {
      return badRequest(res, 'Torwart muss zu einem der beiden Teams gehören.');
    }
    if (
      goalkeepers.filter((g: { teamId: string }) => g.teamId === nextHome).length > 1 ||
      goalkeepers.filter((g: { teamId: string }) => g.teamId === nextAway).length > 1
    ) {
      return badRequest(res, 'Pro Team ist nur ein Torwart erlaubt.');
    }
    match.goalkeepers = goalkeepers;
  }

  if (homeScore !== undefined) match.homeScore = homeScore;
  if (awayScore !== undefined) match.awayScore = awayScore;
  if (status !== undefined) {
    match.status = status;
    if (status === 'live') {
      if (!match.liveStartedAt) match.liveStartedAt = new Date().toISOString();
    } else {
      match.liveStartedAt = null;
      match.pausedAt = null; // ein beendetes/geplantes Spiel ist nie pausiert
    }
  }
  if (durationMinutes !== undefined) match.durationMinutes = durationMinutes;
  // Pausieren / Fortsetzen des Countdowns.
  if (pausedAt !== undefined) {
    if (pausedAt === null) {
      // Fortsetzen: Anpfiff-Zeitstempel um die Pausendauer nach hinten schieben,
      // damit der Countdown nahtlos weiterläuft.
      if (match.pausedAt && match.liveStartedAt) {
        const shift = Date.now() - new Date(match.pausedAt).getTime();
        match.liveStartedAt = new Date(new Date(match.liveStartedAt).getTime() + shift).toISOString();
      }
      match.pausedAt = null;
    } else {
      match.pausedAt = pausedAt;
    }
  }
  if (matchday !== undefined) match.matchday = matchday;
  if (date !== undefined) match.date = date;
  if (time !== undefined) match.time = time;
  if (venue !== undefined) match.venue = typeof venue === 'string' && venue.trim() ? venue.trim() : null;
  match.homeTeamId = nextHome;
  match.awayTeamId = nextAway;

  // Bei Team-Wechsel sind alte Torschützen/Abwesenheiten/beste Spieler/Torhüter nicht mehr gültig (falscher Team-Bezug)
  if (teamsChanged) {
    if (scorers === undefined) match.scorers = [];
    if (absentees === undefined) match.absentees = [];
    if (bestPlayers === undefined) match.bestPlayers = [];
    if (goalkeepers === undefined) match.goalkeepers = [];
  }

  await sql`
    UPDATE matches
    SET home_score = ${match.homeScore}, away_score = ${match.awayScore}, status = ${match.status},
        scorers = ${JSON.stringify(match.scorers ?? [])}::jsonb,
        absentees = ${JSON.stringify(match.absentees ?? [])}::jsonb,
        best_players = ${JSON.stringify(match.bestPlayers ?? [])}::jsonb,
        goalkeepers = ${JSON.stringify(match.goalkeepers ?? [])}::jsonb,
        live_started_at = ${match.liveStartedAt}, duration_minutes = ${match.durationMinutes ?? null},
        paused_at = ${match.pausedAt ?? null},
        matchday = ${match.matchday}, date = ${match.date}, time = ${match.time}, venue = ${match.venue ?? null},
        home_team_id = ${match.homeTeamId}, away_team_id = ${match.awayTeamId}
    WHERE id = ${id}
  `;

  // Der Spielort gilt für den ganzen Spieltag-Abend: auf alle übrigen Spiele
  // desselben Spieltags (in derselben Saison) übernehmen.
  if (venue !== undefined) {
    await sql`
      UPDATE matches SET venue = ${match.venue ?? null}
      WHERE season_id = ${match.seasonId} AND matchday = ${match.matchday} AND id <> ${id}
    `;
  }

  return res.json(match);
});

const deleteMatch = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
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
