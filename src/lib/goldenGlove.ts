import { Match, PlayerStat } from '../types';

// Goldener Handschuh ("Golden Glove") – Torwart-Ranking nach dem Prinzip
// „Goals Saved Above Average" (GSAA). Belohnt Konstanz und gleicht Ausreißer
// durch Einmal-Einsätze automatisch aus, weil der Beitrag eines Keepers immer
// am dynamischen Liga-Durchschnitt gemessen wird.
//
// Die Roh-Daten pro Torwart (games_played, goals_conceded, clean_sheets,
// motm_awards) werden aus den beendeten Spielen abgeleitet – siehe
// `calculatePlayers` in `api/_lib/league.ts`. Es gibt bewusst KEINE gespeicherte
// Tabelle: alles wird aus den Ergebnissen berechnet.

// Mindestanzahl absolvierter Torwart-Spiele, ab der ein Keeper gerankt angezeigt
// wird (entspricht einem vollen Spieltag). Hält die Tabelle übersichtlich.
export const MIN_GAMES = 5;

// Gewichte der Formel (bewusst als Fließkomma, da der Score ohnehin gerundet
// angezeigt wird und negativ werden darf).
const W_GSAA = 0.2; // Skalierung des „Goals Saved Above Average"-Anteils
const W_CLEAN_SHEET = 0.5; // Bonus je Spiel zu null
const W_MOTM = 1.0; // Bonus je „Man of the Match"

// Dynamischer Liga-Durchschnitt: Wie viele Gegentore kassiert ein Team im Schnitt
// pro Spiel? = (alle in der Liga gefallenen Tore) / (alle absolvierten Spiele × 2).
// Der Faktor 2 verteilt die Tore eines Spiels auf beide Teams.
export function leagueAvgConceded(matches: Match[]): number {
  let totalGoals = 0;
  let totalGames = 0;
  matches.forEach((m) => {
    if (m.status !== 'beendet' || m.homeScore === null || m.awayScore === null) return;
    totalGoals += m.homeScore + m.awayScore;
    totalGames += 1;
  });
  if (totalGames === 0) return 0;
  return totalGoals / (totalGames * 2);
}

// Golden-Glove-Score eines Torwarts nach der GSAA-Formel:
//   score = 0.2 * ((leagueAvgConceded * games_played) - goals_conceded)
//           + (clean_sheets * 0.5) + (motm_awards * 1.0)
// Der erste Teil vergleicht die real kassierten Gegentore mit dem, was ein
// durchschnittlicher Torwart bei gleicher Spielzahl kassiert hätte: besser als
// der Schnitt = Pluspunkte, schlechter = Minuspunkte.
export function goldenGloveScore(player: PlayerStat, avgConceded: number): number {
  const gsaa = avgConceded * player.gamesInGoal - player.goalsConceded;
  return W_GSAA * gsaa + player.cleanSheets * W_CLEAN_SHEET + player.motmCount * W_MOTM;
}

// Ein Eintrag der fertigen Rangliste: der Spieler samt berechnetem Score.
export interface GoldenGloveEntry extends PlayerStat {
  score: number;
}

// Fertig sortiertes Golden-Glove-Ranking, das sich das Frontend direkt ziehen
// kann: nur Torhüter mit games_played >= MIN_GAMES, absteigend nach Score
// (Tie-Break: mehr Spiele zu null, weniger Gegentore, dann Name).
export function rankGoldenGlove(players: PlayerStat[], matches: Match[]): GoldenGloveEntry[] {
  const avg = leagueAvgConceded(matches);
  return players
    .filter((p) => p.gamesInGoal >= MIN_GAMES)
    .map((p) => ({ ...p, score: goldenGloveScore(p, avg) }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.cleanSheets - a.cleanSheets ||
        a.goalsConceded - b.goalsConceded ||
        a.name.localeCompare(b.name)
    );
}
