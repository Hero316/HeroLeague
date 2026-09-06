// Tippspiel: öffentliche Anmeldung mit E-Mail-Bestätigung (6-stelliger Code),
// Bot-/Spam-Schutz und verifizierten Teilnehmern. Nur wer bestätigt ist, darf
// tippen – so haben wir für Gewinne saubere, echte Daten. Nutzt die gemeinsamen
// Bausteine aus publicforms.ts (wie die Season-Anmeldung & Event-Tickets).
import { createHash } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, getMatches } from './db.js';
import { getSession } from './auth.js';
import {
  checkCode, clientIp, codeBlock, isDisposableEmail, isEmail, issueCode,
  normEmail, sendBrandedMail, tooManyAttempts, verifyTurnstile,
} from './publicforms.js';

const PURPOSE = 'tipp';
const FROM = 'Hero League – Tippspiel <tippspiel@hero-league.de>';
const ACCENT = '#12A594';
const ACCENT_DARK = '#0C7A70';

type Tip = { id: string; matchId: string; voterId: string; voterName: string; home: number; away: number; at: string };

function badRequest(res: VercelResponse, error: string) {
  return res.status(400).json({ error });
}

// Stabile, aus der E-Mail abgeleitete Teilnehmer-ID (gleiche Mail = gleiche ID,
// auch auf einem neuen Gerät). Nicht zurückrechenbar (SHA-256 + Secret).
export function deriveVoterId(email: string): string {
  const pepper = process.env.SESSION_SECRET || '';
  return 'v-' + createHash('sha256').update(`tipp-user:${normEmail(email)}:${pepper}`).digest('hex').slice(0, 20);
}

// Tippschluss: 19:00 Uhr (Europe/Berlin) am Spieltag – DST-korrekt.
function tipDeadline(dateStr: string): Date {
  const noonUTC = new Date(`${dateStr}T12:00:00Z`);
  const berlinHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }).format(noonUTC));
  const off = berlinHour - 12;
  const sign = off >= 0 ? '+' : '-';
  return new Date(`${dateStr}T19:00:00${sign}${String(Math.abs(off)).padStart(2, '0')}:00`);
}

// Anzeigename für die Rangliste: „Vorname N." (echter Name, keine Fantasienamen).
function displayName(vorname: string, name: string): string {
  const v = vorname.trim();
  const initial = name.trim().charAt(0).toUpperCase();
  return initial ? `${v} ${initial}.` : v;
}

let tippSchemaReady = false;
async function ensureTippUsers(): Promise<void> {
  if (tippSchemaReady) return;
  try {
    await sql`CREATE TABLE IF NOT EXISTS tipp_users (
      email TEXT PRIMARY KEY,
      voter_id TEXT NOT NULL,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      age INTEGER,
      found_via TEXT,
      suggestion TEXT,
      verified BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      verified_at TIMESTAMPTZ
    )`;
    tippSchemaReady = true;
  } catch (err) {
    console.error('ensureTippUsers:', err);
  }
}

