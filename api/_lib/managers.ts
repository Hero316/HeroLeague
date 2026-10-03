import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql, getTeams } from './db.js';
import { requireStaff, createManagerToken, verifyManagerToken } from './auth.js';
import { badRequest } from './validate.js';
import { checkCode, clientIp, codeBlock, isEmail, issueCode, normEmail, sendBrandedMail, tooManyAttempts } from './publicforms.js';
import { applyRosterToMatches, type RosterTeamIn } from './roster.js';

// ===========================================================================
// Team-Manager (Captains) melden ihren Abend-Kader selbst – /kader
//
//  • Im Backend hinterlegt der Admin je Team eine oder mehrere Manager-E-Mails
//    (settings key 'managers' = { teamId: [emails] }). Bewusst NICHT in der
//    teams-Tabelle: /api/teams ist öffentlich, die Adressen bleiben privat.
//  • Login: E-Mail → 6-stelliger Code per Mail → signierter Manager-Token
//    (nur für DIESES Team, 120 Tage gültig; Admin-Rechte gibt es damit keine).
//  • Gespeichert wird in DIESELBE Abend-Aufstellung wie im Schiedsrichtermodus
//    (settings 'roster', Schlüssel season:matchday) und auf die Spiele
//    übertragen → Schiri-App & Tracking-Center sehen es sofort.
//  • Gesperrt, sobald ein Spiel des Teams an dem Spieltag läuft/beendet ist
//    (ab dann entscheidet der Schiedsrichter).
// ===========================================================================

const PURPOSE = 'team-manager';
const FROM = 'Hero League – Manager <manager@hero-league.de>';
type ManagersMap = Record<string, string[]>;

async function getManagers(): Promise<ManagersMap> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'managers'`;
  const v = rows[0]?.value;
  if (!v || typeof v !== 'object') return {};
  const out: ManagersMap = {};
  for (const [teamId, list] of Object.entries(v as Record<string, unknown>)) {
    if (Array.isArray(list)) out[teamId] = list.filter((e): e is string => typeof e === 'string' && isEmail(e)).map(normEmail);
  }
  return out;
}

async function teamOfEmail(email: string): Promise<string | null> {
  const map = await getManagers();
  const e = normEmail(email);
  for (const [teamId, list] of Object.entries(map)) if (list.includes(e)) return teamId;
  return null;
}

// --- Admin: Manager-E-Mails je Team ------------------------------------------
export const adminGetManagers = requireStaff(async (_req: VercelRequest, res: VercelResponse) => {
  return res.json(await getManagers());
});

export const adminSaveManagers = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const teamId = typeof b.teamId === 'string' ? b.teamId.trim() : '';
  if (!teamId) return badRequest(res, 'Team fehlt.');
  const raw = Array.isArray(b.emails) ? b.emails : typeof b.emails === 'string' ? b.emails.split(/[\s,;]+/) : [];
  const emails = [...new Set(raw.filter((e): e is string => typeof e === 'string').map((e) => e.trim()).filter(Boolean))];
  const bad = emails.filter((e) => !isEmail(e));
  if (bad.length) return badRequest(res, `Ungültige E-Mail: ${bad.join(', ')}`);
  const map = await getManagers();
  const clean = emails.map(normEmail);
  // Eine Adresse gehört genau zu EINEM Team.
  for (const [tid, list] of Object.entries(map)) {
    if (tid === teamId) continue;
    const dup = list.filter((e) => clean.includes(e));
    if (dup.length) return badRequest(res, `${dup.join(', ')} ist schon bei einem anderen Team als Manager eingetragen.`);
  }
  if (clean.length) map[teamId] = clean;
  else delete map[teamId];
  await sql`INSERT INTO settings (key, value) VALUES ('managers', ${JSON.stringify(map)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  return res.json({ ok: true, teamId, emails: clean });
});

