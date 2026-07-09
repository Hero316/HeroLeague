import React, { useState, useEffect } from 'react';
import { Play, Check, RotateCcw, Plus, Minus, Pencil } from 'lucide-react';
import { Match, Scorer, Team } from '../types';
import { TeamCrest, shortDate } from './ui';

export function LiveTimer({ liveStartedAt }: { liveStartedAt?: string }) {
  const [minutes, setMinutes] = useState(1);

  useEffect(() => {
    if (!liveStartedAt) {
      // Ohne Start-Zeitstempel einfach hochzählen
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
    <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(255,84,66,.15)] text-hl-red-soft flex items-center gap-1.5 shrink-0">
      <span className="w-[7px] h-[7px] bg-hl-red rounded-full inline-block hl-pulse" />
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
    scorers?: Scorer[]
  ) => void | Promise<unknown>;
  onSelectTeam?: (teamId: string) => void;
}

export default function Spielplan({
  teams,
  matches,
  isAdmin,
  onUpdateMatchScore,
  onSelectTeam,
}: SpielplanProps) {
  const [activeMatchday, setActiveMatchday] = useState<number>(1);
  const [editingScores, setEditingScores] = useState<{
    [matchId: string]: { home: string; away: string };
  }>({});

  // Ref für die horizontale Spieltag-Leiste
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Alle vorhandenen Spieltage (müssen nicht lückenlos sein)
  const matchdays = Array.from(new Set(matches.map((m) => m.matchday))).sort((a, b) => a - b);

  // Falls der aktive Spieltag nicht (mehr) existiert (z.B. nach Saisonwechsel): auf den ersten springen
  useEffect(() => {
    if (matchdays.length > 0 && !matchdays.includes(activeMatchday)) {
      setActiveMatchday(matchdays[0]);
    }
  }, [matchdays, activeMatchday]);

  // Den aktiven Spieltag-Button automatisch in Sicht scrollen
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

  const activeIndex = matchdays.indexOf(activeMatchday);

  const handlePrevMatchday = () => {
    if (activeIndex > 0) setActiveMatchday(matchdays[activeIndex - 1]);
  };

  const handleNextMatchday = () => {
    if (activeIndex < matchdays.length - 1) setActiveMatchday(matchdays[activeIndex + 1]);
  };

  // Lokal gewählte Torschützen/Vorlagengeber während der Ergebniserfassung
  const [matchScorers, setMatchScorers] = useState<{
    [matchId: string]: {
      homeScorers: { playerName: string; assistName: string }[];
      awayScorers: { playerName: string; assistName: string }[];
    };
  }>({});

  const matchdayMatches = matches.filter((m) => m.matchday === activeMatchday);

  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);

  // Torschützen eines Spiels aus den gespeicherten Daten in den lokalen Bearbeitungszustand laden
  const seedScorers = (match: Match) => ({
    homeScorers: (match.scorers || [])
      .filter((s) => s.teamId === match.homeTeamId)
      .map((s) => ({ playerName: s.playerName, assistName: s.assistName || '' })),
    awayScorers: (match.scorers || [])
      .filter((s) => s.teamId === match.awayTeamId)
      .map((s) => ({ playerName: s.playerName, assistName: s.assistName || '' })),
  });

  // Bearbeitung eines Spiels starten (Score + Torschützen aus dem gespeicherten Stand übernehmen)
  const beginEdit = (match: Match) => {
    setEditingScores((prev) =>
      prev[match.id] !== undefined
        ? prev
        : {
            ...prev,
            [match.id]: {
              home: match.homeScore?.toString() ?? '0',
              away: match.awayScore?.toString() ?? '0',
            },
          }
    );
    setMatchScorers((prev) => (prev[match.id] ? prev : { ...prev, [match.id]: seedScorers(match) }));
  };

  // Bearbeitung abbrechen / lokalen Zustand verwerfen
  const cancelEdit = (match: Match) => {
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
  };

  // Liveticker-Kern: Tor +1 / -1, ohne bereits erfasste Torschützen zu verlieren
  const adjustGoals = (match: Match, side: 'home' | 'away', delta: number) => {
    setEditingScores((prev) => {
      const cur = prev[match.id] ?? {
        home: match.homeScore?.toString() ?? '0',
        away: match.awayScore?.toString() ?? '0',
      };
      const curVal = parseInt((side === 'home' ? cur.home : cur.away) || '0', 10) || 0;
      const next = Math.max(0, Math.min(99, curVal + delta));
      return { ...prev, [match.id]: { ...cur, [side]: String(next) } };
    });
    setMatchScorers((prev) => {
      const seeded = prev[match.id] ?? seedScorers(match);
      const arr = side === 'home' ? [...seeded.homeScorers] : [...seeded.awayScorers];
      if (delta > 0) arr.push({ playerName: '', assistName: '' });
      else if (delta < 0 && arr.length > 0) arr.pop();
      return {
        ...prev,
        [match.id]: {
          homeScorers: side === 'home' ? arr : seeded.homeScorers,
          awayScorers: side === 'away' ? arr : seeded.awayScorers,
        },
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

  // Aktuellen Bearbeitungsstand mit gewähltem Status speichern (live = Ticker läuft weiter, beendet = final)
  const saveWithStatus = (match: Match, status: 'live' | 'beendet') => {
    const edit = editingScores[match.id];
    const homeGoals = parseInt(edit?.home ?? String(match.homeScore ?? 0), 10) || 0;
    const awayGoals = parseInt(edit?.away ?? String(match.awayScore ?? 0), 10) || 0;

    const scorers: Scorer[] = [];
    const localScorers = matchScorers[match.id] || seedScorers(match);

    for (let i = 0; i < homeGoals; i++) {
      const pObj = localScorers.homeScorers[i] || { playerName: 'Unbekannt', assistName: '' };
      scorers.push({
        playerName: pObj.playerName || 'Unbekannt',
        teamId: match.homeTeamId,
        assistName: pObj.assistName || undefined,
      });
    }

    for (let i = 0; i < awayGoals; i++) {
      const pObj = localScorers.awayScorers[i] || { playerName: 'Unbekannt', assistName: '' };
      scorers.push({
        playerName: pObj.playerName || 'Unbekannt',
        teamId: match.awayTeamId,
        assistName: pObj.assistName || undefined,
      });
    }

    Promise.resolve(onUpdateMatchScore(match.id, homeGoals, awayGoals, status, scorers)).then(() => {
      // Bei "beendet" den lokalen Bearbeitungsmodus schließen; bei "live" offen lassen zum Weitertickern
      if (status === 'beendet') cancelEdit(match);
    });
  };

  // Beendetes Spiel zurück auf "geplant" setzen
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

  const selectClasses =
    'w-full bg-brand-dark border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

  return (
    <div>
      {matches.length === 0 ? (
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm">
          In dieser Saison sind noch keine Spiele angesetzt.
          {isAdmin && ' Lege im Backoffice unter "Spielplan verwalten" die ersten Spiele an.'}
        </div>
      ) : (
        <>
          {/* Spieltag-Navigation: Pfeile + Pill-Leiste */}
          <div className="flex items-center gap-2.5 mb-6">
            <button
              onClick={handlePrevMatchday}
              disabled={activeIndex <= 0}
              className="w-10 h-10 flex-none rounded-[11px] bg-white/[.04] border border-white/10 text-hl-soft text-lg cursor-pointer transition-colors hover:bg-white/[.09] disabled:opacity-25 disabled:pointer-events-none"
              title="Vorheriger Spieltag"
            >
              ‹
            </button>

            <div ref={scrollContainerRef} className="flex-1 flex items-center gap-2 overflow-x-auto scroll-smooth py-0.5">
              {matchdays.map((day) => (
                <button
                  key={day}
                  data-active={activeMatchday === day}
                  onClick={() => setActiveMatchday(day)}
                  className={`px-[18px] py-[11px] rounded-[11px] font-sans text-[12.5px] tracking-[.8px] whitespace-nowrap cursor-pointer shrink-0 transition-colors ${
                    activeMatchday === day
                      ? 'bg-brand-accent-light text-[#06120f] font-extrabold'
                      : 'bg-white/[.04] border border-white/10 text-hl-mute font-bold hover:text-hl-text'
                  }`}
                >
                  {day}. SPIELTAG
                </button>
              ))}
            </div>

            <button
              onClick={handleNextMatchday}
              disabled={activeIndex >= matchdays.length - 1}
              className="w-10 h-10 flex-none rounded-[11px] bg-white/[.04] border border-white/10 text-hl-soft text-lg cursor-pointer transition-colors hover:bg-white/[.09] disabled:opacity-25 disabled:pointer-events-none"
              title="Nächster Spieltag"
            >
              ›
            </button>
          </div>

          {/* Match-Karten */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {matchdayMatches.map((match) => {
              const home = getTeam(match.homeTeamId);
              const away = getTeam(match.awayTeamId);

              if (!home || !away) return null;

              const isLocalEditing = editingScores[match.id] !== undefined;
              const currentHomeEdit = editingScores[match.id]?.home ?? match.homeScore?.toString() ?? '';
              const currentAwayEdit = editingScores[match.id]?.away ?? match.awayScore?.toString() ?? '';

              const isCompleted = match.status === 'beendet';
              const isLive = match.status === 'live';
              const isUpcoming = !isCompleted && !isLive && match.homeScore === null && !isLocalEditing;

              // Admin darf ein nicht beendetes Spiel direkt bearbeiten (Liveticker); beendete erst nach Klick auf "Bearbeiten"
              const showEditor = isAdmin && (isLocalEditing || !isCompleted);
              const displayHome = isLocalEditing ? currentHomeEdit || '0' : match.homeScore ?? 0;
              const displayAway = isLocalEditing ? currentAwayEdit || '0' : match.awayScore ?? 0;
              const homeGoalsEdit = parseInt(currentHomeEdit || '0', 10) || 0;
              const awayGoalsEdit = parseInt(currentAwayEdit || '0', 10) || 0;

              return (
                <div
                  key={match.id}
                  className={`rounded-2xl px-5 py-[17px] transition-all flex flex-col ${
                    isLive
                      ? 'bg-[linear-gradient(135deg,rgba(34,223,201,.08),rgba(255,255,255,.02))] border border-[rgba(34,223,201,.3)] shadow-[0_0_30px_rgba(34,223,201,.08)]'
                      : 'bg-[linear-gradient(180deg,rgba(255,255,255,.04),rgba(255,255,255,.012))] border border-white/[.09] backdrop-blur-md'
                  }`}
                >
                  {/* Kopf: Datum / Status */}
                  <div className="flex justify-between items-center mb-3.5">
                    <span className="font-sans font-semibold text-[11.5px] tracking-[.8px] text-hl-dim">
                      {shortDate(match.date)} · {match.time} Uhr
                    </span>
                    {isLive ? (
                      <LiveTimer liveStartedAt={match.liveStartedAt ?? undefined} />
                    ) : isCompleted ? (
                      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-white/[.06] text-hl-mute">
                        BEENDET
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(34,223,201,.12)] text-brand-accent-light">
                        ANSTOSS
                      </span>
                    )}
                  </div>

                  {/* Teams + Ergebnis */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3.5">
                    <div className="flex items-center gap-[11px] min-w-0">
                      <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="lg" />
                      {onSelectTeam ? (
                        <button
                          onClick={() => onSelectTeam(home.id)}
                          className="font-sans font-semibold text-[15px] text-hl-text truncate hover:text-brand-accent-light transition-colors cursor-pointer text-left"
                          title={`${home.name} – Vereinsseite öffnen`}
                        >
                          {home.name}
                        </button>
                      ) : (
                        <span className="font-sans font-semibold text-[15px] text-hl-text truncate">{home.name}</span>
                      )}
                    </div>

                    {isUpcoming ? (
                      <div className="min-w-[64px] text-center font-sans font-extrabold text-[15px] tracking-[2px] text-hl-faint">VS</div>
                    ) : (
                      <div
                        className={`min-w-[64px] text-center font-display font-black text-3xl leading-none ${
                          isLive || (isLocalEditing && !isCompleted) ? 'text-brand-accent-light' : 'text-white'
                        }`}
                      >
                        {displayHome} : {displayAway}
                      </div>
                    )}

                    <div className="flex items-center gap-[11px] justify-end min-w-0">
                      {onSelectTeam ? (
                        <button
                          onClick={() => onSelectTeam(away.id)}
                          className="font-sans font-semibold text-[15px] text-hl-text truncate hover:text-brand-accent-light transition-colors cursor-pointer text-right"
                          title={`${away.name} – Vereinsseite öffnen`}
                        >
                          {away.name}
                        </button>
                      ) : (
                        <span className="font-sans font-semibold text-[15px] text-hl-text truncate text-right">{away.name}</span>
                      )}
                      <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="lg" />
                    </div>
                  </div>

                  {/* Torschützen bei beendeten Spielen */}
                  {isCompleted && match.scorers && match.scorers.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-white/[.06] text-xs font-sans">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-right space-y-1">
                          {match.scorers
                            .filter(s => s.teamId === match.homeTeamId)
                            .map((s, idx) => (
                              <div key={idx} className="truncate text-hl-soft">
                                <span className="font-semibold text-hl-text">{s.playerName}</span>
                                {s.assistName && (
                                  <span className="text-[10px] text-hl-dim ml-1 italic">(Vorlage: {s.assistName})</span>
                                )}
                                <span className="text-brand-accent-light text-[10px] ml-1.5">⚽</span>
                              </div>
                            ))}
                        </div>
                        <div className="text-left space-y-1">
                          {match.scorers
                            .filter(s => s.teamId === match.awayTeamId)
                            .map((s, idx) => (
                              <div key={idx} className="truncate text-hl-soft">
                                <span className="text-brand-accent-light text-[10px] mr-1.5">⚽</span>
                                <span className="font-semibold text-hl-text">{s.playerName}</span>
                                {s.assistName && (
                                  <span className="text-[10px] text-hl-dim ml-1 italic">(Vorlage: {s.assistName})</span>
                                )}
                              </div>
                            ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Erfassungs-Panel (Admin) – Liveticker mit +/- Steppern */}
                  {showEditor && (
                    <div className="mt-4 p-4 bg-[rgba(34,223,201,.04)] rounded-xl border border-white/10 space-y-4">
                      <h4 className="text-xs font-sans text-brand-accent-light uppercase tracking-wider font-bold flex items-center gap-1.5">
                        <span>⚽</span> Tore erfassen &amp; Torschützen zuweisen
                      </h4>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                        {/* Heim-Tore */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                            <span className="text-xs font-semibold text-white truncate">Tore für {home.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => adjustGoals(match, 'home', -1)}
                                disabled={homeGoalsEdit <= 0}
                                className="w-6 h-6 rounded-md bg-brand-dark border border-white/15 text-hl-soft hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center cursor-pointer"
                                aria-label="Tor abziehen"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-display font-black text-white text-base">{homeGoalsEdit}</span>
                              <button
                                type="button"
                                onClick={() => adjustGoals(match, 'home', 1)}
                                className="w-6 h-6 rounded-md bg-[rgba(34,223,201,.2)] border border-[rgba(34,223,201,.4)] text-brand-accent-light hover:bg-[rgba(34,223,201,.3)] flex items-center justify-center cursor-pointer"
                                aria-label="Tor hinzufügen"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {Array.from({ length: homeGoalsEdit }).map((_, i) => {
                            const selectedScorerObj = matchScorers[match.id]?.homeScorers[i] || { playerName: '', assistName: '' };
                            return (
                              <div key={`home-scorer-${i}`} className="p-2.5 bg-brand-dark/60 border border-white/5 rounded-lg space-y-1.5">
                                <div className="text-[10px] font-sans font-semibold text-hl-dim">Tor {i + 1}:</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] text-hl-faint font-sans mb-0.5 uppercase tracking-wider">Torschütze</label>
                                    <select
                                      value={selectedScorerObj.playerName}
                                      onChange={(e) => handleScorerSelect(match.id, 'home', i, 'playerName', e.target.value)}
                                      className={selectClasses}
                                    >
                                      <option value="">-- Wählen --</option>
                                      {home.spielerliste && home.spielerliste.map((p) => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                      ))}
                                      <option value="Eigentor">Eigentor (O.G.)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] text-hl-faint font-sans mb-0.5 uppercase tracking-wider">Assist (Vorlage)</label>
                                    <select
                                      value={selectedScorerObj.assistName}
                                      disabled={selectedScorerObj.playerName === 'Eigentor' || !selectedScorerObj.playerName}
                                      onChange={(e) => handleScorerSelect(match.id, 'home', i, 'assistName', e.target.value)}
                                      className={selectClasses}
                                    >
                                      <option value="">-- Kein Assist --</option>
                                      {home.spielerliste && home.spielerliste
                                        .filter(p => p.name !== selectedScorerObj.playerName)
                                        .map((p) => (
                                          <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {homeGoalsEdit === 0 && (
                            <div className="text-[10px] text-hl-faint font-sans italic">Noch keine Tore. Mit + ein Tor hinzufügen.</div>
                          )}
                        </div>

                        {/* Auswärts-Tore */}
                        <div className="space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                            <span className="text-xs font-semibold text-white truncate">Tore für {away.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => adjustGoals(match, 'away', -1)}
                                disabled={awayGoalsEdit <= 0}
                                className="w-6 h-6 rounded-md bg-brand-dark border border-white/15 text-hl-soft hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center cursor-pointer"
                                aria-label="Tor abziehen"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-display font-black text-white text-base">{awayGoalsEdit}</span>
                              <button
                                type="button"
                                onClick={() => adjustGoals(match, 'away', 1)}
                                className="w-6 h-6 rounded-md bg-[rgba(34,223,201,.2)] border border-[rgba(34,223,201,.4)] text-brand-accent-light hover:bg-[rgba(34,223,201,.3)] flex items-center justify-center cursor-pointer"
                                aria-label="Tor hinzufügen"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {Array.from({ length: awayGoalsEdit }).map((_, i) => {
                            const selectedScorerObj = matchScorers[match.id]?.awayScorers[i] || { playerName: '', assistName: '' };
                            return (
                              <div key={`away-scorer-${i}`} className="p-2.5 bg-brand-dark/60 border border-white/5 rounded-lg space-y-1.5">
                                <div className="text-[10px] font-sans font-semibold text-hl-dim">Tor {i + 1}:</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] text-hl-faint font-sans mb-0.5 uppercase tracking-wider">Torschütze</label>
                                    <select
                                      value={selectedScorerObj.playerName}
                                      onChange={(e) => handleScorerSelect(match.id, 'away', i, 'playerName', e.target.value)}
                                      className={selectClasses}
                                    >
                                      <option value="">-- Wählen --</option>
                                      {away.spielerliste && away.spielerliste.map((p) => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                      ))}
                                      <option value="Eigentor">Eigentor (O.G.)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] text-hl-faint font-sans mb-0.5 uppercase tracking-wider">Assist (Vorlage)</label>
                                    <select
                                      value={selectedScorerObj.assistName}
                                      disabled={selectedScorerObj.playerName === 'Eigentor' || !selectedScorerObj.playerName}
                                      onChange={(e) => handleScorerSelect(match.id, 'away', i, 'assistName', e.target.value)}
                                      className={selectClasses}
                                    >
                                      <option value="">-- Kein Assist --</option>
                                      {away.spielerliste && away.spielerliste
                                        .filter(p => p.name !== selectedScorerObj.playerName)
                                        .map((p) => (
                                          <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {awayGoalsEdit === 0 && (
                            <div className="text-[10px] text-hl-faint font-sans italic">Noch keine Tore. Mit + ein Tor hinzufügen.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin-Aktionsleiste */}
                  {isAdmin && (
                    <div className="mt-3 pt-3 border-t border-white/5 flex flex-wrap justify-end items-center gap-2">
                      {isCompleted && !isLocalEditing ? (
                        <>
                          <button
                            onClick={() => beginEdit(match)}
                            className="flex items-center space-x-1 text-[11px] font-sans font-semibold text-hl-soft hover:text-white bg-white/5 border border-white/10 px-2.5 py-1 rounded-md cursor-pointer"
                          >
                            <Pencil className="w-3 h-3" />
                            <span>Ergebnis bearbeiten</span>
                          </button>
                          <button
                            onClick={() => handleResetMatch(match.id)}
                            className="flex items-center space-x-1 text-[11px] font-sans font-semibold text-hl-red-soft hover:text-white bg-[rgba(255,84,66,.1)] border border-[rgba(255,84,66,.2)] px-2.5 py-1 rounded-md cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Zurücksetzen</span>
                          </button>
                        </>
                      ) : (
                        <>
                          {/* LIVE setzen / aktualisieren – speichert den aktuellen Ticker-Stand */}
                          {!isCompleted && (
                            <button
                              onClick={() => saveWithStatus(match, 'live')}
                              className={`flex items-center space-x-1 text-[11px] font-sans font-semibold px-2.5 py-1 rounded-md cursor-pointer transition-all ${
                                isLive
                                  ? 'bg-[rgba(255,84,66,.2)] text-hl-red-soft border border-[rgba(255,84,66,.3)] font-bold'
                                  : 'bg-white/5 text-hl-soft border border-white/10 hover:bg-white/10'
                              }`}
                            >
                              <Play className="w-3 h-3" />
                              <span>{isLive ? 'LIVE aktualisieren' : 'LIVE setzen'}</span>
                            </button>
                          )}
                          {isLocalEditing && (
                            <button
                              type="button"
                              onClick={() => cancelEdit(match)}
                              className="text-[11px] font-sans font-semibold text-hl-dim hover:text-hl-soft px-2 py-1 cursor-pointer"
                            >
                              Abbrechen
                            </button>
                          )}
                          <button
                            onClick={() => saveWithStatus(match, 'beendet')}
                            className="flex items-center space-x-1 text-[11px] font-sans font-bold text-hl-green-soft hover:text-white bg-[rgba(67,229,160,.15)] border border-[rgba(67,229,160,.3)] px-3 py-1 rounded-md cursor-pointer"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>{isCompleted ? 'Änderungen speichern' : 'Spiel beenden'}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
