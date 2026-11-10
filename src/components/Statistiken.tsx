import React from 'react';
import { motion } from 'motion/react';
import { useHistoryState } from '../lib/historyState';
import { PlayerStat, Match, Team, MatchPlayerStat, ScoringConfig } from '../types';
import {
  scorerRanking as trackScorers,
  assistRanking as trackAssists,
  goldenGloveRanking,
  playerTotals,
  dribblerValue,
  PASS_MIN,
  DUEL_MIN,
  DRIBBLE_MIN,
  SHOT_MIN,
  GOLDEN_GLOVE_EXPLAIN,
  ballWinnerLeaders,
  headerGoalLeaders,
  keeperBoards,
  type StatLeader,
} from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';
import { Swords, Hand, IdCard, Users, Send, Zap, Target, Shield, Goal, Crown, Handshake, Info, ShieldCheck, Percent } from 'lucide-react';
import { pctFmt, type StatTableCol, type StatTableRow } from './StatTable';
import StatBoards, { type Board } from './StatBoards';
import TrackingProgressBanner from './TrackingProgressBanner';
import { useTrackingProgress } from '../lib/trackingProgress';
import PlayerCrest from './PlayerCrest';
import { TeamCrest, monogram, shade } from './ui';
import { validCutout } from '../lib/playerPhoto';
import { CountUp, Reveal, useSettledList } from './anim';
import CompareOverlay from './CompareOverlay';
import PlayerSteckbrief from './PlayerSteckbrief';
import TeamSteckbrief, { type TeamRecord, type TeamResult } from './TeamSteckbrief';
import { calculateStandings } from '../lib/standings';

interface StatistikenProps {
  players: PlayerStat[];
  matches: Match[];
  teams: Team[];
  trackingRows?: MatchPlayerStat[]; // veröffentlichte getrackte Werte (für die Award-Rechnung)
  scoringConfig?: ScoringConfig; // Score-Einstellungen (Torschützen/Torwart-Score)
  seasonNumber?: number; // laufende Nummer der ausgewählten Saison (für den Rückblick)
  seasonLabel?: string; // Anzeigename der Saison, z. B. „Season 1"
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}

// Torhüter-Zeile: PlayerStat (fürs Wappen) + der getrackte Torwart-Score.
interface GloveRow extends PlayerStat {
  score: number; // Goldener-Handschuh-Score aus den getrackten Aktionen
  saves: number; // Paraden
  penaltySaves: number; // gehaltene Elfmeter
}

type Accent = 'teal' | 'gold' | 'magenta';

const GLOW: Record<Accent, string> = {
  teal: 'radial-gradient(circle,rgba(34,223,201,.16),transparent 68%)',
  gold: 'radial-gradient(circle,rgba(233,196,106,.16),transparent 68%)',
  magenta: 'radial-gradient(circle,rgba(232,62,140,.14),transparent 68%)',
};

const VALUE_COLOR: Record<Accent, string> = {
  teal: 'text-brand-accent-light',
  gold: 'text-hl-gold',
  magenta: 'text-[#F0559E]',
};

// Statistik-Seite: Liga-Kennzahlen als Kachelzeile + Leader-Cards für Spieler und Teams.
// ---------------------------------------------------------------------------
// Großes Bild rechts in den Bestwert-Kacheln: Spielerfoto (sonst Vereinslogo)
// bzw. ein oder mehrere Vereinslogos (Gleichstand – je mehr, desto kleiner).
// ---------------------------------------------------------------------------
type CardVisual =
  | { type: 'player'; imageUrl?: string; teamId: string; color?: string; name: string }
  | { type: 'teams'; teams: Team[] };

// Spielerbild in den Top-5-Listen (Torschützenkönig / Goldener Handschuh):
// freigestellt → steht ohne Hintergrund auf der Zeilenkante; sonst großes Foto/Wappen.
function RowPortrait({
  p,
  teams,
  onSelectTeam,
  onPlayer,
}: {
  p: Pick<PlayerStat, 'name' | 'imageUrl' | 'teamId' | 'teamLogoColor' | 'teamName'>;
  teams: Team[];
  onSelectTeam?: (teamId: string, playerName?: string) => void;
  onPlayer?: () => void;
}) {
  const cut = validCutout(teams.find((t) => t.id === p.teamId)?.spielerliste?.find((x) => x.name === p.name));
  return (
    <div className="shrink-0 w-[60px] sm:w-[74px] lg:w-[84px] self-stretch flex items-center justify-center">
      {cut ? (
        <button
          type="button"
          onClick={onPlayer}
          title={p.name}
          className="self-end -mb-3.5 sm:-mb-4 h-[66px] sm:h-[80px] lg:h-[90px] flex items-end justify-center cursor-pointer"
        >
          <img src={cut} alt={p.name} loading="lazy" decoding="async" className="h-full w-auto max-w-full object-contain object-bottom drop-shadow-[0_6px_14px_rgba(0,0,0,.5)]" />
        </button>
      ) : (
        <PlayerCrest player={p} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />
      )}
    </div>
  );
}

// Freigestelltes Foto des Spielers (falls vorhanden) – aus dem Kader des Vereins.
function cutoutOf(visual: CardVisual, teams: Team[]): string | undefined {
  if (visual.type !== 'player') return undefined;
  const p = teams.find((t) => t.id === visual.teamId)?.spielerliste?.find((x) => x.name === visual.name);
  return validCutout(p);
}

function BigLogo({ team, onSelect }: { team: Team; onSelect?: () => void }) {
  const inner = team.logoUrl ? (
    <img src={team.logoUrl} alt={team.name} loading="lazy" decoding="async" referrerPolicy="no-referrer" className="w-full h-full object-contain drop-shadow-[0_8px_18px_rgba(0,0,0,.45)]" />
  ) : (
    <span
      className="w-full h-full rounded-[22%] grid place-items-center font-display font-black text-white text-[34cqw] leading-none"
      style={{ background: `linear-gradient(140deg, ${team.logoColor || '#22DFC9'}, ${shade(team.logoColor || '#22DFC9', 0.45)})` }}
    >
      {monogram(team.shortName || team.name)}
    </span>
  );
  return onSelect ? (
    <button type="button" onClick={onSelect} title={`${team.name} – Vereinsseite öffnen`} className="@container block w-full aspect-square cursor-pointer transition-transform duration-200 hover:scale-105">
      {inner}
    </button>
  ) : (
    <span className="@container block w-full aspect-square" title={team.name}>
      {inner}
    </span>
  );
}

