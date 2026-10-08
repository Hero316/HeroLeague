import React from 'react';
import { motion } from 'motion/react';
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
  keyPassLeaders,
  headerGoalLeaders,
  type StatLeader,
} from '../lib/trackingAwards';
import { DEFAULT_SCORING } from '../lib/scoring';
import { Swords, Hand, IdCard, BarChart3, Send, Zap, Target, Shield, Sparkles, Goal, Crown, Handshake, Info } from 'lucide-react';
import StatTable, { pctFmt, sortStatRows, type StatTableCol, type StatTableRow } from './StatTable';
import StatAccordion from './StatAccordion';
import TrackingProgressBanner from './TrackingProgressBanner';
import { useTrackingProgress } from '../lib/trackingProgress';
import PlayerCrest from './PlayerCrest';
import { TeamCrest } from './ui';
import { CountUp, Reveal, useSettledList } from './anim';
import CompareOverlay from './CompareOverlay';
import KeeperStats from './KeeperStats';
import PlayerSteckbrief from './PlayerSteckbrief';

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
  const [keeperOpen, setKeeperOpen] = React.useState(false);
  const [gloveInfo, setGloveInfo] = React.useState(false);
  const [steckbriefOpen, setSteckbriefOpen] = React.useState(false);
  // Spieltag-Filter: „Gesamt" (null) oder ein einzelner Spieltag. Alle Werte
  // der Seite (Kacheln, Team-Karten, Torschützen, Bestenlisten, Torhüter)
  // rechnen dann nur mit diesem Spieltag. Steckbrief & 1 gegen 1 bleiben
  // bewusst auf der ganzen Saison.
  const [matchday, setMatchday] = React.useState<number | null>(null);
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
        gamesInGoal: e.games,
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
    const shotRows = table((t) => {
      const all = t.goal + t.shot_on + t.shot_miss + t.shot_blocked_off;
      const on = t.goal + t.shot_on;
      return all > 0 ? { all, on, quote: q(on, all, SHOT_MIN) } : null;
    });
    const passRows = table((t) => {
      const all = t.pass_ok + t.pass_fail;
      return all > 0 ? { all, ok: t.pass_ok, quote: q(t.pass_ok, all, PASS_MIN) } : null;
    });
    const duelRows = table((t) => {
      const all = t.duel_won + t.duel_lost;
      return all > 0 ? { all, won: t.duel_won, quote: q(t.duel_won, all, DUEL_MIN) } : null;
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
      accent: string;
      icon: React.ReactNode;
      rows: StatTableRow[];
      cols: StatTableCol[];
      defaultSort: string;
      note: string;
    }[] = [
      {
        id: 'shots', title: 'Torschüsse', accent: '#F0559E', icon: <Target className="w-4 h-4" />, rows: shotRows, defaultSort: 'on',
        cols: [{ key: 'all', label: 'Gesamt' }, { key: 'on', label: 'Aufs Tor' }, { key: 'quote', label: 'Quote', fmt: pctFmt }],
        note: `Quote = Schüsse aufs Tor (inkl. Tore) ÷ alle Schüsse · ab ${SHOT_MIN} Schüssen`,
      },
      {
        id: 'pass', title: 'Pässe', accent: '#22DFC9', icon: <Send className="w-4 h-4" />, rows: passRows, defaultSort: 'quote',
        cols: [{ key: 'all', label: 'Gesamt' }, { key: 'ok', label: 'Ange\u00ADkommen' }, { key: 'quote', label: 'Quote', fmt: pctFmt }],
        note: `Quote = angekommene Pässe ÷ alle Pässe · ab ${PASS_MIN} Pässen`,
      },
      {
        id: 'duel', title: 'Zweikämpfe', accent: '#43E5A0', icon: <Swords className="w-4 h-4" />, rows: duelRows, defaultSort: 'quote',
        cols: [{ key: 'all', label: 'Gesamt' }, { key: 'won', label: 'Gewonnen' }, { key: 'quote', label: 'Quote', fmt: pctFmt }],
        note: `Quote = gewonnene ÷ alle Zweikämpfe · ab ${DUEL_MIN} Zweikämpfen`,
      },
      {
        id: 'drib', title: 'Beste Dribbler', accent: '#E9C46A', icon: <Zap className="w-4 h-4" />, rows: dribRows, defaultSort: 'value',
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
      { id: 'goals', title: 'Torschützen', accent: '#E9C46A', icon: <Crown className="w-4 h-4" />, mode: 'count' as const,
        rows: trackScorers(trackingRows, cfg).slice(0, 10).map((e) => toLeader(e, e.goals)) },
      { id: 'assists', title: 'Vorlagen', accent: '#22DFC9', icon: <Handshake className="w-4 h-4" />, mode: 'count' as const,
        rows: trackAssists(trackingRows, cfg).slice(0, 10).map((e) => toLeader(e, e.assists)) },
      { id: 'scorer', title: 'Scorerpunkte (Tore + Vorlagen)', accent: '#43E5A0', icon: <Target className="w-4 h-4" />, mode: 'count' as const,
        rows: [...scorePts.values()].sort((a, b) => b.value - a.value || a.playerName.localeCompare(b.playerName)).slice(0, 10) },
      { id: 'win', title: 'Balleroberer', accent: '#58F0CD', icon: <Shield className="w-4 h-4" />, mode: 'count' as const, rows: ballWinnerLeaders(trackingRows, cfg) },
      { id: 'key', title: 'Schlüsselpässe', accent: '#c99bff', icon: <Sparkles className="w-4 h-4" />, mode: 'count' as const, rows: keyPassLeaders(trackingRows, cfg) },
      { id: 'head', title: 'Kopfballtore', accent: '#F0559E', icon: <Goal className="w-4 h-4" />, mode: 'count' as const, rows: headerGoalLeaders(trackingRows, cfg) },
    ].filter((b) => b.rows.length > 0);
    return {
      lists,
      tables: tables.filter((t) => t.rows.length > 0),
    };
  }, [trackingRows, cfg]);

  const listItem = (b: (typeof boards.lists)[number]) => {
    const top = b.rows[0];
    return {
      id: b.id,
      title: b.title,
      accent: b.accent,
      icon: b.icon,
      preview: top ? `1. ${top.playerName} · ${top.value}` : undefined,
      content: <LeaderList rows={b.rows} mode={b.mode} accent={b.accent} teams={teams} onSelect={onSelectTeam} />,
    };
  };

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
    sub: string;
    avatar: React.ReactNode;
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
      avatar: <PlayerCrest player={topScorer} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />,
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
      avatar: <PlayerCrest player={topAssist} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />,
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
      avatar: <PlayerCrest player={bestRatio} teams={teams} photoSize="lg" crestSize="xl" onSelectTeam={onSelectTeam} />,
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
      sub: `${clubStats.bestAttack.goalsFor} erzielte Tore`,
      tied: clubStats.bestAttackTied,
      avatar: (
        <TeamCrest
          name={t.name}
          shortName={t.shortName}
          color={t.logoColor}
          logoUrl={t.logoUrl}
          size="lg"
          onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
        />
      ),
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
      sub: `Nur ${clubStats.bestDefense.goalsAgainst} Gegentore`,
      tied: clubStats.bestDefenseTied,
      avatar: (
        <TeamCrest
          name={t.name}
          shortName={t.shortName}
          color={t.logoColor}
          logoUrl={t.logoUrl}
          size="lg"
          onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
        />
      ),
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
      sub: `Zu null in ${clubStats.mostCleanSheets.cleanSheets} ${clubStats.mostCleanSheets.cleanSheets === 1 ? 'Spiel' : 'Spielen'}`,
      tied: clubStats.mostCleanSheetsTied,
      avatar: (
        <TeamCrest
          name={t.name}
          shortName={t.shortName}
          color={t.logoColor}
          logoUrl={t.logoUrl}
          size="lg"
          onSelect={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
        />
      ),
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
                className={`px-4 py-2 rounded-full text-xs font-sans font-bold uppercase tracking-wider border transition-colors cursor-pointer ${
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

      {/* Live-Tracking-Fortschritt („Das Team ist am Tracken · 40 %") */}
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
            <div className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1.5">{tile.label}</div>
          </div>
        ))}
      </div>

      {/* Aktionen: Steckbrief · 1 gegen 1 · Torhüter – gleich große Karten */}
      {(players.length > 0 || gloveRows.length > 0) && (
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {players.length > 0 && (
            <button
              onClick={() => setSteckbriefOpen(true)}
              className="group relative overflow-hidden flex items-center gap-3 rounded-2xl px-5 py-3.5 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] border border-hl-gold/30"
              style={{ background: 'linear-gradient(100deg, rgba(233,196,106,.16), rgba(34,223,201,.10))' }}
            >
              <span className="w-10 h-10 rounded-xl grid place-items-center bg-hl-gold/20 text-hl-gold shrink-0">
                <IdCard className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-6" />
              </span>
              <span className="min-w-0">
                <span className="block font-display font-black uppercase tracking-tight text-white text-lg leading-none">Mein Steckbrief</span>
                <span className="block text-[11px] font-sans font-semibold text-hl-mute mt-0.5 truncate">Deine Werte & Platzierungen · zum Teilen</span>
              </span>
            </button>
          )}
          {/* 1 gegen 1: Duell-Karte mit VS-Abzeichen */}
          {players.length >= 2 && (
            <button
              onClick={() => setCompareOpen(true)}
              className="group relative overflow-hidden flex items-center gap-3 rounded-2xl px-5 py-3.5 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] border border-brand-accent-light/35"
              style={{ background: 'linear-gradient(100deg, rgba(34,223,201,.18), rgba(230,35,142,.14))' }}
            >
              {/* Diagonaler Schnitt im Hintergrund – Duell-Look */}
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 w-1/2 opacity-60"
                style={{ background: 'linear-gradient(115deg, transparent 49.5%, rgba(255,255,255,.07) 50%, transparent 50.5%)' }}
              />
              <span className="relative w-10 h-10 rounded-xl grid place-items-center bg-brand-accent-light/20 text-brand-accent-light shrink-0">
                <Swords className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-12 group-hover:scale-110" />
              </span>
              <span className="relative min-w-0 flex-1">
                <span className="block font-display font-black uppercase tracking-tight text-white text-lg leading-none">1 gegen 1</span>
                <span className="block text-[11px] font-sans font-semibold text-hl-mute mt-0.5 truncate">Zwei Spieler direkt vergleichen</span>
              </span>
              <span className="relative shrink-0 font-display font-black italic text-[22px] leading-none tracking-tight bg-gradient-to-r from-brand-accent-light to-[#E6238E] bg-clip-text text-transparent transition-transform duration-300 group-hover:scale-110">
                VS
              </span>
            </button>
          )}
          {/* Eigene Rubrik für die Keeper */}
          {gloveRows.length > 0 && (
            <button
              onClick={() => setKeeperOpen(true)}
              className="group relative overflow-hidden flex items-center gap-3 rounded-2xl px-5 py-3.5 text-left cursor-pointer transition-all duration-200 hover:-translate-y-0.5 active:scale-[0.98] border border-hl-gold/25"
              style={{ background: 'linear-gradient(100deg, rgba(233,196,106,.12), rgba(255,255,255,.03))' }}
            >
              <span className="w-10 h-10 rounded-xl grid place-items-center bg-hl-gold/15 text-hl-gold shrink-0">
                <Hand className="w-5 h-5 transition-transform duration-300 group-hover:-rotate-12" />
              </span>
              <span className="min-w-0">
                <span className="block font-display font-black uppercase tracking-tight text-white text-lg leading-none">Torhüter</span>
                <span className="block text-[11px] font-sans font-semibold text-hl-mute mt-0.5 truncate">Paraden, Zu-null-Spiele & Bestenliste</span>
              </span>
            </button>
          )}
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
      <KeeperStats
        open={keeperOpen}
        onClose={() => setKeeperOpen(false)}
        rows={trackingRows}
        teams={teams}
        players={players}
        scoringConfig={scoringConfig}
        onSelectTeam={onSelectTeam}
      />

      {/* Leader-Cards */}
      {cards.length === 0 ? (
        <div className="hl-card text-center py-12 text-hl-mute font-sans text-sm mt-5">
          Noch keine Statistiken verfügbar. Sobald Spiele beendet sind, erscheinen hier die Bestwerte.
        </div>
      ) : (
        <Reveal className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-5">
          {cards.map((c) => (
            <div
              key={c.category}
              className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 p-6 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]"
            >
              <div className="absolute top-0 right-0 w-[180px] h-[180px] pointer-events-none" style={{ background: GLOW[c.accent] }} />
              <div className="relative">
                {/* Große, klare Überschrift der Auszeichnung (kein „SPIELER"-Label mehr). */}
                <div className={`font-display font-black text-xl sm:text-2xl uppercase tracking-tight leading-none ${VALUE_COLOR[c.accent]}`}>
                  {c.category}
                </div>
                {c.team && c.tied && c.tied.length > 0 ? (
                  /* Gleichstand: alle Teams gleichberechtigt nebeneinander */
                  <div className="mt-4">
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {[c.team, ...c.tied].map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={onSelectTeam ? () => onSelectTeam(t.id) : undefined}
                          className={`flex flex-col items-center gap-1.5 min-w-0 ${onSelectTeam ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}
                          title={t.name}
                        >
                          <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="lg" />
                          <span className="max-w-full font-display font-black text-[15px] leading-tight uppercase text-white text-center line-clamp-2">{t.name}</span>
                        </button>
                      ))}
                    </div>
                    <div className="font-sans text-[12.5px] text-hl-mute mt-2 text-center">{c.sub}</div>
                  </div>
                ) : (
                <div className="flex items-center gap-3.5 mt-4">
                  {c.avatar}
                  <div className="min-w-0">
                    {c.onClick ? (
                      <button
                        type="button"
                        onClick={c.onClick}
                        className="block max-w-full text-left font-display font-black text-[26px] leading-[.95] uppercase text-white truncate cursor-pointer hover:opacity-80 transition-opacity"
                        title={`${c.name} – ${c.kind === 'SPIELER' ? 'Spieler anzeigen' : 'Verein anzeigen'}`}
                      >
                        {c.name}
                      </button>
                    ) : (
                      <div className="font-display font-black text-[26px] leading-[.95] uppercase text-white truncate">{c.name}</div>
                    )}
                    <div className="font-sans text-[12.5px] text-hl-mute mt-1 truncate">{c.sub}</div>
                  </div>
                </div>
                )}
                <div className="flex items-baseline gap-2 mt-5">
                  <span className={`font-display font-black text-[52px] lg:text-[66px] leading-[.9] ${VALUE_COLOR[c.accent]}`}>
                    <CountUp value={c.value} decimals={c.decimals ?? 0} />
                  </span>
                  <span className="font-sans font-bold text-[13px] tracking-wider text-hl-dim">{c.unit}</span>
                </div>
              </div>
            </div>
          ))}
        </Reveal>
      )}

      {/* Auszeichnungen: Torschützenkönig + Goldener Handschuh nebeneinander */}
      {(scorerRanking.length > 0 || gloveRanking.length > 0) && (
        <Reveal className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {/* Torschützenkönig – Top 5 nach erzielten Toren */}
          {scorerRanking.length > 0 && (
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-2xl">⚽</span>
                <h3 className="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-white">
                  Torschützenkönig
                </h3>
                <span className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1">TOP 5 · SPIELER</span>
              </div>
              <div className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.gold }} />
                <div ref={scorer.ref} className="relative divide-y divide-white/[.06] hl-cascade-soft">
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
                        className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5"
                      >
                        <div className={`font-display font-black text-2xl sm:text-3xl lg:text-[40px] w-7 sm:w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <div className="shrink-0">
                          <PlayerCrest player={p} teams={teams} photoSize="md" crestSize="lg" onSelectTeam={onSelectTeam} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => goPlayer(p)}
                            title={teamOf(p) ? `${p.teamName} – Vereinsseite öffnen` : undefined}
                            className={`block max-w-full text-left font-sans font-bold text-sm sm:text-[15px] text-white truncate ${teamOf(p) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                          >
                            {p.name}
                          </button>
                          <div className="font-sans text-[11.5px] text-hl-dim truncate mt-0.5">{sub}</div>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 pl-2">
                          <span className="font-display font-black text-2xl sm:text-3xl lg:text-[40px] leading-none text-hl-gold tabular-nums">
                            <CountUp value={p.goals} />
                          </span>
                          <span className="font-sans font-bold text-[10px] tracking-wider text-hl-dim">TORE</span>
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
            <div>
              <div className="flex items-center gap-2.5 mb-4">
                <span className="text-2xl">🧤</span>
                <h3 className="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-white">
                  Goldener Handschuh
                </h3>
                <span className="font-sans font-bold text-[11px] tracking-[1.5px] text-hl-dim mt-1">TOP 5 · TORHÜTER</span>
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
                <div className="mb-3 rounded-xl border border-white/10 bg-white/[.03] px-4 py-3 text-[12px] text-hl-mute font-sans">
                  <div className="font-bold text-hl-soft mb-1">So entstehen die Punkte (PKT):</div>
                  <ul className="space-y-0.5">
                    {GOLDEN_GLOVE_EXPLAIN.map((l) => (
                      <li key={l}>• {l}</li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="relative rounded-[20px] overflow-hidden bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.012))] border border-white/10 backdrop-blur-lg shadow-[0_20px_50px_rgba(0,0,0,.35)]">
                <div className="absolute top-0 right-0 w-[220px] h-[220px] pointer-events-none" style={{ background: GLOW.teal }} />
                <div ref={glove.ref} className="relative divide-y divide-white/[.06] hl-cascade-soft">
                  {glove.items.map((p, idx) => {
                    const rankColor =
                      idx === 0 ? 'text-hl-gold' : idx === 1 ? 'text-[#C7D0DA]' : idx === 2 ? 'text-[#E0A46B]' : 'text-hl-dim';
                    const sub = [
                      `${p.gamesInGoal} im Tor`,
                      `${p.cleanSheets}× zu null`,
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
                        className="flex items-center gap-3.5 px-4 sm:px-6 py-3.5"
                      >
                        <div className={`font-display font-black text-2xl sm:text-3xl lg:text-[40px] w-7 sm:w-8 text-center shrink-0 ${rankColor}`}>
                          {idx + 1}
                        </div>
                        <div className="shrink-0">
                          <PlayerCrest player={p} teams={teams} photoSize="md" crestSize="lg" onSelectTeam={onSelectTeam} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <button
                            onClick={() => goPlayer(p)}
                            title={teamOf(p) ? `${p.teamName} – Vereinsseite öffnen` : undefined}
                            className={`block max-w-full text-left font-sans font-bold text-sm sm:text-[15px] text-white truncate ${teamOf(p) && onSelectTeam ? 'cursor-pointer hover:text-hl-gold transition-colors' : 'cursor-default'}`}
                          >
                            {p.name}
                          </button>
                          <div className="font-sans text-[11.5px] text-hl-dim truncate mt-0.5">{sub}</div>
                        </div>
                        <div className="flex items-baseline gap-1 shrink-0 pl-2">
                          <span className="font-display font-black text-2xl sm:text-3xl lg:text-[40px] leading-none text-brand-accent-light tabular-nums">
                            <CountUp value={p.score} decimals={1} />
                          </span>
                          <span className="font-sans font-bold text-[10px] tracking-wider text-hl-dim">PUNKTE</span>
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

      {/* Bestenlisten der Saison – aufklappbar, je Liste Platz 1 bis 10 */}
      {(boards.lists.length > 0 || boards.tables.length > 0) && (
        <Reveal className="mt-10">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-5 h-5 text-brand-accent-light" />
            <h2 className="font-display font-black text-xl sm:text-2xl uppercase tracking-tight text-white">
              {activeMd === null ? 'Bestenlisten der Saison' : `Bestenlisten · ${activeMd}. Spieltag`}
            </h2>
          </div>
          <StatAccordion
            items={[
              ...boards.lists.slice(0, 3).map((b) => listItem(b)),
              ...boards.tables.map((t) => {
                const top = sortStatRows(t.rows, t.defaultSort)[0];
                const col = t.cols.find((c) => c.key === t.defaultSort);
                const v = top?.values[t.defaultSort];
                return {
                  id: t.id,
                  title: t.title,
                  accent: t.accent,
                  icon: t.icon,
                  preview: top && v != null ? `1. ${top.playerName} · ${col?.fmt ? col.fmt(v) : v}` : undefined,
                  content: (
                    <StatTable rows={t.rows} cols={t.cols} defaultSort={t.defaultSort} accent={t.accent} teams={teams} note={t.note} onSelect={onSelectTeam} />
                  ),
                };
              }),
              ...boards.lists.slice(3).map((b) => listItem(b)),
            ]}
          />
        </Reveal>
      )}
    </div>
  );
}

// Top-10-Liste einer Bestenliste (Rang, Wappen, Name, Hauptwert, ggf. Quote).
function LeaderList({
  rows,
  mode,
  accent,
  teams,
  onSelect,
}: {
  rows: StatLeader[];
  mode: 'count' | 'quote';
  accent: string;
  teams: Team[];
  onSelect?: (teamId: string, playerName?: string) => void;
}) {
  return (
    <ol className="space-y-0.5 pt-1 min-w-0">
      {rows.map((p, i) => {
        const t = teams.find((x) => x.id === p.teamId);
        const pct = p.quote != null ? `${Math.round(p.quote * 100)}%` : null;
        return (
          <li key={`${p.teamId}::${p.playerName}`}>
            <button
              type="button"
              onClick={onSelect ? () => onSelect(p.teamId, p.playerName) : undefined}
              className="w-full flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-white/[.05] transition-colors cursor-pointer text-left min-w-0"
            >
              <span className="w-5 shrink-0 text-center font-display font-black tabular-nums text-xs" style={{ color: i === 0 ? accent : undefined }}>
                {i + 1}
              </span>
              {t && <TeamCrest name={t.name} shortName={t.shortName} color={t.logoColor} logoUrl={t.logoUrl} size="xs" />}
              <span className="flex-1 min-w-0 truncate font-sans font-semibold text-sm text-white">{p.playerName}</span>
              {mode === 'quote' ? (
                <>
                  <span className="shrink-0 font-mono text-[11px] text-hl-dim tabular-nums">{p.value}×</span>
                  <span className="shrink-0 w-10 text-right font-display font-black tabular-nums text-white text-sm">{pct ?? '–'}</span>
                </>
              ) : (
                <>
                  {pct && <span className="shrink-0 font-mono text-[11px] text-hl-dim tabular-nums">{pct}</span>}
                  <span className="shrink-0 min-w-7 text-right font-display font-black tabular-nums text-white text-sm">{p.value}</span>
                </>
              )}
            </button>
          </li>
        );
      })}
    </ol>
  );
}
