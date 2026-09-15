import type { ActionCounts, MatchPlayerStat, PlayerCard, ScoringConfig, StatRole } from '../types';
import { matchNote, normalizeCounts, playerCard, rohscore, sumCounts } from './rating';

// ===========================================================================
// Auszeichnungen aus den getrackten Daten: Man of the Matchday, Top 5, HERO ONE
// (Saison) und Goldener Handschuh. Reine Funktionen. Der „Score" ist die Summe
// der Rohscores über die gewerteten Spiele; zusätzlich die Ø-Note.
// ===========================================================================

export interface RankedPlayer {
  teamId: string;
  playerName: string;
  games: number;
  role: StatRole;
  score: number; // Summe der Rohscores
  avgNote: number; // Ø Note (6–10)
  total: ActionCounts;
  card: PlayerCard;
  cleanSheets: number;
}

interface Acc {
  teamId: string;
  playerName: string;
  games: number;
  keeperGames: number;
  scoreSum: number;
  noteSum: number;
  counts: ActionCounts[];
  cleanSheets: number;
}

function aggregate(rows: MatchPlayerStat[], cfg: ScoringConfig, matchFilter?: Set<string>): RankedPlayer[] {
  const map = new Map<string, Acc>();
  for (const r of rows) {
    if (matchFilter && !matchFilter.has(r.matchId)) continue;
    const counts = normalizeCounts(r.counts);
    const role: StatRole = r.role === 'keeper' ? 'keeper' : 'field';
    const k = `${r.teamId}::${r.playerName}`;
    let a = map.get(k);
    if (!a) {
      a = { teamId: r.teamId, playerName: r.playerName, games: 0, keeperGames: 0, scoreSum: 0, noteSum: 0, counts: [], cleanSheets: 0 };
      map.set(k, a);
    }
    a.games += 1;
    if (role === 'keeper') a.keeperGames += 1;
    a.scoreSum += rohscore(counts, cfg, role);
    a.noteSum += matchNote(counts, cfg, role);
    a.counts.push(counts);
    if (role === 'keeper' && counts.gk_goal_against === 0) a.cleanSheets += 1;
  }
  const out: RankedPlayer[] = [];
  for (const a of map.values()) {
    const role: StatRole = a.keeperGames * 2 >= a.games ? 'keeper' : 'field';
    const total = sumCounts(a.counts);
    out.push({
      teamId: a.teamId,
      playerName: a.playerName,
      games: a.games,
      role,
      score: Math.round(a.scoreSum * 10) / 10,
      avgNote: Math.round((a.noteSum / Math.max(1, a.games)) * 100) / 100,
      total,
      card: playerCard(total, a.games, role, cfg),
      cleanSheets: a.cleanSheets,
    });
  }
  return out;
}

// --- Bestenlisten je Kategorie (Pässe, Dribblings, Zweikämpfe, Schüsse …) -----
// Top-Spieler nach einem Hauptwert (Menge), plus optionaler Quote.
export interface StatLeader {
  teamId: string;
  playerName: string;
  value: number; // Hauptwert (z.B. angekommene Pässe)
  quote: number | null; // 0..1 (z.B. Passquote), optional
  games: number;
}

const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

function leaders(
  rows: MatchPlayerStat[],
  cfg: ScoringConfig,
  o: {
    value: (t: ActionCounts) => number; // Menge (z.B. angekommene Pässe / gewonnene Zweikämpfe)
    quote?: (t: ActionCounts) => number | null;
    attempts?: (t: ActionCounts) => number; // Nenner der Quote (für Mindestanzahl + Quote-Sortierung)
    minAttempts?: number; // nur bei Quote-Sortierung: Mindestversuche, damit z.B. 1/1 nicht führt
    sortByQuote?: boolean; // true = nach Quote sortieren, sonst nach Menge
    limit?: number;
  }
): StatLeader[] {
  const min = o.minAttempts ?? 1;
  return aggregate(rows, cfg)
    .map((p) => ({
      teamId: p.teamId,
      playerName: p.playerName,
      value: o.value(p.total),
      quote: o.quote ? o.quote(p.total) : null,
      attempts: o.attempts ? o.attempts(p.total) : o.value(p.total),
      games: p.games,
    }))
    .filter((p) => (o.sortByQuote ? p.attempts >= min && p.quote != null : p.value > 0))
    .sort((a, b) =>
      o.sortByQuote
        ? (b.quote ?? 0) - (a.quote ?? 0) || b.value - a.value || a.playerName.localeCompare(b.playerName)
        : b.value - a.value || (b.quote ?? 0) - (a.quote ?? 0) || a.playerName.localeCompare(b.playerName)
    )
    .slice(0, o.limit ?? 10)
    .map(({ teamId, playerName, value, quote, games }) => ({ teamId, playerName, value, quote, games }));
}

