// Zuschauer-Tickets für den Testspieltag (öffentlich, kostenlos, begrenzt).
// Fair & bot-sicher: E-Mail-Bestätigung (Code), 1 E-Mail = 1 Anmeldung (max. N
// Personen), harte Gesamt-Obergrenze mit kurzlebiger Reservierung, Rate-Limit,
// Wegwerf-Mail-Sperre, optional Turnstile. Bezahlen ist bewusst getrennt:
// optionaler Spendenlink in der Bestätigungs-Mail (kostenlos bleibt kostenlos).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID, randomInt } from 'node:crypto';
import { sql } from './db.js';
import { getSession } from './auth.js';
import { badRequest } from './validate.js';
import {
  checkCode, clientIp, codeBlock, isDisposableEmail, isEmail, issueCode, mailButton,
  normEmail, sendBrandedMail, tooManyAttempts, verifyTurnstile,
} from './publicforms.js';

const PURPOSE_PREFIX = 'event-ticket:';
const FROM = 'Hero League – Tickets <tickets@hero-league.de>';
const ACCENT = '#E6238E'; // Magenta/Gold-Welt des Testspiel-Events
const ACCENT_DARK = '#7a0f49';
const RESERVE_MIN = 15; // Reservierung gilt X Minuten bis zur Bestätigung

interface TicketConfig {
  open: boolean;
  eventKey: string; // stabiler Schlüssel dieses Events (z.B. 'testspiel-2025-09-13')
  title: string;
  dateLabel: string;
  locationLabel: string;
  capacity: number;
  maxPerEmail: number;
  note: string;
  donationUrl: string; // Stripe Payment Link oder PayPal.Me (optional)
}
const DEFAULT_CONFIG: TicketConfig = {
  open: true,
  eventKey: 'testspiel-2025-09-13',
  title: 'Hero League Testspieltag',
  dateLabel: 'Sonntag, 13. September',
  locationLabel: '',
  capacity: 40,
  maxPerEmail: 4,
  note: 'Kostenlose Zuschauer-Tickets – begrenzt. Bring gute Laune mit!',
  donationUrl: '',
};

async function getConfig(): Promise<TicketConfig> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'event_tickets'`;
    const v = rows[0]?.value as Partial<TicketConfig> | undefined;
    return { ...DEFAULT_CONFIG, ...(v || {}) };
  } catch {
    return DEFAULT_CONFIG;
  }
}
const purposeFor = (cfg: TicketConfig) => PURPOSE_PREFIX + cfg.eventKey;

const clamp = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

// Nur BESTÄTIGTE Plätze. Das ist die harte Kapazitätsgrenze: Reservierungen
// blockieren NIEMANDEN (kein „Plätze-blockier"-Missbrauch), es zählt „wer zuerst
// bestätigt". Optional eine E-Mail ausschließen (die eigene, die gerade bestätigt).
async function confirmedSeats(eventKey: string, exceptEmail?: string): Promise<number> {
  const rows = exceptEmail
    ? await sql`SELECT COALESCE(SUM(quantity),0)::int AS n FROM event_tickets
        WHERE event_key = ${eventKey} AND email <> ${exceptEmail} AND status = 'confirmed'`
    : await sql`SELECT COALESCE(SUM(quantity),0)::int AS n FROM event_tickets
        WHERE event_key = ${eventKey} AND status = 'confirmed'`;
  return Number(rows[0]?.n || 0);
}
const shortCode = (): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // ohne verwechselbare Zeichen
  let s = '';
  for (let i = 0; i < 6; i++) s += alphabet[randomInt(0, alphabet.length)];
  return `HL-${s}`;
};

// --- Öffentliche Aktionen ---------------------------------------------------
async function publicConfig(_req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  const used = await confirmedSeats(cfg.eventKey);
  return res.json({
    open: cfg.open, title: cfg.title, dateLabel: cfg.dateLabel, locationLabel: cfg.locationLabel,
    capacity: cfg.capacity, remaining: Math.max(0, cfg.capacity - used), maxPerEmail: cfg.maxPerEmail,
    note: cfg.note, hasDonation: !!cfg.donationUrl,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
  });
}

async function requestCode(req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'Die Ticket-Anmeldung ist derzeit geschlossen.' });
  const b = req.body ?? {};
  if (typeof b.website === 'string' && b.website.trim() !== '') return res.json({ ok: true }); // Honeypot
  const name = clamp(b.name, 80);
  if (!name) return badRequest(res, 'Bitte deinen Namen angeben.');
  if (!isEmail(b.email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (isDisposableEmail(b.email)) return badRequest(res, 'Bitte eine echte E-Mail-Adresse verwenden (keine Wegwerf-Adresse).');
  const quantity = clampInt(b.quantity, 1, cfg.maxPerEmail);
  if (!quantity) return badRequest(res, `Bitte 1 bis ${cfg.maxPerEmail} Personen wählen.`);
  const ip = clientIp(req);
  if (!(await verifyTurnstile(b.turnstileToken, ip))) return badRequest(res, 'Bot-Prüfung fehlgeschlagen. Bitte Seite neu laden.');
  if (await tooManyAttempts('ticket-code', ip, 8, 15)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });

  const email = normEmail(b.email);
  // Schon bestätigt? Dann keine zweite Anmeldung.
  const existing = await sql`SELECT status FROM event_tickets WHERE event_key = ${cfg.eventKey} AND email = ${email} LIMIT 1`;
  if (existing[0]?.status === 'confirmed') {
    return res.status(409).json({ error: 'Für diese E-Mail besteht bereits ein bestätigtes Ticket.' });
  }
  // Kapazität (weich) prüfen – gegen bestätigte Plätze, damit man keinen
  // aussichtslosen Flow startet. Hart abgesichert wird erst beim Bestätigen.
  const used = await confirmedSeats(cfg.eventKey, email);
  if (used + quantity > cfg.capacity) {
    const left = Math.max(0, cfg.capacity - used);
    return res.status(409).json({ error: left > 0 ? `Nur noch ${left} Platz${left === 1 ? '' : 'e'} frei.` : 'Leider ausverkauft.' });
  }

  // Reservierung anlegen/aktualisieren (gilt RESERVE_MIN Minuten).
  const id = randomUUID();
  await sql`INSERT INTO event_tickets
      (id, event_key, email, email_verified, status, name, quantity, ip, reserved_until, created_at, updated_at)
    VALUES (${id}, ${cfg.eventKey}, ${email}, false, 'reserved', ${name}, ${quantity}, ${ip},
      now() + ${`${RESERVE_MIN} minutes`}::interval, now(), now())
    ON CONFLICT (event_key, email) DO UPDATE SET
      status = 'reserved', name = EXCLUDED.name, quantity = EXCLUDED.quantity,
      reserved_until = now() + ${`${RESERVE_MIN} minutes`}::interval, updated_at = now()`;

  const result = await issueCode(purposeFor(cfg), email, async (code) => {
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `Dein Ticket-Code: ${code}`,
      layout: {
        preheader: 'Bestätige deine E-Mail, um deine Tickets zu sichern.',
        heading: 'E-Mail bestätigen', accent: ACCENT, accentDark: ACCENT_DARK,
        intro: `Fast fertig! Gib diesen Code ein, um ${quantity} Ticket${quantity === 1 ? '' : 's'} für „${cfg.title}" (${cfg.dateLabel}) zu sichern:`,
        bodyHtml: codeBlock(code, ACCENT),
        footnote: `Der Code ist 15 Minuten gültig. Deine Reservierung läuft nach ${RESERVE_MIN} Minuten ab.`,
      },
      text: `Dein Ticket-Bestätigungs-Code: ${code}\nGültig für 15 Minuten.`,
    });
  });
  if (!result.ok) return badRequest(res, result.error || "Fehler.");
  return res.json(result.devCode ? { ok: true, devCode: result.devCode } : { ok: true });
}

