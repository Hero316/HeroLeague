import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  Mic,
  UserPlus,
  ArrowLeftRight,
  Trash2,
} from 'lucide-react';
import type {
  ActionCounts,
  EveningRoster,
  EventArchive,
  EventConfig,
  Match,
  RosterMap,
  ScoringConfig,
  CardAttrTarget,
  Season,
  StatRole,
  Team,
} from '../types';
import {
  ACTION_META,
  COUPLED_ACTIONS,
  DEFAULT_SCORING,
  FIELD_GROUPS,
  KEEPER_GROUPS,
  KEEPER_PASS_KEYS,
  KEEPER_EXTRA_KEYS,
  type ActionGroup,
  type ActionMeta,
  type ActionTone,
} from '../lib/scoring';
import { emptyCounts, matchNote, normalizeCounts, rohscore } from '../lib/rating';
import { shortDate } from './ui';
import { useBackClose, goBackLayer } from '../lib/backStack';
import VoiceTrackingPanel, { type VoicePlayer } from './VoiceTrackingPanel';
import {
  fetchScoring,
  saveScoring as apiSaveScoring,
  fetchDayStats,
  saveTally,
  tallyOp,
  publishDay,
  publishMatch,
  leagueDayKey,
  eventDayKey,
  testSheet,
  exportToSheet,
  exportScoringToSheet,
  saveAttendance,
  saveEventAttendance,
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
  // Spontan angelegten Spieler auch in den echten Kader aufnehmen (Event/Liga).
  onAddRosterPlayer?: (opts: { eventId: string | null; teamKey: string; name: string }) => void;
  onBack: () => void;
}

interface EditRow {
  teamId: string; // Liga: Team-ID · Testspiel: Team-Name
  teamName: string;
  playerName: string;
  role: StatRole;
  counts: ActionCounts;
  number?: number; // feste Trikotnummer (aus dem Kader), optional
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
  onAddRosterPlayer,
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

