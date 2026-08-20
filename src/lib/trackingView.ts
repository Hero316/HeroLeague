import type { ActionCounts, MatchPlayerStat, PlayerCard, Quotas, ScoringConfig, StatRole } from '../types';
import { emptyCounts, matchNote, normalizeCounts, playerCard, quotas, sumCounts } from './rating';

// ===========================================================================
// Ansicht-Helfer für die öffentliche Anzeige: aus den veröffentlichten Roh-
// Zählern die Spieler-Aggregate (Saisonwerte, FIFA-Karte, Quoten, Spiel-für-
// Spiel-Noten) und die Noten je Spiel berechnen. Rein, ohne Seiteneffekte.
// ===========================================================================

export interface PlayerMatchNote {
  matchId: string;
  role: StatRole;
  note: number;
  counts: ActionCounts;
}

export interface PlayerAggregate {
  teamId: string;
  playerName: string;
  role: StatRole; // überwiegende Rolle über die Saison
  games: number;
  total: ActionCounts;
  card: PlayerCard;
  quotas: Quotas;
  perMatch: PlayerMatchNote[];
}

const key = (teamId: string, name: string) => `${teamId}::${name}`;

// Alle veröffentlichten Zeilen zu Spieler-Aggregaten verdichten.
export function aggregatePlayers(rows: MatchPlayerStat[], cfg: ScoringConfig): Map<string, PlayerAggregate> {
  interface Acc {
    teamId: string;
    playerName: string;
    keeperGames: number;
    perMatch: PlayerMatchNote[];
    counts: ActionCounts[];
  }
  const accs = new Map<string, Acc>();

  for (const r of rows) {
    const counts = normalizeCounts(r.counts);
    const role: StatRole = r.role === 'keeper' ? 'keeper' : 'field';
    const k = key(r.teamId, r.playerName);
    let a = accs.get(k);
    if (!a) {
      a = { teamId: r.teamId, playerName: r.playerName, keeperGames: 0, perMatch: [], counts: [] };
      accs.set(k, a);
    }
    if (role === 'keeper') a.keeperGames += 1;
    a.counts.push(counts);
    a.perMatch.push({ matchId: r.matchId, role, note: matchNote(counts, cfg, role), counts });
  }

  const out = new Map<string, PlayerAggregate>();
  for (const [k, a] of accs) {
    const games = a.counts.length;
    const total = sumCounts(a.counts);
    const role: StatRole = a.keeperGames * 2 >= games ? 'keeper' : 'field';
    out.set(k, {
      teamId: a.teamId,
      playerName: a.playerName,
      role,
      games,
      total,
      card: playerCard(total, games, role, cfg),
      quotas: quotas(total, cfg),
      perMatch: a.perMatch,
    });
  }
  return out;
}

// Ein einzelnes Spieler-Aggregat holen (oder null, wenn keine Daten).
export function aggregateFor(
  rows: MatchPlayerStat[],
  cfg: ScoringConfig,
  teamId: string,
  playerName: string
): PlayerAggregate | null {
  const relevant = rows.filter((r) => r.teamId === teamId && r.playerName === playerName);
  if (relevant.length === 0) return null;
  return aggregatePlayers(relevant, cfg).get(key(teamId, playerName)) ?? null;
}

export interface MatchNoteEntry {
  teamId: string;
  playerName: string;
  role: StatRole;
  note: number;
  counts: ActionCounts;
}

// Noten aller Spieler EINES Spiels (für den Spielbericht), nach Note sortiert.
export function notesForMatch(rows: MatchPlayerStat[], cfg: ScoringConfig, matchId: string): MatchNoteEntry[] {
  return rows
    .filter((r) => r.matchId === matchId)
    .map((r) => {
      const counts = normalizeCounts(r.counts);
      const role: StatRole = r.role === 'keeper' ? 'keeper' : 'field';
      return { teamId: r.teamId, playerName: r.playerName, role, note: matchNote(counts, cfg, role), counts };
    })
    .sort((a, b) => b.note - a.note);
}

// Hat ein Spiel überhaupt veröffentlichte Daten?
export function matchHasStats(rows: MatchPlayerStat[], matchId: string): boolean {
  return rows.some((r) => r.matchId === matchId);
}

// Leeres Aggregat-Gerüst (für Fälle ohne Daten).
export function emptyTotal(): ActionCounts {
  return emptyCounts();
}
