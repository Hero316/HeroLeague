import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSession } from './_lib/auth.js';
import { sql } from './_lib/db.js';
import { saveSubscription, removeSubscription, pushPublicKey } from './_lib/push.js';
import { badRequest } from './_lib/validate.js';
import { ensureSchema } from './_lib/ensure.js';

// Web-Push: öffentlicher Schlüssel, An-/Abmelden, Einstellungen.
//  GET  /api/push?resource=key           -> { key } (VAPID public)
//  GET  /api/push?resource=prefs         -> { muteWeekends, muteUntil }
//  POST /api/push?resource=prefs         -> Einstellungen speichern
//  POST /api/push { subscription }        -> Gerät anmelden
//  POST /api/push?resource=unsubscribe { endpoint } -> Gerät abmelden
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    const session = await getSession(req);
    if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
    const resource = req.query.resource;

    if (req.method === 'GET' && resource === 'key') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ key: pushPublicKey() });
    }
    if (req.method === 'GET' && resource === 'prefs') {
      res.setHeader('Cache-Control', 'no-store');
      const rows = await sql`SELECT COALESCE(notify_prefs, '{}'::jsonb) AS prefs FROM users WHERE id = ${session.userId}`;
      return res.json((rows[0] as { prefs: unknown } | undefined)?.prefs ?? {});
    }
    if (req.method === 'POST' && resource === 'prefs') {
      if (session.userId === 'bootstrap') return badRequest(res, 'Bitte mit einem echten Account anmelden.');
      const b = req.body ?? {};
      const muteUntil = typeof b.muteUntil === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(b.muteUntil) ? b.muteUntil : null;
      const prefs = { muteWeekends: Boolean(b.muteWeekends), muteUntil };
      await sql`UPDATE users SET notify_prefs = ${JSON.stringify(prefs)}::jsonb WHERE id = ${session.userId}`;
      return res.json(prefs);
    }
    if (req.method === 'POST' && resource === 'unsubscribe') {
      await removeSubscription(typeof req.body?.endpoint === 'string' ? req.body.endpoint : '');
      return res.json({ ok: true });
    }
    if (req.method === 'POST') {
      await saveSubscription(session.userId, req.body?.subscription ?? {});
      return res.json({ ok: true });
    }
    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/push:', err);
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Interner Fehler' });
  }
}
