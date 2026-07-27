import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requireAdmin } from './_lib/auth.js';

const DEFAULT_TWITCH = { channel: '', isLive: false };
const DEFAULT_SOCIAL = { instagram: '', tiktok: '', youtube: '' };

// Kanalnamen aus einer evtl. eingefügten URL extrahieren
function normalizeChannel(input: unknown): string {
  if (typeof input !== 'string') return '';
  return input
    .trim()
    .replace(/^https?:\/\/(www\.)?twitch\.tv\//i, '')
    .replace(/[/?#].*$/, '')
    .trim();
}

// Social-Eingabe zu einer aufrufbaren URL normalisieren: leere Felder bleiben
// leer, bei fehlendem Schema wird https:// vorangestellt.
function normalizeUrl(input: unknown): string {
  if (typeof input !== 'string') return '';
  const t = input.trim();
  if (!t) return '';
  if (/^https?:\/\//i.test(t)) return t;
  return `https://${t}`;
}

const saveTwitch = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { channel, isLive } = req.body ?? {};
  const cfg = {
    channel: normalizeChannel(channel),
    isLive: Boolean(isLive),
  };

  await sql`
    INSERT INTO settings (key, value) VALUES ('twitch', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;

  return res.json(cfg);
});

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

// Ein Endpunkt für beide Website-Einstellungen (Twitch + Social Media), um
// unter dem Serverless-Funktionslimit zu bleiben. Social wird über
// ?resource=social angesprochen, Twitch ist die Vorgabe.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const isSocial = req.query.resource === 'social';

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (isSocial) {
        const rows = await sql`SELECT value FROM settings WHERE key = 'social'`;
        return res.json(rows[0]?.value ?? DEFAULT_SOCIAL);
      }
      const rows = await sql`SELECT value FROM settings WHERE key = 'twitch'`;
      return res.json(rows[0]?.value ?? DEFAULT_TWITCH);
    }
    if (req.method === 'POST') {
      return isSocial ? saveSocial(req, res) : saveTwitch(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/twitch:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
