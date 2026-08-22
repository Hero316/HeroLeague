import type { VercelRequest, VercelResponse } from '@vercel/node';
import { tickets, ticket, ticketComment } from './_lib/collab.js';
import { denyWithoutTeamApp } from './_lib/auth.js';
import { ensureSchema } from './_lib/ensure.js';

// Ticketsystem: eigener Endpunkt (Vercel Pro – kein 12-Funktionen-Limit mehr).
//  GET  /api/tickets            -> Liste
//  POST /api/tickets            -> neues Ticket (kein id im Body)
//  GET  /api/tickets?id=X       -> Einzelticket inkl. Kommentare
//  POST /api/tickets  {id,...}  -> Ticket verwalten (Status/Zuweisung/…) oder {op:'delete'}
//  POST /api/tickets?sub=comment {ticketId,body,images} -> Kommentar hinzufügen
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    if (await denyWithoutTeamApp(req, res)) return;
    if (req.query.sub === 'comment') return ticketComment(req, res);
    if (req.method === 'GET' && req.query.id) return ticket(req, res);
    if (req.method === 'POST' && req.body?.id) return ticket(req, res);
    return tickets(req, res);
  } catch (err) {
    console.error('Fehler in /api/tickets:', err);
    if (req.method === 'GET') return res.json([]);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
