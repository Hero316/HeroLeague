import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTeams, getCurrentSeason, sql } from '../_lib/db.js';
import { requireSuperadmin } from '../_lib/auth.js';
import { badRequest, isNonEmptyString, isRoster } from '../_lib/validate.js';

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const createTeam = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { name, shortName, logoColor, logoIcon, logoUrl, spielerliste, seasonIds } = req.body ?? {};

  if (!isNonEmptyString(name) || !isNonEmptyString(shortName)) {
    return badRequest(res, 'Name und Kürzel sind Pflichtfelder.');
  }
  if (spielerliste !== undefined && !isRoster(spielerliste)) {
    return badRequest(res, 'Ungültiges Kader-Format.');
  }

  const existing = await getTeams();

  // Saison-Zugehörigkeit: explizit übergeben, sonst die aktuelle Saison.
  let memberSeasonIds: string[];
  if (Array.isArray(seasonIds)) {
    memberSeasonIds = seasonIds.filter((x): x is string => typeof x === 'string');
  } else {
    const cur = await getCurrentSeason();
    memberSeasonIds = cur ? [cur.id] : [];
  }

  // Kürzel-Eindeutigkeit gilt PRO SAISON, nicht global: derselbe Verein darf in
  // mehreren Saisons als eigene Kopie existieren (z.B. „FOC" in Season 1 UND 2).
  // Ein leeres seasonIds gilt als „alle Saisons" und kollidiert daher mit allem.
  const wanted = new Set(memberSeasonIds);
  const shortUp = shortName.trim().toUpperCase();
  const clash = existing.some((t) => {
    if (t.shortName.toUpperCase() !== shortUp) return false;
    const ts = Array.isArray(t.seasonIds) ? t.seasonIds : [];
    if (ts.length === 0 || wanted.size === 0) return true; // leere Menge = alle Saisons
    return ts.some((x) => wanted.has(x));
  });
  if (clash) {
    return badRequest(res, 'In dieser Saison gibt es bereits einen Club mit diesem Kürzel.');
  }

  let id = slugify(name) || `team-${Date.now()}`;
  if (existing.some((t) => t.id === id)) {
    id = `${id}-${Date.now()}`;
  }

  const team = {
    id,
    name: name.trim(),
    shortName: shortName.trim().toUpperCase(),
    logoColor: isNonEmptyString(logoColor) ? logoColor : '#3B82F6',
    logoIcon: isNonEmptyString(logoIcon) ? logoIcon : '⚽',
    logoUrl: typeof logoUrl === 'string' ? logoUrl : '',
    spielerliste: spielerliste ?? [],
    seasonIds: memberSeasonIds,
  };

  await sql`
    INSERT INTO teams (id, name, short_name, logo_color, logo_icon, logo_url, spielerliste, season_ids)
    VALUES (${team.id}, ${team.name}, ${team.shortName}, ${team.logoColor}, ${team.logoIcon}, ${team.logoUrl}, ${JSON.stringify(team.spielerliste)}::jsonb, ${JSON.stringify(team.seasonIds)}::jsonb)
  `;

  return res.json(team);
});

// Team einer Saison zuordnen bzw. daraus entfernen (Saison-Zugehörigkeit). So
// „übernimmt" man Season-1-Teams in Season 2 (add) oder nimmt sie wieder raus.
async function setMembership(teamId: string, seasonId: string, add: boolean, res: VercelResponse) {
  const rows = await sql`SELECT season_ids AS "seasonIds" FROM teams WHERE id = ${teamId}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Team nicht gefunden.' });
  const cur = Array.isArray(rows[0].seasonIds) ? rows[0].seasonIds.filter((x: unknown): x is string => typeof x === 'string') : [];
  const next = add ? Array.from(new Set([...cur, seasonId])) : cur.filter((x: string) => x !== seasonId);
  await sql`UPDATE teams SET season_ids = ${JSON.stringify(next)}::jsonb WHERE id = ${teamId}`;
  return res.json({ ok: true, seasonIds: next });
}

const addToSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { teamId, seasonId } = req.body ?? {};
  if (!isNonEmptyString(teamId) || !isNonEmptyString(seasonId)) return badRequest(res, 'teamId und seasonId sind Pflicht.');
  return setMembership(teamId, seasonId, true, res);
});

const removeFromSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { teamId, seasonId } = req.body ?? {};
  if (!isNonEmptyString(teamId) || !isNonEmptyString(seasonId)) return badRequest(res, 'teamId und seasonId sind Pflicht.');
  return setMembership(teamId, seasonId, false, res);
});

// Alle Vereine einer Quell-Saison als EIGENE KOPIEN in eine Ziel-Saison übernehmen.
// Jede Kopie ist ein neuer, unabhängiger Datensatz (eigener Kader/Logo) mit
// season_ids = [toSeasonId] – Änderungen an der Kopie berühren die Quelle NIE.
// Vereine, deren Kürzel in der Ziel-Saison schon existiert, werden übersprungen.
const copyToSeason = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { fromSeasonId, toSeasonId } = req.body ?? {};
  if (!isNonEmptyString(fromSeasonId) || !isNonEmptyString(toSeasonId)) {
    return badRequest(res, 'Quell- und Ziel-Saison sind nötig.');
  }
  if (fromSeasonId === toSeasonId) return badRequest(res, 'Quelle und Ziel müssen unterschiedlich sein.');

  const all = await getTeams();
  const inSeason = (t: { seasonIds?: string[] }, sid: string) => {
    const ts = Array.isArray(t.seasonIds) ? t.seasonIds : [];
    return ts.length === 0 || ts.includes(sid); // leer = alle Saisons
  };
  const source = all.filter((t) => inSeason(t, fromSeasonId));
  const targetShorts = new Set(all.filter((t) => inSeason(t, toSeasonId)).map((t) => t.shortName.toUpperCase()));
  const usedIds = new Set(all.map((t) => t.id));

  let copied = 0;
  for (const t of source) {
    if (targetShorts.has(t.shortName.toUpperCase())) continue; // schon in Ziel-Saison
    let id = slugify(t.name) || 'team';
    if (usedIds.has(id)) id = `${id}-${Date.now()}${copied}`;
    await sql`
      INSERT INTO teams (id, name, short_name, logo_color, logo_icon, logo_url, spielerliste, season_ids)
      VALUES (${id}, ${t.name}, ${t.shortName}, ${t.logoColor}, ${t.logoIcon}, ${t.logoUrl ?? ''},
              ${JSON.stringify(t.spielerliste ?? [])}::jsonb, ${JSON.stringify([toSeasonId])}::jsonb)
    `;
    usedIds.add(id);
    targetShorts.add(t.shortName.toUpperCase());
    copied++;
  }
  return res.json({ ok: true, copied });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await getTeams());
    }
    if (req.method === 'POST') {
      const action = (req.body ?? {}).action;
      if (action === 'addToSeason') return addToSeason(req, res);
      if (action === 'removeFromSeason') return removeFromSeason(req, res);
      if (action === 'copyToSeason') return copyToSeason(req, res);
      return createTeam(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/teams:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
