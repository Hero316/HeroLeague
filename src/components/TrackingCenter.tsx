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
  FlaskConical,
  FileSpreadsheet,
} from 'lucide-react';
import type {
  ActionCounts,
  EventArchive,
  EventConfig,
  Match,
  RosterMap,
  ScoringConfig,
  Season,
  StatRole,
  Team,
} from '../types';
import { ACTION_META, DEFAULT_SCORING } from '../lib/scoring';
import { emptyCounts, matchNote, normalizeCounts, rohscore } from '../lib/rating';
import { useBackClose, goBackLayer } from '../lib/backStack';
import {
  fetchScoring,
  saveScoring as apiSaveScoring,
  fetchDayStats,
  saveTally,
  publishDay,
  leagueDayKey,
  eventDayKey,
  testSheet,
  exportToSheet,
} from '../lib/stats';

// ===========================================================================
// Statistics Center — Erfassungs-Editor (Etappe 2 + 3)
// Eigene, app-artige Seite. Wertet Liga-Spieltage UND Testspielabende aus:
// Tag → Spiel → Raster. Pro Spieler jede Aktion per Klick (+1 / ▲▼ / Tastatur),
// Live-Note, Rückgängig, Entwurf → Live. Testspiele sind namensbasiert und
// bleiben vollständig von der Liga getrennt.
// ===========================================================================

interface Props {
  teams: Team[];
  matches: Match[];
  seasons: Season[];
  roster: RosterMap;
  eventArchive: EventArchive | null;
  onBack: () => void;
}

interface EditRow {
  teamId: string; // Liga: Team-ID · Testspiel: Team-Name
  teamName: string;
  playerName: string;
  role: StatRole;
  counts: ActionCounts;
}

type RowMap = Record<string, EditRow>; // Schlüssel: `${matchId}::${teamId}::${name}`

const rowKey = (matchId: string, teamId: string, name: string) => `${matchId}::${teamId}::${name}`;
const normName = (s: string) => s.toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();