async function confirm(req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  const b = req.body ?? {};
  if (!isEmail(b.email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  const email = normEmail(b.email);
  const rows = await sql`SELECT id, status, quantity, code FROM event_tickets WHERE event_key = ${cfg.eventKey} AND email = ${email} LIMIT 1`;
  const row = rows[0] as { id: string; status: string; quantity: number; code: string | null } | undefined;
  if (!row) return badRequest(res, 'Keine Reservierung gefunden. Bitte starte die Anmeldung neu.');
  if (row.status === 'confirmed') {
    return res.json({ ok: true, code: row.code, quantity: row.quantity, alreadyConfirmed: true });
  }

  const check = await checkCode(purposeFor(cfg), email, b.code);
  if (!check.ok) return badRequest(res, check.error || "Code ungültig.");

  // Harte Kapazitätsgrenze ATOMAR: pro Event einen Advisory-Lock halten und die
  // Bestätigung nur schreiben, wenn (bestätigte Plätze ohne uns) + unsere Menge
  // ≤ Kapazität. So können auch gleichzeitige Bestätigungen NIE überbuchen.
  const code = shortCode();
  const tx = await sql.transaction((txn) => [
    txn`SELECT pg_advisory_xact_lock(hashtext(${cfg.eventKey}))`,
    txn`UPDATE event_tickets
        SET status = 'confirmed', email_verified = true, code = ${code}, verified_at = now(), updated_at = now()
        WHERE id = ${row.id} AND status <> 'confirmed'
          AND (SELECT COALESCE(SUM(quantity), 0) FROM event_tickets
               WHERE event_key = ${cfg.eventKey} AND status = 'confirmed' AND id <> ${row.id}) + ${row.quantity} <= ${cfg.capacity}
        RETURNING id`,
  ]);
  const updated = Array.isArray(tx?.[1]) ? tx[1] : [];
  if (updated.length === 0) {
    return res.status(409).json({ error: 'Leider sind die Plätze inzwischen vergeben.' });
  }

  try {
    const donationBlock = cfg.donationUrl
      ? `<div style="margin-top:22px;padding-top:20px;border-top:1px solid #eef2f1;">
          <p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:0 0 12px;">
            Die Tickets sind <strong>kostenlos</strong>. Wenn du uns unterstützen magst, freuen wir uns über einen freiwilligen Beitrag – jeder Euro hilft der Liga. 💚</p>
          ${mailButton('Freiwillig unterstützen', cfg.donationUrl, ACCENT)}
        </div>`
      : '';
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `🎟️ Ticket bestätigt – ${cfg.title}`,
      layout: {
        preheader: `Dein Ticket-Code: ${code}`,
        heading: 'Dein Ticket ist bestätigt! 🎟️', accent: ACCENT, accentDark: ACCENT_DARK,
        intro: `Wir sehen uns beim „${cfg.title}" am ${cfg.dateLabel}${cfg.locationLabel ? ` · ${cfg.locationLabel}` : ''}. Zeig diesen Code am Einlass:`,
        bodyHtml: `${codeBlock(code, ACCENT)}
          <p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:16px 0 0;text-align:center;">
            Gültig für <strong>${row.quantity} Person${row.quantity === 1 ? '' : 'en'}</strong></p>`,
        footnote: 'Bitte diese E-Mail am Einlass bereithalten.',
      },
      text: `Ticket bestätigt für „${cfg.title}" (${cfg.dateLabel}).\nCode: ${code}\nGültig für ${row.quantity} Person(en).${cfg.donationUrl ? `\n\nFreiwillig unterstützen: ${cfg.donationUrl}` : ''}`,
    });
  } catch { /* Mail optional */ }

  return res.json({ ok: true, code, quantity: row.quantity, donationUrl: cfg.donationUrl || '' });
}

