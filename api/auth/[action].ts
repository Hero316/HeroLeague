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
import { ensureSchema } from '../_lib/ensure.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const CODE_TTL_MIN = 10; // Gültigkeit des Login-Codes in Minuten
const MAX_ATTEMPTS = 5; // erlaubte Fehlversuche pro Code
const RESEND_THROTTLE_SEC = 20; // frühestens nach X Sekunden neuen Code erzeugen

// Brute-Force-Schutz fürs Master-Passwort: nach MASTER_MAX_FAILS falschen
// Versuchen innerhalb von MASTER_WINDOW_MIN wird die IP für MASTER_LOCK_MIN gesperrt.
const MASTER_MAX_FAILS = 5;
const MASTER_LOCK_MIN = 15;
const MASTER_WINDOW_MIN = 15;
// Reservierter „E-Mail"-Schlüssel für den zweiten Faktor des Master-Logins in
// der login_codes-Tabelle. Enthält kein „@" und kollidiert daher nie mit echten
// Benutzer-E-Mails.
const MASTER_2FA_KEY = 'master-2fa';

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

// Client-IP aus den Proxy-Headern (Vercel setzt x-forwarded-for zuverlässig).
function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const firstFwd = (Array.isArray(fwd) ? fwd[0] : fwd ?? '').split(',')[0].trim();
  if (firstFwd) return firstFwd;
  const real = req.headers['x-real-ip'];
  const realIp = (Array.isArray(real) ? real[0] : real ?? '').trim();
  return realIp || 'unknown';
}

