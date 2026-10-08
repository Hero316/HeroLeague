import type { VercelRequest, VercelResponse } from '@vercel/node';
import { sql } from './_lib/db.js';
import { requirePermission, getSession } from './_lib/auth.js';
import type { SessionPayload } from './_lib/auth.js';
import { badRequest, isNonEmptyString } from './_lib/validate.js';
import { sheetInfo } from './_lib/gsheets.js';
import { exportLeagueDay, exportScoringConfig } from './_lib/sheetExport.js';
import { readDemo } from './_lib/demo.js';
import { isGeminiConfigured, uploadAudio, parseTracking, type VoiceContext, type RosterPlayer } from './_lib/gemini.js';
import { list as listBlobs } from '@vercel/blob';

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

// Voice-Tracking (Audio-Upload zu Gemini + Auswertung) kann bei langen
// Aufnahmen dauern – daher die maximale Laufzeit ausschöpfen.
export const config = { maxDuration: 300 };

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

// Veröffentlichung: `days` = für ALLE live, `previewDays` = Vorschau NUR für
// Super-Admins (die ganze Website mit Stats, z. B. um Insta-Posts vorzubereiten,
// bevor es alle sehen). Schlüssel: Spieltag/Event-dayKey oder `match:<id>`.
async function readLive(): Promise<{ days: string[]; previewDays: string[] }> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'tracking-live'`;
  const v = (rows[0]?.value ?? {}) as { days?: unknown; previewDays?: unknown };
  const list = (x: unknown) => (Array.isArray(x) ? x.filter((d): d is string => typeof d === 'string') : []);
  return { days: list(v.days), previewDays: list(v.previewDays) };
}
async function readLiveDays(): Promise<string[]> {
  return (await readLive()).days;
}
async function writeLive(days: string[], previewDays: string[]): Promise<void> {
  await sql`
    INSERT INTO settings (key, value) VALUES ('tracking-live', ${JSON.stringify({ days, previewDays })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
}
// Was darf DIESE Anfrage sehen? Super-Admins zusätzlich die Vorschau.
async function visibleLive(session: SessionPayload | null): Promise<{ days: string[]; preview: string[] }> {
  const { days, previewDays } = await readLive();
  if (session?.role !== 'superadmin') return { days, preview: [] };
  const extra = previewDays.filter((d) => !days.includes(d));
  return { days: [...days, ...extra], preview: extra };
}

// --- Schreib-Handler (Staff) -----------------------------------------------

const saveScoring = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
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

const saveTally = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
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

// --- Getrackte Daten umbuchen: zusammenführen / tauschen / löschen -----------
// Eine Zeile lesen (Zähler + Rolle) für (matchId, teamId, playerName).
async function readTallyRow(
  matchId: string,
  teamId: string,
  playerName: string
): Promise<{ role: string; counts: Record<string, number> } | null> {
  const rows = (await sql`
    SELECT role, counts FROM match_player_stats
    WHERE match_id = ${matchId} AND team_id = ${teamId} AND player_name = ${playerName}`) as {
    role: string;
    counts: unknown;
  }[];
  if (!rows[0]) return null;
  return { role: rows[0].role === 'keeper' ? 'keeper' : 'field', counts: sanitizeCounts(rows[0].counts) };
}

async function upsertTallyRow(
  dayKey: string,
  matchId: string,
  teamId: string,
  playerName: string,
  role: string,
  counts: Record<string, number>
): Promise<void> {
  const r = role === 'keeper' ? 'keeper' : 'field';
  await sql`
    INSERT INTO match_player_stats (day_key, match_id, team_id, player_name, role, counts, updated_at)
    VALUES (${dayKey}, ${matchId}, ${teamId}, ${playerName}, ${r}, ${JSON.stringify(counts)}::jsonb, now())
    ON CONFLICT (match_id, team_id, player_name)
    DO UPDATE SET counts = EXCLUDED.counts, role = EXCLUDED.role, day_key = EXCLUDED.day_key, updated_at = now()`;
}

async function deleteTallyRow(matchId: string, teamId: string, playerName: string): Promise<void> {
  await sql`DELETE FROM match_player_stats WHERE match_id = ${matchId} AND team_id = ${teamId} AND player_name = ${playerName}`;
}

function addCounts(a: Record<string, number>, b: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = (out[k] ?? 0) + v;
  return sanitizeCounts(out);
}

// Umbucht getrackte Werte innerhalb EINES Teams über ein oder mehrere Spiele:
//  • op='merge'  → Zähler von `from` auf `to` addieren, `from` löschen (Zuordnen/Kopieren)
//  • op='swap'   → Zähler von `from` und `to` vertauschen (2 Spieler verwechselt)
//  • op='delete' → `from` komplett entfernen (versehentlich angelegter Spieler)
// Jede Zeile bleibt an ihre (matchId, teamId, Name); Rollen bleiben am Namen.
const tallyOp = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as {
    dayKey?: unknown;
    matchIds?: unknown;
    teamId?: unknown;
    op?: unknown;
    from?: unknown;
    to?: unknown;
  };
  const op = b.op;
  const teamId = b.teamId;
  const from = b.from;
  const to = b.to;
  const dayKey = b.dayKey;
  const matchIds = Array.isArray(b.matchIds) ? b.matchIds.filter(isNonEmptyString) : [];
  if (op !== 'merge' && op !== 'swap' && op !== 'delete') return badRequest(res, 'op muss merge, swap oder delete sein.');
  if (!isNonEmptyString(teamId) || !isNonEmptyString(from) || matchIds.length === 0) {
    return badRequest(res, 'teamId, from und mindestens ein Spiel sind Pflicht.');
  }
  if (op === 'merge' || op === 'swap') {
    if (!isNonEmptyString(to)) return badRequest(res, 'Zielspieler (to) fehlt.');
    if (to.trim().toLowerCase() === from.trim().toLowerCase()) return badRequest(res, 'from und to sind identisch.');
    if (!isNonEmptyString(dayKey)) return badRequest(res, 'dayKey fehlt.');
  }

  for (const mid of matchIds) {
    const fromRow = await readTallyRow(mid, teamId, from);
    if (op === 'delete') {
      await deleteTallyRow(mid, teamId, from);
      continue;
    }
    const toRow = await readTallyRow(mid, teamId, to as string);
    if (op === 'merge') {
      if (!fromRow) continue; // in diesem Spiel nichts zu verschieben
      const merged = addCounts(toRow?.counts ?? {}, fromRow.counts);
      await upsertTallyRow(dayKey as string, mid, teamId, to as string, toRow?.role ?? fromRow.role, merged);
      await deleteTallyRow(mid, teamId, from);
    } else {
      // swap: Momentaufnahmen zuerst lesen, dann beide Seiten setzen.
      if (!fromRow && !toRow) continue;
      // Ziel bekommt die Werte von `from` (bzw. wird geleert, wenn from leer war).
      if (fromRow) await upsertTallyRow(dayKey as string, mid, teamId, to as string, toRow?.role ?? fromRow.role, fromRow.counts);
      else await deleteTallyRow(mid, teamId, to as string);
      // `from` bekommt die Werte von `to` (bzw. wird geleert, wenn to leer war).
      if (toRow) await upsertTallyRow(dayKey as string, mid, teamId, from, fromRow?.role ?? toRow.role, toRow.counts);
      else await deleteTallyRow(mid, teamId, from);
    }
  }
  return res.json({ ok: true });
});

