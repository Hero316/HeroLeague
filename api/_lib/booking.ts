// ===========================================================================
// Season-2 – VERBINDLICHE Buchung (Landingpage /season2).
// Läuft über den bestehenden Endpunkt /api/signup?action=booking-… (kein neuer
// api/-Endpunkt wegen des 12-Funktionen-Limits).
//
// Ablauf: E-Mail → 6-stelliger Code → signiertes Kurzzeit-Token. Mit dem Token
// werden Daten einer früheren Vorregistrierung vorausgefüllt und die Buchung
// abgeschickt (Team, Kader, Logo, Paket, Pflicht-Zustimmungen). Zahlung per
// Revolut-Zahlungslink; der Eingang wird im Backoffice bestätigt.
// ===========================================================================
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { put } from '@vercel/blob';
import { sql } from './db.js';
import { getSession, hasPermission } from './auth.js';
import { badRequest } from './validate.js';
import {
  checkCode, clientIp, codeBlock, isDisposableEmail, isEmail, issueCode, mailButton,
  normEmail, sendBrandedMail, tooManyAttempts, verifyTurnstile,
} from './publicforms.js';
import { escapeHtml } from './mail.js';

const PURPOSE = 'season-booking';
const FROM = 'Hero League – Season 2 <anmeldung@hero-league.de>';
const NOTIFY_TO = process.env.SIGNUP_NOTIFY_EMAIL || process.env.ADMIN_2FA_EMAIL || '';
const ACCENT = '#2F5BFF';
const ACCENT_DARK = '#16277A';
const TOKEN_TTL_MS = 3 * 60 * 60 * 1000; // 3 Stunden Zeit zum Ausfüllen

// --- Konfiguration ----------------------------------------------------------
export type PackageId = 'one' | 'two';
export interface BookingConfig {
  published: boolean; // Landingpage öffentlich sichtbar (sonst „noch nicht veröffentlicht")
  open: boolean; // verbindliche Buchung freigeschaltet
  preregOnly: boolean; // nur vorregistrierte Teams/Captains dürfen buchen (Vorab-Phase)
  accessKey: string; // Vorab-Zugang: /season2?zugang=<key> zeigt die unveröffentlichte Seite
  seasonLabel: string;
  startInfo: string;
  openAt: string; // ISO – offizielle Öffnung (Start der Early-Bird-Frist), '' = noch offen
  earlyBirdDays: number; // 14
  deadlineBasis: 'booking' | 'payment'; // zählt für die Frist der Buchungsabschluss oder der Zahlungseingang
  priceOne: number; // Cent
  priceTwo: number;
  priceTwoEarly: number;
  payLinkOne: string; // Revolut-Zahlungslinks je Preis
  payLinkTwo: string;
  payLinkTwoEarly: string;
  minSquad: number;
  maxSquad: number;
  termsVersion: string;
  terms: string; // Teilnahmebedingungen (Volltext)
  rules: string; // Regelwerk (Volltext)
}

export const BINDING_NOTICE =
  'Deine Buchung ist verbindlich. Eine kostenfreie Stornierung bei freiwilligem Rückzug oder Nichtantritt deines Teams ist nicht vorgesehen. Gesetzliche Rücktritts-, Kündigungs- und Erstattungsrechte bleiben unberührt.';
export const JERSEY_CHECKBOX =
  'Wir spielen in einheitlichen Teamtrikots mit gut lesbaren, kontrastreichen Rückennummern. Jede Nummer ist im Team nur einmal vergeben, eindeutig einem Spieler zugeordnet und wird vor dem ersten Einsatz in der Kaderliste hinterlegt.';
export const TERMS_CHECKBOX =
  'Ich habe die Teilnahmebedingungen einschließlich der Regelung zu Teamrückzug und Nichtantritt gelesen und akzeptiere sie.';

const DEFAULT_TERMS = `Rückzug und Nichtantritt
Bei freiwilligem Rückzug oder Nichtantritt des Teams bleibt die vereinbarte Zahlungspflicht grundsätzlich bestehen. Ersparte Aufwendungen sowie Einnahmen aus einer erneuten Vergabe desselben Startplatzes werden angerechnet. Gesetzliche Rücktritts-, Kündigungs- und Erstattungsrechte bleiben unberührt.

Ausfall einer Season
Findet eine gebuchte Season nicht statt, wird der auf diese Season entfallende bereits gezahlte Teilnahmebeitrag erstattet.

Kulanz
Darüber hinausgehende Erstattungen können im Einzelfall aus Kulanz gewährt werden. Ein Anspruch auf eine solche freiwillige Kulanzleistung besteht nicht.`;

const DEFAULT_RULES = `Trikots & Rückennummern
Ab Season Two sind einheitliche Teamtrikots mit gut lesbaren, kontrastreichen Rückennummern verpflichtend. Jede Rückennummer darf innerhalb eines Teams nur einmal vergeben sein und muss einem Spieler eindeutig zugeordnet werden.

Die Zuordnung ist vor dem ersten Einsatz in der Kaderliste zu hinterlegen. Änderungen und Nachmeldungen müssen vor dem jeweiligen Einsatz gemeldet werden. Die Rückennummern dienen der zuverlässigen Erfassung und Zuordnung der Spielerdaten und Statistiken.

Kader
Jedes Team meldet seinen Kader mit Vor- und Nachname jedes Spielers, einen Teamkapitän und mindestens einen Torwart.

Weitere Regeln
Das vollständige Regelwerk ergänzt die Liga hier vor dem Start.`;