// Beste Passquote: nach Quote sortiert (ab genügend Pässen), Menge = angekommene Pässe.
export function passLeaders(rows: MatchPlayerStat[], cfg: ScoringConfig): StatLeader[] {
  return leaders(rows, cfg, {
    value: (t) => t.pass_ok,
    quote: (t) => ratio(t.pass_ok, t.pass_ok + t.pass_fail),
    attempts: (t) => t.pass_ok + t.pass_fail,
    minAttempts: 5,
    sortByQuote: true,
  });
}
// Beste Dribbling-Quote: nach Quote sortiert (ab genügend Dribblings).
export function dribbleLeaders(rows: MatchPlayerStat[], cfg: ScoringConfig): StatLeader[] {
  return leaders(rows, cfg, {
    value: (t) => t.dribble_won,
    quote: (t) => ratio(t.dribble_won, t.dribble_won + t.dribble_lost),
    attempts: (t) => t.dribble_won + t.dribble_lost,
    minAttempts: 5,
    sortByQuote: true,
  });
}
// Beste Zweikampfquote: nach Quote sortiert (ab genügend Zweikämpfen).
export function duelLeaders(rows: MatchPlayerStat[], cfg: ScoringConfig): StatLeader[] {
  return leaders(rows, cfg, {
    value: (t) => t.duel_won,
    quote: (t) => ratio(t.duel_won, t.duel_won + t.duel_lost),
    attempts: (t) => t.duel_won + t.duel_lost,
    minAttempts: 5,
    sortByQuote: true,
  });
}
// Meiste Torschüsse: Schüsse aufs Tor (inkl. Tore) nach Menge, mit Genauigkeit.
export function shotLeaders(rows: MatchPlayerStat[], cfg: ScoringConfig): StatLeader[] {
  return leaders(rows, cfg, {
    value: (t) => t.goal + t.shot_on,
    quote: (t) => ratio(t.goal + t.shot_on, t.goal + t.shot_on + t.shot_blocked_off + t.shot_miss),
  });
}
// Balleroberer: Interceptions + gewonnene Zweikämpfe (reine Menge).
export function ballWinnerLeaders(rows: MatchPlayerStat[], cfg: ScoringConfig): StatLeader[] {
  return leaders(rows, cfg, { value: (t) => t.interception + t.duel_won });
}
// Kreativste: Schlüsselpässe (reine Menge).
export function keyPassLeaders(rows: MatchPlayerStat[], cfg: ScoringConfig): StatLeader[] {
  return leaders(rows, cfg, { value: (t) => t.key_pass });
}

// HERO ONE: Saison-Rangliste nach Gesamt-Score.
export function seasonRanking(rows: MatchPlayerStat[], cfg: ScoringConfig): RankedPlayer[] {
  return aggregate(rows, cfg).sort(
    (a, b) => b.score - a.score || b.avgNote - a.avgNote || a.playerName.localeCompare(b.playerName)
  );
}

// Goldener Handschuh / bester Torwart: Torhüter nach Karten-Gesamtwert.
export function keeperRanking(rows: MatchPlayerStat[], cfg: ScoringConfig): RankedPlayer[] {
  return aggregate(rows, cfg)
    .filter((p) => p.role === 'keeper')
    .sort((a, b) => b.card.ges - a.card.ges || b.cleanSheets - a.cleanSheets || b.score - a.score);
}

// Man of the Matchday / Top 5: Rangliste über die Spiele EINES Spieltags.
export function matchdayRanking(rows: MatchPlayerStat[], cfg: ScoringConfig, matchIds: Set<string>): RankedPlayer[] {
  return aggregate(rows, cfg, matchIds).sort((a, b) => b.score - a.score || b.avgNote - a.avgNote);
}

