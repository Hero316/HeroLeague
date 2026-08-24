import type { VercelRequest, VercelResponse } from '@vercel/node';
import { eventTickets } from './_lib/eventtickets.js';
import { ensureSchema } from './_lib/ensure.js';

// Zuschauer-Tickets für den Testspieltag (öffentlich + Admin). Öffentliche
// Aktionen sind bot-geschützt (E-Mail-Bestätigung, Kapazität/Reservierung,
// Rate-Limit, Wegwerf-Mail-Sperre, Turnstile).
//   GET  /api/event-tickets?action=config
//   POST /api/event-tickets?action=request-code | confirm
//   GET  /api/event-tickets?action=admin-list
//   POST /api/event-tickets?action=admin-checkin | admin-delete | admin-config
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    return await eventTickets(req, res);
  } catch (err) {
    console.error('Fehler in /api/event-tickets:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
