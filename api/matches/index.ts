import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCurrentSeason, getMatches, sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { badRequest, isDateString, isNonEmptyString, isTimeString } from '../_lib/validate.js';

const createMatch = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
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

  const season = await getCurrentSeason();
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

// Einmaliger Spielplan-Import (Admin): ersetzt den kompletten Spielplan der aktiven Saison
// atomar durch die übergebenen Begegnungen. Die Team-Zuordnung (Name -> Team-ID) passiert
// bereits im Frontend anhand der geladenen Teams; hier kommen fertige Team-IDs an.
// Als POST-Variante von /api/matches umgesetzt (hält das Vercel-12-Funktionen-Limit ein).
interface IncomingGame {
  importRef: string;
  matchday: number;
  date: string;
  time: string;
  field: number | null;
  slot: number | null;
  homeTeamId: string;
  awayTeamId: string;
}

const importSchedule = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { games, force } = req.body ?? {};

  if (!Array.isArray(games) || games.length === 0) return badRequest(res, 'Keine Spiele übergeben.');
  if (games.length > 1000) return badRequest(res, 'Zu viele Spiele auf einmal.');

  const refs = new Set<string>();
  const referencedTeamIds = new Set<string>();
  for (const g of games as IncomingGame[]) {
    if (!g || typeof g !== 'object') return badRequest(res, 'Ungültiger Spiel-Eintrag.');
    if (!isNonEmptyString(g.importRef)) return badRequest(res, 'Spiel ohne gültige Spiel-ID.');
    if (refs.has(g.importRef)) return badRequest(res, `Doppelte Spiel-ID: ${g.importRef}.`);
    refs.add(g.importRef);
    if (!Number.isInteger(g.matchday) || g.matchday < 1 || g.matchday > 99) {
      return badRequest(res, `Ungültiger Spieltag bei ${g.importRef}.`);
    }
    if (!isDateString(g.date)) return badRequest(res, `Ungültiges Datum bei ${g.importRef}.`);
    if (!isTimeString(g.time)) return badRequest(res, `Ungültige Uhrzeit bei ${g.importRef}.`);
    if (!isNonEmptyString(g.homeTeamId) || !isNonEmptyString(g.awayTeamId)) {
      return badRequest(res, `Heim-/Auswärtsteam fehlt bei ${g.importRef}.`);
    }
    if (g.homeTeamId === g.awayTeamId) return badRequest(res, `Team spielt gegen sich selbst bei ${g.importRef}.`);
    if (g.field != null && (!Number.isInteger(g.field) || g.field < 1 || g.field > 9)) {
      return badRequest(res, `Ungültiges Feld bei ${g.importRef}.`);
    }
    if (g.slot != null && (!Number.isInteger(g.slot) || g.slot < 1 || g.slot > 99)) {
      return badRequest(res, `Ungültiger Slot bei ${g.importRef}.`);
    }
    referencedTeamIds.add(g.homeTeamId);
    referencedTeamIds.add(g.awayTeamId);
  }

  const season = await getCurrentSeason();
  if (!season) return res.status(500).json({ error: 'Keine aktive Saison vorhanden.' });

  // Alle referenzierten Teams müssen in der DB existieren.
  const teamRows = (await sql`SELECT id FROM teams`) as { id: string }[];
  const existingTeamIds = new Set(teamRows.map((r) => r.id));
  const missing = [...referencedTeamIds].filter((id) => !existingTeamIds.has(id));
  if (missing.length > 0) {
    return badRequest(res, `Unbekannte Team-IDs: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? ' …' : ''}.`);
  }

  // Schutz vor Datenverlust: bereits eingetragene Ergebnisse nur mit force überschreiben.
  const resultRows = (await sql`
    SELECT count(*)::int AS n FROM matches
    WHERE season_id = ${season.id} AND (home_score IS NOT NULL OR away_score IS NOT NULL OR status = 'beendet')
  `) as { n: number }[];
  const resultsCount = resultRows[0]?.n ?? 0;
  if (resultsCount > 0 && force !== true) {
    return res.status(409).json({
      error: `Es sind bereits ${resultsCount} Spiele mit Ergebnis eingetragen – der Import würde sie löschen.`,
      resultsCount,
    });
  }

  // Bestehenden Spielort (gilt pro Abend) übernehmen, damit die Hallenangabe erhalten bleibt.
  const venueRows = (await sql`
    SELECT venue FROM matches WHERE season_id = ${season.id} AND venue IS NOT NULL AND venue <> '' LIMIT 1
  `) as { venue: string }[];
  const carriedVenue = venueRows[0]?.venue ?? null;

  const countRows = (await sql`SELECT count(*)::int AS n FROM matches WHERE season_id = ${season.id}`) as { n: number }[];
  const deletedCount = countRows[0]?.n ?? 0;

  // Kompletten Spielplan der Saison atomar ersetzen (löschen + neu einfügen).
  await sql.transaction((txn) => {
    const q: unknown[] = [txn`DELETE FROM matches WHERE season_id = ${season.id}`];
    for (const g of games as IncomingGame[]) {
      q.push(txn`
        INSERT INTO matches (id, season_id, matchday, home_team_id, away_team_id,
                             home_score, away_score, status, date, time, venue, field, slot, import_ref,
                             scorers, absentees, best_players, goalkeepers)
        VALUES (${`imp-${season.id}-${g.importRef}`}, ${season.id}, ${g.matchday}, ${g.homeTeamId}, ${g.awayTeamId},
                null, null, 'geplant', ${g.date}, ${g.time}, ${carriedVenue}, ${g.field}, ${g.slot}, ${g.importRef},
                '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb)
      `);
    }
    return q as never;
  });

  return res.json({ ok: true, deleted: deletedCount, inserted: games.length, season: season.id });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await getMatches());
    }
    if (req.method === 'POST') {
      // Import (ganzer Spielplan) vs. einzelnes Spiel anhand des Bodys unterscheiden.
      if (Array.isArray(req.body?.games)) return importSchedule(req, res);
      return createMatch(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/matches:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