// Verbindungstest zum Google Sheet (schreibt nichts – liest nur Titel/Blätter).
const testSheet = requirePermission('tracking')(async (_req: VercelRequest, res: VercelResponse) => {
  try {
    const info = await sheetInfo();
    return res.json({ ok: true, ...info });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Unbekannter Fehler' });
  }
});

// Einen Liga-Spieltag aus der DB in das Google Sheet kopieren (manuell, per Knopf).
const exportDay = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
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

// Score-Einstellungen (Punkte/Regler/Minimums) aus dem Backend ins Google Sheet
// kopieren (manuell, per Knopf). Nutzt die im Body übergebene Konfiguration.
const exportScoring = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const cfg = req.body;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) {
    return badRequest(res, 'Ungültige Einstellungen.');
  }
  try {
    const summary = await exportScoringConfig(cfg);
    return res.json({ ok: true, ...summary });
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Export-Fehler' });
  }
});

const savePublish = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { dayKey?: unknown; matchId?: unknown; live?: unknown; mode?: unknown };
  // Einzelnes Spiel live schalten (key `match:<id>`) ODER den ganzen Tag/das Event (dayKey).
  const key = isNonEmptyString(b.matchId) ? `match:${b.matchId}` : isNonEmptyString(b.dayKey) ? b.dayKey : '';
  if (!key) return badRequest(res, 'dayKey oder matchId ist Pflicht.');
  // mode: 'live' = für alle · 'preview' = nur Super-Admins · 'off' = versteckt.
  // (Alt: live true/false.)
  const mode = b.mode === 'live' || b.mode === 'preview' || b.mode === 'off' ? b.mode : b.live ? 'live' : 'off';
  const cur = await readLive();
  const live = new Set(cur.days);
  const preview = new Set(cur.previewDays);
  live.delete(key);
  preview.delete(key);
  if (mode === 'live') live.add(key);
  if (mode === 'preview') preview.add(key);
  const days = [...live];
  const previewDays = [...preview];
  await writeLive(days, previewDays);
  return res.json({ days, previewDays });
});

