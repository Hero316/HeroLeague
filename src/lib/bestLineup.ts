import type { ActionCounts, MatchPlayerStat, ScoringConfig } from '../types';
import { matchNote, normalizeCounts } from './rating';

// ===========================================================================
// Beste Aufstellung aus dem Tracking (Teamseite, Mini-Feld 2-2 + Torwart + Bank).
// 66/33-Prinzip auf Basis der „Wert"-Spalten aus den Statistiken
// (Wert = erfolgreiche × Quote = erfolgreiche² ÷ Versuche, pro Spiel):
//  • vorne:  ⅔ Schuss-Wert (aufs Tor inkl. Tore) + ⅓ Dribbler-Wert
//  • hinten: ⅔ Zweikampf-Wert + ⅓ Pass-Wert
// Jeder Teilwert wird im Teamvergleich eingeordnet (Bester im Team = 1), damit
// z. B. viele Pässe nicht die Zweikämpfe „überstimmen". Menge × Quote sorgt
// dafür, dass 1 von 1 kaum zählt, 11 von 16 dagegen viel.
//  • Torwart: der im Kader ausgewählte Torwart (sonst wer am häufigsten im Tor stand)
//  • Erst die 2 besten Offensiven nach vorne, dann aus dem Rest die 2 besten Defensiven
//  • Bank: die nächsten 4 nach Ø-Note
// ===========================================================================

const W_MAIN = 2 / 3;
const W_SIDE = 1 / 3;
// Menge × Quote (= erfolgreiche² ÷ Versuche); 0 ohne Versuche.
const wert = (ok: number, all: number) => (all > 0 ? (ok * ok) / all : 0);

export interface LineupPlayer {
  name: string;
  games: number; // getrackte Spiele als Feldspieler (bzw. im Tor beim Torwart)
  off: number; // Offensiv-Wert (0..1 im Teamvergleich)
  def: number; // Defensiv-Wert (0..1 im Teamvergleich)
  avgNote: number;
}

export interface TrackedLineup {
  goalkeeper: LineupPlayer | null;
  attack: LineupPlayer[]; // bis zu 2
  defense: LineupPlayer[]; // bis zu 2
  bench: LineupPlayer[]; // bis zu 4
}

