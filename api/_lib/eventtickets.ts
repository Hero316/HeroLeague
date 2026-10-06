// Zuschauer-Tickets für den Testspieltag (öffentlich, kostenlos, begrenzt).
// Fair & bot-sicher: E-Mail-Bestätigung (Code), 1 E-Mail = 1 Anmeldung (max. N
// Personen), harte Gesamt-Obergrenze mit kurzlebiger Reservierung, Rate-Limit,
// Wegwerf-Mail-Sperre, optional Turnstile. Bezahlen ist bewusst getrennt:
// optionaler Spendenlink in der Bestätigungs-Mail (kostenlos bleibt kostenlos).
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID, randomInt } from 'node:crypto';
import { sql, getTeams } from './db.js';
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
  // Spenden-Pop-up direkt nach der Ticket-Bestätigung (nur mit donationUrl).
  donationPopup: boolean;
  donationTitle: string;
  donationText: string;
  accent: string; // Farbwelt für Seite und Mails (z.B. Gold für Opening Night)
  accentDark: string;
  consentText: string; // Einwilligungstext, im Backend editierbar
  // Beginn der Veranstaltung ('YYYY-MM-DDTHH:mm'). Ab diesem Zeitpunkt werden
  // KEINE Tickets mehr ausgegeben – auch wenn `open` noch auf true steht.
  startsAt: string;
  // Selbst-Check-in am Eingang (QR-Plakat → /einchecken). Nur wenn an, können
  // Gäste sich mit E-Mail oder Ticket-Code selbst als „da" melden.
  selfCheckin: boolean;
  // Verknüpfung mit einem Liga-Spieltag (Datum/Zeit/Teams kommen aus dem Spielplan).
  link: { seasonId: string; matchday: number } | null;
  // Blockweise Tickets: ab 2 Blöcken wählt der Gast Block 1, Block 2 … oder
  // (wenn allowFull) „Ganzer Abend" – das belegt in JEDEM Block einen Platz.
  blocks: TicketBlock[];
  allowFull: boolean;
}
interface TicketBlock {
  id: string; // 'b1', 'b2', …
  label: string;
  from: string; // 'HH:MM'
  to: string; // 'HH:MM'
  capacity: number;
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

const DEFAULT_DONATION_TITLE = 'Kurze Bitte 💚';
const DEFAULT_DONATION_TEXT =
  'Schön, dass du dabei bist! 🙌\n\n' +
  'Alles, was du hier siehst – Kameras, Livestream, Technik, Website – wird komplett ehrenamtlich ' +
  'getragen und finanziert.\n\n' +
  'Wenn du das Projekt feierst, freuen wir uns mega über eine kleine Spende – damit wir weitermachen ' +
  'und die Hero League immer besser machen können. 💚';
// Frühere (zu lange) Standardtexte: wurden sie unverändert gespeichert, gilt
// automatisch der neue Standard. Eigene Texte bleiben unangetastet.
const OLD_DONATION_TITLES = ['Kurze, ehrliche Bitte 💚'];
const OLD_DONATION_TEXTS = [
  'Schön, dass du dabei bist! 🙌\n\n' +
    'Kameras, Livestream, Technik, Website – das alles stemmen Ehrenamtliche, oft mit privatem ' +
    'Equipment oder aus eigener Tasche vorgestreckt.\n\n' +
    'Mit einer kleinen Spende hilfst du uns enorm – und das Team geht nach dem Spieltag zusammen essen. 💚',
  'Schön, dass du dabei bist! 🙌\n\n' +
    'Ganz ehrlich: Alles, was du vor Ort siehst – Kameras, Livestream, Technik, Website und Statistiken – ' +
    'stemmen Ehrenamtliche in ihrer Freizeit. Vieles davon ist privates Equipment, einiges hat die Hero League ' +
    'inzwischen selbst angeschafft – und dafür sind wir quasi privat in Vorleistung gegangen.\n\n' +
    'Nach jedem Spieltag geht das ganze Team als kleines Dankeschön zusammen essen.\n\n' +
    'Wenn dir die Hero League gefällt, freuen wir uns riesig über eine kleine Spende – egal wie viel. ' +
    'Dein Ticket bleibt natürlich kostenlos. 💚',
];
const norm = (t: unknown) => (typeof t === 'string' ? t.replace(/\r\n/g, '\n').trim() : '');
function upgradeDonation(e: TicketConfig): TicketConfig {
  return {
    ...e,
    donationTitle: OLD_DONATION_TITLES.includes(norm(e.donationTitle)) ? DEFAULT_DONATION_TITLE : e.donationTitle,
    donationText: OLD_DONATION_TEXTS.map(norm).includes(norm(e.donationText)) ? DEFAULT_DONATION_TEXT : e.donationText,
  };
}

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
  donationPopup: true,
  donationTitle: DEFAULT_DONATION_TITLE,
  donationText: DEFAULT_DONATION_TEXT,
  accent: DEFAULT_ACCENT,
  accentDark: DEFAULT_ACCENT_DARK,
  consentText: DEFAULT_CONSENT,
  startsAt: '',
  selfCheckin: false,
  link: null,
  blocks: [],
  allowFull: true,
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
        .map((e) => upgradeDonation({ ...baseEvent(), ...e } as TicketConfig));
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

// --- Blöcke -----------------------------------------------------------------
const blockMode = (cfg: TicketConfig) => Array.isArray(cfg.blocks) && cfg.blocks.length >= 2;
const toMin = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};
const fmtMin = (n: number) => `${String(Math.floor(n / 60) % 24).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
// Welche Blöcke belegt eine Wahl? 'all' = alle, sonst genau der eine.
const blocksFor = (cfg: TicketConfig, choice: string): TicketBlock[] =>
  choice === 'all' ? cfg.blocks : cfg.blocks.filter((b) => b.id === choice);
const blockLabel = (cfg: TicketConfig, choice: string): string => {
  if (!blockMode(cfg) || !choice) return '';
  if (choice === 'all') return `Ganzer Abend (${cfg.blocks[0].from}–${cfg.blocks[cfg.blocks.length - 1].to} Uhr)`;
  const b = cfg.blocks.find((x) => x.id === choice);
  return b ? `${b.label} (${b.from}–${b.to} Uhr)` : '';
};
// Belegte Plätze je Block: eigene Block-Tickets + „Ganzer Abend"-Tickets.
async function blockUsage(cfg: TicketConfig, exceptEmail?: string): Promise<Record<string, number>> {
  const rows = (exceptEmail
    ? await sql`SELECT block, COALESCE(SUM(quantity),0)::int AS n FROM event_tickets
        WHERE event_key = ${cfg.eventKey} AND status = 'confirmed' AND email <> ${exceptEmail} GROUP BY block`
    : await sql`SELECT block, COALESCE(SUM(quantity),0)::int AS n FROM event_tickets
        WHERE event_key = ${cfg.eventKey} AND status = 'confirmed' GROUP BY block`) as { block: string; n: number }[];
  const by = new Map(rows.map((r) => [r.block, Number(r.n)]));
  const all = by.get('all') ?? 0;
  const out: Record<string, number> = {};
  for (const b of cfg.blocks) out[b.id] = (by.get(b.id) ?? 0) + all;
  return out;
}
// Spiele des verknüpften Spieltags (Zeit + Teams), live aus dem Spielplan.
async function linkedMatches(cfg: TicketConfig): Promise<{ time: string; date: string; home: string; away: string }[]> {
  if (!cfg.link) return [];
  return (await sql`SELECT time, date, home_team_id AS home, away_team_id AS away FROM matches
    WHERE season_id = ${cfg.link.seasonId} AND matchday = ${cfg.link.matchday} ORDER BY date, time`) as {
    time: string; date: string; home: string; away: string;
  }[];
}
// Teams je Block (Anstoß im Zeitfenster [from, to)).
async function blockTeams(cfg: TicketConfig): Promise<Record<string, { id: string; name: string; shortName: string; logoUrl: string; color: string }[]>> {
  const out: Record<string, { id: string; name: string; shortName: string; logoUrl: string; color: string }[]> = {};
  if (!blockMode(cfg) || !cfg.link) return out;
  const [games, teams] = await Promise.all([linkedMatches(cfg), getTeams()]);
  for (const b of cfg.blocks) {
    const lo = toMin(b.from);
    const hi = toMin(b.to);
    const ids: string[] = [];
    for (const g of games) {
      const t = toMin(g.time);
      if (!Number.isFinite(t) || t < lo || t >= hi) continue;
      for (const id of [g.home, g.away]) if (!ids.includes(id)) ids.push(id);
    }
    out[b.id] = ids
      .map((id) => teams.find((t) => t.id === id))
      .filter((t): t is NonNullable<typeof t> => !!t)
      .map((t) => ({ id: t.id, name: t.name, shortName: t.shortName || '', logoUrl: t.logoUrl || '', color: t.logoColor || '#22DFC9' }));
  }
  return out;
}
// Blöcke aus dem Spielplan vorschlagen: an der größten Lücke teilen, sonst in
// der Mitte. Ende = letzter Anstoß + 8 min Spiel + 3 min Pause.
function suggestBlocks(times: string[]): { from: string; to: string }[] {
  const mins = [...new Set(times.map(toMin).filter(Number.isFinite))].sort((a, b) => a - b);
  if (mins.length === 0) return [];
  const end = mins[mins.length - 1] + 11;
  if (mins.length < 2) return [{ from: fmtMin(mins[0]), to: fmtMin(end) }];
  const gaps = mins.slice(1).map((m, i) => m - mins[i]);
  const sorted = [...gaps].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const maxGap = Math.max(...gaps);
  const splitIdx = maxGap >= median * 1.8 ? gaps.indexOf(maxGap) + 1 : Math.ceil(mins.length / 2);
  return [
    { from: fmtMin(mins[0]), to: fmtMin(mins[splitIdx]) },
    { from: fmtMin(mins[splitIdx]), to: fmtMin(end) },
  ];
}
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

// Spenden-Angaben für die Erfolgsseite (Link + optionales Pop-up).
function donationInfo(cfg: TicketConfig) {
  return {
    donationUrl: cfg.donationUrl || '',
    donationPopup: !!cfg.donationUrl && cfg.donationPopup !== false,
    donationTitle: cfg.donationTitle || DEFAULT_DONATION_TITLE,
    donationText: cfg.donationText || DEFAULT_DONATION_TEXT,
  };
}

// --- Öffentliche Aktionen ---------------------------------------------------
async function publicConfig(req: VercelRequest, res: VercelResponse) {
  const turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || '';
  const pub = async (cfg: TicketConfig) => {
    const used = await confirmedSeats(cfg.eventKey);
    let blocks: unknown[] | undefined;
    if (blockMode(cfg)) {
      const [usage, teams] = await Promise.all([blockUsage(cfg), blockTeams(cfg)]);
      blocks = cfg.blocks.map((b) => ({
        id: b.id, label: b.label, from: b.from, to: b.to, capacity: b.capacity,
        remaining: Math.max(0, b.capacity - (usage[b.id] ?? 0)), teams: teams[b.id] ?? [],
      }));
    }
    return {
      blocks, allowFull: cfg.allowFull !== false,
      eventKey: cfg.eventKey, open: saleOpen(cfg), title: cfg.title, dateLabel: cfg.dateLabel,
      locationLabel: cfg.locationLabel, capacity: cfg.capacity,
      // Block-Modus: „frei" = der Block mit den meisten freien Plätzen.
      remaining: blocks
        ? Math.max(0, ...(blocks as { remaining: number }[]).map((x) => x.remaining))
        : Math.max(0, cfg.capacity - used),
      maxPerEmail: cfg.maxPerEmail,
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
  let block = '';
  if (blockMode(cfg)) {
    block = clamp(b.block, 20);
    const valid = block === 'all' ? cfg.allowFull !== false : cfg.blocks.some((x) => x.id === block);
    if (!valid) return badRequest(res, 'Bitte einen Block wählen.');
    const usage = await blockUsage(cfg, email);
    for (const bl of blocksFor(cfg, block)) {
      const left = Math.max(0, bl.capacity - (usage[bl.id] ?? 0));
      if (quantity > left) {
        return res.status(409).json({
          error: left > 0 ? `${bl.label}: nur noch ${left} Platz${left === 1 ? '' : 'e'} frei.` : `${bl.label} ist leider ausgebucht.`,
        });
      }
    }
  } else {
    const used = await confirmedSeats(cfg.eventKey, email);
    if (used + quantity > cfg.capacity) {
      const left = Math.max(0, cfg.capacity - used);
      return res.status(409).json({ error: left > 0 ? `Nur noch ${left} Platz${left === 1 ? '' : 'e'} frei.` : 'Leider ausverkauft.' });
    }
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
  await sql`UPDATE event_tickets SET consent_at = now(), consent_text = ${cfg.consentText}, block = ${block}
    WHERE event_key = ${cfg.eventKey} AND email = ${email}`;

  const result = await issueCode(purposeFor(cfg), email, async (code) => {
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `Dein Ticket-Code: ${code}`,
      layout: {
        preheader: 'Bestätige deine E-Mail, um deine Tickets zu sichern.',
        heading: 'E-Mail bestätigen', accent: cfg.accent, accentDark: cfg.accentDark,
        intro: `Fast fertig! Gib diesen Code ein, um ${quantity} Ticket${quantity === 1 ? '' : 's'} für „${cfg.title}" (${cfg.dateLabel}${block ? ` · ${blockLabel(cfg, block)}` : ''}) zu sichern:`,
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
  const rows = await sql`SELECT id, status, quantity, code, block FROM event_tickets WHERE event_key = ${cfg.eventKey} AND email = ${email} LIMIT 1`;
  const row = rows[0] as { id: string; status: string; quantity: number; code: string | null; block: string } | undefined;
  if (!row) return badRequest(res, 'Keine Reservierung gefunden. Bitte starte die Anmeldung neu.');
  if (row.status === 'confirmed') {
    return res.json({ ok: true, code: row.code, quantity: row.quantity, alreadyConfirmed: true, blockLabel: blockLabel(cfg, row.block), ...donationInfo(cfg) });
  }
  // Block-Modus: die gewählten Blöcke + ihre Kapazitäten (für die harte Prüfung).
  const needed = blockMode(cfg) ? blocksFor(cfg, row.block) : [];
  if (blockMode(cfg) && needed.length === 0) return badRequest(res, 'Bitte die Anmeldung neu starten und einen Block wählen.');

  const check = await checkCode(purposeFor(cfg), email, b.code);
  if (!check.ok) return badRequest(res, check.error || "Code ungültig.");

  // Harte Kapazitätsgrenze ATOMAR: pro Event einen Advisory-Lock halten und die
  // Bestätigung nur schreiben, wenn (bestätigte Plätze ohne uns) + unsere Menge
  // ≤ Kapazität. So können auch gleichzeitige Bestätigungen NIE überbuchen.
  const code = shortCode();
  const neededIds = needed.map((b) => b.id);
  const neededCaps = needed.map((b) => b.capacity);
  const tx = needed.length
    ? await sql.transaction((txn) => [
        txn`SELECT pg_advisory_xact_lock(hashtext(${cfg.eventKey}))`,
        // Jeder belegte Block muss Platz haben: (eigene + „ganzer Abend") + unsere Menge ≤ Kapazität.
        txn`UPDATE event_tickets
            SET status = 'confirmed', email_verified = true, code = ${code}, verified_at = now(), updated_at = now()
            WHERE id = ${row.id} AND status <> 'confirmed'
              AND NOT EXISTS (
                SELECT 1 FROM unnest(${neededIds}::text[], ${neededCaps}::int[]) AS x(b, cap)
                WHERE (SELECT COALESCE(SUM(quantity), 0) FROM event_tickets
                       WHERE event_key = ${cfg.eventKey} AND status = 'confirmed' AND id <> ${row.id}
                         AND (block = x.b OR block = 'all')) + ${row.quantity} > x.cap)
            RETURNING id`,
      ])
    : await sql.transaction((txn) => [
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
            Gültig für <strong>${row.quantity} Person${row.quantity === 1 ? '' : 'en'}</strong>${
              row.block ? `<br/>Einlass: <strong>${blockLabel(cfg, row.block)}</strong>` : ''
            }</p>`,
        footnote: 'Bitte diese E-Mail am Einlass bereithalten.',
      },
      text: `Ticket bestätigt für „${cfg.title}" (${cfg.dateLabel}).\nCode: ${code}\nGültig für ${row.quantity} Person(en).${row.block ? `\nEinlass: ${blockLabel(cfg, row.block)}` : ''}${cfg.donationUrl ? `\n\nFreiwillig unterstützen: ${cfg.donationUrl}` : ''}`,
    });
  } catch { /* Mail optional */ }

  return res.json({ ok: true, code, quantity: row.quantity, blockLabel: blockLabel(cfg, row.block), ...donationInfo(cfg) });
}

