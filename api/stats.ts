import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requireStaff, getSession } from './_lib/auth.js';
import { badRequest, isNonEmptyString } from './_lib/validate.js';
import { sheetInfo } from './_lib/gsheets.js';
import { exportLeagueDay } from './_lib/sheetExport.js';
import { readDemo } from './_lib/demo.js';

// ===========================================================================
// Statistics Center — Roh-Zähler je Spieler & Spiel + Score-Einstellungen.
// Bewusst „dumme" Ablage: der Server speichert und liefert nur die Zähler und
// die Einstellungen. Note, Quoten und Kartenwerte rechnet die Website aus diesen
// Daten (src/lib/rating.ts). So bleibt die Rechenlogik an genau einer Stelle.
//
//  GET  /api/stats?resource=scoring            -> Score-Einstellungen (roh; Website mergt mit Defaults)
//  POST /api/stats?resource=scoring            -> Einstellungen speichern (Staff)
//  GET  /api/stats?resource=live               -> veröffentlichte Spieltag-Schlüssel (string[])
//  POST /api/stats?resource=publish            -> { dayKey, live } schalten (Staff)
//  GET  /api/stats?resource=day&day=KEY        -> { rows, live } für einen Spieltag/Abend (eingeloggt)
//  GET  /api/stats?resource=match&matchId=ID   -> { rows } für ein Spiel (eingeloggt)
//  POST /api/stats?resource=tally              -> eine Spieler-Zeile speichern (Staff)
// ===========================================================================

let statsEnsured = false;
async function ensureStats(): Promise<void> {
  if (statsEnsured) return;
  try {
    await sql`SELECT day_key FROM match_player_stats LIMIT 1`;
    statsEnsured = true;
    return;
  } catch {
    /* Tabelle fehlt -> unten anlegen */
  }
  statsEnsured = true;
  try {
    await sql`CREATE TABLE IF NOT EXISTS match_player_stats (
      day_key     TEXT NOT NULL,
      match_id    TEXT NOT NULL,
      team_id     TEXT NOT NULL,
      player_name TEXT NOT NULL,
      role        TEXT NOT NULL DEFAULT 'field',
      counts      JSONB NOT NULL DEFAULT '{}',
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (match_id, team_id, player_name))`;
    await sql`CREATE INDEX IF NOT EXISTS idx_match_player_stats_day ON match_player_stats(day_key)`;
  } catch (err) {
    console.error('ensureStats:', err);
  }
}

// Zähler säubern: nur bekannte-artige Schlüssel (kurz, a-z_) mit ganzzahligen,
// positiven Werten; hart begrenzt gegen Müll.
function sanitizeCounts(raw: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw || typeof raw !== 'object') return out;
  const r = raw as Record<string, unknown>;
  let n = 0;
  for (const key of Object.keys(r)) {
    if (n >= 40) break;
    if (!/^[a-z_]{2,30}$/.test(key)) continue;
    const v = r[key];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
      out[key] = Math.min(999, Math.floor(v));
      n++;
    }
  }
  return out;
}

interface StatRow {
  dayKey: string;
  matchId: string;
  teamId: string;
  playerName: string;
  role: string;
  counts: Record<string, number>;
}

async function readLiveDays(): Promise<string[]> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'tracking-live'`;
  const days = (rows[0]?.value as { days?: unknown })?.days;
  return Array.isArray(days) ? days.filter((d): d is string => typeof d === 'string') : [];
}

// --- Schreib-Handler (Staff) -----------------------------------------------

const saveScoring = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return badRequest(res, 'Ungültige Einstellungen.');
  }
  await sql`
    INSERT INTO settings (key, value) VALUES ('scoring', ${JSON.stringify(body)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json({ ok: true });
});

const saveTally = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as Partial<StatRow>;
  if (!isNonEmptyString(b.dayKey) || !isNonEmptyString(b.matchId)) {
    return badRequest(res, 'dayKey und matchId sind Pflicht.');
  }
  if (!isNonEmptyString(b.teamId) || !isNonEmptyString(b.playerName)) {
    return badRequest(res, 'teamId und playerName sind Pflicht.');
  }
  const role = b.role === 'keeper' ? 'keeper' : 'field';
  const counts = sanitizeCounts(b.counts);
  await sql`
    INSERT INTO match_player_stats (day_key, match_id, team_id, player_name, role, counts, updated_at)
    VALUES (${b.dayKey}, ${b.matchId}, ${b.teamId}, ${b.playerName}, ${role}, ${JSON.stringify(counts)}::jsonb, now())
    ON CONFLICT (match_id, team_id, player_name)
    DO UPDATE SET counts = EXCLUDED.counts, role = EXCLUDED.role, day_key = EXCLUDED.day_key, updated_at = now()
  `;
  return res.json({ ok: true });
});

