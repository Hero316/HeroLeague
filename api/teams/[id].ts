import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { Team } from '../../src/types';
import { normalizeRoster, sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/auth.js';
import { badRequest, isNonEmptyString, isRoster } from '../_lib/validate.js';

const updateTeam = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  const { name, shortName, logoUrl, logoColor, logoIcon, spielerliste } = req.body ?? {};

  if (name !== undefined && !isNonEmptyString(name)) return badRequest(res, 'Name darf nicht leer sein.');
  if (shortName !== undefined && !isNonEmptyString(shortName)) return badRequest(res, 'Kürzel darf nicht leer sein.');
  if (logoUrl !== undefined && typeof logoUrl !== 'string') return badRequest(res, 'Ungültige Logo-URL.');
  if (logoColor !== undefined && !isNonEmptyString(logoColor)) return badRequest(res, 'Ungültige Vereinsfarbe.');
  if (logoIcon !== undefined && !isNonEmptyString(logoIcon)) return badRequest(res, 'Ungültiges Wappen-Symbol.');
  if (spielerliste !== undefined && !isRoster(spielerliste)) return badRequest(res, 'Ungültiges Kader-Format.');

  const rows = await sql`
    SELECT id, name, short_name AS "shortName", logo_color AS "logoColor",
           logo_icon AS "logoIcon", logo_url AS "logoUrl", spielerliste
    FROM teams WHERE id = ${id}
  `;
  if (rows.length === 0) return res.status(404).json({ error: 'Team nicht gefunden.' });

  const team = { ...rows[0], spielerliste: normalizeRoster(rows[0].spielerliste) } as Team;
  if (name !== undefined) team.name = name.trim();
  if (shortName !== undefined) team.shortName = shortName.trim().toUpperCase();
  if (logoUrl !== undefined) team.logoUrl = logoUrl.trim();
  if (logoColor !== undefined) team.logoColor = logoColor;
  if (logoIcon !== undefined) team.logoIcon = logoIcon;
  if (spielerliste !== undefined) team.spielerliste = spielerliste;

  await sql`
    UPDATE teams
    SET name = ${team.name}, short_name = ${team.shortName}, logo_color = ${team.logoColor},
        logo_icon = ${team.logoIcon}, logo_url = ${team.logoUrl},
        spielerliste = ${JSON.stringify(team.spielerliste)}::jsonb
    WHERE id = ${id}
  `;

  return res.json(team);
});

const deleteTeam = requireAdmin(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  // Spiele des Vereins werden per FK-Kaskade mitgelöscht
  const rows = await sql`DELETE FROM teams WHERE id = ${id} RETURNING id`;
  if (rows.length === 0) return res.status(404).json({ error: 'Team nicht gefunden.' });
  return res.json({ ok: true });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'PUT') return updateTeam(req, res);
    if (req.method === 'DELETE') return deleteTeam(req, res);
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/teams/[id]:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
