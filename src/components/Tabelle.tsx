import React from 'react';
import { Trophy } from 'lucide-react';
import { Team, Match, Standing } from '../types';
import { calculateStandings } from '../lib/standings';

interface TabelleProps {
  teams: Team[];
  matches: Match[];
  seasonLabel?: string;
  onSelectTeam?: (teamId: string) => void;
}

export default function Tabelle({ teams, matches, seasonLabel, onSelectTeam }: TabelleProps) {
  const standings: Standing[] = React.useMemo(
    () => calculateStandings(teams, matches),
    [teams, matches]
  );

  // Zonen: CL Platz 1–4, EL Platz 5, Abstieg = letzte 2 Plätze (dynamisch zur Teamanzahl)
  const relegationStart = Math.max(5, standings.length - 2);

  return (
    <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
      <div className="flex items-center pb-6 border-b border-white/10">
        <h2 className="font-display font-bold text-2xl uppercase tracking-tight text-white flex items-center gap-2">
          <Trophy className="w-6 h-6 text-yellow-400" />
          Aktuelle Ligatabelle
        </h2>
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
              else if (rank > relegationStart) rankBorderClass = 'border-l-4 border-rose-500';

              return (
                <tr
                  key={standing.teamId}
                  onClick={onSelectTeam ? () => onSelectTeam(standing.teamId) : undefined}
                  title={onSelectTeam ? `${standing.teamName} – Vereinsseite öffnen` : undefined}
                  className={`border-b border-white/5 hover:bg-white/5 transition-colors duration-150 ${rankBorderClass} ${
                    onSelectTeam ? 'cursor-pointer' : ''
                  }`}
                >
                  {/* Position - Golden, Silber, Bronze styling only for top 3 */}
                  <td className="py-3 px-3 text-center font-mono font-bold text-sm text-gray-300">
                    <span className={`inline-flex items-center justify-center w-7 h-7 rounded-lg ${
                      rank === 1 ? 'bg-yellow-500/20 text-yellow-400 font-extrabold border border-yellow-500/35 shadow-lg shadow-yellow-500/5' :
                      rank === 2 ? 'bg-slate-300/20 text-slate-300 font-extrabold border border-slate-300/35' :
                      rank === 3 ? 'bg-amber-600/20 text-amber-500 font-extrabold border border-amber-600/35' :
                      'text-gray-400 font-medium'
                    }`}>
                      {rank}
                    </span>
                  </td>

                  {/* Club info */}
                  <td className="py-3 px-4 font-sans font-medium text-white">
                    <div className="flex items-center space-x-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center font-display font-bold text-xs overflow-hidden shrink-0 border"
                        style={{ backgroundColor: `${standing.logoColor}20`, borderColor: standing.logoColor }}
                      >
                        {standing.logoUrl ? (
                          <img src={standing.logoUrl} alt={standing.shortName} className="w-5.5 h-5.5 object-contain" referrerPolicy="no-referrer" />
                        ) : (
                          <span className="text-sm">{standing.logoIcon}</span>
                        )}
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
        {seasonLabel && <span>Saison {seasonLabel} • Hero League</span>}
      </div>
    </div>
  );
}
