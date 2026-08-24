// Season-2-Team-Anmeldung (öffentlich, unverbindlich). Teams bekunden Interesse;
// bestehende Captains (Season 1) werden per hinterlegter E-Mail erkannt. Alles
// bot-geschützt über E-Mail-Bestätigung (Code) + Rate-Limit + Wegwerf-Mail-Sperre.
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { sql } from './db.js';
import { getSession } from './auth.js';
import { badRequest } from './validate.js';
import {
  checkCode, clientIp, codeBlock, isDisposableEmail, isEmail, issueCode, mailLayout,
  normEmail, sendBrandedMail, tooManyAttempts, verifyTurnstile,
} from './publicforms.js';

const PURPOSE = 'season-signup';
const FROM = 'Hero League – Anmeldung <anmeldung@hero-league.de>';
const ACCENT = '#12A594';
const ACCENT_DARK = '#0C7A70';

// --- Konfiguration & Captains (in settings) ---------------------------------
interface SignupConfig {
  open: boolean;
  seasonLabel: string; // z.B. "Season 2"
  startInfo: string; // z.B. "Start voraussichtlich März 2027"
  minSquad: number;
  maxSquad: number;
  note: string; // Hinweis-Text (unverbindlich)
}
const DEFAULT_CONFIG: SignupConfig = {
  open: true,
  seasonLabel: 'Season 2',
  startInfo: 'Start im März 2027',
  minSquad: 8,
  maxSquad: 12,
  note: 'Diese Anmeldung ist eine unverbindliche Vorregistrierung und noch KEIN garantierter Startplatz in Season 2. ABER: Wer sich jetzt meldet, hat eine deutlich höhere Chance, dabei zu sein (eine 100%-Garantie ist es trotzdem nicht). Sie hilft uns bei der Planung – wir melden uns danach persönlich bei euch.',
};
interface Captain { email: string; teamName: string; }

async function getConfig(): Promise<SignupConfig> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'season_signup'`;
    const v = rows[0]?.value as Partial<SignupConfig> | undefined;
    return { ...DEFAULT_CONFIG, ...(v || {}) };
  } catch {
    return DEFAULT_CONFIG;
  }
}
async function getCaptains(): Promise<Captain[]> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'season_captains'`;
    const v = rows[0]?.value as Captain[] | undefined;
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

// --- Eingaben säubern -------------------------------------------------------
const clamp = (v: unknown, max: number): string => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const clampInt = (v: unknown, lo: number, hi: number): number | null => {
  if (v === null || v === undefined || v === '') return null; // „nicht ausgefüllt" bleibt null
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null;
};

// --- Öffentliche Aktionen ---------------------------------------------------

// Öffentliche Konfiguration + (öffentlicher) Turnstile-Site-Key fürs Frontend.
async function publicConfig(_req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  return res.json({ ...cfg, turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' });
}

// Captain-Erkennung: Ist diese E-Mail als Season-1-Captain hinterlegt?
async function captainLookup(req: VercelRequest, res: VercelResponse) {
  const email = req.body?.email;
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (await tooManyAttempts('signup-lookup', clientIp(req), 20, 10)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte kurz warten.' });
  }
  const captains = await getCaptains();
  const found = captains.find((c) => normEmail(c.email) === normEmail(email));
  return res.json({ found: !!found, teamName: found?.teamName || '' });
}

// Bestätigungs-Code anfordern.
async function requestCode(req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'Die Anmeldung ist derzeit geschlossen.' });
  const { email, website, turnstileToken } = req.body ?? {};
  if (typeof website === 'string' && website.trim() !== '') return res.json({ ok: true }); // Honeypot
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (isDisposableEmail(email)) return badRequest(res, 'Bitte eine echte E-Mail-Adresse verwenden (keine Wegwerf-Adresse).');
  const ip = clientIp(req);
  if (!(await verifyTurnstile(turnstileToken, ip))) return badRequest(res, 'Bot-Prüfung fehlgeschlagen. Bitte Seite neu laden.');
  if (await tooManyAttempts('signup-code', ip, 8, 15)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });

  const result = await issueCode(PURPOSE, email, async (code) => {
    await sendBrandedMail({
      to: normEmail(email), from: FROM,
      subject: `Dein Bestätigungs-Code: ${code}`,
      layout: {
        preheader: 'Bestätige deine E-Mail für die Season-2-Anmeldung.',
        heading: 'E-Mail bestätigen', accent: ACCENT, accentDark: ACCENT_DARK,
        intro: `Fast geschafft! Gib diesen Code im Anmelde-Formular ein, um eure ${cfg.seasonLabel}-Anmeldung abzuschließen:`,
        bodyHtml: codeBlock(code, ACCENT),
        footnote: `Der Code ist ${15} Minuten gültig. Wenn du das nicht warst, ignoriere diese E-Mail.`,
      },
      text: `Dein Bestätigungs-Code für die Hero-League-Anmeldung: ${code}\nGültig für 15 Minuten.`,
    });
  });
  if (!result.ok) return badRequest(res, result.error || "Fehler.");
  return res.json(result.devCode ? { ok: true, devCode: result.devCode } : { ok: true });
}