const DEFAULT_CONFIG: BookingConfig = {
  published: false,
  open: false,
  preregOnly: true,
  accessKey: '',
  seasonLabel: 'Season 2',
  startInfo: 'Start im März 2027',
  openAt: '',
  earlyBirdDays: 14,
  deadlineBasis: 'booking',
  priceOne: 55000,
  priceTwo: 100000,
  priceTwoEarly: 95000,
  payLinkOne: '',
  payLinkTwo: '',
  payLinkTwoEarly: '',
  minSquad: 8,
  maxSquad: 14,
  termsVersion: 'Entwurf v1',
  terms: DEFAULT_TERMS,
  rules: DEFAULT_RULES,
};

export const DEFAULT_BOOKING_CONFIG = DEFAULT_CONFIG;
export async function getBookingConfig(): Promise<BookingConfig> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'season_booking'`;
    return { ...DEFAULT_CONFIG, ...((rows[0]?.value as Partial<BookingConfig>) || {}) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

// Early Bird: nur das Zweierpaket, 14 Tage ab offizieller Öffnung.
function earlyBirdUntil(cfg: BookingConfig): string {
  if (!cfg.openAt) return '';
  const t = new Date(cfg.openAt).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t + cfg.earlyBirdDays * 86400000).toISOString();
}
// Vor der offiziellen Öffnung (Vorab-Zugang für Vorregistrierte) gilt der
// Early Bird natürlich auch – entscheidend ist nur das Ende der Frist.
function earlyBirdActive(cfg: BookingConfig, at = Date.now()): boolean {
  const until = earlyBirdUntil(cfg);
  if (!until) return false;
  return at < new Date(until).getTime();
}
function priceFor(cfg: BookingConfig, pkg: PackageId, early: boolean) {
  if (pkg === 'one') return { cents: cfg.priceOne, link: cfg.payLinkOne, label: `1 Season (${cfg.seasonLabel})` };
  return early
    ? { cents: cfg.priceTwoEarly, link: cfg.payLinkTwoEarly || cfg.payLinkTwo, label: '2 Seasons · Early Bird' }
    : { cents: cfg.priceTwo, link: cfg.payLinkTwo, label: '2 Seasons' };
}
const eur = (cents: number) => `${(cents / 100).toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} €`;

// --- Token (nach bestätigtem Code) -----------------------------------------
function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET ist nicht gesetzt');
  return s;
}
function signToken(email: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${Buffer.from(email).toString('base64url')}.${exp}`;
  const sig = createHmac('sha256', secret()).update(`booking:${payload}`).digest('base64url');
  return `${payload}.${sig}`;
}
function readToken(token: unknown): string | null {
  if (typeof token !== 'string') return null;
  const [e, exp, sig] = token.split('.');
  if (!e || !exp || !sig) return null;
  const want = createHmac('sha256', secret()).update(`booking:${e}.${exp}`).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  if (Number(exp) < Date.now()) return null;
  return Buffer.from(e, 'base64url').toString();
}

// Vorab-Zugang per Link (?zugang=… → key) prüfen.
function keyOk(req: VercelRequest, cfg: BookingConfig): boolean {
  const k = String(req.query.key ?? '');
  if (!cfg.accessKey || !k) return false;
  const a = Buffer.from(k);
  const b = Buffer.from(cfg.accessKey);
  return a.length === b.length && timingSafeEqual(a, b);
}
async function isAdmin(req: VercelRequest): Promise<boolean> {
  const session = await getSession(req).catch(() => null);
  return Boolean(session && hasPermission(session, 'signups'));
}
// Seite sichtbar? Veröffentlicht, per Vorab-Link oder als Admin (Vorschau).
async function canView(req: VercelRequest, cfg: BookingConfig) {
  if (cfg.published || keyOk(req, cfg)) return true;
  return isAdmin(req);
}
// Buchung erlaubt? Freigeschaltet (und Seite sichtbar) – oder Testmodus für Admins.
async function canBook(req: VercelRequest, cfg: BookingConfig): Promise<{ ok: boolean; test: boolean; preregOnly: boolean }> {
  if (cfg.open && (cfg.published || keyOk(req, cfg))) return { ok: true, test: false, preregOnly: cfg.preregOnly };
  if (await isAdmin(req)) return { ok: true, test: true, preregOnly: false };
  return { ok: false, test: false, preregOnly: cfg.preregOnly };
}

