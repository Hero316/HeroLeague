import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Play, Check, RotateCcw, AlertCircle, Sparkles } from 'lucide-react';
import { Match, Team } from '../types';

interface SpielplanProps {
  teams: Team[];
  matches: Match[];
  isAdmin: boolean;
  onUpdateMatchScore: (
    matchId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: 'geplant' | 'live' | 'beendet'
  ) => void;
  onSimulateMatchday: (matchday: number) => void;
}

export default function Spielplan({
  teams,
  matches,
  isAdmin,
  onUpdateMatchScore,
  onSimulateMatchday,
}: SpielplanProps) {
  const [activeMatchday, setActiveMatchday] = useState<number>(1);
  const [editingScores, setEditingScores] = useState<{
    [matchId: string]: { home: string; away: string };
  }>({});

  // Get total matchdays available (1 to max matchday in the data)
  const matchdays = Array.from(new Set(matches.map((m) => m.matchday))).sort((a, b) => a - b);

  // Filter matches for the selected matchday
  const matchdayMatches = matches.filter((m) => m.matchday === activeMatchday);

  // Quick lookup helper for team details
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  // Handle local score edits
  const handleScoreChange = (matchId: string, side: 'home' | 'away', val: string) => {
    // Only allow numbers or empty string
    if (val !== '' && !/^\d+$/.test(val)) return;
    
    setEditingScores((prev) => ({
      ...prev,
      [matchId]: {
        ...prev[matchId],
        home: prev[matchId]?.home ?? '',
        away: prev[matchId]?.away ?? '',
        [side]: val,
      },
    }));
  };

  // Save the edited score
  const handleSaveScore = (match: Match) => {
    const edit = editingScores[match.id];
    const homeVal = edit?.home ?? '';
    const awayVal = edit?.away ?? '';

    if (homeVal === '' || awayVal === '') {
      alert('Bitte geben Sie für beide Teams gültige Tore ein.');
      return;
    }

    onUpdateMatchScore(match.id, parseInt(homeVal, 10), parseInt(awayVal, 10), 'beendet');
  };

  // Reset a completed match back to "upcoming"
  const handleResetMatch = (matchId: string) => {
    onUpdateMatchScore(matchId, null, null, 'geplant');
    setEditingScores((prev) => {
      const updated = { ...prev };
      delete updated[matchId];
      return updated;
    });
  };

  return (
    <div className="bg-[#1E1B4B]/40 border border-white/10 rounded-xl p-6 shadow-xl backdrop-blur-sm">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-white/10 gap-4 mb-6">
        <div>
          <h2 className="font-display font-bold text-2xl uppercase tracking-tight text-white flex items-center gap-2">
            <Calendar className="w-6 h-6 text-brand-accent-light" />
            Spielplan & Ergebnisse
          </h2>
          <p className="text-xs text-gray-400 font-sans mt-1">
            Navigiere durch Spieltage und {isAdmin ? 'trage Spielergebnisse ein' : 'betrachte die aktuellen Partien'}
          </p>
        </div>

        {/* Matchday Slider / Buttons */}
        <div className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
          {matchdays.map((day) => (
            <button
              key={day}
              onClick={() => setActiveMatchday(day)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all duration-150 whitespace-nowrap cursor-pointer ${
                activeMatchday === day
                  ? 'bg-brand-accent-light text-white shadow-[0_0_15px_rgba(59,130,246,0.35)]'
                  : 'bg-[#0A0118]/80 text-gray-400 hover:text-white hover:bg-white/5 border border-white/5'
              }`}
            >
              {day}. Spieltag
            </button>
          ))}
        </div>
      </div>

      {/* Admin Quick Matchday Controls */}
      {isAdmin && (
        <div className="mb-6 bg-brand-accent/5 border border-white/10 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2 text-sm font-sans text-gray-300">
            <Sparkles className="w-5 h-5 text-yellow-400 shrink-0" />
            <span>
              <strong>Admin-Aktion:</strong> Du kannst alle offenen Partien des <strong>{activeMatchday}. Spieltags</strong> automatisch mit realistischen Toren simulieren lassen!
            </span>
          </div>
          <button
            onClick={() => onSimulateMatchday(activeMatchday)}
            className="shrink-0 flex items-center space-x-1.5 bg-brand-accent-light hover:bg-brand-accent text-white font-sans text-xs font-semibold px-4 py-2 rounded-lg transition-colors cursor-pointer shadow-md"
          >
            <Play className="w-3.5 h-3.5" />
            <span>Spieltag simulieren</span>
          </button>
        </div>
      )}

      {/* Matches List Grid */}
      <div className="space-y-4">
        {matchdayMatches.map((match) => {
          const home = getTeam(match.homeTeamId);
          const away = getTeam(match.awayTeamId);

          if (!home || !away) return null;

          const isLocalEditing = editingScores[match.id] !== undefined;
          const currentHomeEdit = editingScores[match.id]?.home ?? match.homeScore?.toString() ?? '';
          const currentAwayEdit = editingScores[match.id]?.away ?? match.awayScore?.toString() ?? '';

          const isCompleted = match.status === 'beendet' || match.isCompleted;
          const isLive = match.status === 'live';

          return (
            <div
              key={match.id}
              className={`relative overflow-hidden border rounded-xl p-4 sm:p-5 transition-all duration-200 ${
                isLive
                  ? 'border-red-500/50 bg-[#3F0A18]/30 shadow-[0_0_20px_rgba(239,68,68,0.15)]'
                  : isCompleted
                  ? 'border-white/5 bg-[#0A0118]/40 hover:bg-[#0A0118]/60'
                  : 'border-white/10 bg-[#0A0118]/60 hover:border-brand-accent-light/30'
              }`}
            >
              {/* Match Header (Date/Time / Status) */}
              <div className="flex justify-between items-center text-[10px] font-mono text-gray-400 mb-3 border-b border-white/5 pb-2 uppercase tracking-wider">
                <span>
                  {new Date(match.date).toLocaleDateString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}{' '}
                  • {match.time} Uhr
                </span>
                {isLive ? (
                  <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.5 rounded font-bold uppercase animate-pulse flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block animate-ping" />
                    LIVE
                  </span>
                ) : isCompleted ? (
                  <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold uppercase">
                    Beendet
                  </span>
                ) : (
                  <span className="text-brand-accent-light font-bold uppercase">Bevorstehend</span>
                )}
              </div>

              {/* Match Row */}
              <div className="grid grid-cols-12 gap-3 items-center">
                {/* Home Team Column */}
                <div className="col-span-4 sm:col-span-5 flex items-center justify-end space-x-2 sm:space-x-4 text-right">
                  <span className="text-sm sm:text-base font-sans font-medium text-white truncate">
                    {home.name}
                  </span>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border relative"
                    style={{ backgroundColor: `${home.logoColor}20`, borderColor: home.logoColor }}
                  >
                    <span className="text-sm">{home.logoIcon}</span>
                  </div>
                </div>

                {/* Score / Edit Column */}
                <div className="col-span-4 sm:col-span-2 flex items-center justify-center">
                  {isAdmin && (!isCompleted || isLive || isLocalEditing) ? (
                    /* Score Editor (Admin Mode) */
                    <div className="flex items-center space-x-1.5">
                      <input
                        type="text"
                        maxLength={2}
                        placeholder="-"
                        value={currentHomeEdit}
                        onChange={(e) => handleScoreChange(match.id, 'home', e.target.value)}
                        onFocus={() => {
                          if (editingScores[match.id] === undefined) {
                            setEditingScores((prev) => ({
                              ...prev,
                              [match.id]: {
                                home: match.homeScore?.toString() ?? '',
                                away: match.awayScore?.toString() ?? '',
                              },
                            }));
                          }
                        }}
                        className="w-10 h-10 bg-[#0A0118] border border-white/20 rounded-lg text-center font-mono text-base font-bold text-white focus:outline-none focus:border-brand-accent-light"
                      />
                      <span className="text-gray-500 font-mono font-semibold">:</span>
                      <input
                        type="text"
                        maxLength={2}
                        placeholder="-"
                        value={currentAwayEdit}
                        onChange={(e) => handleScoreChange(match.id, 'away', e.target.value)}
                        onFocus={() => {
                          if (editingScores[match.id] === undefined) {
                            setEditingScores((prev) => ({
                              ...prev,
                              [match.id]: {
                                home: match.homeScore?.toString() ?? '',
                                away: match.awayScore?.toString() ?? '',
                              },
                            }));
                          }
                        }}
                        className="w-10 h-10 bg-[#0A0118] border border-white/20 rounded-lg text-center font-mono text-base font-bold text-white focus:outline-none focus:border-brand-accent-light"
                      />
                    </div>
                  ) : (
                    /* Score Display */
                    <div className="flex items-center justify-center space-x-3">
                      {isCompleted || isLive || match.homeScore !== null ? (
                        <div className="flex items-center justify-center bg-[#0A0118] border border-white/10 px-4 py-1.5 rounded-lg relative">
                          {isLive && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                          )}
                          <span className="text-lg font-mono font-bold text-white">
                            {match.homeScore ?? 0}
                          </span>
                          <span className="text-gray-500 font-mono font-semibold px-2">:</span>
                          <span className="text-lg font-mono font-bold text-white">
                            {match.awayScore ?? 0}
                          </span>
                        </div>
                      ) : (
                        <div className="text-xs font-mono font-bold text-gray-500 bg-[#0A0118] px-3 py-1.5 rounded-lg border border-white/5">
                          - : -
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Away Team Column */}
                <div className="col-span-4 sm:col-span-5 flex items-center justify-start space-x-2 sm:space-x-4 text-left">
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 border relative"
                    style={{ backgroundColor: `${away.logoColor}20`, borderColor: away.logoColor }}
                  >
                    <span className="text-sm">{away.logoIcon}</span>
                  </div>
                  <span className="text-sm sm:text-base font-sans font-medium text-white truncate">
                    {away.name}
                  </span>
                </div>
              </div>

              {/* Action Toolbar for Admins underneath each card */}
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap justify-end items-center gap-2">
                  {/* LIVE Toggle Button */}
                  {!isCompleted && (
                    <button
                      onClick={() => {
                        if (isLive) {
                          onUpdateMatchScore(match.id, match.homeScore ?? 0, match.awayScore ?? 0, 'beendet');
                        } else {
                          onUpdateMatchScore(match.id, match.homeScore ?? 0, match.awayScore ?? 0, 'live');
                        }
                      }}
                      className={`flex items-center space-x-1 text-[11px] font-mono px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                        isLive
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse font-bold'
                          : 'bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 hover:bg-indigo-500/20'
                      }`}
                    >
                      <Play className="w-3 h-3" />
                      <span>{isLive ? 'LIVE Beenden' : 'Status: LIVE setzen'}</span>
                    </button>
                  )}

                  {isCompleted && !isLocalEditing ? (
                    <button
                      onClick={() => handleResetMatch(match.id)}
                      className="flex items-center space-x-1 text-[11px] font-mono text-rose-400 hover:text-rose-300 bg-rose-500/10 border border-rose-500/20 px-2.5 py-1 rounded-md cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Ergebnis zurücksetzen</span>
                    </button>
                  ) : (
                    <>
                      {isLocalEditing && (
                        <button
                          onClick={() => {
                            setEditingScores((prev) => {
                              const updated = { ...prev };
                              delete updated[match.id];
                              return updated;
                            });
                          }}
                          className="text-[11px] font-mono text-gray-400 hover:text-gray-200 px-2 py-1 cursor-pointer"
                        >
                          Abbrechen
                        </button>
                      )}
                      <button
                        onClick={() => handleSaveScore(match)}
                        className="flex items-center space-x-1 text-[11px] font-mono text-emerald-400 hover:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 rounded-md cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Ergebnis speichern</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