const clampRating = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : null;
};
const RATING_KEYS = ['technik', 'ausdauer', 'tempo', 'uebersicht', 'abschluss'] as const;
function buildRatings(src: unknown): Record<string, number | null> {
  const r = (src && typeof src === 'object' ? src : {}) as Record<string, unknown>;
  const out: Record<string, number | null> = {};
  for (const k of RATING_KEYS) out[k] = clampRating(r[k]);
  return out;
}

// Gemeinsames Speichern + Bestätigungs-Mail (Team ODER Spieler).
async function saveSignup(req: VercelRequest, res: VercelResponse, opts: {
  entry: 'team' | 'player'; kind: string; teamName: string; contactName: string;
  data: Record<string, unknown>; seasonLabel: string; note: string;
  mailHeading: string; mailIntro: string; mailText: string;
}) {
  const id = randomUUID();
  const email = normEmail(String((req.body ?? {}).email));
  const ip = clientIp(req);
  // Eine Anmeldung pro E-Mail: bestehende (bestätigte) aktualisieren.
  await sql`INSERT INTO season_signups
      (id, email, email_verified, status, entry, kind, team_name, contact_name, data, ip, created_at, updated_at)
    VALUES (${id}, ${email}, true, 'confirmed', ${opts.entry}, ${opts.kind}, ${opts.teamName}, ${opts.contactName}, ${JSON.stringify(opts.data)}::jsonb, ${ip}, now(), now())
    ON CONFLICT (email) DO UPDATE SET
      status = 'confirmed', email_verified = true, entry = EXCLUDED.entry, kind = EXCLUDED.kind,
      team_name = EXCLUDED.team_name, contact_name = EXCLUDED.contact_name,
      data = EXCLUDED.data, updated_at = now()`;
  try {
    await sendBrandedMail({
      to: email, from: FROM,
      subject: `Anmeldung eingegangen – ${opts.contactName || opts.teamName}`,
      layout: {
        preheader: 'Wir haben deine Vorregistrierung für Season 2 erhalten.',
        heading: opts.mailHeading, accent: ACCENT, accentDark: ACCENT_DARK,
        intro: opts.mailIntro,
        bodyHtml: `<p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:0;">
          <strong>Wichtig:</strong> ${opts.note}</p>`,
        footnote: 'Fragen? Antworte einfach auf diese E-Mail.',
      },
      text: `${opts.mailText}\n\nWichtig: ${opts.note}`,
    });
  } catch { /* Mail optional */ }
  return res.json({ ok: true });
}