// Vorregistriert? (Season-2-Vorregistrierung ODER Season-1-Captain)
async function isPreregistered(mail: string): Promise<boolean> {
  try {
    const rows = await sql`SELECT 1 FROM season_signups WHERE email = ${mail} LIMIT 1`;
    if (rows.length) return true;
  } catch {
    /* Tabelle fehlt */
  }
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'season_captains'`;
    const caps = (rows[0]?.value as { email: string }[] | undefined) ?? [];
    return caps.some((c) => normEmail(c.email) === mail);
  } catch {
    return false;
  }
}
const PREREG_ONLY_MSG = 'Die Buchung ist im Moment nur für vorregistrierte Teams geöffnet. Bitte nutze die E-Mail-Adresse, mit der ihr euch vorregistriert habt.';

// --- Helfer -----------------------------------------------------------------
const clamp = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const newRef = () => {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += abc[randomInt(0, abc.length)];
  return `HL-S2-${s}`;
};

interface RosterEntry { firstName: string; lastName: string; number: number | null; captain: boolean; keeper: boolean }

// --- Öffentliche Aktionen ---------------------------------------------------

// Konfiguration für die Landingpage (Preise, Frist, Texte, Status).
async function bookingConfig(req: VercelRequest, res: VercelResponse) {
  const cfg = await getBookingConfig();
  if (!(await canView(req, cfg))) {
    // Noch nicht veröffentlicht – nur das Nötigste verraten.
    return res.json({ visible: false, published: false, seasonLabel: cfg.seasonLabel, startInfo: cfg.startInfo });
  }
  const { ok, test } = await canBook(req, cfg);
  return res.json({
    visible: true,
    published: cfg.published,
    preview: !cfg.published,
    preregOnly: cfg.preregOnly && !test,
    open: cfg.open,
    canBook: ok,
    testMode: test,
    seasonLabel: cfg.seasonLabel,
    startInfo: cfg.startInfo,
    openAt: cfg.openAt,
    earlyBirdUntil: earlyBirdUntil(cfg),
    earlyBirdActive: earlyBirdActive(cfg),
    deadlineBasis: cfg.deadlineBasis,
    prices: { one: cfg.priceOne, two: cfg.priceTwo, twoEarly: cfg.priceTwoEarly },
    minSquad: cfg.minSquad,
    maxSquad: cfg.maxSquad,
    termsVersion: cfg.termsVersion,
    terms: cfg.terms,
    rules: cfg.rules,
    bindingNotice: BINDING_NOTICE,
    termsCheckbox: TERMS_CHECKBOX,
    jerseyCheckbox: JERSEY_CHECKBOX,
    turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '',
  });
}

// Code an die E-Mail schicken.
async function bookingRequestCode(req: VercelRequest, res: VercelResponse) {
  const cfg = await getBookingConfig();
  if (!(await canBook(req, cfg)).ok) return res.status(403).json({ error: 'Die Buchung ist noch nicht freigeschaltet.' });
  const { email, website, turnstileToken } = req.body ?? {};
  if (typeof website === 'string' && website.trim() !== '') return res.json({ ok: true }); // Honeypot
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (isDisposableEmail(email)) return badRequest(res, 'Bitte eine echte E-Mail-Adresse verwenden (keine Wegwerf-Adresse).');
  const ip = clientIp(req);
  if (!(await verifyTurnstile(turnstileToken, ip))) return badRequest(res, 'Bot-Prüfung fehlgeschlagen. Bitte Seite neu laden.');
  if (await tooManyAttempts('booking-code', ip, 8, 15)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });
  const allowed = await canBook(req, cfg);
  if (allowed.preregOnly && !(await isPreregistered(normEmail(email)))) return badRequest(res, PREREG_ONLY_MSG);
  const result = await issueCode(PURPOSE, email, async (code) => {
    await sendBrandedMail({
      to: normEmail(email), from: FROM,
      subject: `Dein Code für die ${cfg.seasonLabel}-Buchung: ${code}`,
      layout: {
        preheader: `Bestätige deine E-Mail für die ${cfg.seasonLabel}-Buchung.`,
        heading: 'E-Mail bestätigen', accent: ACCENT, accentDark: ACCENT_DARK,
        intro: `Gib diesen Code auf der ${cfg.seasonLabel}-Seite ein, um mit eurer Buchung weiterzumachen:`,
        bodyHtml: codeBlock(code, ACCENT),
        footnote: 'Der Code ist 15 Minuten gültig. Wenn du das nicht warst, ignoriere diese E-Mail.',
      },
      text: `Dein Code für die Hero-League-Buchung: ${code}\nGültig für 15 Minuten.`,
    });
  });
  if (!result.ok) return badRequest(res, result.error || 'Fehler.');
  return res.json({ ok: true, ...(result.devCode ? { devCode: result.devCode } : {}) });
}

// Code prüfen → Token + Vorausfüllung (Vorregistrierung / bestehende Buchung).
async function bookingVerify(req: VercelRequest, res: VercelResponse) {
  const cfg = await getBookingConfig();
  if (!(await canBook(req, cfg)).ok) return res.status(403).json({ error: 'Die Buchung ist noch nicht freigeschaltet.' });
  const { email, code } = req.body ?? {};
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  const check = await checkCode(PURPOSE, email, code);
  if (!check.ok) return badRequest(res, check.error || 'Code ungültig.');
  const mail = normEmail(email);

  // Frühere (unverbindliche) Vorregistrierung → Daten übernehmen.
  let prereg: Record<string, unknown> | null = null;
  try {
    const rows = await sql`SELECT entry, team_name AS "teamName", contact_name AS "contactName", data, created_at AS "createdAt"
      FROM season_signups WHERE email = ${mail} LIMIT 1`;
    const r = rows[0] as { entry: string; teamName: string; contactName: string; data: Record<string, unknown>; createdAt: string } | undefined;
    if (r) {
      prereg = {
        entry: r.entry,
        teamName: r.teamName || (r.data?.teamName as string) || '',
        contactName: r.contactName || (r.data?.contactName as string) || (r.data?.name as string) || '',
        phone: (r.data?.phone as string) || '',
        squadSize: typeof r.data?.squadSize === 'number' ? r.data.squadSize : null,
        since: r.createdAt,
      };
    }
  } catch {
    /* keine Vorregistrierung */
  }
  // Season-1-Captain? (Teamname vorschlagen)
  if (!prereg) {
    try {
      const rows = await sql`SELECT value FROM settings WHERE key = 'season_captains'`;
      const caps = (rows[0]?.value as { email: string; teamName: string }[] | undefined) ?? [];
      const c = caps.find((x) => normEmail(x.email) === mail);
      if (c) prereg = { entry: 'team', teamName: c.teamName, contactName: '', phone: '', captain: true };
    } catch {
      /* egal */
    }
  }
  // Schon verbindlich gebucht? → Status anzeigen (und ggf. weiter bezahlen).
  const booking = await bookingByEmail(mail);
  return res.json({ ok: true, token: signToken(mail), email: mail, prereg, booking });
}

async function bookingByEmail(mail: string) {
  try {
    const rows = await sql`SELECT ref, status, team_name AS "teamName", package, price_cents AS "priceCents",
        early_bird AS "earlyBird", created_at AS "createdAt", paid_at AS "paidAt"
      FROM season_bookings WHERE email = ${mail} ORDER BY created_at DESC LIMIT 1`;
    const b = rows[0] as { ref: string; status: string; teamName: string; package: PackageId; priceCents: number; earlyBird: boolean; createdAt: string; paidAt: string | null } | undefined;
    if (!b) return null;
    const cfg = await getBookingConfig();
    const p = priceFor(cfg, b.package, b.earlyBird);
    return { ...b, payLink: b.status === 'pending' ? p.link : '', packageLabel: p.label };
  } catch {
    return null;
  }
}

// Logo (Bild oder PDF, max. 3 MB) als Data-URL → Vercel Blob.
const LOGO_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'application/pdf': 'pdf' };
async function storeLogo(dataUrl: unknown, ref: string): Promise<string> {
  if (typeof dataUrl !== 'string' || !dataUrl) return '';
  const m = dataUrl.match(/^data:([^;,]+)(?:;[^,]*)?;base64,(.+)$/i);
  if (!m) throw new Error('Logo konnte nicht gelesen werden.');
  const ext = LOGO_TYPES[m[1].toLowerCase()];
  if (!ext) throw new Error('Logo bitte als PNG, JPG, WebP oder PDF.');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length === 0 || buf.length > 3 * 1024 * 1024) throw new Error('Logo ist zu groß (max. 3 MB).');
  const blob = await put(`season2/logos/${ref}-${Date.now()}.${ext}`, buf, { access: 'public', contentType: m[1].toLowerCase() });
  return blob.url;
}

// Verbindliche Buchung abschicken.
async function bookingSubmit(req: VercelRequest, res: VercelResponse) {
  const cfg = await getBookingConfig();
  const allowed = await canBook(req, cfg);
  if (!allowed.ok) return res.status(403).json({ error: 'Die Buchung ist noch nicht freigeschaltet.' });
  const b = req.body ?? {};
  const email = readToken(b.token);
  if (!email) return res.status(400).json({ error: 'Deine Bestätigung ist abgelaufen. Bitte E-Mail erneut bestätigen.', expired: true });
  if (await tooManyAttempts('booking-submit', clientIp(req), 10, 30)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });

  if (allowed.preregOnly && !(await isPreregistered(email))) return badRequest(res, PREREG_ONLY_MSG);
  const existing = await bookingByEmail(email);
  if (existing && existing.status !== 'cancelled') {
    return res.status(409).json({ error: 'Zu dieser E-Mail gibt es schon eine verbindliche Buchung.', booking: existing });
  }

  const teamName = clamp(b.teamName, 60);
  const contactName = clamp(b.contactName, 80);
  const phone = clamp(b.phone, 40);
  if (!teamName) return badRequest(res, 'Bitte euren Teamnamen angeben.');
  if (!contactName) return badRequest(res, 'Bitte einen Ansprechpartner angeben.');
  if (!phone) return badRequest(res, 'Bitte eine Telefonnummer angeben (für Rückfragen).');
  const pkg: PackageId | null = b.package === 'one' || b.package === 'two' ? b.package : null;
  if (!pkg) return badRequest(res, 'Bitte ein Paket wählen.');

  // Kader prüfen.
  const raw: unknown[] = Array.isArray(b.roster) ? b.roster : [];
  const roster: RosterEntry[] = raw
    .map((r) => {
      const o = (r && typeof r === 'object' ? r : {}) as Record<string, unknown>;
      const n = o.number === null || o.number === undefined || o.number === '' ? null : Math.round(Number(o.number));
      return {
        firstName: clamp(o.firstName, 40),
        lastName: clamp(o.lastName, 40),
        number: n !== null && Number.isFinite(n) && n >= 0 && n <= 99 ? n : null,
        captain: o.captain === true,
        keeper: o.keeper === true,
      };
    })
    .filter((r) => r.firstName || r.lastName);
  if (roster.some((r) => !r.firstName || !r.lastName)) return badRequest(res, 'Bitte bei jedem Spieler Vor- und Nachnamen angeben.');
  if (roster.length < cfg.minSquad || roster.length > cfg.maxSquad) {
    return badRequest(res, `Der Kader braucht ${cfg.minSquad} bis ${cfg.maxSquad} Spieler.`);
  }
  if (roster.filter((r) => r.captain).length !== 1) return badRequest(res, 'Bitte genau einen Teamkapitän markieren.');
  if (!roster.some((r) => r.keeper)) return badRequest(res, 'Bitte mindestens einen Torwart markieren.');
  const nums = roster.map((r) => r.number).filter((n): n is number => n !== null);
  if (new Set(nums).size !== nums.length) return badRequest(res, 'Jede Rückennummer darf nur einmal vorkommen.');

  // Pflicht-Zustimmungen.
  if (b.acceptJersey !== true) return badRequest(res, 'Bitte die Trikot- und Rückennummern-Pflicht bestätigen.');
  if (b.acceptRules !== true) return badRequest(res, 'Bitte das Regelwerk bestätigen.');
  if (b.acceptTerms !== true) return badRequest(res, 'Bitte die Teilnahmebedingungen akzeptieren.');

  const early = pkg === 'two' && earlyBirdActive(cfg);
  const price = priceFor(cfg, pkg, early);
  const id = randomUUID();
  const ref = newRef();
  let logoUrl = '';
  try {
    logoUrl = await storeLogo(b.logo, ref);
  } catch (e) {
    return badRequest(res, e instanceof Error ? e.message : 'Logo-Fehler.');
  }
  const now = new Date().toISOString();
  const consents = {
    acceptedAt: now,
    termsVersion: cfg.termsVersion,
    termsText: cfg.terms,
    termsCheckbox: TERMS_CHECKBOX,
    bindingNotice: BINDING_NOTICE,
    rulesAccepted: true,
    jerseyAccepted: true,
    jerseyCheckbox: JERSEY_CHECKBOX,
    rulesText: cfg.rules,
    ip: clientIp(req),
    userAgent: clamp(req.headers['user-agent'], 300),
    testMode: allowed.test,
  };
  await sql`INSERT INTO season_bookings
      (id, ref, email, status, team_name, contact_name, phone, package, price_cents, early_bird, roster, logo_url, consents, note, created_at, updated_at)
    VALUES (${id}, ${ref}, ${email}, 'pending', ${teamName}, ${contactName}, ${phone}, ${pkg}, ${price.cents}, ${early},
      ${JSON.stringify(roster)}::jsonb, ${logoUrl}, ${JSON.stringify(consents)}::jsonb, ${clamp(b.note, 800)}, now(), now())`;

  // Bestätigung an das Team – inkl. Zahlung + vollständigen Teilnahmebedingungen.
  const reference = `${ref} ${teamName}`;
  const rosterHtml = roster
    .map((r) => `${r.number !== null ? `#${r.number} ` : ''}${escapeHtml(r.firstName)} ${escapeHtml(r.lastName)}${r.captain ? ' (C)' : ''}${r.keeper ? ' (TW)' : ''}`)
    .join('<br>');
  const termsHtml = escapeHtml(cfg.terms).replace(/\n/g, '<br>');
  const p = (s: string) => `<p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:0 0 12px;">${s}</p>`;
  try {
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `Buchung eingegangen – ${teamName} (${ref})`,
      layout: {
        preheader: `Eure verbindliche ${cfg.seasonLabel}-Buchung ist eingegangen.`,
        heading: 'Buchung eingegangen ✅', accent: ACCENT, accentDark: ACCENT_DARK,
        intro: `Danke, ${contactName}! Die verbindliche Buchung von „${teamName}" für ${price.label} ist bei uns eingegangen.`,
        bodyHtml:
          p(`<strong>Betrag:</strong> ${eur(price.cents)}<br><strong>Buchungsnummer:</strong> ${ref}<br><strong>Verwendungszweck / Notiz bei der Zahlung:</strong> ${escapeHtml(reference)}`) +
          (price.link ? mailButton(`Jetzt ${eur(price.cents)} bezahlen`, price.link, ACCENT) : p('Den Zahlungslink schicken wir dir gesondert.')) +
          p(`Sobald die Zahlung bei uns eingegangen ist, bekommst du eine Bestätigung. Erst dann ist euer Startplatz fix.`) +
          p(`<strong>Euer Kader</strong><br>${rosterHtml}`) +
          p(`<strong>Hinweis:</strong> ${escapeHtml(BINDING_NOTICE)}`) +
          `<div style="margin-top:14px;padding:14px;border:1px solid #e2e8f5;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:12.5px;line-height:1.55;">
            <strong>Teilnahmebedingungen (Fassung: ${escapeHtml(cfg.termsVersion)}, akzeptiert am ${new Date(now).toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })})</strong><br><br>${termsHtml}</div>`,
        footnote: 'Fragen? Antworte einfach auf diese E-Mail.',
      },
      text: `Buchung eingegangen: ${teamName} – ${price.label} – ${eur(price.cents)}\nBuchungsnummer: ${ref}\nVerwendungszweck: ${reference}\n${price.link ? `Bezahlen: ${price.link}\n` : ''}\n${BINDING_NOTICE}\n\nTeilnahmebedingungen (${cfg.termsVersion}):\n${cfg.terms}`,
    });
  } catch {
    /* Mail optional */
  }
  if (NOTIFY_TO) {
    try {
      await sendBrandedMail({
        to: NOTIFY_TO, from: FROM,
        subject: `💶 Neue verbindliche Buchung – ${teamName} (${eur(price.cents)})${allowed.test ? ' [TEST]' : ''}`,
        layout: {
          preheader: `${teamName} hat ${price.label} gebucht.`,
          heading: `Neue Buchung – ${cfg.seasonLabel}`, accent: ACCENT, accentDark: ACCENT_DARK,
          intro: `${teamName} (${contactName}, ${email}, ${phone}) hat ${price.label} für ${eur(price.cents)} gebucht.`,
          bodyHtml: p(`<strong>Buchungsnummer:</strong> ${ref}`) + p(`<strong>Kader (${roster.length})</strong><br>${rosterHtml}`) + (logoUrl ? p(`<a href="${escapeHtml(logoUrl)}">Team-Logo ansehen</a>`) : ''),
          footnote: 'Zahlungseingang bitte im Backoffice unter „Season-2-Buchungen" bestätigen.',
        },
        text: `Neue Buchung: ${teamName} – ${price.label} – ${eur(price.cents)} – ${ref}`,
      });
    } catch {
      /* optional */
    }
  }
  return res.json({ ok: true, booking: await bookingByEmail(email), reference });
}

