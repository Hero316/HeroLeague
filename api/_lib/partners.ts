import { randomUUID } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './db.js';
import { getSession, hasPermission } from './auth.js';
import { escapeHtml, sendMail } from './mail.js';
import { clientIp, isDisposableEmail, isEmail, mailLayout, normEmail, tooManyAttempts, verifyTurnstile } from './publicforms.js';

// ===========================================================================
// Partnerprogramm: Landingpage /partner + „Partner werden"-Formular.
//
// Alles über den bestehenden Endpunkt /api/signup?action=partner-… (kein
// neuer Endpunkt – Vercel-Hobby: max. 12 Funktionen). Daten in zwei
// Settings-Einträgen: 'partner_program' (An/Aus + Kennzahlen) und
// 'partner_requests' (eingegangene Anfragen). Bewusst ohne neue Tabelle.
// ===========================================================================

const FROM = 'Hero League – Partner <anmeldung@hero-league.de>';
const NOTIFY_TO = process.env.PARTNER_NOTIFY_EMAIL || process.env.SIGNUP_NOTIFY_EMAIL || process.env.ADMIN_2FA_EMAIL || '';
const GOLD = '#B8860B';
const GOLD_DARK = '#7A5A06';

export const PARTNER_TYPES = ['main', 'partner', 'team', 'other'] as const;
type PartnerType = (typeof PARTNER_TYPES)[number];
const TYPE_LABEL: Record<PartnerType, string> = {
  main: 'Hauptpartnerschaft',
  partner: 'Partnerschaft',
  team: 'Teampartner',
  other: 'Weitere / Event & Gewinnspiel',
};
const STATUSES = ['neu', 'kontakt', 'abgeschlossen', 'abgelehnt'] as const;
type RequestStatus = (typeof STATUSES)[number];

export interface PartnerStat {
  value: number;
  suffix: string; // z. B. „+"
  label: string;
  sub: string; // z. B. „letzte 30 Tage"
}
interface ProgramConfig {
  active: boolean;
  stats: PartnerStat[];
}
interface PartnerRequest {
  id: string;
  createdAt: string;
  status: RequestStatus;
  company: string;
  contact: string;
  email: string;
  phone: string;
  website: string;
  type: PartnerType;
  budget: string;
  message: string;
  consentAt: string;
  ip: string;
}

const DEFAULT_STATS: PartnerStat[] = [
  { value: 250000, suffix: '+', label: 'Aufrufe auf Instagram', sub: 'in den letzten 30 Tagen' },
  { value: 2000, suffix: '+', label: 'Besuche auf der Website', sub: 'in den letzten 30 Tagen' },
  { value: 100, suffix: '+', label: 'Klicks auf Partner-Logos', sub: 'in den letzten 30 Tagen' },
];
const DEFAULT_CONFIG: ProgramConfig = { active: false, stats: DEFAULT_STATS };

const clamp = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');

async function getConfig(): Promise<ProgramConfig> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'partner_program'`;
    const v = (rows[0]?.value || {}) as Partial<ProgramConfig>;
    return { active: v.active === true, stats: Array.isArray(v.stats) && v.stats.length ? v.stats : DEFAULT_STATS };
  } catch {
    return DEFAULT_CONFIG;
  }
}
async function getRequests(): Promise<PartnerRequest[]> {
  try {
    const rows = await sql`SELECT value FROM settings WHERE key = 'partner_requests'`;
    return Array.isArray(rows[0]?.value) ? (rows[0].value as PartnerRequest[]) : [];
  } catch {
    return [];
  }
}
async function saveRequests(list: PartnerRequest[]) {
  await sql`INSERT INTO settings (key, value) VALUES ('partner_requests', ${JSON.stringify(list.slice(0, 1000))}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
}
async function isAdmin(req: VercelRequest): Promise<boolean> {
  const s = await getSession(req).catch(() => null);
  return Boolean(s && hasPermission(s, 'signups'));
}

// --- öffentlich ----------------------------------------------------------------

async function publicConfig(req: VercelRequest, res: VercelResponse) {
  const cfg = await getConfig();
  const preview = !cfg.active && (await isAdmin(req));
  return res.json({ active: cfg.active, preview, stats: cfg.stats, turnstileSiteKey: process.env.TURNSTILE_SITE_KEY || '' });
}

