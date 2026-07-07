import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { clearSessionCookie, createSessionToken, isAuthenticated, sessionCookie } from '../_lib/auth.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function passwordsMatch(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action;

  try {
    if (action === 'session' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      return res.json({ isAdmin: await isAuthenticated(req) });
    }

    if (action === 'login' && req.method === 'POST') {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        return res.status(500).json({ error: 'ADMIN_PASSWORD ist nicht konfiguriert' });
      }
      const { password } = req.body ?? {};
      if (typeof password !== 'string' || !passwordsMatch(password, adminPassword)) {
        await sleep(500); // einfache Bremse gegen Durchprobieren
        return res.status(401).json({ error: 'Falsches Passwort' });
      }
      const token = await createSessionToken();
      res.setHeader('Set-Cookie', sessionCookie(token));
      return res.json({ ok: true });
    }

    if (action === 'logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', clearSessionCookie());
      return res.json({ ok: true });
    }

    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Auth-Fehler:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