// Getrackte Daten KOMPLETT zurücksetzen – ein oder mehrere Spiele, oder den
// ganzen Spieltag/das ganze Testspiel (`wholeDay`). Löscht die Zeilen in
// match_player_stats und nimmt die betroffenen Spiele/den Tag aus „live".
//  • Liga: Spiel-IDs sind eindeutig → alle Zeilen dieser Spiele, egal unter
//    welchem Spieltag-Schlüssel sie liegen (räumt auch Reste verschobener Spiele auf).
//  • Testspiel: Spiel-IDs wiederholen sich zwischen Events → nur unter DIESEM Schlüssel.
const resetTally = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { dayKey?: unknown; matchIds?: unknown; wholeDay?: unknown };
  const dayKey = isNonEmptyString(b.dayKey) ? b.dayKey : '';
  const matchIds = Array.isArray(b.matchIds) ? b.matchIds.filter(isNonEmptyString) : [];
  const wholeDay = b.wholeDay === true;
  if (!dayKey) return badRequest(res, 'dayKey fehlt.');
  if (!wholeDay && matchIds.length === 0) return badRequest(res, 'Mindestens ein Spiel angeben.');
  const isEvent = dayKey.startsWith('event:');

  let deleted = 0;
  if (wholeDay) {
    const r1 = await sql`DELETE FROM match_player_stats WHERE day_key = ${dayKey} RETURNING 1`;
    deleted += r1.length;
  }
  if (matchIds.length) {
    const r2 = isEvent
      ? await sql`DELETE FROM match_player_stats WHERE day_key = ${dayKey} AND match_id = ANY(${matchIds}::text[]) RETURNING 1`
      : await sql`DELETE FROM match_player_stats WHERE match_id = ANY(${matchIds}::text[]) RETURNING 1`;
    deleted += r2.length;
  }

  // Aus „live" (und der Vorschau) nehmen: die Spiele (match:<id>) und bei wholeDay den ganzen Tag.
  const cur = await readLive();
  const drop = new Set([...matchIds.map((id) => `match:${id}`), ...(wholeDay ? [dayKey] : [])]);
  const days = cur.days.filter((d) => !drop.has(d));
  await writeLive(days, cur.previewDays.filter((d) => !drop.has(d)));
  // Zurückgesetzte Spiele sind auch nicht mehr „fertig getrackt".
  const statusKeys = matchIds.map((id) => `${dayKey}|${id}`);
  if (statusKeys.length) {
    await sql`UPDATE settings SET value = value - ${statusKeys}::text[] WHERE key = 'tracking-status'`;
  }
  return res.json({ ok: true, deleted, days });
});

