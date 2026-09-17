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
const RESERVE_MIN = 15; // Reservierung gilt X Minuten bis zur Bestätigung

// Ein buchbares Ticket-Event. Es können MEHRERE gleichzeitig offen sein
// (z.B. Opening Night + ein Testspieltag + ein normaler Spieltag). Die Tickets
// selbst sind in der Datenbank schon immer über `event_key` getrennt.
interface TicketConfig {
  id: string; // stabile ID des Eintrags (nur intern/Admin)
  open: boolean;
  eventKey: string; // stabiler Schlüssel dieses Events (z.B. 'opening-night-2026')
  title: string;
  dateLabel: string;
  locationLabel: string;
  capacity: number;
  maxPerEmail: number;
  note: string;
  donationUrl: string; // Stripe Payment Link oder PayPal.Me (optional)
  accent: string; // Farbwelt für Seite und Mails (z.B. Gold für Opening Night)
  accentDark: string;
  consentText: string; // Einwilligungstext, im Backend editierbar
  // Beginn der Veranstaltung ('YYYY-MM-DDTHH:mm'). Ab diesem Zeitpunkt werden
  // KEINE Tickets mehr ausgegeben – auch wenn `open` noch auf true steht.
  startsAt: string;
}
interface TicketArchive {
  events: TicketConfig[];
}

const DEFAULT_ACCENT = '#E9C46A'; // Gold – Opening Night
const DEFAULT_ACCENT_DARK = '#6b4d12';
const DEFAULT_CONSENT =
  'Ich bin damit einverstanden, dass meine hier angegebenen Daten (Name und E-Mail-Adresse) ' +
  'zur Organisation und Durchführung dieser Veranstaltung gespeichert und verarbeitet werden. ' +
  'Die Einwilligung kann jederzeit formlos per E-Mail widerrufen werden. Weitere Informationen ' +
  'in unserer Datenschutzerklärung.';

const baseEvent = (): TicketConfig => ({
  id: randomUUID(),
  open: false,
  eventKey: '',
  title: '',
  dateLabel: '',
  locationLabel: '',
  capacity: 50,
  maxPerEmail: 4,
  note: '',
  donationUrl: '',
  accent: DEFAULT_ACCENT,
  accentDark: DEFAULT_ACCENT_DARK,
  consentText: DEFAULT_CONSENT,
  startsAt: '',
});

const DEFAULT_ARCHIVE: TicketArchive = {
  events: [
    {
      ...baseEvent(),
      id: 'opening-night',
      open: false,
      eventKey: 'opening-night-2026',
      title: 'Hero League Opening Night',
      dateLabel: 'Datum im Backend eintragen',
      capacity: 50,
      note: 'Kostenlose Zuschauer-Tickets – streng begrenzt.',
    },
  ],
};