// --- Anmeldung: Code anfordern ---------------------------------------------
export async function registerRequestCode(req: VercelRequest, res: VercelResponse) {
  await ensureTippUsers();
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (typeof b.website === 'string' && b.website.trim() !== '') return res.json({ ok: true }); // Honeypot

  const vorname = typeof b.vorname === 'string' ? b.vorname.trim().slice(0, 40) : '';
  const name = typeof b.name === 'string' ? b.name.trim().slice(0, 40) : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  const ageNum = Number(b.age);
  const foundVia = typeof b.foundVia === 'string' ? b.foundVia.trim().slice(0, 40) : '';
  const suggestion = typeof b.suggestion === 'string' ? b.suggestion.trim().slice(0, 600) : '';
  const consent = b.consent === true;

  if (vorname.length < 2 || name.length < 2) return badRequest(res, 'Bitte Vor- und Nachnamen angeben.');
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (isDisposableEmail(email)) return badRequest(res, 'Bitte eine echte E-Mail-Adresse verwenden (keine Wegwerf-Adresse).');
  if (!Number.isFinite(ageNum) || ageNum < 6 || ageNum > 120) return badRequest(res, 'Bitte ein gültiges Alter eingeben.');
  if (!consent) return badRequest(res, 'Bitte der Datenverarbeitung zustimmen, um teilzunehmen.');

  const ip = clientIp(req);
  if (!(await verifyTurnstile(b.turnstileToken, ip))) return badRequest(res, 'Bot-Prüfung fehlgeschlagen. Bitte Seite neu laden.');
  if (await tooManyAttempts('tipp-code', ip, 8, 15)) return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });

  const normalized = normEmail(email);
  const voterId = deriveVoterId(normalized);
  const dName = displayName(vorname, name);

  // Ist diese E-Mail schon BESTÄTIGT angemeldet? Dann die gespeicherten Daten
  // NICHT überschreiben – wir schicken nur einen Code zum Wiedereinloggen. So
  // kann niemand mit einer fremden E-Mail ein bestehendes Profil kapern/ändern
  // (den Code bekommt ohnehin nur der echte Postfach-Inhaber).
  const existing = await sql`SELECT verified FROM tipp_users WHERE email = ${normalized} LIMIT 1`;
  const alreadyVerified = existing.length > 0 && existing[0].verified === true;

  if (!alreadyVerified) {
    // Neu oder noch unbestätigt: Profil anlegen/aktualisieren – aber nur solange
    // die E-Mail noch NICHT bestätigt ist (WHERE-Schutz gegen Überschreiben).
    await sql`
      INSERT INTO tipp_users (email, voter_id, first_name, last_name, display_name, age, found_via, suggestion, verified)
      VALUES (${normalized}, ${voterId}, ${vorname}, ${name}, ${dName}, ${Math.round(ageNum)}, ${foundVia || null}, ${suggestion || null}, false)
      ON CONFLICT (email) DO UPDATE SET
        first_name = EXCLUDED.first_name, last_name = EXCLUDED.last_name, display_name = EXCLUDED.display_name,
        age = EXCLUDED.age, found_via = EXCLUDED.found_via, suggestion = EXCLUDED.suggestion
      WHERE tipp_users.verified = false
    `;
  }

  const result = await issueCode(PURPOSE, normalized, async (code) => {
    await sendBrandedMail({
      to: normalized, from: FROM,
      subject: `Dein Tippspiel-Code: ${code}`,
      layout: {
        preheader: 'Bestätige deine E-Mail fürs Hero-League-Tippspiel.',
        heading: 'Tippspiel – E-Mail bestätigen', accent: ACCENT, accentDark: ACCENT_DARK,
        intro: `Fast geschafft, ${vorname}! Gib diesen Code im Tippspiel ein, um mitzuspielen:`,
        bodyHtml: codeBlock(code, ACCENT),
        footnote: 'Der Code ist 15 Minuten gültig. Wenn du das nicht warst, ignoriere diese E-Mail.',
      },
      text: `Dein Bestätigungs-Code fürs Hero-League-Tippspiel: ${code}\nGültig für 15 Minuten.`,
    });
  });
  if (!result.ok) return badRequest(res, result.error || 'Fehler.');
  return res.json({ ok: true, alreadyRegistered: alreadyVerified, ...(result.devCode ? { devCode: result.devCode } : {}) });
}