// --- Tracking-Status je Spiel („wird getrackt" / „fertig") ------------------
// Damit zwei Leute nicht dasselbe Spiel tracken: settings-Key 'tracking-status'
// = { "<dayKey>|<matchId>": { status, by, at } }. Atomar per jsonb-Merge.
type TrackStatus = 'tracking' | 'done';
const MIN_DONE_ACTIONS = 10; // gleich wie src/lib/stats.ts
const saveTrackStatus = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { dayKey?: unknown; matchId?: unknown; status?: unknown };
  if (!isNonEmptyString(b.dayKey) || !isNonEmptyString(b.matchId)) return badRequest(res, 'dayKey/matchId fehlt.');
  const key = `${b.dayKey}|${b.matchId}`;
  const status: TrackStatus | null = b.status === 'tracking' || b.status === 'done' ? b.status : null;
  if (status === 'done') {
    // Nur wirklich getrackte Spiele dürfen auf „fertig".
    const r = (await sql`
      SELECT COALESCE(SUM(kv.v::int), 0)::int AS n
      FROM match_player_stats t, jsonb_each_text(t.counts) AS kv(k, v)
      WHERE t.day_key = ${b.dayKey} AND t.match_id = ${b.matchId} AND kv.v ~ '^[0-9]+$'
    `) as { n: number }[];
    const n = Number(r[0]?.n ?? 0);
    if (n < MIN_DONE_ACTIONS) {
      return badRequest(res, `Noch nicht genug getrackt (${n} von mindestens ${MIN_DONE_ACTIONS} Aktionen) – „Fertig" geht erst danach.`);
    }
  }
  if (status) {
    const session = await getSession(req);
    const entry = { [key]: { status, by: session?.name || session?.email || '', at: new Date().toISOString() } };
    await sql`
      INSERT INTO settings (key, value) VALUES ('tracking-status', ${JSON.stringify(entry)}::jsonb)
      ON CONFLICT (key) DO UPDATE SET value = settings.value || EXCLUDED.value
    `;
  } else {
    await sql`UPDATE settings SET value = value - ${key}::text WHERE key = 'tracking-status'`;
  }
  return res.json({ ok: true });
});

// --- Tracking-Regeln (saisonweit) & Voice-Tracking -------------------------

