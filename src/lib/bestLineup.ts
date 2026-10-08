import type { MatchPlayerStat, ScoringConfig } from '../types';
import { matchNote, normalizeCounts, playerCard, sumCounts } from './rating';

// ===========================================================================
// Beste Aufstellung aus dem Tracking (Teamseite, Mini-Feld 2-2 + Torwart + Bank).
// Grundlage sind die FIFA-Kartenwerte, die auch auf den Spielerkarten stehen –
// so passt die Aufstellung zu dem, was man sieht:
//  • Offensiv-Wert = 40 % SCH + 40 % DRI + 20 % PAS
//  • Defensiv-Wert = DEF
//  • Torwart: der im Kader ausgewählte Torwart (sonst wer am häufigsten im Tor stand)
//  • Plätze werden nacheinander an den jeweils höchsten Wert vergeben – jeder
//    kommt dahin (vorne/hinten), wo er am stärksten ist.
//  • Bank: die nächsten 4 nach Ø-Note
// ===========================================================================

export interface LineupPlayer {
  name: string;
  games: number; // getrackte Spiele als Feldspieler (bzw. im Tor beim Torwart)
  off: number; // Offensiv-Wert (aus der Karte: SCH/DRI/PAS)
  def: number; // Defensiv-Wert (Karte: DEF)
  avgNote: number;
}

export interface TrackedLineup {
  goalkeeper: LineupPlayer | null;
  attack: LineupPlayer[]; // bis zu 2
  defense: LineupPlayer[]; // bis zu 2
  bench: LineupPlayer[]; // bis zu 4
}

const attr = (card: ReturnType<typeof playerCard>, key: string) => card.attrs.find((a) => a.key === key)?.value ?? 0;

export function trackedLineup(
  rows: MatchPlayerStat[],
  cfg: ScoringConfig,
  teamId: string,
  kader: { name: string; goalkeeper?: boolean }[]
): TrackedLineup | null {
  const inKader = new Set(kader.map((p) => p.name));
  const acc = new Map<string, { field: MatchPlayerStat[]; keeperGames: number; note: number }>();
  for (const r of rows) {
    if (r.teamId !== teamId || !inKader.has(r.playerName)) continue;
    const a = acc.get(r.playerName) ?? { field: [], keeperGames: 0, note: 0 };
    if (r.role === 'keeper') a.keeperGames += 1;
    else {
      a.field.push(r);
      a.note += matchNote(normalizeCounts(r.counts), cfg, 'field');
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

  // Feldspieler mit ihren Kartenwerten (gleiche Karte wie auf der Spielerseite).
  const field: LineupPlayer[] = [...acc.entries()]
    .filter(([name, a]) => name !== keeperName && a.field.length > 0)
    .map(([name, a]) => {
      const games = a.field.length;
      const card = playerCard(sumCounts(a.field.map((r) => normalizeCounts(r.counts))), games, 'field', cfg);
      return {
        name,
        games,
        off: 0.4 * attr(card, 'SCH') + 0.4 * attr(card, 'DRI') + 0.2 * attr(card, 'PAS'),
        def: attr(card, 'DEF'),
        avgNote: a.note / games,
      };
    });
  if (field.length === 0) return { goalkeeper, attack: [], defense: [], bench: [] };

  // Mindest-Einsätze, damit ein einziges starkes Spiel nicht reicht.
  const maxGames = Math.max(...field.map((p) => p.games));
  const minGames = Math.max(Math.min(2, maxGames), Math.ceil(maxGames * 0.3));
  const regular = field.filter((p) => p.games >= minGames);
  const rest = field.filter((p) => p.games < minGames);

  const attack: LineupPlayer[] = [];
  const defense: LineupPlayer[] = [];
  // Platz für Platz: der insgesamt höchste noch offene Wert gewinnt.
  const pick = (pool: LineupPlayer[]) => {
    const left = [...pool];
    while (left.length > 0 && (attack.length < 2 || defense.length < 2)) {
      let best: { i: number; slot: 'a' | 'd'; v: number; tie: number } | null = null;
      left.forEach((p, i) => {
        const opts: { slot: 'a' | 'd'; v: number }[] = [];
        if (attack.length < 2) opts.push({ slot: 'a', v: p.off });
        if (defense.length < 2) opts.push({ slot: 'd', v: p.def });
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
