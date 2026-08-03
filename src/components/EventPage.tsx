import React, { useMemo } from 'react';
import { CalendarDays, MapPin, ArrowLeft, Trophy, Clock, BarChart3, Swords, Shield, Lock, Goal, Crown, Star, Hand, Handshake, Printer } from 'lucide-react';
import { EventConfig, Team } from '../types';
import { TeamCrest, LiveBadge } from './ui';
import { calculateEventStandings, calculateEventAwards } from '../lib/eventStandings';

interface EventPageProps {
  event: EventConfig;
  teams: Team[]; // echte Vereine – für Wappen/Farben, per Namensabgleich
  onBack: () => void;
  onSelectTeam?: (teamId: string) => void; // Klick aufs Wappen -> Vereinsseite
  isAdmin?: boolean;
  onPrint?: () => void; // Ergebniszettel öffnen (nur Admin)
}

// Namen tolerant vergleichen (Groß/Klein, Leerzeichen, Punkte egal).
const normName = (s: string) =>
  s
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Sonder-Event-Seite (z.B. Testspieltag): Kopf + Live-Tabelle + kompletter
// Spielplan mit Uhrzeiten und Feldern – im Look der Hauptseite, aber mit
// eigener Magenta/Gold-Farbwelt, damit es sich besonders anfühlt.
export default function EventPage({ event, teams, onBack, onSelectTeam, isAdmin, onPrint }: EventPageProps) {
  const standings = useMemo(
    () => calculateEventStandings(event.teams, event.matches),
    [event.teams, event.matches]
  );

  // Teamname -> echtes Vereins-Wappen (falls der Name mit einem Verein übereinstimmt).
  const crestFor = (name: string) => teams.find((t) => normName(t.name) === normName(name));
  // Klick-Handler fürs Wappen (nur wenn der Verein bekannt ist).
  const crestClick = (name: string) => {
    const t = crestFor(name);
    return t && onSelectTeam ? () => onSelectTeam(t.id) : undefined;
  };

  // Abend-Statistiken (team-basiert, nur aus den Event-Ergebnissen – völlig
  // getrennt von der echten Liga).
  const stats = useMemo(() => {
    const playedMatches = event.matches.filter((m) => m.homeScore !== null && m.awayScore !== null);
    if (playedMatches.length === 0) return null;

    const cleanSheets: Record<string, number> = {};
    let totalGoals = 0;
    let topMatch: { label: string; goals: number } | null = null;
    playedMatches.forEach((m) => {
      const hs = m.homeScore as number;
      const as = m.awayScore as number;
      totalGoals += hs + as;
      if (as === 0) cleanSheets[m.home] = (cleanSheets[m.home] ?? 0) + 1;
      if (hs === 0) cleanSheets[m.away] = (cleanSheets[m.away] ?? 0) + 1;
      const g = hs + as;
      if (!topMatch || g > topMatch.goals) topMatch = { label: `${m.home} ${hs}:${as} ${m.away}`, goals: g };
    });

    const playedStandings = standings.filter((s) => s.played > 0);
    const bestOffense = [...playedStandings].sort((a, b) => b.goalsFor - a.goalsFor)[0];
    const bestDefense = [...playedStandings].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0];
    const csEntries = Object.entries(cleanSheets).sort((a, b) => b[1] - a[1]);
    const mostCleanSheets = csEntries[0] ?? null;

    return { totalGoals, bestOffense, bestDefense, mostCleanSheets, topMatch, playedCount: playedMatches.length };
  }, [event.matches, standings]);

  const awards = useMemo(() => calculateEventAwards(event.matches), [event.matches]);
  const hasAwards = Boolean(
    awards.topScorers.length || awards.topAssists.length || awards.bestPlayer || awards.bestKeeper
  );

  // Spiele nach Block gruppieren (für die Blockdarstellung mit Zeitfenster).
  const blocks = useMemo(() => {
    const map = new Map<number, typeof event.matches>();
    [...event.matches]
      .sort((a, b) => a.block - b.block || a.field - b.field)
      .forEach((m) => {
        const arr = map.get(m.block) ?? [];
        arr.push(m);
        map.set(m.block, arr);
      });
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [event.matches]);

  const renderTeam = (name: string, align: 'left' | 'right') => {
    const crest = crestFor(name);
    return (
      <div className={`flex items-center gap-2 min-w-0 ${align === 'right' ? 'flex-row-reverse text-right' : ''}`}>
        <span className="shrink-0">
          <TeamCrest
            name={name}
            shortName={crest?.shortName ?? name.slice(0, 3).toUpperCase()}
            color={crest?.logoColor ?? '#E6238E'}
            logoUrl={crest?.logoUrl}
            size="sm"
            onSelect={crestClick(name)}
          />
        </span>
        <span className="font-sans font-semibold text-sm text-white truncate min-w-0">{name}</span>
      </div>
    );
  };

  return (
    <div className="relative">
      {/* Kopf mit eigener Farbwelt */}
      <div className="relative overflow-hidden border-b border-[rgba(230,35,142,.25)] bg-[radial-gradient(120%_140%_at_50%_-10%,rgba(230,35,142,.28),transparent_60%)]">
        <div className="max-w-[1320px] mx-auto px-4 sm:px-10 py-10 sm:py-14">
          <button
            onClick={onBack}
            className="flex w-fit items-center gap-1.5 text-xs font-sans font-bold uppercase tracking-wider text-hl-mute hover:text-white transition-colors cursor-pointer mb-6"
          >
            <ArrowLeft className="w-4 h-4" />
            Zurück
          </button>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[rgba(230,35,142,.15)] border border-[rgba(230,35,142,.4)] mb-4">
            <span className="w-2 h-2 rounded-full bg-[#E6238E] hl-pulse" />
            <span className="font-sans font-extrabold text-[11px] tracking-[2px] text-[#ff7ac4] uppercase">Spontanes Event</span>
          </div>

          <h1 className="font-display font-black text-4xl sm:text-6xl uppercase tracking-tight text-white leading-[.95]">
            {event.title}
          </h1>
          {event.tagline && (
            <p className="mt-3 font-sans text-sm sm:text-base text-hl-soft max-w-2xl">{event.tagline}</p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-sans text-hl-mute">
            {event.dateLabel && (
              <span className="inline-flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#E6238E]" />
                {event.dateLabel}
              </span>
            )}
            {event.location && (
              <span className="inline-flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#E6238E]" />
                {event.location}
              </span>
            )}
          </div>

          {isAdmin && onPrint && (
            <button
              onClick={onPrint}
              className="mt-6 inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-[rgba(230,35,142,.4)] bg-[rgba(230,35,142,.1)] text-[#ff9ad4] hover:bg-[rgba(230,35,142,.2)] text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Ergebniszettel drucken
            </button>
          )}
        </div>
      </div>

      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 py-8 sm:py-12 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] gap-8 lg:gap-12">
        {/* Tabelle */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-[#E9C46A]" />
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Tabelle</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)]">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] font-mono uppercase tracking-wider text-hl-mute border-b border-white/10">
                  <th className="py-2.5 pl-4 pr-2 text-left w-8">#</th>
                  <th className="py-2.5 px-2 text-left">Team</th>
                  <th className="py-2.5 px-2 text-center w-8" title="Spiele">Sp</th>
                  <th className="py-2.5 px-2 text-center w-8 hidden sm:table-cell" title="Siege">S</th>
                  <th className="py-2.5 px-2 text-center w-8 hidden sm:table-cell" title="Unentschieden">U</th>
                  <th className="py-2.5 px-2 text-center w-8 hidden sm:table-cell" title="Niederlagen">N</th>
                  <th className="py-2.5 px-2 text-center w-12" title="Tore">Tore</th>
                  <th className="py-2.5 px-2 text-center w-10" title="Tordifferenz">TD</th>
                  <th className="py-2.5 pr-4 pl-2 text-center w-10" title="Punkte">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((row, i) => {
                  const crest = crestFor(row.team);
                  return (
                    <tr key={row.team} className="border-b border-white/[.06] last:border-0">
                      <td className="py-2.5 pl-4 pr-2 font-display font-black text-hl-mute">{i + 1}</td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <TeamCrest
                            name={row.team}
                            shortName={crest?.shortName ?? row.team.slice(0, 3).toUpperCase()}
                            color={crest?.logoColor ?? '#E6238E'}
                            logoUrl={crest?.logoUrl}
                            size="sm"
                            onSelect={crestClick(row.team)}
                          />
                          <span className="font-sans font-semibold text-white truncate">{row.team}</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2 text-center text-hl-soft">{row.played}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft hidden sm:table-cell">{row.won}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft hidden sm:table-cell">{row.drawn}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft hidden sm:table-cell">{row.lost}</td>
                      <td className="py-2.5 px-2 text-center text-hl-soft whitespace-nowrap">
                        {row.goalsFor}:{row.goalsAgainst}
                      </td>
                      <td className="py-2.5 px-2 text-center text-hl-soft">
                        {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                      </td>
                      <td className="py-2.5 pr-4 pl-2 text-center font-display font-black text-white">{row.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[11px] font-sans text-hl-mute">
            Die Tabelle aktualisiert sich automatisch, sobald Ergebnisse eingetragen werden.
          </p>
        </section>

        {/* Spielplan */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[#E6238E]" />
            <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Spielplan</h2>
          </div>
          <div className="space-y-3">
            {blocks.map(([block, ms]) => {
              const start = ms[0]?.start;
              const end = ms[0]?.end;
              return (
                <div key={block} className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2 bg-white/[.03] border-b border-white/[.06]">
                    <span className="font-sans font-bold text-[11px] tracking-wider uppercase text-hl-mute">
                      Block {block}
                    </span>
                    <span className="font-mono text-xs text-[#ff7ac4]">
                      {start}{end ? `–${end}` : ''}
                    </span>
                  </div>
                  <div className="divide-y divide-white/[.06]">
                    {ms.map((m) => {
                      const played = m.homeScore !== null && m.awayScore !== null;
                      const isLive = m.status === 'live';
                      return (
                        <div key={m.id} className={`px-4 py-3 ${isLive ? 'bg-red-500/[.07]' : ''}`}>
                          <div className="flex items-center gap-3">
                            <span className="shrink-0 min-w-[3.25rem] text-[10px] font-mono uppercase tracking-wider leading-tight">
                              {isLive ? (
                                <LiveBadge liveStartedAt={m.liveStartedAt} />
                              ) : (
                                <span className="text-hl-mute">Feld {m.field}</span>
                              )}
                            </span>
                            <div className="flex-1 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 min-w-0">
                              {renderTeam(m.home, 'left')}
                              <span
                                className={`px-2.5 py-1 rounded-md font-display font-black text-sm tabular-nums ${
                                  isLive ? 'bg-red-500/20 text-red-300' : played ? 'bg-white/[.06] text-white' : 'text-hl-mute'
                                }`}
                              >
                                {played ? `${m.homeScore} : ${m.awayScore}` : isLive ? '– : –' : 'vs'}
                              </span>
                              {renderTeam(m.away, 'right')}
                            </div>
                          </div>
                          {(m.scorers ?? []).some((s) => s.player) && (
                            <div className="mt-2 pl-[3.75rem] flex gap-3">
                              {/* Torschützen des Heimteams – links */}
                              <div className="flex-1 min-w-0 space-y-0.5">
                                {(m.scorers ?? [])
                                  .filter((s) => s.player && s.team === m.home)
                                  .map((s, i) => (
                                    <div key={i} className="flex items-center gap-1 text-[11px] font-sans text-hl-soft">
                                      <span className="text-[#ff7ac4]">⚽</span>
                                      <span className="truncate min-w-0">
                                        {s.player}
                                        {s.assist ? <span className="text-hl-mute"> · Vorlage {s.assist}</span> : null}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                              {/* Torschützen des Auswärtsteams – rechts */}
                              <div className="flex-1 min-w-0 space-y-0.5 text-right">
                                {(m.scorers ?? [])
                                  .filter((s) => s.player && s.team === m.away)
                                  .map((s, i) => (
                                    <div key={i} className="flex flex-row-reverse items-center gap-1 text-[11px] font-sans text-hl-soft">
                                      <span className="text-[#ff7ac4]">⚽</span>
                                      <span className="truncate min-w-0">
                                        {s.player}
                                        {s.assist ? <span className="text-hl-mute"> · Vorlage {s.assist}</span> : null}
                                      </span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Statistiken vom Abend */}
      <div className="max-w-[1320px] mx-auto px-4 sm:px-10 pb-12">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 className="w-5 h-5 text-[#ff7ac4]" />
          <h2 className="font-display font-black text-xl uppercase tracking-tight text-white">Statistiken vom Abend</h2>
        </div>

        {stats ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {stats.bestOffense && (
              <StatTile
                icon={<Swords className="w-4 h-4" />}
                label="Beste Offensive"
                value={stats.bestOffense.team}
                sub={`${stats.bestOffense.goalsFor} Tore`}
                crest={crestFor(stats.bestOffense.team)}
                onSelect={crestClick(stats.bestOffense.team)}
              />
            )}
            {stats.bestDefense && (
              <StatTile
                icon={<Shield className="w-4 h-4" />}
                label="Beste Defensive"
                value={stats.bestDefense.team}
                sub={`${stats.bestDefense.goalsAgainst} Gegentore`}
                crest={crestFor(stats.bestDefense.team)}
                onSelect={crestClick(stats.bestDefense.team)}
              />
            )}
            {stats.mostCleanSheets && (
              <StatTile
                icon={<Lock className="w-4 h-4" />}
                label="Meiste Zu-Null-Spiele"
                value={stats.mostCleanSheets[0]}
                sub={`${stats.mostCleanSheets[1]}× zu Null`}
                crest={crestFor(stats.mostCleanSheets[0])}
                onSelect={crestClick(stats.mostCleanSheets[0])}
              />
            )}
            <StatTile
              icon={<Goal className="w-4 h-4" />}
              label="Tore insgesamt"
              value={String(stats.totalGoals)}
              sub={`in ${stats.playedCount} Spielen`}
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] px-4 py-8 text-center text-sm text-hl-mute font-sans">
            Sobald die ersten Ergebnisse eingetragen sind, erscheinen hier die Bestwerte des Abends.
          </div>
        )}

        {/* Spieler des Abends */}
        {hasAwards && (
          <div className="mt-8">
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-[#E9C46A]" />
              <h3 className="font-display font-black text-lg uppercase tracking-tight text-white">Spieler des Abends</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {awards.topScorers[0] && (
                <StatTile
                  icon={<Crown className="w-4 h-4" />}
                  label="Torschützenkönig"
                  value={awards.topScorers[0].player}
                  sub={`${awards.topScorers[0].count} Tore · ${awards.topScorers[0].team}`}
                  crest={crestFor(awards.topScorers[0].team)}
                  onSelect={crestClick(awards.topScorers[0].team)}
                />
              )}
              {awards.topAssists[0] && (
                <StatTile
                  icon={<Handshake className="w-4 h-4" />}
                  label="Meiste Vorlagen"
                  value={awards.topAssists[0].player}
                  sub={`${awards.topAssists[0].count} Vorlagen · ${awards.topAssists[0].team}`}
                  crest={crestFor(awards.topAssists[0].team)}
                  onSelect={crestClick(awards.topAssists[0].team)}
                />
              )}
              {awards.bestPlayer && (
                <StatTile
                  icon={<Star className="w-4 h-4" />}
                  label="Bester Spieler"
                  value={awards.bestPlayer.player}
                  sub={awards.bestPlayer.team}
                  crest={crestFor(awards.bestPlayer.team)}
                  onSelect={crestClick(awards.bestPlayer.team)}
                />
              )}
              {awards.bestKeeper && (
                <StatTile
                  icon={<Hand className="w-4 h-4" />}
                  label="Bester Torwart"
                  value={awards.bestKeeper.player}
                  sub={`${awards.bestKeeper.count}× zu Null · ${awards.bestKeeper.team}`}
                  crest={crestFor(awards.bestKeeper.team)}
                  onSelect={crestClick(awards.bestKeeper.team)}
                />
              )}
            </div>

            {awards.topScorers.length > 1 && (
              <div className="mt-4 rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] overflow-hidden">
                <div className="px-4 py-2 bg-white/[.03] border-b border-white/[.06] text-[10px] font-mono uppercase tracking-wider text-hl-mute">
                  Torschützenliste
                </div>
                <div className="divide-y divide-white/[.06]">
                  {awards.topScorers.slice(0, 8).map((s, i) => (
                    <div key={`${s.team}-${s.player}`} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                      <span className="w-5 shrink-0 text-center font-display font-black text-hl-mute">{i + 1}</span>
                      <span className="font-sans font-semibold text-white truncate min-w-0">{s.player}</span>
                      <span className="text-xs text-hl-mute truncate min-w-0">{s.team}</span>
                      <span className="ml-auto shrink-0 font-display font-black text-white">{s.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Kompakte Statistik-Kachel
function StatTile({
  icon,
  label,
  value,
  sub,
  crest,
  onSelect,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  crest?: Team;
  onSelect?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[rgba(255,255,255,.02)] p-4">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider text-hl-mute mb-3">
        <span className="text-[#ff7ac4]">{icon}</span>
        {label}
      </div>
      <div className="flex items-center gap-2 min-w-0">
        {crest && (
          <span className="shrink-0">
            <TeamCrest name={crest.name} shortName={crest.shortName} color={crest.logoColor} logoUrl={crest.logoUrl} size="sm" onSelect={onSelect} />
          </span>
        )}
        <span className="font-display font-black text-white text-lg leading-tight truncate min-w-0">{value}</span>
      </div>
      <div className="mt-1 text-xs font-sans text-hl-soft">{sub}</div>
    </div>
  );
}
