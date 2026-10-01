import { useMemo } from 'react';
import { CalendarDays, ListOrdered } from 'lucide-react';
import type { Match, Standing, Team } from '../types';
import { calculateStandings } from '../lib/standings';
import { TeamCrest, FormPill } from './ui';

// ===========================================================================
// Live-Infos unter den beiden Streams (Startseite + Stream-Seite):
//  • LiveTable   – unter Feld 1: komplette Live-Tabelle. Laufende Spiele sind
//    mit dem aktuellen Spielstand schon eingerechnet (Führung = +3 Punkte,
//    Unentschieden = +1), ohne Hervorhebung einzelner Teams.
//  • DaySchedule – unter Feld 2: alle Spiele des Abends mit Ergebnis. Genauso
//    hoch wie die Tabelle; sind es mehr Spiele, scrollt die Liste innen.
// Alles wird aus den Liga-Spielen berechnet und aktualisiert sich mit dem
// Polling der App automatisch.
// ===========================================================================

const PURPLE = '#9147FF';
const RED = '#FF5442';

export interface LeagueLive {
  teams: Team[];
  matches: Match[]; // chronologisch sortiert
  base: Standing[]; // offizielle Tabelle (nur beendete Spiele)
  live: Standing[]; // Live-Tabelle (laufende Spiele mit aktuellem Stand)
  liveIds: Set<string>;
  matchday: number | null; // gezeigter Spieltag (live > nächster > letzter)
  dayMatches: Match[];
}

const byTime = (a: Match, b: Match) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`);

export function useLeagueLive(teams: Team[], matches: Match[]): LeagueLive {
  return useMemo(() => {
    const sorted = [...matches].sort(byTime);
    const base = calculateStandings(teams, sorted);
    const liveMatches = sorted.filter((m) => m.status === 'live');
    const live = liveMatches.length
      ? calculateStandings(
          teams,
          sorted.map((m) => (m.status === 'live' ? { ...m, status: 'beendet' as const, homeScore: m.homeScore ?? 0, awayScore: m.awayScore ?? 0 } : m))
        )
      : base;
    const next = sorted.find((m) => m.status === 'geplant');
    const lastDone = [...sorted].reverse().find((m) => m.status === 'beendet');
    const featured = liveMatches[0] ?? next ?? lastDone ?? null;
    const matchday = featured ? featured.matchday : null;
    const dayMatches = featured ? sorted.filter((m) => m.matchday === featured.matchday && m.date === featured.date) : [];
    return { teams, matches: sorted, base, live, liveIds: new Set(liveMatches.map((m) => m.id)), matchday, dayMatches };
  }, [teams, matches]);
}

function Card({ icon, title, right, fill, children }: { icon: React.ReactNode; title: React.ReactNode; right?: React.ReactNode; fill?: boolean; children: React.ReactNode }) {
  return (
    <div className={`rounded-2xl border border-white/10 bg-[#0b0710]/80 overflow-hidden min-w-0 flex flex-col ${fill ? 'flex-1' : ''}`}>
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-b border-white/8" style={{ background: `linear-gradient(90deg, ${PURPLE}1f, transparent)` }}>
        <span className="inline-flex items-center gap-2 font-display font-black uppercase tracking-tight text-white text-base sm:text-lg min-w-0">
          {icon}
          <span className="truncate">{title}</span>
        </span>
        {right}
      </div>
      {children}
    </div>
  );
}

const COLS = 'grid-cols-[22px_minmax(0,1fr)_28px_34px_34px] sm:grid-cols-[26px_minmax(0,1fr)_auto_32px_40px_40px]';

