import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';

const DEFAULT_SOCIAL = { instagram: '', tiktok: '', youtube: '' };

// Eingabe zu einer aufrufbaren URL normalisieren: leere Felder bleiben leer,
// bei fehlendem Schema wird https:// vorangestellt, damit das Symbol direkt
// zum Kanal verlinkt.
function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const saveSocial = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { instagram, tiktok, youtube } = req.body ?? {};
  const cfg = {
    instagram: normalizeUrl(instagram),
    tiktok: normalizeUrl(tiktok),
    youtube: normalizeUrl(youtube),
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('social', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const rows = await sql`SELECT value FROM settings WHERE key = 'social'`;
      return res.json(rows[0]?.value ?? DEFAULT_SOCIAL);
    }
    if (req.method === 'POST') {
      return saveSocial(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/social:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
