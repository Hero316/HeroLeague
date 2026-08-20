import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  Sun,
  Moon,
  SlidersHorizontal,
  Radio,
  ChevronRight,
  Check,
  Shield,
  Trophy,
  Undo2,
  X,
  FlaskConical,
  FileSpreadsheet,
  Users,
} from 'lucide-react';
import type {
  ActionCounts,
  EveningRoster,
  EventArchive,
  EventConfig,
  Match,
  RosterMap,
  ScoringConfig,
  Season,
  StatRole,
  Team,
} from '../types';
import {
  ACTION_META,
  DEFAULT_SCORING,
  FIELD_GROUPS,
  KEEPER_GROUPS,
  KEEPER_PASS_KEYS,
  type ActionGroup,
  type ActionMeta,
  type ActionTone,
} from '../lib/scoring';
import { emptyCounts, matchNote, normalizeCounts, rohscore } from '../lib/rating';
import { shortDate } from './ui';
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
  exportScoringToSheet,
  saveAttendance,
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
  activeSeasonId: string; // real ODER Demo – bestimmt die Tracking-Schlüssel
  demoActive?: boolean; // im Demo-Modus: kein Excel-Export
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
const NAV_KEY = 'hl-tracking-nav'; // gemerkte Position (Spieltag/Spiel) für Seiten-Neuladen

// Reihenfolge der Spiele exakt wie im Spielplan (DB-Reihenfolge):
// Datum, Uhrzeit, ID. So steht ein Spiel im Tracker an derselben Stelle wie dort.
const cmpMatches = (a: Match, b: Match) =>
  (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || '') || a.id.localeCompare(b.id);

