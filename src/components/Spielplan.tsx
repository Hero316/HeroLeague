import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Play, Check, RotateCcw, Plus, Minus, Pencil, Save, AlertTriangle, Users, X, Star, Hand } from 'lucide-react';
import { Absence, BestPlayer, Goalkeeper, Match, Scorer, Team } from '../types';
import { TeamCrest, shortDate, useLiveMinute } from './ui';

export function LiveTimer({ liveStartedAt }: { liveStartedAt?: string | null }) {
  const minutes = useLiveMinute(liveStartedAt);

  return (
    <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(255,84,66,.15)] text-hl-red-soft flex items-center gap-1.5 shrink-0">
      <span className="w-[7px] h-[7px] bg-hl-red rounded-full inline-block hl-pulse" />
      <span>LIVE{minutes ? ` ${minutes}'` : ''}</span>
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
    scorers?: Scorer[],
    absentees?: Absence[],
    bestPlayers?: BestPlayer[],
    goalkeepers?: Goalkeeper[]
  ) => void | Promise<unknown>;
  onUpdateMatchMeta?: (
    matchId: string,
    data: { matchday: number; date: string; time: string; homeTeamId: string; awayTeamId: string; venue: string }
  ) => void | Promise<unknown>;
  onSelectTeam?: (teamId: string) => void;
}

