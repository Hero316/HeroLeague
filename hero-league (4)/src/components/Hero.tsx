import React, { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Trophy, Calendar, Users, Zap, ShieldAlert, Award } from 'lucide-react';
import { Match, Team } from '../types';

interface HeroProps {
  teams: Team[];
  matches: Match[];
  onExploreSchedule: () => void;
  onExploreStandings: () => void;
}

export default function Hero({ teams, matches, onExploreSchedule, onExploreStandings }: HeroProps) {
  const [pom, setPom] = useState<{ name: string; club: string; goals: number; assists: number; image: string } | null>(null);

  useEffect(() => {
    fetch('/api/player-of-the-month')
      .then((res) => {
        if (res.ok) return res.json();
        throw new Error('POM not configured');
      })
      .then((data) => {
        if (data && data.name) {
          setPom(data);
        }
      })
      .catch((err) => console.log('No active Player of the Month:', err));
  }, []);

  const currentPom = pom || {
    name: "Florian Wirtz",
    club: "Bayer Leverkusen",
    goals: 4,
    assists: 5,
    image: ""
  };

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

        {/* Right Side: Showcase / Player of the Month (Prominent) */}
        <motion.div
          className="lg:col-span-5 relative"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
        >
          {/* Neon decorative card wrapper */}
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-yellow-500 to-amber-600 opacity-20 blur-md pointer-events-none" />
          
          <div className="relative bg-[#1E1B4B]/80 border border-yellow-500/20 rounded-2xl p-6 shadow-2xl backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-white/10 pb-4 mb-6">
              <span className="text-xs font-mono tracking-widest text-yellow-400 font-extrabold uppercase flex items-center space-x-1.5">
                <Award className="w-4 h-4 text-yellow-400 animate-pulse" />
                <span>MVP • SPIELER DES MONATS</span>
              </span>
              <span className="text-xs text-gray-400 font-mono uppercase tracking-wider">
                Saison 2026/27
              </span>
            </div>

            <div className="space-y-6">
              {/* Photo with 4:3 fixed aspect ratio and object-cover */}
              <div className="relative w-full aspect-[4/3] rounded-xl overflow-hidden border border-yellow-500/30 shadow-inner bg-slate-900/40">
                {currentPom.image ? (
                  <img
                    src={currentPom.image}
                    alt={currentPom.name}
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-tr from-amber-950 via-yellow-950 to-amber-900 flex flex-col items-center justify-center text-center p-4">
                    <span className="text-6xl mb-2 animate-bounce">👑</span>
                    <span className="text-xs uppercase tracking-widest font-mono text-yellow-500 font-bold">
                      Kein Bild hochgeladen
                    </span>
                  </div>
                )}
                {/* MVP Tag badge inside photo */}
                <div className="absolute top-3 left-3 bg-gradient-to-r from-yellow-500 to-amber-500 text-black text-[10px] font-black tracking-widest px-2.5 py-1 rounded-full uppercase shadow-lg">
                  🏆 MVP
                </div>
              </div>

              {/* Player details */}
              <div className="text-left space-y-4">
                <div>
                  <h3 className="text-2xl font-display font-black tracking-tight text-white uppercase italic">
                    {currentPom.name}
                  </h3>
                  <p className="text-sm text-yellow-400 font-medium tracking-wide mt-1">
                    {currentPom.club}
                  </p>
                </div>

                {/* Big Stats Row */}
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div className="bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border border-yellow-500/15 rounded-xl p-3 text-center">
                    <div className="text-3xl font-mono font-black text-white">{currentPom.goals}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-sans tracking-widest mt-1">Tore</div>
                  </div>
                  <div className="bg-gradient-to-br from-amber-500/10 to-yellow-600/5 border border-yellow-500/15 rounded-xl p-3 text-center">
                    <div className="text-3xl font-mono font-black text-white">{currentPom.assists}</div>
                    <div className="text-[10px] text-gray-400 uppercase font-sans tracking-widest mt-1">Assists</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
