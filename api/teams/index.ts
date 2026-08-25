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
  if (existing.some((t) => t.shortName.toUpperCase() === shortName.trim().toUpperCase())) {
    return badRequest(res, 'Ein Club mit diesem Kürzel existiert bereits.');
  }

  let id = slugify(name) || `team-${Date.now()}`;
  if (existing.some((t) => t.id === id)) {
    id = `${id}-${Date.now()}`;
  }

  // Saison-Zugehörigkeit: explizit übergeben, sonst die aktuelle Saison.
  let memberSeasonIds: string[];
  if (Array.isArray(seasonIds)) {
    memberSeasonIds = seasonIds.filter((x): x is string => typeof x === 'string');
  } else {
    const cur = await getCurrentSeason();
    memberSeasonIds = cur ? [cur.id] : [];
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
      return createTeam(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/teams:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