export default function Spielplan({
  teams,
  matches,
  isAdmin,
  onUpdateMatchScore,
  onUpdateMatchMeta,
  onSelectTeam,
}: SpielplanProps) {
  const [activeMatchday, setActiveMatchday] = useState<number>(1);
  const [editingScores, setEditingScores] = useState<{
    [matchId: string]: { home: string; away: string };
  }>({});

  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  const matchdays = Array.from(new Set(matches.map((m) => m.matchday))).sort((a, b) => a - b);

  useEffect(() => {
    if (matchdays.length > 0 && !matchdays.includes(activeMatchday)) {
      setActiveMatchday(matchdays[0]);
    }
  }, [matchdays, activeMatchday]);

  useEffect(() => {
    if (scrollContainerRef.current) {
      const activeBtn = scrollContainerRef.current.querySelector('[data-active="true"]');
      if (activeBtn) {
        activeBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
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

  // Lokal gewählte Abwesende (Kaderspieler, die nicht mitgespielt haben) je Spiel
  const [matchAbsentees, setMatchAbsentees] = useState<{
    [matchId: string]: { homeAbsent: string[]; awayAbsent: string[] };
  }>({});

  // Lokal gewählter bester Spieler je Team (Spielername oder '') je Spiel
  const [matchBestPlayers, setMatchBestPlayers] = useState<{
    [matchId: string]: { home: string; away: string };
  }>({});

  // Lokal gewählter Torwart je Team (Spielername oder '') je Spiel
  const [matchGoalkeepers, setMatchGoalkeepers] = useState<{
    [matchId: string]: { home: string; away: string };
  }>({});

  const [savedFlash, setSavedFlash] = useState<{ [matchId: string]: boolean }>({});
  const [resetTarget, setResetTarget] = useState<Match | null>(null);

  // Aktuell im Verwalten-Popup geöffnetes Spiel + Entwurf der Spieldaten (Metadaten)
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    matchday: string;
    date: string;
    time: string;
    homeTeamId: string;
    awayTeamId: string;
    venue: string;
  } | null>(null);
  const [metaSaved, setMetaSaved] = useState(false);

  const flashSaved = (matchId: string) => {
    setSavedFlash((prev) => ({ ...prev, [matchId]: true }));
    setTimeout(() => {
      setSavedFlash((prev) => {
        const updated = { ...prev };
        delete updated[matchId];
        return updated;
      });
    }, 2500);
  };

  const matchdayMatches = matches.filter((m) => m.matchday === activeMatchday);
  const getTeam = (teamId: string) => teams.find((t) => t.id === teamId);
  const openMatch = openMatchId ? matches.find((m) => m.id === openMatchId) ?? null : null;

  // Torschützen eines Spiels aus den gespeicherten Daten in den lokalen Bearbeitungszustand laden
  const seedScorers = (match: Match) => ({
    homeScorers: (match.scorers || [])
      .filter((s) => s.teamId === match.homeTeamId)
      .map((s) => ({ playerName: s.playerName, assistName: s.assistName || '' })),
    awayScorers: (match.scorers || [])
      .filter((s) => s.teamId === match.awayTeamId)
      .map((s) => ({ playerName: s.playerName, assistName: s.assistName || '' })),
  });

  // Abwesende eines Spiels aus den gespeicherten Daten laden
  const seedAbsentees = (match: Match) => ({
    homeAbsent: (match.absentees || []).filter((a) => a.teamId === match.homeTeamId).map((a) => a.playerName),
    awayAbsent: (match.absentees || []).filter((a) => a.teamId === match.awayTeamId).map((a) => a.playerName),
  });

  // Besten Spieler je Team aus den gespeicherten Daten laden
  const seedBestPlayers = (match: Match) => ({
    home: (match.bestPlayers || []).find((b) => b.teamId === match.homeTeamId)?.playerName ?? '',
    away: (match.bestPlayers || []).find((b) => b.teamId === match.awayTeamId)?.playerName ?? '',
  });

  // Reihenfolge der Spiele (wie in der DB): Spieltag, Datum, Uhrzeit, ID
  const cmpMatches = (a: Match, b: Match) =>
    a.matchday - b.matchday || a.date.localeCompare(b.date) || a.time.localeCompare(b.time) || a.id.localeCompare(b.id);

  // Torwart eines Teams aus dem letzten FRÜHEREN Spiel übernehmen (Vorschlag für neue Spiele).
  // Nur aus Spielen, die vor diesem liegen – so ändert ein späteres Spiel nie die Wertung früherer.
  const carriedGoalkeeper = (teamId: string, match: Match): string => {
    const earlier = matches
      .filter((m) => (m.homeTeamId === teamId || m.awayTeamId === teamId) && cmpMatches(m, match) < 0)
      .filter((m) => (m.goalkeepers || []).some((g) => g.teamId === teamId))
      .sort(cmpMatches);
    const last = earlier[earlier.length - 1];
    return last ? (last.goalkeepers || []).find((g) => g.teamId === teamId)?.playerName ?? '' : '';
  };

  // Torwart je Team laden: gespeicherter Wert des Spiels, sonst Übernahme aus dem letzten früheren Spiel
  const seedGoalkeepers = (match: Match) => ({
    home:
      (match.goalkeepers || []).find((g) => g.teamId === match.homeTeamId)?.playerName ??
      carriedGoalkeeper(match.homeTeamId, match),
    away:
      (match.goalkeepers || []).find((g) => g.teamId === match.awayTeamId)?.playerName ??
      carriedGoalkeeper(match.awayTeamId, match),
  });

  // Solange das Popup offen ist, den lokalen Zustand aus den DB-Daten vorhalten
  // (auch nach automatischem Nachladen während eines Live-Spiels).
  useEffect(() => {
    if (!openMatch || !isAdmin) return;
    if (matchScorers[openMatch.id] === undefined) {
      setMatchScorers((prev) => (prev[openMatch.id] === undefined ? { ...prev, [openMatch.id]: seedScorers(openMatch) } : prev));
    }
    if (matchAbsentees[openMatch.id] === undefined) {
      setMatchAbsentees((prev) => (prev[openMatch.id] === undefined ? { ...prev, [openMatch.id]: seedAbsentees(openMatch) } : prev));
    }
    if (matchBestPlayers[openMatch.id] === undefined) {
      setMatchBestPlayers((prev) => (prev[openMatch.id] === undefined ? { ...prev, [openMatch.id]: seedBestPlayers(openMatch) } : prev));
    }
    if (matchGoalkeepers[openMatch.id] === undefined) {
      setMatchGoalkeepers((prev) => (prev[openMatch.id] === undefined ? { ...prev, [openMatch.id]: seedGoalkeepers(openMatch) } : prev));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openMatch, isAdmin, matchScorers, matchAbsentees, matchBestPlayers, matchGoalkeepers]);

  const toggleAbsent = (match: Match, side: 'home' | 'away', playerName: string) => {
    setMatchAbsentees((prev) => {
      const cur = prev[match.id] ?? seedAbsentees(match);
      const list = side === 'home' ? cur.homeAbsent : cur.awayAbsent;
      const nextList = list.includes(playerName) ? list.filter((n) => n !== playerName) : [...list, playerName];
      return {
        ...prev,
        [match.id]: {
          homeAbsent: side === 'home' ? nextList : cur.homeAbsent,
          awayAbsent: side === 'away' ? nextList : cur.awayAbsent,
        },
      };
    });
  };

  // Besten Spieler eines Teams setzen (leer = keiner)
  const setBestPlayer = (match: Match, side: 'home' | 'away', playerName: string) => {
    setMatchBestPlayers((prev) => {
      const cur = prev[match.id] ?? seedBestPlayers(match);
      return { ...prev, [match.id]: { ...cur, [side]: playerName } };
    });
  };

  // Torwart eines Teams setzen (leer = keiner)
  const setGoalkeeper = (match: Match, side: 'home' | 'away', playerName: string) => {
    setMatchGoalkeepers((prev) => {
      const cur = prev[match.id] ?? seedGoalkeepers(match);
      return { ...prev, [match.id]: { ...cur, [side]: playerName } };
    });
  };

  // Lokalen Bearbeitungszustand eines Spiels verwerfen
  const clearLocal = (matchId: string) => {
    setEditingScores((prev) => {
      const u = { ...prev };
      delete u[matchId];
      return u;
    });
    setMatchScorers((prev) => {
      const u = { ...prev };
      delete u[matchId];
      return u;
    });
    setMatchAbsentees((prev) => {
      const u = { ...prev };
      delete u[matchId];
      return u;
    });
    setMatchBestPlayers((prev) => {
      const u = { ...prev };
      delete u[matchId];
      return u;
    });
    setMatchGoalkeepers((prev) => {
      const u = { ...prev };
      delete u[matchId];
      return u;
    });
  };

  // Verwalten-Popup öffnen: Spieldaten + Torschützen/Abwesende aus dem Speicherstand laden
  const openManage = (match: Match) => {
    setOpenMatchId(match.id);
    // Ort gilt pro Spieltag: fehlt er am Spiel, den bereits am Spieltag hinterlegten Ort vorschlagen
    const matchdayVenue = matches.find((m) => m.matchday === match.matchday && m.venue && m.venue.trim())?.venue?.trim() || '';
    setMeta({
      matchday: String(match.matchday),
      date: match.date,
      time: match.time,
      homeTeamId: match.homeTeamId,
      awayTeamId: match.awayTeamId,
      venue: (match.venue && match.venue.trim()) || matchdayVenue,
    });
    setMatchScorers((prev) => (prev[match.id] ? prev : { ...prev, [match.id]: seedScorers(match) }));
    setMatchAbsentees((prev) => (prev[match.id] ? prev : { ...prev, [match.id]: seedAbsentees(match) }));
    setMatchBestPlayers((prev) => (prev[match.id] ? prev : { ...prev, [match.id]: seedBestPlayers(match) }));
    setMatchGoalkeepers((prev) => (prev[match.id] ? prev : { ...prev, [match.id]: seedGoalkeepers(match) }));
    setMetaSaved(false);
  };

  const closeManage = () => {
    if (openMatchId) clearLocal(openMatchId);
    setOpenMatchId(null);
    setMeta(null);
    setMetaSaved(false);
  };

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
      const match = matches.find((m) => m.id === matchId);
      const current = prev[matchId] || (match ? seedScorers(match) : { homeScorers: [], awayScorers: [] });
      const updated = side === 'home' ? [...current.homeScorers] : [...current.awayScorers];
      if (!updated[index]) updated[index] = { playerName: '', assistName: '' };
      updated[index] = { ...updated[index], [field]: value };
      return {
        ...prev,
        [matchId]: {
          homeScorers: side === 'home' ? updated : current.homeScorers,
          awayScorers: side === 'away' ? updated : current.awayScorers,
        },
      };
    });
  };

  // Aktuellen Bearbeitungsstand speichern (beliebig oft während eines Live-Spiels).
  const commit = (match: Match, status: 'live' | 'beendet', opts?: { flash?: boolean }) => {
    const edit = editingScores[match.id];
    const homeGoals = parseInt(edit?.home ?? String(match.homeScore ?? 0), 10) || 0;
    const awayGoals = parseInt(edit?.away ?? String(match.awayScore ?? 0), 10) || 0;

    const scorers: Scorer[] = [];
    const localScorers = matchScorers[match.id] || seedScorers(match);
    for (let i = 0; i < homeGoals; i++) {
      const pObj = localScorers.homeScorers[i] || { playerName: 'Unbekannt', assistName: '' };
      scorers.push({ playerName: pObj.playerName || 'Unbekannt', teamId: match.homeTeamId, assistName: pObj.assistName || undefined });
    }
    for (let i = 0; i < awayGoals; i++) {
      const pObj = localScorers.awayScorers[i] || { playerName: 'Unbekannt', assistName: '' };
      scorers.push({ playerName: pObj.playerName || 'Unbekannt', teamId: match.awayTeamId, assistName: pObj.assistName || undefined });
    }

    const localAbsent = matchAbsentees[match.id] || seedAbsentees(match);
    const homeRoster = new Set((getTeam(match.homeTeamId)?.spielerliste || []).map((p) => p.name));
    const awayRoster = new Set((getTeam(match.awayTeamId)?.spielerliste || []).map((p) => p.name));
    const absentees: Absence[] = [
      ...localAbsent.homeAbsent.filter((n) => homeRoster.has(n)).map((n) => ({ playerName: n, teamId: match.homeTeamId })),
      ...localAbsent.awayAbsent.filter((n) => awayRoster.has(n)).map((n) => ({ playerName: n, teamId: match.awayTeamId })),
    ];

    // Besten Spieler je Team (nur gültige Kaderspieler; leere Auswahl weglassen)
    const localBest = matchBestPlayers[match.id] || seedBestPlayers(match);
    const bestPlayers: BestPlayer[] = [];
    if (localBest.home && homeRoster.has(localBest.home)) {
      bestPlayers.push({ playerName: localBest.home, teamId: match.homeTeamId });
    }
    if (localBest.away && awayRoster.has(localBest.away)) {
      bestPlayers.push({ playerName: localBest.away, teamId: match.awayTeamId });
    }

    // Torwart je Team (nur gültige Kaderspieler; leere Auswahl weglassen)
    const localGk = matchGoalkeepers[match.id] || seedGoalkeepers(match);
    const goalkeepers: Goalkeeper[] = [];
    if (localGk.home && homeRoster.has(localGk.home)) {
      goalkeepers.push({ playerName: localGk.home, teamId: match.homeTeamId });
    }
    if (localGk.away && awayRoster.has(localGk.away)) {
      goalkeepers.push({ playerName: localGk.away, teamId: match.awayTeamId });
    }

    return Promise.resolve(
      onUpdateMatchScore(match.id, homeGoals, awayGoals, status, scorers, absentees, bestPlayers, goalkeepers)
    ).then(() => {
      if (opts?.flash) flashSaved(match.id);
    });
  };

  const finishMatch = (match: Match) => {
    Promise.resolve(commit(match, 'beendet')).then(() => closeManage());
  };

  const handleResetMatch = (matchId: string) => {
    onUpdateMatchScore(matchId, null, null, 'geplant', [], [], [], []);
    clearLocal(matchId);
  };

  const saveMeta = async () => {
    if (!openMatch || !meta || !onUpdateMatchMeta) return;
    const day = parseInt(meta.matchday, 10);
    if (!day || day < 1) return alert('Bitte einen gültigen Spieltag angeben.');
    if (!meta.homeTeamId || !meta.awayTeamId) return alert('Bitte Heim- und Auswärtsteam wählen.');
    if (meta.homeTeamId === meta.awayTeamId) return alert('Ein Team kann nicht gegen sich selbst spielen.');
    if (!meta.date) return alert('Bitte ein Datum wählen.');
    if (!meta.time) return alert('Bitte eine Uhrzeit wählen.');
    const ok = await onUpdateMatchMeta(openMatch.id, {
      matchday: day,
      date: meta.date,
      time: meta.time,
      homeTeamId: meta.homeTeamId,
      awayTeamId: meta.awayTeamId,
      venue: meta.venue.trim(),
    });
    if (ok !== false) {
      // Bei Team-Wechsel wurden Torschützen/Abwesende serverseitig verworfen → lokal neu laden
      clearLocal(openMatch.id);
      setMetaSaved(true);
      setTimeout(() => setMetaSaved(false), 2500);
    }
  };

  const selectClasses =
    'w-full bg-brand-dark border border-white/10 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-brand-accent-light cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';
  const metaField =
    'w-full bg-brand-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-accent-light [color-scheme:dark]';

  const resetHome = resetTarget ? getTeam(resetTarget.homeTeamId) : null;
  const resetAway = resetTarget ? getTeam(resetTarget.awayTeamId) : null;

  // Editor-Ableitungen für das offene Spiel
  const oHome = openMatch ? getTeam(openMatch.homeTeamId) : null;
  const oAway = openMatch ? getTeam(openMatch.awayTeamId) : null;
  const oCompleted = openMatch?.status === 'beendet';
  const oLive = openMatch?.status === 'live';
  const oHomeGoals = openMatch
    ? parseInt(editingScores[openMatch.id]?.home ?? String(openMatch.homeScore ?? 0), 10) || 0
    : 0;
  const oAwayGoals = openMatch
    ? parseInt(editingScores[openMatch.id]?.away ?? String(openMatch.awayScore ?? 0), 10) || 0
    : 0;

  return (
    <div>
      {/* Bestätigungs-Popup: beendetes Spiel zurücksetzen */}
      <AnimatePresence>
        {resetTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setResetTarget(null)}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-md bg-[#130B24] border-2 border-[rgba(255,84,66,.35)] rounded-2xl p-6 sm:p-8 shadow-2xl overflow-hidden"
            >
              <div className="absolute top-0 left-0 right-0 h-1 bg-hl-red" />
              <div className="flex items-center gap-3 text-hl-red-soft mb-4">
                <AlertTriangle className="w-7 h-7 shrink-0" />
                <h3 className="font-display font-black text-lg sm:text-xl uppercase tracking-tight">Ergebnis zurücksetzen?</h3>
              </div>
              <p className="text-xs text-gray-300 font-sans leading-relaxed mb-6">
                Das Spiel{' '}
                <strong className="text-white">
                  {resetHome?.name ?? '?'} {resetTarget.homeScore ?? 0}:{resetTarget.awayScore ?? 0} {resetAway?.name ?? '?'}
                </strong>{' '}
                wird auf <strong className="text-white">„geplant"</strong> zurückgesetzt. Das eingetragene Ergebnis und alle
                Torschützen gehen dabei verloren, und die Tabelle wird neu berechnet. Das kann nicht rückgängig gemacht werden.
              </p>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="flex-1 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-xs font-bold uppercase text-gray-300 transition-all cursor-pointer"
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    handleResetMatch(resetTarget.id);
                    setResetTarget(null);
                  }}
                  className="flex-1 py-3 bg-hl-red hover:bg-[rgba(255,84,66,.85)] text-white font-bold uppercase rounded-xl text-xs tracking-wider transition-all cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>Ja, zurücksetzen</span>
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Verwalten-Popup für ein einzelnes Spiel */}
      <AnimatePresence>
        {openMatch && oHome && oAway && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={closeManage}
            className="fixed inset-0 z-[60] flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md overflow-y-auto"
          >
            <motion.div
              initial={{ scale: 0.97, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.97, y: 15 }}
              onClick={(e) => e.stopPropagation()}
              className="relative w-full max-w-2xl my-4 bg-[#0c1413] border border-white/12 rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto"
            >
              {/* Kopf */}
              <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 py-4 bg-[#0c1413]/95 backdrop-blur border-b border-white/10">
                <div className="flex items-center gap-2 min-w-0">
                  <TeamCrest name={oHome.name} shortName={oHome.shortName} color={oHome.logoColor} logoUrl={oHome.logoUrl} size="sm" />
                  <span className="font-display font-black text-sm sm:text-base text-white uppercase tracking-tight truncate">
                    {oHome.name} <span className="text-hl-faint">vs</span> {oAway.name}
                  </span>
                  <TeamCrest name={oAway.name} shortName={oAway.shortName} color={oAway.logoColor} logoUrl={oAway.logoUrl} size="sm" />
                </div>
                <button
                  type="button"
                  onClick={closeManage}
                  className="shrink-0 p-1.5 text-hl-mute hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                  title="Schließen"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-6">
                {/* Spieldaten (Metadaten) */}
                {onUpdateMatchMeta && meta && (
                  <div className="bg-[rgba(255,255,255,.02)] border border-white/[.07] rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-sans text-brand-accent-light uppercase tracking-wider font-bold">
                      <Pencil className="w-3.5 h-3.5" /> Spieldaten
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] text-hl-faint font-sans mb-1 uppercase tracking-wider">Spieltag</label>
                        <input
                          type="number"
                          min={1}
                          max={99}
                          value={meta.matchday}
                          onChange={(e) => setMeta({ ...meta, matchday: e.target.value })}
                          className={metaField}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-hl-faint font-sans mb-1 uppercase tracking-wider">Datum</label>
                        <input type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} className={metaField} />
                      </div>
                      <div>
                        <label className="block text-[10px] text-hl-faint font-sans mb-1 uppercase tracking-wider">Uhrzeit</label>
                        <input type="time" value={meta.time} onChange={(e) => setMeta({ ...meta, time: e.target.value })} className={metaField} />
                      </div>
                      <div className="flex items-end">
                        <div className="flex items-center gap-2">
                          {metaSaved && <span className="text-[11px] text-hl-green-soft font-sans font-bold">✓</span>}
                          <button
                            type="button"
                            onClick={saveMeta}
                            className="px-3 py-2 bg-white/[.06] hover:bg-white/[.12] border border-white/10 rounded-lg text-[11px] font-sans font-bold text-white uppercase tracking-wider transition-colors cursor-pointer whitespace-nowrap"
                          >
                            Speichern
                          </button>
                        </div>
                      </div>
                      <div>
                        <label className="block text-[10px] text-hl-faint font-sans mb-1 uppercase tracking-wider">Heim</label>
                        <select value={meta.homeTeamId} onChange={(e) => setMeta({ ...meta, homeTeamId: e.target.value })} className={metaField + ' cursor-pointer'}>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id} disabled={t.id === meta.awayTeamId}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-hl-faint font-sans mb-1 uppercase tracking-wider">Auswärts</label>
                        <select value={meta.awayTeamId} onChange={(e) => setMeta({ ...meta, awayTeamId: e.target.value })} className={metaField + ' cursor-pointer'}>
                          {teams.map((t) => (
                            <option key={t.id} value={t.id} disabled={t.id === meta.homeTeamId}>
                              {t.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-2 sm:col-span-4">
                        <label className="block text-[10px] text-hl-faint font-sans mb-1 uppercase tracking-wider">Spielort (Halle)</label>
                        <input
                          type="text"
                          value={meta.venue}
                          onChange={(e) => setMeta({ ...meta, venue: e.target.value })}
                          placeholder="z.B. Halle Königsfeld"
                          className={metaField}
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-hl-faint font-sans">
                      Änderst du die Teams eines bereits gespielten Spiels, werden dessen Torschützen zurückgesetzt.
                    </p>
                  </div>
                )}

                {/* Ergebnis & Live */}
                <div className="bg-[rgba(34,223,201,.04)] rounded-xl border border-white/10 p-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-xs font-sans text-brand-accent-light uppercase tracking-wider font-bold flex items-center gap-1.5">
                      <span>⚽</span> Ergebnis &amp; Torschützen
                    </h4>
                    {oLive ? (
                      <LiveTimer liveStartedAt={openMatch.liveStartedAt ?? undefined} />
                    ) : oCompleted ? (
                      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-white/[.06] text-hl-mute">BEENDET</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(34,223,201,.12)] text-brand-accent-light">ANSTOSS</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {(['home', 'away'] as const).map((side) => {
                      const team = side === 'home' ? oHome : oAway;
                      const goals = side === 'home' ? oHomeGoals : oAwayGoals;
                      return (
                        <div key={side} className="space-y-3">
                          <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-2">
                            <span className="text-xs font-semibold text-white truncate">Tore für {team.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <button
                                type="button"
                                onClick={() => adjustGoals(openMatch, side, -1)}
                                disabled={goals <= 0}
                                className="w-6 h-6 rounded-md bg-brand-dark border border-white/15 text-hl-soft hover:text-white hover:border-white/30 disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center cursor-pointer"
                                aria-label="Tor abziehen"
                              >
                                <Minus className="w-3.5 h-3.5" />
                              </button>
                              <span className="w-6 text-center font-display font-black text-white text-base">{goals}</span>
                              <button
                                type="button"
                                onClick={() => adjustGoals(openMatch, side, 1)}
                                className="w-6 h-6 rounded-md bg-[rgba(34,223,201,.2)] border border-[rgba(34,223,201,.4)] text-brand-accent-light hover:bg-[rgba(34,223,201,.3)] flex items-center justify-center cursor-pointer"
                                aria-label="Tor hinzufügen"
                              >
                                <Plus className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                          {Array.from({ length: goals }).map((_, i) => {
                            const list = side === 'home' ? matchScorers[openMatch.id]?.homeScorers : matchScorers[openMatch.id]?.awayScorers;
                            const selected = list?.[i] || { playerName: '', assistName: '' };
                            return (
                              <div key={`${side}-scorer-${i}`} className="p-2.5 bg-brand-dark/60 border border-white/5 rounded-lg space-y-1.5">
                                <div className="text-[10px] font-sans font-semibold text-hl-dim">Tor {i + 1}:</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[9px] text-hl-faint font-sans mb-0.5 uppercase tracking-wider">Torschütze</label>
                                    <select
                                      value={selected.playerName}
                                      onChange={(e) => handleScorerSelect(openMatch.id, side, i, 'playerName', e.target.value)}
                                      className={selectClasses}
                                    >
                                      <option value="">-- Wählen --</option>
                                      {(team.spielerliste || []).map((p) => (
                                        <option key={p.name} value={p.name}>{p.name}</option>
                                      ))}
                                      <option value="Eigentor">Eigentor (O.G.)</option>
                                    </select>
                                  </div>
                                  <div>
                                    <label className="block text-[9px] text-hl-faint font-sans mb-0.5 uppercase tracking-wider">Assist (Vorlage)</label>
                                    <select
                                      value={selected.assistName}
                                      disabled={selected.playerName === 'Eigentor' || !selected.playerName}
                                      onChange={(e) => handleScorerSelect(openMatch.id, side, i, 'assistName', e.target.value)}
                                      className={selectClasses}
                                    >
                                      <option value="">-- Kein Assist --</option>
                                      {(team.spielerliste || [])
                                        .filter((p) => p.name !== selected.playerName)
                                        .map((p) => (
                                          <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          {goals === 0 && (
                            <div className="text-[10px] text-hl-faint font-sans italic">Noch keine Tore. Mit + ein Tor hinzufügen.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Anwesenheit */}
                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-sans text-brand-accent-light uppercase tracking-wider font-bold">
                      <Users className="w-3.5 h-3.5" />
                      <span>Anwesenheit</span>
                    </div>
                    <p className="text-[10px] text-hl-faint font-sans -mt-1.5 leading-relaxed">
                      Standardmäßig zählt jeder Kaderspieler als eingesetzt. Tippe die Spieler an, die
                      <strong className="text-hl-soft"> nicht mitgespielt</strong> haben – sie werden nicht als Einsatz gewertet.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {([['home', oHome], ['away', oAway]] as const).map(([side, team]) => {
                        const roster = team.spielerliste || [];
                        const seeded = seedAbsentees(openMatch);
                        const absentList =
                          side === 'home'
                            ? matchAbsentees[openMatch.id]?.homeAbsent ?? seeded.homeAbsent
                            : matchAbsentees[openMatch.id]?.awayAbsent ?? seeded.awayAbsent;
                        return (
                          <div key={side} className="space-y-1.5">
                            <div className="flex items-center justify-between gap-2 border-b border-white/5 pb-1.5">
                              <span className="text-xs font-semibold text-white truncate">{team.name}</span>
                              {absentList.length > 0 && (
                                <span className="text-[10px] font-mono text-hl-red-soft shrink-0">
                                  {absentList.length} fehlt{absentList.length === 1 ? '' : 'en'}
                                </span>
                              )}
                            </div>
                            {roster.length === 0 ? (
                              <div className="text-[10px] text-hl-faint font-sans italic">Noch kein Kader gepflegt.</div>
                            ) : (
                              <div className="flex flex-wrap gap-1.5">
                                {roster.map((p) => {
                                  const absent = absentList.includes(p.name);
                                  return (
                                    <button
                                      key={p.name}
                                      type="button"
                                      onClick={() => toggleAbsent(openMatch, side, p.name)}
                                      title={absent ? 'Abwesend – tippen zum Einsetzen' : 'Dabei – tippen für „abwesend“'}
                                      className={`px-2.5 py-1 rounded-md text-[11px] font-sans font-semibold border transition-colors cursor-pointer ${
                                        absent
                                          ? 'bg-transparent border-white/10 text-hl-faint line-through'
                                          : 'bg-[rgba(67,229,160,.12)] border-[rgba(67,229,160,.3)] text-hl-green-soft'
                                      }`}
                                    >
                                      {p.name}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bester Spieler je Team (optional) – fließt in die Ballon-d'Or-Wertung ein */}
                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-sans text-hl-gold uppercase tracking-wider font-bold">
                      <Star className="w-3.5 h-3.5" />
                      <span>Bester Spieler des Spiels</span>
                    </div>
                    <p className="text-[10px] text-hl-faint font-sans -mt-1.5 leading-relaxed">
                      Jedes Team wählt seinen besten Spieler aus dem <strong className="text-hl-soft">eigenen Kader</strong>{' '}
                      (optional). Das gibt einen Punkt für die Ballon-d'Or-Wertung.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {([['home', oHome], ['away', oAway]] as const).map(([side, team]) => {
                        const seeded = seedBestPlayers(openMatch);
                        const value =
                          side === 'home'
                            ? matchBestPlayers[openMatch.id]?.home ?? seeded.home
                            : matchBestPlayers[openMatch.id]?.away ?? seeded.away;
                        const roster = team.spielerliste || [];
                        return (
                          <div key={side} className="space-y-1.5">
                            <label className="block text-[9px] text-hl-faint font-sans uppercase tracking-wider">{team.name}</label>
                            {roster.length === 0 ? (
                              <div className="text-[10px] text-hl-faint font-sans italic">Noch kein Kader gepflegt.</div>
                            ) : (
                              <select
                                value={value}
                                onChange={(e) => setBestPlayer(openMatch, side, e.target.value)}
                                className={selectClasses}
                              >
                                <option value="">-- Kein --</option>
                                {roster.map((p) => (
                                  <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Torwart je Team (optional) – „zu null" gibt Punkte für den Goldenen Handschuh */}
                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <div className="flex items-center gap-1.5 text-xs font-sans text-brand-accent-light uppercase tracking-wider font-bold">
                      <Hand className="w-3.5 h-3.5" />
                      <span>Torwart</span>
                    </div>
                    <p className="text-[10px] text-hl-faint font-sans -mt-1.5 leading-relaxed">
                      Wer stand im Tor? Wird für die nächsten Spiele <strong className="text-hl-soft">vorausgewählt</strong>,
                      ist aber pro Spiel änderbar. Bleibt das Team ohne Gegentor („zu null"), gibt es einen Punkt für den
                      Goldenen Handschuh.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {([['home', oHome], ['away', oAway]] as const).map(([side, team]) => {
                        const seeded = seedGoalkeepers(openMatch);
                        const value =
                          side === 'home'
                            ? matchGoalkeepers[openMatch.id]?.home ?? seeded.home
                            : matchGoalkeepers[openMatch.id]?.away ?? seeded.away;
                        const roster = team.spielerliste || [];
                        return (
                          <div key={side} className="space-y-1.5">
                            <label className="block text-[9px] text-hl-faint font-sans uppercase tracking-wider">{team.name}</label>
                            {roster.length === 0 ? (
                              <div className="text-[10px] text-hl-faint font-sans italic">Noch kein Kader gepflegt.</div>
                            ) : (
                              <select
                                value={value}
                                onChange={(e) => setGoalkeeper(openMatch, side, e.target.value)}
                                className={selectClasses}
                              >
                                <option value="">-- Kein --</option>
                                {roster.map((p) => (
                                  <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                              </select>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Primär-Aktion + Statuswechsel */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
                    <span className="text-[10px] text-hl-faint font-sans max-w-[55%]">
                      {oCompleted
                        ? 'Korrekturen werden sofort für alle übernommen.'
                        : oLive
                        ? 'Zwischenspeichern – der Stand geht sofort live für alle.'
                        : 'Stelle das Spiel LIVE, um während des Spiels Tore einzutragen.'}
                    </span>
                    <div className="flex items-center gap-2.5">
                      <AnimatePresence>
                        {savedFlash[openMatch.id] && (
                          <motion.span
                            initial={{ opacity: 0, x: 6 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0 }}
                            className="text-[11px] font-sans font-bold text-hl-green-soft flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Gespeichert
                          </motion.span>
                        )}
                      </AnimatePresence>
                      {oLive || oCompleted ? (
                        <button
                          type="button"
                          onClick={() => commit(openMatch, oCompleted ? 'beendet' : 'live', { flash: true })}
                          className="flex items-center gap-1.5 text-xs font-sans font-bold text-[#06120f] bg-brand-accent-light hover:bg-brand-accent px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-lg shadow-brand-accent-light/20"
                        >
                          <Save className="w-4 h-4" />
                          <span>Speichern</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => commit(openMatch, 'live', { flash: true })}
                          className="flex items-center gap-1.5 text-xs font-sans font-bold text-white bg-hl-red hover:bg-[rgba(255,84,66,.85)] px-4 py-2 rounded-lg cursor-pointer transition-colors shadow-lg shadow-[rgba(255,84,66,.25)]"
                        >
                          <Play className="w-4 h-4" />
                          <span>LIVE setzen</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Statusleiste unten */}
                  <div className="flex flex-wrap justify-end items-center gap-2 pt-3 border-t border-white/5">
                    {oCompleted ? (
                      <button
                        type="button"
                        onClick={() => setResetTarget(openMatch)}
                        className="flex items-center gap-1 text-[11px] font-sans font-semibold text-hl-red-soft hover:text-white bg-[rgba(255,84,66,.1)] border border-[rgba(255,84,66,.2)] px-2.5 py-1.5 rounded-md cursor-pointer"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>Zurücksetzen</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => finishMatch(openMatch)}
                        className="flex items-center gap-1 text-[11px] font-sans font-bold text-hl-green-soft hover:text-white bg-[rgba(67,229,160,.15)] border border-[rgba(67,229,160,.3)] px-3 py-1.5 rounded-md cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Spiel beenden</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={closeManage}
                      className="text-[11px] font-sans font-semibold text-hl-dim hover:text-hl-soft px-3 py-1.5 cursor-pointer"
                    >
                      Schließen
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {matches.length === 0 ? (
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm">
          In dieser Saison sind noch keine Spiele angesetzt.
          {isAdmin && ' Lege im Backoffice unter "Spielplan verwalten" die ersten Spiele an.'}
        </div>
      ) : (
        <>
          {/* Spieltag-Navigation */}
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

          {/* Match-Karten (kompakt) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {matchdayMatches.map((match) => {
              const home = getTeam(match.homeTeamId);
              const away = getTeam(match.awayTeamId);
              if (!home || !away) return null;

              const isCompleted = match.status === 'beendet';
              const isLive = match.status === 'live';
              const isUpcoming = match.status === 'geplant' && match.homeScore === null;

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
                      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-white/[.06] text-hl-mute">BEENDET</span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-md font-sans font-extrabold text-[9.5px] tracking-[1.2px] bg-[rgba(34,223,201,.12)] text-brand-accent-light">ANSTOSS</span>
                    )}
                  </div>

                  {/* Teams + Ergebnis */}
                  <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 sm:gap-3.5">
                    <div className="flex items-center gap-[11px] min-w-0">
                      <TeamCrest name={home.name} shortName={home.shortName} color={home.logoColor} logoUrl={home.logoUrl} size="lg" />
                      {onSelectTeam ? (
                        <button
                          onClick={() => onSelectTeam(home.id)}
                          className="font-sans font-semibold text-sm sm:text-[15px] text-hl-text leading-tight break-words min-w-0 hover:text-brand-accent-light transition-colors cursor-pointer text-left"
                          title={`${home.name} – Vereinsseite öffnen`}
                        >
                          {home.name}
                        </button>
                      ) : (
                        <span className="font-sans font-semibold text-sm sm:text-[15px] text-hl-text leading-tight break-words min-w-0">{home.name}</span>
                      )}
                    </div>

                    {isUpcoming ? (
                      <div className="min-w-[48px] sm:min-w-[64px] text-center font-sans font-extrabold text-sm sm:text-[15px] tracking-[2px] text-hl-faint">VS</div>
                    ) : (
                      <div
                        className={`min-w-[48px] sm:min-w-[64px] text-center font-display font-black text-2xl sm:text-3xl leading-none ${
                          isLive ? 'text-brand-accent-light' : 'text-white'
                        }`}
                      >
                        {match.homeScore ?? 0} : {match.awayScore ?? 0}
                      </div>
                    )}

                    <div className="flex items-center gap-[11px] justify-end min-w-0">
                      {onSelectTeam ? (
                        <button
                          onClick={() => onSelectTeam(away.id)}
                          className="font-sans font-semibold text-sm sm:text-[15px] text-hl-text leading-tight break-words min-w-0 hover:text-brand-accent-light transition-colors cursor-pointer text-right"
                          title={`${away.name} – Vereinsseite öffnen`}
                        >
                          {away.name}
                        </button>
                      ) : (
                        <span className="font-sans font-semibold text-sm sm:text-[15px] text-hl-text leading-tight break-words min-w-0 text-right">{away.name}</span>
                      )}
                      <TeamCrest name={away.name} shortName={away.shortName} color={away.logoColor} logoUrl={away.logoUrl} size="lg" />
                    </div>
                  </div>

                  {/* Torschützen bei beendeten & laufenden Spielen */}
                  {(isCompleted || isLive) && match.scorers && match.scorers.length > 0 && (
                    <div className="mt-3.5 pt-3 border-t border-white/[.06] text-xs font-sans">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="text-right space-y-1">
                          {match.scorers.filter((s) => s.teamId === match.homeTeamId).map((s, idx) => (
                            <div key={idx} className="truncate text-hl-soft">
                              <span className="font-semibold text-hl-text">{s.playerName}</span>
                              {s.assistName && <span className="text-[10px] text-hl-dim ml-1 italic">(Vorlage: {s.assistName})</span>}
                              <span className="text-brand-accent-light text-[10px] ml-1.5">⚽</span>
                            </div>
                          ))}
                        </div>
                        <div className="text-left space-y-1">
                          {match.scorers.filter((s) => s.teamId === match.awayTeamId).map((s, idx) => (
                            <div key={idx} className="truncate text-hl-soft">
                              <span className="text-brand-accent-light text-[10px] mr-1.5">⚽</span>
                              <span className="font-semibold text-hl-text">{s.playerName}</span>
                              {s.assistName && <span className="text-[10px] text-hl-dim ml-1 italic">(Vorlage: {s.assistName})</span>}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Admin: Verwalten-Button öffnet das Popup */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => openManage(match)}
                      className="mt-3.5 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-white/[.04] hover:bg-white/[.08] border border-white/10 text-[12px] font-sans font-bold uppercase tracking-wider text-hl-soft hover:text-white transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{isLive ? 'Live verwalten' : isCompleted ? 'Ergebnis bearbeiten' : 'Spiel verwalten'}</span>
                    </button>
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
