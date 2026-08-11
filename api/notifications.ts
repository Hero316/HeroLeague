import type { VercelRequest, VercelResponse } from '@vercel/node';
import { notifications } from './_lib/collab.js';

// In-App-Benachrichtigungen (Glocke im Backoffice).
//  GET  /api/notifications         -> eigene ungelesene + Anzahl
//  POST /api/notifications {id}    -> eine als gelesen markieren
//  POST /api/notifications {all:true} -> alle als gelesen markieren
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    return notifications(req, res);
  } catch (err) {
    console.error('Fehler in /api/notifications:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
