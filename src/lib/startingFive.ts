import type { MatchPlayerStat, PlayerOfMonth, ScoringConfig, StatRole } from '../types';
import { rankDay, type DayCandidate } from './awards';
import { countCleanSheets, normalizeCounts, playerCard, sumCounts } from './rating';
import { leagueDayKey } from './stats';

// ===========================================================================
// „Starting Five" eines Spieltages (Admin-Vorschau /starting-five).
// Verglichen wird NUR innerhalb dieses einen Spieltages – nicht über die Saison.
//
//  • Spieltagswerte: dieselbe Rechnung wie die Spielerkarte (PAS/SCH/DRI/DEF bzw.
//    STL/PAR/PAS/SIC), aber nur mit den Spielen dieses Abends und ohne den
//    „wenig Spiele"-Deckel der Saisonkarte.
//  • Position des Abends (Feldspieler) aus diesen Werten:
//      Offensive = Schuss + Dribbling voll, Pass halb
//      Defensive = Defensive + Pass voll, Dribbling halb
//    (je 2,5 Gewichte) – die höhere Wertung ist seine Position an diesem Abend.
//  • Wer reinkommt: die Spieltagsnote (Schnitt der Spielnoten des Abends) –
//    dieselbe Rangliste wie „Spieler des Spieltages". Erst die 2 besten Offensiven
//    und 2 besten Defensiven = Starting Five, die nächsten 2 + 2 = Bank.
//  • Spieler des Spieltages: der gespeicherte (falls für diesen Spieltag gepflegt),
//    sonst die beste Note. Er steht immer in der Starting Five.
//  • Torwart: In der Starting Five steht der Torwart des Spieltages (gespeichert,
//    sonst dieselbe Regel wie der Vorschlag im Admin = Goldener Handschuh des
//    Abends). Auf der Bank der Beste der übrigen Torhüter nach allen vier
//    Torwartwerten (Stellungsspiel, Paraden, Passspiel, Sicherheit) – so wird
//    auch ein mitspielender Torwart belohnt.
// Liest nur – verändert keine Daten.
// ===========================================================================

export type FivePos = 'off' | 'def' | 'gk';

export interface FivePlayer {
  teamId: string;
  name: string;
  pos: FivePos;
  note: number; // Spieltagsnote (1 Nachkommastelle)
  games: number;
  score: number; // Positionswertung des Abends (0–99, gleiche Skala wie die Karte)
  off: number; // Offensiv-Wertung des Abends (Feldspieler)
  def: number; // Defensiv-Wertung des Abends (Feldspieler)
  potd?: boolean; // Spieler des Spieltages
  kotd?: boolean; // Torwart des Spieltages
}

export interface StartingFive {
  matchday: number;
  starters: { off: FivePlayer[]; def: FivePlayer[]; gk: FivePlayer | null };
  bench: { off: FivePlayer[]; def: FivePlayer[]; gk: FivePlayer | null };
}

const key = (teamId: string, name: string) => `${teamId}|${name}`;

// Spieltagswerte (gleiche Rechnung wie die Karte) eines Spielers in einer Rolle.
function dayAttrs(rows: MatchPlayerStat[], role: StatRole, cfg: ScoringConfig): Record<string, number> {
  const norm = rows.map((r) => ({ role: r.role, counts: normalizeCounts(r.counts) }));
  const total = sumCounts(norm.map((r) => r.counts));
  const card = playerCard(total, rows.length, role, cfg, true, countCleanSheets(norm));
  return Object.fromEntries(card.attrs.map((a) => [a.key, a.value]));
}

