import React from 'react';
import { motion } from 'motion/react';
import { Trophy, Calendar, Users, Zap, ShieldAlert } from 'lucide-react';
import { Match, Team } from '../types';

interface HeroProps {
  teams: Team[];
  matches: Match[];
  onExploreSchedule: () => void;
  onExploreStandings: () => void;
}

export default function Hero({ teams, matches, onExploreSchedule, onExploreStandings }: HeroProps) {
  // Calculate some fun real-time stats for the scoreboard
  const completedMatches = matches.filter((m) => m.status === 'beendet' || m.isCompleted);
  const totalGoals = completedMatches.reduce(
    (acc, cur) => acc + (cur.homeScore || 0) + (cur.awayScore || 0),
    0
  );
  const avgGoals = completedMatches.length
    ? (totalGoals / completedMatches.length).toFixed(1)
    : '0';

  // Find if there is currently a LIVE match to display, or fallback to upcoming
  const liveMatch = matches.find((m) => m.status === 'live');
  const nextMatch = liveMatch || matches.find((m) => m.status === 'geplant' || (!m.isCompleted && m.status !== 'beendet'));
  const homeTeam = nextMatch ? teams.find((t) => t.id === nextMatch.homeTeamId) : null;
  const awayTeam = nextMatch ? teams.find((t) => t.id === nextMatch.awayTeamId) : null;

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#0A0118] via-[#1E1B4B] to-[#0A0118] border-b border-white/10 py-16 md:py-24 px-4">
      {/* Grid Pattern Background */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(#3B82F6_1px,transparent_1px)] [background-size:20px_20px] pointer-events-none" />

      {/* Dynamic ambient blur spots */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-80 h-80 rounded-full bg-brand-accent-light/10 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-purple-600/10 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-12 items-center relative z-10">
        {/* Left Side: Brand & Call to Action */}
        <motion.div
          className="lg:col-span-7 space-y-6 text-center lg:text-left"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <div className="inline-flex items-center space-x-2 bg-brand-accent/15 border border-brand-accent-light/20 px-3 py-1.5 rounded-full text-brand-accent-light text-xs font-mono font-semibold tracking-wider uppercase">
            <Zap className="w-3.5 h-3.5 animate-pulse text-yellow-400" />
            <span>Saison 2026/27 • Live Arena</span>
          </div>

          <h1 className="font-display font-black italic uppercase tracking-tighter text-white leading-none text-5xl sm:text-6xl md:text-7xl drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]">
            HERO <span className="text-brand-accent-light">LEAGUE</span>
          </h1>
          
          <p className="text-brand-accent-light font-bold tracking-[0.25em] text-xs uppercase">
            Die Zukunft des Profifußballs
          </p>

          <p className="text-gray-300 text-sm sm:text-base max-w-xl mx-auto lg:mx-0 leading-relaxed font-sans font-light">
            Erlebe die <strong>Hero League</strong>. Verwalte Spieltage, analysiere präzise Live-Tabellen und verfolge Torschützenstatistiken auf einer hochmodernen, responsiven Sport-Plattform.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
            <button
              onClick={onExploreSchedule}
              className="w-full sm:w-auto px-8 py-3.5 bg-brand-accent-light hover:bg-brand-accent rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 shadow-lg shadow-brand-accent-light/25 text-white flex items-center justify-center space-x-2 cursor-pointer hover:scale-[1.02]"
            >
              <Calendar className="w-4 h-4" />
              <span>Spielplan ansehen</span>
            </button>
            <button
              onClick={onExploreStandings}
              className="w-full sm:w-auto px-8 py-3.5 bg-transparent hover:bg-white/5 text-white border border-white/20 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-300 flex items-center justify-center space-x-2 cursor-pointer"
            >
              <Trophy className="w-4 h-4 text-yellow-400" />
              <span>Tabelle betrachten</span>
            </button>
          </div>

          {/* Micro Stats Row */}
          <div className="grid grid-cols-3 gap-4 pt-6 max-w-md mx-auto lg:mx-0 border-t border-white/10">
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-white font-mono">{teams.length}</div>
              <div className="text-xs text-gray-400 font-sans uppercase tracking-wider">Clubs</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-white font-mono">{completedMatches.length}</div>
              <div className="text-xs text-gray-400 font-sans uppercase tracking-wider">Spiele</div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-display font-bold text-brand-accent-light font-mono">{totalGoals}</div>
              <div className="text-xs text-gray-400 font-sans uppercase tracking-wider">Tore ({avgGoals}/Sp)</div>
            </div>
          </div>
        </motion.div>

        {/* Right Side: Showcase / Next Match Board */}
        <motion.div
          className="lg:col-span-5 relative"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Neon decorative card wrapper */}
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-brand-accent-light to-brand-deep opacity-30 blur-md pointer-events-none" />
          
          <div className="relative bg-[#1E1B4B]/80 border border-white/10 rounded-xl p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <span className="text-xs font-mono tracking-wider text-brand-accent-light font-bold uppercase flex items-center space-x-1.5">
                {nextMatch?.status === 'live' ? (
                  <>
                    <span className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-red-400 font-extrabold uppercase">JETZT LIVE IM STADION</span>
                  </>
                ) : (
                  <>
                    <span className="inline-block w-2 h-2 rounded-full bg-brand-accent-light animate-ping" />
                    <span>NÄCHSTES SPITZENSPIEL</span>
                  </>
                )}
              </span>
              {nextMatch && (
                <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                  Spieltag {nextMatch.matchday}
                </span>
              )}
            </div>

            {nextMatch && homeTeam && awayTeam ? (
              <div className="space-y-6 text-center">
                <div className="grid grid-cols-7 items-center gap-2">
                  {/* Home Team */}
                  <div className="col-span-3 flex flex-col items-center space-y-2">
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shadow-lg border relative transition-transform duration-300 hover:scale-110"
                      style={{ backgroundColor: `${homeTeam.logoColor}20`, borderColor: homeTeam.logoColor }}
                    >
                      <span className="absolute -bottom-1 -right-1 text-xs">{homeTeam.logoIcon}</span>
                      <span className="font-display font-bold text-sm" style={{ color: homeTeam.logoColor }}>
                        {homeTeam.shortName}
                      </span>
                    </div>
                    <span className="text-sm font-sans font-semibold text-white truncate max-w-full">
                      {homeTeam.name}
                    </span>
                  </div>

                  {/* VS / Score Divider */}
                  <div className="col-span-1 flex flex-col items-center justify-center">
                    {nextMatch.status === 'live' ? (
                      <div className="flex flex-col items-center bg-red-500/10 border border-red-500/25 px-2.5 py-1.5 rounded-xl animate-pulse">
                        <span className="text-lg font-mono font-black text-red-400">
                          {nextMatch.homeScore ?? 0}:{nextMatch.awayScore ?? 0}
                        </span>
                        <span className="text-[8px] font-mono font-bold text-red-500 tracking-wider">LIVE</span>
                      </div>
                    ) : (
                      <span className="text-xs font-mono text-brand-accent-light font-bold bg-brand-accent/20 px-2.5 py-1 rounded-full border border-brand-accent-light/30 uppercase tracking-wider">
                        VS
                      </span>
                    )}
                  </div>

                  {/* Away Team */}
                  <div className="col-span-3 flex flex-col items-center space-y-2">
                    <div 
                      className="w-14 h-14 rounded-full flex items-center justify-center text-3xl shadow-lg border relative transition-transform duration-300 hover:scale-110"
                      style={{ backgroundColor: `${awayTeam.logoColor}20`, borderColor: awayTeam.logoColor }}
                    >
                      <span className="absolute -bottom-1 -right-1 text-xs">{awayTeam.logoIcon}</span>
                      <span className="font-display font-bold text-sm" style={{ color: awayTeam.logoColor }}>
                        {awayTeam.shortName}
                      </span>
                    </div>
                    <span className="text-sm font-sans font-semibold text-white truncate max-w-full">
                      {awayTeam.name}
                    </span>
                  </div>
                </div>

                <div className="bg-[#0A0118]/60 border border-white/5 rounded-lg p-3 inline-block w-full">
                  <div className="text-[10px] text-gray-400 font-sans uppercase tracking-wider">
                    {nextMatch.status === 'live' ? 'Spielstand live aktualisiert' : 'Anstoßzeit'}
                  </div>
                  <div className="text-sm font-semibold text-white font-mono mt-0.5">
                    {nextMatch.status === 'live' ? (
                      <span className="text-red-400 flex items-center justify-center gap-1.5 uppercase tracking-wider text-xs font-bold">
                        <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-ping" />
                        Partie läuft aktuell in der Arena
                      </span>
                    ) : (
                      `${new Date(nextMatch.date).toLocaleDateString('de-DE', {
                        weekday: 'long',
                        day: '2-digit',
                        month: 'long',
                      })} um ${nextMatch.time} Uhr`
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-400 font-sans space-y-2">
                <Trophy className="w-10 h-10 mx-auto text-yellow-500/50" />
                <p>Saison beendet oder keine anstehenden Spiele mehr!</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