// --- Anmeldung: Code bestätigen --------------------------------------------
export async function registerVerify(req: VercelRequest, res: VercelResponse) {
  await ensureTippUsers();
  const b = (req.body ?? {}) as Record<string, unknown>;
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  if (!isEmail(email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  const check = await checkCode(PURPOSE, email, b.code);
  if (!check.ok) return badRequest(res, check.error || 'Code ungültig.');

  const normalized = normEmail(email);
  const rows = await sql`
    UPDATE tipp_users SET verified = true, verified_at = now()
    WHERE email = ${normalized}
    RETURNING voter_id AS "voterId", display_name AS "displayName"`;
  if (rows.length === 0) return badRequest(res, 'Bitte zuerst das Anmelde-Formular ausfüllen.');
  return res.json({ ok: true, email: normalized, voterId: rows[0].voterId as string, displayName: rows[0].displayName as string });
}

// Prüft, ob (email, voterId) ein bestätigter Teilnehmer ist. Liefert den
// Anzeigenamen zurück (oder null).
async function verifiedDisplayName(email: string, voterId: string): Promise<string | null> {
  const rows = await sql`
    SELECT display_name AS "displayName" FROM tipp_users
    WHERE email = ${normEmail(email)} AND voter_id = ${voterId} AND verified = true LIMIT 1`;
  return rows.length > 0 ? (rows[0].displayName as string) : null;
}

// --- Tipps lesen/schreiben (in settings-JSON, wie 'game'/'event') ----------
export async function getTips(_req: VercelRequest, res: VercelResponse) {
  const rows = await sql`SELECT value FROM settings WHERE key = 'tips'`;
  const store = (rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {}) as { tips?: Tip[] };
  return res.json({ tips: Array.isArray(store.tips) ? store.tips : [] });
}

export async function submitTip(req: VercelRequest, res: VercelResponse) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const matchId = typeof b.matchId === 'string' ? b.matchId.slice(0, 64) : '';
  const email = typeof b.email === 'string' ? b.email.trim() : '';
  const voterId = typeof b.voterId === 'string' ? b.voterId.slice(0, 64) : '';
  const hn = Number(b.home);
  const an = Number(b.away);

  if (!matchId || !isEmail(email) || !voterId) return res.status(400).json({ error: 'Fehlende Angaben.' });
  if (!Number.isFinite(hn) || !Number.isFinite(an)) return res.status(400).json({ error: 'Ungültiges Ergebnis.' });

  await ensureTippUsers();
  const name = await verifiedDisplayName(email, voterId);
  if (!name) return res.status(403).json({ error: 'Bitte zuerst zum Tippspiel anmelden und E-Mail bestätigen.' });

  const home = Math.max(0, Math.min(99, Math.floor(hn)));
  const away = Math.max(0, Math.min(99, Math.floor(an)));

  const matches = await getMatches();
  const match = matches.find((m) => m.id === matchId);
  if (!match) return res.status(404).json({ error: 'Spiel nicht gefunden.' });
  if (match.status !== 'geplant') return res.status(409).json({ error: 'Für dieses Spiel kann nicht mehr getippt werden.' });
  if (Date.now() >= tipDeadline(match.date).getTime()) {
    return res.status(409).json({ error: 'Tippschluss war um 19:00 Uhr am Spieltag – für diesen Abend ist kein Tipp mehr möglich.' });
  }

  const rows = await sql`SELECT value FROM settings WHERE key = 'tips'`;
  const store = (rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {}) as { tips?: Tip[] };
  const tips: Tip[] = Array.isArray(store.tips) ? store.tips : [];
  if (tips.some((t) => t.matchId === matchId && t.voterId === voterId)) {
    return res.status(409).json({ error: 'Du hast dieses Spiel bereits getippt.' });
  }

  const tip: Tip = { id: `tip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, matchId, voterId, voterName: name, home, away, at: new Date().toISOString() };
  tips.push(tip);
  const trimmed = tips.slice(-20000);
  await sql`
    INSERT INTO settings (key, value) VALUES ('tips', ${JSON.stringify({ tips: trimmed })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json(tip);
}

// --- Admin: Teilnehmerliste (für Gewinner-Auswahl) -------------------------
export async function adminListTippUsers(req: VercelRequest, res: VercelResponse) {
  const session = await getSession(req);
  if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });
  if (session.role !== 'superadmin') return res.status(403).json({ error: 'Keine Berechtigung.' });
  await ensureTippUsers();
  const rows = await sql`
    SELECT email, voter_id AS "voterId", first_name AS "firstName", last_name AS "lastName",
           display_name AS "displayName", age, found_via AS "foundVia", suggestion, verified,
           created_at AS "createdAt", verified_at AS "verifiedAt"
    FROM tipp_users ORDER BY created_at DESC`;
  return res.json({ users: rows });
}