// --- Admin ------------------------------------------------------------------
async function requireSignups(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const session = await getSession(req);
  if (!session) { res.status(401).json({ error: 'Nicht angemeldet' }); return false; }
  if (!hasPermission(session, 'signups')) { res.status(403).json({ error: 'Keine Berechtigung.' }); return false; }
  return true;
}

async function adminBookings(_req: VercelRequest, res: VercelResponse) {
  const rows = await sql`SELECT id, ref, email, status, team_name AS "teamName", contact_name AS "contactName", phone,
      package, price_cents AS "priceCents", early_bird AS "earlyBird", roster, logo_url AS "logoUrl", consents, note,
      created_at AS "createdAt", paid_at AS "paidAt", team_id AS "teamId", transferred_at AS "transferredAt"
    FROM season_bookings ORDER BY created_at DESC`;
  return res.json(rows);
}

// Testbuchung o. Ä. endgültig löschen (im Backoffice mit Rückfrage).
async function adminBookingDelete(req: VercelRequest, res: VercelResponse) {
  const { id } = req.body ?? {};
  if (typeof id !== 'string' || !id) return badRequest(res, 'Ungültig.');
  await sql`DELETE FROM season_bookings WHERE id = ${id}`;
  return res.json({ ok: true });
}

// Merken, dass der Kader in einen Liga-Verein übernommen wurde.
async function adminBookingTransfer(req: VercelRequest, res: VercelResponse) {
  const { id, teamId } = req.body ?? {};
  if (typeof id !== 'string' || typeof teamId !== 'string' || !teamId) return badRequest(res, 'Ungültig.');
  await sql`UPDATE season_bookings SET team_id = ${teamId.slice(0, 120)}, transferred_at = now(), updated_at = now() WHERE id = ${id}`;
  return res.json({ ok: true });
}