// --- Admin ------------------------------------------------------------------
async function requireSuper(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const session = await getSession(req);
  if (!session) { res.status(401).json({ error: 'Nicht angemeldet' }); return false; }
  if (session.role !== 'superadmin') { res.status(403).json({ error: 'Keine Berechtigung.' }); return false; }
  return true;
}
async function adminList(_req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  const rows = await sql`SELECT id, email, name, quantity, status, code, checked_in AS "checkedIn",
      created_at AS "createdAt", verified_at AS "verifiedAt"
    FROM event_tickets WHERE event_key = ${cfg.eventKey} ORDER BY (status='confirmed') DESC, created_at DESC`;
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const soldSeats = confirmed.reduce((s, r) => s + Number(r.quantity || 0), 0);
  return res.json({
    config: cfg, rows, capacity: cfg.capacity,
    soldSeats, confirmedCount: confirmed.length, remaining: Math.max(0, cfg.capacity - soldSeats),
  });
}
async function adminCheckin(req: VercelRequest, res: VercelResponse) {
  const id = String(req.body?.id ?? '');
  const checkedIn = req.body?.checkedIn === true;
  if (!id) return badRequest(res, 'ID fehlt.');
  await sql`UPDATE event_tickets SET checked_in = ${checkedIn}, updated_at = now() WHERE id = ${id}`;
  return res.json({ ok: true });
}
async function adminDelete(req: VercelRequest, res: VercelResponse) {
  const id = String(req.body?.id ?? '');
  if (!id) return badRequest(res, 'ID fehlt.');
  await sql`DELETE FROM event_tickets WHERE id = ${id}`;
  return res.json({ ok: true });
}
async function adminSaveConfig(req: VercelRequest, res: VercelResponse) {
  const c = req.body?.config;
  if (!c || typeof c !== 'object') return badRequest(res, 'Konfiguration fehlt.');
  const prev = await getConfig();
  const cfg: TicketConfig = {
    open: c.open !== false,
    eventKey: clamp(c.eventKey, 60) || prev.eventKey,
    title: clamp(c.title, 80) || DEFAULT_CONFIG.title,
    dateLabel: clamp(c.dateLabel, 80) || DEFAULT_CONFIG.dateLabel,
    locationLabel: clamp(c.locationLabel, 120),
    capacity: clampInt(c.capacity, 1, 100000) ?? DEFAULT_CONFIG.capacity,
    maxPerEmail: clampInt(c.maxPerEmail, 1, 20) ?? DEFAULT_CONFIG.maxPerEmail,
    note: clamp(c.note, 400),
    donationUrl: /^https?:\/\//i.test(clamp(c.donationUrl, 400)) ? clamp(c.donationUrl, 400) : '',
  };
  await sql`INSERT INTO settings (key, value) VALUES ('event_tickets', ${JSON.stringify(cfg)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json({ ok: true, config: cfg });
}

export async function eventTickets(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query.action ?? '');
  if (req.method === 'GET' && action === 'config') return publicConfig(req, res);
  if (req.method === 'POST' && action === 'request-code') return requestCode(req, res);
  if (req.method === 'POST' && action === 'confirm') return confirm(req, res);

  if (action.startsWith('admin')) {
    if (!(await requireSuper(req, res))) return;
    if (req.method === 'GET' && action === 'admin-list') return adminList(req, res);
    if (req.method === 'POST' && action === 'admin-checkin') return adminCheckin(req, res);
    if (req.method === 'POST' && action === 'admin-delete') return adminDelete(req, res);
    if (req.method === 'POST' && action === 'admin-config') return adminSaveConfig(req, res);
  }
  return res.status(400).json({ error: 'Unbekannte Aktion' });
}