// Komplette Live-Tabelle (unter Feld 1)
export function LiveTable({
  ctx,
  onSelectTeam,
  onOpenTable,
}: {
  ctx: LeagueLive;
  onSelectTeam?: (teamId: string) => void;
  onOpenTable?: () => void;
}) {
  if (ctx.live.length === 0) return null;
  const anyLive = ctx.liveIds.size > 0;
  const teamOf = (id: string) => ctx.teams.find((t) => t.id === id);
  return (
    <Card
      icon={<ListOrdered className="w-4 h-4" style={{ color: PURPLE }} />}
      title={anyLive ? 'Live-Tabelle' : 'Tabelle'}
      right={
        onOpenTable && (
          <button onClick={onOpenTable} className="shrink-0 text-[10px] font-sans font-black uppercase tracking-wider text-[#C4A5FF] hover:text-white cursor-pointer">
            Ganze Tabelle ›
          </button>
        )
      }
    >
      <div className="px-2 sm:px-3 py-2">
        <div className={`grid ${COLS} items-center gap-x-2 px-2 pb-1.5 text-[9px] font-sans font-bold uppercase tracking-wider text-hl-dim`}>
          <span>#</span>
          <span>Team</span>
          <span className="hidden sm:block text-center">Form</span>
          <span className="text-center">Sp</span>
          <span className="text-center">TD</span>
          <span className="text-right">Pkt</span>
        </div>
        {ctx.live.map((s, i) => {
          const t = teamOf(s.teamId);
          return (
            <button
              key={s.teamId}
              type="button"
              onClick={onSelectTeam ? () => onSelectTeam(s.teamId) : undefined}
              className={`w-full grid ${COLS} items-center gap-x-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-white/[0.04] ${onSelectTeam ? 'cursor-pointer' : 'cursor-default'}`}
            >
              <span className="font-display font-black text-sm tabular-nums text-white/80">{i + 1}</span>
              <span className="flex items-center gap-2 min-w-0">
                {t && <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="xs" />}
                <span className="truncate font-sans font-bold text-[13px] text-white">{s.teamName}</span>
              </span>
              <span className="hidden sm:flex gap-0.5 justify-center">
                {s.form.map((f, k) => (
                  <FormPill key={k} result={f} size="sm" />
                ))}
              </span>
              <span className="text-center text-xs font-sans font-semibold text-hl-mute tabular-nums">{s.played}</span>
              <span className="text-center text-xs font-sans font-semibold text-hl-mute tabular-nums">
                {s.goalDifference > 0 ? `+${s.goalDifference}` : s.goalDifference}
              </span>
              <span className="text-right font-display font-black text-sm text-white tabular-nums">{s.points}</span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// Alle Spiele des Abends (unter Feld 2). `fill` = neben der Tabelle: gleiche
// Höhe wie die Tabelle, Liste scrollt innen. Sonst (untereinander) feste Höhe.
export function DaySchedule({ ctx, fill, onOpenMatch }: { ctx: LeagueLive; fill?: boolean; onOpenMatch?: (id: string) => void }) {
  if (ctx.dayMatches.length === 0) return null;
  const teamOf = (id: string) => ctx.teams.find((t) => t.id === id);
  const list = (
    <div className="px-2 sm:px-3 py-2 flex flex-col gap-1">
      {ctx.dayMatches.map((m) => {
        const h = teamOf(m.homeTeamId);
        const a = teamOf(m.awayTeamId);
        const live = m.status === 'live';
        const done = m.status === 'beendet';
        return (
          <button
            key={m.id}
            type="button"
            onClick={onOpenMatch ? () => onOpenMatch(m.id) : undefined}
            className={`w-full grid grid-cols-[42px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.04] ${onOpenMatch ? 'cursor-pointer' : 'cursor-default'}`}
          >
            <span className="flex flex-col leading-tight">
              <span className="text-[11px] font-sans font-bold tabular-nums text-white/80">{m.time}</span>
              <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-hl-dim">Feld {m.field || 1}</span>
            </span>
            <span className="flex items-center justify-end gap-1.5 min-w-0">
              <span className="truncate text-[13px] font-sans font-bold text-white text-right">
                <span className="sm:hidden">{h?.shortName || h?.name || '–'}</span>
                <span className="hidden sm:inline">{h?.name || '–'}</span>
              </span>
              {h && <TeamCrest name={h.name} shortName={h.shortName} color={h.logoColor} logoUrl={h.logoUrl} size="xs" />}
            </span>
            <span
              className="min-w-[46px] text-center rounded-md px-1.5 py-0.5 font-display font-black text-sm tabular-nums"
              style={live ? { background: 'rgba(255,84,66,.15)', color: '#FF8A7D' } : done ? { color: '#fff' } : { color: 'rgba(255,255,255,.35)' }}
            >
              {live || done ? `${m.homeScore ?? 0}:${m.awayScore ?? 0}` : '– : –'}
            </span>
            <span className="flex items-center gap-1.5 min-w-0">
              {a && <TeamCrest name={a.name} shortName={a.shortName} color={a.logoColor} logoUrl={a.logoUrl} size="xs" />}
              <span className="truncate text-[13px] font-sans font-bold text-white">
                <span className="sm:hidden">{a?.shortName || a?.name || '–'}</span>
                <span className="hidden sm:inline">{a?.name || '–'}</span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
  return (
    <Card icon={<CalendarDays className="w-4 h-4" style={{ color: PURPLE }} />} title={`${ctx.matchday}. Spieltag`} fill={fill}>
      {fill ? (
        // Höhe kommt von der Tabelle nebenan – die Liste füllt sie und scrollt innen.
        <div className="relative flex-1 min-h-[220px]">
          <div className="absolute inset-0 overflow-y-auto overscroll-contain">{list}</div>
          {/* leichter Verlauf unten: zeigt, dass weitere Spiele folgen */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#0b0710] to-transparent" />
        </div>
      ) : (
        <div className="max-h-[420px] overflow-y-auto overscroll-contain">{list}</div>
      )}
    </Card>
  );
}
