import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requirePermission, getSession, hasPermission } from './_lib/auth.js';
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

  // mode 'preview' = nur Super-Admins sehen die Auszeichnung (zum Testen, z. B.
  // solange die Stats nur als Vorschau live sind). Die öffentliche bleibt dabei
  // unverändert. Ohne mode (bzw. 'public') = für alle, eine Vorschau entfällt.
  const preview = req.body?.mode === 'preview';
  const key = preview ? 'playerOfMonthPreview' : 'playerOfMonth';
  await sql`
    INSERT INTO settings (key, value) VALUES (${key}, ${JSON.stringify(pom)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  if (!preview) await sql`DELETE FROM settings WHERE key = 'playerOfMonthPreview'`;

  return res.json({ ...pom, preview });
});

// Vorschau für alle veröffentlichen (Vorschau → öffentlich).
const publishPreview = requirePermission('awards')(async (_req: VercelRequest, res: VercelResponse) => {
  const rows = await sql`SELECT value FROM settings WHERE key = 'playerOfMonthPreview'`;
  const pom = rows[0]?.value;
  if (!pom) return badRequest(res, 'Es gibt keine Vorschau zum Veröffentlichen.');
  await sql`
    INSERT INTO settings (key, value) VALUES ('playerOfMonth', ${JSON.stringify(pom)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await sql`DELETE FROM settings WHERE key = 'playerOfMonthPreview'`;
  return res.json({ ...(pom as object), preview: false });
});

// Nur die Vorschau verwerfen (öffentliche Auszeichnung bleibt).
const discardPreview = requirePermission('awards')(async (_req: VercelRequest, res: VercelResponse) => {
  await sql`DELETE FROM settings WHERE key = 'playerOfMonthPreview'`;
  const rows = await sql`SELECT value FROM settings WHERE key = 'playerOfMonth'`;
  return res.json({ ...((rows[0]?.value as object) ?? EMPTY_PLAYER_OF_MONTH), preview: false });
});

// Auszeichnung entfernen: leeren Datensatz speichern -> Karte verschwindet von der Startseite.
const clearPom = requirePermission('awards')(async (_req: VercelRequest, res: VercelResponse) => {
  await sql`
    INSERT INTO settings (key, value) VALUES ('playerOfMonth', ${JSON.stringify(EMPTY_PLAYER_OF_MONTH)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  await sql`DELETE FROM settings WHERE key = 'playerOfMonthPreview'`;
  return res.json(EMPTY_PLAYER_OF_MONTH);
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const rows = await sql`SELECT value FROM settings WHERE key = 'playerOfMonth'`;
      const pub = rows[0]?.value ?? DEFAULT_PLAYER_OF_MONTH;
      // Vorschau: auf der Website nur für Super-Admins, im Backend (admin=1) für
      // alle mit dem Recht „Auszeichnungen".
      const session = await getSession(req);
      const mayPreview = req.query.admin === '1' ? hasPermission(session, 'awards') : session?.role === 'superadmin';
      if (mayPreview) {
        const pre = await sql`SELECT value FROM settings WHERE key = 'playerOfMonthPreview'`;
        if (pre[0]?.value) return res.json({ ...(pre[0].value as object), preview: true });
      }
      return res.json({ ...(pub as object), preview: false });
    }
    if (req.method === 'POST' && req.query.op === 'publish') return publishPreview(req, res);
    if (req.method === 'POST') {
      return savePom(req, res);
    }
    if (req.method === 'DELETE' && req.query.preview === '1') return discardPreview(req, res);
    if (req.method === 'DELETE') {
      return clearPom(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/player-of-the-month:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
