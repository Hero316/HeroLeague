import { EventMatch } from '../types';

export interface EventTally {
  player: string;
  team: string;
  count: number;
}

export interface EventAwards {
  topScorers: EventTally[]; // meiste Tore
  topAssists: EventTally[]; // meiste Vorlagen
  bestPlayer: EventTally | null; // meiste „Bester Spieler"-Nennungen
  bestKeeper: EventTally | null; // meiste Zu-Null-Spiele (als Torwart)
}

// Auszeichnungen des Abends rein aus den Event-Daten berechnen (getrennt von der Liga).
export function calculateEventAwards(matches: EventMatch[]): EventAwards {
  const goals: Record<string, EventTally> = {};
  const assists: Record<string, EventTally> = {};
  const best: Record<string, EventTally> = {};
  const keeper: Record<string, EventTally> = {};

  const bump = (bucket: Record<string, EventTally>, player: string, team: string) => {
    const p = player.trim();
    if (!p) return;
    const key = `${team.trim().toLowerCase()}|${p.toLowerCase()}`;
    if (!bucket[key]) bucket[key] = { player: p, team: team.trim(), count: 0 };
    bucket[key].count += 1;
  };

  matches.forEach((m) => {
    (m.scorers ?? []).forEach((s) => {
      bump(goals, s.player, s.team);
      if (s.assist && s.assist.trim()) bump(assists, s.assist, s.team);
    });
    (m.bestPlayers ?? []).forEach((b) => bump(best, b.player, b.team));

    // „Zu null": Torwart des Teams, das kein Gegentor kassiert hat (nur gespielte Spiele).
    if (m.homeScore !== null && m.awayScore !== null) {
      const gkHome = (m.goalkeepers ?? []).find((g) => g.team.trim().toLowerCase() === m.home.trim().toLowerCase());
      const gkAway = (m.goalkeepers ?? []).find((g) => g.team.trim().toLowerCase() === m.away.trim().toLowerCase());
      if (m.awayScore === 0 && gkHome) bump(keeper, gkHome.player, gkHome.team);
      if (m.homeScore === 0 && gkAway) bump(keeper, gkAway.player, gkAway.team);
    }
  });

  const sortTally = (b: Record<string, EventTally>) =>
    Object.values(b).sort((a, c) => c.count - a.count || a.player.localeCompare(c.player));

  const topScorers = sortTally(goals);
  const topAssists = sortTally(assists);
  const bestPlayers = sortTally(best);
  const keepers = sortTally(keeper);

  return {
    topScorers,
    topAssists,
    bestPlayer: bestPlayers[0] ?? null,
    bestKeeper: keepers[0] ?? null,
  };
}

// Tabellenzeile für ein Sonder-Event (rein namensbasiert, unabhängig von der Liga).
export interface EventStanding {
  team: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
}

// Tabelle aus den Event-Ergebnissen berechnen: Sieg = 3, Remis = 1, Niederlage = 0.
// Sortierung: Punkte, Tordifferenz, erzielte Tore, Name. Teams ohne Ergebnis
// erscheinen mit 0 Werten (damit die Tabelle von Anfang an vollständig ist).
export function calculateEventStandings(teams: string[], matches: EventMatch[]): EventStanding[] {
  const table: Record<string, EventStanding> = {};
  const ensure = (name: string) => {
    if (!name) return null;
    if (!table[name]) {
      table[name] = {
        team: name,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
      };
    }
    return table[name];
  };

  teams.forEach(ensure);

  matches.forEach((m) => {
    if (m.homeScore === null || m.awayScore === null) return;
    const home = ensure(m.home);
    const away = ensure(m.away);
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;
    home.goalsFor += m.homeScore;
    home.goalsAgainst += m.awayScore;
    away.goalsFor += m.awayScore;
    away.goalsAgainst += m.homeScore;

    if (m.homeScore > m.awayScore) {
      home.won += 1;
      home.points += 3;
      away.lost += 1;
    } else if (m.homeScore < m.awayScore) {
      away.won += 1;
      away.points += 3;
      home.lost += 1;
    } else {
      home.drawn += 1;
      away.drawn += 1;
      home.points += 1;
      away.points += 1;
    }
  });

  return Object.values(table)
    .map((row) => {
      row.goalDifference = row.goalsFor - row.goalsAgainst;
      return row;
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.team.localeCompare(b.team);
    });
}
