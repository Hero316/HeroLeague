import React from 'react';
import { motion } from 'motion/react';
import { Trophy, Shield, ArrowUp, ArrowDown, Minus } from 'lucide-react';
import { Team, Match, Standing } from '../types';

interface TabelleProps {
  teams: Team[];
  matches: Match[];
}

export default function Tabelle({ teams, matches }: TabelleProps) {
  // Dynamic Table computation logic
  const standings: Standing[] = React.useMemo(() => {
    // Initialize standings for all teams
    const initialStandings: { [teamId: string]: Standing } = {};
    teams.forEach((team) => {
      initialStandings[team.id] = {
        teamId: team.id,
        teamName: team.name,
        shortName: team.shortName,
        logoColor: team.logoColor,
        logoIcon: team.logoIcon,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        goalDifference: 0,
        points: 0,
        form: [],
      };
    });

    // Populate standings from completed matches
    // Sort matches chronologically to build accurate Form history
    const sortedMatches = [...matches].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    sortedMatches.forEach((match) => {
      const isCompleted = match.status === 'beendet' || match.isCompleted;
      if (!isCompleted || match.homeScore === null || match.awayScore === null) return;

      const home = initialStandings[match.homeTeamId];
      const away = initialStandings[match.awayTeamId];

      if (!home || !away) return;

      home.played += 1;
      away.played += 1;
      home.goalsFor += match.homeScore;
      home.goalsAgainst += match.awayScore;
      away.goalsFor += match.awayScore;
      away.goalsAgainst += match.homeScore;

      if (match.homeScore > match.awayScore) {
        // Home Win
        home.won += 1;
        home.points += 3;
        home.form.push('W');

        away.lost += 1;
        away.form.push('L');
      } else if (match.homeScore < match.awayScore) {
        // Away Win
        away.won += 1;
        away.points += 3;
        away.form.push('W');

        home.lost += 1;
        home.form.push('L');
      } else {
        // Draw
        home.drawn += 1;
        home.points += 1;
        home.form.push('D');

        away.drawn += 1;
        away.form.push('D');
      }
    });

    // Post-process goal differences and limit form to last 5 matches
    return Object.values(initialStandings)
      .map((standing) => {
        standing.goalDifference = standing.goalsFor - standing.goalsAgainst;
        standing.form = standing.form.slice(-5); // Keep last 5 matches
        return standing;
      })
      .sort((a, b) => {
        // 1. Points
        if (b.points !== a.points) return b.points - a.points;
        // 2. Goal Difference
        if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
        // 3. Goals For
        if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
        // 4. Alphabetical name
        return a.teamName.localeCompare(b.teamName);
      });
  }, [teams, matches]);

  return (
    <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between pb-6 border-b border-white/10 gap-4">
        <div>
          <h2 className="font-display font-bold text-2xl uppercase tracking-tight text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Aktuelle Ligatabelle
          </h2>
          <p className="text-xs text-gray-400 font-sans mt-1">
            Automatisch berechnete Platzierungen basierend auf Spielergebnissen
          </p>
        </div>
        
        {/* Quick Legend indicators */}
        <div className="flex flex-wrap gap-3 text-[11px] font-mono uppercase tracking-wider">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
            <span className="text-gray-300">Champions League (1-4)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />
            <span className="text-gray-300">Europa League (5)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" />
            <span className="text-gray-300">Relegation (9-10)</span>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto mt-6">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-white/10 text-xs font-mono text-gray-400 tracking-wider uppercase">
              <th className="py-3 px-3 text-center w-12">#</th>
              <th className="py-3 px-4">Club</th>
              <th className="py-3 px-3 text-center w-12">Sp</th>
              <th className="py-3 px-3 text-center w-10 hidden sm:table-cell">S</th>
              <th className="py-3 px-3 text-center w-10 hidden sm:table-cell">U</th>
              <th className="py-3 px-3 text-center w-10 hidden sm:table-cell">N</th>
              <th className="py-3 px-4 text-center w-24">Tore</th>
              <th className="py-3 px-3 text-center w-12">TD</th>
              <th className="py-3 px-4 text-center w-16 bg-brand-accent/10 rounded-t-lg">Pkt</th>
              <th className="py-3 px-4 text-center w-36 hidden md:table-cell">Form</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((standing, index) => {
              const rank = index + 1;
              // Determine zones for border highlight
              let rankBorderClass = 'border-l-4 border-transparent';
              if (rank <= 4) rankBorderClass = 'border-l-4 border-blue-500';
              else if (rank === 5) rankBorderClass = 'border-l-4 border-purple-500';
              else if (rank >= 9) rankBorderClass = 'border-l-4 border-rose-500';

              return (
                <tr
                  key={standing.teamId}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors duration-150 ${rankBorderClass}`}
                >
                  {/* Position */}
                  <td className="py-3 px-3 text-center font-mono font-bold text-sm text-gray-300">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                      rank === 1 ? 'bg-yellow-500/20 text-yellow-400 font-extrabold border border-yellow-500/30' :
                      rank <= 4 ? 'bg-blue-500/15 text-blue-400' :
                      rank >= 9 ? 'bg-rose-500/15 text-rose-400' : 'text-gray-400'
                    }`}>
                      {rank}
                    </span>
                  </td>

                  {/* Club info */}
                  <td className="py-3 px-4 font-sans font-medium text-white">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs"
                        style={{ backgroundColor: `${standing.logoColor}20`, border: `1px solid ${standing.logoColor}` }}
                      >
                        <span className="text-sm">{standing.logoIcon}</span>
                      </div>
                      <div>
                        <span className="hidden sm:inline text-sm font-semibold">{standing.teamName}</span>
                        <span className="inline sm:hidden text-sm font-semibold">{standing.shortName}</span>
                      </div>
                    </div>
                  </td>

                  {/* Played */}
                  <td className="py-3 px-3 text-center font-mono text-sm text-gray-300 font-medium">
                    {standing.played}
                  </td>

                  {/* Won (hidden mobile) */}
                  <td className="py-3 px-3 text-center font-mono text-sm text-gray-400 hidden sm:table-cell">
                    {standing.won}
                  </td>

                  {/* Drawn (hidden mobile) */}
                  <td className="py-3 px-3 text-center font-mono text-sm text-gray-400 hidden sm:table-cell">
                    {standing.drawn}
                  </td>

                  {/* Lost (hidden mobile) */}
                  <td className="py-3 px-3 text-center font-mono text-sm text-gray-400 hidden sm:table-cell">
                    {standing.lost}
                  </td>

                  {/* Goals */}
                  <td className="py-3 px-4 text-center font-mono text-sm text-gray-300">
                    {standing.goalsFor}:{standing.goalsAgainst}
                  </td>

                  {/* Goal Difference */}
                  <td className={`py-3 px-3 text-center font-mono text-sm font-bold ${
                    standing.goalDifference > 0 ? 'text-emerald-400' :
                    standing.goalDifference < 0 ? 'text-rose-400' : 'text-gray-400'
                  }`}>
                    {standing.goalDifference > 0 ? `+${standing.goalDifference}` : standing.goalDifference}
                  </td>

                  {/* Points */}
                  <td className="py-3 px-4 text-center font-mono text-base font-bold text-white bg-brand-accent/5">
                    {standing.points}
                  </td>

                  {/* Form (hidden mobile) */}
                  <td className="py-3 px-4 hidden md:table-cell">
                    <div className="flex items-center justify-center space-x-1.5">
                      {standing.form.length === 0 ? (
                        <span className="text-xs text-gray-500 font-sans font-light uppercase tracking-wider">Keine</span>
                      ) : (
                        standing.form.map((res, formIdx) => (
                          <span
                            key={formIdx}
                            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-mono font-bold select-none ${
                              res === 'W' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' :
                              res === 'D' ? 'bg-gray-500/20 text-gray-300 border border-gray-500/30' :
                              'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            }`}
                            title={res === 'W' ? 'Sieg' : res === 'D' ? 'Unentschieden' : 'Niederlage'}
                          >
                            {res}
                          </span>
                        ))
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-6 border-t border-white/10 pt-4 text-[11px] text-gray-400 font-sans flex flex-col sm:flex-row justify-between gap-2 uppercase tracking-wider">
        <span>Sortierung: 1. Punkte, 2. Tordifferenz, 3. Erzielte Tore, 4. Alphabetisch</span>
        <span>Saison: 2026/27 • Hero League Pro</span>
      </div>
    </div>
  );
}