export default function TrackingCenter({
  teams,
  matches,
  seasons,
  roster,
  eventArchive,
  activeSeasonId,
  demoActive,
  onBack,
}: Props) {
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

  // Aktive Saison (echt ODER Demo) bestimmt alle Tracking-Schlüssel → automatische
  // Trennung: Demo-Tracking landet unter der Demo-Saison-ID, nie bei echten Daten.
  const [seasonId, setSeasonId] = useState<string>(activeSeasonId || seasons[0]?.id || '');
  useEffect(() => {
    if (activeSeasonId) setSeasonId(activeSeasonId);
  }, [activeSeasonId]);

  const events = useMemo(() => eventArchive?.events ?? [], [eventArchive]);

  // Auswahl: entweder ein Liga-Spieltag ODER ein Testspielabend.
  const [selectedMatchday, setSelectedMatchday] = useState<number | null>(null);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedMatchId, setSelectedMatchId] = useState<string | null>(null);
  const dayActive = selectedMatchday !== null || selectedEventId !== null;
  const selectedEvent = events.find((e) => e.id === selectedEventId) ?? null;

  // Zwei gestapelte Zurück-Ebenen: Spiel-Editor liegt ÜBER der Spieltag-Ansicht.
  // Ein Zurück schließt immer nur die oberste Ebene (Spiel → Spiele → Auswahl).
  // WICHTIG die Reihenfolge: Die Spieltag-Ebene MUSS zuerst registriert werden,
  // damit sie beim Wiederherstellen (beide Ebenen entstehen gleichzeitig) UNTEN
  // liegt und der Spiel-Editor oben – sonst schließt „Zurück" gleich alles.
  useBackClose(dayActive, () => {
    setSelectedMatchId(null);
    setSelectedMatchday(null);
    setSelectedEventId(null);
  });
  useBackClose(selectedMatchId !== null, () => setSelectedMatchId(null));

  // Merkt sich, ob die Wiederherstellung nach einem Neuladen bereits gelaufen ist.
  // Erst DANACH darf die Position gespeichert werden – sonst würde der erste
  // (leere) Render die gemerkte Position sofort wieder löschen, bevor sie beim
  // Neuladen gelesen werden kann.
  const restoredRef = useRef(false);

  // Position im Tracker merken (Spieltag/Spiel), damit ein Neuladen der Seite
  // NICHT zurück auf die Auswahl springt. Wird beim Verlassen wieder geleert.
  useEffect(() => {
    if (!restoredRef.current) return; // vor der Wiederherstellung nichts anfassen
    try {
      if (selectedMatchday === null && selectedEventId === null) {
        sessionStorage.removeItem(NAV_KEY);
      } else {
        sessionStorage.setItem(
          NAV_KEY,
          JSON.stringify({ md: selectedMatchday, ev: selectedEventId, mid: selectedMatchId })
        );
      }
    } catch {
      /* egal */
    }
  }, [selectedMatchday, selectedEventId, selectedMatchId]);

  const [rows, setRows] = useState<RowMap>({});
  const [dayLive, setDayLive] = useState(false);
  const [loadingDay, setLoadingDay] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Lokaler Aufstellungs-Stand (Anwesenheit/Torwart) – wird beim Speichern im
  // Tracker sofort aktualisiert; folgt sonst dem Prop.
  const [rosterState, setRosterState] = useState<RosterMap>(roster);
  useEffect(() => setRosterState(roster), [roster]);
  const [attendanceOpen, setAttendanceOpen] = useState(false);

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
      return matches.filter((m) => m.seasonId === seasonId && m.matchday === selectedMatchday).sort(cmpMatches);
    return [];
  }, [selectedEvent, selectedMatchday, matches, seasonId, eventGamesAsMatches]);

  // Kader eines Teams für den Spieltag – NUR anwesende Spieler:
  //  • Ist eine Abend-Aufstellung gesetzt, gilt deren Anwesenheitsliste.
  //  • Zusätzlich werden für den Spieltag als abwesend markierte Spieler
  //    ausgeblendet (aus der Spiel-Verwaltung, `absent`).
  // Bei Events (kein rk) wird nicht nach Aufstellung gefiltert.
  const squadFor = useCallback(
    (key: string, rk: string | null, absent?: Set<string>, rmap?: RosterMap): { name: string; role: StatRole }[] => {
      const team = resolveTeam(key);
      if (!team) return [];
      const rt = rk ? (rmap ?? rosterState)[rk]?.teams?.[team.id] : undefined;
      const present = rt?.present;
      const keeper = rt?.goalkeeper;
      return (team.spielerliste || [])
        .filter((p) => (present && present.length ? present.includes(p.name) : true))
        .filter((p) => !absent || !absent.has(p.name))
        .map((p) => ({
          name: p.name,
          role: (keeper ? p.name === keeper : p.goalkeeper) ? ('keeper' as StatRole) : ('field' as StatRole),
        }));
    },
    [resolveTeam, rosterState]
  );

  // Zeilen für einen Tag bauen (Liga oder Event) und gespeicherte Zähler laden.
  const buildRows = useCallback(
    async (key: string, games: Match[], rk: string | null, rmap?: RosterMap) => {
      setLoadingDay(true);
      try {
        const { rows: saved, live } = await fetchDayStats(key);
        const savedMap: Record<string, { role: string; counts: ActionCounts }> = {};
        saved.forEach((r) => {
          savedMap[rowKey(r.matchId, r.teamId, r.playerName)] = { role: r.role, counts: normalizeCounts(r.counts) };
        });
        // Für den Spieltag als abwesend markierte Spieler je Team (Union über alle
        // Spiele des Tages) – so wirkt ein „Rausnehmen" im Backend spieltagsweit.
        const absentByTeam: Record<string, Set<string>> = {};
        games.forEach((m) => {
          (m.absentees || []).forEach((a) => {
            (absentByTeam[a.teamId] ??= new Set<string>()).add(a.playerName);
          });
        });

        const next: RowMap = {};
        games.forEach((m) => {
          ([m.homeTeamId, m.awayTeamId] as const).forEach((tid) => {
            const teamName = resolveTeam(tid)?.name ?? tid;
            squadFor(tid, rk, absentByTeam[tid], rmap).forEach((pl) => {
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

        // Sicherheitsnetz: bereits getrackte Spieler immer sichtbar lassen,
        // auch wenn sie inzwischen als abwesend markiert wurden (keine Daten „verstecken").
        const dayGameIds = new Set(games.map((g) => g.id));
        saved.forEach((r) => {
          if (!dayGameIds.has(r.matchId)) return;
          const k = rowKey(r.matchId, r.teamId, r.playerName);
          if (next[k]) return;
          next[k] = {
            teamId: r.teamId,
            teamName: resolveTeam(r.teamId)?.name ?? r.teamId,
            playerName: r.playerName,
            role: (r.role as StatRole) || 'field',
            counts: normalizeCounts(r.counts),
          };
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
      const games = matches.filter((m) => m.seasonId === seasonId && m.matchday === md).sort(cmpMatches);
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

  // Nach einem Neuladen die zuletzt offene Position wiederherstellen (Spieltag →
  // ggf. Spiel). Läuft genau EINMAL, sobald die Grunddaten geladen sind. So
  // landet man nach „Aktualisieren" wieder dort, wo man war – nicht auf der Auswahl.
  useEffect(() => {
    if (restoredRef.current) return;
    if (matches.length === 0 && events.length === 0) return; // erst mit Daten
    let saved: { md?: number | null; ev?: string | null; mid?: string | null } | null = null;
    try {
      const raw = sessionStorage.getItem(NAV_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch {
      saved = null;
    }
    restoredRef.current = true;
    if (!saved) return;
    if (saved.ev) {
      const ev = events.find((e) => e.id === saved!.ev);
      if (!ev) return;
      openEvent(ev);
      if (saved.mid && (ev.matches || []).some((m) => m.id === saved!.mid)) setSelectedMatchId(saved.mid);
      return;
    }
    if (saved.md != null && matches.some((m) => m.seasonId === seasonId && m.matchday === saved!.md)) {
      openMatchday(saved.md);
      if (saved.mid && matches.some((m) => m.id === saved!.mid)) setSelectedMatchId(saved.mid);
    }
  }, [matches, events, seasonId, openMatchday, openEvent]);

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

  // Teams des aktuell gewählten Spieltags (für die Anwesenheit).
  const dayTeamIds = useMemo(() => {
    const s = new Set<string>();
    dayMatches.forEach((m) => {
      s.add(m.homeTeamId);
      s.add(m.awayTeamId);
    });
    return [...s];
  }, [dayMatches]);

  // Anwesenheit/Torwart für den Spieltag speichern und Raster neu aufbauen.
  const applyAttendance = useCallback(
    async (teams: EveningRoster['teams'], minutes: number) => {
      if (selectedMatchday === null || !seasonId) return;
      const rk = `${seasonId}:${selectedMatchday}`;
      const nextRoster: RosterMap = { ...rosterState, [rk]: { minutes, teams } };
      setRosterState(nextRoster);
      setAttendanceOpen(false);
      try {
        await saveAttendance(seasonId, selectedMatchday, minutes, teams);
      } catch {
        /* lokal ist es schon aktualisiert */
      }
      const games = matches.filter((m) => m.seasonId === seasonId && m.matchday === selectedMatchday).sort(cmpMatches);
      buildRows(leagueDayKey(seasonId, selectedMatchday), games, rk, nextRoster);
    },
    [selectedMatchday, seasonId, rosterState, matches, buildRows]
  );

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
          <div className={`${selectedMatchId ? 'max-w-[2600px]' : 'max-w-6xl'} mx-auto px-4 pb-3 flex items-center gap-3`}>
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
              {!demoActive && (
                <button
                  onClick={runSheetTest}
                  disabled={sheetTesting}
                  title="Excel-Verbindung testen (schreibt nichts)"
                  className="h-9 px-3 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-[11px] font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50"
                >
                  {sheetTesting ? '…' : 'Excel testen'}
                </button>
              )}
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

        <main className={`flex-1 ${selectedMatchId ? 'max-w-[2600px]' : 'max-w-6xl'} w-full mx-auto px-4 py-5`}>
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
              onExport={selectedEvent || demoActive ? undefined : runExport}
              exporting={exporting}
              onAttendance={selectedEvent ? undefined : () => setAttendanceOpen(true)}
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
      {attendanceOpen && selectedMatchday !== null && (
        <AttendancePanel
          teamIds={dayTeamIds}
          resolveTeam={resolveTeam}
          roster={rosterState}
          rk={`${seasonId}:${selectedMatchday}`}
          onClose={() => setAttendanceOpen(false)}
          onSave={applyAttendance}
        />
      )}
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
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 hl-cascade-soft">
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
                  {d.date && <span className="text-hl-faint">{shortDate(d.date)}</span>}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 hl-cascade-soft">
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
  onAttendance,
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
  onAttendance?: () => void;
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
        <div className="flex flex-wrap items-center justify-end gap-2 min-w-0">
          {onAttendance && (
            <button
              onClick={onAttendance}
              title="Wer war heute da?"
              className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition-colors cursor-pointer border border-white/10 bg-white/5 text-hl-mute hover:text-hl-text"
            >
              <Users className="w-3.5 h-3.5" />
              Anwesenheit
            </button>
          )}
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
        <div className="grid grid-cols-1 gap-3 hl-cascade-soft">
          {dayMatches.map((m) => {
            const home = resolveTeam(m.homeTeamId);
            const away = resolveTeam(m.awayTeamId);
            const tracked = trackedCount(m.id);
            return (
              <button
                key={m.id}
                onClick={() => onOpenMatch(m.id)}
                className="hl-card p-4 flex items-center gap-3 text-left min-w-0 hover:border-brand-accent/40 transition-colors cursor-pointer"
              >
                <TeamBadge team={home} />
                <div className="flex-1 min-w-0">
                  {(m.time || m.date) && (
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-hl-faint mb-0.5">
                      {m.date ? shortDate(m.date) : ''}
                      {m.date && m.time ? ' · ' : ''}
                      {m.time ? `${m.time} Uhr` : ''}
                    </div>
                  )}
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

      {/* Am PC beide Mannschaften nebeneinander (2 Spalten) – kompakter, kein Scrollen. */}
      <div className="grid xl:grid-cols-2 gap-x-5 items-start">
      {[match.homeTeamId, match.awayTeamId].map((teamId) => {
        const list = teamRows(teamId);
        return (
          <div key={teamId} className="mb-6 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <TeamBadge team={resolveTeam(teamId)} />
              <span className="font-display font-black uppercase tracking-tight">{resolveTeam(teamId)?.name ?? teamId}</span>
            </div>
            {list.length === 0 ? (
              <div className="hl-card p-4 text-center text-hl-mute text-xs">
                Kein Kader hinterlegt. Bei Testspielen muss der Team-Name mit einem Verein übereinstimmen.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 hl-cascade-soft">
                {list.map(({ k, r }, i) => (
                  <PlayerCard
                    key={k}
                    slot={i + 1}
                    row={r}
                    cfg={cfg}
                    onDelta={(action, delta) => onDelta(k, match.id, action, delta)}
                    onToggleRole={() => onRole(k, match.id, r.role === 'keeper' ? 'field' : 'keeper')}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
      </div>
      <p className="text-[11px] text-hl-dim mt-1">
        <b>Linksklick +1 · Rechtsklick −1</b> · am Handy lang drücken = −1 · „Tor" zählt automatisch als Torschuss.
      </p>
    </div>
  );
}

// Eine Spieler-Karte: Identität (Slot, Name, Live-Note, Rolle) + Gruppen mit
// farbigen Aktions-Pillen (wie im HERO Match Tracker).
function PlayerCard({
  slot,
  row,
  cfg,
  onDelta,
  onToggleRole,
}: {
  slot: number;
  row: EditRow;
  cfg: ScoringConfig;
  onDelta: (action: keyof ActionCounts, delta: number) => void;
  onToggleRole: () => void;
}) {
  const isKeeper = row.role === 'keeper';
  const note = matchNote(row.counts, cfg, row.role);
  const score = rohscore(row.counts, cfg, row.role);
  const groups = isKeeper ? KEEPER_GROUPS : FIELD_GROUPS;
  const actionsOf = (g: ActionGroup) =>
    ACTION_META.filter((a) => a.group === g && (!isKeeper || g !== 'Pass' || KEEPER_PASS_KEYS.includes(a.key)));

  return (
    <div className="hl-card p-2 flex flex-col lg:flex-row gap-2 min-w-0">
      {/* Identität */}
      <div className="lg:w-40 shrink-0 flex items-center gap-2.5 px-1">
        <div className="w-8 h-8 rounded-full bg-brand-accent/12 border border-brand-accent/25 grid place-items-center text-brand-accent-light font-black text-sm shrink-0">
          {slot}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-display font-black text-[15px] truncate leading-tight">{row.playerName}</div>
          <div className="flex items-center gap-2 mt-0.5">
            <span
              className="font-display font-black tabular-nums text-[17px] leading-none"
              style={{ color: noteColor(note, cfg) }}
              title={`Rohscore ${score}`}
            >
              {note.toFixed(1)}
            </span>
            <button
              onClick={onToggleRole}
              title="Rolle wechseln (Feld/Torwart)"
              className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider cursor-pointer border ${
                isKeeper ? 'bg-hl-gold/15 border-hl-gold/40 text-hl-gold' : 'bg-white/5 border-white/10 text-hl-faint'
              }`}
            >
              {isKeeper ? 'Torwart' : 'Feld'}
            </button>
          </div>
        </div>
      </div>

      {/* Aktions-Gruppen */}
      <div className="flex-1 min-w-0 flex flex-wrap gap-x-2 gap-y-1.5">
        {groups.map((g) => {
          const acts = actionsOf(g);
          if (!acts.length) return null;
          return (
            <div key={g} className="min-w-[116px] lg:min-w-[280px] flex-1">
              <div className="text-[9px] font-black uppercase tracking-[.14em] text-hl-dim mb-1 pl-0.5">{g}</div>
              <div className="grid grid-cols-2 gap-1">
                {acts.map((a) => (
                  <ActionPill key={a.key} meta={a} value={row.counts[a.key] || 0} onDelta={(d) => onDelta(a.key, d)} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Eine große farbige Aktions-Taste: Linksklick +1, Rechtsklick −1, am Handy
// lang drücken = −1.
function ActionPill({ meta, value, onDelta }: { meta: ActionMeta; value: number; onDelta: (delta: number) => void }) {
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startTouch = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      onDelta(-1);
      if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(12);
    }, 380);
  };
  const endTouch = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  return (
    <button
      type="button"
      onClick={() => {
        if (longPressed.current) {
          longPressed.current = false;
          return;
        }
        onDelta(1);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        onDelta(-1);
      }}
      onTouchStart={startTouch}
      onTouchEnd={endTouch}
      onTouchMove={endTouch}
      title={`${meta.label} · Linksklick +1 · Rechtsklick −1`}
      className={`h-10 rounded-lg border px-2 grid grid-cols-[16px_1fr_auto] items-center gap-1 text-left select-none active:scale-95 transition outline-none focus:ring-2 focus:ring-brand-accent/50 ${toneClass(
        meta.tone
      )}`}
    >
      <span className="text-[15px] leading-none text-center">{meta.icon}</span>
      <span className="text-[9px] font-bold leading-[1.05] uppercase tracking-wide overflow-hidden line-clamp-2">{meta.label}</span>
      <span className="font-display font-black tabular-nums text-[15px]">{value}</span>
    </button>
  );
}

function toneClass(tone: ActionTone): string {
  switch (tone) {
    case 'positive':
      return 'bg-hl-green/12 border-hl-green/35 text-hl-green';
    case 'negative':
      return 'bg-hl-red/12 border-hl-red/35 text-hl-red';
    case 'special':
      return 'bg-hl-gold/12 border-hl-gold/35 text-hl-gold';
    case 'goal':
      return 'bg-lime-500/15 border-lime-500/55 text-lime-500';
    default:
      return 'bg-white/[.05] border-white/12 text-hl-soft';
  }
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
// Anwesenheit: wer war heute da? (schreibt in die Abend-Aufstellung)
// ---------------------------------------------------------------------------
function AttendancePanel({
  teamIds,
  resolveTeam,
  roster,
  rk,
  onClose,
  onSave,
}: {
  teamIds: string[];
  resolveTeam: (key: string) => Team | undefined;
  roster: RosterMap;
  rk: string;
  onClose: () => void;
  onSave: (teams: EveningRoster['teams'], minutes: number) => void;
}) {
  useBackClose(true, onClose);
  const minutes = roster[rk]?.minutes ?? 7;
  const [sel, setSel] = useState<Record<string, { present: Set<string>; keeper?: string }>>(() => {
    const init: Record<string, { present: Set<string>; keeper?: string }> = {};
    teamIds.forEach((tid) => {
      const squad = resolveTeam(tid)?.spielerliste ?? [];
      const rt = roster[rk]?.teams?.[tid];
      const present = rt?.present && rt.present.length ? new Set(rt.present) : new Set(squad.map((p) => p.name));
      const keeper = rt?.goalkeeper ?? squad.find((p) => p.goalkeeper)?.name;
      init[tid] = { present, keeper: keeper && present.has(keeper) ? keeper : undefined };
    });
    return init;
  });

  const toggle = (tid: string, name: string) =>
    setSel((s) => {
      const present = new Set(s[tid].present);
      if (present.has(name)) present.delete(name);
      else present.add(name);
      let keeper = s[tid].keeper;
      if (keeper && !present.has(keeper)) keeper = undefined;
      return { ...s, [tid]: { present, keeper } };
    });

  const setKeeper = (tid: string, name: string) =>
    setSel((s) => {
      const present = new Set(s[tid].present);
      present.add(name); // Torwart ist zwingend anwesend
      return { ...s, [tid]: { present, keeper: s[tid].keeper === name ? undefined : name } };
    });

  const save = () => {
    const teams: EveningRoster['teams'] = {};
    teamIds.forEach((tid) => {
      const cur = sel[tid];
      teams[tid] = { present: [...cur.present], ...(cur.keeper ? { goalkeeper: cur.keeper } : {}) };
    });
    onSave(teams, minutes);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="hl-modal-card relative w-full sm:max-w-2xl max-h-[90vh] rounded-t-3xl sm:rounded-3xl border border-white/10 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
          <div>
            <h2 className="font-display font-black uppercase tracking-tight text-lg">Wer ist heute da?</h2>
            <p className="text-[11px] text-hl-dim">Abwesende werden im Tracker ausgeblendet · TW = Torwart</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-white/10 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4 space-y-6">
          {teamIds.map((tid) => {
            const team = resolveTeam(tid);
            const squad = team?.spielerliste ?? [];
            const cur = sel[tid];
            return (
              <section key={tid}>
                <div className="flex items-center gap-2 mb-2">
                  <TeamBadge team={team} />
                  <span className="font-display font-black uppercase tracking-tight">{team?.name ?? tid}</span>
                  <span className="text-[11px] text-hl-dim">
                    {cur.present.size}/{squad.length} da
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {squad.map((p) => {
                    const on = cur.present.has(p.name);
                    const isK = cur.keeper === p.name;
                    return (
                      <div
                        key={p.name}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 min-w-0 ${
                          on ? 'border-white/10 bg-white/[.04]' : 'border-white/[.06] opacity-55'
                        }`}
                      >
                        <button onClick={() => toggle(tid, p.name)} className="flex-1 min-w-0 text-left text-sm font-semibold truncate cursor-pointer">
                          <span className={on ? 'text-hl-green' : 'text-hl-faint'}>{on ? '✓' : '–'}</span> {p.name}
                        </button>
                        <button
                          onClick={() => setKeeper(tid, p.name)}
                          title="Als Torwart"
                          className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider cursor-pointer border ${
                            isK ? 'bg-hl-gold/15 border-hl-gold/40 text-hl-gold' : 'bg-white/5 border-white/10 text-hl-faint'
                          }`}
                        >
                          TW
                        </button>
                      </div>
                    );
                  })}
                  {squad.length === 0 && <div className="text-xs text-hl-mute">Kein Kader hinterlegt.</div>}
                </div>
              </section>
            );
          })}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-hl-text cursor-pointer">
            Abbrechen
          </button>
          <button
            onClick={save}
            className="px-5 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-brand-accent text-brand-dark hover:bg-brand-accent-light transition-colors cursor-pointer flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" /> Übernehmen
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Score-Einstellungen
// ---------------------------------------------------------------------------
function ScoringPanel({ cfg, onSave, onClose }: { cfg: ScoringConfig; onSave: (c: ScoringConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScoringConfig>(cfg);
  const [exporting, setExporting] = useState(false);
  useBackClose(true, onClose);

  const setPoint = (key: keyof ActionCounts, v: number) => setDraft((d) => ({ ...d, points: { ...d.points, [key]: v } }));

  // Diese Einstellungen zusätzlich ins Google Sheet („Score-Einstellungen") kopieren,
  // damit die Excel-Rechnung mit unserer übereinstimmt. Speichert vorher für die Website.
  const pushToSheet = async () => {
    if (!window.confirm('Diese Score-Einstellungen ins Google Sheet („Score-Einstellungen") übernehmen?\n\nDie Punkte, Rating-Regler und Mindestwerte werden dort überschrieben.')) return;
    setExporting(true);
    try {
      onSave(draft); // gleiche Werte auch für die Website übernehmen
      const r = await exportScoringToSheet(draft);
      let msg = `✅ In Excel übernommen (Blatt „${r.sheet}").\n\nGesetzte Zellen: ${r.written}\nZugeordnete Werte: ${r.matched}`;
      if (r.unmatched?.length) msg += `\n\n⚠️ Nicht gefunden: ${r.unmatched.join(', ')}`;
      window.alert(msg);
    } catch (e) {
      window.alert('❌ ' + (e instanceof Error ? e.message : 'Übernahme fehlgeschlagen'));
    } finally {
      setExporting(false);
    }
  };

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
                <label key={a.key} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-1.5 min-w-0">
                  <span className="text-[11px] text-hl-soft truncate min-w-0" title={a.label}>
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
            <p className="text-[11px] text-hl-dim mt-2 leading-relaxed">
              Zu viele 9–10er? <b>„je Punkt"</b> senken (z.&nbsp;B. 0,20 → 0,12) – dann steigt die Note langsamer. Oder einzelne Aktionen oben
              weniger Punkte geben (z.&nbsp;B. „Pass erfolgreich" 0,10 → 0,05). Wirkt sofort auf alle Noten.
            </p>
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

        <div className="flex flex-wrap items-center justify-end gap-2 px-5 py-4 border-t border-white/10">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider text-hl-mute hover:text-hl-text cursor-pointer">
            Abbrechen
          </button>
          <button
            onClick={pushToSheet}
            disabled={exporting}
            title="Diese Einstellungen ins Google Sheet kopieren"
            className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 text-hl-soft hover:text-white transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> {exporting ? 'Übernehme…' : 'In Excel übernehmen'}
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
