import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getTeams, sql } from '../_lib/db';
import { requireAdmin } from '../_lib/auth';
import { badRequest, isNonEmptyString, isRoster } from '../_lib/validate';

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

const createTeam = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const { name, shortName, logoColor, logoIcon, logoUrl, spielerliste } = req.body ?? {};

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

  const team = {
    id,
    name: name.trim(),
    shortName: shortName.trim().toUpperCase(),
    logoColor: isNonEmptyString(logoColor) ? logoColor : '#3B82F6',
    logoIcon: isNonEmptyString(logoIcon) ? logoIcon : '⚽',
    logoUrl: typeof logoUrl === 'string' ? logoUrl : '',
    spielerliste: spielerliste ?? [],
  };

  await sql`
    INSERT INTO teams (id, name, short_name, logo_color, logo_icon, logo_url, spielerliste)
    VALUES (${team.id}, ${team.name}, ${team.shortName}, ${team.logoColor}, ${team.logoIcon}, ${team.logoUrl}, ${JSON.stringify(team.spielerliste)}::jsonb)
  `;

  return res.json(team);
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json(await getTeams());
    }
    if (req.method === 'POST') {
      return createTeam(req, res);
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/teams:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
