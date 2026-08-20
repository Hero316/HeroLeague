// Client-Helfer für das Mini-Game „Hero Kicker" (Bestenliste).
// Die eigentliche Spiel-Engine läuft komplett im Browser; nur das Ergebnis
// (Sieg/Remis/Niederlage + Tore) geht am Ende an den Server – wer man ist,
// bestimmt serverseitig die Login-Session.
import { apiFetch } from './api';

export interface GameBoardRow {
  userId: string;
  name: string;
  plays: number;
  wins: number;
  draws: number;
  losses: number;
  gf: number;
  ga: number;
  bestWin: number;
  points: number;
}

export type GameResult = 'win' | 'draw' | 'loss';

// Aktuelle Rangliste (nach Punkten sortiert) laden.
export const fetchGameBoard = () =>
  apiFetch<{ board: GameBoardRow[] }>('/api/twitch?resource=game').then((r) => r.board);

// Ergebnis eines Spiels melden. Antwort = eigene Bilanz + aktualisierte Rangliste.
export const reportGameResult = (result: GameResult, gf: number, ga: number) =>
  apiFetch<{ me: GameBoardRow; board: GameBoardRow[] }>('/api/twitch?resource=game', {
    method: 'POST',
    body: JSON.stringify({ result, gf, ga }),
  });