function CardVisualView({
  visual,
  teams,
  onPlayer,
  onSelectTeam,
}: {
  visual: CardVisual;
  teams: Team[];
  onPlayer?: () => void;
  onSelectTeam?: (teamId: string, playerName?: string) => void;
}) {
  if (visual.type === 'teams') {
    const n = visual.teams.length;
    const cols = n <= 1 ? 1 : n === 2 || n === 4 ? 2 : 3;
    return (
      <div className="grid gap-2 sm:gap-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {visual.teams.map((t) => (
          <BigLogo key={t.id} team={t} onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined} />
        ))}
      </div>
    );
  }
  const team = teams.find((t) => t.id === visual.teamId);
  if (!visual.imageUrl) {
    if (team) return <BigLogo team={team} onSelect={onSelectTeam ? () => onSelectTeam(team.id) : undefined} />;
    return (
      <span
        className="w-full aspect-square rounded-2xl grid place-items-center font-display font-black text-white text-[clamp(28px,8vw,48px)]"
        style={{ background: `linear-gradient(140deg, ${visual.color || '#22DFC9'}, ${shade(visual.color || '#22DFC9', 0.45)})` }}
      >
        {monogram(visual.name)}
      </span>
    );
  }
  return (
    <div className="relative w-full aspect-square">
      <button
        type="button"
        onClick={onPlayer}
        title={onPlayer ? `${visual.name} – Spieler anzeigen` : visual.name}
        className={`block w-full h-full rounded-2xl overflow-hidden border-2 shadow-[0_12px_30px_rgba(0,0,0,.45)] ${onPlayer ? 'cursor-pointer' : 'cursor-default'}`}
        style={{ borderColor: visual.color || 'rgba(255,255,255,.2)' }}
      >
        <img src={visual.imageUrl} alt={visual.name} loading="lazy" decoding="async" className="w-full h-full object-cover transition-transform duration-300 hover:scale-105" />
      </button>
      {team && (
        <span className="absolute -bottom-2 -right-2 w-[34%]">
          <BigLogo team={team} onSelect={onSelectTeam ? () => onSelectTeam(team.id) : undefined} />
        </span>
      )}
    </div>
  );
}