export function offScore(a: Record<string, number>): number {
  return ((a.SCH ?? 0) + (a.DRI ?? 0) + 0.5 * (a.PAS ?? 0)) / 2.5;
}
export function defScore(a: Record<string, number>): number {
  return ((a.DEF ?? 0) + (a.PAS ?? 0) + 0.5 * (a.DRI ?? 0)) / 2.5;
}
export function gkScore(a: Record<string, number>): number {
  return ((a.STL ?? 0) + (a.PAR ?? 0) + (a.PAS ?? 0) + (a.SIC ?? 0)) / 4;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

export function startingFive(
  rows: MatchPlayerStat[],
  seasonId: string,
  cfg: ScoringConfig,
  matchday: number,
  pom?: PlayerOfMonth | null
): StartingFive | null {
  const dayKey = leagueDayKey(seasonId, matchday);
  const day = rows.filter((r) => r.dayKey === dayKey);
  if (day.length === 0) return null;
  const rowsOf = (teamId: string, name: string, role: StatRole) =>
    day.filter((r) => r.teamId === teamId && r.playerName === name && r.role === role);

  // Gespeicherte Auszeichnungen gelten nur für „ihren" Spieltag (und nicht als Vorschau).
  const stored = pom && !pom.preview && pom.matchday === matchday ? pom : null;

  // --- Torhüter ---------------------------------------------------------
  const keepers: DayCandidate[] = rankDay(rows, seasonId, cfg, matchday, 'keeper');
  const toKeeper = (c: DayCandidate): FivePlayer => {
    const a = dayAttrs(rowsOf(c.teamId, c.name, 'keeper'), 'keeper', cfg);
    return { teamId: c.teamId, name: c.name, pos: 'gk', note: c.note, games: c.games, score: r1(gkScore(a)), off: 0, def: 0 };
  };
  const storedKeeper = stored?.keeper?.name
    ? keepers.find((c) => c.name === stored.keeper!.name && (!stored.keeper!.teamId || c.teamId === stored.keeper!.teamId))
    : undefined;
  const kotd = storedKeeper ?? keepers[0];
  const gk = kotd ? { ...toKeeper(kotd), kotd: true } : null;
  const benchGk =
    keepers
      .filter((c) => c !== kotd)
      .map(toKeeper)
      .sort((a, b) => b.score - a.score || b.note - a.note)[0] ?? null;

  // --- Feldspieler ------------------------------------------------------
  // Reihenfolge = Spieltagsnote (dieselbe Rangliste wie „Spieler des Spieltages").
  const taken = new Set([gk, benchGk].filter(Boolean).map((p) => key(p!.teamId, p!.name)));
  const field: FivePlayer[] = rankDay(rows, seasonId, cfg, matchday, 'field')
    .filter((c) => !taken.has(key(c.teamId, c.name)))
    .map((c) => {
      const a = dayAttrs(rowsOf(c.teamId, c.name, 'field'), 'field', cfg);
      const off = r1(offScore(a));
      const def = r1(defScore(a));
      const pos: FivePos = off >= def ? 'off' : 'def';
      return { teamId: c.teamId, name: c.name, pos, note: c.note, games: c.games, score: pos === 'off' ? off : def, off, def };
    });

  const potdEntry = stored?.name ? field.find((p) => p.name === stored.name && (!stored.teamId || p.teamId === stored.teamId)) : undefined;
  const potd = potdEntry ?? field[0];
  if (potd) potd.potd = true;

  const pick = (pos: 'off' | 'def') => {
    const list = field.filter((p) => p.pos === pos);
    // Der Spieler des Spieltages steht immer in der Starting Five.
    if (potd && potd.pos === pos && list.indexOf(potd) > 1) {
      list.splice(list.indexOf(potd), 1);
      list.unshift(potd);
    }
    return list;
  };
  let offs = pick('off');
  let defs = pick('def');
  // Notfall: zu wenige Spieler einer Position → mit den Besten der anderen auffüllen.
  const fill = (need: FivePlayer[], other: FivePlayer[]) => {
    while (need.length < 4 && other.length > 4) need.push(other.splice(4, 1)[0]);
  };
  fill(offs, defs);
  fill(defs, offs);
  offs = offs.slice(0, 4);
  defs = defs.slice(0, 4);

  return {
    matchday,
    starters: { off: offs.slice(0, 2), def: defs.slice(0, 2), gk },
    bench: { off: offs.slice(2, 4), def: defs.slice(2, 4), gk: benchGk },
  };
}
