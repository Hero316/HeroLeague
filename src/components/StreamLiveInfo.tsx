import { useMemo } from 'react';
import { ArrowDown, ArrowUp, Trophy, CalendarDays, ListOrdered } from 'lucide-react';
import type { Match, PlayerStat, Standing, Team } from '../types';
import { calculateStandings } from '../lib/standings';
import { TeamCrest, FormPill, useMatchClock } from './ui';

// ===========================================================================
// Live-Infos rund um die beiden Streams (Startseite + Stream-Seite):
//  • FieldPanel  – direkt unter jedem Stream: das Spiel auf diesem Feld.
//    Live → Spielstand + Uhr + direkter Vergleich der beiden Teams (Platz,
//    Punkte, Bilanz, Tore, Form, letztes Duell). Sonst das nächste (bzw.
//    letzte) Spiel auf dem Feld.
//  • LiveHub     – darunter: Live-Tabelle (laufende Spiele mit aktuellem Stand
//    eingerechnet, Pfeile = Plätze gewonnen/verloren), Programm des
//    Spieltags und die Torjäger.
// Alles wird aus den Liga-Spielen berechnet (keine eigenen Daten) und
// aktualisiert sich mit dem Polling der App automatisch.
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

// Spiel, das gerade auf einem Feld läuft / als Nächstes kommt / zuletzt lief.
export function matchOnField(ctx: LeagueLive, field: number): { match: Match; state: 'live' | 'next' | 'last' } | null {
  const onField = (m: Match) => (m.field || 1) === field;
  const live = ctx.matches
    .filter((m) => m.status === 'live' && onField(m))
    .sort((a, b) => (b.liveStartedAt ?? '').localeCompare(a.liveStartedAt ?? ''))[0];
  if (live) return { match: live, state: 'live' };
  const next = ctx.dayMatches.find((m) => m.status === 'geplant' && onField(m));
  if (next) return { match: next, state: 'next' };
  const last = [...ctx.dayMatches].reverse().find((m) => m.status === 'beendet' && onField(m));
  if (last) return { match: last, state: 'last' };
  return null;
}

function LiveDot() {
  return (
    <span className="relative flex h-2 w-2 shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70" style={{ background: RED }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: RED }} />
    </span>
  );
}

function Clock({ m }: { m: Match }) {
  const clock = useMatchClock(m.liveStartedAt, m.durationMinutes, m.pausedAt);
  if (!clock) return <span className="text-hl-red-soft">Live</span>;
  return (
    <span className="tabular-nums" style={{ color: clock.overtime ? '#FFC53D' : undefined }}>
      {clock.paused ? 'Pause' : clock.label}
    </span>
  );
}

const placeOf = (list: Standing[], teamId: string) => list.findIndex((s) => s.teamId === teamId) + 1;

