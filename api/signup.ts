import type { VercelRequest, VercelResponse } from '@vercel/node';
import { seasonSignup } from './_lib/signup.js';
import { ensureSchema } from './_lib/ensure.js';

// Season-2-Team-Anmeldung (öffentlich + Admin). Öffentliche Aktionen sind
// bot-geschützt (E-Mail-Bestätigung, Rate-Limit, Wegwerf-Mail-Sperre, Turnstile);
// Admin-Aktionen prüfen die Super-Admin-Session im Handler selbst.
//   GET  /api/signup?action=config
//   POST /api/signup?action=captain-lookup | request-code | submit
//   GET  /api/signup?action=admin-list | admin-detail&id= | admin-config
//   POST /api/signup?action=admin-delete | admin-config
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureSchema();
    return await seasonSignup(req, res);
  } catch (err) {
    console.error('Fehler in /api/signup:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