// Verbindungstest zum Google Sheet (schreibt nichts – liest nur Titel/Blätter).
const testSheet = requireStaff(async (_req: VercelRequest, res: VercelResponse) => {
  try {
    const info = await sheetInfo();
    return res.json({ ok: true, ...info });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
  }
});

// Einen Liga-Spieltag aus der DB in das Google Sheet kopieren (manuell, per Knopf).
const exportDay = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const dayKey = (req.body ?? {}).dayKey;
  if (!isNonEmptyString(dayKey)) return badRequest(res, 'dayKey fehlt.');
  if (!dayKey.startsWith('s:')) return res.status(400).json({ error: 'Excel-Kopie aktuell nur für Liga-Spieltage.' });
  // Harte Absicherung: Demo-Daten dürfen NIE ins echte Sheet.
  const demo = await readDemo();
  if (demo?.active && dayKey.startsWith(`s:${demo.seasonId}:`)) {
    return res.status(400).json({ error: 'Excel-Kopie im Demo-Modus deaktiviert.' });
  }
  try {
    const rows = (await sql`
      SELECT match_id AS "matchId", team_id AS "teamId", player_name AS "playerName", role, counts
      FROM match_player_stats WHERE day_key = ${dayKey}`) as {
      matchId: string;
      teamId: string;
      playerName: string;
      role: string;
      counts: Record<string, number>;
    }[];
    const summary = await exportLeagueDay(dayKey, rows);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Export-Fehler' });
  }
});

const savePublish = requireStaff(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { dayKey?: unknown; live?: unknown };
  if (!isNonEmptyString(b.dayKey)) return badRequest(res, 'dayKey ist Pflicht.');
  const current = new Set(await readLiveDays());
  if (b.live) current.add(b.dayKey);
  else current.delete(b.dayKey);
  const days = [...current];
  await sql`
    INSERT INTO settings (key, value) VALUES ('tracking-live', ${JSON.stringify({ days })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json({ days });
});

// --- Dispatcher -------------------------------------------------------------

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    await ensureStats();
    const resource = req.query.resource;

    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');

      if (resource === 'scoring') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'scoring'`;
        return res.json(rows[0]?.value ?? {});
      }
      if (resource === 'live') {
        return res.json(await readLiveDays());
      }

      // ÖFFENTLICH: nur veröffentlichte (live geschaltete) Spieltage. Für die
      // Website (Spieler-Karten, Spielbericht). Optional auf eine Saison gefiltert.
      if (resource === 'public') {
        const season = typeof req.query.season === 'string' ? req.query.season : '';
        const live = await readLiveDays();
        const days = season ? live.filter((d) => d.startsWith(`s:${season}:`)) : live;
        if (days.length === 0) return res.json({ rows: [], days: [] });
        const rows = (await sql`
          SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                 player_name AS "playerName", role, counts
          FROM match_player_stats WHERE day_key = ANY(${days}::text[])`) as StatRow[];
        return res.json({ rows, days });
      }

      // Roh-Daten je Spieltag/Spiel nur für eingeloggte Nutzer (Entwürfe sind intern).
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

      if (resource === 'day') {
        const day = typeof req.query.day === 'string' ? req.query.day : '';
        if (!day) return badRequest(res, 'day fehlt.');
        const rows = (await sql`
          SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                 player_name AS "playerName", role, counts
          FROM match_player_stats WHERE day_key = ${day}`) as StatRow[];
        const live = (await readLiveDays()).includes(day);
        return res.json({ rows, live });
      }
      if (resource === 'match') {
        const matchId = typeof req.query.matchId === 'string' ? req.query.matchId : '';
        if (!matchId) return badRequest(res, 'matchId fehlt.');
        const rows = (await sql`
          SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                 player_name AS "playerName", role, counts
          FROM match_player_stats WHERE match_id = ${matchId}`) as StatRow[];
        return res.json({ rows });
      }
      return badRequest(res, 'Unbekannte Ressource.');
    }

    if (req.method === 'POST') {
      if (resource === 'scoring') return saveScoring(req, res);
      if (resource === 'tally') return saveTally(req, res);
      if (resource === 'publish') return savePublish(req, res);
      if (resource === 'sheet-test') return testSheet(req, res);
      if (resource === 'export') return exportDay(req, res);
      return badRequest(res, 'Unbekannte Ressource.');
    }

    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/stats:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
