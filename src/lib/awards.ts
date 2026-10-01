import type { ActionCounts, MatchPlayerStat, PlayerCard, ScoringConfig, StatRole } from '../types';
import { countCleanSheets, matchNote, normalizeCounts, passversuche, playerCard, sumCounts } from './rating';
import { leagueDayKey } from './stats';

// ===========================================================================
// Auszeichnungen des Spieltages (Spieler + Torwart) aus den GETRACKTEN Daten.
//  • bestOfDay: wer hatte am Spieltag die beste Note (Schnitt seiner Spiele)?
//    → Vorschlag für „Automatisch berechnen" im Backend.
//  • awardView: alles, was die Startseite zu einem Ausgezeichneten zeigt –
//    Saison-FIFA-Karte + Werte dieses Spieltags.
// Liga-Spieltage haben den Schlüssel "s:<saison>:<spieltag>".
// ===========================================================================

const round1 = (n: number) => Math.round(n * 10) / 10;

// Spieltag-Nummer aus einem Liga-Schlüssel (null für Events/fremde Saisons).
function matchdayOf(dayKey: string, seasonId: string): number | null {
  const prefix = `s:${seasonId}:`;
  if (!dayKey.startsWith(prefix)) return null;
  const n = Number(dayKey.slice(prefix.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Letzter getrackter (veröffentlichter) Spieltag der Saison.
export function latestTrackedMatchday(rows: MatchPlayerStat[], seasonId: string): number | null {
  let best: number | null = null;
  for (const r of rows) {
    const md = matchdayOf(r.dayKey, seasonId);
    if (md !== null && (best === null || md > best)) best = md;
  }
  return best;
}

export interface DayCandidate {
  teamId: string;
  name: string;
  note: number; // Schnitt der Spielnoten an diesem Spieltag
  games: number;
  counts: ActionCounts; // Summe des Spieltags
}

// Beste Note je Rolle an einem Spieltag. Gleichstand: mehr Tore (Feld) bzw.
// mehr Paraden (Torwart) gewinnt.
export function bestOfDay(
  rows: MatchPlayerStat[],
  seasonId: string,
  cfg: ScoringConfig,
  matchday?: number | null
): { matchday: number; field: DayCandidate | null; keeper: DayCandidate | null } | null {
  const md = matchday && matchday > 0 ? matchday : latestTrackedMatchday(rows, seasonId);
  if (!md) return null;
  const key = leagueDayKey(seasonId, md);
  const dayRows = rows.filter((r) => r.dayKey === key);
  if (dayRows.length === 0) return null;

  const pick = (role: StatRole): DayCandidate | null => {
    const groups = new Map<string, MatchPlayerStat[]>();
    for (const r of dayRows) {
      if (r.role !== role) continue;
      const k = `${r.teamId}|${r.playerName}`;
      groups.set(k, [...(groups.get(k) ?? []), r]);
    }
    let best: DayCandidate | null = null;
    for (const list of groups.values()) {
      const counts = sumCounts(list.map((r) => normalizeCounts(r.counts)));
      const note = round1(list.reduce((s, r) => s + matchNote(normalizeCounts(r.counts), cfg, role), 0) / list.length);
      const cand: DayCandidate = { teamId: list[0].teamId, name: list[0].playerName, note, games: list.length, counts };
      const tie = role === 'keeper' ? counts.save : counts.goal;
      const bestTie = best ? (role === 'keeper' ? best.counts.save : best.counts.goal) : -1;
      if (!best || note > best.note || (note === best.note && tie > bestTie)) best = cand;
    }
    return best;
  };

  return { matchday: md, field: pick('field'), keeper: pick('keeper') };
}

export interface AwardView {
  card: PlayerCard | null; // Saison-FIFA-Karte (null = noch nichts getrackt)
  note: number | null; // Spieltagsnote (Schnitt)
  stats: { value: string; label: string }[]; // Werte des Spieltags (ohne Note)
}

// Karte + Spieltagswerte eines Ausgezeichneten. `role` = Feldspieler/Torwart.
export function awardView(
  rows: MatchPlayerStat[],
  seasonId: string,
  cfg: ScoringConfig,
  teamId: string,
  name: string,
  role: StatRole,
  matchday?: number | null
): AwardView {
  const mine = rows.filter((r) => r.teamId === teamId && r.playerName === name && r.dayKey.startsWith(`s:${seasonId}:`));
  if (mine.length === 0) return { card: null, note: null, stats: [] };

  const all = mine.map((r) => ({ role: r.role, counts: normalizeCounts(r.counts) }));
  const card = playerCard(sumCounts(all.map((r) => r.counts)), mine.length, role, cfg, false, countCleanSheets(all));

  // Spieltag: der gewählte, sonst der letzte, an dem der Spieler getrackt wurde.
  const md =
    matchday && matchday > 0
      ? matchday
      : Math.max(...mine.map((r) => matchdayOf(r.dayKey, seasonId) ?? 0));
  const day = mine.filter((r) => r.dayKey === leagueDayKey(seasonId, md));
  if (day.length === 0) return { card, note: null, stats: [] };

  const dayRows = day.map((r) => ({ role: r.role, counts: normalizeCounts(r.counts) }));
  const total = sumCounts(dayRows.map((r) => r.counts));
  const note = round1(dayRows.reduce((s, r) => s + matchNote(r.counts, cfg, r.role), 0) / dayRows.length);

  const stats =
    role === 'keeper'
      ? [
          { value: String(total.save), label: 'Paraden' },
          { value: String(total.save_top), label: 'Glanzparaden' },
          { value: `${countCleanSheets(dayRows)}×`, label: 'Zu null' },
        ]
      : (() => {
          const tries = passversuche(total);
          return [
            { value: String(total.goal), label: 'Tore' },
            { value: String(total.assist), label: 'Vorlagen' },
            { value: tries > 0 ? `${Math.round((total.pass_ok / tries) * 100)} %` : '–', label: 'Passquote' },
          ];
        })();
  return { card, note, stats };
}

// Note deutsch formatiert (8,7).
export const fmtNote = (n: number) => n.toFixed(1).replace('.', ',');