// Betriebstabelle für Fehlversuche – wie die visits-Tabelle bei Bedarf selbst
// angelegt (kein manueller Neon-Schritt nötig).
async function ensureAttemptsTable(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS login_attempts (
      ip            TEXT PRIMARY KEY,
      fail_count    INTEGER NOT NULL DEFAULT 0,
      first_fail_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      locked_until  TIMESTAMPTZ
    )
  `;
}

async function isLocked(ip: string): Promise<boolean> {
  await ensureAttemptsTable();
  const rows = await sql`
    SELECT 1 FROM login_attempts
    WHERE ip = ${ip} AND locked_until IS NOT NULL AND locked_until > now()
    LIMIT 1
  `;
  return rows.length > 0;
}

// Fehlversuch verbuchen. Zähler rollt nach Ablauf des Fensters zurück; ab der
// Schwelle wird locked_until gesetzt.
async function registerFail(ip: string): Promise<void> {
  await ensureAttemptsTable();
  const window = `${MASTER_WINDOW_MIN} minutes`;
  const lock = `${MASTER_LOCK_MIN} minutes`;
  await sql`
    INSERT INTO login_attempts (ip, fail_count, first_fail_at, locked_until)
    VALUES (${ip}, 1, now(), NULL)
    ON CONFLICT (ip) DO UPDATE SET
      fail_count = CASE
        WHEN login_attempts.first_fail_at < now() - ${window}::interval THEN 1
        ELSE login_attempts.fail_count + 1
      END,
      first_fail_at = CASE
        WHEN login_attempts.first_fail_at < now() - ${window}::interval THEN now()
        ELSE login_attempts.first_fail_at
      END,
      locked_until = CASE
        WHEN login_attempts.first_fail_at >= now() - ${window}::interval
             AND login_attempts.fail_count + 1 >= ${MASTER_MAX_FAILS}
        THEN now() + ${lock}::interval
        ELSE NULL
      END
  `;
}

async function clearFails(ip: string): Promise<void> {
  await ensureAttemptsTable();
  await sql`DELETE FROM login_attempts WHERE ip = ${ip}`;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = req.query.action;

  try {
    await ensureSchema();
    // --- Aktuelle Sitzung abfragen -------------------------------------------
    if (action === 'session' && req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      const session = await getSession(req);
      if (!session) return res.json({ isAdmin: false, user: null });

      // Werte aus dem Token als Basis …
      let user = {
        id: session.userId,
        email: session.email,
        name: session.name,
        role: session.role,
        permissions: session.permissions,
        avatarUrl: session.avatarUrl,
        status: session.status,
      };
      // … aber FRISCH aus der DB überschreiben (Profilbild/Name/Status/Rolle/
      // Rechte können sich seit dem Login geändert haben – sonst „springt" alles
      // beim Neuladen auf den alten Token-Stand zurück).
      if (session.email) {
        try {
          const fresh = await getUserByEmail(session.email);
          if (fresh) {
            user = {
              id: fresh.id,
              email: fresh.email,
              name: fresh.name,
              role: fresh.role,
              permissions: fresh.permissions,
              avatarUrl: fresh.avatarUrl,
              status: fresh.status,
            };
          }
        } catch {
          /* DB nicht erreichbar – Token-Werte behalten */
        }
      }
      return res.json({ isAdmin: true, user });
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
        avatarUrl: user.avatarUrl,
        status: user.status,
      });
      res.setHeader('Set-Cookie', sessionCookie(token));
      return res.json({
        ok: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          permissions: user.permissions,
          avatarUrl: user.avatarUrl,
          status: user.status,
        },
      });
    }

    // --- Notzugang per Master-Passwort (mit Sperre + optional 2-Faktor) -------
    if (action === 'login' && req.method === 'POST') {
      const adminPassword = process.env.ADMIN_PASSWORD;
      if (!adminPassword) {
        return res.status(500).json({ error: 'ADMIN_PASSWORD ist nicht konfiguriert' });
      }

      // Brute-Force-Sperre: gesperrte IP früh abweisen (E-Mail-Code bleibt als Ausweichweg).
      const ip = clientIp(req);
      if (await isLocked(ip)) {
        return res.status(429).json({
          error: `Zu viele Fehlversuche. Bitte in ${MASTER_LOCK_MIN} Minuten erneut versuchen oder per E-Mail-Code anmelden.`,
        });
      }

      const { password } = req.body ?? {};
      if (typeof password !== 'string' || !passwordsMatch(password, adminPassword)) {
        await registerFail(ip);
        await sleep(500);
        return res.status(401).json({ error: 'Falsches Passwort' });
      }

      // Passwort korrekt → Fehlversuchszähler dieser IP zurücksetzen.
      await clearFails(ip);

      // Zweiter Faktor per E-Mail – nur wenn ADMIN_2FA_EMAIL gesetzt ist.
      const twoFactorEmail = process.env.ADMIN_2FA_EMAIL?.trim().toLowerCase();
      if (twoFactorEmail) {
        const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
        await sql.transaction((txn) => [
          txn`DELETE FROM login_codes WHERE email = ${MASTER_2FA_KEY}`,
          txn`INSERT INTO login_codes (email, code_hash, expires_at, attempts)
              VALUES (${MASTER_2FA_KEY}, ${hashCode(code)}, now() + ${`${CODE_TTL_MIN} minutes`}::interval, 0)`,
        ]);

        try {
          await sendLoginCode(twoFactorEmail, code);
        } catch (err) {
          console.error('2FA-Code konnte nicht gesendet werden:', err);
        }

        // Ohne konfigurierten Mailversand außerhalb der Produktion den Code direkt zurückgeben.
        const exposeDevCode = !isMailConfigured() && process.env.VERCEL_ENV !== 'production';
        return res.json(exposeDevCode ? { ok: true, twoFactor: true, devCode: code } : { ok: true, twoFactor: true });
      }

      // Kein zweiter Faktor konfiguriert → direkt anmelden (wie bisher).
      const token = await createSessionToken({
        userId: 'bootstrap',
        email: '',
        name: 'Super-Admin',
        role: 'superadmin',
        permissions: [],
        avatarUrl: '',
        status: 'online',
      });
      res.setHeader('Set-Cookie', sessionCookie(token));
      return res.json({
        ok: true,
        user: { id: 'bootstrap', email: '', name: 'Super-Admin', role: 'superadmin', permissions: [], avatarUrl: '', status: 'online' },
      });
    }

    // --- Master-Passwort: zweiten Faktor (E-Mail-Code) prüfen & anmelden ------
    if (action === 'verify-login' && req.method === 'POST') {
      const { code } = req.body ?? {};
      if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
        return res.status(400).json({ error: '6-stelliger Code erforderlich.' });
      }

      const rows = await sql`
        SELECT code_hash AS "codeHash", attempts
        FROM login_codes
        WHERE email = ${MASTER_2FA_KEY} AND expires_at > now()
        ORDER BY created_at DESC LIMIT 1
      `;
      if (rows.length === 0) {
        await sleep(400);
        return res.status(401).json({ error: 'Code ungültig oder abgelaufen. Bitte erneut mit dem Passwort anmelden.' });
      }

      const row = rows[0] as { codeHash: string; attempts: number };
      if (row.attempts >= MAX_ATTEMPTS) {
        await sql`DELETE FROM login_codes WHERE email = ${MASTER_2FA_KEY}`;
        return res.status(401).json({ error: 'Zu viele Fehlversuche. Bitte erneut mit dem Passwort anmelden.' });
      }

      if (!timingSafeEqualHex(hashCode(code.trim()), row.codeHash)) {
        await sql`UPDATE login_codes SET attempts = attempts + 1 WHERE email = ${MASTER_2FA_KEY}`;
        await sleep(400);
        return res.status(401).json({ error: 'Code ungültig oder abgelaufen.' });
      }

      await sql`DELETE FROM login_codes WHERE email = ${MASTER_2FA_KEY}`;
      const token = await createSessionToken({
        userId: 'bootstrap',
        email: '',
        name: 'Super-Admin',
        role: 'superadmin',
        permissions: [],
        avatarUrl: '',
        status: 'online',
      });
      res.setHeader('Set-Cookie', sessionCookie(token));
      return res.json({
        ok: true,
        user: { id: 'bootstrap', email: '', name: 'Super-Admin', role: 'superadmin', permissions: [], avatarUrl: '', status: 'online' },
      });
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
