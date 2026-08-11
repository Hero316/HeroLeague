import type { VercelRequest, VercelResponse } from '@vercel/node';
import { teamMembers, updateProfile } from './_lib/collab.js';

// Team-Mitglieder + eigenes Profil. Für JEDEN eingeloggten Nutzer.
//  GET  /api/team               -> [{ id, name, role, avatarUrl, status }]
//  POST /api/team?resource=profile { name?, avatarUrl?, status? } -> eigenes Profil
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method === 'POST' && req.query.resource === 'profile') return updateProfile(req, res);
    return teamMembers(req, res);
  } catch (err) {
    console.error('Fehler in /api/team:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
