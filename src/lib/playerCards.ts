import type { ActionCounts, MatchPlayerStat, PlayerCard, ScoringConfig, StatRole } from '../types';
import { countCleanSheets, normalizeCounts, playerCard, rowsForCard, sumCounts } from './rating';

// ---------------------------------------------------------------------------
// Baut die FC-/FIFA-Karte eines Spielers – EXAKT wie die Team-Detailseite:
// die getrackten Zähler dieses Spielers summieren und über die Score-Config
// (ScoringConfig) werten. Rolle (Feld/Torwart) wird aus den getrackten Zeilen
// abgeleitet (mindestens die Hälfte als Torwart ⇒ Torwart – dieselbe Regel wie
// Team-Seite und Statistiken). So ist die Karte auf der Startseite, im
// Vergleich, im Rückblick und auf der Team-Seite garantiert identisch.
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
  const role: StatRole = keeperRows * 2 >= rows.length ? 'keeper' : 'field';
  const build = (rs: MatchPlayerStat[], strict: boolean, c: ScoringConfig = cfg) => {
    const norm = rs.map((r) => ({ role: r.role, counts: normalizeCounts(r.counts) }));
    const total = sumCounts(norm.map((r) => r.counts));
    // Karte nur aus den Spielen in der Rolle der Karte (Torwart-Karte = Spiele im Tor).
    const own = rowsForCard(norm, role, strict);
    const card = own.length ? playerCard(sumCounts(own.map((r) => r.counts)), own.length, role, c, false, countCleanSheets(own)) : null;
    return { card, total };
  };
  const { card, total } = build(rows, false);
  if (!card) return null;
  const latest = latestLeagueDay(trackingRows);
  const prevCfg = deltaBaselineCfg(latest, role, cfg) ?? cfg;
  const delta = cardGesDelta(rows, latest, (rs) => build(rs, true).card, (rs) => build(rs, true, prevCfg).card);
  return { card, role, games: rows.length, total, delta };
}

// --- Einmalige Ausnahme für „▲/▼ seit dem letzten Spieltag" (Torhüter) -------
// Nach dem 2. Spieltag 2026/27 wurde die Torwart-Rechnung umgestellt (Neutral-
// wert 60 statt Zug Richtung 40, Sicherheits-Ziele 25 % zu null / 4 Gegentore
// statt 40 % / 1,5). Damit ▲/▼ zu dem passt, was die Torhüter nach dem
// 1. Spieltag tatsächlich auf der Karte hatten, rechnet der VORHER-Wert für
// diesen einen Spieltag mit der alten Rechnung. Ist der 3. Spieltag live, greift
// die Ausnahme nicht mehr – dann kann dieser Block entfernt werden.
const KEEPER_DELTA_BASELINE_DAY = 's:saison-2026-27:2';
export function deltaBaselineCfg(latestDay: string | null, role: StatRole, cfg: ScoringConfig): ScoringConfig | null {
  if (role !== 'keeper' || latestDay !== KEEPER_DELTA_BASELINE_DAY) return null;
  return { ...cfg, card: { ...cfg.card, neutral: cfg.card.basis, sic: { ...cfg.card.sic, zielQuote: 0.4, zielMenge: 1.5 } } };
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
  build: (rows: MatchPlayerStat[]) => PlayerCard | null,
  buildPrev: (rows: MatchPlayerStat[]) => PlayerCard | null = build // Vorher-Wert (siehe deltaBaselineCfg)
): number | null {
  if (!latestDay || !playerRows.some((r) => r.dayKey === latestDay)) return null;
  const before = playerRows.filter((r) => r.dayKey !== latestDay);
  if (before.length === 0) return null;
  const now = build(playerRows);
  const prev = buildPrev(before);
  if (!now || !prev) return null;
  return now.ges - prev.ges;
}