// --- Vorregistrierte anschreiben (Vorab-Zugang) -----------------------------
async function readInvites(): Promise<Record<string, string>> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'season_booking_invites'`;
    return (rows[0]?.value as Record<string, string>) ?? {};
  } catch {
    return {};
  }
}

// Alle Vorregistrierten (Teams + einzelne Spieler) und Season-1-Captains mit
// Einladungs- und Buchungsstatus.
async function adminInvites(_req: VercelRequest, res: VercelResponse) {
  const people = new Map<string, { email: string; name: string; teamName: string; source: 'team' | 'player' | 'captain'; createdAt: string | null }>();
  try {
    const rows = await sql`SELECT email, entry, team_name AS "teamName", contact_name AS "contactName", data, created_at AS "createdAt"
      FROM season_signups ORDER BY created_at ASC`;
    for (const r of rows as { email: string; entry: string; teamName: string; contactName: string; data: Record<string, unknown>; createdAt: string }[]) {
      const mail = normEmail(r.email);
      people.set(mail, {
        email: mail,
        name: r.contactName || (r.data?.name as string) || '',
        teamName: r.teamName || (r.data?.teamName as string) || '',
        source: r.entry === 'player' ? 'player' : 'team',
        createdAt: r.createdAt,
      });
    }
  } catch {
    /* keine Vorregistrierungen */
  }
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'season_captains'`;
    for (const c of ((rows[0]?.value as { email: string; teamName: string }[] | undefined) ?? [])) {
      const mail = normEmail(c.email);
      if (!mail || people.has(mail)) continue;
      people.set(mail, { email: mail, name: '', teamName: c.teamName, source: 'captain', createdAt: null });
    }
  } catch {
    /* egal */
  }
  const invites = await readInvites();
  const booked = new Map<string, string>();
  try {
    const rows = await sql`SELECT email, status FROM season_bookings WHERE status <> 'cancelled'`;
    for (const r of rows as { email: string; status: string }[]) booked.set(normEmail(r.email), r.status);
  } catch {
    /* egal */
  }
  return res.json(
    [...people.values()].map((p) => ({ ...p, invitedAt: invites[p.email] ?? null, booking: booked.get(p.email) ?? null })),
  );
}

