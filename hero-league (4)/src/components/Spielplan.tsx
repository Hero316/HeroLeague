import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Calendar, Play, Check, RotateCcw, AlertCircle, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { Match, Team } from '../types';

export function LiveTimer({ liveStartedAt }: { liveStartedAt?: string }) {
  const [minutes, setMinutes] = useState(1);

  useEffect(() => {
    if (!liveStartedAt) {
      // Just count up if no explicit start timestamp
      const interval = setInterval(() => {
        setMinutes(prev => (prev >= 90 ? 90 : prev + 1));
      }, 5000);
      return () => clearInterval(interval);
    }

    const updateMinutes = () => {
      const elapsedMs = Date.now() - new Date(liveStartedAt).getTime();
      const elapsedMin = Math.floor(elapsedMs / 60000) + 1;
      setMinutes(elapsedMin > 90 ? 90 : elapsedMin);
    };

    updateMinutes();
    const interval = setInterval(updateMinutes, 10000);
    return () => clearInterval(interval);
  }, [liveStartedAt]);

  return (
    <span className="text-red-400 bg-red-500/10 border border-red-500/20 px-2 py-0.5 rounded font-bold font-mono text-[10px] uppercase animate-pulse flex items-center gap-1.5 shrink-0">
      <span className="w-1.5 h-1.5 bg-red-500 rounded-full inline-block animate-ping" />
      <span>LIVE {minutes}'</span>
    </span>
  );
}

