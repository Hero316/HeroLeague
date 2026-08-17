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
