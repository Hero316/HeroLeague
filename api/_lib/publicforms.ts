// Gemeinsame Bausteine für ÖFFENTLICHE Formulare (Season-2-Anmeldung &
// Testspiel-Tickets): Bot-/Spam-Schutz, E-Mail-Bestätigung per 6-stelligem Code
// und ein hübsches, markiges E-Mail-Layout. Bewusst ohne Login – der Schutz
// ergibt sich aus: echte E-Mail bestätigen (Code) + Wegwerf-Mail-Sperre +
// IP-Rate-Limit + Honeypot + optionalem Cloudflare-Turnstile-Captcha.
import { createHash, timingSafeEqual, randomInt } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { sql } from './db.js';
import { escapeHtml, isMailConfigured, sendMail } from './mail.js';

export const CODE_TTL_MIN = 15; // Gültigkeit des Bestätigungs-Codes
export const MAX_CODE_ATTEMPTS = 6; // erlaubte Fehlversuche pro Code
const RESEND_THROTTLE_SEC = 25; // frühestens nach X Sekunden neuen Code

export function isEmail(value: unknown): value is string {
  return typeof value === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}
export function normEmail(value: string): string {
  return value.trim().toLowerCase();
}

// Kompakte Sperrliste bekannter Wegwerf-/10-Minuten-Mail-Domains. Deckt die
// verbreitetsten ab; erweiterbar. (Die Code-Bestätigung ist der Haupt-Schutz –
// dies fängt zusätzlich die offensichtlichen Bot-Postfächer ab.)
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.info', 'guerrillamail.net', 'grr.la', 'sharklasers.com',
  '10minutemail.com', '10minutemail.net', '10minmail.com', 'temp-mail.org', 'tempmail.com', 'tempmailo.com',
  'tempr.email', 'tempmail.net', 'tmail.com', 'tmailor.com', 'moakt.com', 'mohmal.com', 'trashmail.com',
  'trashmail.de', 'wegwerfmail.de', 'wegwerfemail.de', 'einrot.com', 'fakemail.net', 'fakeinbox.com',
  'yopmail.com', 'yopmail.net', 'maildrop.cc', 'dispostable.com', 'getnada.com', 'nada.email', 'inboxkitten.com',
  'emailondeck.com', 'throwawaymail.com', 'mailnesia.com', 'spamgourmet.com', 'mytemp.email', 'tempinbox.com',
  'burnermail.io', 'mailcatch.com', 'harakirimail.com', 'gmailnator.com', 'byom.de', 'discard.email',
  'anonbox.net', 'spam4.me', 'maileater.com', 'mvrht.com', 'jetable.org', 'mail-temp.com', '20minutemail.com',
  'minuteinbox.com', 'luxusmail.org', 'muellmail.com', '1secmail.com', '1secmail.org', 'cloudtempmail.net',
]);
export function isDisposableEmail(email: string): boolean {
  const domain = normEmail(email).split('@')[1] || '';
  return DISPOSABLE_DOMAINS.has(domain);
}