// ---------------------------------------------------------------------------
// Unter jedem Stream: das Spiel auf diesem Feld + direkter Vergleich
// ---------------------------------------------------------------------------
export function FieldPanel({
  ctx,
  field,
  onOpenMatch,
  onSelectTeam,
}: {
  ctx: LeagueLive;
  field: number;
  onOpenMatch?: (id: string) => void;
  onSelectTeam?: (teamId: string) => void;
}) {
  const info = matchOnField(ctx, field);
  if (!info) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-xs font-sans text-hl-mute">
        Feld {field}: heute kein weiteres Spiel.
      </div>
    );
  }
  const { match: m, state } = info;
  const home = ctx.teams.find((t) => t.id === m.homeTeamId);
  const away = ctx.teams.find((t) => t.id === m.awayTeamId);
  const table = state === 'live' ? ctx.live : ctx.base;
  const sH = table.find((s) => s.teamId === m.homeTeamId);
  const sA = table.find((s) => s.teamId === m.awayTeamId);
  const formH = ctx.base.find((s) => s.teamId === m.homeTeamId)?.form ?? [];
  const formA = ctx.base.find((s) => s.teamId === m.awayTeamId)?.form ?? [];
  const pH = placeOf(table, m.homeTeamId);
  const pA = placeOf(table, m.awayTeamId);

  // Letztes direktes Duell (beendet, nicht dieses Spiel)
  const duel = [...ctx.matches]
    .reverse()
    .find(
      (x) =>
        x.id !== m.id &&
        x.status === 'beendet' &&
        ((x.homeTeamId === m.homeTeamId && x.awayTeamId === m.awayTeamId) || (x.homeTeamId === m.awayTeamId && x.awayTeamId === m.homeTeamId))
    );
  const duelText = duel
    ? duel.homeTeamId === m.homeTeamId
      ? `${duel.homeScore}:${duel.awayScore}`
      : `${duel.awayScore}:${duel.homeScore}`
    : null;

  const isLive = state === 'live';
  const label = isLive ? 'Live' : state === 'next' ? `Als Nächstes · ${m.time} Uhr` : 'Zuletzt';

  const rows: { label: string; l: React.ReactNode; r: React.ReactNode; hi?: 'l' | 'r' | null }[] = [
    { label: 'Platz', l: pH ? `${pH}.` : '–', r: pA ? `${pA}.` : '–', hi: pH && pA ? (pH < pA ? 'l' : pA < pH ? 'r' : null) : null },
    { label: 'Punkte', l: sH?.points ?? 0, r: sA?.points ?? 0, hi: (sH?.points ?? 0) > (sA?.points ?? 0) ? 'l' : (sA?.points ?? 0) > (sH?.points ?? 0) ? 'r' : null },
    { label: 'S – U – N', l: sH ? `${sH.won}-${sH.drawn}-${sH.lost}` : '–', r: sA ? `${sA.won}-${sA.drawn}-${sA.lost}` : '–' },
    { label: 'Tore', l: sH ? `${sH.goalsFor}:${sH.goalsAgainst}` : '–', r: sA ? `${sA.goalsFor}:${sA.goalsAgainst}` : '–' },
  ];

  const teamCol = (t: Team | undefined, place: number, align: 'l' | 'r') => (
    <button
      type="button"
      onClick={t && onSelectTeam ? () => onSelectTeam(t.id) : undefined}
      className={`min-w-0 flex flex-col items-center gap-1.5 ${t && onSelectTeam ? 'cursor-pointer' : 'cursor-default'}`}
    >
      {t ? <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" /> : <span className="w-11 h-11" />}
      <span className="w-full font-display font-black uppercase tracking-tight text-white text-sm sm:text-base leading-tight truncate text-center">{t?.name ?? '–'}</span>
      <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-mute">{place ? `Platz ${place}` : ''}</span>
      <span className="sr-only">{align}</span>
    </button>
  );

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        borderColor: isLive ? `${RED}55` : 'rgba(255,255,255,.1)',
        background: isLive ? `linear-gradient(180deg, ${RED}14, rgba(11,7,16,.9) 45%)` : 'linear-gradient(180deg, rgba(145,71,255,.10), rgba(11,7,16,.9) 45%)',
      }}
    >
      {/* Kopf */}
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <span className="inline-flex items-center gap-2 text-[10px] font-sans font-black uppercase tracking-[2px]" style={{ color: isLive ? '#FF8A7D' : '#C4A5FF' }}>
          {isLive && <LiveDot />}
          Feld {field} · {label}
        </span>
        {ctx.matchday !== null && <span className="text-[10px] font-sans font-bold uppercase tracking-wider text-hl-dim">{m.matchday}. Spieltag</span>}
      </div>

      {/* Anzeigetafel */}
      <button
        type="button"
        onClick={onOpenMatch ? () => onOpenMatch(m.id) : undefined}
        className={`w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-4 px-3 sm:px-4 pt-3 pb-2 ${onOpenMatch ? 'cursor-pointer' : 'cursor-default'}`}
        aria-label="Spiel öffnen"
      >
        {teamCol(home, pH, 'l')}
        <div className="flex flex-col items-center min-w-[84px]">
          {state === 'next' ? (
            <span className="font-display font-black text-3xl sm:text-4xl text-white/90 tabular-nums">{m.time}</span>
          ) : (
            <span className="font-display font-black text-4xl sm:text-5xl text-white tabular-nums leading-none">
              {m.homeScore ?? 0}
              <span className="text-white/35 mx-1">:</span>
              {m.awayScore ?? 0}
            </span>
          )}
          <span className="mt-1 text-xs font-sans font-black uppercase tracking-wider text-hl-mute">
            {isLive ? <Clock m={m} /> : state === 'next' ? 'Anpfiff' : 'Endstand'}
          </span>
        </div>
        {teamCol(away, pA, 'r')}
      </button>

      {/* Direkter Vergleich */}
      <div className="px-3 sm:px-4 pb-3">
        <div className="rounded-xl bg-black/30 border border-white/5 divide-y divide-white/5">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-1.5">
              <span className={`text-right font-display font-black tabular-nums text-sm sm:text-base ${r.hi === 'l' ? 'text-hl-green-soft' : 'text-white'}`}>{r.l}</span>
              <span className="text-center text-[9px] sm:text-[10px] font-sans font-bold uppercase tracking-[1.5px] text-hl-dim min-w-[64px]">{r.label}</span>
              <span className={`text-left font-display font-black tabular-nums text-sm sm:text-base ${r.hi === 'r' ? 'text-hl-green-soft' : 'text-white'}`}>{r.r}</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-3 py-2">
            <span className="flex justify-end gap-1 min-w-0 flex-wrap">
              {formH.length ? formH.map((f, i) => <FormPill key={i} result={f} size="sm" />) : <span className="text-xs text-hl-dim">–</span>}
            </span>
            <span className="text-center text-[9px] sm:text-[10px] font-sans font-bold uppercase tracking-[1.5px] text-hl-dim min-w-[64px]">Form</span>
            <span className="flex justify-start gap-1 min-w-0 flex-wrap">
              {formA.length ? formA.map((f, i) => <FormPill key={i} result={f} size="sm" />) : <span className="text-xs text-hl-dim">–</span>}
            </span>
          </div>
          {duelText && (
            <div className="px-3 py-1.5 text-center text-[10px] sm:text-[11px] font-sans font-bold uppercase tracking-[1.5px] text-hl-mute">
              Letztes Duell · <span className="text-white font-display font-black text-sm tracking-normal">{duelText}</span>
              <span className="text-hl-dim"> ({duel!.matchday}. Spieltag)</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unter den Streams: Live-Tabelle · Spieltag · Torjäger
// ---------------------------------------------------------------------------
function Card({ icon, title, right, children }: { icon: React.ReactNode; title: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#0b0710]/80 overflow-hidden min-w-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-white/8" style={{ background: `linear-gradient(90deg, ${PURPLE}1f, transparent)` }}>
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

export function LiveHub({
  ctx,
  players,
  onOpenMatch,
  onSelectTeam,
  onOpenTable,
}: {
  ctx: LeagueLive;
  players: PlayerStat[];
  onOpenMatch?: (id: string) => void;
  onSelectTeam?: (teamId: string) => void;
  onOpenTable?: () => void;
}) {
  const anyLive = ctx.liveIds.size > 0;
  const liveScore = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of ctx.matches) {
      if (m.status !== 'live') continue;
      map.set(m.homeTeamId, `${m.homeScore ?? 0}:${m.awayScore ?? 0}`);
      map.set(m.awayTeamId, `${m.awayScore ?? 0}:${m.homeScore ?? 0}`);
    }
    return map;
  }, [ctx.matches]);
  const scorers = useMemo(
    () => [...players].filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals || b.assists - a.assists || a.name.localeCompare(b.name)).slice(0, 5),
    [players]
  );
  if (ctx.live.length === 0) return null;
  const teamOf = (id: string) => ctx.teams.find((t) => t.id === id);

  return (
    <div className="mt-5 grid grid-cols-1 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-4 items-start">
      {/* Live-Tabelle */}
      <Card
        icon={anyLive ? <LiveDot /> : <ListOrdered className="w-4 h-4" style={{ color: PURPLE }} />}
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
          <div className="grid grid-cols-[22px_14px_minmax(0,1fr)_28px_34px_34px] sm:grid-cols-[26px_16px_minmax(0,1fr)_auto_32px_40px_40px] items-center gap-x-2 px-2 pb-1.5 text-[9px] font-sans font-bold uppercase tracking-wider text-hl-dim">
            <span>#</span>
            <span />
            <span>Team</span>
            <span className="hidden sm:block text-center">Form</span>
            <span className="text-center">Sp</span>
            <span className="text-center">TD</span>
            <span className="text-right">Pkt</span>
          </div>
          {ctx.live.map((s, i) => {
            const before = placeOf(ctx.base, s.teamId);
            const diff = anyLive ? before - (i + 1) : 0;
            const ls = liveScore.get(s.teamId);
            const t = teamOf(s.teamId);
            return (
              <button
                key={s.teamId}
                type="button"
                onClick={onSelectTeam ? () => onSelectTeam(s.teamId) : undefined}
                className={`w-full grid grid-cols-[22px_14px_minmax(0,1fr)_28px_34px_34px] sm:grid-cols-[26px_16px_minmax(0,1fr)_auto_32px_40px_40px] items-center gap-x-2 px-2 py-1.5 rounded-lg text-left transition-colors ${ls ? 'bg-[rgba(255,84,66,.08)]' : 'hover:bg-white/[0.04]'} ${onSelectTeam ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <span className="font-display font-black text-sm tabular-nums text-white/80">{i + 1}</span>
                <span className="grid place-items-center">
                  {diff > 0 ? <ArrowUp className="w-3 h-3 text-hl-green-soft" /> : diff < 0 ? <ArrowDown className="w-3 h-3 text-hl-red-soft" /> : null}
                </span>
                <span className="flex items-center gap-2 min-w-0">
                  {t && <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="xs" />}
                  <span className="truncate font-sans font-bold text-[13px] text-white">{s.teamName}</span>
                  {ls && (
                    <span className="shrink-0 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-display font-black tabular-nums" style={{ background: `${RED}26`, color: '#FF8A7D' }}>
                      {ls}
                    </span>
                  )}
                </span>
                <span className="hidden sm:flex gap-0.5 justify-center">
                  {(ctx.base.find((b) => b.teamId === s.teamId)?.form ?? []).map((f, k) => (
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

      <div className="grid grid-cols-1 gap-4 min-w-0">
        {/* Programm des Spieltags */}
        {ctx.dayMatches.length > 0 && (
          <Card icon={<CalendarDays className="w-4 h-4" style={{ color: PURPLE }} />} title={`${ctx.matchday}. Spieltag`}>
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
                    className={`w-full grid grid-cols-[42px_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 px-2 py-1.5 rounded-lg text-left ${live ? 'bg-[rgba(255,84,66,.08)]' : 'hover:bg-white/[0.04]'} ${onOpenMatch ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <span className="flex flex-col leading-tight">
                      <span className="text-[11px] font-sans font-bold tabular-nums text-white/80">{m.time}</span>
                      <span className="text-[9px] font-sans font-bold uppercase tracking-wider text-hl-dim">Feld {m.field || 1}</span>
                    </span>
                    <span className="flex items-center justify-end gap-1.5 min-w-0">
                      <span className="truncate text-[13px] font-sans font-bold text-white text-right">{h?.shortName || h?.name || '–'}</span>
                      {h && <TeamCrest name={h.name} shortName={h.shortName} color={h.logoColor} logoUrl={h.logoUrl} size="xs" />}
                    </span>
                    <span
                      className="min-w-[46px] text-center rounded-md px-1.5 py-0.5 font-display font-black text-sm tabular-nums"
                      style={live ? { background: `${RED}26`, color: '#FF8A7D' } : done ? { color: '#fff' } : { color: 'rgba(255,255,255,.35)' }}
                    >
                      {live || done ? `${m.homeScore ?? 0}:${m.awayScore ?? 0}` : '– : –'}
                    </span>
                    <span className="flex items-center gap-1.5 min-w-0">
                      {a && <TeamCrest name={a.name} shortName={a.shortName} color={a.logoColor} logoUrl={a.logoUrl} size="xs" />}
                      <span className="truncate text-[13px] font-sans font-bold text-white">{a?.shortName || a?.name || '–'}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Card>
        )}

        {/* Torjäger */}
        {scorers.length > 0 && (
          <Card icon={<Trophy className="w-4 h-4 text-hl-gold" />} title="Torjäger">
            <div className="px-2 sm:px-3 py-2 flex flex-col gap-1">
              {scorers.map((p, i) => (
                <button
                  key={p.id || `${p.teamId}|${p.name}`}
                  type="button"
                  onClick={onSelectTeam ? () => onSelectTeam(p.teamId) : undefined}
                  className={`w-full grid grid-cols-[22px_minmax(0,1fr)_auto] items-center gap-2 px-2 py-1.5 rounded-lg text-left hover:bg-white/[0.04] ${onSelectTeam ? 'cursor-pointer' : 'cursor-default'}`}
                >
                  <span className="font-display font-black text-sm tabular-nums" style={{ color: i === 0 ? '#E9C46A' : 'rgba(255,255,255,.7)' }}>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-sans font-bold text-white">{p.name}</span>
                    <span className="block truncate text-[10px] font-sans font-semibold text-hl-dim">{p.teamName}</span>
                  </span>
                  <span className="font-display font-black text-base text-white tabular-nums">
                    {p.goals}
                    <span className="ml-1 text-[10px] font-sans font-bold text-hl-dim uppercase">Tore</span>
                  </span>
                </button>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