// Inhalt der Einladungsmail (auch für die Vorschau genutzt).
export function inviteMail(cfg: BookingConfig, link: string) {
  const until = earlyBirdUntil(cfg);
  const untilTxt = until ? new Date(until).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : '';
  const p = (t: string) => `<p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:0 0 12px;">${t}</p>`;
  return {
    subject: `${cfg.seasonLabel}: Euer Vorab-Zugang zur Buchung 🏆`,
    layout: {
      preheader: `Ihr seid vorregistriert – sichert euch euren Startplatz für ${cfg.seasonLabel} vor allen anderen.`,
      heading: `${cfg.seasonLabel} – ihr seid zuerst dran`, accent: ACCENT, accentDark: ACCENT_DARK,
      intro: `Danke, dass ihr euch für ${cfg.seasonLabel} vorregistriert habt! Bevor die Buchung öffentlich startet, könnt ihr euren Startplatz jetzt verbindlich sichern.`,
      bodyHtml:
        p(`Meldet euch auf der Seite mit <strong>dieser E-Mail-Adresse</strong> an – eure Angaben aus der Vorregistrierung sind dann schon eingetragen. Ihr ergänzt nur noch Kader, Logo und Paket.`) +
        (untilTxt ? p(`<strong>Early Bird:</strong> Das Paket für zwei Seasons gibt es bis ${escapeHtml(untilTxt)} Uhr für ${eur(cfg.priceTwoEarly)} statt ${eur(cfg.priceTwo)}.`) : '') +
        mailButton('Jetzt Startplatz sichern', link, ACCENT) +
        p(`<span style="font-size:12px;color:#7a8580;">Der Link ist euer persönlicher Vorab-Zugang – bitte nicht öffentlich teilen.</span>`),
      footnote: 'Fragen? Antworte einfach auf diese E-Mail.',
    },
    text: `${cfg.seasonLabel} – euer Vorab-Zugang zur Buchung: ${link}`,
  };
}

