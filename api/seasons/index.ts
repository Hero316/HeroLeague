import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSeasons, sql } from '../_lib/db.js';
import { requireSuperadmin, requireAdmin } from '../_lib/auth.js';
import { badRequest, isNonEmptyString } from '../_lib/validate.js';
import { readDemo, activateDemo, deactivateDemo } from '../_lib/demo.js';
import { recordVisit, readVisitStats } from '../_lib/analytics.js';

// Besucher-Statistik lesen (nur eingeloggte Admins). Aus Function-Limit-Gründen
// mit auf die Saison-Funktion gelegt – Aufruf: GET /api/seasons?stats
const readStats = requireAdmin(async (_req: VercelRequest, res: VercelResponse) => {
  return res.json(await readVisitStats());
});

// Demo-Modus an-/ausschalten (in die Saison-Funktion integriert, um die
// Serverless-Function-Anzahl klein zu halten).
const handleDemo = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const action = (req.body ?? {}).action;
  if (action === 'demoActivate') return res.json(await activateDemo());
  if (action === 'demoDeactivate') return res.json(await deactivateDemo());
  return badRequest(res, 'Unbekannte Aktion.');
});

// Neue Saison starten: anlegen und als aktiv setzen.
// Vereine/Kader bleiben, alte Saisons samt Spielen bleiben erhalten.
const createSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { label } = req.body ?? {};
  if (!isNonEmptyString(label)) return badRequest(res, 'Bitte ein Saison-Label angeben (z.B. "2027/28").');

  const seasons = await getSeasons();
  const trimmed = label.trim();
  if (seasons.some((s) => s.label === trimmed)) {
    return badRequest(res, 'Eine Saison mit diesem Label existiert bereits.');
  }

  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let id = `saison-${slug || Date.now()}`;
  if (seasons.some((s) => s.id === id)) id = `${id}-${Date.now()}`;

  await sql.transaction((txn) => [
    txn`UPDATE seasons SET is_current = false WHERE is_current = true`,
    txn`INSERT INTO seasons (id, label, is_current) VALUES (${id}, ${trimmed}, true)`,
  ]);

  return res.json({ id, label: trimmed, isCurrent: true });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      if (req.query.demo !== undefined) return res.json(await readDemo());
      if (req.query.stats !== undefined) return readStats(req, res);
      return res.json(await getSeasons());
    }
    if (req.method === 'POST') {
      const action = (req.body ?? {}).action;
      // Öffentlicher Besucher-Heartbeat (kein Login nötig, kein Personenbezug)
      if (action === 'ping') {
        await recordVisit((req.body ?? {}).vid);
        return res.json({ ok: true });
      }
      if (action === 'demoActivate' || action === 'demoDeactivate') return handleDemo(req, res);
      return createSeason(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/seasons:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
