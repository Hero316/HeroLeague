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

// Neue Saison anlegen.
//  • draft=true  → Entwurf-Saison: NICHT aktiv, öffentlich unsichtbar. Zum
//    Vorbereiten (Teams/Kader/Spielplan), bis sie veröffentlicht wird.
//  • draft=false → wie bisher: anlegen UND sofort als aktiv/live setzen.
// Vereine/Kader bleiben, alte Saisons samt Spielen bleiben erhalten.
const createSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { label, draft } = req.body ?? {};
  if (!isNonEmptyString(label)) return badRequest(res, 'Bitte einen Saison-Namen angeben (z.B. "SEASON TWO").');

  const seasons = await getSeasons();
  const trimmed = label.trim();
  if (seasons.some((s) => s.label === trimmed)) {
    return badRequest(res, 'Eine Saison mit diesem Label existiert bereits.');
  }

  const slug = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let id = `saison-${slug || Date.now()}`;
  if (seasons.some((s) => s.id === id)) id = `${id}-${Date.now()}`;

  if (draft === true) {
    await sql`INSERT INTO seasons (id, label, is_current, draft) VALUES (${id}, ${trimmed}, false, true)`;
    return res.json({ id, label: trimmed, isCurrent: false, draft: true });
  }

  await sql.transaction((txn) => [
    txn`UPDATE seasons SET is_current = false WHERE is_current = true`,
    txn`INSERT INTO seasons (id, label, is_current, draft) VALUES (${id}, ${trimmed}, true, false)`,
  ]);

  return res.json({ id, label: trimmed, isCurrent: true, draft: false });
});

// Entwurf-Saison veröffentlichen: draft=false. Standardmäßig wird sie zugleich
// die aktive/live Saison (makeCurrent!==false) – so gehst du mit Season 2 live.
const publishSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { id, makeCurrent } = req.body ?? {};
  if (!isNonEmptyString(id)) return badRequest(res, 'Saison-ID fehlt.');
  const seasons = await getSeasons();
  const s = seasons.find((x) => x.id === id);
  if (!s) return badRequest(res, 'Saison nicht gefunden.');
  if (makeCurrent === false) {
    await sql`UPDATE seasons SET draft = false WHERE id = ${id}`;
    return res.json({ id, label: s.label, isCurrent: s.isCurrent, draft: false });
  }
  await sql.transaction((txn) => [
    txn`UPDATE seasons SET is_current = false WHERE is_current = true`,
    txn`UPDATE seasons SET draft = false, is_current = true WHERE id = ${id}`,
  ]);
  return res.json({ id, label: s.label, isCurrent: true, draft: false });
});

// Aktive/live Saison umschalten (nur veröffentlichte Saisons).
const setCurrentSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { id } = req.body ?? {};
  if (!isNonEmptyString(id)) return badRequest(res, 'Saison-ID fehlt.');
  const seasons = await getSeasons();
  const s = seasons.find((x) => x.id === id);
  if (!s) return badRequest(res, 'Saison nicht gefunden.');
  if (s.draft) return badRequest(res, 'Eine Entwurf-Saison kann nicht live geschaltet werden. Erst veröffentlichen.');
  await sql.transaction((txn) => [
    txn`UPDATE seasons SET is_current = false WHERE is_current = true`,
    txn`UPDATE seasons SET is_current = true WHERE id = ${id}`,
  ]);
  return res.json({ id, label: s.label, isCurrent: true, draft: false });
});

// Entwurf-Saison löschen (nur solange sie Entwurf ist). Entfernt die Saison aus
// allen Team-Zugehörigkeiten; ihre Spiele kaskadieren per FK.
const deleteDraftSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { id } = req.body ?? {};
  if (!isNonEmptyString(id)) return badRequest(res, 'Saison-ID fehlt.');
  const seasons = await getSeasons();
  const s = seasons.find((x) => x.id === id);
  if (!s) return badRequest(res, 'Saison nicht gefunden.');
  if (!s.draft) return badRequest(res, 'Nur Entwurf-Saisons können gelöscht werden.');
  await sql`UPDATE teams SET season_ids = COALESCE(season_ids, '[]'::jsonb) - ${id}`;
  await sql`DELETE FROM seasons WHERE id = ${id}`;
  return res.json({ ok: true });
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
      if (action === 'publishSeason') return publishSeason(req, res);
      if (action === 'setCurrentSeason') return setCurrentSeason(req, res);
      if (action === 'deleteDraftSeason') return deleteDraftSeason(req, res);
      return createSeason(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/seasons:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
