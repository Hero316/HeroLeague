import React from 'react';
import { motion } from 'motion/react';
import { Award, Zap, TrendingUp, ShieldCheck, Flame } from 'lucide-react';
import { PlayerStat, Match, Team } from '../types';

interface StatistikenProps {
  players: PlayerStat[];
  matches: Match[];
  teams: Team[];
}

export default function Statistiken({ players, matches, teams }: StatistikenProps) {
  // Sort players for Top Scorers (only those with goals > 0)
  const topScorers = [...players].filter(p => p.goals > 0).sort((a, b) => b.goals - a.goals);
  
  // Sort players for Top Assists (only those with assists > 0)
  const topAssists = [...players].filter(p => p.assists > 0).sort((a, b) => b.assists - a.assists);

  // Dynamic club-wide calculations
  const clubStats = React.useMemo(() => {
    const stats: { [teamId: string]: { played: number; goalsFor: number; goalsAgainst: number; name: string; logoColor: string; logoIcon: string } } = {};
    
    // Initialize
    teams.forEach(t => {
      stats[t.id] = { played: 0, goalsFor: 0, goalsAgainst: 0, name: t.name, logoColor: t.logoColor, logoIcon: t.logoIcon };
    });

    // Compute
    matches.forEach(m => {
      const isFinished = m.isCompleted || m.status === 'beendet';
      if (!isFinished || m.homeScore === null || m.awayScore === null) return;
      
      const home = stats[m.homeTeamId];
      const away = stats[m.awayTeamId];
      
      if (home && away) {
        home.played += 1;
        home.goalsFor += m.homeScore;
        home.goalsAgainst += m.awayScore;
        away.played += 1;
        away.goalsFor += m.awayScore;
        away.goalsAgainst += m.homeScore;
      }
    });

    const list = Object.values(stats);
    const playedTeams = list.filter(t => t.played > 0);
    
    // Best attack (most goals scored)
    const bestAttack = playedTeams.length > 0 
      ? [...playedTeams].sort((a, b) => b.goalsFor - a.goalsFor)[0] 
      : null;
    
    // Best defense (fewest goals conceded, of teams that have played at least 1 game)
    const bestDefense = playedTeams.length > 0 
      ? [...playedTeams].sort((a, b) => a.goalsAgainst - b.goalsAgainst)[0] 
      : null;

    // Highest scoring match
    let highestScoringMatch: Match | null = null;
    let highestScoreSum = -1;
    matches.forEach(m => {
      const isFinished = m.isCompleted || m.status === 'beendet';
      if (isFinished && m.homeScore !== null && m.awayScore !== null) {
        const sum = m.homeScore + m.awayScore;
        if (sum > highestScoreSum) {
          highestScoreSum = sum;
          highestScoringMatch = m;
        }
      }
    });

    return {
      bestAttack,
      bestDefense,
      highestScoringMatch,
      highestScoreSum
    };
  }, [teams, matches]);

  const hMatchHome = clubStats.highestScoringMatch ? teams.find(t => t.id === clubStats.highestScoringMatch?.homeTeamId) : null;
  const hMatchAway = clubStats.highestScoringMatch ? teams.find(t => t.id === clubStats.highestScoringMatch?.awayTeamId) : null;

  return (
    <div className="space-y-8">
      {/* Dynamic Team Stats & Milestones Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Best Attack Card */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-brand-accent-light/5 blur-2xl rounded-full pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-bold tracking-wider text-brand-accent-light uppercase">Beste Offensive</span>
            <Flame className="w-5 h-5 text-orange-500 animate-pulse" />
          </div>
          {clubStats.bestAttack && clubStats.bestAttack.goalsFor > 0 ? (
            <div>
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-2xl">{clubStats.bestAttack.logoIcon}</span>
                <span className="text-lg font-semibold text-white truncate">{clubStats.bestAttack.name}</span>
              </div>
              <div className="mt-4 text-xs text-gray-400 font-sans uppercase tracking-wider">
                Erzielte Tore: <span className="text-2xl font-display font-bold text-white font-mono ml-1">{clubStats.bestAttack.goalsFor}</span>
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400 font-sans uppercase tracking-wider">Noch keine Tore</span>
          )}
        </div>

        {/* Best Defense Card */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-2xl rounded-full pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-bold tracking-wider text-emerald-400 uppercase">Beste Defensive</span>
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          {clubStats.bestDefense ? (
            <div>
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-2xl">{clubStats.bestDefense.logoIcon}</span>
                <span className="text-lg font-semibold text-white truncate">{clubStats.bestDefense.name}</span>
              </div>
              <div className="mt-4 text-xs text-gray-400 font-sans uppercase tracking-wider">
                Gegentore: <span className="text-2xl font-display font-bold text-emerald-400 font-mono ml-1">{clubStats.bestDefense.goalsAgainst}</span>
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400 font-sans uppercase tracking-wider">Keine Spiele</span>
          )}
        </div>

        {/* Torreichstes Spiel */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-5 shadow-lg backdrop-blur-sm relative overflow-hidden flex flex-col justify-between">
          <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 blur-2xl rounded-full pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <span className="text-xs font-mono font-bold tracking-wider text-purple-400 uppercase">Torreichstes Spiel</span>
            <TrendingUp className="w-5 h-5 text-purple-400" />
          </div>
          {clubStats.highestScoringMatch && hMatchHome && hMatchAway ? (
            <div>
              <div className="text-sm font-semibold text-white truncate mt-2">
                {hMatchHome.shortName} {clubStats.highestScoringMatch.homeScore} : {clubStats.highestScoringMatch.awayScore} {hMatchAway.shortName}
              </div>
              <div className="mt-4 text-xs text-gray-400 font-sans uppercase tracking-wider">
                Tore insgesamt: <span className="text-2xl font-display font-bold text-purple-300 font-mono ml-1">{clubStats.highestScoreSum}</span>
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400 font-sans uppercase tracking-wider">Keine Spiele</span>
          )}
        </div>
      </div>

      {/* Scorers Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Top Scorers */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-6 flex items-center gap-2">
            <Award className="w-5 h-5 text-yellow-400" />
            Torschützenkönige
          </h3>
          <div className="space-y-4">
            {topScorers.slice(0, 5).map((player, idx) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-[#0A0118]/40 border border-white/5 rounded-xl p-3.5 hover:border-brand-accent-light/20 transition-all duration-200"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xs font-mono font-bold text-gray-400 w-5 text-center">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <div className="font-sans font-semibold text-white truncate text-sm">
                      {player.name}
                    </div>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: player.teamLogoColor }}
                      />
                      <span className="text-[10px] text-gray-400 font-sans truncate">
                        {player.teamName}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-mono font-extrabold text-brand-accent-light">
                    {player.goals} <span className="text-[10px] text-gray-400 font-sans font-normal ml-0.5 uppercase">Tore</span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {player.matchesPlayed} Sp. ({ (player.goals / player.matchesPlayed).toFixed(1) }/Sp)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Assists */}
        <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
          <h3 className="font-display font-bold text-xl uppercase tracking-tight text-white mb-6 flex items-center gap-2">
            <Zap className="w-5 h-5 text-brand-accent-light" />
            Top-Vorlagengeber
          </h3>
          <div className="space-y-4">
            {topAssists.slice(0, 5).map((player, idx) => (
              <div
                key={player.id}
                className="flex items-center justify-between bg-[#0A0118]/40 border border-white/5 rounded-xl p-3.5 hover:border-brand-accent-light/20 transition-all duration-200"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <span className="text-xs font-mono font-bold text-gray-400 w-5 text-center">
                    {idx + 1}.
                  </span>
                  <div className="min-w-0">
                    <div className="font-sans font-semibold text-white truncate text-sm">
                      {player.name}
                    </div>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span
                        className="w-1.5 h-1.5 rounded-full inline-block shrink-0"
                        style={{ backgroundColor: player.teamLogoColor }}
                      />
                      <span className="text-[10px] text-gray-400 font-sans truncate">
                        {player.teamName}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-lg font-mono font-extrabold text-purple-400">
                    {player.assists} <span className="text-[10px] text-gray-400 font-sans font-normal ml-0.5 uppercase">Assists</span>
                  </div>
                  <div className="text-[10px] text-gray-500 font-mono">
                    {player.matchesPlayed} Sp.
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