export default function Statistiken({
  players,
  matches: allMatches,
  teams,
  trackingRows: allRows = [],
  scoringConfig,
  seasonNumber = 1,
  seasonLabel = '',
  onSelectTeam,
}: StatistikenProps) {
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [gloveInfo, setGloveInfo] = React.useState(false);
  const [steckbriefOpen, setSteckbriefOpen] = React.useState(false);
  const [teamBriefOpen, setTeamBriefOpen] = React.useState(false);
  // Team-Steckbrief: immer die ganze Saison (wie der Spieler-Steckbrief).
  const seasonStandings = React.useMemo(() => calculateStandings(teams, allMatches), [teams, allMatches]);
  const recordFor = React.useCallback(
    (teamId: string): TeamRecord | null => {
      const i = seasonStandings.findIndex((st) => st.teamId === teamId);
      if (i < 0) return null;
      const st = seasonStandings[i];
      return { rank: i + 1, totalTeams: seasonStandings.length, played: st.played, won: st.won, drawn: st.drawn, lost: st.lost, goalsFor: st.goalsFor, goalsAgainst: st.goalsAgainst, points: st.points };
    },
    [seasonStandings]
  );
  const resultsFor = React.useCallback(
    (teamId: string): TeamResult[] =>
      allMatches
        .filter((m) => m.status === 'beendet' && m.homeScore !== null && m.awayScore !== null && (m.homeTeamId === teamId || m.awayTeamId === teamId))
        .sort((a, b) => a.matchday - b.matchday || (a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''))
        .map((m) => {
          const home = m.homeTeamId === teamId;
          return {
            opponent: teams.find((t) => t.id === (home ? m.awayTeamId : m.homeTeamId))?.name ?? '',
            gf: (home ? m.homeScore : m.awayScore) ?? 0,
            ga: (home ? m.awayScore : m.homeScore) ?? 0,
          };
        }),
    [allMatches, teams]
  );
  // Spieltag-Filter: „Gesamt" (null) oder ein einzelner Spieltag. Alle Werte
  // der Seite (Kacheln, Team-Karten, Torschützen, Bestenlisten, Torhüter)
  // rechnen dann nur mit diesem Spieltag. Steckbrief & 1 gegen 1 bleiben
  // bewusst auf der ganzen Saison. Gehört zur Seite in der Browser-History →
  // „Zurück" (z. B. von einer Spielerseite) landet wieder bei diesem Filter.
  const [matchday, setMatchday] = useHistoryState<number | null>('statistiken-spieltag', null);
  // Läuft gerade ein Tracking? Bei „Gesamt" alle laufenden Spieltage, sonst nur
  // der gefilterte.
  const progress = useTrackingProgress();
  const matchdays = React.useMemo(() => {
    const tracked = new Set(allRows.map((r) => r.matchId));
    const set = new Set<number>();
    for (const m of allMatches) {
      if ((m.status === 'beendet' && m.homeScore !== null) || tracked.has(m.id)) set.add(m.matchday);
    }
    return [...set].sort((a, b) => a - b);
  }, [allMatches, allRows]);
  const activeMd = matchday !== null && matchdays.includes(matchday) ? matchday : null;
  const matches = React.useMemo(
    () => (activeMd === null ? allMatches : allMatches.filter((m) => m.matchday === activeMd)),
    [allMatches, activeMd]
  );
  const trackingRows = React.useMemo(() => {
    if (activeMd === null) return allRows;
    const ids = new Set(matches.map((m) => m.id));
    return allRows.filter((r) => ids.has(r.matchId));
  }, [allRows, matches, activeMd]);

  const finished = matches.filter((m) => m.status === 'beendet' && m.homeScore !== null && m.awayScore !== null);
  const totalGoals = finished.reduce((acc, m) => acc + (m.homeScore || 0) + (m.awayScore || 0), 0);
  const avgGoals = finished.length ? totalGoals / finished.length : 0;

  const leagueTiles = [
    { value: totalGoals, decimals: 0, label: activeMd === null ? 'TORE GESAMT' : `TORE · ${activeMd}. SPIELTAG` },
    { value: avgGoals, decimals: 1, label: 'Ø TORE / SPIEL' },
    { value: finished.length, decimals: 0, label: 'GESPIELTE PARTIEN' },
    { value: teams.length, decimals: 0, label: 'CLUBS' },
  ];

  // Team-Auswertungen
  const clubStats = React.useMemo(() => {
    const stats: {
      [teamId: string]: { team: Team; played: number; goalsFor: number; goalsAgainst: number; cleanSheets: number };
    } = {};
    teams.forEach((t) => {
      stats[t.id] = { team: t, played: 0, goalsFor: 0, goalsAgainst: 0, cleanSheets: 0 };
    });
    finished.forEach((m) => {
      const home = stats[m.homeTeamId];
      const away = stats[m.awayTeamId];
      if (!home || !away) return;
      home.played += 1;
      away.played += 1;
      home.goalsFor += m.homeScore!;
      home.goalsAgainst += m.awayScore!;
      away.goalsFor += m.awayScore!;
      away.goalsAgainst += m.homeScore!;
      if (m.awayScore === 0) home.cleanSheets += 1;
      if (m.homeScore === 0) away.cleanSheets += 1;
    });
    const played = Object.values(stats).filter((s) => s.played > 0);
    type Row = (typeof played)[number];
    // Bester + alle, die beim Hauptwert gleichauf liegen (z. B. drei Teams mit
    // je 2 weißen Westen) – die werden auf der Karte mit genannt.
    const top = (sorted: Row[], val: (r: Row) => number) => {
      const first = sorted[0] ?? null;
      return { first, tied: first ? sorted.slice(1).filter((r) => val(r) === val(first)) : [] };
    };
    const attack = top([...played].sort((a, b) => b.goalsFor - a.goalsFor || a.played - b.played), (r) => r.goalsFor);
    const defense = top([...played].sort((a, b) => a.goalsAgainst - b.goalsAgainst || b.played - a.played), (r) => r.goalsAgainst);
    const clean = top([...played].sort((a, b) => b.cleanSheets - a.cleanSheets || a.goalsAgainst - b.goalsAgainst), (r) => r.cleanSheets);
    return {
      bestAttack: attack.first,
      bestAttackTied: attack.tied.map((r) => r.team),
      bestDefense: defense.first,
      bestDefenseTied: defense.tied.map((r) => r.team),
      mostCleanSheets: clean.first,
      mostCleanSheetsTied: clean.tied.map((r) => r.team),
    };
  }, [teams, finished]);

  // Spieler-Auszeichnungen – jetzt komplett aus den GETRACKTEN Daten (identisch
  // zum Testspiel), damit Liga und Event dieselbe, logische Rechnung nutzen:
  // Torschützenkönig & Vorlagen aus getrackten Toren/Vorlagen, bester Torwart
  // nach dem eigenen Torwart-Score (Goldener Handschuh).
  const cfg = scoringConfig ?? DEFAULT_SCORING;

  // Ein getracktes Ranking auf ein PlayerStat-Objekt abbilden (fürs Wappen/Foto),
  // die Zähler aber aus dem Tracking übernehmen. Fehlt der Spieler in der Liste,
  // wird ein minimales Ersatzobjekt gebaut (Name + Team, ohne Foto).
  const resolvePlayer = React.useCallback(
    (teamId: string, name: string): PlayerStat => {
      const found = players.find((p) => p.teamId === teamId && p.name === name);
      if (found) return found;
      const t = teams.find((x) => x.id === teamId);
      return {
        id: `${teamId}:${name}`,
        name,
        teamId,
        teamName: t?.name ?? teamId,
        teamLogoColor: t?.logoColor ?? '#22dfc9',
        goals: 0,
        assists: 0,
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        motmCount: 0,
        cleanSheets: 0,
        gamesInGoal: 0,
        goalsConceded: 0,
        points: 0,
      };
    },
    [players, teams]
  );

  // Torschützen (getrackt) → PlayerStat-Zeilen mit den getrackten Zählern.
  const scorerRows = React.useMemo(
    () =>
      trackScorers(trackingRows, cfg).map((e) => ({
        ...resolvePlayer(e.teamId, e.playerName),
        goals: e.goals,
        assists: e.assists,
        headerGoals: e.headerGoals,
        matchesPlayed: e.games,
      })),
    [trackingRows, cfg, resolvePlayer]
  );
  const assistRows = React.useMemo(
    () =>
      trackAssists(trackingRows, cfg).map((e) => ({
        ...resolvePlayer(e.teamId, e.playerName),
        goals: e.goals,
        assists: e.assists,
        matchesPlayed: e.games,
      })),
    [trackingRows, cfg, resolvePlayer]
  );

  // Bester Torwart – eigener Torwart-Score aus den getrackten Torwart-Aktionen
  // (weniger kassieren als der Schnitt, Paraden, Spiele zu null, gehaltene
  // Elfmeter, Stellungsspiel). Top 5 absteigend nach Score.
  const gloveRows = React.useMemo<GloveRow[]>(
    () =>
      goldenGloveRanking(trackingRows, cfg).map((e) => ({
        ...resolvePlayer(e.teamId, e.playerName),
        gamesInGoal: e.keeperGames,
        cleanSheets: e.cleanSheets,
        goalsConceded: e.goalsConceded,
        score: e.goldenGloveScore,
        saves: e.saves,
        penaltySaves: e.penaltySaves,
      })),
    [trackingRows, cfg, resolvePlayer]
  );

  // Bestenlisten der Saison (Top 10) – dieselben Listen wie beim Testspiel,
  // nur über alle live geschalteten Liga-Spiele.
  const boards = React.useMemo(() => {
    const scorePts = new Map<string, StatLeader>();
    for (const e of trackScorers(trackingRows, cfg)) scorePts.set(`${e.teamId}::${e.playerName}`, { teamId: e.teamId, playerName: e.playerName, value: e.goals, quote: null, games: e.games });
    for (const e of trackAssists(trackingRows, cfg)) {
      const k = `${e.teamId}::${e.playerName}`;
      const cur = scorePts.get(k);
      if (cur) cur.value = e.goals + e.assists;
      else scorePts.set(k, { teamId: e.teamId, playerName: e.playerName, value: e.assists, quote: null, games: e.games });
    }
    const toLeader = (e: { teamId: string; playerName: string; games: number }, value: number): StatLeader => ({ teamId: e.teamId, playerName: e.playerName, value, quote: null, games: e.games });
    // Sortierbare Tabellen (Gesamt · erfolgreich · Quote) aus den Summen je Spieler.
    const totals = playerTotals(trackingRows, cfg);
    const table = (
      make: (t: (typeof totals)[number]['total']) => Record<string, number | null> | null
    ): StatTableRow[] =>
      totals
        .map((p) => ({ teamId: p.teamId, playerName: p.playerName, values: make(p.total) }))
        .filter((r): r is StatTableRow => r.values !== null);
    const q = (a: number, b: number, min: number) => (b >= min && b > 0 ? a / b : null);
    // „Wert" = erfolgreiche × Quote – Menge UND Erfolg zählen (ab Mindestanzahl).
    const wert = (ok: number, all: number, min: number) => (all >= min && all > 0 ? Math.round(((ok * ok) / all) * 10) / 10 : null);
    const shotRows = table((t) => {
      const all = t.goal + t.shot_on + t.shot_miss + t.shot_blocked_off;
      const on = t.goal + t.shot_on;
      return all > 0 ? { all, on, quote: q(on, all, SHOT_MIN), value: wert(on, all, SHOT_MIN) } : null;
    });
    const passRows = table((t) => {
      const all = t.pass_ok + t.pass_fail;
      return all > 0 ? { all, ok: t.pass_ok, quote: q(t.pass_ok, all, PASS_MIN), key: t.key_pass, value: wert(t.pass_ok, all, PASS_MIN) } : null;
    });
    const duelRows = table((t) => {
      const all = t.duel_won + t.duel_lost;
      return all > 0 ? { all, won: t.duel_won, quote: q(t.duel_won, all, DUEL_MIN), value: wert(t.duel_won, all, DUEL_MIN) } : null;
    });
    const dribRows = table((t) => {
      const all = t.dribble_won + t.dribble_lost;
      return all > 0
        ? { all, won: t.dribble_won, quote: q(t.dribble_won, all, DRIBBLE_MIN), value: dribblerValue(t.dribble_won, t.dribble_lost) }
        : null;
    });
    const tables: {
      id: string;
      title: string;
      label: string;
      accent: string;
      icon: React.ReactNode;
      rows: StatTableRow[];
      cols: StatTableCol[];
      defaultSort: string;
      note: string;
    }[] = [
      {
        id: 'shots', title: 'Torschüsse', label: 'Schüsse', accent: '#F0559E', icon: <Target className="w-4 h-4" />, rows: shotRows, defaultSort: 'value',
        cols: [{ key: 'all', label: 'Gesamt' }, { key: 'on', label: 'Aufs Tor' }, { key: 'quote', label: 'Quote', fmt: pctFmt }, { key: 'value', label: 'Wert', fmt: (v) => v.toFixed(1) }],
        note: `Quote = Schüsse aufs Tor (inkl. Tore) ÷ alle Schüsse · Wert = aufs Tor × Quote · ab ${SHOT_MIN} Schüssen`,
      },
      {
        id: 'pass', title: 'Pässe', label: 'Pässe', accent: '#22DFC9', icon: <Send className="w-4 h-4" />, rows: passRows, defaultSort: 'value',
        cols: [
          { key: 'all', label: 'Gesamt' },
          { key: 'ok', label: 'Ange\u00ADkommen' },
          { key: 'quote', label: 'Quote', fmt: pctFmt },
          { key: 'key', label: 'Schlüs\u00ADsel\u00ADpässe' },
          { key: 'value', label: 'Wert', fmt: (v) => v.toFixed(1) },
        ],
        note: `Quote = angekommene ÷ alle Pässe · Wert = angekommene × Quote · ab ${PASS_MIN} Pässen · Schlüsselpass = Pass, der direkt zur Torchance führt`,
      },
      {
        id: 'duel', title: 'Zweikämpfe', label: 'Zweikämpfe', accent: '#43E5A0', icon: <Swords className="w-4 h-4" />, rows: duelRows, defaultSort: 'value',
        cols: [{ key: 'all', label: 'Gesamt' }, { key: 'won', label: 'Gewonnen' }, { key: 'quote', label: 'Quote', fmt: pctFmt }, { key: 'value', label: 'Wert', fmt: (v) => v.toFixed(1) }],
        note: `Quote = gewonnene ÷ alle Zweikämpfe · Wert = gewonnene × Quote · ab ${DUEL_MIN} Zweikämpfen`,
      },
      {
        id: 'drib', title: 'Beste Dribbler', label: 'Dribbler', accent: '#E9C46A', icon: <Zap className="w-4 h-4" />, rows: dribRows, defaultSort: 'value',
        cols: [
          { key: 'all', label: 'Gesamt' },
          { key: 'won', label: 'Erfolg\u00ADreich' },
          { key: 'quote', label: 'Quote', fmt: pctFmt },
          { key: 'value', label: 'Wert', fmt: (v) => v.toFixed(1) },
        ],
        note: `Wert = erfolgreiche Dribblings × Quote (Menge UND Erfolg zählen) · ab ${DRIBBLE_MIN} Dribblings`,
      },
    ];
    const lists = [
      { id: 'goals', title: 'Torschützen', label: 'Tore', unit: 'Tore', accent: '#E9C46A', icon: <Crown className="w-4 h-4" />,
        rows: trackScorers(trackingRows, cfg).slice(0, 10).map((e) => toLeader(e, e.goals)) },
      { id: 'assists', title: 'Vorlagen', label: 'Vorlagen', unit: 'Vorlagen', accent: '#22DFC9', icon: <Handshake className="w-4 h-4" />,
        rows: trackAssists(trackingRows, cfg).slice(0, 10).map((e) => toLeader(e, e.assists)) },
      { id: 'scorer', title: 'Scorerpunkte', label: 'Scorer', unit: 'Tore + Vorlagen', accent: '#43E5A0', icon: <Target className="w-4 h-4" />,
        rows: [...scorePts.values()].sort((a, b) => b.value - a.value || a.playerName.localeCompare(b.playerName)).slice(0, 10) },
      { id: 'win', title: 'Balleroberer', label: 'Balleroberer', unit: 'Ballgewinne', accent: '#58F0CD', icon: <Shield className="w-4 h-4" />, rows: ballWinnerLeaders(trackingRows, cfg) },
      { id: 'head', title: 'Kopfballtore', label: 'Kopfball', unit: 'Kopfballtore', accent: '#F0559E', icon: <Goal className="w-4 h-4" />, rows: headerGoalLeaders(trackingRows, cfg) },
    ].filter((b) => b.rows.length > 0);
    return {
      lists,
      tables: tables.filter((t) => t.rows.length > 0),
    };
  }, [trackingRows, cfg]);

  // Bestenlisten als Leaderboard: Feldspieler- und Torhüter-Kategorien.
  const fieldBoards = React.useMemo<Board[]>(() => {
    const list = (b: (typeof boards.lists)[number]): Board => ({
      kind: 'list',
      id: b.id,
      label: b.label,
      title: b.title,
      unit: b.unit,
      accent: b.accent,
      icon: b.icon,
      entries: b.rows.map((r) => ({
        teamId: r.teamId,
        playerName: r.playerName,
        value: r.value,
        display: String(r.value),
        sub: r.games ? `${r.games} ${r.games === 1 ? 'Spiel' : 'Spiele'}` : undefined,
      })),
    });
    const table = (t: (typeof boards.tables)[number]): Board => ({
      kind: 'table',
      id: t.id,
      label: t.label,
      title: t.title,
      accent: t.accent,
      icon: t.icon,
      rows: t.rows,
      cols: t.cols,
      defaultSort: t.defaultSort,
      note: t.note,
    });
    return [...boards.lists.slice(0, 3).map(list), ...boards.tables.map(table), ...boards.lists.slice(3).map(list)];
  }, [boards]);

  const keeperBoardList = React.useMemo<Board[]>(() => {
    const kb = keeperBoards(trackingRows, cfg);
    const SHORT: Record<string, string> = { glove: 'Handschuh', saveRate: 'Quote', clean: 'Weiße Westen', conceded: 'Gegentore', pens: 'Elfmeter', pass: 'Passquote' };
    const ICON: Record<string, React.ReactNode> = {
      glove: <Crown className="w-4 h-4" />,
      saveRate: <Percent className="w-4 h-4" />,
      clean: <ShieldCheck className="w-4 h-4" />,
      conceded: <Shield className="w-4 h-4" />,
      pens: <Target className="w-4 h-4" />,
      pass: <Send className="w-4 h-4" />,
    };
    const fmt = (b: (typeof kb)[number], v: number) => (b.percent ? `${Math.round(v * 100)}%` : b.decimals > 0 ? v.toFixed(b.decimals) : String(v));
    const list = (b: (typeof kb)[number]): Board => {
      const first = b.rows[0]?.value ?? 0;
      return {
        kind: 'list',
        id: b.id,
        label: SHORT[b.id] ?? b.label,
        title: b.label,
        unit: b.unit || (b.percent ? 'Quote' : ''),
        accent: b.id === 'glove' ? '#E9C46A' : '#22DFC9',
        icon: ICON[b.id] ?? <Hand className="w-4 h-4" />,
        note: b.hint,
        entries: b.rows.map((r) => ({
          teamId: r.teamId,
          playerName: r.playerName,
          // „Wenigste Gegentore": kleiner ist besser → Balken umgedreht.
          value: b.id === 'conceded' ? (r.value > 0 ? first / r.value : 1) : r.value,
          display: fmt(b, r.value),
          sub: r.sub,
        })),
      };
    };
    // Paraden · Glanzparaden · Standparaden in EINER sortierbaren Tabelle.
    const saveRows: StatTableRow[] = playerTotals(trackingRows, cfg)
      .filter((p) => p.role === 'keeper' || p.total.save + p.total.gk_position_save > 0)
      .filter((p) => p.total.save + p.total.save_top + p.total.gk_position_save > 0)
      .map((p) => ({ teamId: p.teamId, playerName: p.playerName, values: { save: p.total.save, top: p.total.save_top, pos: p.total.gk_position_save } }));
    const merged = new Set(['saves', 'top', 'pos']);
    const saves: Board[] = saveRows.length
      ? [
          {
            kind: 'table',
            id: 'saves',
            label: 'Paraden',
            title: 'Paraden',
            accent: '#22DFC9',
            icon: <Hand className="w-4 h-4" />,
            rows: saveRows,
            cols: [
              { key: 'save', label: 'Paraden' },
              { key: 'top', label: 'Glanz\u00ADparaden' },
              { key: 'pos', label: 'Stand\u00ADparaden' },
            ],
            defaultSort: 'save',
            note: 'Glanzparaden zählen auch als Parade · Standparade = sicher gefangen, ohne Gefahr',
          },
        ]
      : [];
    return [...kb.filter((b) => b.id === 'glove').map(list), ...saves, ...kb.filter((b) => b.id !== 'glove' && !merged.has(b.id)).map(list)];
  }, [trackingRows, cfg]);

  const topScorer = scorerRows[0] ?? null;
  const topAssist = assistRows[0] ?? null;
  const bestRatio =
    [...scorerRows]
      .filter((p) => p.goals > 0 && p.matchesPlayed > 0)
      .sort((a, b) => b.goals / b.matchesPlayed - a.goals / a.matchesPlayed)[0] ?? null;

  const scorerRanking = scorerRows.slice(0, 5);
  const gloveRanking = gloveRows.slice(0, 5);

  // Container-Refs für die weiche Umsortier-Animation (motion layout) bei Live-Updates.
  const scorer = useSettledList(scorerRanking, (p) => p.name);
  const glove = useSettledList(gloveRanking, (p) => p.name);

  // Klick auf den Spielernamen öffnet direkt das Spieler-Detail auf der Vereinsseite.
  const teamOf = (p: PlayerStat) => teams.find((t) => t.id === p.teamId);
  const goPlayer = (p: PlayerStat) => {
    const t = teamOf(p);
    if (t && onSelectTeam) onSelectTeam(t.id, p.name);
  };

  interface LeaderCard {
    kind: 'SPIELER' | 'TEAM';
    category: string;
    accent: Accent;
    value: number;
    decimals?: number;
    unit: string;
    name: string;
    sub?: string;
    subTeamId?: string; // Verein unter dem Spielernamen → anklickbar (Vereinsseite)
    visual: CardVisual;
    onClick?: () => void; // Namensklick: Spieler → Spielerdetail, Team → Teamseite
    tied?: Team[]; // weitere Teams mit genau demselben Wert
    team?: Team; // bei Team-Karten: das (erste) Team
  }

  const cards: LeaderCard[] = [];

  if (topScorer) {
    cards.push({
      kind: 'SPIELER',
      category: 'MEISTE TORE',
      onClick: onSelectTeam ? () => onSelectTeam(topScorer.teamId, topScorer.name) : undefined,
      accent: 'gold',
      value: topScorer.goals,
      unit: 'Tore',
      name: topScorer.name,
      sub: topScorer.teamName,
      subTeamId: topScorer.teamId,
      visual: { type: 'player', imageUrl: topScorer.imageUrl, teamId: topScorer.teamId, color: topScorer.teamLogoColor, name: topScorer.name },
    });
  }
  if (topAssist) {
    cards.push({
      kind: 'SPIELER',
      category: 'MEISTE ASSISTS',
      onClick: onSelectTeam ? () => onSelectTeam(topAssist.teamId, topAssist.name) : undefined,
      accent: 'teal',
      value: topAssist.assists,
      unit: 'Vorlagen',
      name: topAssist.name,
      sub: topAssist.teamName,
      subTeamId: topAssist.teamId,
      visual: { type: 'player', imageUrl: topAssist.imageUrl, teamId: topAssist.teamId, color: topAssist.teamLogoColor, name: topAssist.name },
    });
  }
  if (bestRatio) {
    cards.push({
      kind: 'SPIELER',
      category: 'TORE PRO SPIEL',
      onClick: onSelectTeam ? () => onSelectTeam(bestRatio.teamId, bestRatio.name) : undefined,
      accent: 'magenta',
      value: bestRatio.goals / bestRatio.matchesPlayed,
      decimals: 1,
      unit: 'Tore pro Spiel',
      name: bestRatio.name,
      sub: bestRatio.teamName,
      subTeamId: bestRatio.teamId,
      visual: { type: 'player', imageUrl: bestRatio.imageUrl, teamId: bestRatio.teamId, color: bestRatio.teamLogoColor, name: bestRatio.name },
    });
  }
  if (clubStats.bestAttack && clubStats.bestAttack.goalsFor > 0) {
    const t = clubStats.bestAttack.team;
    cards.push({
      kind: 'TEAM',
      category: 'BESTE OFFENSIVE',
      team: t,
      onClick: onSelectTeam ? () => onSelectTeam(t.id) : undefined,
      accent: 'teal',
      value: clubStats.bestAttack.goalsFor,
      unit: 'Tore',
      name: t.name,
      tied: clubStats.bestAttackTied,
      visual: { type: 'teams', teams: [t, ...(clubStats.bestAttackTied ?? [])] },
    });
  }
  if (clubStats.bestDefense) {
    const t = clubStats.bestDefense.team;
    cards.push({
      kind: 'TEAM',
      category: 'BESTE DEFENSIVE',
      team: t,
      onClick: onSelectTeam ? () => onSelectTeam(t.id) : undefined,
      accent: 'teal',
      value: clubStats.bestDefense.goalsAgainst,
      unit: clubStats.bestDefense.goalsAgainst === 1 ? 'Gegentor' : 'Gegentore',
      name: t.name,
      tied: clubStats.bestDefenseTied,
      visual: { type: 'teams', teams: [t, ...(clubStats.bestDefenseTied ?? [])] },
    });
  }
  if (clubStats.mostCleanSheets && clubStats.mostCleanSheets.cleanSheets > 0) {
    const t = clubStats.mostCleanSheets.team;
    cards.push({
      kind: 'TEAM',
      category: 'MEISTE WEISSE WESTEN',
      team: t,
      onClick: onSelectTeam ? () => onSelectTeam(t.id) : undefined,
      accent: 'gold',
      value: clubStats.mostCleanSheets.cleanSheets,
      unit: clubStats.mostCleanSheets.cleanSheets === 1 ? 'Spiel' : 'Spiele',
      name: t.name,
      tied: clubStats.mostCleanSheetsTied,
      visual: { type: 'teams', teams: [t, ...(clubStats.mostCleanSheetsTied ?? [])] },
    });
  }

  return (
    <div className="max-w-[1320px] xl:max-w-[1600px] 2xl:max-w-[1780px] mx-auto px-4 sm:px-10 pb-10">
      {/* Spieltag-Filter */}
      {matchdays.length > 0 && (
        <div className="flex flex-wrap gap-2 pt-1 pb-4" role="tablist" aria-label="Spieltag wählen">
          {[null, ...matchdays].map((md) => {
            const on = md === activeMd;
            return (
              <button
                key={md ?? 'all'}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setMatchday(md)}
                className={`px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-sans font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
                  on
                    ? 'bg-brand-accent-light text-[#04201c] border-brand-accent-light'
                    : 'border-white/15 text-hl-mute hover:text-white hover:border-white/30'
                }`}
              >
                {md === null ? 'Gesamt' : `${md}. Spieltag`}
              </button>
            );
          })}
        </div>
      )}

      {/* Live-Tracking-Fortschritt („Das Team ist am Auswerten · 40 %") */}
      {progress
        .filter((d) => activeMd === null || d.matchday === activeMd)
        .map((d) => (
          <TrackingProgressBanner
            key={d.dayKey}
            day={d}
            className="mb-4"
          />
        ))}

      {/* Liga-Kennzahlen */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 pt-2 hl-cascade">
        {leagueTiles.map((tile) => (
          <div
            key={tile.label}
            className="relative rounded-2xl overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.045),rgba(255,255,255,.012))] border border-white/10 p-5 backdrop-blur-md"
          >
            <div className="font-display font-black text-[42px] lg:text-[54px] leading-[.9] text-brand-accent-light">
              <CountUp value={tile.value} decimals={tile.decimals} />
            </div>
            <div className="font-sans font-bold text-[11px] sm:text-xs lg:text-sm tracking-[1.5px] text-hl-dim mt-1.5">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Aktionen: Steckbrief · 1 gegen 1 · Team-Steckbrief – eine Reihe */}
      {players.length > 0 && (
        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          {(
            [
              {
                id: 'me',
                on: true,
                title: 'Mein Steckbrief',
                sub: 'Deine Werte & Platzierungen',
                icon: <IdCard className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:-rotate-6" />,
                color: '#E9C46A',
                bg: 'linear-gradient(135deg, rgba(233,196,106,.22), rgba(233,196,106,.04) 70%)',
                open: () => setSteckbriefOpen(true),
              },
              {
                id: 'vs',
                on: players.length >= 2,
                title: '1 gegen 1',
                sub: 'Zwei Spieler vergleichen',
                icon: <Swords className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />,
                color: '#22DFC9',
                bg: 'linear-gradient(135deg, rgba(34,223,201,.22), rgba(230,35,142,.10) 70%)',
                open: () => setCompareOpen(true),
              },
              {
                id: 'team',
                on: teams.length > 0,
                title: 'Team-Steckbrief',
                sub: 'Kader, Bilanz & Teamwerte',
                icon: <Users className="w-5 h-5 sm:w-6 sm:h-6 transition-transform duration-300 group-hover:scale-110" />,
                color: '#8FA8FF',
                bg: 'linear-gradient(135deg, rgba(47,91,255,.26), rgba(47,91,255,.05) 70%)',
                open: () => setTeamBriefOpen(true),
              },
            ] as const
          )
            .filter((a) => a.on)
            .map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={a.open}
                className="group relative overflow-hidden min-w-0 flex flex-col sm:flex-row items-center sm:items-center gap-2 sm:gap-3.5 rounded-2xl px-2 py-3.5 sm:px-5 sm:py-4 text-center sm:text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] border"
                style={{ background: a.bg, borderColor: `${a.color}55` }}
              >
                <span className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl grid place-items-center shrink-0" style={{ background: `${a.color}26`, color: a.color }}>
                  {a.icon}
                </span>
                <span className="min-w-0 sm:flex-1">
                  <span className="block font-display font-black uppercase tracking-tight text-white text-[13px] leading-[1.05] sm:text-xl sm:leading-none">{a.title}</span>
                  <span className="hidden sm:block text-xs lg:text-[13px] font-sans font-semibold text-hl-mute mt-1 truncate">{a.sub}</span>
                </span>
                {a.id === 'vs' && (
                  <span className="hidden lg:block shrink-0 font-display font-black italic text-[22px] leading-none tracking-tight bg-gradient-to-r from-brand-accent-light to-[#E6238E] bg-clip-text text-transparent transition-transform duration-300 group-hover:scale-110">
                    VS
                  </span>
                )}
              </button>
            ))}
        </div>
      )}

      <CompareOverlay
        open={compareOpen}
        onClose={() => setCompareOpen(false)}
        players={players}
        teams={teams}
        trackingRows={allRows}
        matches={allMatches}
        scoringConfig={scoringConfig}
      />
      <PlayerSteckbrief
        open={steckbriefOpen}
        onClose={() => setSteckbriefOpen(false)}
        players={players}
        teams={teams}
        trackingRows={allRows}
        matches={allMatches}
        scoringConfig={scoringConfig}
        seasonLabel={seasonLabel}
      />
      <TeamSteckbrief
        open={teamBriefOpen}
        onClose={() => setTeamBriefOpen(false)}
        teams={teams}
        players={players}
        trackingRows={allRows}
        recordFor={recordFor}
        resultsFor={resultsFor}
        scoringConfig={scoringConfig}
        subtitle={seasonLabel || undefined}
        showSquad
      />

      {/* Leader-Cards */}
      {cards.length === 0 ? (
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm mt-5">
          Noch keine Statistiken verfügbar. Sobald Spiele beendet sind, erscheinen hier die Bestwerte.
        </div>
      ) : (
        <Reveal className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
          {cards.map((c) => {
            const many = c.visual.type === 'teams' ? c.visual.teams.length : 1;
            // Mehr Teams im Gleichstand → Logos und Zahl etwas kleiner, damit alles ins Feld passt.
            const numCls = many <= 1 ? 'text-[56px] sm:text-[64px] lg:text-[76px]' : many === 2 ? 'text-[48px] sm:text-[56px] lg:text-[64px]' : 'text-[40px] sm:text-[46px] lg:text-[52px]';
            return (
              <div
                key={c.category}
                className="relative flex rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 p-5 sm:p-6 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]"
              >
                <div className="absolute top-0 right-0 w-[180px] h-[180px] pointer-events-none" style={{ background: GLOW[c.accent] }} />
                {/* Links: Überschrift, Name, große Zahl · rechts: großes Bild/Logo */}
                <div className="relative flex-1 min-w-0 flex gap-3 sm:gap-4">
                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className={`font-display font-black text-xl sm:text-2xl uppercase tracking-tight leading-none ${VALUE_COLOR[c.accent]}`}>
                      {c.category}
                    </div>
                    {many <= 1 && (
                      <div className="mt-3 min-w-0">
                        {c.onClick ? (
                          <button
                            type="button"
                            onClick={c.onClick}
                            className="block max-w-full text-left font-display font-black text-[22px] sm:text-[26px] leading-[.95] uppercase text-white truncate cursor-pointer hover:opacity-80 transition-opacity"
                            title={`${c.name} – ${c.kind === 'SPIELER' ? 'Spieler anzeigen' : 'Verein anzeigen'}`}
                          >
                            {c.name}
                          </button>
                        ) : (
                          <div className="font-display font-black text-[22px] sm:text-[26px] leading-[.95] uppercase text-white truncate">{c.name}</div>
                        )}
                        {c.sub && (c.subTeamId && onSelectTeam && teams.some((t) => t.id === c.subTeamId) ? (
                          <button
                            type="button"
                            onClick={() => onSelectTeam(c.subTeamId!)}
                            title={`${c.sub} – Vereinsseite öffnen`}
                            className="block max-w-full text-left font-sans text-[12.5px] text-hl-mute mt-1 truncate cursor-pointer hover:text-white transition-colors"
                          >
                            {c.sub}
                          </button>
                        ) : (
                          <div className="font-sans text-[12.5px] text-hl-mute mt-1 truncate">{c.sub}</div>
                        ))}
                      </div>
                    )}
                    <div className="mt-auto pt-4 flex items-baseline gap-2 flex-wrap">
                      <span className={`font-display font-black leading-[.85] ${numCls} ${VALUE_COLOR[c.accent]}`}>
                        <CountUp value={c.value} decimals={c.decimals ?? 0} />
                      </span>
                      <span className="font-sans font-bold text-[13px] tracking-wider text-hl-dim">{c.unit}</span>
                    </div>
                  </div>
                  {/* Freigestellter Spieler: Platz reservieren, Bild steht unten auf der Kachelkante. */}
                  <div className={`shrink-0 self-center ${many <= 1 ? 'w-[118px] sm:w-[140px] lg:w-[156px]' : 'w-[46%]'}`}>
                    {!cutoutOf(c.visual, teams) && (
                      <CardVisualView visual={c.visual} teams={teams} onPlayer={c.onClick} onSelectTeam={onSelectTeam} />
                    )}
                  </div>
                </div>
                {cutoutOf(c.visual, teams) && (
                  <button
                    type="button"
                    onClick={c.onClick}
                    title={c.onClick ? `${c.name} – Spieler anzeigen` : c.name}
                    className={`absolute bottom-0 top-3 right-0 w-[48%] sm:w-[46%] flex items-end justify-end ${c.onClick ? 'cursor-pointer' : 'cursor-default'}`}
                  >
                    <img
                      src={cutoutOf(c.visual, teams)}
                      alt={c.name}
                      loading="lazy"
                      decoding="async"
                      className="max-h-full max-w-full object-contain object-bottom drop-shadow-[0_10px_24px_rgba(0,0,0,.5)] transition-transform duration-300 origin-bottom-right hover:scale-[1.03]"
                    />
                  </button>
                )}
              </div>
            );
          })}
        </Reveal>
      )}

      {/* Auszeichnungen: Torschützenkönig + Goldener Handschuh nebeneinander */}
      {(scorerRanking.length > 0 || gloveRanking.length > 0) && (
        <Reveal className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8 items-stretch">
          {/* Torschützenkönig – Top 5 nach erzielten Toren */}
          {scorerRanking.length > 0 && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2.5 mb-4 min-h-[36px]">
                <span className="text-2xl">⚽</span>
                <h3 className="font-display font-black text-xl sm:text-2xl lg:text-3xl uppercase tracking-tight text-white">
                  Torschützenkönig
                </h3>
                <span className="font-sans font-bold text-[11px] sm:text-xs tracking-[1.5px] text-hl-dim mt-1">TOP 5 · SPIELER</span>
              </div>
              <div className="relative flex-1 flex flex-col rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.gold }} />
                <div ref={scorer.ref} className="relative flex-1 flex flex-col divide-y divide-white/[.06] hl-cascade-soft">
                  {scorer.items.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const sub = [
                      `${p.assists} Assists`,
                      p.matchesPlayed > 0 ? `${p.matchesPlayed} Spiele` : null,
                      // Kopfballtore sind eine Teilmenge der Tore – deshalb „davon".
                      p.headerGoals > 0 ? `davon ${p.headerGoals} per Kopf` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <motion.div
                        layout="position"
                        transition={{ type: 'spring', stiffness: 240, damping: 32 }}
                        key={p.id}
                        className="flex-1 flex items-center gap-3.5 sm:gap-4 px-4 sm:px-6 py-3.5 sm:py-4"
                      >
                        <div className={`font-display font-black text-2xl sm:text-3xl lg:text-[40px] w-7 sm:w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <RowPortrait p={p} teams={teams} onSelectTeam={onSelectTeam} onPlayer={() => goPlayer(p)} />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => goPlayer(p)}
                            title={teamOf(p) ? `${p.teamName} – Vereinsseite öffnen` : undefined}
                            className={`block max-w-full text-left font-sans font-bold text-[15px] sm:text-lg lg:text-xl text-white truncate ${teamOf(p) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                          >
                            {p.name}
                          </button>
                          <div className="font-sans text-xs sm:text-[13px] lg:text-sm text-hl-dim truncate mt-0.5">{sub}</div>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 pl-2">
                          <span className="font-display font-black text-2xl sm:text-[34px] lg:text-[44px] leading-none text-hl-gold tabular-nums">
                            <CountUp value={p.goals} />
                          </span>
                          <span className="font-sans font-bold text-[10px] sm:text-[11px] lg:text-xs tracking-wider text-hl-dim">TORE</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Goldener Handschuh – Torhüterwertung (Top 5 nach „zu null") */}
          {gloveRanking.length > 0 && (
            <div className="flex flex-col">
              <div className="flex items-center gap-2.5 mb-4 min-h-[36px]">
                <span className="text-2xl">🧤</span>
                <h3 className="font-display font-black text-xl sm:text-2xl lg:text-3xl uppercase tracking-tight text-white">
                  Goldener Handschuh
                </h3>
                <span className="font-sans font-bold text-[11px] sm:text-xs tracking-[1.5px] text-hl-dim mt-1">TOP 5 · TORHÜTER</span>
                <button
                  type="button"
                  onClick={() => setGloveInfo((v) => !v)}
                  aria-expanded={gloveInfo}
                  title="Wie werden die Punkte berechnet?"
                  className="ml-auto p-1.5 rounded-full text-hl-dim hover:text-white hover:bg-white/5 cursor-pointer"
                >
                  <Info className="w-4 h-4" />
                </button>
              </div>
              {gloveInfo && (
                <div className="mb-3 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-[12px] sm:text-[13px] lg:text-sm text-hl-mute font-sans">
                  <div className="font-bold text-hl-soft mb-1">So entstehen die Punkte (PKT):</div>
                  <ul className="space-y-0.5">
                    {GOLDEN_GLOVE_EXPLAIN.map((l) => (
                      <li key={l}>• {l}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="relative flex-1 flex flex-col rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.teal }} />
                <div ref={glove.ref} className="relative flex-1 flex flex-col divide-y divide-white/[.06] hl-cascade-soft">
                  {glove.items.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const sub = [
                      `${p.gamesInGoal} im Tor`,
                      p.cleanSheets > 0 ? `${p.cleanSheets}× zu null` : null,
                      `${p.goalsConceded} Gegentore`,
                      p.saves > 0 ? `${p.saves} Paraden` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <motion.div
                        layout="position"
                        transition={{ type: 'spring', stiffness: 240, damping: 32 }}
                        key={p.id}
                        className="flex-1 flex items-center gap-3.5 sm:gap-4 px-4 sm:px-6 py-3.5 sm:py-4"
                      >
                        <div className={`font-display font-black text-2xl sm:text-3xl lg:text-[40px] w-7 sm:w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <RowPortrait p={p} teams={teams} onSelectTeam={onSelectTeam} onPlayer={() => goPlayer(p)} />
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => goPlayer(p)}
                            title={teamOf(p) ? `${p.teamName} – Vereinsseite öffnen` : undefined}
                            className={`block max-w-full text-left font-sans font-bold text-[15px] sm:text-lg lg:text-xl text-white truncate ${teamOf(p) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                          >
                            {p.name}
                          </button>
                          <div className="font-sans text-xs sm:text-[13px] lg:text-sm text-hl-dim truncate mt-0.5">{sub}</div>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 pl-2">
                          <span className="font-display font-black text-2xl sm:text-[34px] lg:text-[44px] leading-none text-brand-accent-light tabular-nums">
                            <CountUp value={p.score} decimals={1} />
                          </span>
                          <span className="font-sans font-bold text-[10px] sm:text-[11px] lg:text-xs tracking-wider text-hl-dim">PUNKTE</span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </Reveal>
      )}

      {/* Bestenlisten der Saison – Feldspieler/Torhüter, Kategorien, Podest + Liste */}
      {(fieldBoards.length > 0 || keeperBoardList.length > 0) && (
        <Reveal className="mt-12">
          <StatBoards
            title={activeMd === null ? 'Bestenlisten der Saison' : `Bestenlisten · ${activeMd}. Spieltag`}
            field={fieldBoards}
            keeper={keeperBoardList}
            teams={teams}
            players={players}
            onSelectTeam={onSelectTeam}
          />
        </Reveal>
      )}
    </div>
  );
}
