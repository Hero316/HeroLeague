import React, { useMemo } from 'react';
import { motion } from 'motion/react';
import { ArrowLeft, Users, CalendarDays, Target } from 'lucide-react';
import { Match, PlayerStat, Team } from '../types';
import { calculateStandings } from '../lib/standings';
import PlayerAvatar from './PlayerAvatar';

interface TeamDetailProps {
  team: Team;
  teams: Team[];
  matches: Match[]; // Spiele der ausgewählten Saison
  players: PlayerStat[];
  seasonLabel: string;
  onBack: () => void;
  onSelectTeam: (teamId: string) => void;
}

export default function TeamDetail({
  team,
  teams,
  matches,
  players,
  seasonLabel,
  onBack,
  onSelectTeam,
}: TeamDetailProps) {
  const standings = useMemo(() => calculateStandings(teams, matches), [teams, matches]);
  const rank = standings.findIndex((s) => s.teamId === team.id) + 1;
  const standing = standings.find((s) => s.teamId === team.id);

  const teamMatches = useMemo(
    () =>
      matches
        .filter((m) => m.homeTeamId === team.id || m.awayTeamId === team.id)
        .sort((a, b) => a.matchday - b.matchday || a.date.localeCompare(b.date)),
    [matches, team.id]
  );

  // Kader mit Statistiken aus den Spieldaten verknüpfen
  const roster = useMemo(
    () =>
      (team.spielerliste || []).map((player) => {
        const stats = players.find((p) => p.name === player.name);
        return {
          ...player,
          goals: stats?.goals ?? 0,
          assists: stats?.assists ?? 0,
          matchesPlayed: stats?.matchesPlayed ?? 0,
        };
      }),
    [team.spielerliste, players]
  );

  const opponent = (m: Match) => teams.find((t) => t.id === (m.homeTeamId === team.id ? m.awayTeamId : m.homeTeamId));

  const resultBadge = (m: Match) => {
    if (m.status !== 'beendet' || m.homeScore === null || m.awayScore === null) return null;
    const own = m.homeTeamId === team.id ? m.homeScore : m.awayScore;
    const other = m.homeTeamId === team.id ? m.awayScore : m.homeScore;
    if (own > other) return { label: 'S', classes: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' };
    if (own < other) return { label: 'N', classes: 'bg-rose-500/20 text-rose-400 border-rose-500/30' };
    return { label: 'U', classes: 'bg-gray-500/20 text-gray-300 border-gray-500/30' };
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
      <button
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider text-gray-400 hover:text-white transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Zurück zur Übersicht
      </button>

      {/* Vereinskopf */}
      <div
        className="relative overflow-hidden bg-[#1E1B4B]/40 border border-white/10 rounded-2xl p-8 shadow-xl backdrop-blur-sm"
        style={{ borderColor: `${team.logoColor}50` }}
      >
        <div
          className="absolute top-0 right-0 w-64 h-64 blur-[100px] rounded-full pointer-events-none opacity-20"
          style={{ backgroundColor: team.logoColor }}
        />
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 relative z-10">
          <div
            className="w-24 h-24 rounded-2xl flex items-center justify-center text-5xl border-2 shrink-0 overflow-hidden shadow-lg"
            style={{ backgroundColor: `${team.logoColor}20`, borderColor: team.logoColor }}
          >
            {team.logoUrl ? (
              <img src={team.logoUrl} alt={team.shortName} className="w-16 h-16 object-contain" referrerPolicy="no-referrer" />
            ) : (
              <span>{team.logoIcon}</span>
            )}
          </div>
          <div className="text-center sm:text-left space-y-2">
            <h1 className="font-display font-black text-3xl sm:text-4xl uppercase tracking-tight text-white italic">
              {team.name}
            </h1>
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 text-xs font-mono uppercase tracking-wider">
              <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300">{team.shortName}</span>
              {seasonLabel && (
                <span className="px-2 py-1 rounded bg-white/5 border border-white/10 text-gray-300">Saison {seasonLabel}</span>
              )}
              {rank > 0 && (
                <span
                  className="px-2 py-1 rounded border font-bold"
                  style={{ backgroundColor: `${team.logoColor}20`, borderColor: `${team.logoColor}60`, color: '#fff' }}
                >
                  Platz {rank}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Saisonbilanz */}
      {standing && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-3xl font-mono font-black text-white">{standing.points}</div>
            <div className="text-[10px] text-gray-400 uppercase font-sans tracking-widest mt-1">Punkte</div>
          </div>
          <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-3xl font-mono font-black text-white">
              {standing.won}-{standing.drawn}-{standing.lost}
            </div>
            <div className="text-[10px] text-gray-400 uppercase font-sans tracking-widest mt-1">S-U-N</div>
          </div>
          <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-4 text-center">
            <div className="text-3xl font-mono font-black text-white">
              {standing.goalsFor}:{standing.goalsAgainst}
            </div>
            <div className="text-[10px] text-gray-400 uppercase font-sans tracking-widest mt-1">Tore</div>
          </div>
          <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-4 text-center flex flex-col items-center justify-center">
            <div className="flex items-center justify-center space-x-1">
              {standing.form.length === 0 ? (
                <span className="text-xs text-gray-500 font-sans uppercase">Keine Spiele</span>
              ) : (
                standing.form.map((res, idx) => (
                  <span
                    key={idx}
                    className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold ${
                      res === 'W'
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : res === 'D'
                        ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30'
                        : 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                    }`}
                  >
                    {res}
                  </span>
                ))
              )}
            </div>
            <div className="text-[10px] text-gray-400 uppercase font-sans tracking-widest mt-2">Form (letzte 5)</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Kader */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-6 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand-accent-light" />
            Kader
          </h3>
          {roster.length === 0 ? (
            <p className="text-sm text-gray-400 font-sans py-6 text-center">Noch keine Spieler hinterlegt.</p>
          ) : (
            <div className="space-y-2.5">
              {roster.map((player) => (
                <div
                  key={player.name}
                  className="flex items-center justify-between gap-3 bg-[#0A0118]/40 border border-white/5 rounded-xl px-3.5 py-2.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar name={player.name} imageUrl={player.imageUrl} color={team.logoColor} size="md" />
                    <span className="font-sans font-semibold text-white text-sm truncate">{player.name}</span>
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-right font-mono text-xs">
                    <span title="Tore" className="text-brand-accent-light font-bold">
                      <Target className="w-3 h-3 inline mr-1" />
                      {player.goals}
                    </span>
                    <span title="Vorlagen" className="text-purple-400 font-bold">
                      A {player.assists}
                    </span>
                    <span title="Einsätze" className="text-gray-500">
                      {player.matchesPlayed} Sp.
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Spiele */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-6 flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-brand-accent-light" />
            Spiele
          </h3>
          {teamMatches.length === 0 ? (
            <p className="text-sm text-gray-400 font-sans py-6 text-center">Noch keine Spiele in dieser Saison.</p>
          ) : (
            <div className="space-y-2">
              {teamMatches.map((m) => {
                const opp = opponent(m);
                const isHome = m.homeTeamId === team.id;
                const badge = resultBadge(m);
                return (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-3 bg-[#0A0118]/40 border border-white/5 rounded-xl px-3.5 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-[10px] font-mono text-gray-500 shrink-0">{m.matchday}. Sp.</span>
                        <span className="text-[10px] font-mono text-gray-500 shrink-0 uppercase">{isHome ? 'H' : 'A'}</span>
                        {opp ? (
                          <button
                            onClick={() => onSelectTeam(opp.id)}
                            className="font-sans font-semibold text-white truncate hover:text-brand-accent-light transition-colors cursor-pointer"
                            title={`${opp.name} – Vereinsseite öffnen`}
                          >
                            {opp.name}
                          </button>
                        ) : (
                          <span className="font-sans font-semibold text-gray-400 truncate">Unbekannt</span>
                        )}
                      </div>
                      <div className="text-[10px] font-mono text-gray-500 mt-0.5">
                        {new Date(m.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })} • {m.time} Uhr
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {m.status === 'live' && (
                        <span className="text-[10px] font-mono text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded uppercase animate-pulse">
                          LIVE
                        </span>
                      )}
                      {m.status === 'beendet' && m.homeScore !== null ? (
                        <span className="font-mono font-black text-white text-sm bg-[#0A0118] border border-white/10 px-2.5 py-1 rounded-lg">
                          {isHome ? `${m.homeScore}:${m.awayScore}` : `${m.awayScore}:${m.homeScore}`}
                        </span>
                      ) : m.status !== 'live' ? (
                        <span className="text-[10px] font-mono text-brand-accent-light uppercase">Geplant</span>
                      ) : null}
                      {badge && (
                        <span
                          className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold border ${badge.classes}`}
                          title={badge.label === 'S' ? 'Sieg' : badge.label === 'U' ? 'Unentschieden' : 'Niederlage'}
                        >
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