  // Lokale Kopie des Event-Archivs, damit Anwesenheits-Änderungen sofort wirken
  // (der Elternteil pollt erst mit Verzögerung nach).
  const [eventArchiveLocal, setEventArchiveLocal] = useState(eventArchive);
  useEffect(() => setEventArchiveLocal(eventArchive), [eventArchive]);
  const events = useMemo(() => eventArchiveLocal?.events ?? [], [eventArchiveLocal]);

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
  const rowsRef = useRef<RowMap>({});
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const [dayLive, setDayLive] = useState(false);
  const [liveMatchIds, setLiveMatchIds] = useState<Set<string>>(new Set());
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
          // Anwesenheit/Torwart aus den Event-Daten mitgeben (namensbasiert),
          // damit der Tracker Abwesende ausblendet und den Torwart erkennt.
          absentees: (em.absentees ?? []).map((a) => ({ playerName: a.player, teamId: a.team })),
          goalkeepers: (em.goalkeepers ?? []).map((g) => ({ playerName: g.player, teamId: g.team })),
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
    (key: string, rk: string | null, absent?: Set<string>, rmap?: RosterMap): { name: string; role: StatRole; number?: number }[] => {
      // Event-Modus: zuerst der EIGENE Event-Kader (namensbasiert), sonst der
      // gleichnamige Liga-Verein. So lassen sich auch reine Gastteams tracken.
      if (selectedEvent) {
        const own = selectedEvent.rosters?.find((r) => normName(r.team) === normName(key))?.players;
        const list = own && own.length ? own : resolveTeam(key)?.spielerliste ?? [];
        // Abend-Torwart aus den Event-Daten (Anwesenheit), sonst fester Kader-Torwart.
        const eveningKeeper = selectedEvent.matches
          .flatMap((m) => m.goalkeepers ?? [])
          .find((g) => normName(g.team) === normName(key))?.player;
        return list
          .filter((p) => p.name)
          .filter((p) => !absent || !absent.has(p.name))
          .map((p) => ({
            name: p.name,
            role: ((eveningKeeper ? p.name === eveningKeeper : p.goalkeeper) ? 'keeper' : 'field') as StatRole,
            number: (p as { number?: number }).number,
          }));
      }
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
          number: p.number,
        }));
    },
    [resolveTeam, rosterState, selectedEvent]
  );

  // Zeilen für einen Tag bauen (Liga oder Event) und gespeicherte Zähler laden.
  const buildRows = useCallback(
    async (key: string, games: Match[], rk: string | null, rmap?: RosterMap) => {
      setLoadingDay(true);
      try {
        const { rows: saved, live, liveMatchIds: liveIds } = await fetchDayStats(key);
        setLiveMatchIds(new Set(liveIds ?? []));
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
            const squad = squadFor(tid, rk, absentByTeam[tid], rmap);
            // Ist für das Team ein Torwart bestimmt (Aufstellung/Anwesenheit oder
            // Schiedsrichter-Modus), gilt DIESE Zuordnung – auch für bereits
            // getrackte Spieler. Nur wenn kein Torwart bestimmt ist, greift die
            // zuletzt getrackte/manuell im Tracker gesetzte Rolle.
            const teamHasKeeper = squad.some((p) => p.role === 'keeper');
            squad.forEach((pl) => {
              const k = rowKey(m.id, tid, pl.name);
              const sv = savedMap[k];
              const role: StatRole = teamHasKeeper ? pl.role : (sv?.role as StatRole) || pl.role;
              next[k] = { teamId: tid, teamName, playerName: pl.name, role, counts: sv?.counts ?? emptyCounts(), number: pl.number };
              // Korrigierte Rolle (Torwart-Zuordnung) auch in der DB festschreiben,
              // damit Auswertung/Export sie nutzen – nur bei echter Abweichung.
              if (sv && sv.role !== role) {
                saveTally({ dayKey: key, matchId: m.id, teamId: tid, playerName: pl.name, role, counts: sv.counts }).catch(() => {});
              }
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
      // Gekoppelte Aktion (Assist/Schlüsselpass ⇒ erfolgreicher Pass): dieselbe
      // Änderung mitführen. Gilt für Klick UND Sprechen, da beide hier durchlaufen.
      const coupled = COUPLED_ACTIONS[action] as keyof ActionCounts | undefined;
      setRows((prev) => {
        const row = prev[k];
        if (!row) return prev;
        const cur = row.counts[action] || 0;
        const nextVal = Math.max(0, Math.min(999, cur + delta));
        if (nextVal === cur) return prev;
        const counts = { ...row.counts, [action]: nextVal };
        if (coupled) {
          const cc = counts[coupled] || 0;
          counts[coupled] = Math.max(0, Math.min(999, cc + delta));
        }
        const updated: EditRow = { ...row, counts };
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

  // Spontan einen Spieler zu einem Spiel hinzufügen (Name kommt oft erst später,
  // z.B. „Weißer Schuh"). Zeile sofort anlegen + leer speichern, damit sie auch
  // nach einem Neuladen bleibt. Bereits vorhandene Namen werden nicht überschrieben.
  const addPlayerRow = useCallback(
    (matchId: string, teamId: string, rawName: string) => {
      const name = rawName.trim();
      if (!name) return;
      const k = rowKey(matchId, teamId, name);
      if (rowsRef.current[k]) return; // gibt es schon – nichts überschreiben
      const teamName = resolveTeam(teamId)?.name ?? teamId;
      const updated: EditRow = { teamId, teamName, playerName: name, role: 'field', counts: emptyCounts() };
      setRows((prev) => (prev[k] ? prev : { ...prev, [k]: updated }));
      saveTally({ dayKey, matchId, teamId, playerName: name, role: 'field', counts: emptyCounts() }).catch(() => {});
      // Auch in den echten Kader aufnehmen (öffentlicher Kader/Schiri/Tracking bleiben synchron).
      onAddRosterPlayer?.({ eventId: selectedEventId, teamKey: teamId, name });
    },
    [dayKey, resolveTeam, onAddRosterPlayer, selectedEventId]
  );

  // Den aktuell offenen Tag neu aus der DB laden (nach einer Umbuchung).
  const reloadDay = useCallback(async () => {
    if (selectedEvent) {
      await buildRows(eventDayKey(selectedEvent.id), eventGamesAsMatches(selectedEvent), null);
    } else if (selectedMatchday !== null && seasonId) {
      const games = matches.filter((m) => m.seasonId === seasonId && m.matchday === selectedMatchday).sort(cmpMatches);
      await buildRows(leagueDayKey(seasonId, selectedMatchday), games, `${seasonId}:${selectedMatchday}`);
    }
  }, [selectedEvent, selectedMatchday, seasonId, matches, buildRows, eventGamesAsMatches]);

  // Getrackte Daten umbuchen: zusammenführen (from→to), tauschen (from⇄to) oder
  // löschen (from). `wholeDay` wendet es auf alle Spiele des Tages an, sonst nur
  // auf das aktuell offene Spiel. Danach frisch aus der DB laden.
  const [reassignBusy, setReassignBusy] = useState(false);
  const reassignPlayers = useCallback(
    async (teamId: string, from: string, to: string | undefined, op: 'merge' | 'swap' | 'delete', wholeDay: boolean) => {
      const ids = wholeDay ? dayMatches.map((m) => m.id) : selectedMatchId ? [selectedMatchId] : [];
      if (ids.length === 0) return;
      // Laufende Debounce-Speicherungen abbrechen – sonst überschreiben sie die Umbuchung.
      Object.values(timers.current).forEach((t) => clearTimeout(t));
      timers.current = {};
      pending.current.clear();
      setReassignBusy(true);
      try {
        await tallyOp({ dayKey, matchIds: ids, teamId, op, from, to });
        // Undo-Verlauf verwerfen – er zeigt evtl. auf jetzt umgebuchte Zeilen.
        undoStack.current = [];
        setUndoCount(0);
        await reloadDay();
      } catch {
        /* still – der Nutzer kann es erneut versuchen */
      } finally {
        setReassignBusy(false);
      }
    },
    [dayKey, dayMatches, selectedMatchId, reloadDay]
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

  // Ein einzelnes Spiel live schalten/verstecken – unabhängig vom ganzen Tag/Event.
  const toggleMatchLive = useCallback(async (matchId: string) => {
    const next = !liveMatchIds.has(matchId);
    setLiveMatchIds((prev) => {
      const s = new Set(prev);
      if (next) s.add(matchId);
      else s.delete(matchId);
      return s;
    });
    try {
      await publishMatch(matchId, next);
    } catch {
      setLiveMatchIds((prev) => {
        const s = new Set(prev);
        if (next) s.delete(matchId);
        else s.add(matchId);
        return s;
      });
    }
  }, [liveMatchIds]);

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

  // --- Anwesenheit für Testspiele (wie „Wer ist heute da?" bei der Liga) ------
  // Synthetisches Team je Event-Teamname (Event-Kader), damit das bestehende
  // Anwesenheits-Panel 1:1 wiederverwendet werden kann.
  const eventResolveTeam = useCallback(
    (name: string): Team | undefined => {
      if (!selectedEvent) return undefined;
      const league = teams.find((t) => normName(t.name) === normName(name));
      const own = selectedEvent.rosters?.find((r) => normName(r.team) === normName(name))?.players;
      const spielerliste = own && own.length ? own : league?.spielerliste ?? [];
      return {
        id: name,
        name,
        shortName: league?.shortName || name,
        logoColor: league?.logoColor || '#E6238E',
        logoIcon: league?.logoIcon || '⚽',
        logoUrl: league?.logoUrl,
        spielerliste,
      };
    },
    [selectedEvent, teams]
  );

  const eventAttendanceRk = 'event-attendance';
  const eventAttendanceRoster = useMemo<RosterMap>(() => {
    if (!selectedEvent) return {};
    const teamsMap: EveningRoster['teams'] = {};
    for (const name of selectedEvent.teams) {
      const roster = (eventResolveTeam(name)?.spielerliste ?? []).map((p) => p.name).filter(Boolean);
      const absent = new Set(
        selectedEvent.matches.flatMap((m) => m.absentees ?? []).filter((a) => normName(a.team) === normName(name)).map((a) => a.player)
      );
      const present = roster.filter((n) => !absent.has(n));
      const keeper = selectedEvent.matches.flatMap((m) => m.goalkeepers ?? []).find((g) => normName(g.team) === normName(name))?.player;
      teamsMap[name] = { present, ...(keeper ? { goalkeeper: keeper } : {}) };
    }
    return { [eventAttendanceRk]: { minutes: 7, teams: teamsMap } };
  }, [selectedEvent, eventResolveTeam]);

  const applyEventAttendance = useCallback(
    async (teamsPayload: EveningRoster['teams']) => {
      if (!selectedEvent) return;
      setAttendanceOpen(false);
      try {
        const updated = await saveEventAttendance(selectedEvent.id, teamsPayload);
        setEventArchiveLocal(updated);
        const ev = updated.events.find((e) => e.id === selectedEvent.id);
        if (ev) buildRows(eventDayKey(ev.id), eventGamesAsMatches(ev), null);
      } catch {
        /* lokal bleibt der letzte Stand */
      }
    },
    [selectedEvent, buildRows, eventGamesAsMatches]
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
              onAddPlayer={addPlayerRow}
              onReassign={reassignPlayers}
              reassignBusy={reassignBusy}
              dayGameCount={dayMatches.length}
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
              liveMatchIds={liveMatchIds}
              onToggleMatchLive={toggleMatchLive}
              onOpenMatch={setSelectedMatchId}
              onExport={selectedEvent || demoActive ? undefined : runExport}
              exporting={exporting}
              onAttendance={() => setAttendanceOpen(true)}
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
      {attendanceOpen && selectedEvent && (
        <AttendancePanel
          teamIds={selectedEvent.teams}
          resolveTeam={eventResolveTeam}
          roster={eventAttendanceRoster}
          rk={eventAttendanceRk}
          onClose={() => setAttendanceOpen(false)}
          onSave={(teams) => applyEventAttendance(teams)}
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
  liveMatchIds,
  onToggleMatchLive,
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
  liveMatchIds: Set<string>;
  onToggleMatchLive: (matchId: string) => void;
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
            const matchLive = liveMatchIds.has(m.id);
            return (
              <div
                key={m.id}
                className="hl-card p-3 sm:p-4 flex items-center gap-2 sm:gap-3 min-w-0 hover:border-brand-accent/40 transition-colors"
              >
                <button onClick={() => onOpenMatch(m.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left cursor-pointer">
                  <TeamBadge team={home} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                      {typeof m.field === 'number' && (
                        <span className="text-[9px] font-black uppercase tracking-wider text-brand-accent-light bg-brand-accent/12 border border-brand-accent/25 rounded px-1.5 py-0.5">
                          Feld {m.field}
                        </span>
                      )}
                      {(m.time || m.date) && (
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-hl-faint">
                          {m.date ? shortDate(m.date) : ''}
                          {m.date && m.time ? ' · ' : ''}
                          {m.time ? `${m.time} Uhr` : ''}
                        </span>
                      )}
                    </div>
                    <div className="font-semibold truncate">
                      {home?.name ?? m.homeTeamId} <span className="text-hl-faint">vs</span> {away?.name ?? m.awayTeamId}
                    </div>
                    <div className="text-[11px] text-hl-dim mt-0.5">
                      {m.homeScore !== null && m.awayScore !== null ? `${m.homeScore}:${m.awayScore} · ` : ''}
                      {tracked > 0 ? `${tracked} Spieler erfasst` : 'noch nicht erfasst'}
                    </div>
                  </div>
                  <TeamBadge team={away} />
                </button>
                {tracked > 0 && (
                  <button
                    onClick={() => onToggleMatchLive(m.id)}
                    title="Nur dieses Spiel live schalten"
                    className={`shrink-0 px-2.5 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 border cursor-pointer transition-colors ${
                      matchLive ? 'bg-hl-green/15 border-hl-green/40 text-hl-green' : 'bg-white/5 border-white/10 text-hl-mute hover:text-hl-text'
                    }`}
                  >
                    <Radio className="w-3 h-3" /> {matchLive ? 'Live' : 'Live schalten'}
                  </button>
                )}
                <ChevronRight className="w-4 h-4 text-hl-faint shrink-0" />
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-hl-dim mt-5 flex items-start gap-1.5">
        <Shield className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>
          Oben „Live schalten" macht {isEvent ? 'das ganze Testspiel' : 'den ganzen Spieltag'} auf einmal sichtbar. Oder pro Spiel
          rechts einzeln live schalten (sobald erfasst) – so kannst du fertige Spiele schon zeigen, während der Rest noch läuft.
          Ohne das bleiben die Werte interner Entwurf.
        </span>
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
  onAddPlayer,
  onReassign,
  reassignBusy,
  dayGameCount,
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
  onAddPlayer: (matchId: string, teamId: string, name: string) => void;
  onReassign: (teamId: string, from: string, to: string | undefined, op: 'merge' | 'swap' | 'delete', wholeDay: boolean) => void;
  reassignBusy: boolean;
  dayGameCount: number;
}) {
  const home = resolveTeam(match.homeTeamId);
  const away = resolveTeam(match.awayTeamId);

  const teamRows = (teamId: string) =>
    Object.entries(rows)
      .filter(([k]) => k.startsWith(`${match.id}::${teamId}::`))
      .map(([k, r]) => ({ k, r }));

  // Temporäre Trikotnummern NUR fürs Tracking (gerissenes Trikot, spontaner
  // Einwechsler …). Sie werden NIE in den Kader oder ins Backend geschrieben —
  // nur auf diesem Gerät gemerkt, damit ein Neuladen sie nicht verliert.
  const numStoreKey = `hl-tracknum:${match.id}`;
  const [numOverrides, setNumOverrides] = useState<Record<string, number>>({});
  useEffect(() => {
    try {
      const raw = localStorage.getItem(numStoreKey);
      const parsed = raw ? (JSON.parse(raw) as unknown) : null;
      const out: Record<string, number> = {};
      if (parsed && typeof parsed === 'object') {
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof v === 'number' && Number.isFinite(v)) out[k] = v;
        }
      }
      setNumOverrides(out);
    } catch {
      setNumOverrides({});
    }
  }, [numStoreKey]);

  const setRowNumber = (k: string, n: number | null) => {
    setNumOverrides((prev) => {
      const next = { ...prev };
      if (n === null) delete next[k];
      else next[k] = n;
      try {
        localStorage.setItem(numStoreKey, JSON.stringify(next));
      } catch {
        /* Speicher voll/blockiert – Nummer gilt dann nur bis zum Neuladen */
      }
      return next;
    });
  };

  // Angezeigte Nummer: temporäre Tracking-Nummer schlägt die Kadernummer.
  const effNumber = (k: string, r: EditRow) =>
    typeof numOverrides[k] === 'number' ? numOverrides[k] : r.number;

  // Live-Spielstand aus den getrackten Toren: eigene Tore + Eigentore des Gegners.
  const goalsFor = (teamId: string, oppId: string) => {
    let g = 0;
    teamRows(teamId).forEach(({ r }) => (g += r.counts.goal || 0));
    teamRows(oppId).forEach(({ r }) => (g += r.counts.own_goal || 0));
    return g;
  };
  const homeScore = goalsFor(match.homeTeamId, match.awayTeamId);
  const awayScore = goalsFor(match.awayTeamId, match.homeTeamId);

  // Kandidaten-Namen fürs Umbuchen: aktuell getrackte Spieler + echter Kader.
  const candidateNames = (teamId: string): string[] => {
    const set = new Set<string>();
    teamRows(teamId).forEach(({ r }) => set.add(r.playerName));
    (resolveTeam(teamId)?.spielerliste ?? []).forEach((p) => p.name && set.add(p.name));
    return [...set];
  };

  // Offene Zusatz-UI je Team: Spieler hinzufügen bzw. Umbuchen-Panel.
  const [addTeam, setAddTeam] = useState<string | null>(null);
  const [addName, setAddName] = useState('');
  const [reassignTeam, setReassignTeam] = useState<string | null>(null);

  const [voiceOpen, setVoiceOpen] = useState(false);

  // Kader beider Teams für das Voice-Panel (aus dem aktuellen Raster).
  const voicePlayers = useMemo<VoicePlayer[]>(() => {
    const out: VoicePlayer[] = [];
    ([match.homeTeamId, match.awayTeamId] as const).forEach((teamId, idx) => {
      const side: 'home' | 'away' = idx === 0 ? 'home' : 'away';
      const team = resolveTeam(teamId);
      const teamName = team?.name ?? teamId;
      teamRows(teamId).forEach(({ k, r }) => {
        // Trikotnummer mitgeben, damit die KI „die Nummer 5" korrekt zuordnet.
        // Eine temporäre Tracking-Nummer schlägt dabei die Kadernummer.
        const rosterNum = team?.spielerliste?.find((p) => normName(p.name) === normName(r.playerName))?.number;
        const num = typeof numOverrides[k] === 'number' ? numOverrides[k] : rosterNum;
        out.push({ side, teamId, teamName, name: r.playerName, role: r.role, ...(typeof num === 'number' ? { number: num } : {}) });
      });
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, rows, numOverrides]);

  // Erkannte Ereignisse ins Raster übernehmen (delta pro Aktion).
  const applyVoice = useCallback(
    (items: { teamId: string; player: string; action: keyof ActionCounts; delta: number }[]) => {
      items.forEach((it) => {
        onDelta(rowKey(match.id, it.teamId, it.player), match.id, it.action, it.delta);
      });
    },
    [onDelta, match.id]
  );

  return (
    <div className="hl-fade">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <button
          onClick={onBack}
          className="text-xs font-semibold uppercase tracking-wider text-hl-mute hover:text-hl-text flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" /> Spiele
        </button>
        <h1 className="font-display font-black text-xl uppercase tracking-tight flex items-center gap-2 min-w-0">
          <span className="truncate max-w-[26vw] sm:max-w-none">{home?.name ?? match.homeTeamId}</span>
          <span className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-brand-accent/12 border border-brand-accent/30 px-2.5 py-1 tabular-nums text-brand-accent-light">
            {homeScore}<span className="text-hl-faint">:</span>{awayScore}
          </span>
          <span className="truncate max-w-[26vw] sm:max-w-none">{away?.name ?? match.awayTeamId}</span>
        </h1>
        <button
          onClick={() => setVoiceOpen(true)}
          title="Spiel einreden – KI trägt die Aktionen ein"
          className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 text-white cursor-pointer active:scale-95 transition"
          style={{ background: 'linear-gradient(135deg,#E6238E,#b81570)' }}
        >
          <Mic className="w-3.5 h-3.5" /> Audio-Tracking
        </button>
        <button
          onClick={() => onUndo(match.id)}
          disabled={undoCount === 0}
          className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" /> Rückgängig
        </button>
      </div>

      {voiceOpen && (
        <VoiceTrackingPanel
          matchId={match.id}
          homeName={home?.name ?? match.homeTeamId}
          awayName={away?.name ?? match.awayTeamId}
          homeTeamId={match.homeTeamId}
          awayTeamId={match.awayTeamId}
          players={voicePlayers}
          onApply={applyVoice}
          onClose={() => setVoiceOpen(false)}
          onCreatePlayer={(teamId, name) => onAddPlayer(match.id, teamId, name)}
        />
      )}

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
                Noch kein Spieler. Über <b>„+ Spieler"</b> unten kannst du jederzeit welche hinzufügen (auch mit Platzhalter-Namen).
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
                    displayNumber={effNumber(k, r)}
                    tempNumber={typeof numOverrides[k] === 'number'}
                    onSetNumber={(n) => setRowNumber(k, n)}
                  />
                ))}
              </div>
            )}

            {/* Werkzeuge: spontan Spieler hinzufügen + getrackte Daten umbuchen */}
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <button
                onClick={() => { setAddTeam(addTeam === teamId ? null : teamId); setAddName(''); }}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" /> Spieler
              </button>
              <button
                onClick={() => setReassignTeam(teamId)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" /> Daten umbuchen
              </button>
            </div>

            {addTeam === teamId && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = addName.trim();
                  if (!n) return;
                  onAddPlayer(match.id, teamId, n);
                  setAddName('');
                }}
                className="mt-2 flex items-center gap-2"
              >
                <input
                  autoFocus
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  placeholder={'Name oder Platzhalter, z. B. „Weißer Schuh"'}
                  className="hl-input flex-1 min-w-0 px-3 py-2 rounded-lg text-sm"
                />
                <button type="submit" className="shrink-0 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider text-white cursor-pointer active:scale-95" style={{ background: 'var(--color-brand-accent-light, #22DFC9)', color: '#04120d' }}>
                  Hinzufügen
                </button>
              </form>
            )}
          </div>
        );
      })}
      </div>
      <p className="text-[11px] text-hl-dim mt-1">
        <b>Linksklick +1 · Rechtsklick −1</b> · am Handy lang drücken = −1 · „Tor" zählt automatisch als Torschuss · „Assist" und „Schlüsselpass" zählen automatisch als erfolgreicher Pass.
      </p>

      {reassignTeam && (
        <ReassignPanel
          teamName={resolveTeam(reassignTeam)?.name ?? reassignTeam}
          trackedNames={teamRows(reassignTeam).map(({ r }) => r.playerName)}
          candidateNames={candidateNames(reassignTeam)}
          dayGameCount={dayGameCount}
          busy={reassignBusy}
          onClose={() => setReassignTeam(null)}
          onSubmit={(from, to, op, wholeDay) => onReassign(reassignTeam, from, to, op, wholeDay)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Umbuchen-Panel: getrackte Daten einem echten Spieler zuordnen/zusammenführen,
// zwei Spieler tauschen (verwechselt) oder einen (Platzhalter-)Spieler entfernen.
// ---------------------------------------------------------------------------
function ReassignPanel({
  teamName,
  trackedNames,
  candidateNames,
  dayGameCount,
  busy,
  onClose,
  onSubmit,
}: {
  teamName: string;
  trackedNames: string[]; // Quelle: nur Spieler, die in diesem Spiel Zeilen haben
  candidateNames: string[]; // Ziel: getrackte + echter Kader
  dayGameCount: number;
  busy: boolean;
  onClose: () => void;
  onSubmit: (from: string, to: string | undefined, op: 'merge' | 'swap' | 'delete', wholeDay: boolean) => void;
}) {
  useBackClose(true, onClose);
  const [op, setOp] = useState<'merge' | 'swap' | 'delete'>('merge');
  const [from, setFrom] = useState(trackedNames[0] ?? '');
  const [to, setTo] = useState('');
  const [wholeDay, setWholeDay] = useState(false);

  const needsTarget = op !== 'delete';
  const targets = candidateNames.filter((n) => normName(n) !== normName(from));
  const canSubmit = !!from && (!needsTarget || !!to) && !busy;

  const submit = () => {
    if (!canSubmit) return;
    if (op === 'delete' && !window.confirm(`„${from}" aus ${wholeDay ? 'allen Spielen des Tages' : 'diesem Spiel'} wirklich entfernen? Getrackte Werte gehen verloren.`)) return;
    onSubmit(from, needsTarget ? to : undefined, op, wholeDay);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md hl-card p-5 rounded-2xl"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 1.25rem)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-display font-black uppercase tracking-tight text-lg">Daten umbuchen</h3>
          <button onClick={onClose} className="text-hl-mute hover:text-hl-text cursor-pointer"><X className="w-5 h-5" /></button>
        </div>
        <p className="text-[12px] text-hl-mute mb-4">{teamName}</p>

        {/* Aktion wählen */}
        <div className="grid grid-cols-3 gap-1.5 mb-4">
          {([
            { key: 'merge', label: 'Zuordnen', icon: <UserPlus className="w-3.5 h-3.5" /> },
            { key: 'swap', label: 'Tauschen', icon: <ArrowLeftRight className="w-3.5 h-3.5" /> },
            { key: 'delete', label: 'Löschen', icon: <Trash2 className="w-3.5 h-3.5" /> },
          ] as const).map((o) => (
            <button
              key={o.key}
              onClick={() => setOp(o.key)}
              className={`px-2 py-2 rounded-lg text-[11px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 border cursor-pointer transition ${op === o.key ? 'border-brand-accent-light text-brand-accent-light bg-brand-accent/10' : 'border-white/10 bg-white/5 text-hl-mute hover:text-hl-text'}`}
            >
              {o.icon} {o.label}
            </button>
          ))}
        </div>

        <label className="block text-[11px] font-bold uppercase tracking-wider text-hl-dim mb-1">
          {op === 'swap' ? 'Spieler A' : 'Von (Quelle)'}
        </label>
        <select value={from} onChange={(e) => setFrom(e.target.value)} className="hl-input w-full px-3 py-2 rounded-lg text-sm mb-3">
          <option value="">– wählen –</option>
          {trackedNames.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>

        {needsTarget && (
          <>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-hl-dim mb-1">
              {op === 'swap' ? 'Spieler B' : 'Auf (echter Spieler)'}
            </label>
            <select value={to} onChange={(e) => setTo(e.target.value)} className="hl-input w-full px-3 py-2 rounded-lg text-sm mb-3">
              <option value="">– wählen –</option>
              {targets.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </>
        )}

        <p className="text-[11px] text-hl-dim mb-3 leading-relaxed">
          {op === 'merge' && 'Die getrackten Werte der Quelle werden zum Zielspieler addiert; die Quelle wird danach entfernt.'}
          {op === 'swap' && 'Die getrackten Werte von A und B werden vertauscht (falls ihr sie verwechselt habt).'}
          {op === 'delete' && 'Die Quelle wird samt getrackten Werten entfernt.'}
        </p>

        {dayGameCount > 1 && (
          <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
            <input type="checkbox" checked={wholeDay} onChange={(e) => setWholeDay(e.target.checked)} className="w-4 h-4 accent-[#22DFC9]" />
            <span className="text-[12px] text-hl-text">Auf <b>alle {dayGameCount} Spiele</b> des Tages anwenden (sonst nur dieses Spiel)</span>
          </label>
        )}

        <div className="flex items-center gap-2">
          <button onClick={onClose} className="flex-1 px-3 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider border border-white/10 bg-white/5 hover:bg-white/10 cursor-pointer">Abbrechen</button>
          <button
            onClick={submit}
            disabled={!canSubmit}
            className="flex-1 px-3 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider text-[#04120d] cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            style={{ background: 'var(--color-brand-accent-light, #22DFC9)' }}
          >
            {busy ? 'Wird gespeichert…' : op === 'delete' ? 'Entfernen' : op === 'swap' ? 'Tauschen' : 'Zuordnen'}
          </button>
        </div>
      </div>
    </div>,
    document.body
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
  displayNumber,
  tempNumber,
  onSetNumber,
}: {
  slot: number;
  row: EditRow;
  cfg: ScoringConfig;
  onDelta: (action: keyof ActionCounts, delta: number) => void;
  onToggleRole: () => void;
  displayNumber?: number;
  tempNumber?: boolean;
  onSetNumber?: (n: number | null) => void;
}) {
  const isKeeper = row.role === 'keeper';
  const note = matchNote(row.counts, cfg, row.role);
  const score = rohscore(row.counts, cfg, row.role);
  const groups = isKeeper ? KEEPER_GROUPS : FIELD_GROUPS;
  const actionsOf = (g: ActionGroup) => {
    if (!isKeeper) return ACTION_META.filter((a) => a.group === g);
    // Torwart: nur ausgewählte Pässe; in der Torwart-Gruppe zusätzlich z.B. Interception.
    if (g === 'Pass') return ACTION_META.filter((a) => a.group === 'Pass' && KEEPER_PASS_KEYS.includes(a.key));
    if (g === 'Torwart')
      return [
        ...ACTION_META.filter((a) => a.group === 'Torwart'),
        ...ACTION_META.filter((a) => KEEPER_EXTRA_KEYS.includes(a.key)),
      ];
    return ACTION_META.filter((a) => a.group === g);
  };

  return (
    <div className="hl-card p-2 flex flex-col lg:flex-row gap-2 min-w-0">
      {/* Identität */}
      <div className="lg:w-40 shrink-0 flex items-center gap-2.5 px-1">
        <button
          type="button"
          onClick={() => {
            if (!onSetNumber) return;
            const cur = typeof displayNumber === 'number' ? String(displayNumber) : '';
            const input = window.prompt(
              'Trikotnummer nur fürs Tracking (Kader/Backend bleiben unverändert).\nLeer lassen = zurück zur Kadernummer:',
              cur
            );
            if (input === null) return;
            const t = input.trim();
            if (!t) return onSetNumber(null);
            const n = Number(t);
            if (!Number.isFinite(n) || n < 0 || n > 999) return;
            onSetNumber(Math.floor(n));
          }}
          title={
            tempNumber
              ? `Tracking-Nummer ${displayNumber} (nur für heute – nicht im Kader). Tippen zum Ändern.`
              : typeof displayNumber === 'number'
                ? `Trikotnummer ${displayNumber}. Tippen, um sie nur fürs Tracking zu ändern.`
                : 'Keine Nummer. Tippen, um eine fürs Tracking zu setzen.'
          }
          className={`w-8 h-8 rounded-full grid place-items-center font-black text-base shrink-0 tabular-nums cursor-pointer border ${
            tempNumber
              ? 'bg-hl-gold/15 border-hl-gold/50 text-hl-gold'
              : 'bg-brand-accent/12 border-brand-accent/25 text-brand-accent-light'
          }`}
        >
          {typeof displayNumber === 'number' ? displayNumber : '–'}
        </button>
        <div className="min-w-0 flex-1">
          <div className="font-display font-black text-[15px] truncate leading-tight">{row.playerName}</div>
          {tempNumber ? (
            <div className="text-[9px] text-hl-gold leading-tight mt-0.5">Tracking-Nummer (nicht im Kader)</div>
          ) : (
            typeof displayNumber !== 'number' && (
              <div className="text-[9px] text-hl-faint leading-tight mt-0.5">noch keine Nummer – tippen zum Setzen</div>
            )
          )}
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
                {acts.map((a) => {
                  // Ein Tor IST ein Torschuss: der Torschuss-Zähler zeigt shot_on + Tore
                  // (sichtbar mitzählend beim Tor-Klick). Gespeichert bleibt beides
                  // getrennt – die Auswertung zählt das Tor nur einmal als Schuss.
                  const value = a.key === 'shot_on' ? (row.counts.shot_on || 0) + (row.counts.goal || 0) : row.counts[a.key] || 0;
                  return <ActionPill key={a.key} meta={a} value={value} onDelta={(d) => onDelta(a.key, d)} />;
                })}
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
// Eine Zeile „Elite-Ziel" für einen Kartenwert: Ziel-Quote, Ziel-Menge und die
// beiden Gewichte — alles frei einstellbar.
function AttrTargetRow({
  label,
  t,
  onChange,
}: {
  label: string;
  t: CardAttrTarget;
  onChange: (key: keyof CardAttrTarget, v: number) => void;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[.03] px-2.5 py-2">
      <div className="text-[11px] font-bold text-hl-soft mb-1.5">{label}</div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <NumField label="Ziel-Quote" value={t.zielQuote} step={0.01} onChange={(v) => onChange('zielQuote', v)} />
        <NumField label="Ziel-Menge" value={t.zielMenge} step={0.5} onChange={(v) => onChange('zielMenge', v)} />
        <NumField label="Gew. Quote" value={t.gewQuote} step={0.05} onChange={(v) => onChange('gewQuote', v)} />
        <NumField label="Gew. Menge" value={t.gewMenge} step={0.05} onChange={(v) => onChange('gewMenge', v)} />
      </div>
    </div>
  );
}

// Score-Einstellungen
// ---------------------------------------------------------------------------
function ScoringPanel({ cfg, onSave, onClose }: { cfg: ScoringConfig; onSave: (c: ScoringConfig) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<ScoringConfig>(cfg);
  const [exporting, setExporting] = useState(false);
  useBackClose(true, onClose);

  const setPoint = (key: keyof ActionCounts, v: number) => setDraft((d) => ({ ...d, points: { ...d.points, [key]: v } }));

  // --- FIFA-Karten-Regler ---------------------------------------------------
  type CardNumKey = 'basis' | 'elite' | 'spanne' | 'mengeMax' | 'fullGames' | 'totsStart';
  const setCard = (key: CardNumKey, v: number) => setDraft((d) => ({ ...d, card: { ...d.card, [key]: v } }));
  const setVoll = (key: keyof ScoringConfig['card']['vollAktionen'], v: number) =>
    setDraft((d) => ({ ...d, card: { ...d.card, vollAktionen: { ...d.card.vollAktionen, [key]: v } } }));
  const setCap = (key: keyof ScoringConfig['card']['caps'], v: number) =>
    setDraft((d) => ({ ...d, card: { ...d.card, caps: { ...d.card.caps, [key]: v } } }));
  const setAttr = (attr: 'sch' | 'dri' | 'def' | 'par' | 'sic' | 'stl', key: keyof CardAttrTarget, v: number) =>
    setDraft((d) => ({ ...d, card: { ...d.card, [attr]: { ...d.card[attr], [key]: v } } }));
  const setPas = (key: keyof ScoringConfig['card']['pas'], v: number) =>
    setDraft((d) => ({ ...d, card: { ...d.card, pas: { ...d.card.pas, [key]: v } } }));

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
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumField label="Silber" value={draft.tiers.silber} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, silber: v } }))} />
              <NumField label="Gold" value={draft.tiers.gold} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, gold: v } }))} />
              <NumField label="Hero" value={draft.tiers.hero} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, hero: v } }))} />
              <NumField label="TOTS" value={draft.tiers.tots} step={1} onChange={(v) => setDraft((d) => ({ ...d, tiers: { ...d.tiers, tots: v } }))} />
            </div>
            <p className="text-[11px] leading-relaxed text-hl-dim mt-2">
              Bronze ist die Standardstufe (unter Silber). TOTS wird von euch manuell vergeben – automatisch
              erreicht niemand mehr als <span className="text-hl-soft font-semibold">94</span>, TOTS bleibt also den
              handverlesenen Sonderkarten vorbehalten.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">FIFA-Karte — Grundrechnung</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumField label="Basis" value={draft.card.basis} step={1} onChange={(v) => setCard('basis', v)} />
              <NumField label="Höchstwert" value={draft.card.elite} step={1} onChange={(v) => setCard('elite', v)} />
              <NumField label="Spanne" value={draft.card.spanne} step={1} onChange={(v) => setCard('spanne', v)} />
              <NumField label="Mengen-Deckel" value={draft.card.mengeMax} step={0.1} onChange={(v) => setCard('mengeMax', v)} />
            </div>
            <p className="text-[11px] text-hl-dim mt-2 leading-relaxed">
              So wird jeder Kartenwert gerechnet:{' '}
              <span className="text-hl-soft font-semibold">Wert = Basis + Verlässlichkeit × Index × Spanne</span>.
              Der <b>Index</b> ist 1,00, wenn ein Spieler das Elite-Ziel unten genau erreicht.
              <br />
              <b>Spanne</b> = wie viele Punkte „Ziel erreicht" bringt. Höher = großzügiger (Werte steigen,
              Höchstwerte leichter), niedriger = strenger. Bei {draft.card.spanne} ergibt „Ziel erreicht" ={' '}
              <span className="text-hl-soft font-semibold">{Math.round(draft.card.basis + draft.card.spanne)}</span>, der
              Höchstwert {draft.card.elite} wird ab Index{' '}
              <span className="text-hl-soft font-semibold">
                {draft.card.spanne > 0 ? ((draft.card.elite - draft.card.basis) / draft.card.spanne).toFixed(2) : '–'}
              </span>{' '}
              erreicht.
              <br />
              <b>Mengen-Deckel</b> = wie weit Volumen ÜBER dem Ziel noch zählt (1,0 = gar nicht, 1,5 = bis zum
              1,5-fachen). Verhindert, dass reine Masse allein den Höchstwert bringt.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Ab wie vielen Aktionen zählt ein Wert voll</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumField label="Pässe" value={draft.card.vollAktionen.pas} step={1} onChange={(v) => setVoll('pas', v)} />
              <NumField label="Abschluss" value={draft.card.vollAktionen.sch} step={1} onChange={(v) => setVoll('sch', v)} />
              <NumField label="Dribbling" value={draft.card.vollAktionen.dri} step={1} onChange={(v) => setVoll('dri', v)} />
              <NumField label="Defensive" value={draft.card.vollAktionen.def} step={1} onChange={(v) => setVoll('def', v)} />
              <NumField label="TW Paraden" value={draft.card.vollAktionen.par} step={1} onChange={(v) => setVoll('par', v)} />
              <NumField label="TW Sicherheit" value={draft.card.vollAktionen.sic} step={1} onChange={(v) => setVoll('sic', v)} />
              <NumField label="TW Stellung" value={draft.card.vollAktionen.stl} step={1} onChange={(v) => setVoll('stl', v)} />
            </div>
            <p className="text-[11px] text-hl-dim mt-2 leading-relaxed">
              Schutz gegen kleine Stichproben: Wer erst wenige Aktionen hat, wird Richtung Basis gedämpft
              (√-Kurve). Beispiel Dribbling bei {draft.card.vollAktionen.dri}: 2 von 2 gewonnen (100 %) zählt nur zu{' '}
              <span className="text-hl-soft font-semibold">
                {Math.round(Math.min(1, Math.sqrt(2 / Math.max(1, draft.card.vollAktionen.dri))) * 100)} %
              </span>
              , erst ab {draft.card.vollAktionen.dri} Dribblings zählt der Wert voll.{' '}
              <b>Kleiner = großzügiger</b> (Werte steigen schneller), größer = strenger.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Spiele-Deckel (nur Liga)</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              <NumField label="1–2 Sp." value={draft.card.caps.g1_2} step={1} onChange={(v) => setCap('g1_2', v)} />
              <NumField label="3–4 Sp." value={draft.card.caps.g3_4} step={1} onChange={(v) => setCap('g3_4', v)} />
              <NumField label="5–7 Sp." value={draft.card.caps.g5_7} step={1} onChange={(v) => setCap('g5_7', v)} />
              <NumField label="ab 8 Sp." value={draft.card.caps.g8plus} step={1} onChange={(v) => setCap('g8plus', v)} />
              <NumField label="voll ab Sp." value={draft.card.fullGames} step={1} onChange={(v) => setCard('fullGames', v)} />
            </div>
            <p className="text-[11px] text-hl-dim mt-2 leading-relaxed">
              Obergrenze je nach Anzahl gespielter Spiele. Gilt <b>nur in der Liga</b> — beim Testspieltag zählen
              die echten Stats ohne Spiele-Deckel.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Elite-Ziele je Kartenwert</h3>
            <div className="space-y-2">
              <AttrTargetRow label="Abschluss (SCH)" t={draft.card.sch} onChange={(k, v) => setAttr('sch', k, v)} />
              <AttrTargetRow label="Dribbling (DRI)" t={draft.card.dri} onChange={(k, v) => setAttr('dri', k, v)} />
              <AttrTargetRow label="Defensive (DEF)" t={draft.card.def} onChange={(k, v) => setAttr('def', k, v)} />
              <AttrTargetRow label="TW Paraden (PAR)" t={draft.card.par} onChange={(k, v) => setAttr('par', k, v)} />
              <AttrTargetRow label="TW Sicherheit (SIC)" t={draft.card.sic} onChange={(k, v) => setAttr('sic', k, v)} />
              <AttrTargetRow label="TW Stellung (STL)" t={draft.card.stl} onChange={(k, v) => setAttr('stl', k, v)} />
            </div>
            <p className="text-[11px] text-hl-dim mt-2 leading-relaxed">
              <b>Ziel-Quote</b> = welche Quote als Weltklasse gilt (0,70 = 70 %). <b>Ziel-Menge</b> = wie viele
              Aktionen pro Spiel dazugehören. <b>Gew. Quote / Gew. Menge</b> = wie stark beides zählt (zusammen
              idealerweise 1,00). Mehr Gewicht auf die Quote = Können zählt mehr; mehr auf die Menge = Fleiß zählt mehr.
              <br />
              <span className="text-hl-soft">Zu streng?</span> Ziel-Quote senken (z.&nbsp;B. 0,70 → 0,60) oder die
              Spanne oben erhöhen — dann steigen die Werte.
            </p>
          </section>

          <section>
            <h3 className="text-[11px] uppercase tracking-[2px] text-hl-dim mb-2">Passspiel (PAS) im Detail</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <NumField label="Ziel-Passquote" value={draft.card.pas.zielPassquote} step={0.01} onChange={(v) => setPas('zielPassquote', v)} />
              <NumField label="Pässe/Spiel" value={draft.card.pas.zielPaesseSpiel} step={1} onChange={(v) => setPas('zielPaesseSpiel', v)} />
              <NumField label="Schlüsselp./Sp." value={draft.card.pas.zielKeySpiel} step={0.1} onChange={(v) => setPas('zielKeySpiel', v)} />
              <NumField label="Assists/Spiel" value={draft.card.pas.zielAssistsSpiel} step={0.05} onChange={(v) => setPas('zielAssistsSpiel', v)} />
              <NumField label="Gew. Passindex" value={draft.card.pas.gewPassindex} step={0.05} onChange={(v) => setPas('gewPassindex', v)} />
              <NumField label="Gew. Schlüsselp." value={draft.card.pas.gewKey} step={0.05} onChange={(v) => setPas('gewKey', v)} />
              <NumField label="Gew. Assists" value={draft.card.pas.gewAssist} step={0.05} onChange={(v) => setPas('gewAssist', v)} />
              <NumField label="Gew. Quote" value={draft.card.pas.indexGewQuote} step={0.05} onChange={(v) => setPas('indexGewQuote', v)} />
              <NumField label="Gew. Menge" value={draft.card.pas.indexGewMenge} step={0.05} onChange={(v) => setPas('indexGewMenge', v)} />
            </div>
            <p className="text-[11px] text-hl-dim mt-2 leading-relaxed">
              PAS mischt drei Teile: den Pass-Index (Quote + Menge), Schlüsselpässe und Assists — mit den drei
              „Gew."-Reglern gewichtet (zusammen idealerweise 1,00). Die letzten beiden bestimmen innerhalb des
              Pass-Index, wie stark Quote gegenüber Menge zählt.
            </p>
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
