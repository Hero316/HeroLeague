import type { Match, PlayerStat, Team } from '../../src/types';

// Spielerstatistiken (Tore, Assists, Einsätze) aus Kadern und den
// Torschützen-Einträgen der beendeten Spiele ableiten – nie manuell gepflegt.
export function calculatePlayers(teams: Team[], matches: Match[]): PlayerStat[] {
  const playerMap: { [name: string]: PlayerStat } = {};

  teams.forEach((t) => {
    (t.spielerliste || []).forEach((player) => {
      if (!playerMap[player.name]) {
        playerMap[player.name] = {
          id: `p-${t.id}-${player.name.replace(/\s+/g, '-')}`,
          name: player.name,
          imageUrl: player.imageUrl,
          teamName: t.name,
          teamLogoColor: t.logoColor || '#3B82F6',
          goals: 0,
          assists: 0,
          matchesPlayed: 0,
        };
      }
    });
  });

  matches.forEach((m) => {
    if (m.status !== 'beendet' || !m.scorers) return;

    const homeTeam = teams.find((t) => t.id === m.homeTeamId);
    const awayTeam = teams.find((t) => t.id === m.awayTeamId);

    m.scorers.forEach((s) => {
      const team = teams.find((t) => t.id === s.teamId);
      const teamName = team ? team.name : 'Unbekannt';
      const teamLogoColor = team?.logoColor || '#3B82F6';

      if (s.playerName && s.playerName !== 'Eigentor' && s.playerName !== 'Unbekannt') {
        if (!playerMap[s.playerName]) {
          playerMap[s.playerName] = {
            id: `p-dyn-${s.playerName.replace(/\s+/g, '-')}`,
            name: s.playerName,
            teamName,
            teamLogoColor,
            goals: 0,
            assists: 0,
            matchesPlayed: 0,
          };
        }
        playerMap[s.playerName].goals += 1;
      }

      if (s.assistName && s.assistName !== 'Unbekannt') {
        if (!playerMap[s.assistName]) {
          playerMap[s.assistName] = {
            id: `p-dyn-${s.assistName.replace(/\s+/g, '-')}`,
            name: s.assistName,
            teamName,
            teamLogoColor,
            goals: 0,
            assists: 0,
            matchesPlayed: 0,
          };
        }
        playerMap[s.assistName].assists += 1;
      }
    });

    // Einsätze zählen – aber nur für Kaderspieler, die nicht als abwesend markiert sind.
    // Wer getroffen oder vorbereitet hat, gilt immer als eingesetzt (auch bei fälschlicher Abwesenheit).
    const absentKeys = new Set((m.absentees || []).map((a) => `${a.teamId}::${a.playerName}`));
    const contributed = new Set<string>();
    m.scorers.forEach((s) => {
      if (s.playerName) contributed.add(s.playerName);
      if (s.assistName) contributed.add(s.assistName);
    });

    [homeTeam, awayTeam].forEach((team) => {
      (team?.spielerliste || []).forEach((player) => {
        if (!playerMap[player.name]) return;
        const isAbsent = absentKeys.has(`${team!.id}::${player.name}`) && !contributed.has(player.name);
        if (!isAbsent) {
          playerMap[player.name].matchesPlayed += 1;
        }
      });
    });
  });

  return Object.values(playerMap);
}