// --- Selbst-Check-in am Eingang ---------------------------------------------
// Gäste scannen den QR-Code auf dem Plakat, geben ihre E-Mail ODER ihren
// Ticket-Code ein und melden, wie viele von ihrer Anmeldung da sind. Öffentlich
// (kein Login), aber nur wenn der Schalter im Backend an ist, nur für BESTÄTIGTE
// Tickets und mit Rate-Limit (großzügig: viele Gäste teilen sich am Eingang das
// gleiche WLAN/Netz). Es wird nur Vorname, Code und Personenzahl zurückgegeben.
async function selfConfig(_req: VercelRequest, res: VercelResponse) {
  const { events } = await getArchive();
  const list = events
    .filter((e) => e.selfCheckin)
    .map((e) => ({ eventKey: e.eventKey, title: e.title, dateLabel: e.dateLabel, locationLabel: e.locationLabel, accent: e.accent, accentDark: e.accentDark }));
  return res.json({ events: list });
}

type SelfRow = { id: string; name: string; quantity: number; code: string | null; arrived: number };
async function findOwnTicket(req: VercelRequest, res: VercelResponse): Promise<{ cfg: TicketConfig; row: SelfRow } | null> {
  const b = req.body ?? {};
  const cfg = await getEvent(clamp(b.eventKey, 60));
  if (!cfg) { res.status(404).json({ error: 'Unbekannte Veranstaltung.' }); return null; }
  if (!cfg.selfCheckin) { res.status(403).json({ error: 'Der Check-in ist gerade nicht geöffnet.' }); return null; }
  if (await tooManyAttempts('self-checkin', clientIp(req), 60, 10)) {
    res.status(429).json({ error: 'Zu viele Versuche. Bitte kurz warten.' });
    return null;
  }
  const q = clamp(b.query, 120);
  const codeMatch = /^(?:HL)?[\s-]*([A-Z0-9]{6})$/i.exec(q.replace(/\s+/g, ''));
  let rows: SelfRow[] = [];
  const select = (where: 'email' | 'code', v: string) =>
    where === 'email'
      ? sql`SELECT id, name, quantity, code, COALESCE(arrived, CASE WHEN checked_in THEN quantity ELSE 0 END)::int AS arrived
            FROM event_tickets WHERE event_key = ${cfg.eventKey} AND status = 'confirmed' AND email = ${v} LIMIT 1`
      : sql`SELECT id, name, quantity, code, COALESCE(arrived, CASE WHEN checked_in THEN quantity ELSE 0 END)::int AS arrived
            FROM event_tickets WHERE event_key = ${cfg.eventKey} AND status = 'confirmed' AND upper(code) = ${v} LIMIT 1`;
  if (isEmail(q)) rows = (await select('email', normEmail(q))) as SelfRow[];
  else if (codeMatch) rows = (await select('code', `HL-${codeMatch[1].toUpperCase()}`)) as SelfRow[];
  else { badRequest(res, 'Bitte deine E-Mail-Adresse oder deinen Ticket-Code eingeben.'); return null; }
  const row = rows[0];
  if (!row) {
    res.status(404).json({ error: 'Kein Ticket gefunden. Prüfe die Schreibweise – oder nutze die E-Mail, mit der du dich angemeldet hast.' });
    return null;
  }
  return { cfg, row: { ...row, quantity: Number(row.quantity), arrived: Number(row.arrived) } };
}

