import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Shield, ArrowLeft, LogOut, Plus, X, Play, Pause, Square, Users, Star, Check, RefreshCw } from 'lucide-react';
import { EveningRoster, Match, RosterMap, SessionUser, Team } from '../types';
import { useCountdown, formatClock } from './ui';

interface RefereeModeProps {
  user: SessionUser;
  teams: Team[];
  matches: Match[]; // Spiele der aktuellen Saison
  seasonId: string;
  roster: RosterMap;
  onUpdateMatch: (matchId: string, patch: Partial<Match>) => Promise<boolean>;
  onSaveRoster: (
    seasonId: string,
    matchday: number,
    minutes: number,
    teams: EveningRoster['teams'],
    numbers?: Record<string, Record<string, number | null>>
  ) => Promise<boolean>;
  onRefresh: () => Promise<unknown> | void;
  onLogout: () => void;
  onExit?: () => void; // nur für Admins: Schiedsrichtermodus verlassen (zurück zur Seite)
}

const DEFAULT_MINUTES = 7;

// Auswahl-Eintrag im Spieler-Picker: Name + optionale Trikotnummer.
type PickPlayer = { name: string; number?: number };

export default function RefereeMode({
  user,
  teams,
  matches,
  seasonId,
  roster,
  onUpdateMatch,
  onSaveRoster,
  onRefresh,
  onLogout,
  onExit,
}: RefereeModeProps) {
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const teamName = (id: string) => teamById.get(id)?.name ?? id;

  // Vorhandene Spieltage aufsteigend (1 → n), damit die Leiste von links nach
  // rechts ansteigt. Vorausgewählt bleibt der neueste (höchste) Spieltag.
  const matchdays = useMemo(
    () => [...new Set(matches.map((m) => m.matchday))].sort((a, b) => a - b),
    [matches]
  );
  const latestMatchday = matchdays[matchdays.length - 1] ?? 1;
  const [matchday, setMatchday] = useState<number>(latestMatchday);
  useEffect(() => {
    if (matchdays.length && !matchdays.includes(matchday)) setMatchday(latestMatchday);
  }, [matchdays, matchday, latestMatchday]);

  const [fieldFilter, setFieldFilter] = useState<number | 'all'>('all');
  const [openMatchId, setOpenMatchId] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(false);

  // Regelmäßig aktualisieren, damit parallele Änderungen (z. B. zweites Feld)
  // erscheinen. Popups bleiben davon unberührt (lokaler State).
  useEffect(() => {
    const iv = setInterval(() => onRefresh(), 15000);
    return () => clearInterval(iv);
  }, [onRefresh]);

  const rosterKey = `${seasonId}:${matchday}`;
  const eveningRoster: EveningRoster | undefined = roster[rosterKey];
  const minutesFor = eveningRoster?.minutes ?? DEFAULT_MINUTES;

  // Anwesende Spieler eines Teams: aus der Aufstellung, sonst kompletter Kader.
  const presentFor = (teamId: string): string[] => {
    const fromRoster = eveningRoster?.teams?.[teamId]?.present;
    if (fromRoster && fromRoster.length) return fromRoster;
    return (teamById.get(teamId)?.spielerliste ?? []).map((p) => p.name);
  };

  // Anwesende Spieler samt Trikotnummer (für die großen Auswahl-Tasten: Nummer
  // groß, Name klein daneben – so geht das Eintragen schnell).
  const presentPlayersFor = (teamId: string): PickPlayer[] => {
    const numByName = new Map((teamById.get(teamId)?.spielerliste ?? []).map((p) => [p.name, p.number]));
    return presentFor(teamId).map((name) => ({ name, number: numByName.get(name) }));
  };

  const dayMatches = useMemo(
    () =>
      matches
        .filter((m) => m.matchday === matchday)
        .filter((m) => (fieldFilter === 'all' ? true : (m.field ?? 0) === fieldFilter))
        // Streng chronologisch: erst Uhrzeit, dann Zeitblock, dann Feld –
        // damit die beiden Felder nicht durcheinandergewürfelt sind.
        .sort((a, b) => a.time.localeCompare(b.time) || (a.slot ?? 0) - (b.slot ?? 0) || (a.field ?? 0) - (b.field ?? 0)),
    [matches, matchday, fieldFilter]
  );

  const fieldsAvailable = useMemo(
    () => [...new Set(matches.filter((m) => m.matchday === matchday).map((m) => m.field).filter((f): f is number => !!f))].sort(),
    [matches, matchday]
  );

  const openMatch = openMatchId ? matches.find((m) => m.id === openMatchId) ?? null : null;

  // ---- Detail-Ansicht eines Spiels ----------------------------------------
  if (openMatch) {
    return (
      <MatchScreen
        match={openMatch}
        teamName={teamName}
        presentPlayers={presentPlayersFor}
        minutes={minutesFor}
        onBack={() => setOpenMatchId(null)}
        onUpdateMatch={onUpdateMatch}
      />
    );
  }

  // ---- Aufstellungs-Editor -------------------------------------------------
  if (showRoster) {
    return (
      <RosterEditor
        matchday={matchday}
        seasonId={seasonId}
        matches={matches.filter((m) => m.matchday === matchday)}
        teams={teams}
        eveningRoster={eveningRoster}
        onBack={() => setShowRoster(false)}
        onSave={onSaveRoster}
      />
    );
  }

  // ---- Übersicht: Spieltag, Feld-Filter, Spiel-Liste -----------------------
  return (
    <div className="min-h-screen bg-brand-dark text-white font-sans flex flex-col">
      <header className="sticky top-0 z-10 bg-brand-dark/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Shield className="w-6 h-6 text-brand-accent-light shrink-0" />
          <div className="min-w-0">
            <div className="font-display font-bold text-lg uppercase tracking-tight leading-none">Schiedsrichter</div>
            <div className="text-[11px] text-hl-dim truncate">{user.name || user.email}</div>
          </div>
        </div>
        {onExit ? (
          <button
            type="button"
            onClick={onExit}
            className="flex items-center gap-1.5 text-xs font-semibold text-hl-dim hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Zurück zum Backoffice
          </button>
        ) : (
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center gap-1.5 text-xs font-semibold text-hl-dim hover:text-white bg-white/5 hover:bg-white/10 rounded-lg px-3 py-2 transition-colors"
          >
            <LogOut className="w-4 h-4" /> Abmelden
          </button>
        )}
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-2xl w-full mx-auto pb-24">
        {/* Spieltag-Auswahl */}
        {matchdays.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {matchdays.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setMatchday(d)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                  d === matchday ? 'bg-brand-accent text-white' : 'bg-white/5 text-hl-dim hover:bg-white/10'
                }`}
              >
                {d}. Spieltag
              </button>
            ))}
          </div>
        )}

        {/* Feld-Filter */}
        {fieldsAvailable.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setFieldFilter('all')}
              className={`flex-1 px-4 py-3 rounded-xl text-base font-bold transition-colors ${
                fieldFilter === 'all' ? 'bg-brand-accent-light text-brand-dark' : 'bg-white/5 text-hl-dim'
              }`}
            >
              Alle
            </button>
            {fieldsAvailable.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFieldFilter(f)}
                className={`flex-1 px-4 py-3 rounded-xl text-base font-bold transition-colors ${
                  fieldFilter === f ? 'bg-brand-accent-light text-brand-dark' : 'bg-white/5 text-hl-dim'
                }`}
              >
                Feld {f}
              </button>
            ))}
          </div>
        )}

        {/* Aufstellung des Abends */}
        <button
          type="button"
          onClick={() => setShowRoster(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-sm font-semibold transition-colors"
        >
          <Users className="w-5 h-5 text-brand-accent-light" />
          Aufstellung des Abends (Anwesende · Torwart · Spieldauer {minutesFor} Min)
        </button>

        {/* Spiel-Liste */}
        <div className="space-y-3">
          {dayMatches.length === 0 ? (
            <p className="text-center text-hl-dim py-10">Keine Spiele für diese Auswahl.</p>
          ) : (
            dayMatches.map((m) => (
              <MatchRow key={m.id} match={m} teamName={teamName} onOpen={() => setOpenMatchId(m.id)} />
            ))
          )}
        </div>
      </main>
    </div>
  );
}

// Eine Spielkarte in der Übersicht (großflächig antippbar).
function MatchRow({ match, teamName, onOpen }: { match: Match; teamName: (id: string) => string; onOpen: () => void }) {
  const remaining = useCountdown(match.liveStartedAt, match.durationMinutes, match.pausedAt);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-white/[.04] hover:bg-white/[.07] active:bg-white/10 border border-white/10 rounded-2xl p-4 transition-colors"
    >
      <div className="flex items-center justify-between mb-2 text-[11px] font-semibold uppercase tracking-wider text-hl-dim">
        <span>{match.field ? `Feld ${match.field}` : match.time + ' Uhr'}</span>
        {match.status === 'live' ? (
          <span className={`flex items-center gap-1.5 ${match.pausedAt ? 'text-amber-400' : 'text-hl-red-soft'}`}>
            <span className={`w-2 h-2 rounded-full inline-block ${match.pausedAt ? 'bg-amber-400' : 'bg-hl-red hl-pulse'}`} />
            {match.pausedAt ? 'PAUSE' : 'LIVE'} {remaining !== null ? formatClock(remaining) : ''}
          </span>
        ) : match.status === 'beendet' ? (
          <span className="text-emerald-400">Beendet</span>
        ) : (
          <span className="text-brand-accent-light">Anstoß {match.time}</span>
        )}
      </div>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="text-right font-bold text-lg leading-tight truncate">{teamName(match.homeTeamId)}</div>
        <div className="font-mono font-extrabold text-2xl tabular-nums">
          {match.homeScore ?? 0}<span className="text-hl-dim mx-1">:</span>{match.awayScore ?? 0}
        </div>
        <div className="text-left font-bold text-lg leading-tight truncate">{teamName(match.awayTeamId)}</div>
      </div>
    </button>
  );
}

// --------------------------------------------------------------------------
// Detail-Ansicht: anpfeifen, Tore/Torschützen erfassen, abpfeifen.
// --------------------------------------------------------------------------
function MatchScreen({
  match,
  teamName,
  presentPlayers,
  minutes,
  onBack,
  onUpdateMatch,
}: {
  match: Match;
  teamName: (id: string) => string;
  presentPlayers: (teamId: string) => PickPlayer[];
  minutes: number;
  onBack: () => void;
  onUpdateMatch: (matchId: string, patch: Partial<Match>) => Promise<boolean>;
}) {
  const [busy, setBusy] = useState(false);
  // Tor-Popup: welches Team, optional welcher Tor-Index (Bearbeiten), und in
  // welchem Schritt (erst Torschütze, dann Vorlage). `scorer` merkt sich den
  // gewählten Torschützen zwischen den beiden Schritten.
  const [picker, setPicker] = useState<
    { teamId: string; editIndex: number | null; stage: 'scorer' | 'assist'; scorer?: string } | null
  >(null);
  // Popup für „Spieler des Spiels".
  const [motmTeam, setMotmTeam] = useState<string | null>(null);

  const home = match.homeTeamId;
  const away = match.awayTeamId;
  const homeScore = match.homeScore ?? 0;
  const awayScore = match.awayScore ?? 0;
  const scorers = match.scorers ?? [];
  const bestPlayers = match.bestPlayers ?? [];
  const isPaused = !!match.pausedAt;
  const remaining = useCountdown(match.liveStartedAt, match.durationMinutes, match.pausedAt);

  const scorersOf = (teamId: string) =>
    scorers.map((s, i) => ({ ...s, i })).filter((s) => s.teamId === teamId);
  const bestOf = (teamId: string) => bestPlayers.find((b) => b.teamId === teamId)?.playerName ?? null;

  const save = async (patch: Partial<Match>) => {
    setBusy(true);
    await onUpdateMatch(match.id, patch);
    setBusy(false);
  };

  const kickoff = () =>
    save({
      status: 'live',
      durationMinutes: minutes,
      pausedAt: null,
      homeScore: match.homeScore ?? 0,
      awayScore: match.awayScore ?? 0,
    });

  const pause = () => save({ pausedAt: new Date().toISOString() });
  const resume = () => save({ pausedAt: null });
  const finalize = () => save({ status: 'beendet' });

  // Tor hinzufügen (mit oder ohne Torschütze; optional mit Vorlage).
  const addGoal = (teamId: string, playerName: string | null, assistName?: string | null) => {
    const nextScorers = playerName
      ? [...scorers, { playerName, teamId, ...(assistName ? { assistName } : {}) }]
      : scorers;
    save({
      status: match.status === 'geplant' ? 'live' : match.status,
      durationMinutes: match.durationMinutes ?? minutes,
      homeScore: teamId === home ? homeScore + 1 : homeScore,
      awayScore: teamId === away ? awayScore + 1 : awayScore,
      scorers: nextScorers,
    });
  };

  // Ein Tor entfernen (per Torschützen-Index).
  const removeGoalByIndex = (index: number) => {
    const s = scorers[index];
    if (!s) return;
    const nextScorers = scorers.filter((_, i) => i !== index);
    save({
      homeScore: s.teamId === home ? Math.max(0, homeScore - 1) : homeScore,
      awayScore: s.teamId === away ? Math.max(0, awayScore - 1) : awayScore,
      scorers: nextScorers,
    });
  };

  // Ein Tor ohne Torschütze entfernen (nur Spielstand −1).
  const removeUnattributed = (teamId: string) => {
    save({
      homeScore: teamId === home ? Math.max(0, homeScore - 1) : homeScore,
      awayScore: teamId === away ? Math.max(0, awayScore - 1) : awayScore,
    });
  };

  // Torschützen eines bestehenden Tores ändern.
  const changeScorer = (index: number, playerName: string) => {
    const nextScorers = scorers.map((s, i) => (i === index ? { ...s, playerName } : s));
    save({ scorers: nextScorers });
  };

  // Bester Spieler je Team (max. einer) setzen / entfernen.
  const setBestPlayer = (teamId: string, playerName: string | null) => {
    const others = bestPlayers.filter((b) => b.teamId !== teamId);
    save({ bestPlayers: playerName ? [...others, { playerName, teamId }] : others });
  };

  const onPick = (playerName: string | null) => {
    if (!picker) return;
    // Bestehendes Tor bearbeiten: nur den Torschützen ändern (Vorlage bleibt).
    if (picker.editIndex !== null) {
      if (playerName) changeScorer(picker.editIndex, playerName);
      setPicker(null);
      return;
    }
    // Neues Tor, Schritt 1 – Torschütze.
    if (picker.stage === 'scorer') {
      if (!playerName) {
        // Tor ohne Torschütze: direkt buchen, kein Vorlage-Schritt.
        addGoal(picker.teamId, null);
        setPicker(null);
        return;
      }
      // Weiter zu Schritt 2 – Vorlage (Assist).
      setPicker({ ...picker, stage: 'assist', scorer: playerName });
      return;
    }
    // Neues Tor, Schritt 2 – Vorlage (playerName = Vorlagengeber oder null).
    addGoal(picker.teamId, picker.scorer ?? null, playerName);
    setPicker(null);
  };

  const unattributed = (teamId: string) => {
    const score = teamId === home ? homeScore : awayScore;
    return Math.max(0, score - scorersOf(teamId).length);
  };

  const TeamColumn = ({ teamId }: { teamId: string }) => (
    <div className="space-y-2">
      <button
        type="button"
        disabled={busy}
        onClick={() => setPicker({ teamId, editIndex: null, stage: 'scorer' })}
        className="w-full min-h-[72px] rounded-2xl bg-brand-accent hover:bg-brand-accent-light active:scale-[.99] disabled:opacity-50 text-white font-extrabold text-xl flex flex-col items-center justify-center gap-1 transition-all"
      >
        <Plus className="w-7 h-7" />
        <span className="text-sm uppercase tracking-wide">Tor {teamName(teamId)}</span>
      </button>

      {/* Torschützen dieses Teams */}
      <div className="space-y-1.5">
        {scorersOf(teamId).map((s) => (
          <div key={s.i} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <div className="flex-1 min-w-0">
              <span className="block font-semibold truncate">{s.playerName || 'Unbekannt'}</span>
              {s.assistName && (
                <span className="block text-[11px] text-hl-dim truncate">Vorlage: {s.assistName}</span>
              )}
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => setPicker({ teamId, editIndex: s.i, stage: 'scorer' })}
              className="text-[11px] font-semibold text-brand-accent-light px-2 py-1 rounded-lg hover:bg-white/10 disabled:opacity-50"
            >
              Ändern
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => removeGoalByIndex(s.i)}
              className="p-1.5 text-hl-dim hover:text-rose-400 hover:bg-rose-500/10 rounded-lg disabled:opacity-50"
              title="Tor entfernen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {Array.from({ length: unattributed(teamId) }).map((_, i) => (
          <div key={`u-${i}`} className="flex items-center gap-2 bg-white/5 rounded-xl px-3 py-2">
            <span className="flex-1 text-hl-dim italic">Tor ohne Torschütze</span>
            <button
              type="button"
              disabled={busy}
              onClick={() => removeUnattributed(teamId)}
              className="p-1.5 text-hl-dim hover:text-rose-400 hover:bg-rose-500/10 rounded-lg disabled:opacity-50"
              title="Tor entfernen"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>

      {/* Spieler des Spiels */}
      <button
        type="button"
        disabled={busy}
        onClick={() => setMotmTeam(teamId)}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold rounded-xl px-3 py-2 border border-white/10 bg-white/[.03] hover:bg-white/[.07] disabled:opacity-50"
      >
        <Star className={`w-4 h-4 ${bestOf(teamId) ? 'text-amber-400 fill-amber-400' : 'text-hl-dim'}`} />
        {bestOf(teamId) ? `Spieler d. Spiels: ${bestOf(teamId)}` : 'Spieler des Spiels wählen'}
      </button>
    </div>
  );

  return (
    <div className="min-h-screen bg-brand-dark text-white font-sans flex flex-col">
      <header className="sticky top-0 z-10 bg-brand-dark/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-hl-dim hover:text-white">
          <ArrowLeft className="w-5 h-5" /> Zurück
        </button>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-hl-dim">
          {match.matchday}. Spieltag{match.field ? ` · Feld ${match.field}` : ''}
        </div>
        {busy ? <RefreshCw className="w-4 h-4 text-brand-accent-light animate-spin" /> : <span className="w-4" />}
      </header>

      <main className="flex-1 px-4 py-4 space-y-4 max-w-2xl w-full mx-auto pb-24">
        {/* Anzeigetafel */}
        <div className="bg-white/[.04] border border-white/10 rounded-2xl p-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 mb-3">
            <div className="text-right font-extrabold text-xl leading-tight">{teamName(home)}</div>
            <div className="font-mono font-black text-4xl tabular-nums">
              {homeScore}<span className="text-hl-dim mx-1">:</span>{awayScore}
            </div>
            <div className="text-left font-extrabold text-xl leading-tight">{teamName(away)}</div>
          </div>

          {/* Timer / Status */}
          <div className="text-center">
            {match.status === 'live' ? (
              <div className={`font-mono font-black text-3xl tabular-nums ${isPaused ? 'text-amber-400' : 'text-hl-red-soft'}`}>
                {remaining !== null ? formatClock(remaining) : 'LIVE'}
                {isPaused && <div className="text-xs font-sans uppercase tracking-wider mt-1">Pausiert</div>}
                {!isPaused && remaining === 0 && <div className="text-xs font-sans text-hl-dim mt-1">Zeit abgelaufen – Abpfiff wählen</div>}
              </div>
            ) : match.status === 'beendet' ? (
              <div className="text-emerald-400 font-bold uppercase tracking-wider">Beendet</div>
            ) : (
              <div className="text-brand-accent-light font-bold uppercase tracking-wider">Bereit zum Anpfiff</div>
            )}
          </div>
        </div>

        {/* Anpfiff / Pause / Abpfiff */}
        {match.status !== 'live' ? (
          <button
            type="button"
            disabled={busy}
            onClick={kickoff}
            className="w-full min-h-[64px] rounded-2xl bg-emerald-500 hover:bg-emerald-400 active:scale-[.99] disabled:opacity-50 text-white font-extrabold text-xl flex items-center justify-center gap-2 transition-all"
          >
            <Play className="w-7 h-7" /> {match.status === 'beendet' ? 'Erneut anpfeifen' : 'Anpfiff'}
          </button>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              disabled={busy}
              onClick={isPaused ? resume : pause}
              className={`min-h-[64px] rounded-2xl active:scale-[.99] disabled:opacity-50 text-white font-extrabold text-lg flex items-center justify-center gap-2 transition-all ${
                isPaused ? 'bg-emerald-500 hover:bg-emerald-400' : 'bg-amber-500 hover:bg-amber-400'
              }`}
            >
              {isPaused ? <><Play className="w-6 h-6" /> Weiter</> : <><Pause className="w-6 h-6" /> Pause</>}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={finalize}
              className="min-h-[64px] rounded-2xl bg-hl-red hover:brightness-110 active:scale-[.99] disabled:opacity-50 text-white font-extrabold text-lg flex items-center justify-center gap-2 transition-all"
            >
              <Square className="w-6 h-6" /> Abpfiff
            </button>
          </div>
        )}

        {/* Tore je Team */}
        <div className="grid grid-cols-2 gap-3">
          <TeamColumn teamId={home} />
          <TeamColumn teamId={away} />
        </div>
      </main>

      {/* Tor-Popup: Schritt 1 Torschütze, Schritt 2 Vorlage (Assist) */}
      <AnimatePresence>
        {picker && (
          <PlayerPicker
            title={
              picker.editIndex !== null
                ? 'Torschütze ändern'
                : picker.stage === 'assist'
                ? 'Vorlage (Assist)?'
                : 'Wer hat getroffen?'
            }
            subtitle={picker.stage === 'assist' && picker.scorer ? `Tor: ${picker.scorer}` : undefined}
            teamLabel={teamName(picker.teamId)}
            players={
              picker.stage === 'assist'
                ? presentPlayers(picker.teamId).filter((p) => p.name !== picker.scorer)
                : presentPlayers(picker.teamId)
            }
            noneLabel={
              picker.stage === 'assist'
                ? 'Ohne Vorlage'
                : picker.editIndex === null
                ? 'Tor ohne Torschütze'
                : undefined
            }
            onPick={onPick}
            onClose={() => setPicker(null)}
          />
        )}
      </AnimatePresence>

      {/* Spieler-des-Spiels-Popup */}
      <AnimatePresence>
        {motmTeam && (
          <PlayerPicker
            title="Spieler des Spiels"
            teamLabel={teamName(motmTeam)}
            players={presentPlayers(motmTeam)}
            current={bestOf(motmTeam)}
            noneLabel={bestOf(motmTeam) ? 'Auswahl entfernen' : undefined}
            onPick={(name) => {
              setBestPlayer(motmTeam, name);
              setMotmTeam(null);
            }}
            onClose={() => setMotmTeam(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// --------------------------------------------------------------------------
// Großes Auswahl-Popup (Bottom-Sheet) für Spieler – dicke Tasten.
// --------------------------------------------------------------------------
function PlayerPicker({
  title,
  subtitle,
  teamLabel,
  players,
  current,
  noneLabel,
  onPick,
  onClose,
}: {
  title: string;
  subtitle?: string;
  teamLabel: string;
  players: PickPlayer[];
  current?: string | null;
  /** Text der neutralen Taste ganz unten (z. B. „Ohne Vorlage"). Fehlt sie, wird keine gezeigt. */
  noneLabel?: string;
  onPick: (name: string | null) => void;
  onClose: () => void;
}) {
  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="w-full max-w-2xl bg-brand-dark border-t border-white/15 rounded-t-3xl p-4 pb-8 max-h-[85vh] overflow-y-auto"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <div className="min-w-0">
            <h3 className="font-display font-bold text-xl uppercase tracking-tight">{title}</h3>
            {subtitle && <p className="text-xs text-hl-dim font-semibold mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="p-2 text-hl-dim hover:text-white shrink-0">
            <X className="w-6 h-6" />
          </button>
        </div>
        <p className="text-sm text-brand-accent-light font-semibold mb-4">{teamLabel}</p>

        <div className="grid grid-cols-1 gap-2.5">
          {players.length === 0 && (
            <p className="text-hl-dim text-center py-4">Keine Spieler hinterlegt. Bitte Aufstellung/Kader pflegen.</p>
          )}
          {players.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => onPick(p.name)}
              className={`w-full min-h-[60px] rounded-2xl pl-2 pr-4 py-2 flex items-center justify-between gap-2 transition-colors ${
                current === p.name ? 'bg-brand-accent text-white' : 'bg-white/[.06] hover:bg-white/[.12] text-white'
              }`}
            >
              <span className="flex items-center gap-3 min-w-0">
                {/* Trikotnummer groß, Name klein daneben – schnelles Eintragen */}
                <span
                  className={`w-12 shrink-0 text-center font-display font-black text-3xl leading-none tabular-nums ${
                    current === p.name ? 'text-white' : 'text-brand-accent-light'
                  } ${typeof p.number === 'number' ? '' : 'opacity-30'}`}
                >
                  {typeof p.number === 'number' ? p.number : '–'}
                </span>
                <span className="truncate text-base font-bold text-left">{p.name}</span>
              </span>
              {current === p.name && <Check className="w-6 h-6 shrink-0" />}
            </button>
          ))}

          {noneLabel && (
            <button
              type="button"
              onClick={() => onPick(null)}
              className="w-full min-h-[52px] rounded-2xl px-4 text-base font-semibold bg-white/[.03] border border-white/10 text-hl-dim hover:text-white hover:bg-white/[.07]"
            >
              {noneLabel}
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// --------------------------------------------------------------------------
// Aufstellung des Abends: Anwesende + Torwart je Team, plus Spieldauer.
// --------------------------------------------------------------------------
function RosterEditor({
  matchday,
  seasonId,
  matches,
  teams,
  eveningRoster,
  onBack,
  onSave,
}: {
  matchday: number;
  seasonId: string;
  matches: Match[];
  teams: Team[];
  eveningRoster: EveningRoster | undefined;
  onBack: () => void;
  onSave: (
    seasonId: string,
    matchday: number,
    minutes: number,
    teams: EveningRoster['teams'],
    numbers?: Record<string, Record<string, number | null>>
  ) => Promise<boolean>;
}) {
  // Teams, die an diesem Spieltag spielen.
  const teamIds = useMemo(() => {
    const ids = new Set<string>();
    matches.forEach((m) => {
      ids.add(m.homeTeamId);
      ids.add(m.awayTeamId);
    });
    return [...ids];
  }, [matches]);

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const kaderOf = (teamId: string) => (teamById.get(teamId)?.spielerliste ?? []).map((p) => p.name);

  // Lokaler Bearbeitungsstand: Anwesende (Standard: alle im Kader) + Torwart.
  const [minutes, setMinutes] = useState<number>(eveningRoster?.minutes ?? DEFAULT_MINUTES);
  const [state, setState] = useState<Record<string, { present: Set<string>; goalkeeper: string }>>(() => {
    const init: Record<string, { present: Set<string>; goalkeeper: string }> = {};
    teamIds.forEach((id) => {
      const stored = eveningRoster?.teams?.[id];
      const kader = kaderOf(id);
      const present = stored?.present && stored.present.length ? stored.present : kader;
      const presentSet = new Set(present);
      // Fester Torwart aus dem Kader als Vorauswahl, solange für diesen Abend noch
      // keiner gesetzt wurde. Bleibt änderbar (kann jederzeit überschrieben werden).
      const fixedGk = (teamById.get(id)?.spielerliste ?? []).find((p) => p.goalkeeper)?.name;
      const goalkeeper =
        stored?.goalkeeper ?? (fixedGk && presentSet.has(fixedGk) ? fixedGk : '');
      init[id] = { present: presentSet, goalkeeper };
    });
    return init;
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  // Trikotnummern (optional, „notfalls" hier änderbar). Eingabe als String je
  // teamId → Spielername; leer = keine Nummer.
  const [numbers, setNumbers] = useState<Record<string, Record<string, string>>>(() => {
    const init: Record<string, Record<string, string>> = {};
    teamIds.forEach((id) => {
      const map: Record<string, string> = {};
      (teamById.get(id)?.spielerliste ?? []).forEach((p) => {
        map[p.name] = typeof p.number === 'number' ? String(p.number) : '';
      });
      init[id] = map;
    });
    return init;
  });
  const setNumber = (teamId: string, name: string, val: string) =>
    setNumbers((prev) => ({
      ...prev,
      [teamId]: { ...prev[teamId], [name]: val.replace(/[^0-9]/g, '').slice(0, 3) },
    }));

  const togglePresent = (teamId: string, name: string) =>
    setState((prev) => {
      const cur = prev[teamId];
      const present = new Set(cur.present);
      if (present.has(name)) present.delete(name);
      else present.add(name);
      // War der Torwart abwesend, Torwart zurücksetzen.
      const goalkeeper = present.has(cur.goalkeeper) ? cur.goalkeeper : '';
      return { ...prev, [teamId]: { present, goalkeeper } };
    });

  const setGoalkeeper = (teamId: string, name: string) =>
    setState((prev) => ({ ...prev, [teamId]: { ...prev[teamId], goalkeeper: prev[teamId].goalkeeper === name ? '' : name } }));

  const handleSave = async () => {
    setBusy(true);
    const payload: EveningRoster['teams'] = {};
    teamIds.forEach((id) => {
      payload[id] = { present: [...state[id].present], goalkeeper: state[id].goalkeeper || undefined };
    });
    // Trikotnummern-Änderungen (optional): je Team eine Karte Name → Nummer|null.
    const numbersPayload: Record<string, Record<string, number | null>> = {};
    teamIds.forEach((id) => {
      const map: Record<string, number | null> = {};
      Object.entries(numbers[id] ?? {}).forEach(([name, val]) => {
        map[name] = val.trim() === '' ? null : Math.max(0, Math.min(999, parseInt(val, 10) || 0));
      });
      if (Object.keys(map).length) numbersPayload[id] = map;
    });
    const ok = await onSave(
      seasonId,
      matchday,
      Math.max(1, Math.min(120, minutes || DEFAULT_MINUTES)),
      payload,
      numbersPayload
    );
    setBusy(false);
    if (ok) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  return (
    <div className="min-h-screen bg-brand-dark text-white font-sans flex flex-col">
      <header className="sticky top-0 z-10 bg-brand-dark/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center justify-between gap-3">
        <button type="button" onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-hl-dim hover:text-white">
          <ArrowLeft className="w-5 h-5" /> Zurück
        </button>
        <div className="text-[11px] font-semibold uppercase tracking-wider text-hl-dim">{matchday}. Spieltag · Aufstellung</div>
        <span className="w-4" />
      </header>

      <main className="flex-1 px-4 py-4 space-y-5 max-w-2xl w-full mx-auto pb-32">
        {/* Spieldauer */}
        <div className="bg-white/[.04] border border-white/10 rounded-2xl p-4 flex items-center justify-between gap-3">
          <div>
            <div className="font-bold">Spieldauer</div>
            <div className="text-xs text-hl-dim">Countdown pro Spiel (Minuten)</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setMinutes((m) => Math.max(1, m - 1))} className="w-11 h-11 rounded-xl bg-white/10 text-2xl font-bold">−</button>
            <span className="w-12 text-center font-mono font-black text-2xl tabular-nums">{minutes}</span>
            <button type="button" onClick={() => setMinutes((m) => Math.min(120, m + 1))} className="w-11 h-11 rounded-xl bg-white/10 text-2xl font-bold">+</button>
          </div>
        </div>

        {teamIds.length === 0 && <p className="text-center text-hl-dim py-8">Keine Teams für diesen Spieltag.</p>}

        {teamIds.map((teamId) => {
          const kader = kaderOf(teamId);
          const cur = state[teamId];
          return (
            <div key={teamId} className="bg-white/[.04] border border-white/10 rounded-2xl p-4 space-y-3">
              <div className="font-display font-bold text-lg uppercase tracking-tight">{teamById.get(teamId)?.name ?? teamId}</div>
              {kader.length === 0 ? (
                <p className="text-sm text-hl-dim">Kein Kader hinterlegt. Bitte im Hauptadmin pflegen.</p>
              ) : (
                <>
                  <div className="text-xs font-semibold uppercase tracking-wider text-hl-dim">Anwesend antippen</div>
                  <div className="flex flex-wrap gap-2">
                    {kader.map((name) => {
                      const on = cur.present.has(name);
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() => togglePresent(teamId, name)}
                          className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                            on ? 'bg-brand-accent text-white' : 'bg-white/5 text-hl-dim line-through'
                          }`}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>

                  {/* Torwart */}
                  <div className="text-xs font-semibold uppercase tracking-wider text-hl-dim pt-1">Torwart des Abends</div>
                  <div className="flex flex-wrap gap-2">
                    {[...cur.present].map((name) => (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setGoalkeeper(teamId, name)}
                        className={`px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-1.5 transition-colors ${
                          cur.goalkeeper === name ? 'bg-amber-500 text-brand-dark' : 'bg-white/5 text-hl-dim'
                        }`}
                      >
                        {cur.goalkeeper === name && <Check className="w-4 h-4" />}
                        {name}
                      </button>
                    ))}
                    {cur.present.size === 0 && <span className="text-sm text-hl-dim">Erst Anwesende wählen.</span>}
                  </div>

                  {/* Trikotnummern – nur im Notfall hier ändern (sonst im Backoffice-Kader) */}
                  <details className="pt-1">
                    <summary className="text-xs font-semibold uppercase tracking-wider text-hl-dim cursor-pointer select-none list-none marker:hidden hover:text-white">
                      Trikotnummern anpassen (optional)
                    </summary>
                    <div className="grid grid-cols-2 gap-2 pt-2">
                      {kader.map((name) => (
                        <div key={name} className="flex items-center gap-2 bg-white/[.03] rounded-xl px-2.5 py-1.5">
                          <input
                            type="number"
                            min={0}
                            max={999}
                            inputMode="numeric"
                            value={numbers[teamId]?.[name] ?? ''}
                            onChange={(e) => setNumber(teamId, name, e.target.value)}
                            placeholder="#"
                            aria-label={`Trikotnummer ${name}`}
                            className="w-12 shrink-0 bg-brand-dark border border-white/10 rounded-lg px-1 py-1 text-center font-mono text-brand-accent-light text-sm focus:outline-none focus:border-brand-accent-light [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-sm text-white truncate">{name}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </>
              )}
            </div>
          );
        })}
      </main>

      {/* Speichern-Leiste */}
      <div className="fixed bottom-0 inset-x-0 bg-brand-dark/95 backdrop-blur border-t border-white/10 p-4">
        <div className="max-w-2xl mx-auto">
          <button
            type="button"
            disabled={busy}
            onClick={handleSave}
            className="w-full min-h-[56px] rounded-2xl bg-brand-accent hover:bg-brand-accent-light disabled:opacity-50 text-white font-extrabold text-lg flex items-center justify-center gap-2 transition-colors"
          >
            {saved ? <><Check className="w-6 h-6" /> Gespeichert</> : busy ? 'Speichert…' : 'Aufstellung speichern'}
          </button>
        </div>
      </div>
    </div>
  );
}
