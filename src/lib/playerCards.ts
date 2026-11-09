import type { ActionCounts, MatchPlayerStat, PlayerCard, ScoringConfig, StatRole } from '../types';
import { countCleanSheets, normalizeCounts, playerCard, sumCounts } from './rating';

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
  total: ActionCounts; // Summe aller getrackten Aktionen
  delta: number | null; // Gesamtwert-Veränderung seit dem letzten Spieltag (null = nicht anzeigen)
}

export function cardForPlayer(
  playerName: string,
  teamId: string,
  trackingRows: MatchPlayerStat[],
  cfg: ScoringConfig
): PlayerCardResult | null {
  const rows = trackingRows.filter((r) => r.teamId === teamId && r.playerName === playerName);
  if (rows.length === 0) return null;
  const keeperRows = rows.filter((r) => r.role === 'keeper').length;
  const role: StatRole = keeperRows > rows.length / 2 ? 'keeper' : 'field';
  const build = (rs: MatchPlayerStat[]) => {
    const norm = rs.map((r) => ({ role: r.role, counts: normalizeCounts(r.counts) }));
    const total = sumCounts(norm.map((r) => r.counts));
    return { card: playerCard(total, rs.length, role, cfg, false, countCleanSheets(norm)), total };
  };
  const { card, total } = build(rows);
  const delta = cardGesDelta(rows, latestLeagueDay(trackingRows), (rs) => build(rs).card);
  return { card, role, games: rows.length, total, delta };
}

// --- Veränderung der Gesamtwertung (wie bei der ICON-League-Karte) ----------
// Neuester getrackter Liga-Spieltag in den Zeilen (Schlüssel „s:<saison>:<nr>").
export function latestLeagueDay(rows: MatchPlayerStat[]): string | null {
  let best: string | null = null;
  let bestMd = -1;
  for (const r of rows) {
    const m = /^s:.+:(\d+)$/.exec(r.dayKey);
    if (m && Number(m[1]) > bestMd) {
      bestMd = Number(m[1]);
      best = r.dayKey;
    }
  }
  return best;
}

// Gesamtwert jetzt minus Gesamtwert VOR dem neuesten Spieltag. null = nichts
// anzeigen (Spieler war am neuesten Spieltag nicht dabei, oder es gibt noch
// keinen früheren Stand). `build` baut die Karte mit genau denselben Regeln wie
// die angezeigte Karte (Rolle, Deckel …).
export function cardGesDelta(
  playerRows: MatchPlayerStat[],
  latestDay: string | null,
  build: (rows: MatchPlayerStat[]) => PlayerCard | null
): number | null {
  if (!latestDay || !playerRows.some((r) => r.dayKey === latestDay)) return null;
  const before = playerRows.filter((r) => r.dayKey !== latestDay);
  if (before.length === 0) return null;
  const now = build(playerRows);
  const prev = build(before);
  if (!now || !prev) return null;
  return now.ges - prev.ges;
}
