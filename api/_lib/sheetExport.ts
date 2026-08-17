import { batchWriteCells, colLetter, readRange } from './gsheets.js';
import { getMatches, getTeams } from './db.js';
import type { Team } from '../../src/types';

// ===========================================================================
// Kopie eines Liga-Spieltags aus unserer DB → Blatt „Match-Tracking".
// Unser Backend bestimmt die Einsätze: getrackt = eingesetzt. Der Export
// PLATZIERT die Spieler selbst in den 16-Zeilen-Block des Spiels (Heim = obere
// 8, Gast = untere 8). Spieler, die im Sheet schon stehen, bekommen ihre Werte
// in dieselbe Zeile; alle anderen werden in eine FREIE Zeile ihrer Team-Hälfte
// geschrieben (Name + Team + Slot + Rolle + Werte). Ein bereits vorhandener
// fremder Name wird NIE überschrieben. Einseitig – das Sheet ist nur Kopie.
// Layout-Konstanten aus dem Apps-Script des V2-Trackers.
// ===========================================================================

const SCHEDULE_SHEET = 'Spielplan';
const TRACK_SHEET = 'Match-Tracking';
const SCHEDULE_FIRST_ROW = 5;
const TRACK_FIRST_ROW = 5;
const PLAYERS_PER_MATCH = 16;
const HALF = 8; // Spieler je Team im Block

// Meta-Spalten im Block (1-basiert).
const COL_MATCHID = 1; // A
const COL_SIDE = 9; // I
const COL_TEAM = 10; // J
const COL_SLOT = 11; // K
const COL_NAME = 12; // L
const COL_ROLE = 45; // AS
const NAME_INDEX = COL_NAME - 1; // 0-basiert für gelesene Zeilen

// Unsere Zähler-Schlüssel → Statistik-Spalte im Blatt.
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
  role?: string; // 'field' | 'keeper'
  counts: Record<string, number>;
}

export interface ExportSummary {
  written: number; // gesetzte Zellen
  matches: number; // Spiele mit übertragenen Daten
  players: number; // platzierte Spieler
  placedNew: number; // davon in eine leere Zeile neu eingetragen
  unmatched: string[]; // was NICHT untergebracht werden konnte
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

  const idRows = await readRange(`${SCHEDULE_SHEET}!A${SCHEDULE_FIRST_ROW}:A`);
  const ids = idRows.map((r) => String(r[0] ?? ''));

  const unmatched: string[] = [];
  const updates: { range: string; value: number | string }[] = [];
  let matchesTouched = 0;
  let playersTouched = 0;
  let placedNew = 0;

  const cell = (col: number, sheetRow: number, value: number | string) =>
    updates.push({ range: `${TRACK_SHEET}!${colLetter(col)}${sheetRow}`, value });

  const writeStats = (sheetRow: number, counts: Record<string, number>) => {
    for (const key of Object.keys(COLUMN)) {
      let val = Number(counts[key] || 0);
      if (key === 'shot_on') val += Number(counts.goal || 0); // Tor zählt im Sheet als Torschuss
      cell(COLUMN[key], sheetRow, val);
    }
  };

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
    const block = await readRange(`${TRACK_SHEET}!A${rowStart}:L${rowStart + PLAYERS_PER_MATCH - 1}`);
    matchesTouched++;

    const nameAt = (off: number) => norm(block[off]?.[NAME_INDEX]);
    const used = new Set<number>();

    // Offsets je Team-Hälfte: Heim 0..7, Gast 8..15.
    const halfOffsets = (home: boolean) =>
      home ? [0, 1, 2, 3, 4, 5, 6, 7] : [8, 9, 10, 11, 12, 13, 14, 15];

    for (const pr of rowsOfMatch) {
      const home = pr.teamId === m.homeTeamId;
      const away = pr.teamId === m.awayTeamId;
      if (!home && !away) {
        unmatched.push(`${pr.playerName}: Team gehört nicht zu diesem Spiel`);
        continue;
      }
      const offsets = halfOffsets(home);
      const target = norm(pr.playerName);

      // 1) bereits vorhandene Zeile mit gleichem Namen in der richtigen Hälfte?
      let off = offsets.find((o) => !used.has(o) && nameAt(o) === target);
      let isNew = false;
      // 2) sonst erste FREIE (leere) Zeile der Hälfte.
      if (off === undefined) {
        off = offsets.find((o) => !used.has(o) && nameAt(o) === '');
        isNew = true;
      }
      if (off === undefined) {
        unmatched.push(`${pr.playerName} (${teamById[pr.teamId]?.name ?? pr.teamId}) – kein Platz im Block`);
        continue;
      }
      used.add(off);
      const sheetRow = rowStart + off;
      playersTouched++;

      if (isNew) {
        placedNew++;
        cell(COL_NAME, sheetRow, pr.playerName);
        cell(COL_SIDE, sheetRow, home ? 'Heim' : 'Gast');
        cell(COL_TEAM, sheetRow, teamById[pr.teamId]?.name ?? pr.teamId);
        cell(COL_SLOT, sheetRow, (home ? off : off - HALF) + 1);
        cell(COL_ROLE, sheetRow, pr.role === 'keeper' ? 'Torwart' : 'Feldspieler');
        if (!norm(block[off]?.[0])) cell(COL_MATCHID, sheetRow, String(importRef));
      }
      writeStats(sheetRow, pr.counts);
    }
  }

  await batchWriteCells(updates);
  return { written: updates.length, matches: matchesTouched, players: playersTouched, placedNew, unmatched };
}
