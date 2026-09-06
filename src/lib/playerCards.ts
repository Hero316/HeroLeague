import type { MatchPlayerStat, PlayerCard, ScoringConfig, StatRole } from '../types';
import { normalizeCounts, playerCard, sumCounts } from './rating';

// ---------------------------------------------------------------------------
// Baut die FC-/FIFA-Karte eines Spielers – EXAKT wie die Team-Detailseite:
// die getrackten Zähler dieses Spielers summieren und über die Score-Config
// (ScoringConfig) werten. Rolle (Feld/Torwart) wird aus den getrackten Zeilen
// abgeleitet (Mehrheit „keeper" ⇒ Torwart). So ist die Karte im Vergleich,
// im Rückblick und auf der Team-Seite garantiert identisch.
// ---------------------------------------------------------------------------

export interface PlayerCardResult {
  card: PlayerCard;
  role: StatRole;
  games: number; // Anzahl getrackter Spiele (Basis der Karte)
}

export function cardForPlayer(
  playerName: string,
  teamId: string,
  trackingRows: MatchPlayerStat[],
  cfg: ScoringConfig
): PlayerCardResult | null {
  const rows = trackingRows.filter((r) => r.teamId === teamId && r.playerName === playerName);
  if (rows.length === 0) return null;
  const total = sumCounts(rows.map((r) => normalizeCounts(r.counts)));
  const keeperRows = rows.filter((r) => r.role === 'keeper').length;
  const role: StatRole = keeperRows > rows.length / 2 ? 'keeper' : 'field';
  return { card: playerCard(total, rows.length, role, cfg), role, games: rows.length };
}
