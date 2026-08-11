import type { VercelRequest, VercelResponse } from '@vercel/node';
import { teamMembers } from './_lib/collab.js';

// Aktive Team-Mitglieder (für Zuweisungen/Erwähnungen). Für JEDEN eingeloggten
// Nutzer lesbar – anders als /api/users (nur Super-Admin).
//  GET /api/team -> [{ id, name, role }]
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return teamMembers(req, res);
  } catch (err) {
    console.error('Fehler in /api/team:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
