import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Sun,
  Moon,
  SlidersHorizontal,
  Plus,
  Minus,
  Radio,
  ChevronRight,
  Check,
  Shield,
  Trophy,
  Undo2,
  X,
} from 'lucide-react';
import type { ActionCounts, EventArchive, Match, RosterMap, ScoringConfig, Season, StatRole, Team } from '../types';
import { ACTION_META, DEFAULT_SCORING } from '../lib/scoring';
import { emptyCounts, matchNote, normalizeCounts, rohscore } from '../lib/rating';
import { useBackClose } from '../lib/backStack';
import {
  fetchScoring,
  saveScoring as apiSaveScoring,
  fetchDayStats,
  saveTally,
  publishDay,
  leagueDayKey,
} from '../lib/stats';

// ===========================================================================
// Statistics Center — Erfassungs-Editor (Etappe 2)
// Eigene, app-artige Seite: Spieltag → Spiel → Raster. Pro Spieler jede Aktion
// per Klick (+1 / ▲▼ / Tastatur), Live-Note, Rückgängig, Entwurf → Live.
// Hell-/Dunkelmodus über die bestehende .hl-team-Umschaltung (sicheres Theme).
// ===========================================================================

interface Props {
  teams: Team[];
  matches: Match[];
  seasons: Season[];
  roster: RosterMap;
  eventArchive: EventArchive | null;
  onBack: () => void;
}

// Eine bearbeitbare Zeile im Raster.
interface EditRow {
  teamId: string;
  teamName: string;
  playerName: string;
  role: StatRole;
  counts: ActionCounts;
}

type RowMap = Record<string, EditRow>; // Schlüssel: `${matchId}::${teamId}::${name}`

const rowKey = (matchId: string, teamId: string, name: string) => `${matchId}::${teamId}::${name}`;

