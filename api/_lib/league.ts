import type { Match, PlayerStat, Team } from '../../src/types';

// Punktegewichte der Ballon-d'Or-Wertung, in Zehnteln als Ganzzahl gerechnet,
// um Fließkomma-Rundungsfehler (0,1 + 0,2 ≠ 0,3) zu vermeiden.
const PTS_GOAL = 5; // 0,5 pro Tor
const PTS_ASSIST = 3; // 0,3 pro Vorlage
const PTS_MOTM = 10; // 1,0 als bester Spieler des Spiels
const PTS_GK_CLEAN = 5; // 0,5 für den Torwart bei „zu null" (Team ohne Gegentor)
const PTS_WIN = 3; // 0,3 pro eingesetztem Spieler bei Sieg
const PTS_DRAW = 1; // 0,1 pro eingesetztem Spieler bei Unentschieden

// Spielerstatistiken (Tore, Assists, Einsätze, MOTM, Wertungspunkte) aus Kadern und den
// Torschützen-/Bester-Spieler-Einträgen der beendeten Spiele ableiten – nie manuell gepflegt.
// Die `points` werden intern in Zehnteln akkumuliert und erst am Ende in echte Punkte umgerechnet.
export function calculatePlayers(teams: Team[], matches: Match[]): PlayerStat[] {
  const playerMap: { [name: string]: PlayerStat } = {};

  const ensurePlayer = (name: string, teamName: string, teamLogoColor: string, idPrefix: string, imageUrl?: string) => {
    if (!playerMap[name]) {
      playerMap[name] = {
        id: `${idPrefix}-${name.replace(/\s+/g, '-')}`,
        name,
        imageUrl,
        teamName,
        teamLogoColor,
        goals: 0,
        assists: 0,
        matchesPlayed: 0,
        motmCount: 0,
        cleanSheets: 0, // Spiele als Torwart ohne Gegentor („zu null")
        gamesInGoal: 0, // Spiele, in denen der Spieler im Tor stand
        goalsConceded: 0, // kassierte Gegentore in seinen Torwart-Spielen
        points: 0, // hier zunächst in Zehnteln
      };
    }
    return playerMap[name];
  };

  teams.forEach((t) => {
    (t.spielerliste || []).forEach((player) => {
      ensurePlayer(player.name, t.name, t.logoColor || '#3B82F6', `p-${t.id}`, player.imageUrl);
    });
  });

  matches.forEach((m) => {
    if (m.status !== 'beendet') return;

    const homeTeam = teams.find((t) => t.id === m.homeTeamId);
    const awayTeam = teams.find((t) => t.id === m.awayTeamId);
    const scorers = m.scorers || [];

    // Tore & Vorlagen: Statistik + Punkte
    scorers.forEach((s) => {
      const team = teams.find((t) => t.id === s.teamId);
      const teamName = team ? team.name : 'Unbekannt';
      const teamLogoColor = team?.logoColor || '#3B82F6';

      if (s.playerName && s.playerName !== 'Eigentor' && s.playerName !== 'Unbekannt') {
        const p = ensurePlayer(s.playerName, teamName, teamLogoColor, 'p-dyn');
        p.goals += 1;
        p.points += PTS_GOAL;
      }

      if (s.assistName && s.assistName !== 'Unbekannt') {
        const p = ensurePlayer(s.assistName, teamName, teamLogoColor, 'p-dyn');
        p.assists += 1;
        p.points += PTS_ASSIST;
      }
    });

    // Bester Spieler je Team: +1,0
    (m.bestPlayers || []).forEach((b) => {
      if (!b.playerName) return;
      const team = teams.find((t) => t.id === b.teamId);
      const teamName = team ? team.name : 'Unbekannt';
      const teamLogoColor = team?.logoColor || '#3B82F6';
      const p = ensurePlayer(b.playerName, teamName, teamLogoColor, 'p-dyn');
      p.motmCount += 1;
      p.points += PTS_MOTM;
    });

    // Torwart je Team: Gegentore zählen, bei „zu null" +0,5 (Basis für den Goldenen Handschuh)
    (m.goalkeepers || []).forEach((g) => {
      if (!g.playerName || m.homeScore === null || m.awayScore === null) return;
      const conceded =
        g.teamId === m.homeTeamId ? m.awayScore : g.teamId === m.awayTeamId ? m.homeScore : null;
      if (conceded === null) return;
      const team = teams.find((t) => t.id === g.teamId);
      const p = ensurePlayer(g.playerName, team ? team.name : 'Unbekannt', team?.logoColor || '#3B82F6', 'p-dyn');
      p.gamesInGoal += 1;
      p.goalsConceded += conceded;
      if (conceded === 0) {
        p.cleanSheets += 1;
        p.points += PTS_GK_CLEAN;
      }
    });

    // Einsätze zählen + Team-Ergebnis-Punkte – aber nur für Kaderspieler, die nicht als abwesend markiert sind.
    // Wer getroffen oder vorbereitet hat, gilt immer als eingesetzt (auch bei fälschlicher Abwesenheit).
    const absentKeys = new Set((m.absentees || []).map((a) => `${a.teamId}::${a.playerName}`));
    const contributed = new Set<string>();
    scorers.forEach((s) => {
      if (s.playerName) contributed.add(s.playerName);
      if (s.assistName) contributed.add(s.assistName);
    });

    // Team-Ergebnis in Zehntel-Punkte übersetzen (Sieg 0,4 · Remis 0,2 · Niederlage 0)
    const resultPoints = (side: 'home' | 'away'): number => {
      if (m.homeScore === null || m.awayScore === null) return 0;
      if (m.homeScore === m.awayScore) return PTS_DRAW;
      const homeWon = m.homeScore > m.awayScore;
      return (side === 'home' ? homeWon : !homeWon) ? PTS_WIN : 0;
    };

    ([[homeTeam, 'home'], [awayTeam, 'away']] as const).forEach(([team, side]) => {
      (team?.spielerliste || []).forEach((player) => {
        const stat = playerMap[player.name];
        if (!stat) return;
        const isAbsent = absentKeys.has(`${team!.id}::${player.name}`) && !contributed.has(player.name);
        if (!isAbsent) {
          stat.matchesPlayed += 1;
          stat.points += resultPoints(side);
        }
      });
    });
  });

  // Zehntel -> echte Punkte umrechnen
  const result = Object.values(playerMap);
  result.forEach((p) => {
    p.points = p.points / 10;
  });
  return result;
}