// Gespeichert wird `{ events: [...] }`. Ältere Installationen haben dort noch
// EINE Konfiguration liegen – die wird beim Lesen automatisch übernommen, damit
// bestehende Testspieltag-Anmeldungen nicht verloren gehen.
async function getArchive(): Promise<TicketArchive> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'event_tickets'`;
    const v = rows[0]?.value as Record<string, unknown> | undefined;
    if (!v) return DEFAULT_ARCHIVE;
    if (Array.isArray(v.events)) {
      const events = (v.events as Partial<TicketConfig>[])
        .filter((e) => e && typeof e.eventKey === 'string' && e.eventKey)
        .map((e) => ({ ...baseEvent(), ...e }) as TicketConfig);
      return events.length ? { events } : DEFAULT_ARCHIVE;
    }
    // Alt-Format: eine einzelne Konfiguration -> in die Liste heben.
    if (typeof v.eventKey === 'string' && v.eventKey) {
      return { events: [{ ...baseEvent(), id: 'legacy', accent: '#E6238E', accentDark: '#7a0f49', ...(v as Partial<TicketConfig>) } as TicketConfig] };
    }
    return DEFAULT_ARCHIVE;
  } catch {
    return DEFAULT_ARCHIVE;
  }
}

// Ist die Anmeldung gerade wirklich offen? Der Schalter allein reicht nicht:
// ab Beginn der Veranstaltung gibt es keine Tickets mehr.
function saleOpen(cfg: TicketConfig): boolean {
  if (!cfg.open) return false;
  if (!cfg.startsAt) return true;
  const start = new Date(cfg.startsAt).getTime();
  return !Number.isFinite(start) || Date.now() < start;
}

// Ein Event anhand seines Schlüssels holen. BEWUSST ohne Rückfall-Ebene:
// früher wurde ohne Schlüssel „die erste offene Veranstaltung" genommen – damit
// landete man vom Testspieltag aus versehentlich bei der Opening Night.
async function getEvent(key: string): Promise<TicketConfig | null> {
  if (!key) return null;
  const { events } = await getArchive();
  return events.find((e) => e.eventKey === key) ?? null;
}

const purposeFor = (cfg: TicketConfig) => PURPOSE_PREFIX + cfg.eventKey;

const clamp = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// URL tolerant normalisieren: leer bleibt leer; fehlt das Schema, wird https://
// ergänzt (damit „paypal.me/…" oder „www…." nicht stillschweigend verworfen wird).
const normUrl = (s: string): string => {
  const t = s.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : 'https://' + t.replace(/^\/+/, '');
};
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
async function publicConfig(req: VercelRequest, res: VercelResponse) {
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || '';
  const pub = async (cfg: TicketConfig) => {
    const used = await confirmedSeats(cfg.eventKey);
    return {
      eventKey: cfg.eventKey, open: saleOpen(cfg), title: cfg.title, dateLabel: cfg.dateLabel,
      locationLabel: cfg.locationLabel, capacity: cfg.capacity,
      remaining: Math.max(0, cfg.capacity - used), maxPerEmail: cfg.maxPerEmail,
      note: cfg.note, hasDonation: !!cfg.donationUrl,
      accent: cfg.accent, accentDark: cfg.accentDark, consentText: cfg.consentText,
      startsAt: cfg.startsAt,
      // Unterscheidung für die Anzeige: bewusst geschlossen vs. Anstoß vorbei.
      started: !!cfg.startsAt && Number.isFinite(new Date(cfg.startsAt).getTime()) && Date.now() >= new Date(cfg.startsAt).getTime(),
    };
  };

  const key = String(req.query.key ?? '');
  if (key) {
    const cfg = await getEvent(key);
    if (!cfg) return res.status(404).json({ error: 'Unbekannte Veranstaltung.' });
    return res.json({ ...(await pub(cfg)), turnstileSiteKey });
  }

  // Ohne Schlüssel NUR die Liste der offenen Veranstaltungen. Es wird bewusst
  // KEINE davon vorausgewählt – die Seite zeigt dann eine Auswahl. Früher wurde
  // hier die erste offene flach mitgeliefert; genau dadurch landete man vom
  // Testspieltag aus bei der Opening Night.
  const { events } = await getArchive();
  const list = await Promise.all(events.filter(saleOpen).map(pub));
  return res.json({ events: list, turnstileSiteKey });
}

async function requestCode(req: VercelRequest, res: VercelResponse) {
  const b = req.body ?? {};
  const cfg = await getEvent(clamp(b.eventKey, 60));
  if (!cfg) return res.status(404).json({ error: 'Unbekannte Veranstaltung.' });
  if (!saleOpen(cfg)) {
    return res.status(403).json({
      error: cfg.open ? 'Die Veranstaltung hat begonnen – es gibt keine Tickets mehr.' : 'Die Ticket-Anmeldung ist derzeit geschlossen.',
    });
  }
  if (typeof b.website === 'string' && b.website.trim() !== '') return res.json({ ok: true }); // Honeypot
  const name = clamp(b.name, 80);
  if (!name) return badRequest(res, 'Bitte deinen Namen angeben.');
  if (!isEmail(b.email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (isDisposableEmail(b.email)) return badRequest(res, 'Bitte eine echte E-Mail-Adresse verwenden (keine Wegwerf-Adresse).');
  // Einwilligung ist Pflicht. Gespeichert wird WANN und WELCHEM Text zugestimmt
  // wurde – nur so lässt sich die Zustimmung später auch belegen.
  if (b.consent !== true) return badRequest(res, 'Bitte die Einwilligung zur Datenspeicherung bestätigen.');
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
  await sql`UPDATE event_tickets SET consent_at = now(), consent_text = ${cfg.consentText}
    WHERE event_key = ${cfg.eventKey} AND email = ${email}`;

  const result = await issueCode(purposeFor(cfg), email, async (code) => {
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `Dein Ticket-Code: ${code}`,
      layout: {
        preheader: 'Bestätige deine E-Mail, um deine Tickets zu sichern.',
        heading: 'E-Mail bestätigen', accent: cfg.accent, accentDark: cfg.accentDark,
        intro: `Fast fertig! Gib diesen Code ein, um ${quantity} Ticket${quantity === 1 ? '' : 's'} für „${cfg.title}" (${cfg.dateLabel}) zu sichern:`,
        bodyHtml: codeBlock(code, cfg.accent),
        footnote: `Der Code ist 15 Minuten gültig. Deine Reservierung läuft nach ${RESERVE_MIN} Minuten ab.`,
      },
      text: `Dein Ticket-Bestätigungs-Code: ${code}\nGültig für 15 Minuten.`,
    });
  });
  if (!result.ok) return badRequest(res, result.error || "Fehler.");
  return res.json(result.devCode ? { ok: true, devCode: result.devCode } : { ok: true });
}

