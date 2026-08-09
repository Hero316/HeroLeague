import { Match, Team } from '../types';

// Beste Aufstellung eines Teams – rein aus den Spieldaten berechnet, nie manuell.
//
// Idee: Eine „Aufstellung" ist die Menge der an einem Spiel eingesetzten
// Kaderspieler (Anwesende = Kader minus Abwesende; wer getroffen/vorbereitet hat,
// gilt immer als eingesetzt – exakt wie in api/_lib/league.ts). Spiele mit
// identischer Aufstellung werden gruppiert; die Gruppe mit der besten Bilanz
// (Siegquote, dann Siege, dann Anzahl Spiele, dann Tordifferenz) gewinnt.

export interface LineupStat {
  players: string[]; // eingesetzte Spielernamen (sortiert)
  goalkeeper: string | null; // häufigster Torwart dieser Aufstellung (falls gepflegt)
  games: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number; // 0..100, aus Siegen/Spielen
}

// Anwesende Kaderspieler eines Teams in einem konkreten Spiel ermitteln.
function presentPlayers(team: Team, m: Match): string[] {
  const roster = (team.spielerliste || []).map((p) => p.name);
  const absent = new Set(
    (m.absentees || []).filter((a) => a.teamId === team.id).map((a) => a.playerName)
  );
  const contributed = new Set<string>();
  (m.scorers || []).forEach((s) => {
    if (s.teamId !== team.id) return;
    if (s.playerName) contributed.add(s.playerName);
    if (s.assistName) contributed.add(s.assistName);
  });
  return roster.filter((name) => !absent.has(name) || contributed.has(name));
}

// Alle Aufstellungen eines Teams mit ihrer Bilanz, absteigend nach Güte sortiert.
export function calculateLineups(team: Team, matches: Match[]): LineupStat[] {
  const groups: Record<
    string,
    {
      players: string[];
      games: number;
      wins: number;
      draws: number;
      losses: number;
      goalsFor: number;
      goalsAgainst: number;
      gkCount: Record<string, number>;
    }
  > = {};

  matches.forEach((m) => {
    if (m.status !== 'beendet' || m.homeScore === null || m.awayScore === null) return;
    const isHome = m.homeTeamId === team.id;
    const isAway = m.awayTeamId === team.id;
    if (!isHome && !isAway) return;

    const players = presentPlayers(team, m).sort((a, b) => a.localeCompare(b));
    if (players.length === 0) return; // ohne bekannten Kader keine Aufstellung

    const sig = players.join('|');
    const g = (groups[sig] ??= {
      players,
      games: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      gkCount: {},
    });

    const own = isHome ? m.homeScore : m.awayScore;
    const other = isHome ? m.awayScore : m.homeScore;
    g.games += 1;
    g.goalsFor += own;
    g.goalsAgainst += other;
    if (own > other) g.wins += 1;
    else if (own < other) g.losses += 1;
    else g.draws += 1;

    const gk = (m.goalkeepers || []).find((k) => k.teamId === team.id)?.playerName;
    if (gk) g.gkCount[gk] = (g.gkCount[gk] || 0) + 1;
  });

  const list: LineupStat[] = Object.values(groups).map((g) => {
    const goalkeeper =
      Object.entries(g.gkCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    return {
      players: g.players,
      goalkeeper,
      games: g.games,
      wins: g.wins,
      draws: g.draws,
      losses: g.losses,
      goalsFor: g.goalsFor,
      goalsAgainst: g.goalsAgainst,
      winRate: g.games > 0 ? Math.round((g.wins / g.games) * 100) : 0,
    };
  });

  return list.sort(
    (a, b) =>
      b.winRate - a.winRate ||
      b.wins - a.wins ||
      b.games - a.games ||
      b.goalsFor - b.goalsAgainst - (a.goalsFor - a.goalsAgainst)
  );
}

// Die beste Aufstellung – bevorzugt eine, die mehrfach gespielt wurde (aussagekräftiger).
// Gibt null zurück, wenn es noch keine beendeten Spiele mit bekanntem Kader gibt.
export function bestLineup(team: Team, matches: Match[]): LineupStat | null {
  const all = calculateLineups(team, matches);
  if (all.length === 0) return null;
  // Zuerst unter den mehrfach gespielten Aufstellungen suchen (belastbarer);
  // gibt es keine, die beste einmalige nehmen.
  const repeated = all.filter((l) => l.games >= 2);
  return (repeated[0] ?? all[0]) ?? null;
}
