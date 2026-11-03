import { useMemo, useState } from 'react';
import type { Match, Team } from '../types';
import { FieldTag, TeamCrest, shortDate } from './ui';
import { GAME_MINUTES, BREAK_MINUTES } from '../lib/matchTiming';

// ===========================================================================
// Startseite „Die Spiele": EIN Spieltag (der laufende bzw. zuletzt gespielte)
// als Karten zum Wischen – nie endlos. Gibt es zwei Blöcke (Pause zwischen den
// Anstößen), lässt sich nach Block 1 / Block 2 filtern. Ergebnis-Karten im
// selben Look wie im Spielplan.
// ===========================================================================

const mins = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(t || '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

interface Props {
  teams: Team[];
  matches: Match[];
  onOpenMatch?: (matchId: string) => void;
  reportMatchIds?: Set<string>;
  onOpenSchedule: (matchday: number) => void;
}

export default function HomeMatchRow({ teams, matches, onOpenMatch, reportMatchIds, onOpenSchedule }: Props) {
  // Laufender Spieltag, sonst der zuletzt gespielte.
  const day = useMemo(() => {
    const live = matches.find((m) => m.status === 'live');
    if (live) return live.matchday;
    const done = matches
      .filter((m) => m.status === 'beendet' && m.homeScore !== null)
      .sort((a, b) => `${b.date} ${b.time}`.localeCompare(`${a.date} ${a.time}`));
    return done[0]?.matchday ?? null;
  }, [matches]);

  const dayMatches = useMemo(
    () =>
      day === null
        ? []
        : matches
            .filter((m) => m.matchday === day)
            .sort((a, b) => mins(a.time) - mins(b.time) || (a.field ?? 0) - (b.field ?? 0)),
    [matches, day]
  );

  // Blöcke: neuer Block, sobald zwischen zwei Anstößen mehr als ein Takt liegt.
  const blockOf = useMemo(() => {
    const times = [...new Set(dayMatches.map((m) => mins(m.time)))].sort((a, b) => a - b);
    const map = new Map<number, number>();
    let b = 1;
    times.forEach((t, i) => {
      if (i > 0 && t - times[i - 1] > GAME_MINUTES + BREAK_MINUTES + 4) b += 1;
      map.set(t, b);
    });
    return map;
  }, [dayMatches]);
  const blocks = useMemo(() => [...new Set(blockOf.values())].sort((a, b) => a - b), [blockOf]);
  const [filter, setFilter] = useState<number | 'all'>('all');
  const active = filter !== 'all' && blocks.includes(filter) ? filter : 'all';
  const shown = dayMatches.filter((m) => active === 'all' || blockOf.get(mins(m.time)) === active);

  if (day === null || dayMatches.length === 0) return null;
  const isLiveDay = dayMatches.some((m) => m.status === 'live');
  const getTeam = (id: string) => teams.find((t) => t.id === id);

  return (
    <section className="relative max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pt-10 sm:pt-14 pb-4">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5 font-sans font-extrabold text-[11px] tracking-[3px] uppercase text-brand-accent-light">
            <span className="w-[22px] h-[2px] bg-brand-accent-light" />
            {day}. Spieltag · {isLiveDay ? 'Live' : 'Ergebnisse'}
          </div>
          <h2 className="mt-2 font-display font-black uppercase text-white text-[38px] sm:text-5xl lg:text-[60px] leading-[.9] [text-shadow:0_0_34px_rgba(34,223,201,.3)]">
            Die Spiele
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {blocks.length > 1 && (
            <div className="inline-flex gap-1 p-1 rounded-[14px] bg-white/[.04] border border-white/[.08]" role="group" aria-label="Block filtern">
              {(['all', ...blocks] as const).map((b) => (
                <button
                  key={String(b)}
                  type="button"
                  aria-pressed={active === b}
                  onClick={() => setFilter(b)}
                  className={`px-3.5 sm:px-4 py-2 rounded-[10px] font-sans font-extrabold text-[11px] sm:text-xs tracking-[1.5px] uppercase cursor-pointer transition-colors ${
                    active === b ? 'bg-brand-accent-light text-[#062018]' : 'text-hl-mute hover:text-white'
                  }`}
                >
                  {b === 'all' ? 'Alle' : `Block ${b}`}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => onOpenSchedule(day)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full border border-brand-accent-light/35 text-brand-accent-light font-sans font-extrabold text-[11px] tracking-[1.5px] uppercase whitespace-nowrap hover:bg-brand-accent-light/10 cursor-pointer"
          >
            Ganzer Spielplan →
          </button>
        </div>
      </div>

      <div className="grid grid-flow-col auto-cols-[min(84vw,360px)] gap-3 overflow-x-auto snap-x snap-mandatory pb-3 -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:thin]">
        {shown.map((m) => {
          const home = getTeam(m.homeTeamId);
          const away = getTeam(m.awayTeamId);
          if (!home || !away) return null;
          const live = m.status === 'live';
          const done = m.status === 'beendet' && m.homeScore !== null;
          const hasScorers = (m.scorers ?? []).some((s) => s.playerName && s.playerName !== 'Unbekannt');
          const canOpen = !!onOpenMatch && (!!reportMatchIds?.has(m.id) || ((live || done) && hasScorers));
          return (
            <div
              key={m.id}
              onClick={canOpen ? () => onOpenMatch!(m.id) : undefined}
              role={canOpen ? 'button' : undefined}
              tabIndex={canOpen ? 0 : undefined}
              onKeyDown={canOpen ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenMatch!(m.id); } } : undefined}
              className={`snap-start min-w-0 rounded-2xl px-4 sm:px-5 py-4 flex flex-col transition-colors ${canOpen ? 'cursor-pointer hover:border-[rgba(34,223,201,.35)]' : ''} ${
                live
                  ? 'bg-[linear-gradient(135deg,rgba(34,223,201,.08),rgba(255,255,255,.02))] border border-[rgba(34,223,201,.3)]'
                  : 'bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))] border border-white/[.09]'
              }`}
            >
              <div className="flex justify-between items-center gap-2 mb-3">
                <span className="flex items-center gap-2 min-w-0 font-sans font-semibold text-[11px] tracking-[.8px] text-hl-dim">
                  <span className="truncate">{shortDate(m.date)} · {m.time} Uhr</span>
                  <FieldTag field={m.field} />
                </span>
                <span
                  className={`shrink-0 px-2 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] ${
                    live ? 'bg-[rgba(34,223,201,.14)] text-brand-accent-light' : done ? 'bg-white/[.06] text-hl-mute' : 'bg-[rgba(34,223,201,.12)] text-brand-accent-light'
                  }`}
                >
                  {live ? 'LIVE' : done ? 'BEENDET' : 'ANSTOSS'}
                </span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="md" />
                  <span className="font-sans font-semibold text-[13.5px] text-hl-text leading-tight break-words min-w-0">{home.name}</span>
                </div>
                <div className={`min-w-[46px] text-center font-display font-black leading-none ${done || live ? 'text-2xl' : 'text-sm tracking-[2px]'} ${live ? 'text-brand-accent-light' : done ? 'text-white' : 'text-hl-faint'}`}>
                  {done || live ? `${m.homeScore ?? 0} : ${m.awayScore ?? 0}` : 'VS'}
                </div>
                <div className="flex items-center gap-2 justify-end min-w-0">
                  <span className="font-sans font-semibold text-[13.5px] text-hl-text leading-tight break-words min-w-0 text-right">{away.name}</span>
                  <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="md" />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
