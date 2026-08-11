import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSession, requireSuperadmin, normalizePermissions } from '../_lib/auth.js';
import { sql } from '../_lib/db.js';
import { badRequest } from '../_lib/validate.js';
import { ensureSchema } from '../_lib/ensure.js';

function isRole(value: unknown): value is 'superadmin' | 'match_admin' | 'referee' | 'ticket_manager' | 'team_member' {
  return (
    value === 'superadmin' ||
    value === 'match_admin' ||
    value === 'referee' ||
    value === 'ticket_manager' ||
    value === 'team_member'
  );
}

async function countActiveSuperadmins(): Promise<number> {
  const rows = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'superadmin' AND is_active = true`;
  return (rows[0] as { n: number }).n;
}

const updateUser = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  const session = await getSession(req);
  const { name, role, isActive, permissions } = req.body ?? {};

  if (name !== undefined && typeof name !== 'string') return badRequest(res, 'Ungültiger Name.');
  if (role !== undefined && !isRole(role)) return badRequest(res, 'Ungültige Rolle.');
  if (isActive !== undefined && typeof isActive !== 'boolean') return badRequest(res, 'Ungültiger Status.');
  if (permissions !== undefined && !Array.isArray(permissions)) return badRequest(res, 'Ungültige Rechte.');

  const rows = await sql`SELECT id, email, name, role, COALESCE(permissions, '[]'::jsonb) AS permissions, is_active AS "isActive" FROM users WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const user = rows[0] as { id: string; email: string; name: string; role: string; permissions: unknown; isActive: boolean };

  const isSelf = session?.userId === id;
  const willBeSuperadmin = role !== undefined ? role === 'superadmin' : user.role === 'superadmin';
  const willBeActive = isActive !== undefined ? isActive : user.isActive;

  // Selbst-Aussperren verhindern
  if (isSelf && (!willBeActive || !willBeSuperadmin)) {
    return badRequest(res, 'Du kannst deinen eigenen Zugang bzw. deine Super-Admin-Rolle nicht entziehen.');
  }
  // Den letzten aktiven Super-Admin nicht herabstufen/deaktivieren
  const removesSuperadmin = user.role === 'superadmin' && user.isActive && (!willBeSuperadmin || !willBeActive);
  if (removesSuperadmin && (await countActiveSuperadmins()) <= 1) {
    return badRequest(res, 'Es muss mindestens ein aktiver Super-Admin bestehen bleiben.');
  }

  const nextName = name !== undefined ? name.trim() : user.name;
  const nextRole = role !== undefined ? role : user.role;
  const nextActive = isActive !== undefined ? isActive : user.isActive;
  const nextPermissions =
    permissions !== undefined ? normalizePermissions(permissions) : normalizePermissions(user.permissions);

  await sql`
    UPDATE users SET name = ${nextName}, role = ${nextRole},
      permissions = ${JSON.stringify(nextPermissions)}::jsonb, is_active = ${nextActive}
    WHERE id = ${id}
  `;
  return res.json({ id, email: user.email, name: nextName, role: nextRole, permissions: nextPermissions, isActive: nextActive });
});

const deleteUser = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const id = String(req.query.id);
  const session = await getSession(req);
  if (session?.userId === id) return badRequest(res, 'Du kannst deinen eigenen Zugang nicht löschen.');

  const rows = await sql`SELECT role, is_active AS "isActive" FROM users WHERE id = ${id}`;
  if (rows.length === 0) return res.status(404).json({ error: 'Benutzer nicht gefunden.' });
  const user = rows[0] as { role: string; isActive: boolean };

  if (user.role === 'superadmin' && user.isActive && (await countActiveSuperadmins()) <= 1) {
    return badRequest(res, 'Der letzte aktive Super-Admin kann nicht gelöscht werden.');
  }

  await sql`DELETE FROM users WHERE id = ${id}`;
  return res.json({ ok: true });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    if (req.method === 'PUT') return updateUser(req, res);
    if (req.method === 'DELETE') return deleteUser(req, res);
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/users/[id]:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