interface SpielplanProps {
  teams: Team[];
  matches: Match[];
  isAdmin: boolean;
  onUpdateMatchScore: (
    matchId: string,
    homeScore: number | null,
    awayScore: number | null,
    status: 'geplant' | 'live' | 'beendet',
    scorers?: { playerName: string; teamId: string }[]
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
  
  // Ref for the horizontal matchday button container
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Get total matchdays available (1 to max matchday in the data)
  const matchdays = Array.from(new Set(matches.map((m) => m.matchday))).sort((a, b) => a - b);

  // Automatically scroll the selected matchday button into view
  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeBtn = scrollContainerRef.current.querySelector('[data-active="true"]');
      if (activeBtn) {
        activeBtn.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center'
        });
      }
    }
  }, [activeMatchday]);

  const handlePrevMatchday = () => {
    setActiveMatchday((prev) => Math.max(1, prev - 1));
  };

  const handleNextMatchday = () => {
    setActiveMatchday((prev) => Math.min(matchdays.length, prev + 1));
  };
  
  // Track selected scorers and assistants locally during result entry
  const [matchScorers, setMatchScorers] = useState<{
    [matchId: string]: {
      homeScorers: { playerName: string; assistName: string }[];
      awayScorers: { playerName: string; assistName: string }[];
    };
  }>({});

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

    // Adjust scorers array size dynamically to match goals count
    const numGoals = val === '' ? 0 : parseInt(val, 10);
    setMatchScorers((prev) => {
      const current = prev[matchId] || { homeScorers: [], awayScorers: [] };
      const currentScorersForSide = side === 'home' ? [...current.homeScorers] : [...current.awayScorers];
      
      if (currentScorersForSide.length < numGoals) {
        while (currentScorersForSide.length < numGoals) {
          currentScorersForSide.push({ playerName: '', assistName: '' });
        }
      } else if (currentScorersForSide.length > numGoals) {
        currentScorersForSide.length = numGoals;
      }

      return {
        ...prev,
        [matchId]: {
          homeScorers: side === 'home' ? currentScorersForSide : current.homeScorers,
          awayScorers: side === 'away' ? currentScorersForSide : current.awayScorers,
        }
      };
    });
  };

  const handleScorerSelect = (
    matchId: string,
    side: 'home' | 'away',
    index: number,
    field: 'playerName' | 'assistName',
    value: string
  ) => {
    setMatchScorers((prev) => {
      const current = prev[matchId] || { homeScorers: [], awayScorers: [] };
      const updated = side === 'home' ? [...current.homeScorers] : [...current.awayScorers];
      
      if (!updated[index]) {
        updated[index] = { playerName: '', assistName: '' };
      }
      updated[index] = {
        ...updated[index],
        [field]: value
      };

      return {
        ...prev,
        [matchId]: {
          homeScorers: side === 'home' ? updated : current.homeScorers,
          awayScorers: side === 'away' ? updated : current.awayScorers,
        }
      };
    });
  };

  // Save the edited score with associated scorers and assistants
  const handleSaveScore = (match: Match) => {
    const edit = editingScores[match.id];
    const homeVal = edit?.home ?? '';
    const awayVal = edit?.away ?? '';

    if (homeVal === '' || awayVal === '') {
      alert('Bitte geben Sie für beide Teams gültige Tore ein.');
      return;
    }

    const homeGoals = parseInt(homeVal, 10);
    const awayGoals = parseInt(awayVal, 10);

    const scorers: { playerName: string; teamId: string; assistName?: string }[] = [];
    const localScorers = matchScorers[match.id] || { homeScorers: [], awayScorers: [] };

    for (let i = 0; i < homeGoals; i++) {
      const pObj = localScorers.homeScorers[i] || { playerName: 'Unbekannt', assistName: '' };
      scorers.push({
        playerName: pObj.playerName || 'Unbekannt',
        teamId: match.homeTeamId,
        assistName: pObj.assistName || undefined
      });
    }

    for (let i = 0; i < awayGoals; i++) {
      const pObj = localScorers.awayScorers[i] || { playerName: 'Unbekannt', assistName: '' };
      scorers.push({
        playerName: pObj.playerName || 'Unbekannt',
        teamId: match.awayTeamId,
        assistName: pObj.assistName || undefined
      });
    }

    onUpdateMatchScore(match.id, homeGoals, awayGoals, 'beendet', scorers);
  };

  // Reset a completed match back to "upcoming"
  const handleResetMatch = (matchId: string) => {
    onUpdateMatchScore(matchId, null, null, 'geplant', []);
    setEditingScores((prev) => {
      const updated = { ...prev };
      delete updated[matchId];
      return updated;
    });
    setMatchScorers((prev) => {
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

        {/* Matchday Slider / Buttons - Beautiful Scroll-Container */}
        <div className="w-full md:max-w-md lg:max-w-xl xl:max-w-2xl">
          <div 
            ref={scrollContainerRef}
            className="flex items-center space-x-2 overflow-x-auto pb-2 md:pb-1 w-full custom-scrollbar scroll-smooth"
            id="spieltags-liste-container"
          >
            {matchdays.map((day) => (
              <button
                key={day}
                data-active={activeMatchday === day}
                onClick={() => setActiveMatchday(day)}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold uppercase tracking-wider transition-all duration-150 whitespace-nowrap cursor-pointer shrink-0 ${
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

      {/* Main Spielplan Container with Left & Right Navigations */}
      <div className="flex items-center gap-2 sm:gap-4 w-full">
        {/* Left/Zurück Navigation Button */}
        <button
          onClick={handlePrevMatchday}
          disabled={activeMatchday === 1}
          className="flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#0A0118]/80 text-gray-400 hover:text-white hover:bg-brand-accent-light/20 border border-white/10 hover:border-white/20 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 shrink-0 shadow-lg cursor-pointer hover:scale-105 active:scale-95"
          title="Vorheriger Spieltag"
          id="spielplan-prev-button"
        >
          <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>

        <div className="flex-1 overflow-hidden w-full">
          {/* Matches List - Horizontal Scroll with flex & overflow-x-auto */}
          <div className="flex flex-row overflow-x-auto pb-6 gap-4 scroll-smooth custom-scrollbar w-full" id="spielplan-matches-container">
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
              className={`relative overflow-hidden border rounded-xl p-5 transition-all duration-200 min-w-[310px] sm:min-w-[420px] max-w-[450px] shrink-0 flex flex-col justify-between ${
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
                  <LiveTimer liveStartedAt={match.liveStartedAt} />
                ) : isCompleted ? (
                  <span className="text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded font-bold uppercase">
                    Beendet
                  </span>
                ) : (
                  <span className="text-brand-accent-light font-bold uppercase">Bevorstehend</span>
                )}
              </div>

              {/* Match Row with generous padding & gap */}
              <div className="grid grid-cols-12 gap-2 items-center py-4 px-2 bg-white/[0.02] rounded-xl border border-white/5">
                {/* Home Team Column */}
                <div className="col-span-5 flex items-center justify-end gap-3 text-right">
                  <span className="text-xs sm:text-sm font-sans font-bold text-white truncate">
                    {home.name}
                  </span>
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border relative overflow-hidden shadow-inner"
                    style={{ backgroundColor: `${home.logoColor}15`, borderColor: home.logoColor }}
                  >
                    {home.logoUrl ? (
                      <img src={home.logoUrl} alt={home.shortName} className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-sm">{home.logoIcon}</span>
                    )}
                  </div>
                </div>

                {/* Score / Edit Column */}
                <div className="col-span-2 flex items-center justify-center">
                  {isAdmin && (!isCompleted || isLive || isLocalEditing) ? (
                    /* Score Editor (Admin Mode) */
                    <div className="flex items-center gap-1">
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
                            
                            const homeScorers = (match.scorers || [])
                              .filter(s => s.teamId === match.homeTeamId)
                              .map(s => ({ playerName: s.playerName, assistName: s.assistName || '' }));
                            const awayScorers = (match.scorers || [])
                              .filter(s => s.teamId === match.awayTeamId)
                              .map(s => ({ playerName: s.playerName, assistName: s.assistName || '' }));

                            setMatchScorers((prev) => ({
                              ...prev,
                              [match.id]: { homeScorers, awayScorers }
                            }));
                          }
                        }}
                        className="w-8 h-8 sm:w-10 sm:h-10 bg-[#0A0118] border border-white/20 rounded-lg text-center font-mono text-sm sm:text-base font-bold text-white focus:outline-none focus:border-brand-accent-light"
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

                            const homeScorers = (match.scorers || [])
                              .filter(s => s.teamId === match.homeTeamId)
                              .map(s => ({ playerName: s.playerName, assistName: s.assistName || '' }));
                            const awayScorers = (match.scorers || [])
                              .filter(s => s.teamId === match.awayTeamId)
                              .map(s => ({ playerName: s.playerName, assistName: s.assistName || '' }));

                            setMatchScorers((prev) => ({
                              ...prev,
                              [match.id]: { homeScorers, awayScorers }
                            }));
                          }
                        }}
                        className="w-8 h-8 sm:w-10 sm:h-10 bg-[#0A0118] border border-white/20 rounded-lg text-center font-mono text-sm sm:text-base font-bold text-white focus:outline-none focus:border-brand-accent-light"
                      />
                    </div>
                  ) : (
                    /* Score Display */
                    <div className="flex items-center justify-center gap-2">
                      {isCompleted || isLive || match.homeScore !== null ? (
                        <div className="flex items-center justify-center bg-[#0A0118] border border-white/10 px-3 py-1 rounded-lg relative">
                          {isLive && (
                            <span className="absolute -top-1 -right-1 flex h-2 w-2">
                              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                            </span>
                          )}
                          <span className="text-base sm:text-lg font-mono font-black text-white">
                            {match.homeScore ?? 0}
                          </span>
                          <span className="text-gray-500 font-mono font-semibold px-1.5">:</span>
                          <span className="text-base sm:text-lg font-mono font-black text-white">
                            {match.awayScore ?? 0}
                          </span>
                        </div>
                      ) : (
                        <div className="text-[10px] sm:text-xs font-mono font-bold text-gray-500 bg-[#0A0118] px-2.5 py-1 rounded-lg border border-white/5">
                          - : -
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Away Team Column */}
                <div className="col-span-5 flex items-center justify-start gap-3 text-left">
                  <div
                    className="w-11 h-11 rounded-full flex items-center justify-center shrink-0 border relative overflow-hidden shadow-inner"
                    style={{ backgroundColor: `${away.logoColor}15`, borderColor: away.logoColor }}
                  >
                    {away.logoUrl ? (
                      <img src={away.logoUrl} alt={away.shortName} className="w-7 h-7 object-contain" referrerPolicy="no-referrer" />
                    ) : (
                      <span className="text-sm">{away.logoIcon}</span>
                    )}
                  </div>
                  <span className="text-xs sm:text-sm font-sans font-bold text-white truncate">
                    {away.name}
                  </span>
                </div>
              </div>

              {/* Goalscorers Entry Form (Admin Select Dropdowns) */}
              {isLocalEditing && (
                <div className="mt-4 p-4 bg-brand-accent/5 rounded-xl border border-white/10 space-y-4 animate-fadeIn">
                  <h4 className="text-xs font-mono text-brand-accent-light uppercase tracking-wider font-bold flex items-center gap-1.5">
                    <span>⚽</span> Torschützen & Vorlagengeber zuweisen
                  </h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Home Scorers */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-white truncate border-b border-white/5 pb-1">Tore für {home.name}:</div>
                      {Array.from({ length: parseInt(currentHomeEdit || '0', 10) }).map((_, i) => {
                        const selectedScorerObj = matchScorers[match.id]?.homeScorers[i] || { playerName: '', assistName: '' };
                        return (
                          <div key={`home-scorer-${i}`} className="p-2.5 bg-[#0A0118]/60 border border-white/5 rounded-lg space-y-1.5">
                            <div className="text-[10px] font-mono text-gray-400">Tor {i + 1}:</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] text-gray-500 font-sans mb-0.5 uppercase tracking-wider">Torschütze</label>
                                <select
                                  value={selectedScorerObj.playerName}
                                  onChange={(e) => handleScorerSelect(match.id, 'home', i, 'playerName', e.target.value)}
                                  className="w-full bg-[#0A0118] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer"
                                >
                                  <option value="">-- Wählen --</option>
                                  {home.spielerliste && home.spielerliste.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                  <option value="Eigentor">Eigentor (O.G.)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[9px] text-gray-500 font-sans mb-0.5 uppercase tracking-wider">Assist (Vorlage)</label>
                                <select
                                  value={selectedScorerObj.assistName}
                                  disabled={selectedScorerObj.playerName === 'Eigentor' || !selectedScorerObj.playerName}
                                  onChange={(e) => handleScorerSelect(match.id, 'home', i, 'assistName', e.target.value)}
                                  className="w-full bg-[#0A0118] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="">-- Kein Assist --</option>
                                  {home.spielerliste && home.spielerliste
                                    .filter(p => p !== selectedScorerObj.playerName)
                                    .map((p) => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {parseInt(currentHomeEdit || '0', 10) === 0 && (
                        <div className="text-[10px] text-gray-500 font-sans italic">Keine Tore geschossen.</div>
                      )}
                    </div>
 
                    {/* Away Scorers */}
                    <div className="space-y-3">
                      <div className="text-xs font-semibold text-white truncate border-b border-white/5 pb-1">Tore für {away.name}:</div>
                      {Array.from({ length: parseInt(currentAwayEdit || '0', 10) }).map((_, i) => {
                        const selectedScorerObj = matchScorers[match.id]?.awayScorers[i] || { playerName: '', assistName: '' };
                        return (
                          <div key={`away-scorer-${i}`} className="p-2.5 bg-[#0A0118]/60 border border-white/5 rounded-lg space-y-1.5">
                            <div className="text-[10px] font-mono text-gray-400">Tor {i + 1}:</div>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="block text-[9px] text-gray-500 font-sans mb-0.5 uppercase tracking-wider">Torschütze</label>
                                <select
                                  value={selectedScorerObj.playerName}
                                  onChange={(e) => handleScorerSelect(match.id, 'away', i, 'playerName', e.target.value)}
                                  className="w-full bg-[#0A0118] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer"
                                >
                                  <option value="">-- Wählen --</option>
                                  {away.spielerliste && away.spielerliste.map((p) => (
                                    <option key={p} value={p}>{p}</option>
                                  ))}
                                  <option value="Eigentor">Eigentor (O.G.)</option>
                                </select>
                              </div>
                              <div>
                                <label className="block text-[9px] text-gray-500 font-sans mb-0.5 uppercase tracking-wider">Assist (Vorlage)</label>
                                <select
                                  value={selectedScorerObj.assistName}
                                  disabled={selectedScorerObj.playerName === 'Eigentor' || !selectedScorerObj.playerName}
                                  onChange={(e) => handleScorerSelect(match.id, 'away', i, 'assistName', e.target.value)}
                                  className="w-full bg-[#0A0118] border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <option value="">-- Kein Assist --</option>
                                  {away.spielerliste && away.spielerliste
                                    .filter(p => p !== selectedScorerObj.playerName)
                                    .map((p) => (
                                      <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {parseInt(currentAwayEdit || '0', 10) === 0 && (
                        <div className="text-[10px] text-gray-500 font-sans italic">Keine Tore geschossen.</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
 
              {/* Display scorers for completed matches */}
              {isCompleted && match.scorers && match.scorers.length > 0 && (
                <div className="mt-3.5 pt-3 border-t border-white/5 text-xs text-gray-400 font-sans">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Home Scorers list */}
                    <div className="text-right text-gray-300 space-y-1">
                      {match.scorers
                        .filter(s => s.teamId === match.homeTeamId)
                        .map((s, idx) => (
                          <div key={idx} className="truncate">
                            <span className="font-medium text-white">{s.playerName}</span>
                            {s.assistName && (
                              <span className="text-[10px] text-gray-400 font-sans ml-1 italic">
                                (Vorlage: {s.assistName})
                              </span>
                            )}
                            <span className="text-brand-accent-light text-[10px] ml-1.5">⚽</span>
                          </div>
                        ))}
                    </div>
                    {/* Away Scorers list */}
                    <div className="text-left text-gray-300 space-y-1">
                      {match.scorers
                        .filter(s => s.teamId === match.awayTeamId)
                        .map((s, idx) => (
                          <div key={idx} className="truncate">
                            <span className="text-brand-accent-light text-[10px] mr-1.5">⚽</span>
                            <span className="font-medium text-white">{s.playerName}</span>
                            {s.assistName && (
                              <span className="text-[10px] text-gray-400 font-sans ml-1 italic">
                                (Vorlage: {s.assistName})
                              </span>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Action Toolbar for Admins underneath each card */}
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap justify-end items-center gap-2">
                  {/* LIVE Toggle Button */}
                  {!isCompleted && (
                    <button
                      onClick={() => {
                        if (isLive) {
                          onUpdateMatchScore(match.id, match.homeScore ?? 0, match.awayScore ?? 0, 'beendet', match.scorers || []);
                        } else {
                          onUpdateMatchScore(match.id, match.homeScore ?? 0, match.awayScore ?? 0, 'live', match.scorers || []);
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
                          type="button"
                          onClick={() => {
                            setEditingScores((prev) => {
                              const updated = { ...prev };
                              delete updated[match.id];
                              return updated;
                            });
                            setMatchScorers((prev) => {
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

        {/* Right/Vor Navigation Button */}
        <button
          onClick={handleNextMatchday}
          disabled={activeMatchday === matchdays.length}
          className="flex items-center justify-center w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#0A0118]/80 text-gray-400 hover:text-white hover:bg-brand-accent-light/20 border border-white/10 hover:border-white/20 disabled:opacity-20 disabled:pointer-events-none transition-all duration-200 shrink-0 shadow-lg cursor-pointer hover:scale-105 active:scale-95"
          title="Nächster Spieltag"
          id="spielplan-next-button"
        >
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
        </button>
      </div>
    </div>
  );
}