async function apply(req: VercelRequest, res: VercelResponse) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const ip = clientIp(req);
  // Honeypot: Bots füllen das versteckte Feld – still „erfolgreich" antworten.
  if (clamp(b.website2, 200)) return res.json({ ok: true });

  const cfg = await getConfig();
  if (!cfg.active && !(await isAdmin(req))) return res.status(403).json({ error: 'Das Partnerprogramm ist gerade pausiert.' });
  if (await tooManyAttempts('partner-apply', ip, 5, 60)) return res.status(429).json({ error: 'Zu viele Anfragen – bitte später noch einmal versuchen.' });
  if (!(await verifyTurnstile(b.turnstileToken, ip))) return res.status(400).json({ error: 'Sicherheitsprüfung fehlgeschlagen. Bitte Seite neu laden.' });

  const company = clamp(b.company, 120);
  const contact = clamp(b.contact, 120);
  const emailRaw = clamp(b.email, 200);
  const phone = clamp(b.phone, 40);
  let website = clamp(b.website, 200);
  const type = PARTNER_TYPES.includes(b.type as PartnerType) ? (b.type as PartnerType) : null;
  const budget = clamp(b.budget, 40);
  const message = clamp(b.message, 3000);

  if (!company) return res.status(400).json({ error: 'Bitte den Namen eures Unternehmens angeben.' });
  if (!contact) return res.status(400).json({ error: 'Bitte eine Ansprechperson angeben.' });
  if (!isEmail(emailRaw)) return res.status(400).json({ error: 'Bitte eine gültige E-Mail-Adresse angeben.' });
  if (isDisposableEmail(emailRaw)) return res.status(400).json({ error: 'Bitte eine dauerhafte E-Mail-Adresse verwenden.' });
  if (!type) return res.status(400).json({ error: 'Bitte auswählen, welche Partnerschaft euch interessiert.' });
  if (message.length < 10) return res.status(400).json({ error: 'Erzählt uns kurz, wer ihr seid und was ihr euch vorstellt.' });
  if (b.acceptPrivacy !== true || b.acceptTerms !== true) return res.status(400).json({ error: 'Bitte beide Häkchen setzen.' });
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;

  const email = normEmail(emailRaw);
  const entry: PartnerRequest = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    status: 'neu',
    company,
    contact,
    email,
    phone,
    website,
    type,
    budget,
    message,
    consentAt: new Date().toISOString(),
    ip,
  };
  const list = await getRequests();
  await saveRequests([entry, ...list]);

  const row = (k: string, v: string) =>
    v ? `<tr><td style="padding:6px 10px 6px 0;color:#6b7472;font-size:13px;white-space:nowrap;vertical-align:top;">${k}</td><td style="padding:6px 0;color:#1d2433;font-size:14px;font-weight:700;">${v}</td></tr>` : '';
  const p = (s: string) => `<p style="font-family:Arial,Helvetica,sans-serif;color:#3a4441;font-size:14px;line-height:1.6;margin:0 0 12px;">${s}</p>`;

  // Benachrichtigung an uns – „Antworten" geht direkt an die Firma.
  if (NOTIFY_TO) {
    try {
      await sendMail({
        to: NOTIFY_TO,
        from: FROM,
        replyTo: email,
        subject: `🤝 Neue Partneranfrage: ${company} (${TYPE_LABEL[type]})`,
        html: mailLayout({
          preheader: `${contact} · ${TYPE_LABEL[type]}`,
          heading: 'Neue Partneranfrage',
          accent: GOLD,
          accentDark: GOLD_DARK,
          intro: `${company} interessiert sich für: ${TYPE_LABEL[type]}.`,
          bodyHtml:
            `<table role="presentation" cellpadding="0" cellspacing="0" style="font-family:Arial,Helvetica,sans-serif;margin:0 0 14px;">` +
            row('Unternehmen', escapeHtml(company)) +
            row('Ansprechperson', escapeHtml(contact)) +
            row('E-Mail', `<a href="mailto:${escapeHtml(email)}" style="color:${GOLD_DARK};">${escapeHtml(email)}</a>`) +
            row('Telefon', escapeHtml(phone)) +
            row('Website', website ? `<a href="${escapeHtml(website)}" style="color:${GOLD_DARK};">${escapeHtml(website)}</a>` : '') +
            row('Interesse', escapeHtml(TYPE_LABEL[type])) +
            row('Budget', escapeHtml(budget)) +
            `</table>` +
            `<div style="padding:14px;border:1px solid #e9e1c8;background:#fbf8ef;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#1d2433;font-size:14px;line-height:1.6;">${escapeHtml(message).replace(/\n/g, '<br>')}</div>` +
            p(`<br>Direkt auf diese Mail antworten – die Antwort geht an ${escapeHtml(contact)}. Alle Anfragen stehen im Backoffice unter „Partneranfragen".`),
          footnote: 'Automatische Nachricht vom Partner-Formular (/partner).',
        }),
        text: `Neue Partneranfrage\n\nUnternehmen: ${company}\nAnsprechperson: ${contact}\nE-Mail: ${email}\nTelefon: ${phone}\nWebsite: ${website}\nInteresse: ${TYPE_LABEL[type]}\nBudget: ${budget}\n\n${message}`,
      });
    } catch {
      /* Mail optional – Anfrage ist gespeichert */
    }
  }

  // Eingangsbestätigung an die Firma.
  try {
    await sendMail({
      to: email,
      from: FROM,
      replyTo: NOTIFY_TO || undefined,
      subject: 'Eure Partneranfrage bei der Hero League',
      html: mailLayout({
        preheader: 'Danke – wir melden uns persönlich bei euch.',
        heading: 'Anfrage ist angekommen 🤝',
        accent: GOLD,
        accentDark: GOLD_DARK,
        intro: `Hallo ${contact}, danke für euer Interesse an einer Partnerschaft mit der Hero League!`,
        bodyHtml:
          p(`Wir haben eure Anfrage für <strong>${escapeHtml(TYPE_LABEL[type])}</strong> erhalten und melden uns persönlich bei euch – in der Regel innerhalb von wenigen Tagen.`) +
          p('Im ersten Gespräch klären wir, was zu euch passt: Sichtbarkeit im Livestream, auf Website und Instagram, bei Events oder auf den Trikots eines Teams.') +
          p('Die Anfrage ist unverbindlich. Eine Partnerschaft entsteht erst mit einer schriftlichen Vereinbarung.'),
        footnote: 'Fragen? Antwortet einfach auf diese E-Mail.',
      }),
      text: `Hallo ${contact},\n\ndanke für eure Partneranfrage (${TYPE_LABEL[type]}). Wir melden uns persönlich bei euch.\n\nDie Anfrage ist unverbindlich – eine Partnerschaft entsteht erst mit einer schriftlichen Vereinbarung.\n\nHero League`,
    });
  } catch {
    /* optional */
  }

  return res.json({ ok: true });
}