// --- Login --------------------------------------------------------------------
export async function managerRequestCode(req: VercelRequest, res: VercelResponse) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!isEmail(b.email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  if (await tooManyAttempts('manager-code', clientIp(req), 10, 15)) {
    return res.status(429).json({ error: 'Zu viele Versuche. Bitte später erneut.' });
  }
  const email = normEmail(b.email as string);
  const teamId = await teamOfEmail(email);
  if (!teamId) {
    return res.status(404).json({ error: 'Diese E-Mail ist keinem Team als Manager zugeordnet. Bitte bei der Liga melden.' });
  }
  const team = (await getTeams()).find((t) => t.id === teamId);
  const result = await issueCode(PURPOSE, email, async (code) => {
    await sendBrandedMail({
      to: email,
      from: FROM,
      subject: `Dein Kader-Code: ${code}`,
      layout: {
        preheader: 'Melde den Kader deines Teams für den Spieltag.',
        heading: 'Kader melden',
        accent: '#22DFC9',
        accentDark: '#0E6E62',
        intro: `Gib diesen Code ein, um den Abend-Kader von ${team?.name ?? 'deinem Team'} zu melden:`,
        bodyHtml: codeBlock(code, '#22DFC9'),
        footnote: 'Der Code ist 15 Minuten gültig. Danach bleibst du auf diesem Handy angemeldet.',
      },
      text: `Dein Kader-Code: ${code} (15 Minuten gültig)`,
    });
  });
  if (!result.ok) return badRequest(res, result.error || 'Fehler.');
  return res.json(result.devCode ? { ok: true, devCode: result.devCode } : { ok: true });
}

export async function managerVerify(req: VercelRequest, res: VercelResponse) {
  const b = (req.body ?? {}) as Record<string, unknown>;
  if (!isEmail(b.email)) return badRequest(res, 'Bitte eine gültige E-Mail-Adresse eingeben.');
  const email = normEmail(b.email as string);
  const check = await checkCode(PURPOSE, email, b.code);
  if (!check.ok) return badRequest(res, check.error || 'Code ungültig.');
  const teamId = await teamOfEmail(email);
  if (!teamId) return res.status(404).json({ error: 'Diese E-Mail ist keinem Team mehr zugeordnet.' });
  return res.json({ ok: true, token: await createManagerToken(email, teamId) });
}

// --- Kader lesen / speichern ----------------------------------------------------
type MatchRow = {
  id: string; matchday: number; date: string; time: string; status: string; field: number | null;
  homeTeamId: string; awayTeamId: string;
};

async function managerContext(req: VercelRequest, res: VercelResponse) {
  const auth = await verifyManagerToken((req.body ?? {}).token);
  if (!auth) { res.status(401).json({ error: 'Bitte neu anmelden.' }); return null; }
  // Darf diese E-Mail das Team noch? (Admin kann Manager jederzeit austragen.)
  if ((await teamOfEmail(auth.email)) !== auth.teamId) { res.status(401).json({ error: 'Kein Zugriff mehr – bitte neu anmelden.' }); return null; }
  const teams = await getTeams();
  const team = teams.find((t) => t.id === auth.teamId);
  if (!team) { res.status(404).json({ error: 'Team nicht gefunden.' }); return null; }
  const seasonRows = await sql`SELECT id FROM seasons WHERE is_current = true LIMIT 1`;
  const seasonId = (seasonRows[0]?.id as string) || '';
  const matches = seasonId
    ? ((await sql`SELECT id, matchday, date, time, status, field, home_team_id AS "homeTeamId", away_team_id AS "awayTeamId"
        FROM matches WHERE season_id = ${seasonId} AND (home_team_id = ${team.id} OR away_team_id = ${team.id})
        ORDER BY date, time`) as MatchRow[])
    : [];
  // Nächster Spieltag des Teams: erstes noch nicht beendetes Spiel.
  const nextMatch = matches.find((m) => m.status !== 'beendet') ?? null;
  const matchday = nextMatch ? Number(nextMatch.matchday) : null;
  const dayMatches = matchday === null ? [] : matches.filter((m) => Number(m.matchday) === matchday);
  const locked = dayMatches.some((m) => m.status === 'live' || m.status === 'beendet');
  return { auth, team, teams, seasonId, matchday, dayMatches, locked };
}

