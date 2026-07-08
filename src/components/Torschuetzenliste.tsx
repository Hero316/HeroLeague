import React from 'react';
import { Match, Team } from '../types';
import { Award } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';

interface TorschuetzenlisteProps {
  matches: Match[];
  teams: Team[];
  onSelectTeam?: (teamId: string) => void;
}

export default function Torschuetzenliste({ matches, teams, onSelectTeam }: TorschuetzenlisteProps) {
  // Rangliste aus den Torschützen-Einträgen der beendeten/laufenden Spiele
  const scorerCounts = React.useMemo(() => {
    const counts: {
      [playerName: string]: {
        name: string;
        imageUrl?: string;
        teamId: string;
        teamName: string;
        teamLogoColor: string;
        logoIcon: string;
        logoUrl: string;
        goals: number;
      };
    } = {};

    matches.forEach((m) => {
      const isCompletedOrLive = m.status === 'beendet' || m.status === 'live';
      if (!isCompletedOrLive || !m.scorers) return;

      m.scorers.forEach((s) => {
        if (!s.playerName || s.playerName === 'Eigentor' || s.playerName === 'Unbekannt') return;

        const team = teams.find((t) => t.id === s.teamId);
        if (!counts[s.playerName]) {
          const rosterEntry = team?.spielerliste?.find((p) => p.name === s.playerName);
          counts[s.playerName] = {
            name: s.playerName,
            imageUrl: rosterEntry?.imageUrl,
            teamId: s.teamId,
            teamName: team ? team.name : 'Unbekannt',
            teamLogoColor: team ? team.logoColor : '#3B82F6',
            logoIcon: team ? team.logoIcon : '⚽',
            logoUrl: team?.logoUrl || '',
            goals: 0,
          };
        }
        counts[s.playerName].goals += 1;
      });
    });

    return Object.values(counts).sort((a, b) => b.goals - a.goals);
  }, [matches, teams]);

  return (
    <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm max-w-3xl mx-auto">
      <div className="flex items-center gap-2 border-b border-white/10 pb-4 mb-6">
        <Award className="w-6 h-6 text-brand-accent-light" />
        <div>
          <h2 className="font-display font-bold text-xl uppercase tracking-tight text-white">Torschützenliste</h2>
          <p className="text-xs text-gray-400 font-sans mt-0.5">
            Automatisch berechnete Rangliste aus den zugewiesenen Toren aller absolvierten Spiele
          </p>
        </div>
      </div>

      {scorerCounts.length === 0 ? (
        <div className="text-center py-12 text-gray-400 font-sans">
          Noch keine Tore eingetragen. Trage im Spielplan Ergebnisse ein, um die Torschützenliste zu füllen!
        </div>
      ) : (
        <div className="space-y-3">
          {scorerCounts.slice(0, 10).map((scorer, index) => {
            const isTop1 = index === 0;
            const isTop2 = index === 1;
            const isTop3 = index === 2;

            return (
              <div
                key={scorer.name}
                className={`flex items-center justify-between bg-[#0A0118]/60 border rounded-xl p-4 transition-all duration-200 ${
                  isTop1
                    ? 'border-yellow-500/30 bg-gradient-to-r from-yellow-500/5 to-transparent'
                    : isTop2
                    ? 'border-gray-400/20 bg-gradient-to-r from-gray-400/5 to-transparent'
                    : isTop3
                    ? 'border-amber-600/20 bg-gradient-to-r from-amber-600/5 to-transparent'
                    : 'border-white/5'
                }`}
              >
                <div className="flex items-center space-x-4 min-w-0">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full font-mono font-bold text-sm shrink-0">
                    {isTop1 ? (
                      <span className="text-yellow-400 text-base">🥇</span>
                    ) : isTop2 ? (
                      <span className="text-gray-300 text-base">🥈</span>
                    ) : isTop3 ? (
                      <span className="text-amber-600 text-base">🥉</span>
                    ) : (
                      <span className="text-gray-400 text-xs">{index + 1}.</span>
                    )}
                  </div>

                  <PlayerAvatar name={scorer.name} imageUrl={scorer.imageUrl} color={scorer.teamLogoColor} size="md" />

                  <div className="min-w-0">
                    <h4 className="font-sans font-semibold text-white text-sm sm:text-base truncate">
                      {scorer.name}
                    </h4>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      {scorer.logoUrl ? (
                        <img src={scorer.logoUrl} alt={scorer.teamName} className="w-4.5 h-4.5 object-contain" referrerPolicy="no-referrer" />
                      ) : (
                        <span className="text-xs">{scorer.logoIcon}</span>
                      )}
                      {onSelectTeam ? (
                        <button
                          onClick={() => onSelectTeam(scorer.teamId)}
                          className="text-xs text-gray-400 hover:text-brand-accent-light truncate transition-colors cursor-pointer"
                          title={`${scorer.teamName} – Vereinsseite öffnen`}
                        >
                          {scorer.teamName}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-400 truncate">{scorer.teamName}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-mono font-black text-lg sm:text-xl text-white">
                      {scorer.goals}
                    </span>
                    <span className="text-[10px] text-gray-400 font-sans uppercase font-medium ml-1">Tore</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