async function selfLookup(req: VercelRequest, res: VercelResponse) {
  const found = await findOwnTicket(req, res);
  if (!found) return;
  const { row } = found;
  return res.json({ firstName: (row.name || '').trim().split(/\s+/)[0] || '', code: row.code, quantity: row.quantity, arrived: row.arrived });
}

async function selfCheckin(req: VercelRequest, res: VercelResponse) {
  const found = await findOwnTicket(req, res);
  if (!found) return;
  const { row } = found;
  // Wer eincheckt, ist selbst da → mindestens 1, höchstens die Ticket-Anzahl.
  const n = clampInt(req.body?.arrived, 1, row.quantity) ?? row.quantity;
  const upd = await sql`UPDATE event_tickets SET arrived = ${n}, checked_in = true, updated_at = now()
    WHERE id = ${row.id} RETURNING arrived`;
  return res.json({ ok: true, arrived: Number(upd[0]?.arrived ?? n), quantity: row.quantity, code: row.code });
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
  // Standard: die neueste offene Veranstaltung, sonst die neueste (Liste ist alt → neu).
  const newestFirst = [...events].reverse();
  const key = String(req.query.key ?? '') || newestFirst.find((e) => e.open)?.eventKey || newestFirst[0]?.eventKey || '';
  const cfg = events.find((e) => e.eventKey === key) ?? null;

  // Übersicht aller Events (für die Auswahl im Backend) inkl. verkaufter Plätze.
  const overview = await Promise.all(
    events.map(async (e) => {
      if (blockMode(e)) {
        // Block-Modus: Plätze über alle Blöcke („ganzer Abend" belegt je Block einen).
        const u = await blockUsage(e);
        return {
          id: e.id, eventKey: e.eventKey, title: e.title, dateLabel: e.dateLabel, open: e.open,
          capacity: e.blocks.reduce((s, b) => s + b.capacity, 0),
          soldSeats: e.blocks.reduce((s, b) => s + (u[b.id] ?? 0), 0),
        };
      }
      return {
        id: e.id, eventKey: e.eventKey, title: e.title, dateLabel: e.dateLabel,
        open: e.open, capacity: e.capacity, soldSeats: await confirmedSeats(e.eventKey),
      };
    })
  );

  if (!cfg) return res.json({ events, overview, config: null, rows: [], capacity: 0, soldSeats: 0, confirmedCount: 0, remaining: 0 });

  const rows = await sql`SELECT id, email, name, quantity, status, code, block, checked_in AS "checkedIn",
      COALESCE(arrived, CASE WHEN checked_in THEN quantity ELSE 0 END)::int AS "arrived",
      created_at AS "createdAt", verified_at AS "verifiedAt",
      consent_at AS "consentAt", consent_text AS "consentText"
    FROM event_tickets WHERE event_key = ${cfg.eventKey} ORDER BY (status='confirmed') DESC, created_at DESC`;
  const confirmed = rows.filter((r) => r.status === 'confirmed');
  const soldSeats = confirmed.reduce((sum, r) => sum + Number(r.quantity || 0), 0);
  // Tatsächlich erschienene Personen (für die Statistik „wer kam wirklich").
  const arrivedSeats = confirmed.reduce((sum, r) => sum + Number(r.arrived || 0), 0);
  // Block-Modus: Zahlen je Block (verkauft inkl. „ganzer Abend", erschienen).
  const blocks = blockMode(cfg)
    ? cfg.blocks.map((b) => {
        const mine = confirmed.filter((r) => r.block === b.id || r.block === 'all');
        return {
          id: b.id, label: b.label, from: b.from, to: b.to, capacity: b.capacity,
          sold: mine.reduce((sum, r) => sum + Number(r.quantity || 0), 0),
          arrived: mine.reduce((sum, r) => sum + Number(r.arrived || 0), 0),
        };
      })
    : undefined;
  const capacity = blocks ? blocks.reduce((s, b) => s + b.capacity, 0) : cfg.capacity;
  const blockSeats = blocks ? blocks.reduce((s, b) => s + b.sold, 0) : soldSeats;
  return res.json({
    events, overview, config: cfg, rows, capacity, blocks,
    soldSeats, arrivedSeats, confirmedCount: confirmed.length, remaining: Math.max(0, capacity - blockSeats),
  });
}
// Einlass setzen. `arrived` = wie viele Personen dieser Anmeldung da sind
// (wird auf 0..quantity begrenzt, auch nachträglich änderbar). Ohne `arrived`
// gilt der alte Schalter: checkedIn = alle da / niemand da.
async function adminCheckin(req: VercelRequest, res: VercelResponse) {
  const id = String(req.body?.id ?? '');
  if (!id) return badRequest(res, 'ID fehlt.');
  const n = clampInt(req.body?.arrived, 0, 1000);
  if (n !== null) {
    const rows = await sql`UPDATE event_tickets
      SET arrived = LEAST(${n}, quantity), checked_in = (LEAST(${n}, quantity) > 0), updated_at = now()
      WHERE id = ${id} RETURNING arrived`;
    return res.json({ ok: true, arrived: Number(rows[0]?.arrived ?? 0) });
  }
  const checkedIn = req.body?.checkedIn === true;
  await sql`UPDATE event_tickets
    SET checked_in = ${checkedIn}, arrived = CASE WHEN ${checkedIn} THEN quantity ELSE 0 END, updated_at = now()
    WHERE id = ${id}`;
  return res.json({ ok: true });
}
async function adminDelete(req: VercelRequest, res: VercelResponse) {
  const id = String(req.body?.id ?? '');
  if (!id) return badRequest(res, 'ID fehlt.');
  await sql`DELETE FROM event_tickets WHERE id = ${id}`;
  return res.json({ ok: true });
}

