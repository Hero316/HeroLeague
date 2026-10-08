import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requirePermission } from './_lib/auth.js';
import { badRequest, isNonEmptyString } from './_lib/validate.js';
import { DEFAULT_PLAYER_OF_MONTH } from './_lib/seed.js';

// Leerer Spieler des Monats – wird bewusst gespeichert, wenn die Auszeichnung
// entfernt wird, damit das GET nicht auf die Demo-Vorgabe zurückfällt.
const EMPTY_PLAYER_OF_MONTH = { name: '', club: '', teamId: '', goals: 0, assists: 0, image: '', matchday: 0, sponsorId: '', keeper: null };

// Torwart des Spieltages säubern (leer/ohne Namen = keine zweite Auszeichnung).
function cleanKeeper(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = str(o.name, 80);
  if (!name) return null;
  return { name, club: str(o.club, 80), teamId: str(o.teamId, 80), image: typeof o.image === 'string' ? o.image.trim() : '' };
}

const savePom = requirePermission('awards')(async (req: VercelRequest, res: VercelResponse) => {
  const { name, club, teamId, goals, assists, image, matchday, sponsorId, keeper } = req.body ?? {};
  if (!isNonEmptyString(name)) return badRequest(res, 'Bitte einen Spieler-Namen angeben.');

  const pom = {
    name: name.trim(),
    club: typeof club === 'string' ? club.trim() : '',
    teamId: typeof teamId === 'string' ? teamId : '',
    goals: Number.isFinite(Number(goals)) ? Math.max(0, Math.floor(Number(goals))) : 0,
    assists: Number.isFinite(Number(assists)) ? Math.max(0, Math.floor(Number(assists))) : 0,
    image: typeof image === 'string' ? image : '',
    // Spieltag-Nummer für „Spieler des Spieltages N" (0 = ohne Nummer anzeigen)
    matchday: Number.isFinite(Number(matchday)) ? Math.max(0, Math.floor(Number(matchday))) : 0,
    // Partner-ID des Sponsors dieser Auszeichnung (leer = kein Sponsor)
    sponsorId: typeof sponsorId === 'string' ? sponsorId : '',
    keeper: cleanKeeper(keeper),
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('playerOfMonth', ${JSON.stringify(pom)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(pom);
});

// Auszeichnung entfernen: leeren Datensatz speichern -> Karte verschwindet von der Startseite.
const clearPom = requirePermission('awards')(async (_req: VercelRequest, res: VercelResponse) => {
  await sql`
    INSERT INTO settings (key, value) VALUES ('playerOfMonth', ${JSON.stringify(EMPTY_PLAYER_OF_MONTH)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json(EMPTY_PLAYER_OF_MONTH);
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const rows = await sql`SELECT value FROM settings WHERE key = 'playerOfMonth'`;
      return res.json(rows[0]?.value ?? DEFAULT_PLAYER_OF_MONTH);
    }
    if (req.method === 'POST') {
      return savePom(req, res);
    }
    if (req.method === 'DELETE') {
      return clearPom(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/player-of-the-month:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