// --- Sicherheits-Helfer (gespiegelt vom Login-Flow) -------------------------
function hashCode(code: string): string {
  const pepper = process.env.SESSION_SECRET || '';
  return createHash('sha256').update(`pf:${code}:${pepper}`).digest('hex');
}
function timingSafeEqualHex(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex');
  const bufB = Buffer.from(b, 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
export function clientIp(req: VercelRequest): string {
  const fwd = req.headers['x-forwarded-for'];
  const firstFwd = (Array.isArray(fwd) ? fwd[0] : fwd ?? '').split(',')[0].trim();
  if (firstFwd) return firstFwd;
  const real = req.headers['x-real-ip'];
  const realIp = (Array.isArray(real) ? real[0] : real ?? '').trim();
  return realIp || 'unknown';
}

let schemaReady = false;
async function ensurePublicSchema(): Promise<void> {
  if (schemaReady) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS public_codes (
      purpose TEXT NOT NULL, email TEXT NOT NULL, code_hash TEXT NOT NULL,
      expires_at TIMESTAMPTZ NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(), PRIMARY KEY (purpose, email))`;
    await sql`CREATE TABLE IF NOT EXISTS public_rate (
      bucket TEXT PRIMARY KEY, count INTEGER NOT NULL DEFAULT 0,
      window_start TIMESTAMPTZ NOT NULL DEFAULT now())`;
    schemaReady = true;
  } catch (err) {
    console.error('ensurePublicSchema:', err);
  }
}

// Einfaches IP-Rate-Limit pro Aktion. true = zu viele Versuche (blockieren).
export async function tooManyAttempts(scope: string, ip: string, max: number, windowMin: number): Promise<boolean> {
  await ensurePublicSchema();
  const bucket = `${scope}:${ip}`;
  try {
    const rows = await sql`
      INSERT INTO public_rate (bucket, count, window_start)
      VALUES (${bucket}, 1, now())
      ON CONFLICT (bucket) DO UPDATE SET
        count = CASE WHEN public_rate.window_start < now() - ${`${windowMin} minutes`}::interval THEN 1
                     ELSE public_rate.count + 1 END,
        window_start = CASE WHEN public_rate.window_start < now() - ${`${windowMin} minutes`}::interval THEN now()
                     ELSE public_rate.window_start END
      RETURNING count`;
    return Number(rows[0]?.count || 0) > max;
  } catch {
    return false; // im Zweifel nicht aussperren
  }
}

// Cloudflare Turnstile prüfen. Ohne TURNSTILE_SECRET ist das Captcha AUS
// (gibt true zurück) – so blockiert es weder Build noch Tests, bis die Keys da
// sind. Mit Secret wird der Token echt gegen Cloudflare validiert.
export async function verifyTurnstile(token: unknown, ip: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET;
  if (!secret) return true; // Captcha nicht aktiviert
  if (typeof token !== 'string' || !token) return false;
  try {
    const body = new URLSearchParams({ secret, response: token, remoteip: ip });
    const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body });
    const d = (await r.json()) as { success?: boolean };
    return !!d.success;
  } catch {
    return false;
  }
}

export interface IssueResult { ok: boolean; error?: string; throttled?: boolean; devCode?: string }

// Neuen Bestätigungs-Code erzeugen, speichern und per Mail senden. `sendFn`
// baut die konkrete (hübsche) Mail für den jeweiligen Zweck.
export async function issueCode(
  purpose: string,
  email: string,
  sendFn: (code: string) => Promise<void>,
): Promise<IssueResult> {
  await ensurePublicSchema();
  const normalized = normEmail(email);
  const recent = await sql`SELECT created_at FROM public_codes
    WHERE purpose = ${purpose} AND email = ${normalized}
      AND created_at > now() - ${`${RESEND_THROTTLE_SEC} seconds`}::interval LIMIT 1`;
  if (recent.length > 0) return { ok: true, throttled: true };

  const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
  await sql`INSERT INTO public_codes (purpose, email, code_hash, expires_at, attempts, created_at)
    VALUES (${purpose}, ${normalized}, ${hashCode(code)}, now() + ${`${CODE_TTL_MIN} minutes`}::interval, 0, now())
    ON CONFLICT (purpose, email) DO UPDATE SET
      code_hash = EXCLUDED.code_hash, expires_at = EXCLUDED.expires_at, attempts = 0, created_at = now()`;

  try {
    await sendFn(code);
  } catch (err) {
    console.error('Bestätigungs-Mail fehlgeschlagen:', err);
  }
  // Ohne Mail-Setup (nur außerhalb Produktion) den Code direkt zurückgeben,
  // damit der Flow auf dev/preview auch ohne Postfach testbar ist.
  const exposeDev = !isMailConfigured() && process.env.VERCEL_ENV !== 'production';
  return exposeDev ? { ok: true, devCode: code } : { ok: true };
}

export interface CheckResult { ok: boolean; error?: string }

// Code prüfen und bei Erfolg verbrauchen (löschen). Zählt Fehlversuche.
export async function checkCode(purpose: string, email: string, code: unknown): Promise<CheckResult> {
  await ensurePublicSchema();
  const normalized = normEmail(email);
  if (typeof code !== 'string' || !/^\d{6}$/.test(code.trim())) {
    return { ok: false, error: 'Bitte den 6-stelligen Code eingeben.' };
  }
  const rows = await sql`SELECT code_hash AS "codeHash", attempts FROM public_codes
    WHERE purpose = ${purpose} AND email = ${normalized} AND expires_at > now() LIMIT 1`;
  if (rows.length === 0) return { ok: false, error: 'Der Code ist abgelaufen. Bitte fordere einen neuen an.' };
  const row = rows[0] as { codeHash: string; attempts: number };
  if (row.attempts >= MAX_CODE_ATTEMPTS) {
    await sql`DELETE FROM public_codes WHERE purpose = ${purpose} AND email = ${normalized}`;
    return { ok: false, error: 'Zu viele Fehlversuche. Bitte fordere einen neuen Code an.' };
  }
  if (!timingSafeEqualHex(hashCode(code.trim()), row.codeHash)) {
    await sql`UPDATE public_codes SET attempts = attempts + 1 WHERE purpose = ${purpose} AND email = ${normalized}`;
    return { ok: false, error: 'Der Code stimmt nicht. Bitte prüfe deine E-Mail.' };
  }
  await sql`DELETE FROM public_codes WHERE purpose = ${purpose} AND email = ${normalized}`;
  return { ok: true };
}

// --- Hübsches, markiges E-Mail-Layout ---------------------------------------
const BRAND = '#12A594';
const BRAND_DARK = '#0C7A70';
const LOGO_URL = 'https://hero-league.de/assets/hero-league-logo.png';

// Gemeinsames Grundgerüst (dunkler Header mit Logo, heller Inhaltskasten,
// dezenter Footer). `accent` erlaubt eine eigene Farbwelt je Mail-Typ.
export function mailLayout(opts: {
  preheader?: string;
  heading: string;
  intro?: string;
  bodyHtml: string;
  accent?: string;
  accentDark?: string;
  footnote?: string;
}): string {
  const accent = opts.accent || BRAND;
  const accentDark = opts.accentDark || BRAND_DARK;
  const pre = opts.preheader
    ? `<span style="display:none!important;opacity:0;color:transparent;height:0;width:0;overflow:hidden">${escapeHtml(opts.preheader)}</span>`
    : '';
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#0b1210;">
${pre}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0b1210;padding:28px 12px;">
  <tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;width:100%;">
      <tr><td style="padding:0 0 18px;text-align:center;">
        <img src="${LOGO_URL}" alt="Hero League" width="46" height="46" style="height:46px;width:auto;border:0;display:inline-block;">
      </td></tr>
      <tr><td style="background:linear-gradient(135deg,${accentDark},${accent});border-radius:22px 22px 0 0;padding:26px 30px;">
        <div style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:12px;font-weight:800;letter-spacing:2px;text-transform:uppercase;opacity:.85;">Hero League</div>
        <div style="font-family:Arial,Helvetica,sans-serif;color:#ffffff;font-size:24px;font-weight:800;line-height:1.15;margin-top:4px;">${escapeHtml(opts.heading)}</div>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:0 0 22px 22px;padding:26px 30px 30px;">
        ${opts.intro ? `<p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:15px;line-height:1.55;margin:0 0 18px;">${escapeHtml(opts.intro)}</p>` : ''}
        ${opts.bodyHtml}
      </td></tr>
      <tr><td style="padding:18px 24px 0;text-align:center;">
        <p style="font-family:Arial,Helvetica,sans-serif;color:#5a6763;font-size:12px;line-height:1.5;margin:0;">${opts.footnote ? escapeHtml(opts.footnote) + '<br>' : ''}Hero League · <a href="https://hero-league.de" style="color:#8aa39d;text-decoration:none;">hero-league.de</a></p>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

// Großer, gut lesbarer Code-Block für Bestätigungs-Mails.
export function codeBlock(code: string, accent = BRAND): string {
  return `<div style="font-family:'Courier New',monospace;font-size:36px;font-weight:800;letter-spacing:10px;color:${accent};background:#f1f6f5;border:1px solid #e2ecea;border-radius:14px;padding:18px;text-align:center;">${escapeHtml(code)}</div>`;
}

// Farbiger Button (als Tabelle, damit alle Clients ihn zeigen).
export function mailButton(label: string, href: string, accent = BRAND): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:6px 0;"><tr><td style="border-radius:12px;background:${accent};">
    <a href="${escapeHtml(href)}" style="display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:800;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:12px;">${escapeHtml(label)}</a>
  </td></tr></table>`;
}

// Kleiner Convenience-Wrapper, damit die Feature-Module nur Betreff + Inhalt
// bauen müssen.
export async function sendBrandedMail(opts: {
  to: string;
  subject: string;
  from: string;
  layout: Parameters<typeof mailLayout>[0];
  text: string;
}): Promise<void> {
  await sendMail({ to: opts.to, subject: opts.subject, from: opts.from, html: mailLayout(opts.layout), text: opts.text });
}
