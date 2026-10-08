import type { ActionCounts, MatchPlayerStat, PlayerCard, ScoringConfig, StatRole } from '../types';
import { countCleanSheets, matchNote, normalizeCounts, passversuche, playerCard, sumCounts } from './rating';
import { leagueDayKey } from './stats';

// ===========================================================================
// Auszeichnungen des Spieltages (Spieler + Torwart) aus den GETRACKTEN Daten.
//  • bestOfDay: wer hatte am Spieltag die beste Note (Schnitt seiner Spiele)?
//    → Vorschlag für „Automatisch berechnen" im Backend.
//  • awardView: alles, was die Startseite zu einem Ausgezeichneten zeigt –
//    Karte + Werte NUR aus diesem Spieltag (die Saison-Karte ändert sich mit
//    jedem weiteren Spieltag – die Auszeichnung soll aber fix bleiben).
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

// Alle getrackten Spieltage (Nummern) einer Saison, aufsteigend.
export function trackedMatchdays(rows: MatchPlayerStat[], seasonId: string): number[] {
  const set = new Set<number>();
  for (const r of rows) {
    const md = matchdayOf(r.dayKey, seasonId);
    if (md !== null) set.add(md);
  }
  return [...set].sort((a, b) => a - b);
}

// Rangliste einer Rolle an einem Spieltag: beste Note (Schnitt seiner Spiele)
// zuerst. Gleichstand: mehr Tore (Feld) bzw. mehr Paraden (Torwart).
export function rankDay(
  rows: MatchPlayerStat[],
  seasonId: string,
  cfg: ScoringConfig,
  matchday: number,
  role: StatRole
): DayCandidate[] {
  const key = leagueDayKey(seasonId, matchday);
  const groups = new Map<string, MatchPlayerStat[]>();
  for (const r of rows) {
    if (r.dayKey !== key || r.role !== role) continue;
    const k = `${r.teamId}|${r.playerName}`;
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const list: DayCandidate[] = [];
  for (const g of groups.values()) {
    const counts = sumCounts(g.map((r) => normalizeCounts(r.counts)));
    const note = round1(g.reduce((s, r) => s + matchNote(normalizeCounts(r.counts), cfg, role), 0) / g.length);
    list.push({ teamId: g[0].teamId, name: g[0].playerName, note, games: g.length, counts });
  }
  const tie = (c: DayCandidate) => (role === 'keeper' ? c.counts.save : c.counts.goal);
  return list.sort((a, b) => b.note - a.note || tie(b) - tie(a));
}

// Bester Spieler + bester Torwart eines Spieltages (Standard: letzter getrackter).
export function bestOfDay(
  rows: MatchPlayerStat[],
  seasonId: string,
  cfg: ScoringConfig,
  matchday?: number | null
): { matchday: number; field: DayCandidate | null; keeper: DayCandidate | null } | null {
  const md = matchday && matchday > 0 ? matchday : latestTrackedMatchday(rows, seasonId);
  if (!md) return null;
  const field = rankDay(rows, seasonId, cfg, md, 'field')[0] ?? null;
  const keeper = rankDay(rows, seasonId, cfg, md, 'keeper')[0] ?? null;
  if (!field && !keeper) return null;
  return { matchday: md, field, keeper };
}

export interface AwardView {
  card: PlayerCard | null; // Spieltags-Karte (nur dieser Spieltag; null = noch nichts getrackt)
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

  // Spieltag: der gewählte, sonst der letzte, an dem der Spieler getrackt wurde.
  const md =
    matchday && matchday > 0
      ? matchday
      : Math.max(...mine.map((r) => matchdayOf(r.dayKey, seasonId) ?? 0));
  const day = mine.filter((r) => r.dayKey === leagueDayKey(seasonId, md));
  if (day.length === 0) return { card: null, note: null, stats: [] };

  const dayRows = day.map((r) => ({ role: r.role, counts: normalizeCounts(r.counts) }));
  const total = sumCounts(dayRows.map((r) => r.counts));
  // Karte NUR aus diesem Spieltag – ohne „wenige Spiele"-Deckel (ein Abend hat
  // naturgemäß nur ein paar Spiele), wie beim Testspieltag.
  const card = playerCard(total, dayRows.length, role, cfg, true, countCleanSheets(dayRows));
  const note = round1(dayRows.reduce((s, r) => s + matchNote(r.counts, cfg, r.role), 0) / dayRows.length);

  const stats =
    role === 'keeper'
      ? (() => {
          // Nur Positives zeigen: Paradenquote statt „0× zu null"; „Zu null"
          // nur, wenn er wirklich ohne Gegentor geblieben ist.
          const shots = total.save + total.gk_goal_against;
          const clean = countCleanSheets(dayRows);
          return [
            { value: String(total.save), label: 'Paraden' },
            { value: shots > 0 ? `${Math.round((total.save / shots) * 100)} %` : '–', label: 'Paradenquote' },
            clean > 0
              ? { value: `${clean}×`, label: 'Zu null' }
              : { value: String(total.save_top), label: 'Glanzparaden' },
          ];
        })()
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