const saveTrackingRules = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const b = (req.body ?? {}) as { text?: unknown };
  const text = typeof b.text === 'string' ? b.text.slice(0, 4000) : '';
  await sql`
    INSERT INTO settings (key, value) VALUES ('tracking_rules', ${JSON.stringify({ text })}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json({ ok: true, text });
});

// Kontext (Kader/Teams) aus dem Frontend säubern – knallhart begrenzt gegen Müll.
function sanitizeContext(raw: unknown): VoiceContext {
  const r = (raw ?? {}) as Record<string, unknown>;
  const homeTeam = typeof r.homeTeam === 'string' ? r.homeTeam.slice(0, 80) : '';
  const awayTeam = typeof r.awayTeam === 'string' ? r.awayTeam.slice(0, 80) : '';
  const rules = typeof r.rules === 'string' ? r.rules.slice(0, 4000) : '';
  const players: RosterPlayer[] = Array.isArray(r.players)
    ? (r.players as unknown[])
        .slice(0, 60)
        .map((p) => {
          const o = (p ?? {}) as Record<string, unknown>;
          return {
            team: o.team === 'away' ? 'away' : 'home',
            teamName: typeof o.teamName === 'string' ? o.teamName.slice(0, 80) : '',
            name: typeof o.name === 'string' ? o.name.slice(0, 80) : '',
            role: o.role === 'keeper' ? 'keeper' : 'field',
            ...(typeof o.number === 'number' && Number.isFinite(o.number) ? { number: Math.trunc(o.number) } : {}),
          } as RosterPlayer;
        })
        .filter((p) => p.name)
    : [];
  return { homeTeam, awayTeam, players, rules };
}

// --- Audio-Aufnahmen ↔ Spiel ----------------------------------------------
// Beim Audio-Tracking wird jede Aufnahme mit ihrem Spiel verknüpft (settings
// „tracking-audio" = { [matchId]: [{ url, at }] }). So kann man ein Spiel später
// noch einmal auswerten lassen (z. B. „Vorlagen nachprüfen"). Ältere Aufnahmen
// ohne Verknüpfung findet die Liste über den Blob-Speicher (…-tracking.wav).
type AudioLink = { url: string; at: string };
const isBlobUrl = (u: string) => {
  try {
    return /\.blob\.vercel-storage\.com$/.test(new URL(u).host);
  } catch {
    return false;
  }
};
async function readAudioLinks(): Promise<Record<string, AudioLink[]>> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'tracking-audio'`;
  const v = rows[0]?.value;
  return v && typeof v === 'object' ? (v as Record<string, AudioLink[]>) : {};
}

const linkTrackingAudio = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const { matchId, url } = (req.body ?? {}) as { matchId?: unknown; url?: unknown };
  if (!isNonEmptyString(matchId) || typeof url !== 'string' || !isBlobUrl(url)) return badRequest(res, 'Ungültige Aufnahme.');
  const all = await readAudioLinks();
  const list = (all[matchId] ?? []).filter((a) => a.url !== url);
  list.push({ url, at: new Date().toISOString() });
  all[matchId] = list.slice(-20);
  await sql`
    INSERT INTO settings (key, value) VALUES ('tracking-audio', ${JSON.stringify(all)}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `;
  return res.json({ ok: true });
});

const trackingAudioList = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  const matchId = typeof req.query.matchId === 'string' ? req.query.matchId : '';
  const linked = matchId ? (await readAudioLinks())[matchId] ?? [] : [];
  // Alle Tracking-Aufnahmen aus dem Blob-Speicher (neueste zuerst).
  const recent: { url: string; at: string; size: number }[] = [];
  try {
    let cursor: string | undefined;
    for (let page = 0; page < 10; page++) {
      const r = await listBlobs({ prefix: 'uploads/', limit: 1000, cursor });
      for (const b of r.blobs) {
        if (/-tracking\.wav$/i.test(b.pathname)) recent.push({ url: b.url, at: new Date(b.uploadedAt).toISOString(), size: b.size });
      }
      if (!r.hasMore || !r.cursor) break;
      cursor = r.cursor;
    }
  } catch (err) {
    console.error('trackingAudioList:', err);
  }
  recent.sort((a, b) => b.at.localeCompare(a.at));
  return res.json({ linked, recent: recent.slice(0, 200) });
});

const MAX_AUDIO_BYTES = 40 * 1024 * 1024; // Sicherheitsgrenze für das Server-seitige Nachladen