async function rosterMap(): Promise<Record<string, unknown>> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'roster'`;
  const v = rows[0]?.value;
  return (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
}

export async function managerGetRoster(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const { team, teams, seasonId, matchday, dayMatches, locked } = ctx;
  let saved: { present: string[]; goalkeeper?: string; at?: string } | null = null;
  if (matchday !== null) {
    const entry = (await rosterMap())[`${seasonId}:${matchday}`] as { teams?: Record<string, unknown> } | undefined;
    const t = entry?.teams?.[team.id] as { present?: unknown; goalkeeper?: unknown; at?: unknown } | undefined;
    if (t && Array.isArray(t.present)) {
      saved = {
        present: t.present.filter((p): p is string => typeof p === 'string'),
        goalkeeper: typeof t.goalkeeper === 'string' ? t.goalkeeper : undefined,
        at: typeof t.at === 'string' ? t.at : undefined,
      };
    }
  }
  const nameOf = (id: string) => teams.find((t) => t.id === id)?.name ?? '?';
  return res.json({
    team: { id: team.id, name: team.name, shortName: team.shortName, logoColor: team.logoColor, logoUrl: team.logoUrl ?? '',
      players: (team.spielerliste ?? []).map((p) => ({ name: p.name, imageUrl: p.imageUrl ?? '', number: p.number ?? null, goalkeeper: !!p.goalkeeper, captain: !!p.captain })) },
    matchday,
    locked,
    matches: dayMatches.map((m) => ({
      id: m.id, date: m.date, time: m.time, field: m.field ?? 1, status: m.status,
      opponent: nameOf(m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId),
    })),
    saved,
  });
}

export async function managerSaveRoster(req: VercelRequest, res: VercelResponse) {
  const ctx = await managerContext(req, res);
  if (!ctx) return;
  const { team, seasonId, matchday, locked } = ctx;
  if (!seasonId || matchday === null) return badRequest(res, 'Für dein Team steht gerade kein Spieltag an.');
  if (locked) return res.status(409).json({ error: 'Der Spieltag läuft schon – Änderungen bitte direkt beim Schiedsrichter.' });
  const b = (req.body ?? {}) as Record<string, unknown>;
  const kader = new Set((team.spielerliste ?? []).map((p) => p.name));
  const present = [...new Set((Array.isArray(b.present) ? b.present : []).filter((p): p is string => typeof p === 'string' && kader.has(p)))];
  const gk = typeof b.goalkeeper === 'string' && present.includes(b.goalkeeper) ? b.goalkeeper : '';
  const teamEntry: RosterTeamIn & { by: string; at: string } = gk
    ? { present, goalkeeper: gk, by: 'manager', at: new Date().toISOString() }
    : { present, by: 'manager', at: new Date().toISOString() };

  // In die bestehende Abend-Aufstellung EINFÜGEN (andere Teams + Spieldauer bleiben).
  const map = await rosterMap();
  const key = `${seasonId}:${matchday}`;
  const entry = (map[key] && typeof map[key] === 'object' ? map[key] : {}) as { minutes?: number; teams?: Record<string, unknown> };
  const minutes = Number.isFinite(Number(entry.minutes)) ? Number(entry.minutes) : 8;
  map[key] = { ...entry, minutes, teams: { ...(entry.teams ?? {}), [team.id]: teamEntry } };
  await sql`INSERT INTO settings (key, value) VALUES ('roster', ${JSON.stringify(map)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  await applyRosterToMatches(seasonId, matchday, { [team.id]: { present, ...(gk ? { goalkeeper: gk } : {}) } }, minutes);
  return res.json({ ok: true, present, goalkeeper: gk || null, at: teamEntry.at });
}