// --- Admin ---------------------------------------------------------------------

async function adminList(_req: VercelRequest, res: VercelResponse) {
  const [cfg, list] = await Promise.all([getConfig(), getRequests()]);
  return res.json({ config: cfg, requests: list.map(({ ip: _ip, ...r }) => r) });
}

async function adminConfig(req: VercelRequest, res: VercelResponse) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const cur = await getConfig();
  const stats: PartnerStat[] = Array.isArray(b.stats)
    ? b.stats.slice(0, 8).map((s) => {
        const o = (s ?? {}) as Record<string, unknown>;
        return {
          value: Math.max(0, Math.min(1e10, Math.round(Number(o.value) || 0))),
          suffix: clamp(o.suffix, 6),
          label: clamp(o.label, 60),
          sub: clamp(o.sub, 60),
        };
      }).filter((s) => s.label)
    : cur.stats;
  const next: ProgramConfig = { active: typeof b.active === 'boolean' ? b.active : cur.active, stats: stats.length ? stats : DEFAULT_STATS };
  await sql`INSERT INTO settings (key, value) VALUES ('partner_program', ${JSON.stringify(next)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json(next);
}

async function adminStatus(req: VercelRequest, res: VercelResponse) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const id = clamp(b.id, 60);
  const status = STATUSES.includes(b.status as RequestStatus) ? (b.status as RequestStatus) : null;
  if (!id || !status) return res.status(400).json({ error: 'Ungültige Angaben.' });
  const list = await getRequests();
  const i = list.findIndex((r) => r.id === id);
  if (i < 0) return res.status(404).json({ error: 'Anfrage nicht gefunden.' });
  list[i] = { ...list[i], status };
  await saveRequests(list);
  return res.json({ ok: true });
}

async function adminDelete(req: VercelRequest, res: VercelResponse) {
  const id = clamp((req.body ?? {}).id, 60);
  if (!id) return res.status(400).json({ error: 'Ungültige Angaben.' });
  const list = await getRequests();
  await saveRequests(list.filter((r) => r.id !== id));
  return res.json({ ok: true });
}

// --- Dispatcher (aus seasonSignup aufgerufen) -----------------------------------
export async function partnerProgram(req: VercelRequest, res: VercelResponse, action: string): Promise<boolean> {
  if (!action.startsWith('partner-') && !action.startsWith('admin-partner')) return false;
  if (req.method === 'GET' && action === 'partner-config') return void (await publicConfig(req, res)), true;
  if (req.method === 'POST' && action === 'partner-apply') return void (await apply(req, res)), true;
  if (action.startsWith('admin-partner')) {
    const s = await getSession(req).catch(() => null);
    if (!s) return void res.status(401).json({ error: 'Nicht angemeldet' }), true;
    if (!hasPermission(s, 'signups')) return void res.status(403).json({ error: 'Keine Berechtigung.' }), true;
    if (req.method === 'GET' && action === 'admin-partner') return void (await adminList(req, res)), true;
    if (req.method === 'POST' && action === 'admin-partner-config') return void (await adminConfig(req, res)), true;
    if (req.method === 'POST' && action === 'admin-partner-status') return void (await adminStatus(req, res)), true;
    if (req.method === 'POST' && action === 'admin-partner-delete') return void (await adminDelete(req, res)), true;
  }
  res.status(404).json({ error: 'Unbekannte Aktion.' });
  return true;
}