const voiceTracking = requirePermission('tracking')(async (req: VercelRequest, res: VercelResponse) => {
  if (!isGeminiConfigured()) {
    return res.status(400).json({ error: 'Gemini ist nicht eingerichtet. Bitte GEMINI_API_KEY in Vercel hinterlegen.' });
  }
  const b = (req.body ?? {}) as { audioUrl?: unknown; mimeType?: unknown; transcript?: unknown; context?: unknown };
  const context = sanitizeContext(b.context);
  const transcript = typeof b.transcript === 'string' ? b.transcript.slice(0, 20000).trim() : '';
  const audioUrl = typeof b.audioUrl === 'string' ? b.audioUrl : '';

  try {
    if (audioUrl) {
      // Nur unsere eigenen Blob-URLs nachladen (kein offener Proxy).
      let host = '';
      try {
        host = new URL(audioUrl).host;
      } catch {
        return badRequest(res, 'Ungültige Audio-URL.');
      }
      if (!/\.blob\.vercel-storage\.com$/.test(host) && !/(^|\.)hero-league\.de$/.test(host)) {
        return badRequest(res, 'Audio-URL nicht erlaubt.');
      }
      const audioRes = await fetch(audioUrl);
      if (!audioRes.ok) return res.status(400).json({ error: 'Audio konnte nicht geladen werden.' });
      const buf = Buffer.from(await audioRes.arrayBuffer());
      if (buf.length === 0) return badRequest(res, 'Audio ist leer.');
      if (buf.length > MAX_AUDIO_BYTES) return badRequest(res, 'Audio ist zu groß.');
      const mimeType = typeof b.mimeType === 'string' && b.mimeType ? b.mimeType : 'audio/wav';
      // Kurze Aufnahmen direkt inline an Gemini (schneller, umgeht die Files-API).
      // Nur große Dateien gehen über den Files-API-Upload. Grenze so gewählt, dass
      // die base64-aufgeblähte Anfrage unter Geminis 20-MB-Request-Limit bleibt.
      const INLINE_LIMIT = 14 * 1024 * 1024;
      const result =
        buf.length <= INLINE_LIMIT
          ? await parseTracking({ audioInline: { base64: buf.toString('base64'), mimeType }, context })
          : await parseTracking({ audio: await uploadAudio(buf, mimeType), context });
      return res.json(result);
    }
    if (transcript) {
      const result = await parseTracking({ transcript, context });
      return res.json(result);
    }
    return badRequest(res, 'Kein Audio und kein Transkript übergeben.');
  } catch (err) {
    console.error('voiceTracking:', err);
    return res.status(400).json({ error: err instanceof Error ? err.message : 'Auswertung fehlgeschlagen.' });
  }
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
      // Aufnahmen eines Spiels (+ alle Tracking-Aufnahmen) – nur fürs Tracking-Team.
      if (resource === 'voice-audio') return trackingAudioList(req, res);

      // ÖFFENTLICH: nur veröffentlichte (live geschaltete) Spieltage. Für die
      // Website (Spieler-Karten, Spielbericht). Optional auf eine Saison gefiltert.
      if (resource === 'public') {
        const season = typeof req.query.season === 'string' ? req.query.season : '';
        // Testspiel/Event: nur die veröffentlichten Roh-Daten EINES Events
        // (day_key = "event:<id>"). Komplett getrennt von den Liga-Saisons.
        const eventId = typeof req.query.event === 'string' ? req.query.event : '';
        const viewer = await getSession(req);
        if (eventId) {
          const key = `event:${eventId}`;
          const live = (await visibleLive(viewer)).days;
          const eventLive = live.includes(key);
          const liveMatchIds = live.filter((k) => k.startsWith('match:')).map((k) => k.slice('match:'.length));
          if (!eventLive && liveMatchIds.length === 0) return res.json({ rows: [], days: [] });
          const all = (await sql`
            SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                   player_name AS "playerName", role, counts
            FROM match_player_stats WHERE day_key = ${key}`) as StatRow[];
          // Ganzes Event live ⇒ alles; sonst nur einzeln live geschaltete Spiele.
          const rows = eventLive ? all : all.filter((r) => liveMatchIds.includes(r.matchId));
          if (rows.length === 0) return res.json({ rows: [], days: [] });
          return res.json({ rows, days: [key] });
        }
        // Demo-Saison darf auch Entwürfe zeigen (all=1) – zum Testen ohne „Live schalten".
        if (req.query.all === '1' && season) {
          const demo = await readDemo();
          if (demo?.active && season === demo.seasonId) {
            const rows = (await sql`
              SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                     player_name AS "playerName", role, counts
              FROM match_player_stats WHERE day_key LIKE ${'s:' + season + ':%'}`) as StatRow[];
            return res.json({ rows, days: [] });
          }
        }
        const vis = await visibleLive(viewer);
        const live = vis.days;
        const days = season ? live.filter((d) => d.startsWith(`s:${season}:`)) : live;
        const liveMatchIds = live.filter((k) => k.startsWith('match:')).map((k) => k.slice('match:'.length));
        // Nur-Vorschau-Teile (für den Hinweis „nur du siehst das" auf der Website).
        const preview = season ? vis.preview.filter((d) => d.startsWith(`s:${season}:`) || d.startsWith('match:')) : vis.preview;
        if (days.length === 0 && liveMatchIds.length === 0) return res.json({ rows: [], days: [], preview });
        // Live geschaltete Tage ODER einzeln live geschaltete Spiele (auf die Saison begrenzt).
        const rows = (season
          ? await sql`
              SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                     player_name AS "playerName", role, counts
              FROM match_player_stats
              WHERE day_key = ANY(${days}::text[])
                 OR (match_id = ANY(${liveMatchIds}::text[]) AND day_key LIKE ${'s:' + season + ':%'})`
          : await sql`
              SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                     player_name AS "playerName", role, counts
              FROM match_player_stats
              WHERE day_key = ANY(${days}::text[]) OR match_id = ANY(${liveMatchIds}::text[])`) as StatRow[];
        return res.json({ rows, days, preview });
      }

      // ÖFFENTLICH: Fortschritt eines gerade laufenden Trackings („Das Team ist am
      // Tracken · 40 %") – je Liga-Spieltag der aktuellen Saison, der Status-
      // Einträge hat, aber noch nicht komplett live geschaltet ist. Ohne Namen.
      if (resource === 'tracking-progress') {
        const [statusRows, live, season] = await Promise.all([
          sql`SELECT value FROM settings WHERE key = 'tracking-status'`,
          getSession(req).then((sess) => visibleLive(sess)).then((v) => v.days),
          sql`SELECT id FROM seasons WHERE is_current = true LIMIT 1`,
        ]);
        const sid = (season[0] as { id?: string } | undefined)?.id;
        const map = (statusRows[0]?.value ?? {}) as Record<string, { status?: string }>;
        const byDay = new Map<string, Map<string, string>>();
        for (const [k, v] of Object.entries(map)) {
          const i = k.lastIndexOf('|');
          if (i < 0) continue;
          const dayKey = k.slice(0, i);
          if (!sid || !dayKey.startsWith(`s:${sid}:`)) continue;
          const m = byDay.get(dayKey) ?? new Map<string, string>();
          m.set(k.slice(i + 1), String(v?.status ?? ''));
          byDay.set(dayKey, m);
        }
        const days: { dayKey: string; matchday: number; done: number; tracking: number; total: number; pct: number }[] = [];
        for (const [dayKey, st] of byDay) {
          if (live.includes(dayKey)) continue; // schon komplett veröffentlicht
          const matchday = Number(dayKey.split(':')[2]);
          if (!Number.isFinite(matchday)) continue;
          const ids = (await sql`SELECT id FROM matches WHERE season_id = ${sid} AND matchday = ${matchday}`) as { id: string }[];
          const total = ids.length;
          if (!total) continue;
          const done = ids.filter((m) => st.get(m.id) === 'done').length;
          const tracking = ids.filter((m) => st.get(m.id) === 'tracking').length;
          days.push({ dayKey, matchday, done, tracking, total, pct: Math.round((done / total) * 100) });
        }
        days.sort((x, y) => y.matchday - x.matchday);
        return res.json({ days });
      }
      // Roh-Daten je Spieltag/Spiel nur für eingeloggte Nutzer (Entwürfe sind intern).
      const session = await getSession(req);
      if (!session) return res.status(401).json({ error: 'Nicht angemeldet' });

      if (resource === 'live-state') {
        return res.json(await readLive());
      }
      if (resource === 'day') {
        const day = typeof req.query.day === 'string' ? req.query.day : '';
        if (!day) return badRequest(res, 'day fehlt.');
        const rows = (await sql`
          SELECT day_key AS "dayKey", match_id AS "matchId", team_id AS "teamId",
                 player_name AS "playerName", role, counts
          FROM match_player_stats WHERE day_key = ${day}`) as StatRow[];
        const { days: liveSet, previewDays } = await readLive();
        const live = liveSet.includes(day);
        const liveMatchIds = liveSet.filter((k) => k.startsWith('match:')).map((k) => k.slice('match:'.length));
        return res.json({ rows, live, preview: !live && previewDays.includes(day), liveMatchIds });
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
      // Fortschritt je Spieltag/Testspiel: welche Spiele haben schon Daten?
      // Nur die Spiel-IDs, damit die Übersicht im Tracking Center einen Balken
      // zeigen kann, ohne alle Zähler zu laden.
      if (resource === 'tracked-matches') {
        // WICHTIG: Es reicht NICHT, dass Zeilen existieren. Beim Hinzufügen eines
        // Spielers oder beim Korrigieren der Torwart-Rolle wird bereits eine Zeile
        // mit lauter Nullen angelegt – solche Spiele galten fälschlich als
        // getrackt. Gezählt wird nur, wo mindestens EINE Aktion erfasst ist.
        // Mit Spieltag-Schlüssel: Ein Spiel zählt nur für den Tag, unter dem seine
        // Daten liegen (sonst färbten Reste verschobener Spiele oder gleiche
        // Testspiel-IDs eines anderen Events fremde Tage ein).
        const rows = (await sql`
          SELECT DISTINCT match_id AS "matchId", day_key AS "dayKey"
          FROM match_player_stats t
          WHERE jsonb_typeof(t.counts) = 'object'
            AND EXISTS (
              SELECT 1 FROM jsonb_each_text(t.counts) AS kv(k, v)
              WHERE v ~ '^[0-9]+$' AND v::int > 0
            )`) as { matchId: string; dayKey: string }[];
        return res.json({ matchIds: [...new Set(rows.map((r) => r.matchId))], tracked: rows });
      }
      if (resource === 'track-status') {
        if (!(await getSession(req))) return res.status(401).json({ error: 'Nicht angemeldet' });
        const rows = await sql`SELECT value FROM settings WHERE key = 'tracking-status'`;
        const v = rows[0]?.value;
        return res.json(v && typeof v === 'object' ? v : {});
      }
      if (resource === 'tracking-rules') {
        const rows = await sql`SELECT value FROM settings WHERE key = 'tracking_rules'`;
        const text = (rows[0]?.value as { text?: unknown })?.text;
        return res.json({ text: typeof text === 'string' ? text : '' });
      }
      return badRequest(res, 'Unbekannte Ressource.');
    }

    if (req.method === 'POST') {
      if (resource === 'scoring') return saveScoring(req, res);
      if (resource === 'tally') return saveTally(req, res);
      if (resource === 'tally-op') return tallyOp(req, res);
      if (resource === 'tally-reset') return resetTally(req, res);
      if (resource === 'track-status') return saveTrackStatus(req, res);
      if (resource === 'publish') return savePublish(req, res);
      if (resource === 'sheet-test') return testSheet(req, res);
      if (resource === 'export') return exportDay(req, res);
      if (resource === 'export-scoring') return exportScoring(req, res);
      if (resource === 'tracking-rules') return saveTrackingRules(req, res);
      if (resource === 'voice') return voiceTracking(req, res);
      if (resource === 'voice-audio') return linkTrackingAudio(req, res);
      return badRequest(res, 'Unbekannte Ressource.');
    }

    return res.status(405).json({ error: 'Nicht unterstützt' });
  } catch (err) {
    console.error('Fehler in /api/stats:', err);
    return res.status(500).json({ error: 'Interner Fehler' });
  }
}