export default function TrackingCenter({ teams, matches, seasons, roster, onBack }: Props) {
  // --- Theme (Hell/Dunkel), pro Gerät gespeichert -------------------------
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      return localStorage.getItem('hl-tracking-theme') === 'light' ? 'light' : 'dark';
    } catch {
      return 'dark';
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('hl-tracking-theme', theme);
    } catch {
      /* egal */
    }
  }, [theme]);

  const [cfg, setCfg] = useState<ScoringConfig>(DEFAULT_SCORING);
  const [scoringOpen, setScoringOpen] = useState(false);

  // Saison-Auswahl (Standard: aktuelle Saison).
  const currentSeason = seasons.find((s) => s.isCurrent) ?? seasons[0] ?? null;
  const [seasonId, setSeasonId] = useState<string>(currentSeason?.id ?? '');
  useEffect(() => {
    if (!seasonId && currentSeason) setSeasonId(currentSeason.id);
  }, [currentSeason, seasonId]);

  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);

  // Zurück-Gesten am Handy: eine Ebene je geöffneter Tiefe.
  useBackClose(selectedMatchId !== null, () => setSelectedMatchId(null));
  useBackClose(selectedMatchday !== null && selectedMatchId === null, () => setSelectedMatchday(null));

  // Roh-Daten des Spieltags + bearbeitbare Zeilen.
  const [rows, setRows] = useState<RowMap>({});
  const [dayLive, setDayLive] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const dayKey = seasonId && selectedMatchday !== null ? leagueDayKey(seasonId, selectedMatchday) : '';
  const rosterKey = seasonId && selectedMatchday !== null ? `${seasonId}:${selectedMatchday}` : '';

  const teamById = useMemo(() => {
    const m: Record<string, Team> = {};
    teams.forEach((t) => (m[t.id] = t));
    return m;
  }, [teams]);

  // Score-Einstellungen laden.
  useEffect(() => {
    let alive = true;
    fetchScoring()
      .then((c) => alive && setCfg(c))
      .catch(() => {
        /* Defaults bleiben */
      });
    return () => {
      alive = false;
    };
  }, []);

  // Spieltage der gewählten Saison (gruppiert).
  const matchdays = useMemo(() => {
    const map = new Map<number, Match[]>();
    matches
      .filter((m) => m.seasonId === seasonId)
      .forEach((m) => {
        const arr = map.get(m.matchday) ?? [];
        arr.push(m);
        map.set(m.matchday, arr);
      });
    return [...map.entries()]
      .map(([md, ms]) => ({ matchday: md, games: ms, date: ms[0]?.date ?? '' }))
      .sort((a, b) => a.matchday - b.matchday);
  }, [matches, seasonId]);

  const dayMatches = useMemo(
    () =>
      matches
        .filter((m) => m.seasonId === seasonId && m.matchday === selectedMatchday)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.time || '').localeCompare(b.time || '')),
    [matches, seasonId, selectedMatchday]
  );

  // Kader eines Teams für diesen Spieltag: anwesende Spieler (Abend-Aufstellung),
  // sonst der ganze Kader; Torwart aus der Aufstellung vorbelegt.
  const squadFor = useCallback(
    (teamId: string): { name: string; role: StatRole }[] => {
      const team = teamById[teamId];
      if (!team) return [];
      const rt = roster[rosterKey]?.teams?.[teamId];
      const present = rt?.present;
      const keeper = rt?.goalkeeper;
      const list = (team.spielerliste || [])
        .filter((p) => (present && present.length ? present.includes(p.name) : true))
        .map((p) => ({
          name: p.name,
          role: (keeper ? p.name === keeper : p.goalkeeper) ? ('keeper' as StatRole) : ('field' as StatRole),
        }));
      return list;
    },
    [teamById, roster, rosterKey]
  );

  // Spieltag öffnen: gespeicherte Zähler laden und Zeilen für alle Spiele bauen.
  const openMatchday = useCallback(
    async (md: number) => {
      setSelectedMatchday(md);
      setSelectedMatchId(null);
      setLoadingDay(true);
      const key = leagueDayKey(seasonId, md);
      try {
        const { rows: saved, live } = await fetchDayStats(key);
        const savedMap: Record<string, { role: string; counts: ActionCounts }> = {};
        saved.forEach((r) => {
          savedMap[rowKey(r.matchId, r.teamId, r.playerName)] = {
            role: r.role,
            counts: normalizeCounts(r.counts),
          };
        });
        const next: RowMap = {};
        matches
          .filter((m) => m.seasonId === seasonId && m.matchday === md)
          .forEach((m) => {
            ([m.homeTeamId, m.awayTeamId] as const).forEach((tid) => {
              const teamName = teamById[tid]?.name ?? tid;
              squadFor(tid).forEach((pl) => {
                const k = rowKey(m.id, tid, pl.name);
                const sv = savedMap[k];
                next[k] = {
                  teamId: tid,
                  teamName,
                  playerName: pl.name,
                  role: (sv?.role as StatRole) || pl.role,
                  counts: sv?.counts ?? emptyCounts(),
                };
              });
            });
          });
        setRows(next);
        setDayLive(live);
      } catch {
        setRows({});
        setDayLive(false);
      } finally {
        setLoadingDay(false);
      }
    },
    [seasonId, matches, teamById, squadFor]
  );

  // --- Speichern (debounced je Zeile) -------------------------------------
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pending = useRef<Set<string>>(new Set());

  const flushRow = useCallback(
    async (k: string, row: EditRow, matchId: string) => {
      pending.current.add(k);
      setSaveState('saving');
      try {
        await saveTally({
          dayKey,
          matchId,
          teamId: row.teamId,
          playerName: row.playerName,
          role: row.role,
          counts: row.counts,
        });
      } catch {
        /* stiller Fehler – nächste Änderung versucht es erneut */
      } finally {
        pending.current.delete(k);
        if (pending.current.size === 0) {
          setSaveState('saved');
          setTimeout(() => setSaveState((s) => (s === 'saved' ? 'idle' : s)), 1200);
        }
      }
    },
    [dayKey]
  );

  const scheduleSave = useCallback(
    (k: string, row: EditRow, matchId: string) => {
      if (timers.current[k]) clearTimeout(timers.current[k]);
      timers.current[k] = setTimeout(() => flushRow(k, row, matchId), 650);
    },
    [flushRow]
  );

  // Undo-Stapel (letzte Klicks dieser Sitzung).
  const undoStack = useRef<{ k: string; action: keyof ActionCounts; delta: number }[]>([]);
  const [undoCount, setUndoCount] = useState(0);

  const applyDelta = useCallback(
    (k: string, matchId: string, action: keyof ActionCounts, delta: number, track = true) => {
      setRows((prev) => {
        const row = prev[k];
        if (!row) return prev;
        const cur = row.counts[action] || 0;
        const nextVal = Math.max(0, Math.min(999, cur + delta));
        if (nextVal === cur) return prev;
        const updated: EditRow = { ...row, counts: { ...row.counts, [action]: nextVal } };
        const nextRows = { ...prev, [k]: updated };
        scheduleSave(k, updated, matchId);
        return nextRows;
      });
      if (track) {
        undoStack.current.push({ k, action, delta });
        setUndoCount(undoStack.current.length);
      }
    },
    [scheduleSave]
  );

  const undo = useCallback(
    (matchId: string) => {
      const last = undoStack.current.pop();
      setUndoCount(undoStack.current.length);
      if (!last) return;
      applyDelta(last.k, matchId, last.action, -last.delta, false);
    },
    [applyDelta]
  );

  const setRole = useCallback(
    (k: string, matchId: string, role: StatRole) => {
      setRows((prev) => {
        const row = prev[k];
        if (!row) return prev;
        const updated = { ...row, role };
        scheduleSave(k, updated, matchId);
        return { ...prev, [k]: updated };
      });
    },
    [scheduleSave]
  );

  const togglePublish = useCallback(async () => {
    const next = !dayLive;
    setDayLive(next);
    try {
      await publishDay(dayKey, next);
    } catch {
      setDayLive(!next); // zurückdrehen bei Fehler
    }
  }, [dayLive, dayKey]);

  const saveScoring = useCallback(async (c: ScoringConfig) => {
    setCfg(c);
    try {
      await apiSaveScoring(c);
    } catch {
      /* still */
    }
  }, []);

  const light = theme === 'light';

  return (
    <div className={`min-h-screen font-sans text-hl-text ${light ? 'hl-team' : ''}`}>
      <div className="hl-app-bg min-h-screen flex flex-col">
        {/* Kopfleiste */}
        <header
          className="hl-app-bar sticky top-0 z-30 backdrop-blur-xl border-b border-white/10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
        >
          <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center gap-3">
            <button
              onClick={selectedMatchId ? () => setSelectedMatchId(null) : selectedMatchday !== null ? () => setSelectedMatchday(null) : onBack}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-hl-mute hover:text-hl-text transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Zurück</span>
            </button>
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-brand-accent/15 border border-brand-accent/30 grid place-items-center text-brand-accent-light shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-display font-black uppercase tracking-tight leading-none text-[15px]">Statistics Center</div>
                <div className="text-[10px] uppercase tracking-[2px] text-hl-dim leading-none mt-0.5 truncate">
                  {selectedMatchday !== null ? `Spieltag ${selectedMatchday}` : 'Spieltag wählen'}
                </div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {saveState !== 'idle' && (
                <span className="text-[10px] uppercase tracking-wider text-hl-dim flex items-center gap-1">
                  {saveState === 'saving' ? (
                    <>Speichere…</>
                  ) : (
                    <>
                      <Check className="w-3 h-3 text-hl-green" /> gespeichert
                    </>
                  )}
                </span>
              )}
              <button
                onClick={() => setScoringOpen(true)}
                title="Score-Einstellungen"
                className="w-9 h-9 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4" />
              </button>
              <button
                onClick={() => setTheme(light ? 'dark' : 'light')}
                title={light ? 'Dunkelmodus' : 'Hellmodus'}
                className="w-9 h-9 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                {light ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-5">
          {selectedMatchId ? (
            <MatchEditor
              match={dayMatches.find((m) => m.id === selectedMatchId)!}
              teamById={teamById}
              rows={rows}
              cfg={cfg}
              onDelta={applyDelta}
              onRole={setRole}
              onUndo={undo}
              undoCount={undoCount}
              onBack={() => setSelectedMatchId(null)}
            />
          ) : selectedMatchday !== null ? (
            <DayView
              matchday={selectedMatchday}
              dayMatches={dayMatches}
              teamById={teamById}
              rows={rows}
              cfg={cfg}
              loading={loadingDay}
              live={dayLive}
              onTogglePublish={togglePublish}
              onOpenMatch={setSelectedMatchId}
            />
          ) : (
            <DayList
              seasons={seasons}
              seasonId={seasonId}
              onSeason={setSeasonId}
              matchdays={matchdays}
              onOpen={openMatchday}
            />
          )}
        </main>
      </div>

      {scoringOpen && <ScoringPanel cfg={cfg} onSave={saveScoring} onClose={() => setScoringOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spieltag-Liste
// ---------------------------------------------------------------------------
function DayList({
  seasons,
  seasonId,
  onSeason,
  matchdays,
  onOpen,
}: {
  seasons: Season[];
  seasonId: string;
  onSeason: (id: string) => void;
  matchdays: { matchday: number; games: Match[]; date: string }[];
  onOpen: (md: number) => void;
}) {
  return (
    <div className="hl-fade">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h1 className="font-display font-black text-2xl uppercase tracking-tight">Spieltag auswerten</h1>
        {seasons.length > 0 && (
          <select
            value={seasonId}
            onChange={(e) => onSeason(e.target.value)}
            className="hl-input px-3 py-2 rounded-xl text-sm font-semibold"
          >
            {seasons.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {matchdays.length === 0 ? (
        <div className="hl-card p-8 text-center text-hl-mute">Keine Spiele in dieser Saison.</div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 hl-cascade-soft">
          {matchdays.map((d) => (
            <button
              key={d.matchday}
              onClick={() => onOpen(d.matchday)}
              className="hl-card p-5 text-left hover:border-brand-accent/40 transition-colors cursor-pointer group"
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-[2px] text-hl-dim">Spieltag</span>
                <ChevronRight className="w-4 h-4 text-hl-faint group-hover:text-brand-accent-light transition-colors" />
              </div>
              <div className="font-display font-black text-4xl leading-none mt-1 tabular-nums">{d.matchday}</div>
              <div className="mt-3 text-xs text-hl-mute flex items-center gap-3">
                <span>{d.games.length} Spiele</span>
                {d.date && <span className="text-hl-faint">{d.date}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spiel-Liste eines Spieltags + Live schalten
// ---------------------------------------------------------------------------
function DayView({
  matchday,
  dayMatches,
  teamById,
  rows,
  cfg,
  loading,
  live,
  onTogglePublish,
  onOpenMatch,
}: {
  matchday: number;
  dayMatches: Match[];
  teamById: Record<string, Team>;
  rows: RowMap;
  cfg: ScoringConfig;
  loading: boolean;
  live: boolean;
  onTogglePublish: () => void;
  onOpenMatch: (id: string) => void;
}) {
  const trackedCount = (matchId: string) =>
    Object.entries(rows).filter(([k, r]) => k.startsWith(`${matchId}::`) && anyCount(r.counts)).length;

  return (
    <div className="hl-fade">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-display font-black text-2xl uppercase tracking-tight">Spieltag {matchday}</h1>
        <button
          onClick={onTogglePublish}
          className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer border ${
            live
              ? 'bg-hl-green/15 border-hl-green/40 text-hl-green'
              : 'bg-white/5 border-white/10 text-hl-mute hover:text-hl-text'
          }`}
        >
          <Radio className="w-3.5 h-3.5" />
          {live ? 'Live · sichtbar' : 'Live schalten'}
        </button>
      </div>

      {loading ? (
        <div className="hl-card p-8 text-center text-hl-mute">Lade Daten…</div>
      ) : (
        <div className="grid gap-3 hl-cascade-soft">
          {dayMatches.map((m) => {
            const home = teamById[m.homeTeamId];
            const away = teamById[m.awayTeamId];
            const tracked = trackedCount(m.id);
            return (
              <button
                key={m.id}
                onClick={() => onOpenMatch(m.id)}
                className="hl-card p-4 flex items-center gap-3 text-left hover:border-brand-accent/40 transition-colors cursor-pointer"
              >
                <TeamBadge team={home} />
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">
                    {home?.name ?? m.homeTeamId} <span className="text-hl-faint">vs</span> {away?.name ?? m.awayTeamId}
                  </div>
                  <div className="text-[11px] text-hl-dim mt-0.5">
                    {m.homeScore !== null && m.awayScore !== null ? `${m.homeScore}:${m.awayScore} · ` : ''}
                    {tracked > 0 ? `${tracked} Spieler erfasst` : 'noch nicht erfasst'}
                  </div>
                </div>
                <TeamBadge team={away} />
                <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
              </button>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-hl-dim mt-5 flex items-center gap-1.5">
        <Shield className="w-3.5 h-3.5" /> „Live schalten" macht die Werte dieses Spieltags auf der Website sichtbar. Ohne
        das bleiben sie interner Entwurf.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match-Editor: das Raster
// ---------------------------------------------------------------------------
function MatchEditor({
  match,
  teamById,
  rows,
  cfg,
  onDelta,
  onRole,
  onUndo,
  undoCount,
  onBack,
}: {
  match: Match;
  teamById: Record<string, Team>;
  rows: RowMap;
  cfg: ScoringConfig;
  onDelta: (k: string, matchId: string, action: keyof ActionCounts, delta: number) => void;
  onRole: (k: string, matchId: string, role: StatRole) => void;
  onUndo: (matchId: string) => void;
  undoCount: number;
  onBack: () => void;
}) {
  const home = teamById[match.homeTeamId];
  const away = teamById[match.awayTeamId];

  const teamRows = (teamId: string) =>
    Object.entries(rows)
      .filter(([k]) => k.startsWith(`${match.id}::${teamId}::`))
      .map(([k, r]) => ({ k, r }));

  return (
    <div className="hl-fade">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-xs font-semibold uppercase tracking-wider text-hl-mute hover:text-hl-text flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Spiele
        </button>
        <h1 className="font-display font-black text-xl uppercase tracking-tight">
          {home?.name ?? match.homeTeamId} <span className="text-hl-faint">–</span> {away?.name ?? match.awayTeamId}
        </h1>
        <button
          onClick={() => onUndo(match.id)}
          disabled={undoCount === 0}
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" /> Rückgängig
        </button>
      </div>

      {[match.homeTeamId, match.awayTeamId].map((teamId) => (
        <div key={teamId} className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <TeamBadge team={teamById[teamId]} />
            <span className="font-display font-black uppercase tracking-tight">{teamById[teamId]?.name ?? teamId}</span>
          </div>
          <div className="hl-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 hl-th-name text-left px-3 py-2 text-[10px] uppercase tracking-wider text-hl-dim font-semibold">
                      Spieler
                    </th>
                    <th className="hl-th px-2 py-2 text-[10px] uppercase tracking-wider text-hl-dim font-semibold text-center">
                      Note
                    </th>
                    {ACTION_META.map((a) => (
                      <th
                        key={a.key}
                        className="hl-th px-1 py-2 text-[10px] uppercase tracking-wider font-semibold text-center whitespace-nowrap"
                        title={a.label}
                      >
                        <span className={a.sign === 1 ? 'text-hl-green' : a.sign === -1 ? 'text-hl-red' : 'text-hl-dim'}>
                          {a.short}
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {teamRows(teamId).map(({ k, r }) => {
                    const note = matchNote(r.counts, cfg, r.role);
                    const score = rohscore(r.counts, cfg, r.role);
                    return (
                      <tr key={k} className="border-t border-white/[.06]">
                        <td className="sticky left-0 z-10 hl-td-name px-3 py-1.5">
                          <div className="font-semibold whitespace-nowrap flex items-center gap-2">
                            {r.playerName}
                            <button
                              onClick={() => onRole(k, match.id, r.role === 'keeper' ? 'field' : 'keeper')}
                              title="Rolle wechseln (Feld/Torwart)"
                              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider cursor-pointer border ${
                                r.role === 'keeper'
                                  ? 'bg-hl-gold/15 border-hl-gold/40 text-hl-gold'
                                  : 'bg-white/5 border-white/10 text-hl-faint'
                              }`}
                            >
                              {r.role === 'keeper' ? 'TW' : 'Feld'}
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span
                            className="font-display font-black tabular-nums text-[15px]"
                            style={{ color: noteColor(note, cfg) }}
                            title={`Rohscore ${score}`}
                          >
                            {note.toFixed(1)}
                          </span>
                        </td>
                        {ACTION_META.map((a) => (
                          <td key={a.key} className="px-1 py-1 text-center">
                            <Stepper
                              value={r.counts[a.key] || 0}
                              sign={a.sign}
                              dim={a.keeperOnly && r.role !== 'keeper'}
                              onDelta={(d) => onDelta(k, match.id, a.key, d)}
                            />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {teamRows(teamId).length === 0 && (
                    <tr>
                      <td colSpan={ACTION_META.length + 2} className="px-3 py-4 text-center text-hl-mute text-xs">
                        Kein Kader für diesen Spieltag hinterlegt.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ))}
      <p className="text-[11px] text-hl-dim mt-1">
        Tipp: Zelle anklicken und mit <b>▲ / ▼</b> (oder + / −) zählen. „Tor" zählt automatisch als Torschuss.
      </p>
    </div>
  );
}

// Ein Zähler-Feld: −  Zahl  +  (Klick, Tastatur ▲▼ / +−).
function Stepper({
  value,
  sign,
  dim,
  onDelta,
}: {
  value: number;
  sign: 1 | 0 | -1;
  dim?: boolean;
  onDelta: (delta: number) => void;
}) {
  const active = value > 0;
  const tint =
    active && sign === 1 ? 'text-hl-green' : active && sign === -1 ? 'text-hl-red' : dim ? 'text-hl-faint' : 'text-hl-text';
  return (
    <div
      tabIndex={0}
      role="spinbutton"
      aria-valuenow={value}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === '+') {
          e.preventDefault();
          onDelta(1);
        } else if (e.key === 'ArrowDown' || e.key === '-') {
          e.preventDefault();
          onDelta(-1);
        }
      }}
      className={`inline-flex items-center gap-0.5 rounded-lg outline-none focus:ring-2 focus:ring-brand-accent/60 ${dim ? 'opacity-45' : ''}`}
    >
      <button
        onClick={() => onDelta(-1)}
        tabIndex={-1}
        className="w-4 h-5 grid place-items-center rounded text-hl-faint hover:text-hl-red hover:bg-white/5 cursor-pointer"
      >
        <Minus className="w-3 h-3" />
      </button>
      <span className={`w-6 text-center font-bold tabular-nums text-[13px] ${tint}`}>{value}</span>
      <button
        onClick={() => onDelta(1)}
        tabIndex={-1}
        className="w-4 h-5 grid place-items-center rounded text-hl-faint hover:text-hl-green hover:bg-white/5 cursor-pointer"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  );
}

function TeamBadge({ team }: { team?: Team }) {
  if (!team) return <div className="w-8 h-8 rounded-lg bg-white/5 shrink-0" />;
  return team.logoUrl ? (
    <img src={team.logoUrl} alt="" className="w-8 h-8 rounded-lg object-contain shrink-0" />
  ) : (
    <div
      className="w-8 h-8 rounded-lg grid place-items-center text-sm shrink-0"
      style={{ background: `${team.logoColor}22`, color: team.logoColor }}
    >
      {team.logoIcon || '⚽'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score-Einstellungen (Punkte, Rating-Regler, Stufen, Mindestwerte)
// ---------------------------------------------------------------------------
function ScoringPanel({
  cfg,
  onSave,
  onClose,
}: {
  cfg: ScoringConfig;
  onSave: (c: ScoringConfig) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<ScoringConfig>(cfg);
  useBackClose(true, onClose);

  const setPoint = (key: keyof ActionCounts, v: number) =>
    setDraft((d) => ({ ...d, points: { ...d.points, [key]: v } }));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="hl-modal-card relative w-full sm:max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <h2 className="font-display font-black uppercase tracking-tight text-lg">Score-Einstellungen</h2>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-4 space-y-6">
          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Punkte je Aktion</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {ACTION_META.map((a) => (
                <label key={a.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5">
                  <span className="text-[11px] text-hl-soft truncate" title={a.label}>
                    {a.label}
                  </span>
                  <input
                    type="number"
                    step="0.05"
                    value={draft.points[a.key]}
                    onChange={(e) => setPoint(a.key, parseFloat(e.target.value) || 0)}
                    className="hl-input w-16 text-right px-1.5 py-1 rounded-md text-sm tabular-nums"
                  />
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Rating-Regler (Note)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumField label="Start" value={draft.rating.base} step={0.1} onChange={(v) => setDraft((d) => ({ ...d, rating: { ...d.rating, base: v } }))} />
              <NumField label="je Punkt" value={draft.rating.factor} step={0.05} onChange={(v) => setDraft((d) => ({ ...d, rating: { ...d.rating, factor: v } }))} />
              <NumField label="Minimum" value={draft.rating.min} step={0.5} onChange={(v) => setDraft((d) => ({ ...d, rating: { ...d.rating, min: v } }))} />
              <NumField label="Maximum" value={draft.rating.max} step={0.5} onChange={(v) => setDraft((d) => ({ ...d, rating: { ...d.rating, max: v } }))} />
            </div>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Kartenstufen (ab Wert)</h3>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              <NumField label="Silber" value={draft.tiers.silber} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, silber: v } }))} />
              <NumField label="Gold" value={draft.tiers.gold} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, gold: v } }))} />
              <NumField label="Elite" value={draft.tiers.elite} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, elite: v } }))} />
              <NumField label="Hero" value={draft.tiers.hero} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, hero: v } }))} />
              <NumField label="TOTS" value={draft.tiers.tots} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, tots: v } }))} />
            </div>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Mindestwerte fürs Leaderboard</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <NumField label="Spiele" value={draft.minimums.apps} step={1} onChange={(v) => setDraft((d) => ({ ...d, minimums: { ...d.minimums, apps: v } }))} />
              <NumField label="Pässe" value={draft.minimums.passes} step={1} onChange={(v) => setDraft((d) => ({ ...d, minimums: { ...d.minimums, passes: v } }))} />
              <NumField label="Schüsse" value={draft.minimums.shots} step={1} onChange={(v) => setDraft((d) => ({ ...d, minimums: { ...d.minimums, shots: v } }))} />
              <NumField label="Zweik." value={draft.minimums.duels} step={1} onChange={(v) => setDraft((d) => ({ ...d, minimums: { ...d.minimums, duels: v } }))} />
              <NumField label="Torwart" value={draft.minimums.gk} step={1} onChange={(v) => setDraft((d) => ({ ...d, minimums: { ...d.minimums, gk: v } }))} />
            </div>
          </section>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-hl-text cursor-pointer">
            Abbrechen
          </button>
          <button
            onClick={() => {
              onSave(draft);
              onClose();
            }}
            className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent text-brand-dark hover:bg-brand-accent-light transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Speichern
          </button>
        </div>
      </div>
    </div>
  );
}

function NumField({ label, value, step, onChange }: { label: string; value: number; step: number; onChange: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wider text-hl-dim">{label}</span>
      <input
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="hl-input px-2 py-1.5 rounded-lg text-sm tabular-nums"
      />
    </label>
  );
}

// --- kleine Helfer ----------------------------------------------------------
function anyCount(c: ActionCounts): boolean {
  return Object.values(c).some((v) => v > 0);
}

// Note-Farbe: rot (schwach) → gelb → grün (stark), relativ zur Skala.
function noteColor(note: number, cfg: ScoringConfig): string {
  const span = cfg.rating.max - cfg.rating.min || 1;
  const t = Math.max(0, Math.min(1, (note - cfg.rating.min) / span));
  if (t < 0.5) return '#FF5442';
  if (t < 0.7) return '#E9C46A';
  return '#43E5A0';
}