export function trackedLineup(
  rows: MatchPlayerStat[],
  cfg: ScoringConfig,
  teamId: string,
  kader: { name: string; goalkeeper?: boolean }[]
): TrackedLineup | null {
  const inKader = new Set(kader.map((p) => p.name));
  const acc = new Map<string, { games: number; keeperGames: number; total: ActionCounts | null; note: number }>();
  for (const r of rows) {
    if (r.teamId !== teamId || !inKader.has(r.playerName)) continue;
    const c = normalizeCounts(r.counts);
    const a = acc.get(r.playerName) ?? { games: 0, keeperGames: 0, total: null, note: 0 };
    if (r.role === 'keeper') {
      a.keeperGames += 1;
    } else {
      a.games += 1;
      a.note += matchNote(c, cfg, 'field');
      if (!a.total) a.total = { ...c };
      else for (const k of Object.keys(c) as (keyof ActionCounts)[]) a.total[k] = (a.total[k] || 0) + (c[k] || 0);
    }
    acc.set(r.playerName, a);
  }
  if (acc.size === 0) return null;

  // Torwart: Kader-Auswahl zuerst, sonst meiste Spiele im Tor.
  const flagged = kader.find((p) => p.goalkeeper)?.name;
  const keeperName =
    flagged ??
    [...acc.entries()].filter(([, a]) => a.keeperGames > 0).sort((x, y) => y[1].keeperGames - x[1].keeperGames)[0]?.[0] ??
    null;
  const keeperAcc = keeperName ? acc.get(keeperName) : undefined;
  const goalkeeper: LineupPlayer | null = keeperName
    ? { name: keeperName, games: keeperAcc?.keeperGames ?? 0, off: 0, def: 0, avgNote: keeperNote(rows, cfg, teamId, keeperName) }
    : null;

  // Teilwerte (Menge × Quote) pro Spiel je Feldspieler.
  const raw = [...acc.entries()]
    .filter(([name, a]) => name !== keeperName && a.games > 0 && a.total)
    .map(([name, a]) => {
      const t = a.total as ActionCounts;
      const g = a.games;
      const shotsAll = t.goal + t.shot_on + t.shot_miss + t.shot_blocked_off;
      return {
        name,
        games: g,
        avgNote: a.note / g,
        shot: wert(t.goal + t.shot_on, shotsAll) / g,
        drib: wert(t.dribble_won, t.dribble_won + t.dribble_lost) / g,
        duel: wert(t.duel_won, t.duel_won + t.duel_lost) / g,
        pass: wert(t.pass_ok, t.pass_ok + t.pass_fail) / g,
      };
    });
  if (raw.length === 0) return { goalkeeper, attack: [], defense: [], bench: [] };

  // Im Teamvergleich einordnen: Bester im Team = 1 (je Teilwert).
  const max = (k: 'shot' | 'drib' | 'duel' | 'pass') => Math.max(...raw.map((p) => p[k]));
  const mx = { shot: max('shot'), drib: max('drib'), duel: max('duel'), pass: max('pass') };
  const rel = (v: number, m: number) => (m > 0 ? v / m : 0);
  const field: LineupPlayer[] = raw.map((p) => ({
    name: p.name,
    games: p.games,
    avgNote: p.avgNote,
    off: W_MAIN * rel(p.shot, mx.shot) + W_SIDE * rel(p.drib, mx.drib),
    def: W_MAIN * rel(p.duel, mx.duel) + W_SIDE * rel(p.pass, mx.pass),
  }));

  // Mindest-Einsätze, damit ein einziges starkes Spiel nicht reicht.
  const maxGames = Math.max(...field.map((p) => p.games));
  const minGames = Math.max(Math.min(2, maxGames), Math.ceil(maxGames * 0.3));
  const regular = field.filter((p) => p.games >= minGames);
  const rest = field.filter((p) => p.games < minGames);

  // Feste Reihenfolge, damit es nachvollziehbar bleibt: ERST die 2 besten
  // Offensiven nach vorne (wer Tore schießt, steht vorne), DANN aus den
  // übrigen die 2 besten Defensiven nach hinten. Gleichstand → Ø-Note.
  const attack: LineupPlayer[] = [];
  const defense: LineupPlayer[] = [];
  const take = (pool: LineupPlayer[], into: LineupPlayer[], key: 'off' | 'def') => {
    const sorted = [...pool].sort((a, b) => b[key] - a[key] || b.avgNote - a.avgNote);
    while (into.length < 2 && sorted.length > 0) into.push(sorted.shift()!);
    return sorted;
  };
  let leftRegular = take(regular, attack, 'off');
  leftRegular = take(leftRegular, defense, 'def');
  // Zu wenige Stammspieler? Dann mit den übrigen auffüllen.
  let leftRest = take(rest, attack, 'off');
  leftRest = take(leftRest, defense, 'def');

  const byNote = (a: LineupPlayer, b: LineupPlayer) => b.avgNote - a.avgNote || b.games - a.games || a.name.localeCompare(b.name);
  attack.sort((a, b) => b.off - a.off);
  defense.sort((a, b) => b.def - a.def);
  const bench = [...leftRegular.sort(byNote), ...leftRest.sort(byNote)].slice(0, 4);
  return { goalkeeper, attack, defense, bench };
}

function keeperNote(rows: MatchPlayerStat[], cfg: ScoringConfig, teamId: string, name: string): number {
  const mine = rows.filter((r) => r.teamId === teamId && r.playerName === name);
  if (mine.length === 0) return 0;
  const sum = mine.reduce((s, r) => s + matchNote(normalizeCounts(r.counts), cfg, r.role === 'keeper' ? 'keeper' : 'field'), 0);
  return sum / mine.length;
}