// --- Torschützenkönig & Vorlagen – rein aus den getrackten Toren/Vorlagen -----
// (Ein „Tor" ist ein getracktes Tor oder Elfmetertor; Eigentore zählen NICHT.)
export interface ScorerEntry {
  teamId: string;
  playerName: string;
  goals: number;
  assists: number;
  games: number;
}
function tally(rows: MatchPlayerStat[], cfg: ScoringConfig): ScorerEntry[] {
  return aggregate(rows, cfg).map((p) => ({
    teamId: p.teamId,
    playerName: p.playerName,
    goals: p.total.goal + p.total.penalty_goal,
    assists: p.total.assist,
    games: p.games,
  }));
}
export function scorerRanking(rows: MatchPlayerStat[], cfg: ScoringConfig): ScorerEntry[] {
  return tally(rows, cfg)
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.playerName.localeCompare(b.playerName));
}
export function assistRanking(rows: MatchPlayerStat[], cfg: ScoringConfig): ScorerEntry[] {
  return tally(rows, cfg)
    .filter((p) => p.assists > 0)
    .sort((a, b) => b.assists - a.assists || b.goals - a.goals || a.playerName.localeCompare(b.playerName));
}

// --- Goldener Handschuh – NEU: eigener Torwart-Score rein aus den getrackten
// Torwart-Aktionen. Belohnt: unter dem Liga-Schnitt kassieren (GSAA), Paraden,
// Spiele zu null, gehaltene Elfmeter und Stellungsspiel. Fair gegen den
// dynamischen Liga-Durchschnitt der Gegentore pro Torwart-Spiel gewichtet.
export interface KeeperEntry extends RankedPlayer {
  goldenGloveScore: number;
  goalsConceded: number;
  saves: number;
  penaltySaves: number;
  positionSaves: number;
  saveRate: number | null; // Paraden / (Paraden + Gegentore)
}
// Mindestanzahl Torwart-Spiele, ab der ein Keeper gerankt wird.
export const KEEPER_MIN_GAMES = 3;
const GG_W_GSAA = 0.4; // „Goals Saved Above Average" – weniger kassieren als der Schnitt
const GG_W_SAVE = 0.08; // je Parade
const GG_W_CLEAN = 0.5; // je Spiel zu null
const GG_W_PEN = 1.0; // je gehaltenem Elfmeter
const GG_W_POS = 0.15; // je Stellungsspiel-Parade

export function goldenGloveRanking(rows: MatchPlayerStat[], cfg: ScoringConfig): KeeperEntry[] {
  const keepers = aggregate(rows, cfg).filter((p) => p.role === 'keeper');
  // Dynamischer Liga-Schnitt: Gegentore pro Torwart-Spiel über alle Keeper.
  let totalConceded = 0;
  let totalGames = 0;
  for (const p of keepers) {
    totalConceded += p.total.gk_goal_against;
    totalGames += p.games;
  }
  const avgConceded = totalGames > 0 ? totalConceded / totalGames : 0;

  return keepers
    .filter((p) => p.games >= KEEPER_MIN_GAMES)
    .map((p) => {
      const gc = p.total.gk_goal_against;
      const saves = p.total.save;
      const gkActions = saves + gc;
      const gsaa = avgConceded * p.games - gc;
      const score =
        GG_W_GSAA * gsaa +
        GG_W_SAVE * saves +
        GG_W_CLEAN * p.cleanSheets +
        GG_W_PEN * p.total.penalty_save +
        GG_W_POS * p.total.gk_position_save;
      return {
        ...p,
        goldenGloveScore: Math.round(score * 10) / 10,
        goalsConceded: gc,
        saves,
        penaltySaves: p.total.penalty_save,
        positionSaves: p.total.gk_position_save,
        saveRate: gkActions > 0 ? saves / gkActions : null,
      };
    })
    .sort(
      (a, b) =>
        b.goldenGloveScore - a.goldenGloveScore ||
        b.cleanSheets - a.cleanSheets ||
        a.goalsConceded - b.goalsConceded ||
        a.playerName.localeCompare(b.playerName)
    );
}
