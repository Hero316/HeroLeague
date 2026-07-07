import { Match, Standing, Team } from '../types';

// Tabellenberechnung: Sieg=3, Unentschieden=1, Niederlage=0.
// Sortierung: Punkte, Tordifferenz, erzielte Tore, alphabetisch.
// Wird von Tabelle und Vereins-Detailseite gemeinsam genutzt.
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

  return Object.values(standingsMap)
    .map((standing) => {
      standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
      standing.form = standing.form.slice(-5);
      return standing;
    })
    .sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
      if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
      return a.teamName.localeCompare(b.teamName);
    });
}
