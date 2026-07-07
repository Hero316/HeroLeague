import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getCurrentSeason, getMatches, getTeams } from './_lib/db';
import { calculatePlayers } from './_lib/league';

// Spielerstatistiken, abgeleitet aus den Spielen einer Saison (Default: aktive Saison)
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Nicht unterstützt' });
    res.setHeader('Cache-Control', 'no-store');

    const [teams, matches, currentSeason] = await Promise.all([getTeams(), getMatches(), getCurrentSeason()]);
    const seasonId = typeof req.query.season === 'string' && req.query.season ? req.query.season : currentSeason?.id;
    const seasonMatches = seasonId ? matches.filter((m) => m.seasonId === seasonId) : matches;

    return res.json(calculatePlayers(teams, seasonMatches));
  } catch (err) {
    console.error('Fehler in /api/players:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