// Eine ganze Veranstaltung löschen: aus der Liste nehmen UND ihre Anmeldungen
// entfernen (sonst tauchten sie bei einem neuen Event mit gleichem Schlüssel
// wieder auf). Die Sicherheitsabfrage macht das Backend-UI.
async function adminDeleteEvent(req: VercelRequest, res: VercelResponse) {
  const key = clamp(req.body?.eventKey, 60);
  if (!key) return badRequest(res, 'Veranstaltung fehlt.');
  const prev = await getArchive();
  if (!prev.events.some((e) => e.eventKey === key)) return res.status(404).json({ error: 'Unbekannte Veranstaltung.' });
  const events = prev.events.filter((e) => e.eventKey !== key);
  await sql`INSERT INTO settings (key, value) VALUES ('event_tickets', ${JSON.stringify({ events })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  const del = await sql`DELETE FROM event_tickets WHERE event_key = ${key} RETURNING 1`;
  return res.json({ ok: true, deletedTickets: del.length, events });
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
      donationPopup: raw.donationPopup !== false,
      donationTitle: clamp(raw.donationTitle, 120) || DEFAULT_DONATION_TITLE,
      donationText: clamp(raw.donationText, 3000) || DEFAULT_DONATION_TEXT,
      accent: clamp(raw.accent, 20) || DEFAULT_ACCENT,
      accentDark: clamp(raw.accentDark, 20) || DEFAULT_ACCENT_DARK,
      consentText: clamp(raw.consentText, 2000) || DEFAULT_CONSENT,
      startsAt: clamp(raw.startsAt, 40),
      selfCheckin: raw.selfCheckin === true,
      link:
        raw.link && typeof raw.link === 'object' && clamp(raw.link.seasonId, 80) && clampInt(raw.link.matchday, 1, 999)
          ? { seasonId: clamp(raw.link.seasonId, 80), matchday: clampInt(raw.link.matchday, 1, 999) as number }
          : null,
      blocks: (Array.isArray(raw.blocks) ? raw.blocks : [])
        .slice(0, 6)
        .map((bl, i) => ({
          id: `b${i + 1}`,
          label: clamp(bl?.label, 40) || `Block ${i + 1}`,
          from: /^\d{1,2}:\d{2}$/.test(clamp(bl?.from, 5)) ? clamp(bl?.from, 5) : '19:00',
          to: /^\d{1,2}:\d{2}$/.test(clamp(bl?.to, 5)) ? clamp(bl?.to, 5) : '22:00',
          capacity: clampInt(bl?.capacity, 1, 100000) ?? 60,
        })),
      allowFull: raw.allowFull !== false,
    });
  }
  const archive: TicketArchive = { events };
  await sql`INSERT INTO settings (key, value) VALUES ('event_tickets', ${JSON.stringify(archive)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json({ ok: true, events });
}

// Spieltage der aktuellen Saison zum Verknüpfen: Datum, erster Anstoß und
// Block-Vorschlag direkt aus dem Spielplan.
async function adminMatchdays(_req: VercelRequest, res: VercelResponse) {
  const season = (await sql`SELECT id, label FROM seasons WHERE is_current = true LIMIT 1`)[0] as
    | { id: string; label: string }
    | undefined;
  if (!season) return res.json({ season: null, matchdays: [] });
  const games = (await sql`SELECT matchday, date, time FROM matches WHERE season_id = ${season.id}
    ORDER BY matchday, date, time`) as { matchday: number; date: string; time: string }[];
  const by = new Map<number, { date: string; times: string[] }>();
  for (const g of games) {
    const e = by.get(g.matchday) ?? { date: g.date || '', times: [] };
    if (!e.date && g.date) e.date = g.date;
    if (g.time) e.times.push(g.time);
    by.set(g.matchday, e);
  }
  const matchdays = [...by.entries()].map(([matchday, e]) => {
    const sorted = [...e.times].sort((a, b) => toMin(a) - toMin(b));
    return { matchday, date: e.date, firstTime: sorted[0] || '', games: e.times.length, blocks: suggestBlocks(e.times) };
  });
  return res.json({ season, matchdays });
}

export async function eventTickets(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query.action ?? '');
  if (req.method === 'GET' && action === 'config') return publicConfig(req, res);
  if (req.method === 'POST' && action === 'request-code') return requestCode(req, res);
  if (req.method === 'POST' && action === 'confirm') return confirm(req, res);
  if (req.method === 'GET' && action === 'self-config') return selfConfig(req, res);
  if (req.method === 'POST' && action === 'self-lookup') return selfLookup(req, res);
  if (req.method === 'POST' && action === 'self-checkin') return selfCheckin(req, res);

  if (action.startsWith('admin')) {
    if (!(await requireSuper(req, res))) return;
    if (req.method === 'GET' && action === 'admin-list') return adminList(req, res);
    if (req.method === 'POST' && action === 'admin-checkin') return adminCheckin(req, res);
    if (req.method === 'POST' && action === 'admin-delete') return adminDelete(req, res);
    if (req.method === 'POST' && action === 'admin-config') return adminSaveConfig(req, res);
    if (req.method === 'GET' && action === 'admin-matchdays') return adminMatchdays(req, res);
    if (req.method === 'POST' && action === 'admin-delete-event') return adminDeleteEvent(req, res);
  }
  return res.status(400).json({ error: 'Unbekannte Aktion' });
}
