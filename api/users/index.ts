import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getUsers, sql } from '../_lib/db.js';
import { requireSuperadmin, normalizePermissions } from '../_lib/auth.js';
import { badRequest } from '../_lib/validate.js';
import { ensureSchema } from '../_lib/ensure.js';

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isRole(value: unknown): value is 'superadmin' | 'match_admin' | 'referee' | 'ticket_manager' | 'team_member' {
  return (
    value === 'superadmin' ||
    value === 'match_admin' ||
    value === 'referee' ||
    value === 'ticket_manager' ||
    value === 'team_member'
  );
}

const listUsers = requireSuperadmin(async (_req: VercelRequest, res: VercelResponse) => {
  res.setHeader('Cache-Control', 'no-store');
  return res.json(await getUsers());
});

const createUser = requireSuperadmin(async (req: VercelRequest, res: VercelResponse) => {
  const { email, name, role } = req.body ?? {};
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse angeben.');
  if (!isRole(role)) return badRequest(res, 'Ungültige Rolle.');
  if (name !== undefined && typeof name !== 'string') return badRequest(res, 'Ungültiger Name.');

  const normalized = email.trim().toLowerCase();
  const existing = await sql`SELECT id FROM users WHERE email = ${normalized}`;
  if (existing.length > 0) return badRequest(res, 'Diese E-Mail-Adresse ist bereits vergeben.');

  const permissions = normalizePermissions(req.body?.permissions);
  const id = `u-${Date.now()}`;
  await sql`
    INSERT INTO users (id, email, name, role, permissions, is_active)
    VALUES (${id}, ${normalized}, ${(name ?? '').trim()}, ${role}, ${JSON.stringify(permissions)}::jsonb, true)
  `;

  return res.json({ id, email: normalized, name: (name ?? '').trim(), role, permissions, isActive: true });
});

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    if (req.method === 'GET') return listUsers(req, res);
    if (req.method === 'POST') return createUser(req, res);
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/users:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
