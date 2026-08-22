import type { VercelRequest, VercelResponse } from '@vercel/node';
import { notifications } from './_lib/collab.js';
import { denyWithoutTeamApp } from './_lib/auth.js';
import { ensureSchema } from './_lib/ensure.js';

// In-App-Benachrichtigungen (Glocke im Backoffice).
//  GET  /api/notifications         -> eigene ungelesene + Anzahl
//  POST /api/notifications {id}    -> eine als gelesen markieren
//  POST /api/notifications {all:true} -> alle als gelesen markieren
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    if (await denyWithoutTeamApp(req, res)) return;
    return notifications(req, res);
  } catch (err) {
    console.error('Fehler in /api/notifications:', err);
    if (req.method === 'GET') return res.json({ items: [], unreadCount: 0 });
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
