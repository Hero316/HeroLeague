import type { ActionCounts, ActionKey, MatchPlayerStat, ScoringConfig } from '../types';
import { matchNote, normalizeCounts } from './rating';

// ===========================================================================
// Beste Aufstellung aus dem Tracking (Teamseite, Mini-Feld 2-2 + Torwart + Bank).
//  • Torwart: der im Kader ausgewählte Torwart (sonst wer am häufigsten im Tor stand)
//  • 2 vorne: bester Offensiv-Wert pro Spiel (Tore, Vorlagen, Schüsse, Schlüsselpässe, Dribblings)
//  • 2 hinten: bester Defensiv-Wert pro Spiel (Zweikämpfe, Ballgewinne, Blocks, Ballverluste)
//  • Bank: die nächsten 4 nach Ø-Note
// Gewichte = die Punkte aus den Score-Einstellungen (Statistics Center), damit
// alles zur übrigen Bewertung passt. Wer vorne UND hinten top ist, kommt dahin,
// wo er im Teamvergleich am stärksten ist.
// ===========================================================================

const OFF_KEYS: ActionKey[] = ['goal', 'penalty_goal', 'assist', 'shot_on', 'shot_miss', 'key_pass', 'dribble_won', 'dribble_lost'];
const DEF_KEYS: ActionKey[] = ['duel_won', 'duel_lost', 'interception', 'shot_blocked_def', 'turnover'];

export interface LineupPlayer {
  name: string;
  games: number; // getrackte Spiele als Feldspieler (bzw. im Tor beim Torwart)
  off: number; // Offensiv-Wert pro Spiel
  def: number; // Defensiv-Wert pro Spiel
  avgNote: number;
}

export interface TrackedLineup {
  goalkeeper: LineupPlayer | null;
  attack: LineupPlayer[]; // bis zu 2
  defense: LineupPlayer[]; // bis zu 2
  bench: LineupPlayer[]; // bis zu 4
}

const weighted = (c: ActionCounts, cfg: ScoringConfig, keys: ActionKey[]) =>
  keys.reduce((s, k) => s + (c[k] || 0) * (cfg.points[k] || 0), 0);

export function trackedLineup(
  rows: MatchPlayerStat[],
  cfg: ScoringConfig,
  teamId: string,
  kader: { name: string; goalkeeper?: boolean }[]
): TrackedLineup | null {
  const inKader = new Set(kader.map((p) => p.name));
  const acc = new Map<string, { games: number; keeperGames: number; off: number; def: number; note: number }>();
  for (const r of rows) {
    if (r.teamId !== teamId || !inKader.has(r.playerName)) continue;
    const c = normalizeCounts(r.counts);
    const a = acc.get(r.playerName) ?? { games: 0, keeperGames: 0, off: 0, def: 0, note: 0 };
    if (r.role === 'keeper') {
      a.keeperGames += 1;
    } else {
      a.games += 1;
      a.off += weighted(c, cfg, OFF_KEYS);
      a.def += weighted(c, cfg, DEF_KEYS);
      a.note += matchNote(c, cfg, 'field');
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

  const field: LineupPlayer[] = [...acc.entries()]
    .filter(([name, a]) => name !== keeperName && a.games > 0)
    .map(([name, a]) => ({ name, games: a.games, off: a.off / a.games, def: a.def / a.games, avgNote: a.note / a.games }));
  if (field.length === 0) return { goalkeeper, attack: [], defense: [], bench: [] };

  // Mindest-Einsätze, damit ein einziges starkes Spiel nicht reicht.
  const maxGames = Math.max(...field.map((p) => p.games));
  const minGames = Math.max(Math.min(2, maxGames), Math.ceil(maxGames * 0.3));
  const regular = field.filter((p) => p.games >= minGames);
  const rest = field.filter((p) => p.games < minGames);

  const attack: LineupPlayer[] = [];
  const defense: LineupPlayer[] = [];
  const pick = (pool: LineupPlayer[]) => {
    // Werte im Teamvergleich auf 0..1 bringen, damit Offensive und Defensive vergleichbar sind.
    const norm = (vals: number[]) => {
      const lo = Math.min(...vals);
      const hi = Math.max(...vals);
      return (v: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
    };
    const nOff = norm(field.map((p) => p.off));
    const nDef = norm(field.map((p) => p.def));
    const left = [...pool];
    while (left.length > 0 && (attack.length < 2 || defense.length < 2)) {
      let best: { i: number; slot: 'a' | 'd'; v: number; tie: number } | null = null;
      left.forEach((p, i) => {
        const opts: { slot: 'a' | 'd'; v: number }[] = [];
        if (attack.length < 2) opts.push({ slot: 'a', v: nOff(p.off) });
        if (defense.length < 2) opts.push({ slot: 'd', v: nDef(p.def) });
        for (const o of opts) {
          if (!best || o.v > best.v || (o.v === best.v && p.avgNote > best.tie)) best = { i, slot: o.slot, v: o.v, tie: p.avgNote };
        }
      });
      if (!best) break;
      const b = best as { i: number; slot: 'a' | 'd' };
      const [p] = left.splice(b.i, 1);
      (b.slot === 'a' ? attack : defense).push(p);
    }
    return left;
  };
  const leftRegular = pick(regular);
  const leftRest = attack.length + defense.length < 4 ? pick(rest) : rest;

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
