import { batchWriteCells, colLetter, readRange } from './gsheets.js';
import { getMatches, getTeams } from './db.js';
import type { Team } from '../../src/types';

// ===========================================================================
// Kopie eines Liga-Spieltags aus unserer DB → in das Blatt „Match-Tracking"
// des Google Sheets (euer Spielplatz). Einseitig: das Sheet wird beschrieben,
// nie gelesen als Quelle. Nur die 18 Statistikspalten der ZUGEORDNETEN Spieler
// werden gesetzt (absolute Werte); alles andere im Sheet bleibt unberührt.
// Layout-Konstanten stammen aus dem Apps-Script des V2-Trackers.
// ===========================================================================

const SCHEDULE_SHEET = 'Spielplan';
const TRACK_SHEET = 'Match-Tracking';
const SCHEDULE_FIRST_ROW = 5;
const TRACK_FIRST_ROW = 5;
const PLAYERS_PER_MATCH = 16;

// Unsere Zähler-Schlüssel → Spaltennummer im Blatt „Match-Tracking".
// (own_goal / penalty_goal / penalty_save haben dort keine Spalte → weggelassen.)
const COLUMN: Record<string, number> = {
  goal: 22,
  assist: 23,
  shot_on: 24,
  shot_miss: 25,
  shot_blocked_off: 26,
  pass_ok: 27,
  pass_fail: 28,
  key_pass: 29,
  dribble_won: 30,
  dribble_lost: 31,
  duel_won: 32,
  duel_lost: 33,
  interception: 34,
  shot_blocked_def: 35,
  turnover: 36,
  save: 39,
  gk_goal_against: 40,
  gk_position_save: 46,
};

const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

export interface ExportRow {
  matchId: string;
  teamId: string;
  playerName: string;
  counts: Record<string, number>;
}

export interface ExportSummary {
  written: number; // gesetzte Zellen
  matches: number; // Spiele mit übertragenen Daten
  players: number; // zugeordnete Spieler
  unmatched: string[]; // was NICHT zugeordnet werden konnte
}

// dayKey = "s:<seasonId>:<matchday>"
export async function exportLeagueDay(dayKey: string, rows: ExportRow[]): Promise<ExportSummary> {
  const parts = dayKey.split(':');
  const seasonId = parts[1];
  const matchday = Number(parts[2]);

  const [allMatches, teams] = await Promise.all([getMatches(), getTeams()]);
  const teamById: Record<string, Team> = {};
  teams.forEach((t) => (teamById[t.id] = t));
  const dayMatches = allMatches.filter((m) => m.seasonId === seasonId && m.matchday === matchday);

  // Spielplan-IDs (Spalte A) → Position im Spielplan.
  const idRows = await readRange(`${SCHEDULE_SHEET}!A${SCHEDULE_FIRST_ROW}:A`);
  const ids = idRows.map((r) => String(r[0] ?? ''));

  const unmatched: string[] = [];
  const updates: { range: string; value: number }[] = [];
  let matchesTouched = 0;
  let playersTouched = 0;

  for (const m of dayMatches) {
    const rowsOfMatch = rows.filter((r) => r.matchId === m.id);
    if (!rowsOfMatch.length) continue;

    const importRef = m.importRef || m.id;
    const idx = ids.indexOf(String(importRef));
    if (idx < 0) {
      unmatched.push(`Spiel „${importRef}" nicht im Spielplan-Blatt gefunden`);
      continue;
    }
    const rowStart = TRACK_FIRST_ROW + idx * PLAYERS_PER_MATCH;
    // Spielernamen des Blocks lesen (Spalte L = Index 11).
    const block = await readRange(`${TRACK_SHEET}!A${rowStart}:L${rowStart + PLAYERS_PER_MATCH - 1}`);
    matchesTouched++;

    for (const pr of rowsOfMatch) {
      const off = block.findIndex((b) => norm(b[11]) === norm(pr.playerName));
      if (off < 0) {
        unmatched.push(`${pr.playerName} (${teamById[pr.teamId]?.name ?? pr.teamId}) – nicht im Sheet`);
        continue;
      }
      const sheetRow = rowStart + off;
      playersTouched++;
      for (const key of Object.keys(COLUMN)) {
        let val = Number(pr.counts[key] || 0);
        if (key === 'shot_on') val += Number(pr.counts.goal || 0); // Tor zählt im Sheet als Torschuss
        updates.push({ range: `${TRACK_SHEET}!${colLetter(COLUMN[key])}${sheetRow}`, value: val });
      }
    }
  }

  await batchWriteCells(updates);
  return { written: updates.length, matches: matchesTouched, players: playersTouched, unmatched };
}
