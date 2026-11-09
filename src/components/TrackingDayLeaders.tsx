import { useMemo } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import type { ActionCounts, Match, MatchPlayerStat, ScoringConfig, StatRole } from '../types';
import { assistRanking, matchdayRanking, scorerRanking } from '../lib/trackingAwards';
import type { TrackStatusMap } from '../lib/stats';

// ===========================================================================
// Statistik-Center → Spieltag: kleine Live-Übersicht über den Spielen.
// Top 5 je Spieler des Tages, Torhüter des Tages, Torjäger und Vorlagen –
// gezählt werden die Spiele, die auf „Fertig" stehen. Pfeile zeigen, wie sich
// der Platz durch das zuletzt fertig gemeldete Spiel verändert hat.
// ===========================================================================

interface Row {
  teamId: string;
  teamName: string;
  playerName: string;
  role: StatRole;
  counts: ActionCounts;
  out?: boolean;
}

interface Entry {
  key: string;
  name: string;
  team: string;
  value: string;
  move: number | 'neu' | 0; // Plätze gewonnen (+) / verloren (−) durch das letzte Spiel
}

const note = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const any = (c: ActionCounts) => Object.values(c).some((v) => v > 0);

export default function TrackingDayLeaders({
  rows,
  dayMatches,
  statusOf,
  cfg,
}: {
  rows: Record<string, Row>; // Schlüssel: `${matchId}::${teamId}::${name}`
  dayMatches: Match[];
  statusOf?: (matchId: string) => TrackStatusMap[string] | undefined;
  cfg: ScoringConfig;
}) {
  const data = useMemo(() => {
    const done = dayMatches
      .map((m) => ({ id: m.id, at: statusOf?.(m.id)?.status === 'done' ? statusOf(m.id)!.at : null }))
      .filter((d): d is { id: string; at: string } => !!d.at)
      .sort((a, b) => a.at.localeCompare(b.at));
    if (!done.length) return null;
    const teamNames = new Map<string, string>();
    const stats: MatchPlayerStat[] = [];
    for (const [k, r] of Object.entries(rows)) {
      const matchId = k.split('::')[0];
      // Gleiche Regel wie überall: „Spielt nicht" nie, Feldspieler nur mit Aktion, Torwart immer.
      if (r.out || (r.role !== 'keeper' && !any(r.counts))) continue;
      teamNames.set(r.teamId, r.teamName);
      stats.push({ dayKey: '', matchId, teamId: r.teamId, playerName: r.playerName, role: r.role, counts: r.counts });
    }
    const all = new Set(done.map((d) => d.id));
    const before = new Set(done.slice(0, -1).map((d) => d.id)); // ohne das zuletzt fertige Spiel
    const pick = (ids: Set<string>) => stats.filter((s) => ids.has(s.matchId));

    const build = <T,>(
      now: T[],
      prev: T[],
      keyOf: (x: T) => string,
      valueOf: (x: T) => string,
      teamOf: (x: T) => string,
      nameOf: (x: T) => string,
    ): Entry[] => {
      const prevRank = new Map(prev.map((x, i) => [keyOf(x), i]));
      return now.slice(0, 5).map((x, i) => {
        const p = prevRank.get(keyOf(x));
        const move: Entry['move'] = done.length < 2 ? 0 : p === undefined || p >= 5 ? 'neu' : p - i;
        return { key: keyOf(x), name: nameOf(x), team: teamNames.get(teamOf(x)) ?? teamOf(x), value: valueOf(x), move };
      });
    };
    type P = ReturnType<typeof matchdayRanking>[number];
    type S = ReturnType<typeof scorerRanking>[number];
    const kOf = (x: { teamId: string; playerName: string }) => `${x.teamId}::${x.playerName}`;
    const players = (ids: Set<string>) => matchdayRanking(pick(ids), cfg, ids).filter((p) => p.role === 'field');
    const keepers = (ids: Set<string>) =>
      matchdayRanking(pick(ids), cfg, ids)
        .filter((p) => p.role === 'keeper')
        .sort((a, b) => b.avgNote - a.avgNote || b.score - a.score);

    return {
      games: done.length,
      cols: [
        { title: 'Spieler des Tages', tone: 'text-brand-accent-light', list: build<P>(players(all), players(before), kOf, (p) => note(p.avgNote), (p) => p.teamId, (p) => p.playerName) },
        { title: 'Torhüter des Tages', tone: 'text-[#E9C46A]', list: build<P>(keepers(all), keepers(before), kOf, (p) => note(p.avgNote), (p) => p.teamId, (p) => p.playerName) },
        { title: 'Torjäger des Tages', tone: 'text-white', list: build<S>(scorerRanking(pick(all), cfg), scorerRanking(pick(before), cfg), kOf, (s) => `${s.goals}`, (s) => s.teamId, (s) => s.playerName) },
        { title: 'Vorlagen des Tages', tone: 'text-white', list: build<S>(assistRanking(pick(all), cfg), assistRanking(pick(before), cfg), kOf, (s) => `${s.assists}`, (s) => s.teamId, (s) => s.playerName) },
      ],
    };
  }, [rows, dayMatches, statusOf, cfg]);

  if (!data) return null;

  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold uppercase tracking-[2px] text-hl-dim mb-2">
        Stand nach {data.games} {data.games === 1 ? 'fertigen Spiel' : 'fertigen Spielen'}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
        {data.cols.map((c) => (
          <div key={c.title} className="hl-card p-3 min-w-0">
            <div className={`font-display font-black uppercase tracking-tight text-[13px] mb-2 ${c.tone}`}>{c.title}</div>
            {c.list.length === 0 ? (
              <div className="text-[12px] text-hl-faint">–</div>
            ) : (
              <ol className="space-y-1">
                {c.list.map((e, i) => (
                  <li key={e.key} className="flex items-center gap-2 min-w-0 text-[12.5px]">
                    <span className="shrink-0 w-4 text-right font-bold tabular-nums text-hl-faint">{i + 1}</span>
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold text-hl-text">{e.name}</span>
                      <span className="text-hl-faint"> · {e.team}</span>
                    </span>
                    <Move move={e.move} />
                    <span className="shrink-0 font-display font-black tabular-nums text-white">{e.value}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function Move({ move }: { move: Entry['move'] }) {
  if (move === 'neu') return <span className="shrink-0 text-[9px] font-black uppercase tracking-wider text-brand-accent-light">neu</span>;
  if (move > 0)
    return (
      <span className="shrink-0 inline-flex items-center text-[10px] font-bold text-emerald-300">
        <ArrowUp className="w-3 h-3" />
        {move}
      </span>
    );
  if (move < 0)
    return (
      <span className="shrink-0 inline-flex items-center text-[10px] font-bold text-rose-300">
        <ArrowDown className="w-3 h-3" />
        {-move}
      </span>
    );
  return null;
}
