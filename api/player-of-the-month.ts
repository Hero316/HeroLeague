import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db';
import { requireAdmin } from './_lib/auth';
import { badRequest, isNonEmptyString } from './_lib/validate';
import { DEFAULT_PLAYER_OF_MONTH } from './_lib/seed';

const savePom = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { name, club, goals, assists, image } = req.body ?? {};
  if (!isNonEmptyString(name)) return badRequest(res, 'Bitte einen Spieler-Namen angeben.');

  const pom = {
    name: name.trim(),
    club: typeof club === 'string' ? club.trim() : '',
    goals: Number.isFinite(Number(goals)) ? Math.max(0, Math.floor(Number(goals))) : 0,
    assists: Number.isFinite(Number(assists)) ? Math.max(0, Math.floor(Number(assists))) : 0,
    image: typeof image === 'string' ? image : '',
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('playerOfMonth', ${JSON.stringify(pom)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(pom);
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
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/player-of-the-month:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