async function confirm(req: VercelRequest, res: VercelResponse) {
  const b = req.body ?? {};
  const cfg = await getEvent(clamp(b.eventKey, 60));
  if (!cfg) return res.status(404).json({ error: 'Unbekannte Veranstaltung.' });
  if (!saleOpen(cfg)) return res.status(403).json({ error: 'Die Veranstaltung hat begonnen – es gibt keine Tickets mehr.' });
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
          ${mailButton('Freiwillig unterstützen', cfg.donationUrl, cfg.accent)}
        </div>`
      : '';
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `🎟️ Ticket bestätigt – ${cfg.title}`,
      layout: {
        preheader: `Dein Ticket-Code: ${code}`,
        heading: 'Dein Ticket ist bestätigt! 🎟️', accent: cfg.accent, accentDark: cfg.accentDark,
        intro: `Wir sehen uns beim „${cfg.title}" am ${cfg.dateLabel}${cfg.locationLabel ? ` · ${cfg.locationLabel}` : ''}. Zeig diesen Code am Einlass:`,
        bodyHtml: `${codeBlock(code, cfg.accent)}
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
async function adminList(req: VercelRequest, res: VercelResponse) {
  const { events } = await getArchive();
  const key = String(req.query.key ?? '') || events.find((e) => e.open)?.eventKey || events[0]?.eventKey || '';
  const cfg = events.find((e) => e.eventKey === key) ?? null;

  // Übersicht aller Events (für die Auswahl im Backend) inkl. verkaufter Plätze.
  const overview = await Promise.all(
    events.map(async (e) => ({
      id: e.id, eventKey: e.eventKey, title: e.title, dateLabel: e.dateLabel,
      open: e.open, capacity: e.capacity, soldSeats: await confirmedSeats(e.eventKey),
    }))
  );

  if (!cfg) return res.json({ events, overview, config: null, rows: [], capacity: 0, soldSeats: 0, confirmedCount: 0, remaining: 0 });

  const rows = await sql`SELECT id, email, name, quantity, status, code, checked_in AS "checkedIn",
      created_at AS "createdAt", verified_at AS "verifiedAt",
      consent_at AS "consentAt", consent_text AS "consentText"
    FROM event_tickets WHERE event_key = ${cfg.eventKey} ORDER BY (status='confirmed') DESC, created_at DESC`;
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const soldSeats = confirmed.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  return res.json({
    events, overview, config: cfg, rows, capacity: cfg.capacity,
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

// Speichert die GESAMTE Event-Liste. Der Event-Schlüssel darf nur gesetzt
// werden, solange es keinen gibt – sonst würden bestehende Anmeldungen
// unauffindbar, weil die Tickets in der Datenbank daran hängen.
async function adminSaveConfig(req: VercelRequest, res: VercelResponse) {
  const body = req.body ?? {};
  const incoming: unknown = Array.isArray(body.events) ? body.events : body.config ? [body.config] : null;
  if (!incoming || !Array.isArray(incoming)) return badRequest(res, 'Konfiguration fehlt.');

  const prev = await getArchive();
  const seen = new Set<string>();
  const events: TicketConfig[] = [];
  for (const raw of incoming as Partial<TicketConfig>[]) {
    if (!raw || typeof raw !== 'object') continue;
    const old = prev.events.find((e) => e.id === raw.id);
    const eventKey = (old?.eventKey || clamp(raw.eventKey, 60)).trim();
    if (!eventKey || seen.has(eventKey)) continue; // ohne Schlüssel / doppelt: überspringen
    seen.add(eventKey);
    events.push({
      id: clamp(raw.id, 60) || randomUUID(),
      open: raw.open === true,
      eventKey,
      title: clamp(raw.title, 80) || 'Hero League Event',
      dateLabel: clamp(raw.dateLabel, 80),
      locationLabel: clamp(raw.locationLabel, 120),
      capacity: clampInt(raw.capacity, 1, 100000) ?? 50,
      maxPerEmail: clampInt(raw.maxPerEmail, 1, 20) ?? 4,
      note: clamp(raw.note, 400),
      donationUrl: normUrl(clamp(raw.donationUrl, 400)),
      accent: clamp(raw.accent, 20) || DEFAULT_ACCENT,
      accentDark: clamp(raw.accentDark, 20) || DEFAULT_ACCENT_DARK,
      consentText: clamp(raw.consentText, 2000) || DEFAULT_CONSENT,
      startsAt: clamp(raw.startsAt, 40),
    });
  }
  const archive: TicketArchive = { events };
  await sql`INSERT INTO settings (key, value) VALUES ('event_tickets', ${JSON.stringify(archive)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json({ ok: true, events });
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
