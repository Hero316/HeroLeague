import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual, randomInt } from 'node:crypto';
import {
  clearSessionCookie,
  createSessionToken,
  getSession,
  sessionCookie,
} from '../_lib/auth.js';
import { getUserByEmail, sql } from '../_lib/db.js';
import { isMailConfigured, sendLoginCode } from '../_lib/mail.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CODE_TTL_MIN = 10; // Gültigkeit des Login-Codes in Minuten
const MAX_ATTEMPTS = 5; // erlaubte Fehlversuche pro Code
const RESEND_THROTTLE_SEC = 20; // frühestens nach X Sekunden neuen Code erzeugen

function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

// Code mit dem SESSION_SECRET „peppern" und hashen, damit in der DB kein Klartext-Code liegt
function hashCode(code: string): string {
  const pepper = process.env.SESSION_SECRET || '';
  return createHash('sha256').update(`${code}:${pepper}`).digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function passwordsMatch(input: string, expected: string): boolean {
  const a = createHash('sha256').update(input).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action;

  try {
    // --- Aktuelle Sitzung abfragen -------------------------------------------
    if (action === 'session' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const session = await getSession(req);
      return res.json({
        isAdmin: Boolean(session),
        user: session
          ? { id: session.userId, email: session.email, name: session.name, role: session.role, permissions: session.permissions }
          : null,
      });
    }

    // --- Login-Code anfordern -------------------------------------------------
    if (action === 'request-code' && req.method === 'POST') {
      const { email } = req.body ?? {};
      if (!isEmail(email)) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse eingeben.' });
      const normalized = email.trim().toLowerCase();

      const user = await getUserByEmail(normalized);
      // Für dieses interne Backoffice ist eine klare Rückmeldung gewünscht,
      // wenn die E-Mail keinen (aktiven) Zugang hat.
      if (!user || !user.isActive) {
        await sleep(400);
        return res.status(404).json({ error: 'Für diese E-Mail besteht kein Admin-Zugang. Bitte wende dich an einen Super-Admin.' });
      }

      // Throttle: kürzlich erzeugten Code nicht sofort erneut versenden
      const recent = await sql`
        SELECT created_at FROM login_codes
        WHERE email = ${normalized} AND created_at > now() - ${`${RESEND_THROTTLE_SEC} seconds`}::interval
        LIMIT 1
      `;
      if (recent.length > 0) {
        return res.json({ ok: true });
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      await sql.transaction((txn) => [
        txn`DELETE FROM login_codes WHERE email = ${normalized}`,
        txn`INSERT INTO login_codes (email, code_hash, expires_at, attempts)
            VALUES (${normalized}, ${hashCode(code)}, now() + ${`${CODE_TTL_MIN} minutes`}::interval, 0)`,
      ]);

      try {
        await sendLoginCode(normalized, code);
      } catch (err) {
        // Zustellfehler nicht nach außen tragen (keine Enumeration); im Log sichtbar
        console.error('Login-Code konnte nicht gesendet werden:', err);
      }

      // Ohne konfigurierten Mailversand den Code außerhalb der Produktion direkt zurückgeben,
      // damit der Flow testbar bleibt.
      const exposeDevCode = !isMailConfigured() && process.env.VERCEL_ENV !== 'production';
      return res.json(exposeDevCode ? { ok: true, devCode: code } : { ok: true });
    }

    // --- Login-Code prüfen & anmelden ----------------------------------------
    if (action === 'verify-code' && req.method === 'POST') {
      const { email, code } = req.body ?? {};
      if (!isEmail(email) || typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
        return res.status(400).json({ error: 'E-Mail und 6-stelliger Code erforderlich.' });
      }
      const normalized = email.trim().toLowerCase();

      const rows = await sql`
        SELECT code_hash AS "codeHash", attempts
        FROM login_codes
        WHERE email = ${normalized} AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
      `;
      if (rows.length === 0) {
        await sleep(400);
        return res.status(401).json({ error: 'Code ungültig oder abgelaufen. Bitte neuen Code anfordern.' });
      }

      const row = rows[0] as { codeHash: string; attempts: number };
      if (row.attempts >= MAX_ATTEMPTS) {
        await sql`DELETE FROM login_codes WHERE email = ${normalized}`;
        return res.status(401).json({ error: 'Zu viele Fehlversuche. Bitte neuen Code anfordern.' });
      }

      if (!timingSafeEqualHex(hashCode(code.trim()), row.codeHash)) {
        await sql`UPDATE login_codes SET attempts = attempts + 1 WHERE email = ${normalized}`;
        await sleep(400);
        return res.status(401).json({ error: 'Code ungültig oder abgelaufen. Bitte neuen Code anfordern.' });
      }

      const user = await getUserByEmail(normalized);
      await sql`DELETE FROM login_codes WHERE email = ${normalized}`;
      if (!user || !user.isActive) {
        return res.status(401).json({ error: 'Für diese E-Mail besteht kein Zugang (mehr).' });
      }

      const token = await createSessionToken({
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        permissions: user.permissions,
      });
      res.setHeader('Set-Cookie', sessionCookie(token));
      return res.json({
        ok: true,
        user: { id: user.id, email: user.email, name: user.name, role: user.role, permissions: user.permissions },
      });
    }

    // --- Notzugang per Master-Passwort (immer Super-Admin) --------------------
    if (action === 'login' && req.method === 'POST') {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        return res.status(500).json({ error: 'ADMIN_PASSWORD ist nicht konfiguriert' });
      }
      const { password } = req.body ?? {};
      if (typeof password !== 'string' || !passwordsMatch(password, adminPassword)) {
        await sleep(500);
        return res.status(401).json({ error: 'Falsches Passwort' });
      }
      const token = await createSessionToken({
        userId: 'bootstrap',
        email: '',
        name: 'Super-Admin',
        role: 'superadmin',
        permissions: [],
      });
      res.setHeader('Set-Cookie', sessionCookie(token));
      return res.json({ ok: true, user: { id: 'bootstrap', email: '', name: 'Super-Admin', role: 'superadmin', permissions: [] } });
    }

    // --- Abmelden -------------------------------------------------------------
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
