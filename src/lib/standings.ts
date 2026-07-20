import { Match, Standing, Team } from '../types';

// Tabellenberechnung: Sieg=3, Unentschieden=1, Niederlage=0.
// Sortierung: Punkte, Tordifferenz, direkter Vergleich, erzielte Tore, alphabetisch.
// Wird von Tabelle und Vereins-Detailseite gemeinsam genutzt.

// Direkter Vergleich: Für eine Gruppe punkt- und tordifferenzgleicher Teams eine
// Mini-Tabelle nur aus den Spielen untereinander (Punkte, dann Tordifferenz, dann
// erzielte Tore). Liefert je teamId einen Rang (0 = am besten). Gruppen mit weniger
// als zwei Teams bekommen Rang 0 (kein Effekt).
function headToHeadRanks(groupTeamIds: string[], matches: Match[]): { [teamId: string]: number } {
  const ranks: { [teamId: string]: number } = {};
  groupTeamIds.forEach((id) => (ranks[id] = 0));
  if (groupTeamIds.length < 2) return ranks;

  const groupSet = new Set(groupTeamIds);
  const mini: { [teamId: string]: { points: number; goalsFor: number; goalsAgainst: number } } = {};
  groupTeamIds.forEach((id) => (mini[id] = { points: 0, goalsFor: 0, goalsAgainst: 0 }));

  matches.forEach((match) => {
    if (match.status !== 'beendet' || match.homeScore === null || match.awayScore === null) return;
    if (!groupSet.has(match.homeTeamId) || !groupSet.has(match.awayTeamId)) return;

    const home = mini[match.homeTeamId];
    const away = mini[match.awayTeamId];
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) home.points += 3;
    else if (match.homeScore < match.awayScore) away.points += 3;
    else {
      home.points += 1;
      away.points += 1;
    }
  });

  // Innerhalb der Gruppe nach direktem Vergleich sortieren und Rang vergeben.
  const ordered = [...groupTeamIds].sort((a, b) => {
    const ma = mini[a];
    const mb = mini[b];
    if (mb.points !== ma.points) return mb.points - ma.points;
    const gdA = ma.goalsFor - ma.goalsAgainst;
    const gdB = mb.goalsFor - mb.goalsAgainst;
    if (gdB !== gdA) return gdB - gdA;
    return mb.goalsFor - ma.goalsFor;
  });
  ordered.forEach((id, index) => (ranks[id] = index));
  return ranks;
}

export function calculateStandings(teams: Team[], matches: Match[]): Standing[] {
  const standingsMap: { [teamId: string]: Standing } = {};

  teams.forEach((team) => {
    standingsMap[team.id] = {
      teamId: team.id,
      teamName: team.name,
      shortName: team.shortName,
      logoColor: team.logoColor,
      logoIcon: team.logoIcon,
      logoUrl: team.logoUrl || '',
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: [],
    };
  });

  const sortedMatches = [...matches].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  sortedMatches.forEach((match) => {
    if (match.status !== 'beendet' || match.homeScore === null || match.awayScore === null) return;

    const home = standingsMap[match.homeTeamId];
    const away = standingsMap[match.awayTeamId];
    if (!home || !away) return;

    home.played += 1;
    away.played += 1;
    home.goalsFor += match.homeScore;
    home.goalsAgainst += match.awayScore;
    away.goalsFor += match.awayScore;
    away.goalsAgainst += match.homeScore;

    if (match.homeScore > match.awayScore) {
      home.won += 1;
      home.points += 3;
      home.form.push('W');
      away.lost += 1;
      away.form.push('L');
    } else if (match.homeScore < match.awayScore) {
      away.won += 1;
      away.points += 3;
      away.form.push('W');
      home.lost += 1;
      home.form.push('L');
    } else {
      home.drawn += 1;
      home.points += 1;
      home.form.push('D');
      away.drawn += 1;
      away.form.push('D');
    }
  });

  const standings = Object.values(standingsMap).map((standing) => {
    standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
    standing.form = standing.form.slice(-5);
    return standing;
  });

  // Direkten Vergleich pro Gruppe punkt- und tordifferenzgleicher Teams berechnen.
  const h2hRank: { [teamId: string]: number } = {};
  const groups: { [key: string]: string[] } = {};
  standings.forEach((s) => {
    const key = `${s.points}|${s.goalDifference}`;
    (groups[key] ??= []).push(s.teamId);
  });
  Object.values(groups).forEach((groupTeamIds) => {
    const ranks = headToHeadRanks(groupTeamIds, matches);
    Object.assign(h2hRank, ranks);
  });

  return standings.sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (h2hRank[a.teamId] !== h2hRank[b.teamId]) return h2hRank[a.teamId] - h2hRank[b.teamId];
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });
}