// Anmeldung abschließen (Code prüfen + speichern + Bestätigungs-Mail).
async function submit(req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  if (!cfg.open) return res.status(403).json({ error: 'Die Anmeldung ist derzeit geschlossen.' });
  const b = req.body ?? {};
  if (typeof b.website === 'string' && b.website.trim() !== '') return res.json({ ok: true }); // Honeypot
  if (!isEmail(b.email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  const check = await checkCode(PURPOSE, b.email, b.code);
  if (!check.ok) return badRequest(res, check.error || 'Code ungültig.');
  if (b.consent !== true) return badRequest(res, 'Bitte bestätige den Hinweis zur unverbindlichen Anmeldung.');

  // --- Spieler-Anmeldung ----------------------------------------------------
  if (b.entry === 'player') {
    const name = clamp(b.name, 80);
    if (!name) return badRequest(res, 'Bitte deinen Namen angeben.');
    const ptype = b.playerType === 'verein' ? 'verein' : b.playerType === 'hobby' ? 'hobby' : '';
    if (!ptype) return badRequest(res, 'Bitte auswählen: Verein oder Hobby.');
    const data = {
      name, phone: clamp(b.phone, 40), age: clampInt(b.age, 12, 80),
      playerType: ptype,
      position: ['tor', 'abwehr', 'mittelfeld', 'sturm', 'flexibel'].includes(b.position) ? b.position : '',
      foot: ['links', 'rechts', 'beid'].includes(b.foot) ? b.foot : '',
      ratings: buildRatings(b.ratings),
      motivation: clamp(b.motivation, 800),
      heardFrom: ['internet', 'social', 'freunde', 'kontakte', 'sonstiges'].includes(b.heardFrom) ? b.heardFrom : '',
      // Verein-spezifisch
      club: clamp(b.club, 80),
      league: clamp(b.league, 60),
      // Hobby-spezifisch
      years: clampInt(b.years, 0, 60),
      frequency: ['selten', 'monatlich', 'woechentlich', 'mehrmals'].includes(b.frequency) ? b.frequency : '',
    };
    return saveSignup(req, res, {
      entry: 'player', kind: ptype, teamName: '', contactName: name, data,
      seasonLabel: cfg.seasonLabel, note: cfg.note,
      mailHeading: 'Anmeldung eingegangen ✅',
      mailIntro: `Danke, ${name}! Wir haben deine Spieler-Vorregistrierung für ${cfg.seasonLabel} erhalten.`,
      mailText: `Danke, ${name}! Deine Spieler-Vorregistrierung für ${cfg.seasonLabel} ist eingegangen.`,
    });
  }

  // --- Team-Anmeldung -------------------------------------------------------
  const teamName = clamp(b.teamName, 80);
  const contactName = clamp(b.contactName, 80);
  if (!teamName) return badRequest(res, 'Bitte einen Teamnamen angeben.');
  if (!contactName) return badRequest(res, 'Bitte einen Ansprechpartner angeben.');
  const kind = b.kind === 'returning' ? 'returning' : 'new';
  // „Bestehendes Team" nur mit hinterlegter Captain-E-Mail (serverseitig hart).
  if (kind === 'returning') {
    const captains = await getCaptains();
    if (!captains.find((c) => normEmail(c.email) === normEmail(b.email))) {
      return badRequest(res, 'Diese E-Mail-Adresse gehört zu keinem Season-1-Team.');
    }
  }
  const data = {
    teamName, contactName, phone: clamp(b.phone, 40), kind,
    s1TeamName: clamp(b.s1TeamName, 80),
    keepName: b.keepName === true,
    rosterChange: ['same', 'minor', 'major'].includes(b.rosterChange) ? b.rosterChange : '',
    squadSize: clampInt(b.squadSize, cfg.minSquad, cfg.maxSquad),
    avgAge: clamp(b.avgAge, 20),
    level: ['hobby', 'mixed', 'ambitioniert'].includes(b.level) ? b.level : '',
    clubPlayers: clampInt(b.clubPlayers, 0, 30),
    hobbyPlayers: clampInt(b.hobbyPlayers, 0, 30),
    motivation: clamp(b.motivation, 800),
    heardFrom: ['internet', 'social', 'freunde', 'kontakte', 'sonstiges'].includes(b.heardFrom) ? b.heardFrom : '',
  };
  return saveSignup(req, res, {
    entry: 'team', kind, teamName, contactName, data,
    seasonLabel: cfg.seasonLabel, note: cfg.note,
    mailHeading: 'Anmeldung eingegangen ✅',
    mailIntro: `Danke, ${contactName}! Wir haben die Vorregistrierung von „${teamName}" für ${cfg.seasonLabel} erhalten.`,
    mailText: `Danke, ${contactName}! Eure Vorregistrierung für ${cfg.seasonLabel} (Team „${teamName}") ist eingegangen.`,
  });
}

// --- Admin-Aktionen (nur Super-Admin) ---------------------------------------
async function requireSuper(req: VercelRequest, res: VercelResponse): Promise<boolean> {
  const session = await getSession(req);
  if (!session) { res.status(401).json({ error: 'Nicht angemeldet' }); return false; }
  if (session.role !== 'superadmin') { res.status(403).json({ error: 'Keine Berechtigung.' }); return false; }
  return true;
}

async function adminList(_req: VercelRequest, res: VercelResponse) {
  const rows = await sql`SELECT id, email, status, entry, kind,
      team_name AS "teamName", contact_name AS "contactName",
      email_verified AS "emailVerified",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM season_signups ORDER BY created_at DESC`;
  return res.json(rows);
}
async function adminDetail(req: VercelRequest, res: VercelResponse) {
  const id = String(req.query.id ?? '');
  const rows = await sql`SELECT id, email, status, entry, kind, team_name AS "teamName", contact_name AS "contactName",
      email_verified AS "emailVerified", data, ip, created_at AS "createdAt", updated_at AS "updatedAt"
    FROM season_signups WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0) return res.status(404).json({ error: 'Nicht gefunden' });
  return res.json(rows[0]);
}
async function adminDelete(req: VercelRequest, res: VercelResponse) {
  const id = String(req.body?.id ?? '');
  if (!id) return badRequest(res, 'ID fehlt.');
  await sql`DELETE FROM season_signups WHERE id = ${id}`;
  return res.json({ ok: true });
}
async function adminGetConfig(_req: VercelRequest, res: VercelResponse) {
  return res.json({ config: await getConfig(), captains: await getCaptains(), turnstileActive: !!process.env.TURNSTILE_SECRET });
}
async function adminSaveConfig(req: VercelRequest, res: VercelResponse) {
  const b = req.body ?? {};
  if (b.config && typeof b.config === 'object') {
    const c = b.config;
    const cfg: SignupConfig = {
      open: c.open !== false,
      seasonLabel: clamp(c.seasonLabel, 40) || DEFAULT_CONFIG.seasonLabel,
      startInfo: clamp(c.startInfo, 120),
      minSquad: clampInt(c.minSquad, 1, 30) ?? 8,
      maxSquad: clampInt(c.maxSquad, 1, 30) ?? 12,
      note: clamp(c.note, 600) || DEFAULT_CONFIG.note,
    };
    await sql`INSERT INTO settings (key, value) VALUES ('season_signup', ${JSON.stringify(cfg)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  if (Array.isArray(b.captains)) {
    const captains: Captain[] = b.captains
      .filter((c: unknown) => c && typeof c === 'object' && isEmail((c as Captain).email))
      .map((c: Captain) => ({ email: normEmail(c.email), teamName: clamp(c.teamName, 80) }))
      .slice(0, 50);
    await sql`INSERT INTO settings (key, value) VALUES ('season_captains', ${JSON.stringify(captains)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  }
  return res.json({ ok: true });
}

// --- Dispatcher -------------------------------------------------------------
export async function seasonSignup(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  const action = String(req.query.action ?? '');

  // Öffentliche Aktionen
  if (req.method === 'GET' && action === 'config') return publicConfig(req, res);
  if (req.method === 'POST' && action === 'captain-lookup') return captainLookup(req, res);
  if (req.method === 'POST' && action === 'request-code') return requestCode(req, res);
  if (req.method === 'POST' && action === 'submit') return submit(req, res);

  // Admin-Aktionen
  if (action.startsWith('admin')) {
    if (!(await requireSuper(req, res))) return;
    if (req.method === 'GET' && action === 'admin-list') return adminList(req, res);
    if (req.method === 'GET' && action === 'admin-detail') return adminDetail(req, res);
    if (req.method === 'POST' && action === 'admin-delete') return adminDelete(req, res);
    if (req.method === 'GET' && action === 'admin-config') return adminGetConfig(req, res);
    if (req.method === 'POST' && action === 'admin-config') return adminSaveConfig(req, res);
  }
  return res.status(400).json({ error: 'Unbekannte Aktion' });
}