// Einladung mit Vorab-Link an ausgewählte Vorregistrierte (max. 10 je Aufruf –
// das Backoffice schickt größere Listen in Paketen, damit nichts abbricht).
async function adminInvite(req: VercelRequest, res: VercelResponse) {
  const list: unknown[] = Array.isArray(req.body?.emails) ? req.body.emails : [];
  const emails = [...new Set(list.filter(isEmail).map((e) => normEmail(e as string)))].slice(0, 10);
  if (emails.length === 0) return badRequest(res, 'Keine gültigen E-Mail-Adressen.');
  const cfg = await ensureAccessKey(await getBookingConfig());
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'hero-league.de');
  const link = `https://${host}/season2?zugang=${encodeURIComponent(cfg.accessKey)}`;
  const invites = await readInvites();
  const sent: string[] = [];
  const failed: string[] = [];
  for (const to of emails) {
    try {
      await sendBrandedMail({ to, from: FROM, ...inviteMail(cfg, link) });
      invites[to] = new Date().toISOString();
      sent.push(to);
    } catch {
      failed.push(to);
    }
  }
  await sql`INSERT INTO settings (key, value) VALUES ('season_booking_invites', ${JSON.stringify(invites)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json({ ok: true, sent, failed });
}

// Vorab-Schlüssel anlegen, falls noch keiner existiert.
async function ensureAccessKey(cfg: BookingConfig, force = false): Promise<BookingConfig> {
  if (cfg.accessKey && !force) return cfg;
  const abc = 'abcdefghjkmnpqrstuvwxyz23456789';
  let key = '';
  for (let i = 0; i < 10; i++) key += abc[randomInt(0, abc.length)];
  const next = { ...cfg, accessKey: key };
  await sql`INSERT INTO settings (key, value) VALUES ('season_booking', ${JSON.stringify(next)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return next;
}

async function adminBookingStatus(req: VercelRequest, res: VercelResponse) {
  const { id, status } = req.body ?? {};
  if (typeof id !== 'string' || !['pending', 'paid', 'cancelled'].includes(status)) return badRequest(res, 'Ungültig.');
  const rows = await sql`UPDATE season_bookings SET status = ${status},
      paid_at = ${status === 'paid' ? new Date().toISOString() : null}, updated_at = now()
    WHERE id = ${id} RETURNING ref, email, team_name AS "teamName", contact_name AS "contactName", package, price_cents AS "priceCents"`;
  const b = rows[0] as { ref: string; email: string; teamName: string; contactName: string; priceCents: number } | undefined;
  if (!b) return res.status(404).json({ error: 'Nicht gefunden' });
  if (status === 'paid' && req.body?.notify !== false) {
    const cfg = await getBookingConfig();
    try {
      await sendBrandedMail({
        to: b.email, from: FROM,
        subject: `Zahlung eingegangen – ${b.teamName} ist dabei! 🏆`,
        layout: {
          preheader: `Euer Startplatz für ${cfg.seasonLabel} ist fix.`,
          heading: 'Ihr seid dabei! 🏆', accent: ACCENT, accentDark: ACCENT_DARK,
          intro: `Hi ${b.contactName}, eure Zahlung über ${eur(b.priceCents)} (${b.ref}) ist eingegangen. Der Startplatz von „${b.teamName}" für ${cfg.seasonLabel} ist damit fix.`,
          bodyHtml: `<p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:0;">Alle weiteren Infos zum Start bekommt ihr rechtzeitig per E-Mail. Denkt an eure Trikots mit festen Rückennummern!</p>`,
          footnote: 'Fragen? Antworte einfach auf diese E-Mail.',
        },
        text: `Zahlung eingegangen – ${b.teamName} ist für ${cfg.seasonLabel} dabei! (${b.ref})`,
      });
    } catch {
      /* optional */
    }
  }
  return res.json({ ok: true });
}

async function adminBookingConfig(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') return res.json(await ensureAccessKey(await getBookingConfig()));
  const c = (req.body ?? {}) as Partial<BookingConfig> & { newKey?: boolean };
  const cur = await ensureAccessKey(await getBookingConfig(), c.newKey === true);
  const link = (v: unknown, fallback: string) => {
    const s = clamp(v, 500);
    return s === '' ? '' : /^https:\/\//i.test(s) ? s : fallback;
  };
  const cents = (v: unknown, fallback: number) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= 0 && n <= 10_000_000 ? n : fallback;
  };
  const openAt = clamp(c.openAt, 40);
  const next: BookingConfig = {
    published: c.published === true,
    open: c.open === true,
    preregOnly: c.preregOnly !== false,
    accessKey: cur.accessKey,
    seasonLabel: clamp(c.seasonLabel, 40) || cur.seasonLabel,
    startInfo: clamp(c.startInfo, 120),
    openAt: openAt && Number.isFinite(new Date(openAt).getTime()) ? new Date(openAt).toISOString() : '',
    earlyBirdDays: Math.min(60, Math.max(0, Math.round(Number(c.earlyBirdDays ?? cur.earlyBirdDays)) || 0)),
    deadlineBasis: c.deadlineBasis === 'payment' ? 'payment' : 'booking',
    priceOne: cents(c.priceOne, cur.priceOne),
    priceTwo: cents(c.priceTwo, cur.priceTwo),
    priceTwoEarly: cents(c.priceTwoEarly, cur.priceTwoEarly),
    payLinkOne: link(c.payLinkOne, cur.payLinkOne),
    payLinkTwo: link(c.payLinkTwo, cur.payLinkTwo),
    payLinkTwoEarly: link(c.payLinkTwoEarly, cur.payLinkTwoEarly),
    minSquad: Math.min(30, Math.max(1, Math.round(Number(c.minSquad ?? cur.minSquad)) || cur.minSquad)),
    maxSquad: Math.min(40, Math.max(1, Math.round(Number(c.maxSquad ?? cur.maxSquad)) || cur.maxSquad)),
    termsVersion: clamp(c.termsVersion, 60) || cur.termsVersion,
    terms: clamp(c.terms, 20000) || cur.terms,
    rules: clamp(c.rules, 30000) || cur.rules,
  };
  await sql`INSERT INTO settings (key, value) VALUES ('season_booking', ${JSON.stringify(next)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json(next);
}

// --- Dispatcher (aus seasonSignup aufgerufen) -------------------------------
export async function seasonBooking(req: VercelRequest, res: VercelResponse, action: string): Promise<boolean> {
  if (req.method === 'GET' && action === 'booking-config') return void (await bookingConfig(req, res)), true;
  if (req.method === 'POST' && action === 'booking-request-code') return void (await bookingRequestCode(req, res)), true;
  if (req.method === 'POST' && action === 'booking-verify') return void (await bookingVerify(req, res)), true;
  if (req.method === 'POST' && action === 'booking-submit') return void (await bookingSubmit(req, res)), true;
  if (action.startsWith('admin-booking')) {
    if (!(await requireSignups(req, res))) return true;
    if (req.method === 'GET' && action === 'admin-bookings') return void (await adminBookings(req, res)), true;
    if (req.method === 'POST' && action === 'admin-booking-status') return void (await adminBookingStatus(req, res)), true;
    if (action === 'admin-booking-config') return void (await adminBookingConfig(req, res)), true;
    if (req.method === 'POST' && action === 'admin-booking-delete') return void (await adminBookingDelete(req, res)), true;
    if (req.method === 'POST' && action === 'admin-booking-transfer') return void (await adminBookingTransfer(req, res)), true;
    if (req.method === 'GET' && action === 'admin-booking-invites') return void (await adminInvites(req, res)), true;
    if (req.method === 'POST' && action === 'admin-booking-invite') return void (await adminInvite(req, res)), true;
  }
  return false;
}