export default function TrackingCenter({ teams, matches, seasons, roster, eventArchive, onBack }: Props) {
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

  const currentSeason = seasons.find((s) => s.isCurrent) ?? seasons[0] ?? null;
  const [seasonId, setSeasonId] = useState<string>(currentSeason?.id ?? '');
  useEffect(() => {
    if (!seasonId && currentSeason) setSeasonId(currentSeason.id);
  }, [currentSeason, seasonId]);

  const events = useMemo(() => eventArchive?.events ?? [], [eventArchive]);

  // Auswahl: entweder ein Liga-Spieltag ODER ein Testspielabend.
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const dayActive = selectedMatchday !== null || selectedEventId !== null;
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  // Zwei gestapelte Zurück-Ebenen: Spiel-Editor liegt ÜBER der Spieltag-Ansicht.
  // Ein Zurück schließt immer nur die oberste Ebene (Spiel → Spiele → Auswahl).
  useBackClose(selectedMatchId !== null, () => setSelectedMatchId(null));
  useBackClose(dayActive, () => {
    setSelectedMatchId(null);
    setSelectedMatchday(null);
    setSelectedEventId(null);
  });

  const [rows, setRows] = useState<RowMap>({});
  const [dayLive, setDayLive] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const dayKey = selectedEventId
    ? eventDayKey(selectedEventId)
    : selectedMatchday !== null && seasonId
      ? leagueDayKey(seasonId, selectedMatchday)
      : '';

  const teamById = useMemo(() => {
    const m: Record<string, Team> = {};
    teams.forEach((t) => (m[t.id] = t));
    return m;
  }, [teams]);

  // Schlüssel (Team-ID oder Team-Name) → echter Verein (für Wappen + Kader).
  const resolveTeam = useCallback(
    (key: string): Team | undefined => {
      if (teamById[key]) return teamById[key];
      const n = normName(key);
      return teams.find((t) => normName(t.name) === n || normName(t.shortName) === n);
    },
    [teamById, teams]
  );

  useEffect(() => {
    let alive = true;
    fetchScoring()
      .then((c) => alive && setCfg(c))
      .catch(() => {
        /* Defaults */
      });
    return () => {
      alive = false;
    };
  }, []);

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

  // Event-Spiele als Match-artige Objekte (namensbasiert).
  const eventGamesAsMatches = useCallback((ev: EventConfig): Match[] => {
    return (ev.matches || []).map(
      (em) =>
        ({
          id: em.id,
          seasonId: `event:${ev.id}`,
          matchday: em.block ?? 0,
          homeTeamId: em.home,
          awayTeamId: em.away,
          homeScore: em.homeScore,
          awayScore: em.awayScore,
          date: ev.date ?? '',
          time: em.start ?? '',
          status: em.status ?? 'geplant',
        }) as Match
    );
  }, []);

  const dayMatches = useMemo(() => {
    if (selectedEvent) return eventGamesAsMatches(selectedEvent);
    if (selectedMatchday !== null)
      return matches
        .filter((m) => m.seasonId === seasonId && m.matchday === selectedMatchday)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.time || '').localeCompare(b.time || ''));
    return [];
  }, [selectedEvent, selectedMatchday, matches, seasonId, eventGamesAsMatches]);

  // Kader eines Teams: aus dem echten Verein. Bei Liga zusätzlich auf die
  // Abend-Aufstellung gefiltert (rk = Roster-Schlüssel); bei Events voller Kader.
  const squadFor = useCallback(
    (key: string, rk: string | null): { name: string; role: StatRole }[] => {
      const team = resolveTeam(key);
      if (!team) return [];
      const rt = rk ? roster[rk]?.teams?.[team.id] : undefined;
      const present = rt?.present;
      const keeper = rt?.goalkeeper;
      return (team.spielerliste || [])
        .filter((p) => (present && present.length ? present.includes(p.name) : true))
        .map((p) => ({
          name: p.name,
          role: (keeper ? p.name === keeper : p.goalkeeper) ? ('keeper' as StatRole) : ('field' as StatRole),
        }));
    },
    [resolveTeam, roster]
  );

  // Zeilen für einen Tag bauen (Liga oder Event) und gespeicherte Zähler laden.
  const buildRows = useCallback(
    async (key: string, games: Match[], rk: string | null) => {
      setLoadingDay(true);
      try {
        const { rows: saved, live } = await fetchDayStats(key);
        const savedMap: Record<string, { role: string; counts: ActionCounts }> = {};
        saved.forEach((r) => {
          savedMap[rowKey(r.matchId, r.teamId, r.playerName)] = { role: r.role, counts: normalizeCounts(r.counts) };
        });
        const next: RowMap = {};
        games.forEach((m) => {
          ([m.homeTeamId, m.awayTeamId] as const).forEach((tid) => {
            const teamName = resolveTeam(tid)?.name ?? tid;
            squadFor(tid, rk).forEach((pl) => {
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
    [resolveTeam, squadFor]
  );

  const openMatchday = useCallback(
    (md: number) => {
      setSelectedEventId(null);
      setSelectedMatchday(md);
      setSelectedMatchId(null);
      const games = matches
        .filter((m) => m.seasonId === seasonId && m.matchday === md)
        .sort((a, b) => (a.slot ?? 0) - (b.slot ?? 0) || (a.time || '').localeCompare(b.time || ''));
      buildRows(leagueDayKey(seasonId, md), games, `${seasonId}:${md}`);
    },
    [matches, seasonId, buildRows]
  );

  const openEvent = useCallback(
    (ev: EventConfig) => {
      setSelectedMatchday(null);
      setSelectedEventId(ev.id);
      setSelectedMatchId(null);
      buildRows(eventDayKey(ev.id), eventGamesAsMatches(ev), null);
    },
    [buildRows, eventGamesAsMatches]
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
        scheduleSave(k, updated, matchId);
        return { ...prev, [k]: updated };
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
      setDayLive(!next);
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

  const [sheetTesting, setSheetTesting] = useState(false);
  const runSheetTest = useCallback(async () => {
    setSheetTesting(true);
    try {
      const info = await testSheet();
      window.alert(`✅ Verbunden mit „${info.title}".\n\nBlätter: ${info.sheets.join(', ')}`);
    } catch (e) {
      window.alert('❌ ' + (e instanceof Error ? e.message : 'Verbindung fehlgeschlagen'));
    } finally {
      setSheetTesting(false);
    }
  }, []);

  const [exporting, setExporting] = useState(false);
  const runExport = useCallback(async () => {
    if (!dayKey || selectedEventId) return;
    if (!window.confirm('Die getrackten Werte dieses Spieltags in das Google Sheet („Match-Tracking") kopieren?')) return;
    setExporting(true);
    try {
      const r = await exportToSheet(dayKey);
      let msg = `✅ In Excel kopiert.\n\nSpiele: ${r.matches}\nSpieler: ${r.players} (davon ${r.placedNew} neu ins Sheet eingetragen)\nGesetzte Werte: ${r.written}`;
      if (r.unmatched?.length) {
        msg += `\n\n⚠️ Nicht zugeordnet (${r.unmatched.length}):\n- ` + r.unmatched.slice(0, 12).join('\n- ');
        if (r.unmatched.length > 12) msg += `\n- … und ${r.unmatched.length - 12} weitere`;
      }
      window.alert(msg);
    } catch (e) {
      window.alert('❌ ' + (e instanceof Error ? e.message : 'Kopieren fehlgeschlagen'));
    } finally {
      setExporting(false);
    }
  }, [dayKey, selectedEventId]);

  const light = theme === 'light';
  const headerSub = selectedEvent
    ? selectedEvent.title || 'Testspiel'
    : selectedMatchday !== null
      ? `Spieltag ${selectedMatchday}`
      : 'Tag wählen';

  return (
    <div className={`min-h-screen font-sans text-hl-text ${light ? 'hl-team' : ''}`}>
      <div className="hl-app-bg min-h-screen flex flex-col">
        <header
          className="hl-app-bar sticky top-0 z-30 backdrop-blur-xl border-b border-white/10"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.6rem)' }}
        >
          <div className="max-w-6xl mx-auto px-4 pb-3 flex items-center gap-3">
            <button
              onClick={() => {
                if (selectedMatchId !== null || dayActive) goBackLayer();
                else onBack();
              }}
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
                <div className="text-[10px] uppercase tracking-[2px] text-hl-dim leading-none mt-0.5 truncate">{headerSub}</div>
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={runSheetTest}
                disabled={sheetTesting}
                title="Excel-Verbindung testen (schreibt nichts)"
                className="h-9 px-3 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
              >
                {sheetTesting ? '…' : 'Excel testen'}
              </button>
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
              resolveTeam={resolveTeam}
              rows={rows}
              cfg={cfg}
              onDelta={applyDelta}
              onRole={setRole}
              onUndo={undo}
              undoCount={undoCount}
              onBack={goBackLayer}
            />
          ) : dayActive ? (
            <DayView
              title={selectedEvent ? selectedEvent.title || 'Testspiel' : `Spieltag ${selectedMatchday}`}
              isEvent={!!selectedEvent}
              dayMatches={dayMatches}
              resolveTeam={resolveTeam}
              rows={rows}
              loading={loadingDay}
              live={dayLive}
              onTogglePublish={togglePublish}
              onOpenMatch={setSelectedMatchId}
              onExport={selectedEvent ? undefined : runExport}
              exporting={exporting}
            />
          ) : (
            <DayList
              seasons={seasons}
              seasonId={seasonId}
              onSeason={setSeasonId}
              matchdays={matchdays}
              events={events}
              activeEventId={eventArchive?.activeId ?? null}
              onOpen={openMatchday}
              onOpenEvent={openEvent}
            />
          )}
        </main>
      </div>

      {scoringOpen && <ScoringPanel cfg={cfg} onSave={saveScoring} onClose={() => setScoringOpen(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tag-Liste: Liga-Spieltage + Testspielabende
// ---------------------------------------------------------------------------
function DayList({
  seasons,
  seasonId,
  onSeason,
  matchdays,
  events,
  activeEventId,
  onOpen,
  onOpenEvent,
}: {
  seasons: Season[];
  seasonId: string;
  onSeason: (id: string) => void;
  matchdays: { matchday: number; games: Match[]; date: string }[];
  events: EventConfig[];
  activeEventId: string | null;
  onOpen: (md: number) => void;
  onOpenEvent: (ev: EventConfig) => void;
}) {
  return (
    <div className="hl-fade space-y-8">
      <div>
        <div className="flex items-center justify-between gap-3 mb-4">
          <h1 className="font-display font-black text-2xl uppercase tracking-tight">Spieltag auswerten</h1>
          {seasons.length > 0 && (
            <select value={seasonId} onChange={(e) => onSeason(e.target.value)} className="hl-input px-3 py-2 rounded-xl text-sm font-semibold">
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

      {events.length > 0 && (
        <div>
          <h2 className="font-display font-black text-lg uppercase tracking-tight mb-3 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-hl-magenta" /> Testspielabende
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 hl-cascade-soft">
            {events.map((ev) => (
              <button
                key={ev.id}
                onClick={() => onOpenEvent(ev)}
                className="hl-card p-5 text-left hover:border-hl-magenta/50 transition-colors cursor-pointer group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[2px] text-hl-magenta">{ev.id === activeEventId ? 'Aktiv' : 'Testspiel'}</span>
                  <ChevronRight className="w-4 h-4 text-hl-faint group-hover:text-hl-magenta transition-colors" />
                </div>
                <div className="font-display font-black text-xl leading-tight mt-1">{ev.title || ev.label || 'Testspiel'}</div>
                <div className="mt-2 text-xs text-hl-mute flex items-center gap-3">
                  <span>{ev.teams?.length ?? 0} Teams</span>
                  <span className="text-hl-faint">{ev.matches?.length ?? 0} Spiele</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Spiel-Liste eines Tages + Live schalten
// ---------------------------------------------------------------------------
function DayView({
  title,
  isEvent,
  dayMatches,
  resolveTeam,
  rows,
  loading,
  live,
  onTogglePublish,
  onOpenMatch,
  onExport,
  exporting,
}: {
  title: string;
  isEvent: boolean;
  dayMatches: Match[];
  resolveTeam: (key: string) => Team | undefined;
  rows: RowMap;
  loading: boolean;
  live: boolean;
  onTogglePublish: () => void;
  onOpenMatch: (id: string) => void;
  onExport?: () => void;
  exporting?: boolean;
}) {
  const trackedCount = (matchId: string) =>
    Object.entries(rows).filter(([k, r]) => k.startsWith(`${matchId}::`) && anyCount(r.counts)).length;

  return (
    <div className="hl-fade">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <h1 className="font-display font-black text-2xl uppercase tracking-tight flex items-center gap-2">
          {isEvent && <FlaskConical className="w-5 h-5 text-hl-magenta" />}
          {title}
        </h1>
        <div className="flex items-center gap-2">
          {onExport && (
            <button
              onClick={onExport}
              disabled={exporting}
              title="Diese Werte ins Google Sheet kopieren"
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer border border-white/10 bg-white/5 text-hl-mute hover:text-hl-text disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              {exporting ? 'Kopiere…' : 'In Excel kopieren'}
            </button>
          )}
          <button
            onClick={onTogglePublish}
            className={`px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer border ${
              live ? 'bg-hl-green/15 border-hl-green/40 text-hl-green' : 'bg-white/5 border-white/10 text-hl-mute hover:text-hl-text'
            }`}
          >
            <Radio className="w-3.5 h-3.5" />
            {live ? 'Live · sichtbar' : 'Live schalten'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="hl-card p-8 text-center text-hl-mute">Lade Daten…</div>
      ) : (
        <div className="grid gap-3 hl-cascade-soft">
          {dayMatches.map((m) => {
            const home = resolveTeam(m.homeTeamId);
            const away = resolveTeam(m.awayTeamId);
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
        <Shield className="w-3.5 h-3.5" /> „Live schalten" macht die Werte {isEvent ? 'dieses Testspiels' : 'dieses Spieltags'} auf der
        Website sichtbar. Ohne das bleiben sie interner Entwurf.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Match-Editor: das Raster
// ---------------------------------------------------------------------------
function MatchEditor({
  match,
  resolveTeam,
  rows,
  cfg,
  onDelta,
  onRole,
  onUndo,
  undoCount,
  onBack,
}: {
  match: Match;
  resolveTeam: (key: string) => Team | undefined;
  rows: RowMap;
  cfg: ScoringConfig;
  onDelta: (k: string, matchId: string, action: keyof ActionCounts, delta: number) => void;
  onRole: (k: string, matchId: string, role: StatRole) => void;
  onUndo: (matchId: string) => void;
  undoCount: number;
  onBack: () => void;
}) {
  const home = resolveTeam(match.homeTeamId);
  const away = resolveTeam(match.awayTeamId);

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
            <TeamBadge team={resolveTeam(teamId)} />
            <span className="font-display font-black uppercase tracking-tight">{resolveTeam(teamId)?.name ?? teamId}</span>
          </div>
          <div className="hl-card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="sticky left-0 z-10 hl-th-name text-left px-3 py-2 text-[10px] uppercase tracking-wider text-hl-dim font-semibold">Spieler</th>
                    <th className="hl-th px-2 py-2 text-[10px] uppercase tracking-wider text-hl-dim font-semibold text-center">Note</th>
                    {ACTION_META.map((a) => (
                      <th key={a.key} className="hl-th px-1 py-2 text-[10px] uppercase tracking-wider font-semibold text-center whitespace-nowrap" title={a.label}>
                        <span className={a.sign === 1 ? 'text-hl-green' : a.sign === -1 ? 'text-hl-red' : 'text-hl-dim'}>{a.short}</span>
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
                                r.role === 'keeper' ? 'bg-hl-gold/15 border-hl-gold/40 text-hl-gold' : 'bg-white/5 border-white/10 text-hl-faint'
                              }`}
                            >
                              {r.role === 'keeper' ? 'TW' : 'Feld'}
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <span className="font-display font-black tabular-nums text-[15px]" style={{ color: noteColor(note, cfg) }} title={`Rohscore ${score}`}>
                            {note.toFixed(1)}
                          </span>
                        </td>
                        {ACTION_META.map((a) => (
                          <td key={a.key} className="px-1 py-1 text-center">
                            <Stepper value={r.counts[a.key] || 0} sign={a.sign} dim={a.keeperOnly && r.role !== 'keeper'} onDelta={(d) => onDelta(k, match.id, a.key, d)} />
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                  {teamRows(teamId).length === 0 && (
                    <tr>
                      <td colSpan={ACTION_META.length + 2} className="px-3 py-4 text-center text-hl-mute text-xs">
                        Kein Kader hinterlegt. Für Testspiele muss der Team-Name mit einem Verein übereinstimmen (Kader kommt von dort).
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

function Stepper({ value, sign, dim, onDelta }: { value: number; sign: 1 | 0 | -1; dim?: boolean; onDelta: (delta: number) => void }) {
  const active = value > 0;
  const tint = active && sign === 1 ? 'text-hl-green' : active && sign === -1 ? 'text-hl-red' : dim ? 'text-hl-faint' : 'text-hl-text';
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
      <button onClick={() => onDelta(-1)} tabIndex={-1} className="w-4 h-5 grid place-items-center rounded text-hl-faint hover:text-hl-red hover:bg-white/5 cursor-pointer">
        <Minus className="w-3 h-3" />
      </button>
      <span className={`w-6 text-center font-bold tabular-nums text-[13px] ${tint}`}>{value}</span>
      <button onClick={() => onDelta(1)} tabIndex={-1} className="w-4 h-5 grid place-items-center rounded text-hl-faint hover:text-hl-green hover:bg-white/5 cursor-pointer">
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
    <div className="w-8 h-8 rounded-lg grid place-items-center text-sm shrink-0" style={{ background: `${team.logoColor}22`, color: team.logoColor }}>
      {team.logoIcon || '⚽'}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score-Einstellungen
// ---------------------------------------------------------------------------
function ScoringPanel({ cfg, onSave, onClose }: { cfg: ScoringConfig; onSave: (c: ScoringConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScoringConfig>(cfg);
  useBackClose(true, onClose);

  const setPoint = (key: keyof ActionCounts, v: number) => setDraft((d) => ({ ...d, points: { ...d.points, [key]: v } }));

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
      <input type="number" step={step} value={value} onChange={(e) => onChange(parseFloat(e.target.value) || 0)} className="hl-input px-2 py-1.5 rounded-lg text-sm tabular-nums" />
    </label>
  );
}

// --- Helfer -----------------------------------------------------------------
function anyCount(c: ActionCounts): boolean {
  return Object.values(c).some((v) => v > 0);
}

function noteColor(note: number, cfg: ScoringConfig): string {
  const span = cfg.rating.max - cfg.rating.min || 1;
  const t = Math.max(0, Math.min(1, (note - cfg.rating.min) / span));
  if (t < 0.5) return '#FF5442';
  if (t < 0.7) return '#E9C46A';
  return '#43E5A0';
}
